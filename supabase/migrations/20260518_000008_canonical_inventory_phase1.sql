begin;

alter table public.stay_units_v2
  add column if not exists inventory_mode text not null default 'physical_unit',
  add column if not exists inventory_allotment integer not null default 1;

alter table public.stay_units_v2
  drop constraint if exists stay_units_v2_inventory_mode_check;

alter table public.stay_units_v2
  add constraint stay_units_v2_inventory_mode_check
  check (inventory_mode in ('physical_unit', 'room_type_bucket'));

alter table public.stay_units_v2
  drop constraint if exists stay_units_v2_inventory_allotment_check;

alter table public.stay_units_v2
  add constraint stay_units_v2_inventory_allotment_check
  check (inventory_allotment >= 1);

create table if not exists public.inventory_event_log (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null,
  stay_unit_id uuid not null references public.stay_units_v2(id) on delete cascade,
  event_type text not null,
  event_source text not null default 'famlo',
  source_reference text,
  effective_date_start date not null,
  effective_date_end date not null,
  slot_key text,
  payload jsonb not null default '{}'::jsonb,
  actor_user_id uuid references public.users(id) on delete set null,
  actor_role text,
  created_at timestamptz not null default now(),
  constraint inventory_event_log_event_type_check check (
    event_type in (
      'manual_block_set',
      'manual_block_removed',
      'manual_rate_set',
      'manual_rate_removed',
      'booking_hold_created',
      'booking_hold_released',
      'booking_confirmed',
      'booking_cancelled',
      'booking_modified',
      'restriction_updated',
      'ota_sync_applied',
      'legacy_manual_block_imported'
    )
  ),
  constraint inventory_event_log_date_order_check check (effective_date_end >= effective_date_start)
);

create index if not exists inventory_event_log_family_date_idx
  on public.inventory_event_log (family_id, effective_date_start, effective_date_end);

create index if not exists inventory_event_log_stay_unit_date_idx
  on public.inventory_event_log (stay_unit_id, effective_date_start, effective_date_end);

create index if not exists inventory_event_log_source_reference_idx
  on public.inventory_event_log (event_source, source_reference)
  where source_reference is not null;

create table if not exists public.inventory_rule_sets (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null,
  stay_unit_id uuid references public.stay_units_v2(id) on delete cascade,
  timezone text not null default 'Asia/Kolkata',
  currency text not null default 'INR',
  booking_window_days integer not null default 365,
  lead_time_hours integer not null default 0,
  min_stay_days integer not null default 1,
  max_stay_days integer not null default 30,
  cta_default boolean not null default false,
  ctd_default boolean not null default false,
  stop_sell_default boolean not null default false,
  base_allotment integer not null default 1,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inventory_rule_sets_base_allotment_check check (base_allotment >= 1),
  constraint inventory_rule_sets_stay_window_check check (min_stay_days >= 1 and max_stay_days >= min_stay_days)
);

create unique index if not exists inventory_rule_sets_family_property_uidx
  on public.inventory_rule_sets (family_id)
  where stay_unit_id is null;

create unique index if not exists inventory_rule_sets_family_stay_unit_uidx
  on public.inventory_rule_sets (family_id, stay_unit_id)
  where stay_unit_id is not null;

create table if not exists public.inventory_day_projection (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null,
  stay_unit_id uuid not null references public.stay_units_v2(id) on delete cascade,
  date date not null,
  timezone text not null default 'Asia/Kolkata',
  currency text not null default 'INR',
  base_rate integer not null default 0,
  effective_rate integer not null default 0,
  rate_source text not null default 'stay_units_v2',
  is_blocked boolean not null default false,
  block_reason text,
  is_sellable boolean not null default true,
  available_units integer not null default 1,
  allotment_limit integer not null default 1,
  confirmed_units integer not null default 0,
  hold_units integer not null default 0,
  cta boolean not null default false,
  ctd boolean not null default false,
  min_stay integer not null default 1,
  max_stay integer not null default 30,
  stop_sell boolean not null default false,
  manual_block_present boolean not null default false,
  last_event_id uuid references public.inventory_event_log(id) on delete set null,
  projection_version integer not null default 1,
  last_projected_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inventory_day_projection_units_check check (
    available_units >= 0 and allotment_limit >= 1 and confirmed_units >= 0 and hold_units >= 0
  ),
  constraint inventory_day_projection_stay_window_check check (min_stay >= 1 and max_stay >= min_stay),
  unique (family_id, stay_unit_id, date)
);

create index if not exists inventory_day_projection_lookup_idx
  on public.inventory_day_projection (stay_unit_id, date);

create index if not exists inventory_day_projection_family_date_idx
  on public.inventory_day_projection (family_id, date);

create table if not exists public.inventory_projection_runs (
  id uuid primary key default gen_random_uuid(),
  scope_type text not null,
  scope_id uuid,
  family_id uuid,
  stay_unit_id uuid,
  date_from date,
  date_to date,
  status text not null default 'running',
  rows_written integer not null default 0,
  error_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  payload jsonb not null default '{}'::jsonb,
  constraint inventory_projection_runs_status_check check (status in ('running', 'success', 'failed', 'partial'))
);

create table if not exists public.inventory_parity_checks (
  id uuid primary key default gen_random_uuid(),
  family_id uuid,
  stay_unit_id uuid,
  date date,
  check_type text not null,
  legacy_value jsonb not null default '{}'::jsonb,
  canonical_value jsonb not null default '{}'::jsonb,
  severity text not null default 'info',
  detected_at timestamptz not null default now(),
  context jsonb not null default '{}'::jsonb,
  constraint inventory_parity_checks_severity_check check (severity in ('info', 'warning', 'critical'))
);

create index if not exists inventory_parity_checks_lookup_idx
  on public.inventory_parity_checks (family_id, stay_unit_id, detected_at desc);

alter table public.inventory_event_log enable row level security;
alter table public.inventory_rule_sets enable row level security;
alter table public.inventory_day_projection enable row level security;
alter table public.inventory_projection_runs enable row level security;
alter table public.inventory_parity_checks enable row level security;

revoke all on public.inventory_event_log from anon, authenticated;
revoke all on public.inventory_rule_sets from anon, authenticated;
revoke all on public.inventory_day_projection from anon, authenticated;
revoke all on public.inventory_projection_runs from anon, authenticated;
revoke all on public.inventory_parity_checks from anon, authenticated;

commit;
