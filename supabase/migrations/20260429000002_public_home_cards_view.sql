CREATE OR REPLACE VIEW public.public_home_cards_v1 AS
SELECT
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
  NULL::boolean AS booking_requires_host_approval,
  h.lat,
  h.lng,
  h.lat_exact,
  h.lng_exact,
  h.landmarks,
  h.neighborhood_desc,
  h.accessibility_desc,
  NULL::text AS admin_notes,
  h.is_featured,
  COALESCE(media.primary_photo_url, NULL) AS host_photo_url,
  COALESCE(media.image_urls, '{}'::text[]) AS image_urls,
  COALESCE(units.room_image_urls, '{}'::text[]) AS room_image_urls,
  units.room_count,
  units.starting_room_price
FROM public.hosts h
LEFT JOIN LATERAL (
  SELECT
    (ARRAY_AGG(hm.media_url ORDER BY hm.is_primary DESC, hm.sort_order ASC, hm.created_at ASC))[1] AS primary_photo_url,
    ARRAY_AGG(hm.media_url ORDER BY hm.is_primary DESC, hm.sort_order ASC, hm.created_at ASC) AS image_urls
  FROM public.host_media hm
  WHERE hm.host_id = h.id
) media ON TRUE
LEFT JOIN LATERAL (
  SELECT
    COUNT(*) FILTER (
      WHERE su.is_active = TRUE
        AND (
          COALESCE(su.price_fullday, 0) > 0 OR
          COALESCE(su.price_morning, 0) > 0 OR
          COALESCE(su.price_afternoon, 0) > 0 OR
          COALESCE(su.price_evening, 0) > 0 OR
          COALESCE(array_length(su.photos, 1), 0) > 0 OR
          COALESCE(length(NULLIF(su.name, '')), 0) > 0 OR
          COALESCE(length(NULLIF(su.description, '')), 0) > 0 OR
          COALESCE(length(NULLIF(su.unit_type, '')), 0) > 0
        )
    )::integer AS room_count,
    (
      SELECT MIN(price)::integer
      FROM (
        SELECT NULLIF(COALESCE(su4.price_fullday, 0), 0) AS price
        FROM public.stay_units_v2 su4
        WHERE su4.host_id = h.id AND su4.is_active = TRUE
        UNION ALL
        SELECT NULLIF(COALESCE(su4.price_morning, 0), 0) AS price
        FROM public.stay_units_v2 su4
        WHERE su4.host_id = h.id AND su4.is_active = TRUE
        UNION ALL
        SELECT NULLIF(COALESCE(su4.price_afternoon, 0), 0) AS price
        FROM public.stay_units_v2 su4
        WHERE su4.host_id = h.id AND su4.is_active = TRUE
        UNION ALL
        SELECT NULLIF(COALESCE(su4.price_evening, 0), 0) AS price
        FROM public.stay_units_v2 su4
        WHERE su4.host_id = h.id AND su4.is_active = TRUE
      ) prices
      WHERE price IS NOT NULL
    ) AS starting_room_price,
    ARRAY(
      SELECT DISTINCT photo
      FROM (
        SELECT UNNEST(COALESCE(su2.photos, '{}'::text[])) AS photo
        FROM public.stay_units_v2 su2
        WHERE su2.host_id = h.id AND su2.is_active = TRUE
      ) images
      WHERE photo IS NOT NULL AND length(trim(photo)) > 0
    ) AS room_image_urls
  FROM public.stay_units_v2 su
  WHERE su.host_id = h.id
) units ON TRUE;

NOTIFY pgrst, 'reload schema';
