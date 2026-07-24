begin;

-- These tables were present in recorded migrations but absent from the
-- reconciled staging schema. Keep this restoration additive and data-safe.
create table if not exists public.host_tax_details (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  pan_number_encrypted text not null,
  pan_number_hash text not null,
  pan_last_four char(4) not null,
  pan_holder_name text not null,
  pan_image_url text,
  pan_date_of_birth date,
  verification_status text not null default 'pending',
  verification_provider text,
  is_verified boolean not null default false,
  risk_flag boolean not null default false,
  risk_reason text,
  consent_given boolean not null default true,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint host_tax_details_verification_status_check check (
    verification_status in ('pending', 'submitted', 'under_review', 'verified', 'rejected', 'flagged')
  )
);

create unique index if not exists host_tax_details_user_id_idx
  on public.host_tax_details (user_id);
create unique index if not exists unique_host_pan_hash
  on public.host_tax_details (pan_number_hash);
create index if not exists host_tax_details_status_idx
  on public.host_tax_details (verification_status, is_verified, risk_flag);

alter table public.host_tax_details enable row level security;

drop policy if exists "host_tax_details_owner_select" on public.host_tax_details;
create policy "host_tax_details_owner_select"
on public.host_tax_details for select to authenticated
using (auth.uid() = user_id);

drop policy if exists "host_tax_details_owner_insert" on public.host_tax_details;
create policy "host_tax_details_owner_insert"
on public.host_tax_details for insert to authenticated
with check (auth.uid() = user_id);

drop policy if exists "host_tax_details_owner_update" on public.host_tax_details;
create policy "host_tax_details_owner_update"
on public.host_tax_details for update to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create table if not exists public.host_interaction_events_v2 (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete set null,
  visitor_id text not null,
  session_id text,
  host_id uuid not null references public.hosts(id) on delete cascade,
  legacy_family_id uuid,
  event_type text not null,
  event_bucket text not null,
  page_path text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint host_interaction_events_v2_event_type_check check (
    event_type in (
      'listing_view',
      'profile_click',
      'gallery_open',
      'wishlist_add',
      'message_start',
      'booking_page_open',
      'booking_request',
      'booking_confirmed',
      'story_read',
      'repeat_visit'
    )
  ),
  constraint host_interaction_events_v2_event_bucket_check check (length(event_bucket) > 0)
);

create index if not exists host_interaction_events_v2_host_type_created_idx
  on public.host_interaction_events_v2(host_id, event_type, created_at desc);
create index if not exists host_interaction_events_v2_visitor_created_idx
  on public.host_interaction_events_v2(visitor_id, created_at desc);
create unique index if not exists host_interaction_events_v2_dedupe_idx
  on public.host_interaction_events_v2(visitor_id, host_id, event_type, event_bucket);

create table if not exists public.host_settlements_v2 (
  id uuid primary key default gen_random_uuid(),
  settlement_code text not null unique,
  host_id uuid not null references public.hosts(id) on delete cascade,
  host_user_id uuid references public.users(id) on delete set null,
  property_id uuid,
  currency text not null default 'INR',
  status text not null default 'draft',
  period_start date not null,
  period_end date not null,
  gross_booking_value integer not null default 0,
  platform_fee_amount integer not null default 0,
  platform_fee_tax_amount integer not null default 0,
  refund_adjustment_amount integer not null default 0,
  withholding_amount integer not null default 0,
  net_payable_amount integer not null default 0,
  included_booking_count integer not null default 0,
  approved_by uuid references public.users(id) on delete set null,
  approved_at timestamptz,
  paid_at timestamptz,
  failed_at timestamptz,
  cancelled_at timestamptz,
  transfer_reference text,
  provider text,
  payout_hold_status text not null default 'active',
  payout_hold_reason text,
  payout_hold_is_host_actionable boolean not null default false,
  payout_hold_created_by uuid references public.users(id) on delete set null,
  payout_hold_created_at timestamptz,
  payout_hold_released_by uuid references public.users(id) on delete set null,
  payout_hold_released_at timestamptz,
  payout_eligible_at timestamptz,
  auto_payout_scheduled_at timestamptz,
  auto_payout_last_evaluated_at timestamptz,
  auto_payout_last_error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint host_settlements_v2_status_check check (
    status in (
      'draft',
      'approved',
      'payout_pending',
      'payout_processing',
      'paid',
      'payout_failed',
      'payout_reversed',
      'needs_review',
      'cancelled'
    )
  ),
  constraint host_settlements_v2_payout_hold_status_check check (
    payout_hold_status in ('active', 'on_hold', 'paused')
  )
);

