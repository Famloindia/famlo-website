begin;

create table if not exists public.host_pro_billing_orders (
  id uuid primary key default gen_random_uuid(),
  host_user_id uuid not null references public.users(id) on delete cascade,
  source_family_id uuid null references public.families(id) on delete set null,
  status text not null default 'draft',
  currency text not null default 'INR',
  pricing_version text not null default 'pro_v1',
  property_count integer not null default 0,
  room_count integer not null default 0,
  raw_subtotal_amount integer not null default 0,
  subtotal_amount integer not null default 0,
  gst_amount integer not null default 0,
  total_amount integer not null default 0,
  scope_hash text not null,
  scope_snapshot jsonb not null default '[]'::jsonb,
  gateway text not null default 'razorpay',
  gateway_order_id text null,
  gateway_payment_id text null,
  payment_signature text null,
  payment_captured_at timestamptz null,
  payment_failed_at timestamptz null,
  provider_event_id text null,
  invoice_id uuid null,
  finance_email_delivery_id uuid null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint host_pro_billing_orders_status_check
    check (status in ('draft', 'payment_pending', 'paid', 'failed', 'cancelled')),
  constraint host_pro_billing_orders_counts_check
    check (property_count >= 0 and room_count >= 0),
  constraint host_pro_billing_orders_amounts_check
    check (
      raw_subtotal_amount >= 0 and
      subtotal_amount >= 0 and
      gst_amount >= 0 and
      total_amount >= 0
    )
);

create unique index if not exists host_pro_billing_orders_gateway_order_uidx
  on public.host_pro_billing_orders(gateway_order_id)
  where gateway_order_id is not null;

create unique index if not exists host_pro_billing_orders_gateway_payment_uidx
  on public.host_pro_billing_orders(gateway_payment_id)
  where gateway_payment_id is not null;

create index if not exists host_pro_billing_orders_host_status_idx
  on public.host_pro_billing_orders(host_user_id, status, created_at desc);

create table if not exists public.host_pro_billing_order_properties (
  id uuid primary key default gen_random_uuid(),
  billing_order_id uuid not null references public.host_pro_billing_orders(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  property_name text not null,
  host_code text null,
  city text null,
  state text null,
  selected_room_count integer not null default 0,
  created_at timestamptz not null default now(),
  unique (billing_order_id, family_id)
);

create index if not exists host_pro_billing_order_properties_family_idx
  on public.host_pro_billing_order_properties(family_id, created_at desc);

create table if not exists public.host_pro_billing_order_rooms (
  id uuid primary key default gen_random_uuid(),
  billing_order_id uuid not null references public.host_pro_billing_orders(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  stay_unit_id uuid not null references public.stay_units_v2(id) on delete cascade,
  room_name text not null,
  created_at timestamptz not null default now(),
  unique (billing_order_id, stay_unit_id)
);

create index if not exists host_pro_billing_order_rooms_family_idx
  on public.host_pro_billing_order_rooms(family_id, created_at desc);

alter table public.host_pro_subscriptions
  add column if not exists host_user_id uuid references public.users(id) on delete set null,
  add column if not exists billing_order_id uuid references public.host_pro_billing_orders(id) on delete set null,
  add column if not exists scope_hash text,
  add column if not exists room_count integer not null default 0,
  add column if not exists billing_subtotal_amount integer not null default 0,
  add column if not exists billing_gst_amount integer not null default 0,
  add column if not exists billing_total_amount integer not null default 0;

create unique index if not exists host_pro_subscriptions_billing_order_family_uidx
  on public.host_pro_subscriptions(billing_order_id, family_id)
  where billing_order_id is not null;

create index if not exists host_pro_subscriptions_host_user_idx
  on public.host_pro_subscriptions(host_user_id, status, created_at desc);

create table if not exists public.host_pro_subscription_rooms (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.host_pro_subscriptions(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  stay_unit_id uuid not null references public.stay_units_v2(id) on delete cascade,
  room_name text not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint host_pro_subscription_rooms_status_check
    check (status in ('active', 'cancelled')),
  unique (subscription_id, stay_unit_id)
);

create index if not exists host_pro_subscription_rooms_family_idx
  on public.host_pro_subscription_rooms(family_id, status, created_at desc);

create table if not exists public.host_pro_invoices (
  id uuid primary key default gen_random_uuid(),
  billing_order_id uuid not null references public.host_pro_billing_orders(id) on delete cascade,
  host_user_id uuid not null references public.users(id) on delete cascade,
  invoice_number text not null unique,
  receipt_number text not null unique,
  status text not null default 'issued',
  currency text not null default 'INR',
  property_count integer not null default 0,
  room_count integer not null default 0,
  subtotal_amount integer not null default 0,
  gst_amount integer not null default 0,
  total_amount integer not null default 0,
  payload jsonb not null default '{}'::jsonb,
  issued_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint host_pro_invoices_status_check
    check (status in ('issued', 'cancelled'))
);

create unique index if not exists host_pro_invoices_order_uidx
  on public.host_pro_invoices(billing_order_id);

create index if not exists host_pro_invoices_host_idx
  on public.host_pro_invoices(host_user_id, issued_at desc);

notify pgrst, 'reload schema';

commit;
