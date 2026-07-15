-- Dual-path host model: marketplace listing approval and Famlo Pro SaaS access are separate states.
-- This migration is additive and preserves existing approved/listed and active Pro data.

alter table if exists public.families
  add column if not exists property_marketplace_status text not null default 'under_review',
  add column if not exists trust_status text not null default 'normal',
  add column if not exists marketplace_review_reason text null,
  add column if not exists marketplace_reviewed_at timestamptz null;

alter table if exists public.hosts
  add column if not exists property_marketplace_status text not null default 'under_review',
  add column if not exists trust_status text not null default 'normal',
  add column if not exists marketplace_review_reason text null,
  add column if not exists marketplace_reviewed_at timestamptz null;

alter table if exists public.host_onboarding_drafts
  add column if not exists property_marketplace_status text not null default 'draft',
  add column if not exists trust_status text not null default 'normal',
  add column if not exists marketplace_review_reason text null,
  add column if not exists marketplace_reviewed_at timestamptz null;

do $$
begin
  if to_regclass('public.families') is not null and not exists (
    select 1 from pg_constraint where conname = 'families_property_marketplace_status_check'
  ) then
    alter table public.families
      add constraint families_property_marketplace_status_check
      check (property_marketplace_status in ('draft', 'submitted', 'under_review', 'approved', 'not_listed', 'rejected'));
  end if;

  if to_regclass('public.families') is not null and not exists (
    select 1 from pg_constraint where conname = 'families_trust_status_check'
  ) then
    alter table public.families
      add constraint families_trust_status_check
      check (trust_status in ('normal', 'review', 'blocked'));
  end if;

  if to_regclass('public.hosts') is not null and not exists (
    select 1 from pg_constraint where conname = 'hosts_property_marketplace_status_check'
  ) then
    alter table public.hosts
      add constraint hosts_property_marketplace_status_check
      check (property_marketplace_status in ('draft', 'submitted', 'under_review', 'approved', 'not_listed', 'rejected'));
  end if;

  if to_regclass('public.hosts') is not null and not exists (
    select 1 from pg_constraint where conname = 'hosts_trust_status_check'
  ) then
    alter table public.hosts
      add constraint hosts_trust_status_check
      check (trust_status in ('normal', 'review', 'blocked'));
  end if;

  if to_regclass('public.host_onboarding_drafts') is not null and not exists (
    select 1 from pg_constraint where conname = 'host_onboarding_drafts_property_marketplace_status_check'
  ) then
    alter table public.host_onboarding_drafts
      add constraint host_onboarding_drafts_property_marketplace_status_check
      check (property_marketplace_status in ('draft', 'submitted', 'under_review', 'approved', 'not_listed', 'rejected'));
  end if;

  if to_regclass('public.host_onboarding_drafts') is not null and not exists (
    select 1 from pg_constraint where conname = 'host_onboarding_drafts_trust_status_check'
  ) then
    alter table public.host_onboarding_drafts
      add constraint host_onboarding_drafts_trust_status_check
      check (trust_status in ('normal', 'review', 'blocked'));
  end if;
end $$;

update public.host_onboarding_drafts
set property_marketplace_status =
  case
    when listing_status in ('approved', 'live', 'published') then 'approved'
    when listing_status in ('submitted', 'conditional_pending') then 'under_review'
    when listing_status in ('rejected') then 'not_listed'
    when listing_status in ('paused') then 'not_listed'
    else 'draft'
  end
where property_marketplace_status = 'draft';

update public.hosts
set property_marketplace_status =
  case
    when status = 'published' then 'approved'
    when status = 'paused' then 'not_listed'
    when status = 'draft' then 'draft'
    else 'under_review'
  end
where property_marketplace_status = 'under_review';

update public.families f
set property_marketplace_status = 'approved'
where f.property_marketplace_status = 'under_review'
  and exists (
    select 1
    from public.hosts h
    where h.legacy_family_id = f.id
      and h.status = 'published'
  );

update public.families f
set property_marketplace_status = 'not_listed'
where f.property_marketplace_status = 'under_review'
  and exists (
    select 1
    from public.hosts h
    where h.legacy_family_id = f.id
      and h.status = 'paused'
  );

update public.hosts h
set trust_status = f.trust_status
from public.families f
where h.legacy_family_id = f.id
  and h.trust_status = 'normal'
  and f.trust_status <> 'normal';

create index if not exists families_marketplace_trust_idx
  on public.families (property_marketplace_status, trust_status);

create index if not exists hosts_marketplace_trust_idx
  on public.hosts (property_marketplace_status, trust_status);

create index if not exists host_onboarding_drafts_marketplace_trust_idx
  on public.host_onboarding_drafts (property_marketplace_status, trust_status);

notify pgrst, 'reload schema';
