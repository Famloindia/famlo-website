begin;

insert into public.operational_notifications (
  recipient_role, recipient_user_id, booking_id, family_id, event_type,
  title, message, cta_url, dedupe_key, metadata, visible_after
)
select
  'host', h.user_id, b.id, h.legacy_family_id, 'booking_host_action_required',
  'New booking request', 'A paid booking is waiting for your decision.',
  '/partnerslogin/home/dashboard?family=' || h.legacy_family_id::text || '&tab=bookings',
  'host:booking_host_action_required:' || b.id::text,
  jsonb_build_object('source', 'staging_pending_backfill'), now()
from public.bookings_v2 b
join public.hosts h on h.id = b.host_id
join public.users u on u.id = h.user_id
where b.status = 'pending_host_approval'
  and b.payment_status = 'paid'
  and h.legacy_family_id is not null
on conflict (dedupe_key) do nothing;

insert into public.operational_notifications (
  recipient_role, booking_id, family_id, event_type, title, message,
  cta_url, dedupe_key, metadata, visible_after
)
select
  'admin', b.id, h.legacy_family_id, 'paid_booking_awaiting_host',
  'Paid booking awaiting host approval', 'A paid booking is waiting for the host decision.',
  '/admin/finance/bookings/' || b.id::text,
  'admin:paid_booking_awaiting_host:' || b.id::text,
  jsonb_build_object('source', 'staging_pending_backfill'), now()
from public.bookings_v2 b
join public.hosts h on h.id = b.host_id
where b.status = 'pending_host_approval' and b.payment_status = 'paid'
on conflict (dedupe_key) do nothing;

insert into public.operational_notifications (
  recipient_role, booking_id, family_id, event_type, title, message,
  cta_url, dedupe_key, metadata, visible_after
)
select
  'service', b.id, h.legacy_family_id, 'host_approval_sla',
  'Host approval SLA review', 'Check this paid booking because the host has not responded.',
  '/admin/finance/bookings/' || b.id::text,
  'service:host_approval_sla:' || b.id::text,
  jsonb_build_object('source', 'staging_pending_backfill'), now()
from public.bookings_v2 b
join public.hosts h on h.id = b.host_id
where b.status = 'pending_host_approval' and b.payment_status = 'paid'
on conflict (dedupe_key) do nothing;

commit;
