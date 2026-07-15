create table if not exists public.channel_booking_revisions (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null,
  provider_code text not null,
  external_property_id text,
  external_booking_id text,
  external_revision_id text,
  external_room_type_id text,
  external_rate_plan_id text,
  ota_name text,
  status text,
  arrival_date date,
  departure_date date,
  guest_name text,
  amount numeric,
  currency text,
  payment_collect text,
  raw_payload jsonb not null default '{}'::jsonb,
  import_status text not null default 'preview',
  ack_status text not null default 'not_acknowledged',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists channel_booking_revisions_family_id_idx
  on public.channel_booking_revisions (family_id);

create index if not exists channel_booking_revisions_provider_code_idx
  on public.channel_booking_revisions (provider_code);

create index if not exists channel_booking_revisions_external_property_id_idx
  on public.channel_booking_revisions (external_property_id);

create unique index if not exists channel_booking_revisions_provider_revision_uidx
  on public.channel_booking_revisions (provider_code, external_revision_id)
  where external_revision_id is not null;

alter table public.channel_booking_revisions enable row level security;

revoke all on public.channel_booking_revisions from anon;
revoke all on public.channel_booking_revisions from authenticated;
