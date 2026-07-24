-- Canonical host identity and property listing content.
-- Host identity lives on users; property content lives on families.

alter table public.users
  add column if not exists host_hobbies text[] not null default '{}'::text[],
  add column if not exists host_languages text[] not null default '{}'::text[],
  add column if not exists host_profile_version integer not null default 0;

alter table public.families
  add column if not exists admin_notes text,
  add column if not exists street_address text,
  add column if not exists languages text[] default '{}'::text[],
  add column if not exists languages_spoken text[] default '{}'::text[],
  add column if not exists property_name text,
  add column if not exists listing_title text,
  add column if not exists journey_story text,
  add column if not exists special_experience text,
  add column if not exists local_experience text,
  add column if not exists interaction_type text,
  add column if not exists house_type text,
  add column if not exists house_rules text[] not null default '{}'::text[],
  add column if not exists common_areas text[] not null default '{}'::text[],
  add column if not exists included_items text[] not null default '{}'::text[],
  add column if not exists food_types text[] not null default '{}'::text[],
  add column if not exists check_in_time text,
  add column if not exists check_out_time text,
  add column if not exists nearby_places jsonb not null default '[]'::jsonb,
  add column if not exists family_composition text,
  add column if not exists family_type text,
  add column if not exists host_family_type text,
  add column if not exists listing_profile_version integer not null default 0;

create or replace function public.famlo_safe_listing_meta(value text)
returns jsonb
language plpgsql
immutable
as $$
begin
  if value is null or value not like 'FAMLO_META::%' then
    return '{}'::jsonb;
  end if;
  return substring(value from 13)::jsonb;
exception when others then
  return '{}'::jsonb;
end;
$$;

create or replace function public.famlo_jsonb_text_array(value jsonb)
returns text[]
language sql
immutable
as $$
  select case
    when value is null then '{}'::text[]
    when jsonb_typeof(value) = 'array' then coalesce(
      (select array_agg(trim(item) order by ordinal)
       from jsonb_array_elements_text(value) with ordinality as entries(item, ordinal)
       where trim(item) <> ''),
      '{}'::text[]
    )
    when jsonb_typeof(value) = 'string' then coalesce(
      (select array_agg(trim(item) order by ordinal)
       from unnest(regexp_split_to_array(trim(both '"' from value::text), E'[,\\n]')) with ordinality as entries(item, ordinal)
       where trim(item) <> ''),
      '{}'::text[]
    )
    else '{}'::text[]
  end;
$$;

create or replace function public.famlo_normalize_text_array(value text[])
returns text[]
language sql
immutable
as $$
  select coalesce(array_agg(item order by first_ordinal), '{}'::text[])
  from (
    select
      lower(trim(item)) as normalized,
      (array_agg(trim(item) order by ordinal))[1] as item,
      min(ordinal) as first_ordinal
    from unnest(coalesce(value, '{}'::text[])) with ordinality as entries(item, ordinal)
    where trim(item) <> ''
    group by lower(trim(item))
  ) normalized_items;
$$;

create or replace function public.famlo_normalize_listing_time(value text)
returns text
language plpgsql
immutable
as $$
declare
  normalized text := upper(trim(value));
  hours integer;
  minutes integer;
  period text;
begin
  if normalized is null or normalized = '' then
    return null;
  end if;
  if normalized ~ '^([0-9]{1,2}):([0-9]{2})(:[0-9]{2})?[[:space:]]*(AM|PM)$' then
    hours := split_part(normalized, ':', 1)::integer;
    minutes := substring(normalized from '^[0-9]{1,2}:([0-9]{2})')::integer;
    period := substring(normalized from '(AM|PM)$');
    if hours < 1 or hours > 12 or minutes > 59 then return null; end if;
    if period = 'AM' and hours = 12 then hours := 0; end if;
    if period = 'PM' and hours <> 12 then hours := hours + 12; end if;
    return lpad(hours::text, 2, '0') || ':' || lpad(minutes::text, 2, '0');
  end if;
  if normalized ~ '^([0-9]{1,2}):([0-9]{2})(:[0-9]{2}(\.[0-9]+)?)?$' then
    hours := split_part(normalized, ':', 1)::integer;
    minutes := split_part(normalized, ':', 2)::integer;
    if hours > 23 or minutes > 59 then return null; end if;
    return lpad(hours::text, 2, '0') || ':' || lpad(minutes::text, 2, '0');
  end if;
  return null;
end;
$$;

