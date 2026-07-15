begin;

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
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint host_settlements_v2_status_check check (status in ('draft', 'approved', 'cancelled'))
);

create index if not exists host_settlements_v2_host_status_idx
  on public.host_settlements_v2(host_id, status);

create index if not exists host_settlements_v2_period_idx
  on public.host_settlements_v2(period_start, period_end);

create index if not exists host_settlements_v2_property_status_idx
  on public.host_settlements_v2(property_id, status);

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
  on public.settlement_line_items_v2(folio_id)
  where is_active = true;

commit;
