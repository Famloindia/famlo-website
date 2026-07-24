begin;

-- Staging records the canonical refund migration as applied, but these two
-- tables are absent. Recreate only the refund primitives used by this flow.
create table if not exists public.refund_requests (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings_v2(id) on delete cascade,
  payment_id uuid references public.payments_v2(id) on delete set null,
  reason text,
  refund_amount integer not null default 0,
  refund_base_amount integer not null default 0,
  refund_gst_amount integer not null default 0,
  status text not null default 'requested',
  requires_admin_approval boolean not null default true,
  approved_by uuid references public.users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists refund_requests_booking_idx
  on public.refund_requests(booking_id, status, created_at desc);

create index if not exists refund_requests_payment_idx
  on public.refund_requests(payment_id);

create table if not exists public.refund_attempts (
  id uuid primary key default gen_random_uuid(),
  refund_request_id uuid not null references public.refund_requests(id) on delete cascade,
  provider text not null,
  provider_refund_id text,
  amount integer not null default 0,
  status text not null default 'pending',
  raw_response jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists refund_attempts_request_idx
  on public.refund_attempts(refund_request_id, created_at desc);

create unique index if not exists refund_attempts_provider_refund_uidx
  on public.refund_attempts(provider, provider_refund_id)
  where provider_refund_id is not null;

create table if not exists public.host_booking_decisions (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings_v2(id) on delete cascade,
  host_id uuid not null references public.hosts(id) on delete restrict,
  family_id uuid references public.families(id) on delete set null,
  decision text not null,
  source text not null,
  actor_user_id uuid references public.users(id) on delete set null,
  actor_role text not null default 'host',
  idempotency_key text not null,
  status text not null default 'processing',
  previous_booking_status text,
  final_booking_status text not null,
  refund_request_id uuid references public.refund_requests(id) on delete set null,
  attempts integer not null default 1,
  lease_expires_at timestamptz,
  completed_at timestamptz,
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint host_booking_decisions_booking_uidx unique (booking_id),
  constraint host_booking_decisions_idempotency_uidx unique (idempotency_key),
  constraint host_booking_decisions_decision_check check (decision in ('approve', 'decline')),
  constraint host_booking_decisions_source_check check (source in ('dashboard', 'signed_link', 'whatsapp')),
  constraint host_booking_decisions_status_check check (status in ('processing', 'completed', 'failed')),
  constraint host_booking_decisions_final_status_check check (final_booking_status in ('confirmed', 'rejected'))
);

create index if not exists host_booking_decisions_status_lease_idx
  on public.host_booking_decisions(status, lease_expires_at, updated_at);

alter table public.host_booking_decisions enable row level security;
revoke all on public.host_booking_decisions from anon, authenticated;
grant all on public.host_booking_decisions to service_role;

alter table public.booking_whatsapp_actions
  add column if not exists attempts integer not null default 0,
  add column if not exists processing_started_at timestamptz,
  add column if not exists lease_expires_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists last_error text,
  add column if not exists final_outcome jsonb not null default '{}'::jsonb;

alter table public.booking_whatsapp_actions
  drop constraint if exists booking_whatsapp_actions_status_check;

alter table public.booking_whatsapp_actions
  add constraint booking_whatsapp_actions_status_check
  check (status in ('pending', 'processing', 'approved', 'rejected', 'expired', 'ignored'));

create index if not exists booking_whatsapp_actions_processing_lease_idx
  on public.booking_whatsapp_actions(status, lease_expires_at);

alter table public.booking_action_jobs
  add column if not exists attempts integer not null default 0,
  add column if not exists claimed_at timestamptz,
  add column if not exists lease_expires_at timestamptz;

alter table public.booking_action_jobs
  drop constraint if exists booking_action_jobs_status_check;

alter table public.booking_action_jobs
  add constraint booking_action_jobs_status_check
  check (status in ('pending', 'processing', 'processed', 'failed', 'ignored'));

create index if not exists booking_action_jobs_processing_lease_idx
  on public.booking_action_jobs(status, lease_expires_at, created_at);

with ranked_tokens as (
  select id,
         row_number() over (partition by booking_id, action order by created_at desc, id desc) as row_number
  from public.whatsapp_action_tokens
  where used_at is null
)
update public.whatsapp_action_tokens token
set used_at = now()
from ranked_tokens ranked
where token.id = ranked.id
  and ranked.row_number > 1;

create unique index if not exists whatsapp_action_tokens_one_open_action_uidx
  on public.whatsapp_action_tokens(booking_id, action)
  where used_at is null;

create or replace function public.claim_host_booking_decision(
  p_booking_id uuid,
  p_host_id uuid,
  p_family_id uuid,
  p_decision text,
  p_source text,
  p_actor_user_id uuid,
  p_actor_role text,
  p_idempotency_key text
)
returns table (
  outcome text,
  decision_id uuid,
  previous_status text,
  booking_status text,
  refund_request_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings_v2%rowtype;
  v_decision public.host_booking_decisions%rowtype;
  v_family_id uuid;
  v_final_status text;
  v_now timestamptz := now();
begin
  if p_decision not in ('approve', 'decline') then
    raise exception 'Unsupported host booking decision';
  end if;
  if p_source not in ('dashboard', 'signed_link', 'whatsapp') then
    raise exception 'Unsupported host booking decision source';
  end if;

  select * into v_booking
  from public.bookings_v2
  where id = p_booking_id
  for update;

  if not found then
    return query select 'not_found'::text, null::uuid, null::text, null::text, null::uuid;
    return;
  end if;

  if v_booking.host_id is distinct from p_host_id then
    return query select 'host_mismatch'::text, null::uuid, v_booking.status, v_booking.status, null::uuid;
    return;
  end if;

  select legacy_family_id into v_family_id
  from public.hosts
  where id = v_booking.host_id;

  if p_family_id is not null and v_family_id is distinct from p_family_id then
    return query select 'family_mismatch'::text, null::uuid, v_booking.status, v_booking.status, null::uuid;
    return;
  end if;

  v_final_status := case when p_decision = 'approve' then 'confirmed' else 'rejected' end;

  select * into v_decision
  from public.host_booking_decisions
  where booking_id = p_booking_id
  for update;

  if found then
    if v_decision.decision <> p_decision then
      return query select 'conflict'::text, v_decision.id, v_decision.previous_booking_status, v_booking.status, v_decision.refund_request_id;
      return;
    end if;

    if v_decision.status = 'completed' then
      return query select 'already_processed'::text, v_decision.id, v_decision.previous_booking_status, v_booking.status, v_decision.refund_request_id;
      return;
    end if;

    if v_decision.status = 'processing' and v_decision.lease_expires_at is not null and v_decision.lease_expires_at > v_now then
      return query select 'in_progress'::text, v_decision.id, v_decision.previous_booking_status, v_booking.status, v_decision.refund_request_id;
      return;
    end if;

    update public.host_booking_decisions
    set status = 'processing',
        source = p_source,
        actor_user_id = coalesce(p_actor_user_id, actor_user_id),
        actor_role = p_actor_role,
        attempts = attempts + 1,
        lease_expires_at = v_now + interval '5 minutes',
        last_error = null,
        updated_at = v_now
    where id = v_decision.id
    returning * into v_decision;

    return query select 'claimed_recovery'::text, v_decision.id, v_decision.previous_booking_status, v_booking.status, v_decision.refund_request_id;
    return;
  end if;

  if v_booking.status = 'pending_host_approval' then
    insert into public.host_booking_decisions (
      booking_id, host_id, family_id, decision, source, actor_user_id, actor_role,
      idempotency_key, status, previous_booking_status, final_booking_status,
      lease_expires_at
    ) values (
      p_booking_id, p_host_id, coalesce(p_family_id, v_family_id), p_decision, p_source,
      p_actor_user_id, p_actor_role, p_idempotency_key, 'processing', v_booking.status,
      v_final_status, v_now + interval '5 minutes'
    )
    returning * into v_decision;

    update public.bookings_v2
    set status = v_final_status,
        payment_status = case
          when p_decision = 'decline' and payment_status in ('paid', 'captured') then 'refund_pending'
          else payment_status
        end,
        cancelled_at = case when p_decision = 'decline' then v_now else cancelled_at end,
        cancellation_reason = case when p_decision = 'decline' then 'host_declined' else cancellation_reason end,
        hold_expires_at = null,
        updated_at = v_now
    where id = p_booking_id;

    return query select 'claimed'::text, v_decision.id, v_decision.previous_booking_status, v_final_status, null::uuid;
    return;
  end if;

  if (p_decision = 'approve' and v_booking.status in ('accepted', 'confirmed'))
     or (p_decision = 'decline' and v_booking.status in ('rejected', 'cancelled', 'cancelled_by_partner')) then
    insert into public.host_booking_decisions (
      booking_id, host_id, family_id, decision, source, actor_user_id, actor_role,
      idempotency_key, status, previous_booking_status, final_booking_status,
      lease_expires_at, metadata
    ) values (
      p_booking_id, p_host_id, coalesce(p_family_id, v_family_id), p_decision, p_source,
      p_actor_user_id, p_actor_role, p_idempotency_key, 'processing', v_booking.status,
      v_final_status, v_now + interval '5 minutes', '{"recovery":true}'::jsonb
    )
    returning * into v_decision;

    return query select 'claimed_recovery'::text, v_decision.id, v_decision.previous_booking_status, v_booking.status, null::uuid;
    return;
  end if;

  if (p_decision = 'approve' and v_booking.status in ('rejected', 'cancelled', 'cancelled_by_partner'))
     or (p_decision = 'decline' and v_booking.status in ('accepted', 'confirmed')) then
    return query select 'conflict'::text, null::uuid, v_booking.status, v_booking.status, null::uuid;
    return;
  end if;

  return query select 'invalid_state'::text, null::uuid, v_booking.status, v_booking.status, null::uuid;
end;
$$;

revoke all on function public.claim_host_booking_decision(uuid, uuid, uuid, text, text, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.claim_host_booking_decision(uuid, uuid, uuid, text, text, uuid, text, text)
  to service_role;

notify pgrst, 'reload schema';

commit;
