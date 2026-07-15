-- Expose marketplace/trust state in public discovery and keep Pro-only properties out of public search.
-- Depends on 20260611000001_dual_path_host_marketplace_pro_policy.sql.

alter table if exists public.family_applications
  add column if not exists property_marketplace_status text not null default 'under_review',
  add column if not exists trust_status text not null default 'normal',
  add column if not exists marketplace_review_reason text null,
  add column if not exists marketplace_reviewed_at timestamptz null;

do $$
begin
  if to_regclass('public.family_applications') is not null and not exists (
    select 1 from pg_constraint where conname = 'family_applications_property_marketplace_status_check'
  ) then
    alter table public.family_applications
      add constraint family_applications_property_marketplace_status_check
      check (property_marketplace_status in ('draft', 'submitted', 'under_review', 'approved', 'not_listed', 'rejected'));
  end if;

  if to_regclass('public.family_applications') is not null and not exists (
    select 1 from pg_constraint where conname = 'family_applications_trust_status_check'
  ) then
    alter table public.family_applications
      add constraint family_applications_trust_status_check
      check (trust_status in ('normal', 'review', 'blocked'));
  end if;
end $$;

update public.family_applications fa
set property_marketplace_status =
  case
    when fa.status = 'approved' then 'approved'
    when fa.status = 'rejected' then 'not_listed'
    else 'under_review'
  end
where fa.property_marketplace_status = 'under_review';

create index if not exists family_applications_marketplace_trust_idx
  on public.family_applications (property_marketplace_status, trust_status);

create or replace view public.public_home_cards_v1 as
select
  h.id,
  h.user_id,
  h.legacy_family_id,
  h.slug,
  h.status,
  coalesce(h.property_marketplace_status, f.property_marketplace_status, 'under_review') as property_marketplace_status,
  coalesce(h.trust_status, f.trust_status, 'normal') as trust_status,
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
left join public.families f on f.id = h.legacy_family_id
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
) units on true
where h.status = 'published'
  and coalesce(h.property_marketplace_status, f.property_marketplace_status, 'under_review') = 'approved'
  and coalesce(h.trust_status, f.trust_status, 'normal') <> 'blocked';

notify pgrst, 'reload schema';
