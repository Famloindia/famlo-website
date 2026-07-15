create table if not exists public.host_property_reels (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  host_id uuid references public.hosts(id) on delete cascade,
  r2_key text,
  public_url text not null,
  title text,
  caption text,
  mime_type text not null,
  size_bytes bigint,
  duration_seconds numeric(10,2),
  is_featured boolean not null default false,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint host_property_reels_status_check check (
    status in ('draft', 'active', 'archived', 'deleted')
  )
);

create index if not exists host_property_reels_family_idx
  on public.host_property_reels (family_id, is_featured desc, created_at desc);

create index if not exists host_property_reels_host_idx
  on public.host_property_reels (host_id, is_featured desc, created_at desc);

create table if not exists public.host_gst_profiles (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.hosts(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  family_id uuid references public.families(id) on delete set null,
  gstin text,
  verification_status text not null default 'not_provided',
  rejection_reason text,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint host_gst_profiles_status_check check (
    verification_status in ('not_provided', 'pending_review', 'verified', 'rejected')
  )
);

create unique index if not exists host_gst_profiles_host_uidx
  on public.host_gst_profiles (host_id);

create unique index if not exists host_gst_profiles_user_uidx
  on public.host_gst_profiles (user_id);

create index if not exists host_gst_profiles_family_idx
  on public.host_gst_profiles (family_id, verification_status);

alter table public.family_photos
  add column if not exists image_url text;

alter table public.family_photos
  add column if not exists storage_path text;

alter table public.family_photos
  add column if not exists caption text;

alter table public.family_photos
  add column if not exists sort_order integer not null default 0;

alter table public.family_photos
  add column if not exists updated_at timestamptz not null default now();

alter table public.family_photos enable row level security;
alter table public.host_property_reels enable row level security;
alter table public.host_gst_profiles enable row level security;

drop policy if exists "family_photos_host_owner_select" on public.family_photos;
create policy "family_photos_host_owner_select"
on public.family_photos
for select
to authenticated
using (
  exists (
    select 1
    from public.families f
    where f.id = family_photos.family_id
      and f.user_id = auth.uid()
  )
  or exists (
    select 1
    from public.hosts h
    where h.legacy_family_id = family_photos.family_id
      and h.user_id = auth.uid()
  )
);

drop policy if exists "family_photos_host_owner_insert" on public.family_photos;
create policy "family_photos_host_owner_insert"
on public.family_photos
for insert
to authenticated
with check (
  exists (
    select 1
    from public.families f
    where f.id = family_photos.family_id
      and f.user_id = auth.uid()
  )
  or exists (
    select 1
    from public.hosts h
    where h.legacy_family_id = family_photos.family_id
      and h.user_id = auth.uid()
  )
);

drop policy if exists "family_photos_host_owner_update" on public.family_photos;
create policy "family_photos_host_owner_update"
on public.family_photos
for update
to authenticated
using (
  exists (
    select 1
    from public.families f
    where f.id = family_photos.family_id
      and f.user_id = auth.uid()
  )
  or exists (
    select 1
    from public.hosts h
    where h.legacy_family_id = family_photos.family_id
      and h.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.families f
    where f.id = family_photos.family_id
      and f.user_id = auth.uid()
  )
  or exists (
    select 1
    from public.hosts h
    where h.legacy_family_id = family_photos.family_id
      and h.user_id = auth.uid()
  )
);

drop policy if exists "family_photos_host_owner_delete" on public.family_photos;
create policy "family_photos_host_owner_delete"
on public.family_photos
for delete
to authenticated
using (
  exists (
    select 1
    from public.families f
    where f.id = family_photos.family_id
      and f.user_id = auth.uid()
  )
  or exists (
    select 1
    from public.hosts h
    where h.legacy_family_id = family_photos.family_id
      and h.user_id = auth.uid()
  )
);

drop policy if exists "host_property_reels_host_owner_select" on public.host_property_reels;
create policy "host_property_reels_host_owner_select"
on public.host_property_reels
for select
to authenticated
using (
  exists (
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
  exists (
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
  exists (
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
  exists (
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
  exists (
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

drop policy if exists "host_gst_profiles_owner_select" on public.host_gst_profiles;
create policy "host_gst_profiles_owner_select"
on public.host_gst_profiles
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "host_gst_profiles_owner_insert" on public.host_gst_profiles;
create policy "host_gst_profiles_owner_insert"
on public.host_gst_profiles
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "host_gst_profiles_owner_update" on public.host_gst_profiles;
create policy "host_gst_profiles_owner_update"
on public.host_gst_profiles
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create or replace view public.public_home_cards_v1 as
select
  h.id,
  h.user_id,
  h.legacy_family_id,
  h.slug,
  h.status,
  h.display_name,
  h.city,
  h.state,
  h.locality,
  h.about,
  h.family_story,
  h.house_rules,
  h.amenities,
  h.bathroom_type,
  h.max_guests,
  h.price_morning,
  h.price_afternoon,
  h.price_evening,
  h.price_fullday,
  h.is_accepting,
  h.active_quarters,
  h.blocked_dates,
  h.platform_commission_pct,
  null::boolean as booking_requires_host_approval,
  h.lat,
  h.lng,
  h.lat_exact,
  h.lng_exact,
  h.landmarks,
  h.neighborhood_desc,
  h.accessibility_desc,
  null::text as admin_notes,
  h.is_featured,
  coalesce(family_media.primary_photo_url, media.primary_photo_url, null) as host_photo_url,
  coalesce(family_media.image_urls, media.image_urls, '{}'::text[]) as image_urls,
  coalesce(units.room_image_urls, '{}'::text[]) as room_image_urls,
  units.room_count,
  units.starting_room_price
from public.hosts h
left join lateral (
  select
    (array_agg(fp.url order by fp.is_primary desc, fp.sort_order asc, fp.created_at asc))[1] as primary_photo_url,
    array_agg(fp.url order by fp.is_primary desc, fp.sort_order asc, fp.created_at asc) as image_urls
  from public.family_photos fp
  where fp.family_id = h.legacy_family_id
) family_media on true
left join lateral (
  select
    (array_agg(hm.media_url order by hm.is_primary desc, hm.sort_order asc, hm.created_at asc))[1] as primary_photo_url,
    array_agg(hm.media_url order by hm.is_primary desc, hm.sort_order asc, hm.created_at asc) as image_urls
  from public.host_media hm
  where hm.host_id = h.id
) media on true
left join lateral (
  select
    count(*) filter (
      where su.is_active = true
        and (
          coalesce(su.price_fullday, 0) > 0 or
          coalesce(su.price_morning, 0) > 0 or
          coalesce(su.price_afternoon, 0) > 0 or
          coalesce(su.price_evening, 0) > 0 or
          coalesce(array_length(su.photos, 1), 0) > 0 or
          coalesce(length(nullif(su.name, '')), 0) > 0 or
          coalesce(length(nullif(su.description, '')), 0) > 0 or
          coalesce(length(nullif(su.unit_type, '')), 0) > 0
        )
    )::integer as room_count,
    (
      select min(price)::numeric(10,2)
      from (
        select nullif(coalesce(su4.price_fullday, 0), 0) as price
        from public.stay_units_v2 su4
        where su4.host_id = h.id and su4.is_active = true
        union all
        select nullif(coalesce(su4.price_morning, 0), 0) as price
        from public.stay_units_v2 su4
        where su4.host_id = h.id and su4.is_active = true
        union all
        select nullif(coalesce(su4.price_afternoon, 0), 0) as price
        from public.stay_units_v2 su4
        where su4.host_id = h.id and su4.is_active = true
        union all
        select nullif(coalesce(su4.price_evening, 0), 0) as price
        from public.stay_units_v2 su4
        where su4.host_id = h.id and su4.is_active = true
      ) prices
      where price is not null
    ) as starting_room_price,
    array(
      select distinct photo
      from (
        select unnest(coalesce(su2.photos, '{}'::text[])) as photo
        from public.stay_units_v2 su2
        where su2.host_id = h.id and su2.is_active = true
      ) images
      where photo is not null and length(trim(photo)) > 0
    ) as room_image_urls
  from public.stay_units_v2 su
  where su.host_id = h.id
) units on true;

notify pgrst, 'reload schema';
