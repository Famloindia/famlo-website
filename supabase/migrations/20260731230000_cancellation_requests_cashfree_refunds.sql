begin;

create table if not exists public.cancellation_requests_v2 (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings_v2(id) on delete restrict,
  payment_id uuid references public.payments_v2(id) on delete restrict,
  guest_user_id uuid references auth.users(id) on delete restrict,
  host_id uuid references public.hosts(id) on delete set null,
  property_id uuid,
  requested_by text not null check (requested_by in ('guest','host','service_executive','admin','system')),
  request_reason text not null,
  guest_notes text,
  policy_code text not null default 'famlo_flexible_v1',
  policy_snapshot jsonb not null default '{}'::jsonb,
  gross_paid_amount_minor bigint not null check (gross_paid_amount_minor >= 0),
  suggested_refund_amount_minor bigint not null check (suggested_refund_amount_minor >= 0),
  approved_refund_amount_minor bigint check (approved_refund_amount_minor >= 0),
  retained_booking_value_minor bigint check (retained_booking_value_minor >= 0),
  famlo_commission_minor bigint check (famlo_commission_minor >= 0),
  host_gross_share_minor bigint check (host_gross_share_minor >= 0),
  status text not null default 'requested' check (status in (
    'requested','under_review','guest_contact_pending','guest_contacted',
    'host_contact_pending','host_contacted','recommended_approve','recommended_reject',
    'on_hold','approved','rejected','withdrawn','refund_pending','refund_processing',
    'refund_failed','completed'
  )),
  assigned_service_executive_id uuid references auth.users(id) on delete set null,
  service_executive_notes text,
  service_executive_recommendation text check (service_executive_recommendation is null or service_executive_recommendation in ('approve','reject')),
  contact_status text check (contact_status is null or contact_status in ('pending','guest_contacted','guest_unreachable','host_contacted','host_unreachable')),
  admin_actor_id text,
  admin_notes text,
  admin_override_reason text,
  settlement_hold_created_at timestamptz,
  requested_at timestamptz not null default now(),
  guest_contacted_at timestamptz,
  recommended_at timestamptz,
  approved_at timestamptz,
  rejected_at timestamptz,
  withdrawn_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cancellation_refund_not_above_gross check (
    suggested_refund_amount_minor <= gross_paid_amount_minor
    and (approved_refund_amount_minor is null or approved_refund_amount_minor <= gross_paid_amount_minor)
  )
);

create unique index if not exists cancellation_requests_one_active_per_booking_uidx
  on public.cancellation_requests_v2(booking_id)
  where status not in ('rejected','withdrawn','completed');
create index if not exists cancellation_requests_queue_idx
  on public.cancellation_requests_v2(status, requested_at);
create index if not exists cancellation_requests_payment_idx
  on public.cancellation_requests_v2(payment_id, created_at desc);

create table if not exists public.cancellation_request_events_v2 (
  id uuid primary key default gen_random_uuid(),
  cancellation_request_id uuid not null references public.cancellation_requests_v2(id) on delete restrict,
  booking_id uuid not null references public.bookings_v2(id) on delete restrict,
  refund_request_id uuid references public.refund_requests(id) on delete set null,
  actor_id text,
  actor_role text not null,
  action text not null,
  idempotency_key text not null,
  safe_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (idempotency_key)
);
create index if not exists cancellation_request_events_case_idx
  on public.cancellation_request_events_v2(cancellation_request_id, created_at);

