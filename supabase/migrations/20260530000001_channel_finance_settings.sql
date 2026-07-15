create table if not exists public.channel_finance_settings (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  gst_enabled boolean not null default false,
  gstin text,
  legal_business_name text,
  trade_name text,
  state text,
  state_code text,
  accommodation_gst_applicable boolean not null default false,
  default_accommodation_gst_percent numeric(7, 2) not null default 0,
  platform_fee_gst_percent numeric(7, 2) not null default 18,
  services_extras_gst_percent numeric(7, 2) not null default 0,
  tax_pricing_mode text not null default 'exclusive',
  invoice_prefix text not null default 'INV',
  receipt_prefix text not null default 'FMR',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint channel_finance_settings_family_id_key unique (family_id),
  constraint channel_finance_settings_tax_pricing_mode_check
    check (tax_pricing_mode in ('inclusive', 'exclusive')),
  constraint channel_finance_settings_gst_rates_non_negative_check
    check (
      default_accommodation_gst_percent >= 0
      and platform_fee_gst_percent >= 0
      and services_extras_gst_percent >= 0
    )
);

create table if not exists public.channel_commission_rules (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  channel_key text not null,
  channel_name text not null,
  commission_type text not null default 'percentage',
  commission_value numeric(12, 2) not null default 0,
  tax_on_commission boolean not null default false,
  gst_percent numeric(7, 2) not null default 18,
  tax_mode text not null default 'exclusive',
  effective_from date,
  notes text,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint channel_commission_rules_family_channel_key unique (family_id, channel_key),
  constraint channel_commission_rules_commission_type_check
    check (commission_type in ('percentage', 'flat')),
  constraint channel_commission_rules_tax_mode_check
    check (tax_mode in ('inclusive', 'exclusive')),
  constraint channel_commission_rules_values_check
    check (
      commission_value >= 0
      and gst_percent >= 0
      and (commission_type <> 'percentage' or commission_value <= 100)
    )
);

create table if not exists public.receipt_templates (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  logo_url text,
  receipt_header_title text not null default 'Famlo Pro Booking Receipt',
  footer_note text,
  support_phone text,
  support_email text,
  address text,
  show_gstin boolean not null default true,
  show_guest_contact boolean not null default true,
  show_ota_source boolean not null default true,
  show_payment_mode boolean not null default true,
  show_host_signature_block boolean not null default false,
  show_generated_by_famlo boolean not null default true,
  terms_conditions text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint receipt_templates_family_id_key unique (family_id)
);

create table if not exists public.host_business_details (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  business_name text,
  owner_full_name text,
  phone text,
  email text,
  alternate_phone text,
  address_line1 text,
  address_line2 text,
  city text,
  state text,
  pin_code text,
  country text not null default 'India',
  gstin text,
  pan text,
  bank_account_holder_name text,
  bank_name text,
  account_number_masked text,
  ifsc text,
  upi_id text,
  signature_url text,
  stamp_url text,
  business_logo_url text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint host_business_details_family_id_key unique (family_id)
);

create index if not exists channel_finance_settings_family_id_idx
  on public.channel_finance_settings (family_id);

create index if not exists channel_commission_rules_family_id_idx
  on public.channel_commission_rules (family_id);

create index if not exists channel_commission_rules_lookup_idx
  on public.channel_commission_rules (family_id, channel_key, is_active, effective_from);

create index if not exists receipt_templates_family_id_idx
  on public.receipt_templates (family_id);

create index if not exists host_business_details_family_id_idx
  on public.host_business_details (family_id);

alter table public.channel_finance_settings enable row level security;
alter table public.channel_commission_rules enable row level security;
alter table public.receipt_templates enable row level security;
alter table public.host_business_details enable row level security;

revoke all on public.channel_finance_settings from anon;
revoke all on public.channel_finance_settings from authenticated;
revoke all on public.channel_commission_rules from anon;
revoke all on public.channel_commission_rules from authenticated;
revoke all on public.receipt_templates from anon;
revoke all on public.receipt_templates from authenticated;
revoke all on public.host_business_details from anon;
revoke all on public.host_business_details from authenticated;

notify pgrst, 'reload schema';
