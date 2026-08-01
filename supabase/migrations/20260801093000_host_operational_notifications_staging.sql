begin;

create table if not exists public.operational_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_role text not null,
  recipient_user_id uuid references public.users(id) on delete set null,
  booking_id uuid references public.bookings_v2(id) on delete cascade,
  family_id uuid references public.families(id) on delete set null,
  event_type text not null,
  title text not null,
  message text not null,
  cta_url text,
  dedupe_key text not null,
  metadata jsonb not null default '{}'::jsonb,
  visible_after timestamptz not null default now(),
  read_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  constraint operational_notifications_recipient_role_check
    check (recipient_role in ('host', 'admin', 'service')),
  constraint operational_notifications_dedupe_key_key unique (dedupe_key)
);

create index if not exists operational_notifications_host_unread_idx
  on public.operational_notifications(recipient_user_id, family_id, created_at desc)
  where recipient_role = 'host' and read_at is null;
create index if not exists operational_notifications_ops_unread_idx
  on public.operational_notifications(recipient_role, created_at desc)
  where recipient_role in ('admin', 'service') and read_at is null;
create index if not exists operational_notifications_booking_idx
  on public.operational_notifications(booking_id, created_at desc);

alter table public.operational_notifications enable row level security;
revoke all on public.operational_notifications from anon, authenticated;
grant select, insert, update, delete on public.operational_notifications to service_role;

comment on table public.operational_notifications is
  'Server-only, deduplicated host and Famlo operations notifications. Browser access is mediated by scoped API routes.';

notify pgrst, 'reload schema';
commit;