create table if not exists public.booking_settlement_holds_v2 (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings_v2(id) on delete restrict,
  cancellation_request_id uuid references public.cancellation_requests_v2(id) on delete restrict,
  hold_type text not null default 'cancellation_under_review',
  reason text not null,
  is_active boolean not null default true,
  applied_at timestamptz not null default now(),
  released_at timestamptz,
  released_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists booking_settlement_holds_active_uidx
  on public.booking_settlement_holds_v2(booking_id, hold_type) where is_active;
create index if not exists booking_settlement_holds_case_idx
  on public.booking_settlement_holds_v2(cancellation_request_id, is_active);

create table if not exists public.host_approval_sla_incidents (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings_v2(id) on delete restrict,
  host_id uuid references public.hosts(id) on delete set null,
  requested_at timestamptz not null,
  reminder_due_at timestamptz not null,
  warning_due_at timestamptz not null,
  response_due_at timestamptz not null,
  reminder_sent_at timestamptz,
  warning_raised_at timestamptz,
  overdue_at timestamptz,
  response_status text not null default 'pending' check (response_status in ('pending','accepted','declined','unreachable','resolved')),
  response_recorded_at timestamptz,
  response_recorded_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (booking_id)
);
create index if not exists host_approval_sla_due_idx
  on public.host_approval_sla_incidents(response_status, response_due_at);

alter table public.bookings_v2
  add column if not exists host_approval_requested_at timestamptz,
  add column if not exists host_response_due_at timestamptz,
  add column if not exists host_response_status text,
  add column if not exists host_response_recorded_at timestamptz;

alter table public.refund_requests
  add column if not exists cancellation_request_id uuid references public.cancellation_requests_v2(id) on delete restrict,
  add column if not exists idempotency_key text,
  add column if not exists gross_paid_amount_minor bigint,
  add column if not exists refund_amount_minor bigint,
  add column if not exists previous_refunded_minor bigint not null default 0,
  add column if not exists remaining_refundable_minor bigint,
  add column if not exists initiated_by_actor text,
  add column if not exists initiated_by_role text,
  add column if not exists override_reason text,
  add column if not exists submitted_at timestamptz,
  add column if not exists successful_at timestamptz,
  add column if not exists failed_at timestamptz,
  add column if not exists retry_count integer not null default 0,
  add column if not exists last_error text,
  add column if not exists updated_at timestamptz not null default now();
create unique index if not exists refund_requests_idempotency_uidx
  on public.refund_requests(idempotency_key) where idempotency_key is not null;
create index if not exists refund_requests_cancellation_idx
  on public.refund_requests(cancellation_request_id, status);

alter table public.refund_attempts
  add column if not exists merchant_refund_id text,
  add column if not exists idempotency_key text,
  add column if not exists submitted_at timestamptz,
  add column if not exists last_error text,
  add column if not exists retry_count integer not null default 0,
  add column if not exists updated_at timestamptz not null default now();
create unique index if not exists refund_attempts_merchant_refund_uidx
  on public.refund_attempts(provider, merchant_refund_id) where merchant_refund_id is not null;
create unique index if not exists refund_attempts_idempotency_uidx
  on public.refund_attempts(refund_request_id, idempotency_key) where idempotency_key is not null;

create table if not exists public.host_financial_adjustments_v2 (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings_v2(id) on delete restrict,
  host_id uuid references public.hosts(id) on delete restrict,
  cancellation_request_id uuid references public.cancellation_requests_v2(id) on delete restrict,
  adjustment_amount_minor bigint not null,
  reason text not null,
  status text not null default 'recorded' check (status in ('recorded','available_for_offset','offset','waived')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.cancellation_requests_v2 enable row level security;
alter table public.cancellation_request_events_v2 enable row level security;
alter table public.booking_settlement_holds_v2 enable row level security;
alter table public.host_approval_sla_incidents enable row level security;
alter table public.host_financial_adjustments_v2 enable row level security;

revoke all on table public.cancellation_requests_v2 from anon, authenticated;
revoke all on table public.cancellation_request_events_v2 from anon, authenticated;
revoke all on table public.booking_settlement_holds_v2 from anon, authenticated;
revoke all on table public.host_approval_sla_incidents from anon, authenticated;
revoke all on table public.host_financial_adjustments_v2 from anon, authenticated;
grant select, insert, update, delete on table public.cancellation_requests_v2 to service_role;
grant select, insert, update, delete on table public.cancellation_request_events_v2 to service_role;
grant select, insert, update, delete on table public.booking_settlement_holds_v2 to service_role;
grant select, insert, update, delete on table public.host_approval_sla_incidents to service_role;
grant select, insert, update, delete on table public.host_financial_adjustments_v2 to service_role;

create or replace function public.request_booking_cancellation_v1(
  p_booking_id uuid,
  p_guest_user_id uuid,
  p_reason text,
  p_guest_notes text,
  p_policy_code text,
  p_policy_snapshot jsonb,
  p_gross_paid_minor bigint,
  p_suggested_refund_minor bigint,
  p_idempotency_key text
)
returns table(request_id uuid, request_status text, created boolean)
language plpgsql security definer set search_path = public
as $$
declare
  v_booking public.bookings_v2%rowtype;
  v_existing public.cancellation_requests_v2%rowtype;
  v_request_id uuid;
  v_payment_id uuid;
begin
  select * into v_booking from public.bookings_v2 where id = p_booking_id for update;
  if not found then raise exception 'BOOKING_NOT_FOUND'; end if;
  if v_booking.user_id is distinct from p_guest_user_id then raise exception 'BOOKING_OWNERSHIP_MISMATCH'; end if;
  if lower(coalesce(v_booking.status, '')) not in ('awaiting_payment','pending','pending_host_approval','accepted','confirmed') then
    raise exception 'BOOKING_NOT_CANCELLABLE';
  end if;
  if p_gross_paid_minor < 0 or p_suggested_refund_minor < 0 or p_suggested_refund_minor > p_gross_paid_minor then
    raise exception 'INVALID_REFUND_AMOUNT';
  end if;
  select * into v_existing from public.cancellation_requests_v2
    where booking_id = p_booking_id and status not in ('rejected','withdrawn','completed') limit 1;
  if found then
    return query select v_existing.id, v_existing.status, false;
    return;
  end if;
  v_payment_id := v_booking.payment_id;
  if v_payment_id is null then
    select id into v_payment_id from public.payments_v2
      where booking_id=p_booking_id order by created_at desc limit 1;
  end if;
  insert into public.cancellation_requests_v2(
    booking_id,payment_id,guest_user_id,host_id,requested_by,request_reason,guest_notes,
    policy_code,policy_snapshot,gross_paid_amount_minor,suggested_refund_amount_minor,
    status,settlement_hold_created_at
  ) values (
    p_booking_id,v_payment_id,p_guest_user_id,v_booking.host_id,'guest',p_reason,nullif(trim(p_guest_notes),''),
    p_policy_code,coalesce(p_policy_snapshot,'{}'::jsonb),p_gross_paid_minor,p_suggested_refund_minor,
    'requested',now()
  ) returning id into v_request_id;
  insert into public.booking_settlement_holds_v2(booking_id,cancellation_request_id,reason)
    values (p_booking_id,v_request_id,'cancellation_under_review') on conflict do nothing;
  insert into public.cancellation_request_events_v2(cancellation_request_id,booking_id,actor_id,actor_role,action,idempotency_key)
    values (v_request_id,p_booking_id,p_guest_user_id::text,'guest','guest_cancellation_requested',p_idempotency_key)
    on conflict (idempotency_key) do nothing;
  return query select v_request_id, 'requested'::text, true;
end;
$$;

create or replace function public.withdraw_booking_cancellation_v1(
  p_request_id uuid,
  p_guest_user_id uuid,
  p_idempotency_key text
)
returns table(request_id uuid, request_status text, changed boolean)
language plpgsql security definer set search_path = public
as $$
declare v_case public.cancellation_requests_v2%rowtype;
begin
  select * into v_case from public.cancellation_requests_v2 where id=p_request_id for update;
  if not found then raise exception 'CANCELLATION_REQUEST_NOT_FOUND'; end if;
  if v_case.guest_user_id is distinct from p_guest_user_id then raise exception 'CANCELLATION_REQUEST_OWNERSHIP_MISMATCH'; end if;
  if v_case.status = 'withdrawn' then return query select v_case.id,v_case.status,false; return; end if;
  if v_case.status not in ('requested','under_review','guest_contact_pending','guest_contacted','host_contact_pending','host_contacted','recommended_approve','recommended_reject','on_hold') then
    raise exception 'CANCELLATION_REQUEST_FINAL';
  end if;
  update public.cancellation_requests_v2 set status='withdrawn',withdrawn_at=now(),updated_at=now() where id=v_case.id;
  update public.booking_settlement_holds_v2 set is_active=false,released_at=now(),released_by=p_guest_user_id::text,updated_at=now()
    where cancellation_request_id=v_case.id and is_active;
  insert into public.cancellation_request_events_v2(cancellation_request_id,booking_id,actor_id,actor_role,action,idempotency_key)
    values(v_case.id,v_case.booking_id,p_guest_user_id::text,'guest','guest_cancellation_withdrawn',p_idempotency_key)
    on conflict(idempotency_key) do nothing;
  return query select v_case.id,'withdrawn'::text,true;
end;
$$;

create or replace function public.decide_booking_cancellation_v1(
  p_request_id uuid,
  p_decision text,
  p_approved_refund_minor bigint,
  p_admin_actor_id text,
  p_admin_notes text,
  p_override_reason text,
  p_idempotency_key text
)
returns table(request_id uuid, request_status text, booking_id uuid, refund_request_id uuid, changed boolean)
language plpgsql security definer set search_path = public
as $$
declare
  v_case public.cancellation_requests_v2%rowtype;
  v_booking public.bookings_v2%rowtype;
  v_refund_id uuid;
  v_refund_rupees integer;
  v_existing_refunded bigint;
  v_remaining bigint;
  v_retained bigint;
  v_commission bigint;
begin
  if p_decision not in ('approve','reject') then raise exception 'INVALID_DECISION'; end if;
  select * into v_case from public.cancellation_requests_v2 where id=p_request_id for update;
  if not found then raise exception 'CANCELLATION_REQUEST_NOT_FOUND'; end if;
  if v_case.status in ('approved','refund_pending','refund_processing','refund_failed','completed') and p_decision='approve' then
    select rr.id into v_refund_id from public.refund_requests rr where rr.cancellation_request_id=v_case.id order by rr.created_at limit 1;
    return query select v_case.id,v_case.status,v_case.booking_id,v_refund_id,false; return;
  end if;
  if v_case.status in ('rejected','withdrawn','completed') then raise exception 'CANCELLATION_REQUEST_FINAL'; end if;
  select * into v_booking from public.bookings_v2 where id=v_case.booking_id for update;
  if p_decision='reject' then
    update public.cancellation_requests_v2 set status='rejected',admin_actor_id=p_admin_actor_id,admin_notes=p_admin_notes,rejected_at=now(),updated_at=now() where id=v_case.id;
    update public.booking_settlement_holds_v2 set is_active=false,released_at=now(),released_by=p_admin_actor_id,updated_at=now()
      where cancellation_request_id=v_case.id and is_active;
    insert into public.cancellation_request_events_v2(cancellation_request_id,booking_id,actor_id,actor_role,action,idempotency_key)
      values(v_case.id,v_case.booking_id,p_admin_actor_id,'admin','admin_cancellation_rejected',p_idempotency_key)
      on conflict(idempotency_key) do nothing;
    return query select v_case.id,'rejected'::text,v_case.booking_id,null::uuid,true; return;
  end if;
  if lower(coalesce(v_booking.status,'')) not in ('awaiting_payment','pending','pending_host_approval','accepted','confirmed','rejected') then
    raise exception 'BOOKING_NOT_CANCELLABLE';
  end if;
  select coalesce(sum(coalesce(rr.refund_amount_minor,rr.refund_amount::bigint*100)),0) into v_existing_refunded
    from public.refund_requests rr
    where rr.payment_id=v_case.payment_id and rr.status not in ('rejected','cancelled','failed') and rr.cancellation_request_id is distinct from v_case.id;
  v_remaining := greatest(0,v_case.gross_paid_amount_minor-v_existing_refunded);
  if p_approved_refund_minor < 0 or p_approved_refund_minor > v_remaining then raise exception 'REFUND_EXCEEDS_REMAINING'; end if;
  if p_approved_refund_minor is distinct from v_case.suggested_refund_amount_minor and nullif(trim(p_override_reason),'') is null then
    raise exception 'OVERRIDE_REASON_REQUIRED';
  end if;
  v_retained := v_case.gross_paid_amount_minor-p_approved_refund_minor-v_existing_refunded;
  v_commission := (v_retained*1600+5000)/10000;
  v_refund_rupees := (p_approved_refund_minor/100)::integer;
  update public.cancellation_requests_v2 set
    status=case when p_approved_refund_minor>0 then 'refund_pending' else 'completed' end,
    approved_refund_amount_minor=p_approved_refund_minor,retained_booking_value_minor=v_retained,
    famlo_commission_minor=v_commission,host_gross_share_minor=v_retained-v_commission,
    admin_actor_id=p_admin_actor_id,admin_notes=p_admin_notes,admin_override_reason=nullif(trim(p_override_reason),''),
    approved_at=now(),completed_at=case when p_approved_refund_minor=0 then now() else null end,updated_at=now()
    where id=v_case.id;
  update public.bookings_v2 set status='cancelled',payment_status=case when p_approved_refund_minor>0 then 'refund_pending' else payment_status end,
    cancelled_at=now(),cancellation_reason=v_case.request_reason,hold_expires_at=null,updated_at=now() where id=v_case.booking_id;
  if v_booking.legacy_booking_id is not null then update public.bookings set status='cancelled',updated_at=now() where id=v_booking.legacy_booking_id; end if;
  if p_approved_refund_minor>0 then
    insert into public.refund_requests(
      booking_id,payment_id,reason,refund_amount,refund_base_amount,refund_gst_amount,status,requires_admin_approval,
      approved_by,approved_at,cancellation_request_id,idempotency_key,gross_paid_amount_minor,refund_amount_minor,
      previous_refunded_minor,remaining_refundable_minor,initiated_by_actor,initiated_by_role,override_reason,updated_at
    ) values (
      v_case.booking_id,v_case.payment_id,v_case.request_reason,v_refund_rupees,v_refund_rupees,0,'approved',true,
      null,now(),v_case.id,'cancellation-refund:'||v_case.id::text,v_case.gross_paid_amount_minor,p_approved_refund_minor,
      v_existing_refunded,v_remaining-p_approved_refund_minor,p_admin_actor_id,'admin',nullif(trim(p_override_reason),''),now()
    ) on conflict(idempotency_key) where idempotency_key is not null
      do update set updated_at=excluded.updated_at returning id into v_refund_id;
  end if;
  insert into public.booking_status_history_v2(booking_id,old_status,new_status,changed_by_user_id,reason,created_at)
    values(v_case.booking_id,v_booking.status,'cancelled',null,'admin_approved_cancellation',now());
  insert into public.cancellation_request_events_v2(cancellation_request_id,booking_id,refund_request_id,actor_id,actor_role,action,idempotency_key,safe_metadata)
    values(v_case.id,v_case.booking_id,v_refund_id,p_admin_actor_id,'admin','admin_cancellation_approved',p_idempotency_key,
      jsonb_build_object('refund_amount_minor',p_approved_refund_minor,'retained_value_minor',v_retained))
    on conflict(idempotency_key) do nothing;
  return query select v_case.id,case when p_approved_refund_minor>0 then 'refund_pending'::text else 'completed'::text end,v_case.booking_id,v_refund_id,true;
end;
$$;

revoke all on function public.request_booking_cancellation_v1(uuid,uuid,text,text,text,jsonb,bigint,bigint,text) from public, anon, authenticated;
revoke all on function public.withdraw_booking_cancellation_v1(uuid,uuid,text) from public, anon, authenticated;
revoke all on function public.decide_booking_cancellation_v1(uuid,text,bigint,text,text,text,text) from public, anon, authenticated;
grant execute on function public.request_booking_cancellation_v1(uuid,uuid,text,text,text,jsonb,bigint,bigint,text) to service_role;
grant execute on function public.withdraw_booking_cancellation_v1(uuid,uuid,text) to service_role;
grant execute on function public.decide_booking_cancellation_v1(uuid,text,bigint,text,text,text,text) to service_role;

create or replace function public.initialize_host_approval_sla_v1()
returns trigger language plpgsql security definer set search_path=public
as $$
declare v_started_at timestamptz; v_host_user_id uuid;
begin
  if new.status='pending_host_approval' and (old.status is distinct from new.status or new.host_approval_requested_at is null) then
    v_started_at := coalesce(new.host_approval_requested_at,new.updated_at,now());
    new.host_approval_requested_at := v_started_at;
    new.host_response_due_at := v_started_at + interval '12 hours';
    new.host_response_status := 'pending';
    insert into public.host_approval_sla_incidents(booking_id,host_id,requested_at,reminder_due_at,warning_due_at,response_due_at)
      values(new.id,new.host_id,v_started_at,v_started_at+interval '6 hours',v_started_at+interval '10 hours',v_started_at+interval '12 hours')
      on conflict(booking_id) do nothing;
  elsif old.status='pending_host_approval' and new.status is distinct from old.status then
    new.host_response_status := case when new.status in ('accepted','confirmed') then 'accepted' when new.status in ('rejected','cancelled') then 'declined' else new.host_response_status end;
    new.host_response_recorded_at := coalesce(new.host_response_recorded_at,now());
    update public.host_approval_sla_incidents set response_status=case when new.status in ('accepted','confirmed') then 'accepted' else 'declined' end,
      response_recorded_at=now(),updated_at=now() where booking_id=new.id and response_status='pending';
  end if;
  return new;
end;
$$;

drop trigger if exists bookings_v2_host_approval_sla_trigger on public.bookings_v2;
create trigger bookings_v2_host_approval_sla_trigger before update of status on public.bookings_v2
for each row execute function public.initialize_host_approval_sla_v1();

insert into public.host_approval_sla_incidents(booking_id,host_id,requested_at,reminder_due_at,warning_due_at,response_due_at)
select b.id,b.host_id,coalesce(b.host_approval_requested_at,b.updated_at,b.created_at),
  coalesce(b.host_approval_requested_at,b.updated_at,b.created_at)+interval '6 hours',
  coalesce(b.host_approval_requested_at,b.updated_at,b.created_at)+interval '10 hours',
  coalesce(b.host_approval_requested_at,b.updated_at,b.created_at)+interval '12 hours'
from public.bookings_v2 b where b.status='pending_host_approval'
on conflict(booking_id) do nothing;

update public.bookings_v2 b set
  host_approval_requested_at=i.requested_at,host_response_due_at=i.response_due_at,host_response_status='pending'
from public.host_approval_sla_incidents i
where i.booking_id=b.id and b.status='pending_host_approval' and b.host_approval_requested_at is null;

create or replace function public.process_host_approval_sla_v1()
returns table(reminders integer,warnings integer,overdue integer)
language plpgsql security definer set search_path=public
as $$
declare v_reminders integer:=0; v_warnings integer:=0; v_overdue integer:=0;
begin
  insert into public.notification_queue(event_type,channel,user_id,booking_id,dedupe_key,subject,payload,scheduled_for)
  select 'host_approval_6h_reminder','email',h.user_id,i.booking_id,'host_approval_6h:'||i.booking_id::text,
    'A Famlo booking is waiting for your response',jsonb_build_object('message','Please accept or decline the pending booking.'),now()
  from public.host_approval_sla_incidents i join public.hosts h on h.id=i.host_id
  join public.bookings_v2 b on b.id=i.booking_id
  where i.response_status='pending' and b.status='pending_host_approval' and i.reminder_due_at<=now() and i.reminder_sent_at is null
  on conflict(dedupe_key) where dedupe_key is not null do nothing;
  get diagnostics v_reminders=row_count;
  update public.host_approval_sla_incidents set reminder_sent_at=now(),updated_at=now()
    where response_status='pending' and reminder_due_at<=now() and reminder_sent_at is null;

  insert into public.notification_queue(event_type,channel,booking_id,dedupe_key,subject,payload,scheduled_for)
  select 'host_approval_10h_warning','email',i.booking_id,'host_approval_10h:'||i.booking_id::text,
    'Host response is nearing its SLA',jsonb_build_object('message','A paid booking still needs a host response. Service follow-up is required.'),now()
  from public.host_approval_sla_incidents i join public.bookings_v2 b on b.id=i.booking_id
  where i.response_status='pending' and b.status='pending_host_approval' and i.warning_due_at<=now() and i.warning_raised_at is null
  on conflict(dedupe_key) where dedupe_key is not null do nothing;
  get diagnostics v_warnings=row_count;
  update public.host_approval_sla_incidents set warning_raised_at=now(),updated_at=now()
    where response_status='pending' and warning_due_at<=now() and warning_raised_at is null;

  update public.host_approval_sla_incidents i set overdue_at=now(),updated_at=now()
  from public.bookings_v2 b where b.id=i.booking_id and i.response_status='pending' and b.status='pending_host_approval'
    and i.response_due_at<=now() and i.overdue_at is null;
  get diagnostics v_overdue=row_count;
  update public.bookings_v2 b set host_response_status='HOST_RESPONSE_OVERDUE',updated_at=now()
  from public.host_approval_sla_incidents i where i.booking_id=b.id and i.overdue_at is not null and i.response_status='pending' and b.status='pending_host_approval';
  insert into public.notification_queue(event_type,channel,booking_id,dedupe_key,subject,payload,scheduled_for)
  select 'host_approval_12h_overdue','email',i.booking_id,'host_approval_12h:'||i.booking_id::text,
    'Host response overdue: call required',jsonb_build_object('message','The 12-hour host response SLA has elapsed. Do not auto-cancel; contact the host.'),now()
  from public.host_approval_sla_incidents i where i.overdue_at is not null and i.response_status='pending'
  on conflict(dedupe_key) where dedupe_key is not null do nothing;
  return query select v_reminders,v_warnings,v_overdue;
end;
$$;
revoke all on function public.process_host_approval_sla_v1() from public,anon,authenticated;
grant execute on function public.process_host_approval_sla_v1() to service_role,postgres;

do $$
declare v_job bigint;
begin
  if exists(select 1 from pg_extension where extname='pg_cron') then
    for v_job in select jobid from cron.job where jobname='famlo-host-approval-sla' loop
      perform cron.unschedule(v_job);
    end loop;
    perform cron.schedule('famlo-host-approval-sla','*/15 * * * *','select public.process_host_approval_sla_v1();');
  end if;
end;
$$;

commit;
