-- Phase 0: phone OTP challenges are server-managed authentication material.
-- This migration does not delete existing challenges. Expired rows are removed
-- only when the service-role cleanup function is called explicitly.

create table if not exists public.phone_otps (
  id uuid primary key default gen_random_uuid(),
  phone text not null,
  otp text not null default 'PROVIDER_MANAGED',
  otp_session_id text,
  expires_at timestamptz not null,
  verified boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.phone_otps enable row level security;

revoke all privileges on table public.phone_otps from anon;
revoke all privileges on table public.phone_otps from authenticated;
grant select, insert, update, delete on table public.phone_otps to service_role;

create index if not exists phone_otps_expires_at_idx
  on public.phone_otps (expires_at);

create index if not exists phone_otps_phone_created_at_idx
  on public.phone_otps (phone, created_at desc);

create index if not exists phone_otps_session_unverified_idx
  on public.phone_otps (otp_session_id, phone)
  where verified = false;

create or replace function public.cleanup_expired_phone_otps(batch_size integer default 500)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  deleted_count integer;
begin
  if batch_size is null or batch_size < 1 or batch_size > 5000 then
    raise exception 'batch_size must be between 1 and 5000';
  end if;

  with expired as (
    select id
    from public.phone_otps
    where expires_at < now()
    order by expires_at
    limit batch_size
    for update skip locked
  )
  delete from public.phone_otps target
  using expired
  where target.id = expired.id;

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke all on function public.cleanup_expired_phone_otps(integer) from public;
revoke all on function public.cleanup_expired_phone_otps(integer) from anon;
revoke all on function public.cleanup_expired_phone_otps(integer) from authenticated;
grant execute on function public.cleanup_expired_phone_otps(integer) to service_role;

comment on function public.cleanup_expired_phone_otps(integer) is
  'Service-role-only bounded cleanup for expired phone OTP challenges.';

-- Rollback note:
-- Drop cleanup_expired_phone_otps and the three phone_otps_* indexes if needed.
-- Re-enabling direct anon/authenticated access or disabling RLS is intentionally
-- not part of rollback because OTP challenge rows must remain server-only.