create or replace function public.update_host_property_listing_profile(
  p_family_id uuid,
  p_identity jsonb default '{}'::jsonb,
  p_property jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_user_id uuid;
begin
  select user_id into owner_user_id
  from public.families
  where id = p_family_id
  for update;

  if owner_user_id is null then
    raise exception 'Property owner was not found.';
  end if;

  update public.users
  set
    name = case when p_identity ? 'displayName' then nullif(trim(p_identity ->> 'displayName'), '') else name end,
    avatar_url = case when p_identity ? 'profilePhotoUrl' then nullif(trim(p_identity ->> 'profilePhotoUrl'), '') else avatar_url end,
    host_hobbies = case when p_identity ? 'hobbies' then public.famlo_jsonb_text_array(p_identity -> 'hobbies') else host_hobbies end,
    host_languages = case when p_identity ? 'languages' then public.famlo_jsonb_text_array(p_identity -> 'languages') else host_languages end,
    about = case when p_identity ? 'biography' then nullif(trim(p_identity ->> 'biography'), '') else about end,
    host_profile_version = 1,
    updated_at = now()
  where id = owner_user_id;

  update public.families
  set
    property_name = case when p_property ? 'propertyName' then nullif(trim(p_property ->> 'propertyName'), '') else property_name end,
    listing_title = case when p_property ? 'listingTitle' then nullif(trim(p_property ->> 'listingTitle'), '') else listing_title end,
    about = case when p_property ? 'hostBio' then nullif(trim(p_property ->> 'hostBio'), '') else about end,
    description = case when p_property ? 'hostBio' then nullif(trim(p_property ->> 'hostBio'), '') else description end,
    city = case when p_property ? 'city' then nullif(trim(p_property ->> 'city'), '') else city end,
    state = case when p_property ? 'state' then nullif(trim(p_property ->> 'state'), '') else state end,
    village = case when p_property ? 'locality' then nullif(trim(p_property ->> 'locality'), '') else village end,
    journey_story = case when p_property ? 'journeyStory' then nullif(trim(p_property ->> 'journeyStory'), '') else journey_story end,
    special_experience = case when p_property ? 'specialExperience' then nullif(trim(p_property ->> 'specialExperience'), '') else special_experience end,
    local_experience = case when p_property ? 'localExperience' then nullif(trim(p_property ->> 'localExperience'), '') else local_experience end,
    famlo_experience = case when p_property ? 'culturalOffering' then nullif(trim(p_property ->> 'culturalOffering'), '') else famlo_experience end,
    house_type = case when p_property ? 'homeType' then nullif(trim(p_property ->> 'homeType'), '') else house_type end,
    interaction_type = case when p_property ? 'interactionType' then nullif(trim(p_property ->> 'interactionType'), '') else interaction_type end,
    house_rules = case when p_property ? 'houseRules' then public.famlo_jsonb_text_array(p_property -> 'houseRules') else house_rules end,
    amenities = case when p_property ? 'amenities' then public.famlo_jsonb_text_array(p_property -> 'amenities') else amenities end,
    food_types = case when p_property ? 'foodTypes' then public.famlo_jsonb_text_array(p_property -> 'foodTypes') else food_types end,
    included_items = case when p_property ? 'includedItems' then public.famlo_jsonb_text_array(p_property -> 'includedItems') else included_items end,
    bathroom_type = case when p_property ? 'bathroomType' then nullif(trim(p_property ->> 'bathroomType'), '') else bathroom_type end,
    check_in_time = case when p_property ? 'checkInTime' then public.famlo_normalize_listing_time(p_property ->> 'checkInTime') else check_in_time end,
    check_out_time = case when p_property ? 'checkOutTime' then public.famlo_normalize_listing_time(p_property ->> 'checkOutTime') else check_out_time end,
    common_areas = case when p_property ? 'commonAreas' then public.famlo_jsonb_text_array(p_property -> 'commonAreas') else common_areas end,
    street_address = case when p_property ? 'streetAddress' then nullif(trim(p_property ->> 'streetAddress'), '') else street_address end,
    google_maps_link = case when p_property ? 'googleMapsLink' then nullif(trim(p_property ->> 'googleMapsLink'), '') else google_maps_link end,
    nearby_places = case
      when p_property ? 'nearbyPlaces' and jsonb_typeof(p_property -> 'nearbyPlaces') = 'array' then p_property -> 'nearbyPlaces'
      when p_property ? 'nearbyPlaces' then '[]'::jsonb
      else nearby_places
    end,
    neighborhood_desc = case when p_property ? 'neighborhoodDescription' then nullif(trim(p_property ->> 'neighborhoodDescription'), '') else neighborhood_desc end,
    accessibility_desc = case when p_property ? 'accessibilityDescription' then nullif(trim(p_property ->> 'accessibilityDescription'), '') else accessibility_desc end,
    pincode = case when p_property ? 'pincode' then nullif(trim(p_property ->> 'pincode'), '') else pincode end,
    host_family_type = case when p_property ? 'familyType' then nullif(trim(p_property ->> 'familyType'), '') else host_family_type end,
    listing_profile_version = 1,
    updated_at = now()
  where id = p_family_id;
end;
$$;

revoke all on function public.update_host_property_listing_profile(uuid, jsonb, jsonb) from public;
grant execute on function public.update_host_property_listing_profile(uuid, jsonb, jsonb) to service_role;

with legacy as (
  select
    f.id,
    public.famlo_safe_listing_meta(f.admin_notes) as meta,
    coalesce(d.payload, '{}'::jsonb) as draft,
    h.address_private,
    h.house_rules as host_house_rules,
    h.common_areas as host_common_areas,
    h.amenities as host_amenities,
    h.languages as host_languages,
    h.bathroom_type as host_bathroom_type,
    h.family_composition as host_family_composition
  from public.families f
  left join public.hosts h on h.legacy_family_id = f.id
  left join lateral (
    select payload
    from public.host_onboarding_drafts
    where family_id = f.id
    order by updated_at desc
    limit 1
  ) d on true
)
update public.families f
set
  property_name = coalesce(nullif(f.property_name, ''), nullif(f.name, ''), nullif(legacy.draft ->> 'propertyName', '')),
  listing_title = coalesce(nullif(f.listing_title, ''), nullif(legacy.meta ->> 'listingTitle', ''), nullif(legacy.draft ->> 'listingTitle', '')),
  journey_story = coalesce(nullif(f.journey_story, ''), nullif(legacy.meta ->> 'journeyStory', ''), nullif(legacy.draft ->> 'journeyStory', '')),
  special_experience = coalesce(nullif(f.special_experience, ''), nullif(legacy.meta ->> 'specialExperience', ''), nullif(legacy.draft ->> 'specialExperience', '')),
  local_experience = coalesce(nullif(f.local_experience, ''), nullif(legacy.meta ->> 'localExperience', ''), nullif(legacy.draft ->> 'localExperience', '')),
  interaction_type = coalesce(nullif(f.interaction_type, ''), nullif(legacy.meta ->> 'interactionType', ''), nullif(legacy.draft ->> 'interactionType', '')),
  house_type = coalesce(
    case
      when lower(trim(f.house_type)) = any(array['joint family', 'nuclear family', 'couple', 'solo host', 'shared household']) then null
      else nullif(f.house_type, '')
    end,
    case
      when lower(trim(legacy.meta ->> 'houseType')) = any(array['joint family', 'nuclear family', 'couple', 'solo host', 'shared household']) then null
      else nullif(legacy.meta ->> 'houseType', '')
    end,
    nullif(legacy.draft ->> 'homeType', ''),
    case
      when lower(trim(legacy.draft ->> 'houseType')) = any(array['joint family', 'nuclear family', 'couple', 'solo host', 'shared household']) then null
      else nullif(legacy.draft ->> 'houseType', '')
    end
  ),
  house_rules = public.famlo_normalize_text_array(case
    when cardinality(f.house_rules) > 0 then f.house_rules
    when cardinality(legacy.host_house_rules) > 0 then legacy.host_house_rules
    else coalesce(
      nullif(public.famlo_jsonb_text_array(legacy.meta -> 'houseRules'), '{}'::text[]),
      public.famlo_jsonb_text_array(coalesce(legacy.draft -> 'houseRules', legacy.draft -> 'customRules'))
    )
  end),
  common_areas = public.famlo_normalize_text_array(case
    when cardinality(f.common_areas) > 0 then f.common_areas
    when cardinality(legacy.host_common_areas) > 0 then legacy.host_common_areas
    else coalesce(
      nullif(public.famlo_jsonb_text_array(legacy.meta -> 'commonAreas'), '{}'::text[]),
      public.famlo_jsonb_text_array(legacy.draft -> 'commonAreas')
    )
  end),
  amenities = public.famlo_normalize_text_array(case
    when cardinality(f.amenities) > 0 then f.amenities
    when cardinality(legacy.host_amenities) > 0 then legacy.host_amenities
    else coalesce(
      nullif(public.famlo_jsonb_text_array(legacy.meta -> 'amenities'), '{}'::text[]),
      public.famlo_jsonb_text_array(legacy.draft -> 'amenities')
    )
  end),
  included_items = public.famlo_normalize_text_array(case
    when cardinality(f.included_items) > 0 then f.included_items
    else coalesce(
      nullif(public.famlo_jsonb_text_array(legacy.meta -> 'includedItems'), '{}'::text[]),
      public.famlo_jsonb_text_array(legacy.draft -> 'includedItems')
    )
  end),
  food_types = public.famlo_normalize_text_array(case
    when cardinality(f.food_types) > 0 then f.food_types
    else coalesce(
      nullif(public.famlo_jsonb_text_array(legacy.meta -> 'foodType'), '{}'::text[]),
      public.famlo_jsonb_text_array(coalesce(legacy.draft -> 'foodTypes', legacy.draft -> 'foodType'))
    )
  end),
  bathroom_type = coalesce(nullif(f.bathroom_type, ''), nullif(legacy.host_bathroom_type, ''), nullif(legacy.meta ->> 'bathroomType', ''), nullif(legacy.draft ->> 'bathroomType', '')),
  check_in_time = public.famlo_normalize_listing_time(coalesce(nullif(f.check_in_time, ''), nullif(legacy.meta ->> 'checkInTime', ''), nullif(legacy.draft ->> 'checkInTime', ''))),
  check_out_time = public.famlo_normalize_listing_time(coalesce(nullif(f.check_out_time, ''), nullif(legacy.meta ->> 'checkOutTime', ''), nullif(legacy.draft ->> 'checkOutTime', ''))),
  street_address = coalesce(nullif(f.street_address, ''), nullif(legacy.address_private, ''), nullif(legacy.meta ->> 'propertyAddress', ''), nullif(legacy.draft ->> 'propertyAddress', '')),
  host_family_type = coalesce(
    nullif(f.host_family_type, ''),
    nullif(f.family_composition, ''),
    nullif(legacy.host_family_composition, ''),
    nullif(legacy.meta ->> 'familyComposition', ''),
    nullif(legacy.draft ->> 'familyType', ''),
    nullif(legacy.draft ->> 'familyComposition', ''),
    case
      when lower(trim(f.family_type)) = any(array['joint family', 'nuclear family', 'couple', 'solo host', 'shared household']) then f.family_type
      else null
    end,
    case
      when lower(trim(f.house_type)) = any(array['joint family', 'nuclear family', 'couple', 'solo host', 'shared household']) then f.house_type
      when lower(trim(legacy.meta ->> 'houseType')) = any(array['joint family', 'nuclear family', 'couple', 'solo host', 'shared household']) then legacy.meta ->> 'houseType'
      else null
    end
  ),
  listing_profile_version = 1
from legacy
where legacy.id = f.id
  and coalesce(f.listing_profile_version, 0) < 1;

with identity_source as (
  select distinct on (f.user_id)
    f.user_id,
    public.famlo_safe_listing_meta(f.admin_notes) as meta,
    coalesce(d.payload, '{}'::jsonb) as draft,
    coalesce(
      nullif(f.languages_spoken, '{}'::text[]),
      nullif(f.languages, '{}'::text[]),
      nullif(h.languages, '{}'::text[]),
      '{}'::text[]
    ) as languages
  from public.families f
  left join public.hosts h on h.legacy_family_id = f.id
  left join lateral (
    select payload
    from public.host_onboarding_drafts
    where family_id = f.id
    order by updated_at desc
    limit 1
  ) d on true
  where f.user_id is not null
  order by f.user_id, f.updated_at desc nulls last, f.id
)
update public.users u
set
  host_hobbies = case
    when cardinality(u.host_hobbies) > 0 then public.famlo_normalize_text_array(u.host_hobbies)
    else coalesce(
      nullif(public.famlo_jsonb_text_array(identity_source.meta -> 'hostHobbies'), '{}'::text[]),
      public.famlo_jsonb_text_array(coalesce(identity_source.draft -> 'hostHobbies', identity_source.draft -> 'hobbies'))
    )
  end,
  host_languages = case
    when cardinality(u.host_languages) > 0 then public.famlo_normalize_text_array(u.host_languages)
    else public.famlo_normalize_text_array(coalesce(
      nullif(identity_source.languages, '{}'::text[]),
      nullif(public.famlo_jsonb_text_array(coalesce(identity_source.draft -> 'languages', identity_source.draft -> 'languagesSpoken')), '{}'::text[]),
      '{}'::text[]
    ))
  end,
  host_profile_version = 1
from identity_source
where identity_source.user_id = u.id
  and coalesce(u.host_profile_version, 0) < 1;

-- Make gallery order deterministic and enforce one effective cover.
with ranked as (
  select
    id,
    family_id,
    row_number() over (
      partition by family_id
      order by is_primary desc, sort_order asc, created_at asc, id asc
    ) as position
  from public.family_photos
)
update public.family_photos photo
set
  is_primary = ranked.position = 1,
  sort_order = ranked.position - 1
from ranked
where ranked.id = photo.id;

create unique index if not exists family_photos_one_primary_per_family_idx
  on public.family_photos (family_id)
  where is_primary = true;

with ranked as (
  select
    id,
    family_id,
    row_number() over (
      partition by family_id
      order by is_featured desc, created_at asc, id asc
    ) as position
  from public.host_property_reels
  where status = 'active'
)
update public.host_property_reels reel
set is_featured = ranked.position = 1
from ranked
where ranked.id = reel.id;

create unique index if not exists host_property_reels_one_featured_per_family_idx
  on public.host_property_reels (family_id)
  where is_featured = true and status = 'active';

notify pgrst, 'reload schema';
