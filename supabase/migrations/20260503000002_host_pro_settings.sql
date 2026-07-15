create table if not exists public.host_pro_settings (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null,
  property_model text,
  property_type text,
  timezone text not null default 'Asia/Kolkata',
  currency text not null default 'INR',
  check_in_time text,
  check_out_time text,
  default_meal_plan text not null default 'room_only',
  standard_rate_plan_name text not null default 'Standard Rate',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint host_pro_settings_family_id_key unique (family_id),
  constraint host_pro_settings_property_model_check
    check (property_model in ('vacation_rental', 'hotel') or property_model is null),
  constraint host_pro_settings_property_type_check
    check (property_type in ('homestay', 'guest_house', 'farm_stay', 'villa', 'apartment', 'hotel_bnb') or property_type is null)
);

create index if not exists host_pro_settings_family_id_idx
  on public.host_pro_settings (family_id);

alter table public.host_pro_settings enable row level security;

revoke all on public.host_pro_settings from anon;
revoke all on public.host_pro_settings from authenticated;
