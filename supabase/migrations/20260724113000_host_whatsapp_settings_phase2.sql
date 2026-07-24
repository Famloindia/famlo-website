begin;

create extension if not exists pgcrypto;

create table if not exists public.host_whatsapp_settings (
  id uuid primary key default gen_random_uuid(),
  host_user_id uuid not null references public.users(id) on delete cascade,
  phone_e164 text,
  phone_country_code text,
  enabled boolean not null default false,
  ownership_verified_at timestamptz,
  opted_in_at timestamptz,
  source text not null default 'unknown',
  language text not null default 'en',
  last_delivery_status text,
  last_delivery_at timestamptz,
  last_delivery_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint host_whatsapp_settings_host_user_unique unique (host_user_id),
  constraint host_whatsapp_settings_phone_e164_check
    check (phone_e164 is null or phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  constraint host_whatsapp_settings_country_code_check
    check (phone_country_code is null or phone_country_code ~ '^\+[1-9][0-9]{0,3}$'),
  constraint host_whatsapp_settings_source_check
    check (source in (
      'auth_phone_verified',
      'canonical_otp',
      'users_phone',
      'families_host_phone',
      'family_application',
      'dashboard_edit',
      'onboarding_consent',
      'unknown'
    )),
  constraint host_whatsapp_settings_enabled_requires_consent
    check (not enabled or (ownership_verified_at is not null and opted_in_at is not null))
);

create index if not exists host_whatsapp_settings_phone_idx
  on public.host_whatsapp_settings(phone_e164)
  where phone_e164 is not null;

create table if not exists public.host_whatsapp_otp_challenges (
  id uuid primary key default gen_random_uuid(),
  host_user_id uuid not null references public.users(id) on delete cascade,
  phone_e164 text not null,
  purpose text not null default 'host_whatsapp_change',
  provider text not null,
  provider_session_id text,
  code_hash text,
  status text not null default 'pending',
  consent_requested boolean not null default false,
  attempts integer not null default 0,
  max_attempts integer not null default 5,
  expires_at timestamptz not null,
  resend_available_at timestamptz not null,
  ip_hash text not null,
  verified_at timestamptz,
  consumed_at timestamptz,
  invalidated_at timestamptz,
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint host_whatsapp_otp_phone_check
    check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  constraint host_whatsapp_otp_purpose_check
    check (purpose = 'host_whatsapp_change'),
  constraint host_whatsapp_otp_provider_check
    check (provider in ('twofactor', 'staging_test')),
  constraint host_whatsapp_otp_status_check
    check (status in ('pending', 'verified', 'consumed', 'invalidated', 'expired', 'locked')),
  constraint host_whatsapp_otp_attempts_check
    check (attempts >= 0 and max_attempts between 1 and 10),
  constraint host_whatsapp_otp_secret_reference_check
    check (
      status <> 'pending'
      or (provider = 'twofactor' and provider_session_id is not null and code_hash is null)
      or (provider = 'staging_test' and code_hash is not null and provider_session_id is null)
    )
);

create index if not exists host_whatsapp_otp_host_created_idx
  on public.host_whatsapp_otp_challenges(host_user_id, created_at desc);

create index if not exists host_whatsapp_otp_phone_created_idx
  on public.host_whatsapp_otp_challenges(phone_e164, created_at desc);

create index if not exists host_whatsapp_otp_ip_created_idx
  on public.host_whatsapp_otp_challenges(ip_hash, created_at desc);

create unique index if not exists host_whatsapp_otp_one_pending_per_host_uidx
  on public.host_whatsapp_otp_challenges(host_user_id)
  where status = 'pending';

create table if not exists public.host_whatsapp_audit_log (
  id uuid primary key default gen_random_uuid(),
  host_user_id uuid not null references public.users(id) on delete cascade,
  action text not null,
  actor_type text not null default 'host',
  phone_masked text,
  outcome text not null,
  reason_code text,
  metadata jsonb not null default '{}'::jsonb,
  ip_hash text,
  created_at timestamptz not null default now(),
  constraint host_whatsapp_audit_action_check
    check (action in (
      'settings_seeded',
      'otp_requested',
      'otp_failed',
      'otp_verified',
      'phone_changed',
      'consent_granted',
      'alerts_enabled',
      'alerts_disabled',
      'test_message_blocked'
    )),
  constraint host_whatsapp_audit_actor_check
    check (actor_type in ('host', 'onboarding', 'system')),
  constraint host_whatsapp_audit_outcome_check
    check (outcome in ('success', 'failure', 'blocked'))
);

create index if not exists host_whatsapp_audit_host_created_idx
  on public.host_whatsapp_audit_log(host_user_id, created_at desc);

create table if not exists public.host_property_preference_audit_log (
  id uuid primary key default gen_random_uuid(),
  host_user_id uuid not null references public.users(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  preference text not null,
  old_value jsonb,
  new_value jsonb not null,
  source text not null default 'dashboard',
  ip_hash text,
  created_at timestamptz not null default now(),
  constraint host_property_preference_name_check
    check (preference = 'booking_requires_host_approval'),
  constraint host_property_preference_source_check
    check (source in ('dashboard', 'onboarding', 'system'))
);

create index if not exists host_property_preference_audit_family_created_idx
  on public.host_property_preference_audit_log(family_id, created_at desc);

create or replace function public.set_host_whatsapp_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists host_whatsapp_settings_set_updated_at
  on public.host_whatsapp_settings;
create trigger host_whatsapp_settings_set_updated_at
before update on public.host_whatsapp_settings
for each row execute function public.set_host_whatsapp_updated_at();

drop trigger if exists host_whatsapp_otp_set_updated_at
  on public.host_whatsapp_otp_challenges;
create trigger host_whatsapp_otp_set_updated_at
before update on public.host_whatsapp_otp_challenges
for each row execute function public.set_host_whatsapp_updated_at();

alter table public.host_whatsapp_settings enable row level security;
alter table public.host_whatsapp_otp_challenges enable row level security;
alter table public.host_whatsapp_audit_log enable row level security;
alter table public.host_property_preference_audit_log enable row level security;

revoke all on table public.host_whatsapp_settings from anon, authenticated;
revoke all on table public.host_whatsapp_otp_challenges from anon, authenticated;
revoke all on table public.host_whatsapp_audit_log from anon, authenticated;
revoke all on table public.host_property_preference_audit_log from anon, authenticated;

grant select, insert, update on table public.host_whatsapp_settings to service_role;
grant select, insert, update on table public.host_whatsapp_otp_challenges to service_role;
grant select, insert on table public.host_whatsapp_audit_log to service_role;
grant select, insert on table public.host_property_preference_audit_log to service_role;

with canonical_hosts as (
  select distinct on (h.user_id)
    h.user_id as host_user_id,
    h.legacy_family_id,
    h.created_at
  from public.hosts h
  where h.user_id is not null
  order by h.user_id, h.created_at asc, h.id asc
),
auth_phone as (
  select
    au.id as host_user_id,
    case
      when regexp_replace(coalesce(au.phone, ''), '[^0-9]', '', 'g') ~ '^91[0-9]{10}$'
        then '+' || regexp_replace(au.phone, '[^0-9]', '', 'g')
      when regexp_replace(coalesce(au.phone, ''), '[^0-9]', '', 'g') ~ '^[0-9]{10}$'
        then '+91' || regexp_replace(au.phone, '[^0-9]', '', 'g')
      else null
    end as phone_e164,
    au.phone_confirmed_at
  from auth.users au
),
public_phone as (
  select
    u.id as host_user_id,
    case
      when regexp_replace(coalesce(u.phone, ''), '[^0-9]', '', 'g') ~ '^91[0-9]{10}$'
        then '+' || regexp_replace(u.phone, '[^0-9]', '', 'g')
      when regexp_replace(coalesce(u.phone, ''), '[^0-9]', '', 'g') ~ '^[0-9]{10}$'
        then '+91' || regexp_replace(u.phone, '[^0-9]', '', 'g')
      else null
    end as phone_e164
  from public.users u
),
family_phone as (
  select distinct on (f.user_id)
    f.user_id as host_user_id,
    case
      when regexp_replace(coalesce(f.host_phone, ''), '[^0-9]', '', 'g') ~ '^91[0-9]{10}$'
        then '+' || regexp_replace(f.host_phone, '[^0-9]', '', 'g')
      when regexp_replace(coalesce(f.host_phone, ''), '[^0-9]', '', 'g') ~ '^[0-9]{10}$'
        then '+91' || regexp_replace(f.host_phone, '[^0-9]', '', 'g')
      else null
    end as phone_e164
  from public.families f
  where f.user_id is not null and f.host_phone is not null
  order by f.user_id, f.updated_at desc nulls last, f.id
),
application_phone as (
  select distinct on (f.user_id)
    f.user_id as host_user_id,
    case
      when regexp_replace(coalesce(fa.whatsapp_number, fa.phone, ''), '[^0-9]', '', 'g') ~ '^91[0-9]{10}$'
        then '+' || regexp_replace(coalesce(fa.whatsapp_number, fa.phone), '[^0-9]', '', 'g')
      when regexp_replace(coalesce(fa.whatsapp_number, fa.phone, ''), '[^0-9]', '', 'g') ~ '^[0-9]{10}$'
        then '+91' || regexp_replace(coalesce(fa.whatsapp_number, fa.phone), '[^0-9]', '', 'g')
      else null
    end as phone_e164
  from public.family_applications fa
  join public.families f on f.id = fa.approved_family_id
  where f.user_id is not null
  order by f.user_id, fa.updated_at desc nulls last, fa.id
),
seed as (
  select
    ch.host_user_id,
    case
      when ap.phone_e164 is not null and ap.phone_confirmed_at is not null then ap.phone_e164
      when pp.phone_e164 is not null then pp.phone_e164
      when fp.phone_e164 is not null then fp.phone_e164
      else xp.phone_e164
    end as phone_e164,
    case
      when ap.phone_e164 is not null and ap.phone_confirmed_at is not null then ap.phone_confirmed_at
      else null
    end as ownership_verified_at,
    case
      when ap.phone_e164 is not null and ap.phone_confirmed_at is not null then 'auth_phone_verified'
      when pp.phone_e164 is not null then 'users_phone'
      when fp.phone_e164 is not null then 'families_host_phone'
      when xp.phone_e164 is not null then 'family_application'
      else 'unknown'
    end as source
  from canonical_hosts ch
  left join auth_phone ap on ap.host_user_id = ch.host_user_id
  left join public_phone pp on pp.host_user_id = ch.host_user_id
  left join family_phone fp on fp.host_user_id = ch.host_user_id
  left join application_phone xp on xp.host_user_id = ch.host_user_id
)
insert into public.host_whatsapp_settings (
  host_user_id,
  phone_e164,
  phone_country_code,
  enabled,
  ownership_verified_at,
  opted_in_at,
  source
)
select
  seed.host_user_id,
  seed.phone_e164,
  case when seed.phone_e164 like '+91%' then '+91' else null end,
  false,
  seed.ownership_verified_at,
  null,
  seed.source
from seed
on conflict (host_user_id) do nothing;

insert into public.host_whatsapp_audit_log (
  host_user_id,
  action,
  actor_type,
  phone_masked,
  outcome,
  reason_code,
  metadata
)
select
  settings.host_user_id,
  'settings_seeded',
  'system',
  case
    when settings.phone_e164 is null then null
    else left(settings.phone_e164, 3) || repeat('*', greatest(length(settings.phone_e164) - 7, 4)) || right(settings.phone_e164, 4)
  end,
  'success',
  settings.source,
  jsonb_build_object('verified', settings.ownership_verified_at is not null)
from public.host_whatsapp_settings settings
where not exists (
  select 1
  from public.host_whatsapp_audit_log existing
  where existing.host_user_id = settings.host_user_id
    and existing.action = 'settings_seeded'
);

commit;
