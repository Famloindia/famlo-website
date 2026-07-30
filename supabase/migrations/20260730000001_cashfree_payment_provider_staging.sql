begin;

alter table public.payments_v2
  add column if not exists provider text,
  add column if not exists external_order_id text,
  add column if not exists external_payment_id text,
  add column if not exists amount_minor integer,
  add column if not exists payment_attempt_number integer not null default 1,
  add column if not exists idempotency_key text,
  add column if not exists provider_payload_ref text,
  add column if not exists provider_status text,
  add column if not exists order_expires_at timestamptz;

update public.payments_v2
set
  provider = coalesce(provider, gateway),
  external_order_id = coalesce(external_order_id, gateway_order_id),
  external_payment_id = coalesce(external_payment_id, gateway_payment_id),
  amount_minor = coalesce(amount_minor, amount_total * 100)
where provider is null
   or external_order_id is null
   or amount_minor is null;

create index if not exists payments_v2_provider_booking_idx
  on public.payments_v2(provider, booking_id, created_at desc);

create unique index if not exists payments_v2_provider_idempotency_uidx
  on public.payments_v2(provider, idempotency_key)
  where provider is not null and idempotency_key is not null;

alter table public.refunds_v2
  add column if not exists amount_minor integer,
  add column if not exists idempotency_key text,
  add column if not exists requested_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists provider_payload_ref text;

update public.refunds_v2
set
  amount_minor = coalesce(amount_minor, amount_total * 100),
  requested_at = coalesce(requested_at, initiated_at),
  completed_at = coalesce(completed_at, processed_at)
where amount_minor is null
   or requested_at is null
   or completed_at is null;

create unique index if not exists refunds_v2_provider_idempotency_uidx
  on public.refunds_v2(provider, idempotency_key)
  where idempotency_key is not null;

alter table public.payment_provider_events
  add column if not exists processing_attempts integer not null default 0,
  add column if not exists payload_ref text,
  add column if not exists updated_at timestamptz not null default now();

create table if not exists public.cashfree_marketplace_vendors (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.hosts(id) on delete cascade,
  provider text not null default 'cashfree',
  cashfree_vendor_id text not null,
  legal_name text,
  account_holder_name text,
  account_number_masked text,
  ifsc text,
  bank_account_fingerprint text,
  verification_status text not null default 'pending',
  activation_status text not null default 'pending',
  is_active boolean not null default false,
  raw_response jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cashfree_marketplace_vendors_provider_check
    check (provider = 'cashfree'),
  unique(provider, cashfree_vendor_id),
  unique(host_id, provider, bank_account_fingerprint)
);

create index if not exists cashfree_marketplace_vendors_host_idx
  on public.cashfree_marketplace_vendors(host_id, is_active, updated_at desc);

create table if not exists public.cashfree_marketplace_splits (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings_v2(id) on delete cascade,
  payment_id uuid references public.payments_v2(id) on delete set null,
  host_id uuid not null references public.hosts(id) on delete cascade,
  cashfree_vendor_id text not null,
  cashfree_order_id text,
  cashfree_split_id text,
  gross_booking_amount_minor integer not null,
  famlo_commission_amount_minor integer not null,
  host_gross_share_minor integer not null,
  gateway_fee_minor integer not null default 0,
  gateway_fee_tax_minor integer not null default 0,
  refund_adjustment_minor integer not null default 0,
  host_net_payable_minor integer not null,
  checkout_at timestamptz,
  payout_eligible_at timestamptz,
  settlement_initiated_at timestamptz,
  bank_credit_at timestamptz,
  settlement_status text not null default 'pending',
  cashfree_settlement_id text,
  utr text,
  failure_reason text,
  raw_response jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cashfree_marketplace_splits_amounts_check
    check (gross_booking_amount_minor = famlo_commission_amount_minor + host_gross_share_minor),
  constraint cashfree_marketplace_splits_nonnegative_amounts_check
    check (
      gross_booking_amount_minor >= 0
      and famlo_commission_amount_minor >= 0
      and host_gross_share_minor >= 0
      and gateway_fee_minor >= 0
      and gateway_fee_tax_minor >= 0
      and refund_adjustment_minor >= 0
    ),
  unique(booking_id, cashfree_vendor_id)
);

create index if not exists cashfree_marketplace_splits_status_idx
  on public.cashfree_marketplace_splits(settlement_status, payout_eligible_at);

create index if not exists cashfree_marketplace_splits_order_idx
  on public.cashfree_marketplace_splits(cashfree_order_id);

alter table public.cashfree_marketplace_vendors enable row level security;
alter table public.cashfree_marketplace_splits enable row level security;

revoke all on public.cashfree_marketplace_vendors from anon, authenticated;
revoke all on public.cashfree_marketplace_splits from anon, authenticated;
grant select, insert, update, delete on public.cashfree_marketplace_vendors to service_role;
grant select, insert, update, delete on public.cashfree_marketplace_splits to service_role;

notify pgrst, 'reload schema';

commit;
