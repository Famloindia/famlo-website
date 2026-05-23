create table if not exists public.channel_providers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  status text not null default 'available',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.channel_properties (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null,
  provider_code text not null,
  external_property_id text,
  property_model text,
  property_type text,
  sync_status text not null default 'not_connected',
  last_synced_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.channel_room_mappings (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null,
  stay_unit_id uuid not null,
  provider_code text not null,
  external_property_id text,
  external_room_type_id text,
  count_of_rooms integer not null default 1,
  sync_status text not null default 'not_mapped',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.channel_rate_plans (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null,
  stay_unit_id uuid,
  provider_code text not null,
  external_rate_plan_id text,
  title text not null default 'Standard Rate',
  meal_plan text not null default 'room_only',
  sync_status text not null default 'not_mapped',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.channel_sync_logs (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null,
  provider_code text not null,
  action text not null,
  status text not null,
  message text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists channel_properties_family_id_idx
  on public.channel_properties (family_id);

create index if not exists channel_properties_provider_code_idx
  on public.channel_properties (provider_code);

create index if not exists channel_room_mappings_family_id_idx
  on public.channel_room_mappings (family_id);

create index if not exists channel_room_mappings_stay_unit_id_idx
  on public.channel_room_mappings (stay_unit_id);

create index if not exists channel_room_mappings_provider_code_idx
  on public.channel_room_mappings (provider_code);

create index if not exists channel_rate_plans_family_id_idx
  on public.channel_rate_plans (family_id);

create index if not exists channel_rate_plans_stay_unit_id_idx
  on public.channel_rate_plans (stay_unit_id);

create index if not exists channel_rate_plans_provider_code_idx
  on public.channel_rate_plans (provider_code);

create index if not exists channel_sync_logs_family_id_idx
  on public.channel_sync_logs (family_id);

create index if not exists channel_sync_logs_provider_code_idx
  on public.channel_sync_logs (provider_code);

create unique index if not exists channel_properties_family_provider_uidx
  on public.channel_properties (family_id, provider_code);

create unique index if not exists channel_room_mappings_family_room_provider_uidx
  on public.channel_room_mappings (family_id, stay_unit_id, provider_code);

create unique index if not exists channel_rate_plans_family_room_provider_title_uidx
  on public.channel_rate_plans (family_id, stay_unit_id, provider_code, title);

alter table public.channel_providers enable row level security;
alter table public.channel_properties enable row level security;
alter table public.channel_room_mappings enable row level security;
alter table public.channel_rate_plans enable row level security;
alter table public.channel_sync_logs enable row level security;

revoke all on public.channel_providers from anon;
revoke all on public.channel_properties from anon;
revoke all on public.channel_room_mappings from anon;
revoke all on public.channel_rate_plans from anon;
revoke all on public.channel_sync_logs from anon;

revoke all on public.channel_providers from authenticated;
revoke all on public.channel_properties from authenticated;
revoke all on public.channel_room_mappings from authenticated;
revoke all on public.channel_rate_plans from authenticated;
revoke all on public.channel_sync_logs from authenticated;

insert into public.channel_providers (code, name, status, metadata)
values ('channex', 'Channex', 'available', '{"environment":"staging_planned"}'::jsonb)
on conflict (code) do update
set
  name = excluded.name,
  status = excluded.status,
  metadata = public.channel_providers.metadata || excluded.metadata;
