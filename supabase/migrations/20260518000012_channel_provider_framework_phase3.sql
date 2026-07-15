begin;

insert into public.channel_providers (code, name, status, metadata)
values
  ('booking', 'Booking.com', 'available', '{"adapter":"channex","provider_family":"ota"}'::jsonb),
  ('mmt', 'MakeMyTrip / Goibibo', 'available', '{"adapter":"channex","provider_family":"ota"}'::jsonb),
  ('airbnb', 'Airbnb', 'available', '{"adapter":"channex","provider_family":"ota","first_test_provider":true}'::jsonb),
  ('agoda', 'Agoda', 'available', '{"adapter":"channex","provider_family":"ota"}'::jsonb),
  ('expedia', 'Expedia', 'available', '{"adapter":"channex","provider_family":"ota"}'::jsonb),
  ('google-hotel', 'Google Hotel', 'available', '{"adapter":"channex","provider_family":"metasearch"}'::jsonb)
on conflict (code) do update
set
  name = excluded.name,
  status = excluded.status,
  metadata = public.channel_providers.metadata || excluded.metadata;

alter table public.channel_properties
  add column if not exists provider_account_id uuid,
  add column if not exists connection_status text not null default 'not_started',
  add column if not exists verification_status text not null default 'not_verified',
  add column if not exists activation_status text not null default 'inactive',
  add column if not exists dry_run boolean not null default true,
  add column if not exists last_operation_id uuid,
  add column if not exists last_reconciled_at timestamptz;

create table if not exists public.channel_provider_accounts (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null,
  provider_code text not null,
  account_reference text,
  display_name text,
  connection_mode text not null default 'channex',
  status text not null default 'draft',
  credentials_status text not null default 'not_required',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint channel_provider_accounts_status_check
    check (status in ('draft', 'details_submitted', 'verification_pending', 'verified', 'suspended', 'disconnected')),
  constraint channel_provider_accounts_credentials_check
    check (credentials_status in ('not_required', 'missing', 'stored', 'expired', 'revoked'))
);

create unique index if not exists channel_provider_accounts_family_provider_ref_uidx
  on public.channel_provider_accounts(family_id, provider_code, coalesce(account_reference, ''));

create index if not exists channel_provider_accounts_family_idx
  on public.channel_provider_accounts(family_id, provider_code, status);

create table if not exists public.channel_operation_ledger (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null,
  provider_code text not null,
  operation_type text not null,
  status text not null default 'queued',
  idempotency_key text,
  dry_run boolean not null default true,
  actor_user_id uuid,
  actor_role text,
  external_property_id text,
  external_channel_id text,
  request_payload jsonb not null default '{}'::jsonb,
  before_state jsonb not null default '{}'::jsonb,
  response_payload jsonb not null default '{}'::jsonb,
  after_state jsonb not null default '{}'::jsonb,
  provider_http_status integer,
  error_message text,
  attempt_count integer not null default 0,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint channel_operation_ledger_status_check
    check (status in ('queued', 'running', 'succeeded', 'failed', 'blocked', 'replayed')),
  constraint channel_operation_ledger_operation_check
    check (
      operation_type in (
        'create_provider',
        'test_provider',
        'connect_provider',
        'refresh_provider',
        'activate_provider',
        'deactivate_provider',
        'verify_mappings',
        'reconcile',
        'booking_import',
        'booking_acknowledge',
        'booking_modification_apply',
        'booking_cancellation_apply'
      )
    )
);

create unique index if not exists channel_operation_ledger_idempotency_uidx
  on public.channel_operation_ledger(idempotency_key)
  where idempotency_key is not null;

create index if not exists channel_operation_ledger_family_provider_idx
  on public.channel_operation_ledger(family_id, provider_code, created_at desc);

create index if not exists channel_operation_ledger_status_idx
  on public.channel_operation_ledger(status, created_at desc);

