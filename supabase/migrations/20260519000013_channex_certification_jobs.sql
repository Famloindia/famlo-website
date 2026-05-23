begin;

alter table public.channel_sync_jobs
  add column if not exists channex_task_id text,
  add column if not exists processed_at timestamptz;

alter table public.channel_sync_jobs
  drop constraint if exists channel_sync_jobs_type_check;

alter table public.channel_sync_jobs
  add constraint channel_sync_jobs_type_check
    check (
      job_type in (
        'provider_refresh',
        'provider_reconcile',
        'booking_feed_poll',
        'booking_acknowledge',
        'booking_modification_apply',
        'booking_cancellation_apply',
        'ari_push',
        'availability_update',
        'rate_update',
        'restriction_update',
        'full_sync',
        'diagnostic_check'
      )
    );

create index if not exists channel_sync_jobs_channex_task_idx
  on public.channel_sync_jobs(channex_task_id, created_at desc)
  where channex_task_id is not null;

commit;
