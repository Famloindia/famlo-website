drop view if exists public.public_home_cards_v1;
drop view if exists public.public_home_rooms_v1;

alter table public.stay_units_v2
  alter column price_morning type numeric(10,2) using price_morning::numeric(10,2),
  alter column price_afternoon type numeric(10,2) using price_afternoon::numeric(10,2),
  alter column price_evening type numeric(10,2) using price_evening::numeric(10,2),
  alter column price_fullday type numeric(10,2) using price_fullday::numeric(10,2);

alter table public.inventory_day_projection
  alter column base_rate type numeric(10,2) using base_rate::numeric(10,2),
  alter column effective_rate type numeric(10,2) using effective_rate::numeric(10,2);

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
  coalesce(media.primary_photo_url, null) as host_photo_url,
  coalesce(media.image_urls, '{}'::text[]) as image_urls,
  coalesce(units.room_image_urls, '{}'::text[]) as room_image_urls,
  units.room_count,
  units.starting_room_price
from public.hosts h
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

create or replace view public.public_home_rooms_v1 as
select
  su.id as stay_unit_id,
  su.host_id,
  su.legacy_family_id as family_id,
  su.unit_key,
  su.name,
  su.unit_type,
  su.description,
  su.max_guests,
  su.bed_info,
  su.bathroom_type,
  su.room_size_sqm,
  su.lat,
  su.lng,
  su.price_morning,
  su.price_afternoon,
  su.price_evening,
  su.price_fullday,
  su.quarter_enabled,
  su.is_active,
  su.is_primary,
  coalesce(su.amenities, '{}'::text[]) as amenities,
  coalesce(su.photos, '{}'::text[]) as photos,
  coalesce(su.locality_photos, '{}'::text[]) as locality_photos,
  su.sort_order,
  su.created_at,
  su.updated_at,
  h.slug as host_slug,
  h.display_name as host_display_name,
  f.name as family_name,
  f.city,
  f.state,
  f.village
from public.stay_units_v2 su
left join public.hosts h on h.id = su.host_id
left join public.families f on f.id = su.legacy_family_id;

notify pgrst, 'reload schema';
