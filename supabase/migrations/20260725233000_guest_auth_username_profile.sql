-- Final guest authentication: additive username and contact verification metadata.
-- Existing users remain valid with a null username until they complete their profile.

create or replace function public.normalize_guest_username(input text)
returns text
language sql
immutable
as $$
  select nullif(lower(btrim(input)), '')
$$;

alter table public.users
  add column if not exists username text,
  add column if not exists email_verified_at timestamptz,
  add column if not exists phone_verified_at timestamptz,
  add column if not exists profile_completed_at timestamptz;

alter table public.phone_otps
  add column if not exists purpose text not null default 'guest_phone_auth';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.phone_otps'::regclass
      and conname = 'phone_otps_purpose_check'
  ) then
    alter table public.phone_otps
      add constraint phone_otps_purpose_check
      check (purpose in ('guest_phone_login', 'guest_phone_signup', 'guest_phone_auth'));
  end if;
end
$$;

update public.users
set username = public.normalize_guest_username(username)
where username is not null
  and username is distinct from public.normalize_guest_username(username);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.users'::regclass
      and conname = 'users_username_format_check'
  ) then
    alter table public.users
      add constraint users_username_format_check
      check (
        username is null
        or (
          username = public.normalize_guest_username(username)
          and username ~ '^[a-z][a-z0-9_]{2,29}$'
        )
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.users'::regclass
      and conname = 'users_username_reserved_check'
  ) then
    alter table public.users
      add constraint users_username_reserved_check
      check (
        username is null
        or username <> all (
          array[
            'admin', 'api', 'auth', 'famlo', 'host', 'login',
            'logout', 'profile', 'signup', 'support', 'www'
          ]::text[]
        )
      );
  end if;
end
$$;

create unique index if not exists users_username_normalized_uidx
  on public.users (public.normalize_guest_username(username))
  where username is not null;

create index if not exists users_profile_completed_at_idx
  on public.users (profile_completed_at)
  where role = 'guest';

create or replace function public.set_guest_profile_completion()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.role = 'guest' then
    if
      nullif(btrim(new.avatar_url), '') is not null
      and nullif(btrim(new.username), '') is not null
      and nullif(btrim(new.name), '') is not null
      and nullif(btrim(new.phone), '') is not null
      and nullif(btrim(new.email), '') is not null
      and nullif(btrim(new.city), '') is not null
      and nullif(btrim(new.state), '') is not null
      and nullif(btrim(new.gender), '') is not null
      and new.date_of_birth is not null
      and nullif(btrim(new.about), '') is not null
    then
      new.profile_completed_at = coalesce(new.profile_completed_at, now());
    else
      new.profile_completed_at = null;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists users_set_guest_profile_completion on public.users;
create trigger users_set_guest_profile_completion
before insert or update of
  role, avatar_url, username, name, phone, email, city, state, gender,
  date_of_birth, about
on public.users
for each row execute function public.set_guest_profile_completion();

update public.users profile
set email_verified_at = coalesce(profile.email_verified_at, auth_user.email_confirmed_at),
    phone_verified_at = coalesce(profile.phone_verified_at, auth_user.phone_confirmed_at)
from auth.users auth_user
where profile.id = auth_user.id
  and (
    (
      profile.email_verified_at is null
      and auth_user.email_confirmed_at is not null
      and public.normalize_guest_email(profile.email) =
        public.normalize_guest_email(auth_user.email)
    )
    or (
      profile.phone_verified_at is null
      and auth_user.phone_confirmed_at is not null
      and public.normalize_guest_phone(profile.phone) =
        public.normalize_guest_phone(auth_user.phone)
    )
  );

update public.users
set profile_completed_at = coalesce(profile_completed_at, now())
where role = 'guest'
  and profile_completed_at is null
  and nullif(btrim(avatar_url), '') is not null
  and nullif(btrim(username), '') is not null
  and nullif(btrim(name), '') is not null
  and nullif(btrim(phone), '') is not null
  and nullif(btrim(email), '') is not null
  and nullif(btrim(city), '') is not null
  and nullif(btrim(state), '') is not null
  and nullif(btrim(gender), '') is not null
  and date_of_birth is not null
  and nullif(btrim(about), '') is not null;

comment on column public.users.username is
  'Canonical lowercase guest username. Null only until profile completion.';
comment on column public.users.email_verified_at is
  'Verification evidence for the profile email; typing an email does not set this.';
comment on column public.users.phone_verified_at is
  'Verification evidence for the profile phone; typing a phone does not set this.';
comment on column public.users.profile_completed_at is
  'Timestamp recorded when canonical persisted profile requirements were satisfied.';

-- Rollback note:
-- Drop users_set_guest_profile_completion and set_guest_profile_completion,
-- users_username_normalized_uidx, users_profile_completed_at_idx, the two
-- username constraints, and the four additive columns. Dropping verification
-- timestamps loses evidence and should only be done after a reviewed rollback.
