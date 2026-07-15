begin;

create table if not exists public.pro_razorpay_plans (
  id uuid primary key default gen_random_uuid(),
  razorpay_plan_id text not null unique,
  amount_paise integer not null,
  subtotal_paise integer not null,
  gst_paise integer not null,
  currency text not null default 'INR',
  period text not null default 'monthly',
  interval integer not null default 1,
  pricing_version text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pro_razorpay_plans_amounts_check
    check (
      amount_paise >= 0 and
      subtotal_paise >= 0 and
      gst_paise >= 0 and
      interval > 0
    ),
  constraint pro_razorpay_plans_period_check
    check (period in ('monthly'))
);

create unique index if not exists pro_razorpay_plans_lookup_uidx
  on public.pro_razorpay_plans(amount_paise, currency, period, interval, pricing_version);

alter table public.pro_razorpay_plans enable row level security;

revoke all on public.pro_razorpay_plans from anon, authenticated;

alter table public.host_pro_billing_orders
  add column if not exists billing_mode text not null default 'manual_order',
  add column if not exists gateway_subscription_id text null,
  add column if not exists gateway_plan_id text null,
  add column if not exists gateway_invoice_id text null,
  add column if not exists cycle_key text null,
  add column if not exists failure_reason text null,
  add column if not exists manual_fallback_allowed boolean not null default true;

alter table public.host_pro_billing_orders
  drop constraint if exists host_pro_billing_orders_billing_mode_check;

alter table public.host_pro_billing_orders
  add constraint host_pro_billing_orders_billing_mode_check
  check (billing_mode in ('manual_order', 'autopay_subscription'));

create index if not exists host_pro_billing_orders_subscription_idx
  on public.host_pro_billing_orders(gateway_subscription_id, created_at desc)
  where gateway_subscription_id is not null;

create unique index if not exists host_pro_billing_orders_subscription_cycle_uidx
  on public.host_pro_billing_orders(gateway_subscription_id, cycle_key)
  where gateway_subscription_id is not null and cycle_key is not null;

alter table public.host_pro_subscriptions
  add column if not exists billing_mode text not null default 'manual_order',
  add column if not exists razorpay_plan_id text null,
  add column if not exists razorpay_subscription_id text null,
  add column if not exists razorpay_customer_id text null,
  add column if not exists autopay_enabled boolean not null default false,
  add column if not exists autopay_status text null,
  add column if not exists subscription_status text null,
  add column if not exists mandate_status text null,
  add column if not exists subscription_started_at timestamptz null,
  add column if not exists next_charge_at timestamptz null,
  add column if not exists last_charge_at timestamptz null,
  add column if not exists cancel_at_period_end boolean not null default false,
  add column if not exists halted_at timestamptz null,
  add column if not exists paused_at timestamptz null,
  add column if not exists resumed_at timestamptz null,
  add column if not exists payment_failure_reason text null,
  add column if not exists last_provider_event_id text null,
  add column if not exists provider_metadata jsonb not null default '{}'::jsonb;

alter table public.host_pro_subscriptions
  drop constraint if exists host_pro_subscriptions_status_check;

alter table public.host_pro_subscriptions
  add constraint host_pro_subscriptions_status_check
  check (status in ('inactive', 'active', 'grace', 'paused', 'cancelled', 'payment_failed', 'halted'));

alter table public.host_pro_subscriptions
  drop constraint if exists host_pro_subscriptions_billing_mode_check;

alter table public.host_pro_subscriptions
  add constraint host_pro_subscriptions_billing_mode_check
  check (billing_mode in ('manual_order', 'autopay_subscription'));

create index if not exists host_pro_subscriptions_razorpay_subscription_idx
  on public.host_pro_subscriptions(razorpay_subscription_id, created_at desc)
  where razorpay_subscription_id is not null;

create index if not exists host_pro_subscriptions_autopay_idx
  on public.host_pro_subscriptions(host_user_id, autopay_enabled, status, created_at desc);

alter table public.host_pro_billing_orders enable row level security;
alter table public.host_pro_billing_order_properties enable row level security;
alter table public.host_pro_billing_order_rooms enable row level security;
alter table public.host_pro_subscription_rooms enable row level security;
alter table public.host_pro_invoices enable row level security;

revoke all on public.host_pro_billing_orders from anon, authenticated;
revoke all on public.host_pro_billing_order_properties from anon, authenticated;
revoke all on public.host_pro_billing_order_rooms from anon, authenticated;
revoke all on public.host_pro_subscription_rooms from anon, authenticated;
revoke all on public.host_pro_invoices from anon, authenticated;

notify pgrst, 'reload schema';

commit;
