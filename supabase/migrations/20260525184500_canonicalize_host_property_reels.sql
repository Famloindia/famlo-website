create extension if not exists pgcrypto;

create table if not exists public.host_property_reels (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  host_id uuid references public.hosts(id) on delete cascade,
  user_id uuid references public.users(id) on delete set null,
  storage_key text not null,
  public_url text,
  mime_type text,
  size_bytes bigint,
  duration_seconds numeric(10,2),
  width integer,
  height integer,
  is_featured boolean not null default false,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint host_property_reels_status_check check (
    status in ('draft', 'active', 'inactive', 'archived', 'deleted')
  )
);

alter table public.host_property_reels
  add column if not exists host_id uuid references public.hosts(id) on delete cascade;

alter table public.host_property_reels
  add column if not exists user_id uuid references public.users(id) on delete set null;

alter table public.host_property_reels
  add column if not exists storage_key text;

alter table public.host_property_reels
  add column if not exists public_url text;

alter table public.host_property_reels
  add column if not exists mime_type text;

alter table public.host_property_reels
  add column if not exists size_bytes bigint;

alter table public.host_property_reels
  add column if not exists duration_seconds numeric(10,2);

alter table public.host_property_reels
  add column if not exists width integer;

alter table public.host_property_reels
  add column if not exists height integer;

alter table public.host_property_reels
  add column if not exists is_featured boolean not null default false;

alter table public.host_property_reels
  add column if not exists status text not null default 'active';

alter table public.host_property_reels
  add column if not exists created_at timestamptz not null default now();

alter table public.host_property_reels
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'host_property_reels'
      and column_name = 'r2_key'
  ) then
    execute $sql$
      update public.host_property_reels
      set storage_key = coalesce(
        nullif(storage_key, ''),
        nullif(r2_key, ''),
        nullif(regexp_replace(coalesce(public_url, ''), '^https?://[^/]+/', ''), '')
      )
      where storage_key is null or storage_key = ''
    $sql$;
  else
    update public.host_property_reels
    set storage_key = coalesce(
      nullif(storage_key, ''),
      nullif(regexp_replace(coalesce(public_url, ''), '^https?://[^/]+/', ''), '')
    )
    where storage_key is null or storage_key = '';
  end if;
end
$$;

update public.host_property_reels as reel
set
  host_id = coalesce(reel.host_id, host.id),
  user_id = coalesce(reel.user_id, host.user_id, family.user_id),
  mime_type = coalesce(nullif(reel.mime_type, ''), 'video/mp4'),
  updated_at = coalesce(reel.updated_at, reel.created_at, now())
from public.families as family
left join public.hosts as host
  on host.legacy_family_id = family.id
where family.id = reel.family_id;

update public.host_property_reels
set storage_key = concat('legacy-reels/', family_id::text, '/', id::text, '.mp4')
where storage_key is null or storage_key = '';

alter table public.host_property_reels
  alter column storage_key set not null;

alter table public.host_property_reels
  alter column public_url drop not null;

create or replace function public.set_host_property_reels_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists host_property_reels_set_updated_at on public.host_property_reels;
create trigger host_property_reels_set_updated_at
before update on public.host_property_reels
for each row
execute function public.set_host_property_reels_updated_at();

create index if not exists host_property_reels_family_idx
  on public.host_property_reels (family_id, is_featured desc, created_at desc);

create index if not exists host_property_reels_host_idx
  on public.host_property_reels (host_id, is_featured desc, created_at desc);

create index if not exists host_property_reels_user_idx
  on public.host_property_reels (user_id, is_featured desc, created_at desc);

create index if not exists host_property_reels_active_family_idx
  on public.host_property_reels (family_id, status, created_at desc);

alter table public.host_property_reels enable row level security;

drop policy if exists "host_property_reels_host_owner_select" on public.host_property_reels;
create policy "host_property_reels_host_owner_select"
on public.host_property_reels
for select
to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.hosts h
    where h.id = host_property_reels.host_id
      and h.user_id = auth.uid()
  )
  or exists (
    select 1
    from public.families f
    where f.id = host_property_reels.family_id
      and f.user_id = auth.uid()
  )
);

drop policy if exists "host_property_reels_host_owner_insert" on public.host_property_reels;
create policy "host_property_reels_host_owner_insert"
on public.host_property_reels
for insert
to authenticated
with check (
  user_id = auth.uid()
  or exists (
    select 1
    from public.hosts h
    where h.id = host_property_reels.host_id
      and h.user_id = auth.uid()
  )
  or exists (
    select 1
    from public.families f
    where f.id = host_property_reels.family_id
      and f.user_id = auth.uid()
  )
);

drop policy if exists "host_property_reels_host_owner_update" on public.host_property_reels;
create policy "host_property_reels_host_owner_update"
on public.host_property_reels
for update
to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.hosts h
    where h.id = host_property_reels.host_id
      and h.user_id = auth.uid()
  )
  or exists (
    select 1
    from public.families f
    where f.id = host_property_reels.family_id
      and f.user_id = auth.uid()
  )
)
with check (
  user_id = auth.uid()
  or exists (
    select 1
    from public.hosts h
    where h.id = host_property_reels.host_id
      and h.user_id = auth.uid()
  )
  or exists (
    select 1
    from public.families f
    where f.id = host_property_reels.family_id
      and f.user_id = auth.uid()
  )
);

drop policy if exists "host_property_reels_host_owner_delete" on public.host_property_reels;
create policy "host_property_reels_host_owner_delete"
on public.host_property_reels
for delete
to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.hosts h
    where h.id = host_property_reels.host_id
      and h.user_id = auth.uid()
  )
  or exists (
    select 1
    from public.families f
    where f.id = host_property_reels.family_id
      and f.user_id = auth.uid()
  )
);