create index if not exists host_settlements_v2_host_status_idx
  on public.host_settlements_v2(host_id, status);
create index if not exists host_settlements_v2_period_idx
  on public.host_settlements_v2(period_start, period_end);
create index if not exists host_settlements_v2_property_status_idx
  on public.host_settlements_v2(property_id, status);
create index if not exists host_settlements_v2_payout_hold_idx
  on public.host_settlements_v2(payout_hold_status, status, updated_at desc);
create index if not exists host_settlements_v2_auto_payout_idx
  on public.host_settlements_v2(status, payout_hold_status, auto_payout_last_evaluated_at, payout_eligible_at);

create table if not exists public.settlement_line_items_v2 (
  id uuid primary key default gen_random_uuid(),
  settlement_id uuid not null references public.host_settlements_v2(id) on delete cascade,
  booking_id uuid references public.bookings_v2(id) on delete set null,
  reservation_id uuid references public.reservations_v2(id) on delete set null,
  folio_id uuid not null references public.reservation_folios_v2(id) on delete restrict,
  payout_id uuid references public.payouts_v2(id) on delete set null,
  line_type text not null,
  amount integer not null default 0,
  currency text not null default 'INR',
  reference_type text,
  reference_id text,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists settlement_line_items_v2_settlement_idx
  on public.settlement_line_items_v2(settlement_id);
create index if not exists settlement_line_items_v2_booking_idx
  on public.settlement_line_items_v2(booking_id);
create index if not exists settlement_line_items_v2_folio_idx
  on public.settlement_line_items_v2(folio_id);
create unique index if not exists settlement_line_items_v2_active_folio_uidx
  on public.settlement_line_items_v2(folio_id) where is_active = true;

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
select
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
  jsonb_build_object('seed_source', 'recorded_schema_restoration')
where not exists (
  select 1 from public.finance_settings
  where scope_type = 'GLOBAL' and scope_id is null
);

create table if not exists public.host_payout_accounts (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.hosts(id) on delete cascade,
  provider text not null,
  provider_contact_id text,
  provider_fund_account_id text,
  account_holder_name text,
  account_number_masked text,
  ifsc text,
  vpa text,
  validation_status text not null default 'unverified',
  validation_reference text,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists host_payout_accounts_host_idx
  on public.host_payout_accounts(host_id, is_active);
create index if not exists host_payout_accounts_provider_idx
  on public.host_payout_accounts(provider, validation_status);
create unique index if not exists host_payout_accounts_provider_contact_uidx
  on public.host_payout_accounts(provider, provider_contact_id)
  where provider_contact_id is not null;
create unique index if not exists host_payout_accounts_provider_fund_uidx
  on public.host_payout_accounts(provider, provider_fund_account_id)
  where provider_fund_account_id is not null;

create table if not exists public.host_payout_executions (
  id uuid primary key default gen_random_uuid(),
  settlement_id uuid not null references public.host_settlements_v2(id) on delete cascade,
  host_id uuid not null references public.hosts(id) on delete cascade,
  provider text not null,
  provider_payout_id text,
  provider_fund_account_id text,
  amount integer not null default 0,
  currency text not null default 'INR',
  reference_id text not null,
  status text not null default 'created',
  failure_reason text,
  raw_response jsonb not null default '{}'::jsonb,
  initiated_by uuid references public.users(id) on delete set null,
  initiated_at timestamptz,
  processed_at timestamptz,
  payout_hold_status text not null default 'active',
  payout_hold_reason text,
  payout_hold_is_host_actionable boolean not null default false,
  payout_hold_created_by uuid references public.users(id) on delete set null,
  payout_hold_created_at timestamptz,
  payout_hold_released_by uuid references public.users(id) on delete set null,
  payout_hold_released_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint host_payout_executions_payout_hold_status_check check (
    payout_hold_status in ('active', 'on_hold', 'paused')
  )
);

create index if not exists host_payout_executions_settlement_idx
  on public.host_payout_executions(settlement_id, status, created_at desc);
create index if not exists host_payout_executions_host_idx
  on public.host_payout_executions(host_id, status, created_at desc);
create unique index if not exists host_payout_executions_active_settlement_uidx
  on public.host_payout_executions(settlement_id)
  where status in ('created', 'submitted', 'processing');
create unique index if not exists host_payout_executions_provider_payout_uidx
  on public.host_payout_executions(provider, provider_payout_id)
  where provider_payout_id is not null;
create unique index if not exists host_payout_executions_reference_uidx
  on public.host_payout_executions(reference_id);
create index if not exists host_payout_executions_payout_hold_idx
  on public.host_payout_executions(payout_hold_status, status, updated_at desc);

create table if not exists public.guest_tax_invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null unique,
  booking_id uuid references public.bookings_v2(id) on delete set null,
  reservation_id uuid references public.reservations_v2(id) on delete set null,
  guest_id uuid references public.users(id) on delete set null,
  invoice_type text not null default 'guest_tax_invoice',
  status text not null default 'draft',
  taxable_amount integer not null default 0,
  gst_amount integer not null default 0,
  total_amount integer not null default 0,
  payload jsonb not null default '{}'::jsonb,
  calculation_version text,
  issued_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists guest_tax_invoices_booking_idx
  on public.guest_tax_invoices(booking_id, created_at desc);
create index if not exists guest_tax_invoices_reservation_idx
  on public.guest_tax_invoices(reservation_id, created_at desc);

create table if not exists public.platform_fee_invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null unique,
  booking_id uuid references public.bookings_v2(id) on delete set null,
  reservation_id uuid references public.reservations_v2(id) on delete set null,
  host_id uuid references public.hosts(id) on delete set null,
  status text not null default 'draft',
  taxable_amount integer not null default 0,
  gst_amount integer not null default 0,
  total_amount integer not null default 0,
  payload jsonb not null default '{}'::jsonb,
  calculation_version text,
  issued_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists platform_fee_invoices_booking_idx
  on public.platform_fee_invoices(booking_id, created_at desc);
create index if not exists platform_fee_invoices_host_idx
  on public.platform_fee_invoices(host_id, created_at desc);

create table if not exists public.credit_notes (
  id uuid primary key default gen_random_uuid(),
  credit_note_number text not null unique,
  original_invoice_id uuid,
  original_invoice_type text not null,
  booking_id uuid references public.bookings_v2(id) on delete set null,
  reservation_id uuid references public.reservations_v2(id) on delete set null,
  status text not null default 'draft',
  taxable_reversal_amount integer not null default 0,
  gst_reversal_amount integer not null default 0,
  total_reversal_amount integer not null default 0,
  reason text,
  payload jsonb not null default '{}'::jsonb,
  issued_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists credit_notes_booking_idx
  on public.credit_notes(booking_id, created_at desc);
create index if not exists credit_notes_original_invoice_idx
  on public.credit_notes(original_invoice_id, original_invoice_type);

create table if not exists public.finance_document_files (
  id uuid primary key default gen_random_uuid(),
  artifact_type text not null,
  artifact_id uuid not null,
  storage_path text not null,
  checksum text not null,
  mime_type text not null default 'application/pdf',
  file_size_bytes integer not null default 0,
  generated_at timestamptz not null default now(),
  generated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists finance_document_files_artifact_unique_idx
  on public.finance_document_files(artifact_type, artifact_id);
create unique index if not exists finance_document_files_storage_path_unique_idx
  on public.finance_document_files(storage_path);
create index if not exists finance_document_files_generated_at_idx
  on public.finance_document_files(generated_at desc);

create table if not exists public.finance_email_deliveries (
  id uuid primary key default gen_random_uuid(),
  recipient_type text not null,
  recipient_id text,
  email text not null,
  template_key text not null,
  artifact_type text,
  artifact_id uuid,
  provider text not null default 'resend',
  provider_message_id text,
  status text not null default 'pending',
  error_message text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists finance_email_deliveries_artifact_idx
  on public.finance_email_deliveries(artifact_type, artifact_id);
create index if not exists finance_email_deliveries_recipient_idx
  on public.finance_email_deliveries(recipient_type, recipient_id, created_at desc);
create unique index if not exists finance_email_deliveries_idempotency_idx
  on public.finance_email_deliveries(template_key, artifact_type, artifact_id, email);

notify pgrst, 'reload schema';

commit;
