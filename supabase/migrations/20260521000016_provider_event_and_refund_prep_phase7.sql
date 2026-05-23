begin;

create table if not exists public.payment_provider_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  event_id text not null,
  event_type text not null,
  entity_type text,
  entity_id text,
  raw_payload jsonb not null default '{}'::jsonb,
  signature_valid boolean not null default false,
  processing_status text not null default 'pending',
  processed_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  constraint payment_provider_events_provider_event_uidx unique (provider, event_id)
);

create index if not exists payment_provider_events_processing_idx
  on public.payment_provider_events(provider, processing_status, created_at desc);

create index if not exists payment_provider_events_entity_idx
  on public.payment_provider_events(entity_type, entity_id);

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

create table if not exists public.refund_requests (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings_v2(id) on delete cascade,
  payment_id uuid references public.payments_v2(id) on delete set null,
  reason text,
  refund_amount integer not null default 0,
  refund_base_amount integer not null default 0,
  refund_gst_amount integer not null default 0,
  status text not null default 'requested',
  requires_admin_approval boolean not null default true,
  approved_by uuid references public.users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists refund_requests_booking_idx
  on public.refund_requests(booking_id, status, created_at desc);

create index if not exists refund_requests_payment_idx
  on public.refund_requests(payment_id);

create table if not exists public.refund_attempts (
  id uuid primary key default gen_random_uuid(),
  refund_request_id uuid not null references public.refund_requests(id) on delete cascade,
  provider text not null,
  provider_refund_id text,
  amount integer not null default 0,
  status text not null default 'pending',
  raw_response jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists refund_attempts_request_idx
  on public.refund_attempts(refund_request_id, created_at desc);

create unique index if not exists refund_attempts_provider_refund_uidx
  on public.refund_attempts(provider, provider_refund_id)
  where provider_refund_id is not null;

commit;
