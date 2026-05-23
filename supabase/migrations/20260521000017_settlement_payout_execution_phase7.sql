begin;

alter table public.host_settlements_v2
  drop constraint if exists host_settlements_v2_status_check;

alter table public.host_settlements_v2
  add constraint host_settlements_v2_status_check
  check (
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
  );

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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
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

commit;
