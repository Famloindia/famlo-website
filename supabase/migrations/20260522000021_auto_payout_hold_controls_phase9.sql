begin;

alter table public.hosts
  add column if not exists payout_hold_status text not null default 'active',
  add column if not exists payout_hold_reason text,
  add column if not exists payout_hold_scope text,
  add column if not exists payout_hold_is_host_actionable boolean not null default false,
  add column if not exists payout_hold_created_by uuid references public.users(id) on delete set null,
  add column if not exists payout_hold_created_at timestamptz,
  add column if not exists payout_hold_released_by uuid references public.users(id) on delete set null,
  add column if not exists payout_hold_released_at timestamptz;

alter table public.hosts
  drop constraint if exists hosts_payout_hold_status_check;

alter table public.hosts
  add constraint hosts_payout_hold_status_check
  check (payout_hold_status in ('active', 'on_hold', 'paused'));

create index if not exists hosts_payout_hold_status_idx
  on public.hosts(payout_hold_status, updated_at desc);

alter table public.families
  add column if not exists payout_hold_status text not null default 'active',
  add column if not exists payout_hold_reason text,
  add column if not exists payout_hold_scope text,
  add column if not exists payout_hold_is_host_actionable boolean not null default false,
  add column if not exists payout_hold_created_by uuid references public.users(id) on delete set null,
  add column if not exists payout_hold_created_at timestamptz,
  add column if not exists payout_hold_released_by uuid references public.users(id) on delete set null,
  add column if not exists payout_hold_released_at timestamptz;

alter table public.families
  drop constraint if exists families_payout_hold_status_check;

alter table public.families
  add constraint families_payout_hold_status_check
  check (payout_hold_status in ('active', 'on_hold', 'paused'));

create index if not exists families_payout_hold_status_idx
  on public.families(payout_hold_status, updated_at desc);

alter table public.host_settlements_v2
  add column if not exists payout_hold_status text not null default 'active',
  add column if not exists payout_hold_reason text,
  add column if not exists payout_hold_is_host_actionable boolean not null default false,
  add column if not exists payout_hold_created_by uuid references public.users(id) on delete set null,
  add column if not exists payout_hold_created_at timestamptz,
  add column if not exists payout_hold_released_by uuid references public.users(id) on delete set null,
  add column if not exists payout_hold_released_at timestamptz,
  add column if not exists payout_eligible_at timestamptz,
  add column if not exists auto_payout_scheduled_at timestamptz,
  add column if not exists auto_payout_last_evaluated_at timestamptz,
  add column if not exists auto_payout_last_error text;

alter table public.host_settlements_v2
  drop constraint if exists host_settlements_v2_payout_hold_status_check;

alter table public.host_settlements_v2
  add constraint host_settlements_v2_payout_hold_status_check
  check (payout_hold_status in ('active', 'on_hold', 'paused'));

create index if not exists host_settlements_v2_payout_hold_idx
  on public.host_settlements_v2(payout_hold_status, status, updated_at desc);

create index if not exists host_settlements_v2_auto_payout_idx
  on public.host_settlements_v2(status, payout_hold_status, auto_payout_last_evaluated_at, payout_eligible_at);

alter table public.host_payout_executions
  add column if not exists payout_hold_status text not null default 'active',
  add column if not exists payout_hold_reason text,
  add column if not exists payout_hold_is_host_actionable boolean not null default false,
  add column if not exists payout_hold_created_by uuid references public.users(id) on delete set null,
  add column if not exists payout_hold_created_at timestamptz,
  add column if not exists payout_hold_released_by uuid references public.users(id) on delete set null,
  add column if not exists payout_hold_released_at timestamptz;

alter table public.host_payout_executions
  drop constraint if exists host_payout_executions_payout_hold_status_check;

alter table public.host_payout_executions
  add constraint host_payout_executions_payout_hold_status_check
  check (payout_hold_status in ('active', 'on_hold', 'paused'));

create index if not exists host_payout_executions_payout_hold_idx
  on public.host_payout_executions(payout_hold_status, status, updated_at desc);

commit;