create table if not exists public.channel_sync_jobs (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null,
  provider_code text not null,
  job_type text not null,
  status text not null default 'queued',
  priority integer not null default 100,
  idempotency_key text,
  operation_id uuid references public.channel_operation_ledger(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  result jsonb not null default '{}'::jsonb,
  attempts integer not null default 0,
  max_attempts integer not null default 5,
  run_after timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  last_error text,
  dead_lettered_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint channel_sync_jobs_status_check
    check (status in ('queued', 'running', 'succeeded', 'retrying', 'failed', 'dead_lettered', 'cancelled')),
  constraint channel_sync_jobs_type_check
    check (
      job_type in (
        'provider_refresh',
        'provider_reconcile',
        'booking_feed_poll',
        'booking_acknowledge',
        'booking_modification_apply',
        'booking_cancellation_apply',
        'ari_push',
        'diagnostic_check'
      )
    )
);

create unique index if not exists channel_sync_jobs_idempotency_uidx
  on public.channel_sync_jobs(idempotency_key)
  where idempotency_key is not null;

create index if not exists channel_sync_jobs_due_idx
  on public.channel_sync_jobs(status, run_after, priority, created_at);

create index if not exists channel_sync_jobs_family_provider_idx
  on public.channel_sync_jobs(family_id, provider_code, created_at desc);

create table if not exists public.channel_provider_diagnostics (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null,
  provider_code text not null,
  severity text not null default 'info',
  diagnostic_type text not null,
  status text not null default 'open',
  message text not null,
  details jsonb not null default '{}'::jsonb,
  operation_id uuid references public.channel_operation_ledger(id) on delete set null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  constraint channel_provider_diagnostics_severity_check
    check (severity in ('info', 'warning', 'critical')),
  constraint channel_provider_diagnostics_status_check
    check (status in ('open', 'resolved', 'ignored'))
);

create index if not exists channel_provider_diagnostics_family_provider_idx
  on public.channel_provider_diagnostics(family_id, provider_code, status, last_seen_at desc);

create table if not exists public.channel_reconciliation_runs (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null,
  provider_code text not null,
  status text not null default 'running',
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  mismatch_count integer not null default 0,
  summary jsonb not null default '{}'::jsonb,
  created_by_operation_id uuid references public.channel_operation_ledger(id) on delete set null,
  constraint channel_reconciliation_runs_status_check
    check (status in ('running', 'matched', 'mismatched', 'failed'))
);

create index if not exists channel_reconciliation_runs_family_provider_idx
  on public.channel_reconciliation_runs(family_id, provider_code, started_at desc);

alter table public.channel_booking_revisions
  add column if not exists ota_provider_code text,
  add column if not exists lifecycle_action text,
  add column if not exists idempotency_key text,
  add column if not exists duplicate_of_revision_id uuid references public.channel_booking_revisions(id) on delete set null,
  add column if not exists retry_count integer not null default 0,
  add column if not exists processed_at timestamptz,
  add column if not exists last_error text;

create unique index if not exists channel_booking_revisions_idempotency_uidx
  on public.channel_booking_revisions(idempotency_key)
  where idempotency_key is not null;

create index if not exists channel_booking_revisions_lifecycle_idx
  on public.channel_booking_revisions(family_id, ota_provider_code, lifecycle_action, import_status, ack_status);

create or replace function public.claim_channel_sync_jobs(
  p_limit integer default 10,
  p_worker_id text default 'channel-worker'
)
returns setof public.channel_sync_jobs
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with candidate as (
    select id
    from public.channel_sync_jobs
    where status in ('queued', 'retrying')
      and run_after <= now()
    order by priority asc, created_at asc
    limit greatest(1, least(coalesce(p_limit, 10), 50))
    for update skip locked
  )
  update public.channel_sync_jobs j
  set
    status = 'running',
    locked_at = now(),
    locked_by = coalesce(nullif(p_worker_id, ''), 'channel-worker'),
    attempts = attempts + 1,
    updated_at = now()
  from candidate
  where j.id = candidate.id
  returning j.*;
end;
$$;

commit;
