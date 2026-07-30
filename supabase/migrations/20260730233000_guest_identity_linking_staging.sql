begin;

alter table public.users
  add column if not exists pending_email text,
  add column if not exists pending_email_requested_at timestamptz,
  add column if not exists account_status text not null default 'active',
  add column if not exists merged_into_user_id uuid,
  add column if not exists merged_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.users'::regclass
      and conname = 'users_account_status_check'
  ) then
    alter table public.users
      add constraint users_account_status_check
      check (account_status in ('active', 'linking', 'merged', 'manual_review'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.users'::regclass
      and conname = 'users_merged_into_user_id_fkey'
  ) then
    alter table public.users
      add constraint users_merged_into_user_id_fkey
      foreign key (merged_into_user_id) references public.users(id) on delete restrict;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.users'::regclass
      and conname = 'users_merge_state_check'
  ) then
    alter table public.users
      add constraint users_merge_state_check
      check (
        (account_status = 'merged' and merged_into_user_id is not null and merged_at is not null)
        or
        (account_status <> 'merged' and merged_into_user_id is null and merged_at is null)
      );
  end if;
end
$$;

create index if not exists users_pending_email_normalized_idx
  on public.users (public.normalize_guest_email(pending_email))
  where pending_email is not null;

create index if not exists users_merged_into_user_idx
  on public.users (merged_into_user_id)
  where merged_into_user_id is not null;

create table if not exists public.account_link_requests (
  id uuid primary key default gen_random_uuid(),
  source_user_id uuid not null references public.users(id) on delete restrict,
  target_user_id uuid not null references public.users(id) on delete restrict,
  provider text not null default 'google',
  contact_type text not null default 'phone',
  contact_fingerprint text not null,
  intended_return_path text not null default '/',
  status text not null default 'pending_phone_proof',
  source_has_business_data boolean not null default false,
  target_has_business_data boolean not null default false,
  proof_attempts integer not null default 0,
  idempotency_key text not null,
  ownership_verified_at timestamptz,
  target_session_verified_at timestamptz,
  identity_linked_at timestamptz,
  merge_completed_at timestamptz,
  blocked_reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint account_link_requests_distinct_users_check
    check (source_user_id <> target_user_id),
  constraint account_link_requests_provider_check
    check (provider = 'google'),
  constraint account_link_requests_contact_type_check
    check (contact_type in ('phone', 'email')),
  constraint account_link_requests_status_check
    check (
      status in (
        'pending_phone_proof',
        'ownership_verified',
        'blocked_business_data',
        'awaiting_target_session',
        'awaiting_identity_link',
        'linked',
        'manual_review',
        'cancelled',
        'failed'
      )
    ),
  unique(idempotency_key)
);

create index if not exists account_link_requests_source_idx
  on public.account_link_requests(source_user_id, created_at desc);

create index if not exists account_link_requests_target_idx
  on public.account_link_requests(target_user_id, created_at desc);

create index if not exists account_link_requests_status_idx
  on public.account_link_requests(status, updated_at desc);

create table if not exists public.account_link_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.account_link_requests(id) on delete cascade,
  event_type text not null,
  actor_user_id uuid references public.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists account_link_events_request_idx
  on public.account_link_events(request_id, created_at);

alter table public.phone_otps
  add column if not exists account_link_request_id uuid
    references public.account_link_requests(id) on delete cascade;

alter table public.phone_otps
  drop constraint if exists phone_otps_purpose_check;

alter table public.phone_otps
  add constraint phone_otps_purpose_check
  check (
    purpose in (
      'guest_phone_login',
      'guest_phone_signup',
      'guest_phone_auth',
      'guest_account_link'
    )
  );

create index if not exists phone_otps_account_link_request_idx
  on public.phone_otps(account_link_request_id, created_at desc)
  where account_link_request_id is not null;

create or replace function public.prevent_duplicate_verified_user_contacts()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  normalized_email text;
  normalized_phone text;
begin
  if
    tg_op = 'INSERT'
    or new.email is distinct from old.email
    or new.email_verified_at is distinct from old.email_verified_at
    or new.account_status is distinct from old.account_status
  then
    normalized_email := public.normalize_guest_email(new.email);
    if
      new.account_status = 'active'
      and new.email_verified_at is not null
      and normalized_email is not null
      and exists (
        select 1
        from public.users other
        where other.id <> new.id
          and other.account_status = 'active'
          and other.email_verified_at is not null
          and public.normalize_guest_email(other.email) = normalized_email
      )
    then
      raise exception using
        errcode = '23505',
        constraint = 'users_verified_email_owner_key',
        message = 'Verified email is already owned by another account.';
    end if;
  end if;

  if
    tg_op = 'INSERT'
    or new.phone is distinct from old.phone
    or new.phone_verified_at is distinct from old.phone_verified_at
    or new.account_status is distinct from old.account_status
  then
    normalized_phone := public.normalize_guest_phone(new.phone);
    if
      new.account_status = 'active'
      and new.phone_verified_at is not null
      and normalized_phone is not null
      and exists (
        select 1
        from public.users other
        where other.id <> new.id
          and other.account_status = 'active'
          and other.phone_verified_at is not null
          and public.normalize_guest_phone(other.phone) = normalized_phone
      )
    then
      raise exception using
        errcode = '23505',
        constraint = 'users_verified_phone_owner_key',
        message = 'Verified phone is already owned by another account.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists users_prevent_duplicate_verified_contacts on public.users;
create trigger users_prevent_duplicate_verified_contacts
before insert or update of
  email, email_verified_at, phone, phone_verified_at, account_status
on public.users
for each row execute function public.prevent_duplicate_verified_user_contacts();

alter table public.account_link_requests enable row level security;
alter table public.account_link_events enable row level security;

revoke all on public.account_link_requests from anon, authenticated;
revoke all on public.account_link_events from anon, authenticated;
grant select, insert, update, delete on public.account_link_requests to service_role;
grant select, insert on public.account_link_events to service_role;

comment on column public.users.pending_email is
  'Unverified candidate email. It must never be treated as the canonical verified email.';
comment on table public.account_link_requests is
  'Server-only proof and state record for account linking; contains no raw phone or email.';
comment on table public.account_link_events is
  'Append-only operational audit trail for account linking and merge decisions.';

notify pgrst, 'reload schema';

commit;
