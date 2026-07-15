alter table public.stay_units_v2
  add column if not exists lat double precision,
  add column if not exists lng double precision,
  add column if not exists locality_photos text[] not null default '{}'::text[];

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
