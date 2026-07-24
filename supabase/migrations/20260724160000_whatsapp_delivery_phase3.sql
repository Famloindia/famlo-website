begin;

alter table public.notification_queue
  add column if not exists processing_started_at timestamptz,
  add column if not exists lease_expires_at timestamptz,
  add column if not exists next_attempt_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists last_error text,
  add column if not exists provider_status text,
  add column if not exists provider_status_at timestamptz,
  add column if not exists provider_error_code text,
  add column if not exists provider_error_category text,
  add column if not exists provider_event_id text;

update public.notification_queue
set next_attempt_at = coalesce(next_attempt_at, scheduled_for, created_at)
where next_attempt_at is null;

alter table public.notification_queue
  alter column next_attempt_at set default now();

do $$
declare
  constraint_row record;
begin
  for constraint_row in
    select conname
    from pg_constraint
    where conrelid = 'public.notification_queue'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%status%'
  loop
    execute format('alter table public.notification_queue drop constraint %I', constraint_row.conname);
  end loop;
end
$$;

alter table public.notification_queue
  add constraint notification_queue_status_check
  check (status in ('pending', 'processing', 'retry_scheduled', 'processed', 'failed', 'skipped'));

alter table public.notification_queue
  add constraint notification_queue_provider_status_check
  check (provider_status is null or provider_status in ('submitted', 'sent', 'delivered', 'read', 'failed'));

create index if not exists notification_queue_due_claim_idx
  on public.notification_queue(status, next_attempt_at, scheduled_for, lease_expires_at)
  where status in ('pending', 'retry_scheduled', 'processing');

create unique index if not exists notification_queue_provider_message_uidx
  on public.notification_queue(provider_message_id)
  where provider_message_id is not null;

create table if not exists public.whatsapp_webhook_events (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique,
  event_type text not null,
  provider_message_id text,
  payload_digest text not null,
  processing_status text not null default 'recorded',
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint whatsapp_webhook_events_type_check
    check (event_type in ('interactive', 'status', 'unsupported')),
  constraint whatsapp_webhook_events_status_check
    check (processing_status in ('recorded', 'processed', 'ignored', 'failed'))
);

create index if not exists whatsapp_webhook_events_message_idx
  on public.whatsapp_webhook_events(provider_message_id, created_at desc)
  where provider_message_id is not null;

alter table public.whatsapp_webhook_events enable row level security;
revoke all on table public.whatsapp_webhook_events from anon, authenticated;
grant select, insert, update on table public.whatsapp_webhook_events to service_role;

alter table public.host_whatsapp_audit_log
  drop constraint if exists host_whatsapp_audit_action_check;
alter table public.host_whatsapp_audit_log
  add constraint host_whatsapp_audit_action_check
  check (action in (
    'settings_seeded',
    'otp_requested',
    'otp_failed',
    'otp_verified',
    'phone_changed',
    'consent_granted',
    'alerts_enabled',
    'alerts_disabled',
    'test_message_blocked',
    'test_message_queued'
  ));

create or replace function public.claim_notification_queue_batch(
  p_batch_size integer default 25,
  p_lease_seconds integer default 120
)
returns setof public.notification_queue
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
begin
  return query
  with candidates as (
    select queue.id
    from public.notification_queue queue
    where (
      (
        queue.status in ('pending', 'retry_scheduled')
        and coalesce(queue.next_attempt_at, queue.scheduled_for, queue.created_at) <= v_now
        and queue.scheduled_for <= v_now
      )
      or (
        queue.status = 'processing'
        and queue.lease_expires_at is not null
        and queue.lease_expires_at <= v_now
      )
    )
    order by coalesce(queue.next_attempt_at, queue.scheduled_for, queue.created_at), queue.created_at
    for update skip locked
    limit greatest(1, least(coalesce(p_batch_size, 25), 100))
  )
  update public.notification_queue queue
  set status = 'processing',
      attempts = coalesce(queue.attempts, 0) + 1,
      processing_started_at = v_now,
      lease_expires_at = v_now + make_interval(secs => greatest(30, least(coalesce(p_lease_seconds, 120), 900))),
      last_error = null
  from candidates
  where queue.id = candidates.id
  returning queue.*;
end;
$$;

revoke all on function public.claim_notification_queue_batch(integer, integer) from public, anon, authenticated;
grant execute on function public.claim_notification_queue_batch(integer, integer) to service_role;

commit;
