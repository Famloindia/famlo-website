begin;

create table if not exists public.finance_settings (
  id uuid primary key default gen_random_uuid(),
  scope_type text not null default 'GLOBAL',
  scope_id uuid,
  tax_mode text not null default 'PENDING_COMPLIANCE',
  gst_collection_enabled boolean not null default false,
  tcs_enabled boolean not null default false,
  tds_enabled boolean not null default false,
  gst_export_enabled boolean not null default false,
  gst_invoice_generation_enabled boolean not null default false,
  default_platform_fee_bps integer not null default 1600,
  payout_release_policy text not null default 'AFTER_CHECKOUT',
  compliance_notes text,
  approved_by uuid references public.users(id) on delete set null,
  approved_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint finance_settings_scope_uidx unique (scope_type, scope_id),
  constraint finance_settings_tax_mode_check check (
    tax_mode in ('PENDING_COMPLIANCE', 'HOST_MARKETPLACE', 'ECO_SECTION_9_5', 'HOST_DIRECT_NO_TCS')
  )
);

create index if not exists finance_settings_scope_idx
  on public.finance_settings(scope_type, scope_id);

create index if not exists finance_settings_tax_mode_idx
  on public.finance_settings(tax_mode);

insert into public.finance_settings (
  scope_type,
  scope_id,
  tax_mode,
  gst_collection_enabled,
  tcs_enabled,
  tds_enabled,
  gst_export_enabled,
  gst_invoice_generation_enabled,
  default_platform_fee_bps,
  payout_release_policy,
  metadata
)
values (
  'GLOBAL',
  null,
  'PENDING_COMPLIANCE',
  false,
  false,
  false,
  false,
  false,
  1600,
  'AFTER_CHECKOUT',
  jsonb_build_object('seed_source', 'batch6_tax_lock')
)
on conflict (scope_type, scope_id) do nothing;

commit;
