create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create table if not exists public.notification_worker_runs (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'unknown',
  status text not null,
  claimed_count integer not null default 0,
  processed_count integer not null default 0,
  failed_count integer not null default 0,
  retried_count integer not null default 0,
  skipped_count integer not null default 0,
  booking_processed_count integer not null default 0,
  booking_failed_count integer not null default 0,
  booking_ignored_count integer not null default 0,
  duration_ms integer not null default 0,
  error_category text,
  created_at timestamptz not null default now(),
  constraint notification_worker_runs_status_check
    check (status in ('completed', 'failed'))
);

create index if not exists notification_worker_runs_created_at_idx
  on public.notification_worker_runs (created_at desc);

alter table public.notification_worker_runs enable row level security;
revoke all on table public.notification_worker_runs from anon, authenticated;
grant select, insert on table public.notification_worker_runs to service_role;

create or replace function public.invoke_famlo_notification_worker()
returns bigint
language plpgsql
security definer
set search_path = public, vault, net, pg_temp
as $$
declare
  worker_url text;
  cron_secret text;
  request_id bigint;
begin
  select decrypted_secret
    into worker_url
    from vault.decrypted_secrets
   where name = 'famlo_staging_notification_worker_url'
   limit 1;

  select decrypted_secret
    into cron_secret
    from vault.decrypted_secrets
   where name = 'famlo_staging_cron_secret'
   limit 1;

  if nullif(worker_url, '') is null or nullif(cron_secret, '') is null then
    raise warning 'Famlo staging notification worker Vault configuration is missing.';
    return null;
  end if;

  select net.http_post(
    url := worker_url,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || cron_secret,
      'Content-Type', 'application/json',
      'X-Famlo-Worker-Source', 'supabase_pg_cron'
    ),
    body := jsonb_build_object('source', 'supabase_pg_cron'),
    timeout_milliseconds := 25000
  )
  into request_id;

  return request_id;
end;
$$;

revoke all on function public.invoke_famlo_notification_worker() from public, anon, authenticated;
grant execute on function public.invoke_famlo_notification_worker() to postgres, service_role;

comment on function public.invoke_famlo_notification_worker() is
  'Invokes the Vault-configured staging notification worker. Scheduling is configured separately per environment.';
