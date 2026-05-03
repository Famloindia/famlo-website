create table if not exists public.host_pro_subscriptions (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null,
  plan_code text not null default 'famlo_plus',
  status text not null default 'inactive',
  current_period_start timestamptz,
  current_period_end timestamptz,
  grace_until timestamptz,
  activated_at timestamptz,
  cancelled_at timestamptz,
  provider text,
  provider_customer_id text,
  provider_subscription_id text,
  provider_order_id text,
  last_payment_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint host_pro_subscriptions_status_check
    check (status in ('inactive', 'active', 'grace', 'expired', 'cancelled'))
);

create index if not exists host_pro_subscriptions_family_id_idx
  on public.host_pro_subscriptions (family_id);

create index if not exists host_pro_subscriptions_status_idx
  on public.host_pro_subscriptions (status);

alter table public.host_pro_subscriptions enable row level security;

revoke all on public.host_pro_subscriptions from anon, authenticated;
