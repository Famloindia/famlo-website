CREATE TABLE IF NOT EXISTS stay_units_v2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id UUID REFERENCES hosts(id) ON DELETE CASCADE,
  legacy_family_id UUID,
  unit_key TEXT NOT NULL DEFAULT 'primary',
  name TEXT NOT NULL,
  unit_type TEXT NOT NULL DEFAULT 'private_room',
  description TEXT,
  max_guests INTEGER NOT NULL DEFAULT 1,
  bed_info TEXT,
  bathroom_type TEXT,
  room_size_sqm NUMERIC,
  lat NUMERIC,
  lng NUMERIC,
  price_morning INTEGER NOT NULL DEFAULT 0,
  price_afternoon INTEGER NOT NULL DEFAULT 0,
  price_evening INTEGER NOT NULL DEFAULT 0,
  price_fullday INTEGER NOT NULL DEFAULT 0,
  quarter_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  is_primary BOOLEAN NOT NULL DEFAULT TRUE,
  amenities TEXT[] NOT NULL DEFAULT '{}'::text[],
  photos TEXT[] NOT NULL DEFAULT '{}'::text[],
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT stay_units_v2_unit_key_check CHECK (length(unit_key) > 0),
  CONSTRAINT stay_units_v2_name_check CHECK (length(name) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS stay_units_v2_host_unit_key_idx
  ON stay_units_v2(host_id, unit_key);

CREATE INDEX IF NOT EXISTS stay_units_v2_host_active_idx
  ON stay_units_v2(host_id, is_active, sort_order);

CREATE INDEX IF NOT EXISTS stay_units_v2_family_idx
  ON stay_units_v2(legacy_family_id);

INSERT INTO stay_units_v2 (
  host_id,
  legacy_family_id,
  unit_key,
  name,
  unit_type,
  description,
  max_guests,
  bed_info,
  bathroom_type,
  lat,
  lng,
  price_morning,
  price_afternoon,
  price_evening,
  price_fullday,
  quarter_enabled,
  is_active,
  is_primary,
  amenities,
  photos,
  sort_order,
  created_at,
  updated_at
)
SELECT
  h.id AS host_id,
  h.legacy_family_id,
  'primary' AS unit_key,
  COALESCE(NULLIF(h.display_name, ''), NULLIF(f.name, ''), 'Primary Room') AS name,
  'private_room' AS unit_type,
  COALESCE(NULLIF(h.about, ''), NULLIF(h.family_story, ''), NULLIF(f.about, ''), NULLIF(f.description, '')) AS description,
  COALESCE(h.max_guests, f.max_guests, 1) AS max_guests,
  COALESCE(NULLIF(h.family_composition, ''), '1 bed') AS bed_info,
  COALESCE(NULLIF(h.bathroom_type, ''), NULLIF(f.bathroom_type, '')) AS bathroom_type,
  COALESCE(h.lat, f.lat) AS lat,
  COALESCE(h.lng, f.lng) AS lng,
  COALESCE(h.price_morning, f.price_morning, 0) AS price_morning,
  COALESCE(h.price_afternoon, f.price_afternoon, 0) AS price_afternoon,
  COALESCE(h.price_evening, f.price_evening, 0) AS price_evening,
  COALESCE(h.price_fullday, f.price_fullday, 0) AS price_fullday,
  CASE
    WHEN COALESCE(cardinality(h.active_quarters), 0) > 0 THEN TRUE
    ELSE TRUE
  END AS quarter_enabled,
  COALESCE(h.status = 'published', f.is_active, TRUE) AS is_active,
  TRUE AS is_primary,
  COALESCE(h.amenities, f.amenities, '{}'::text[]) AS amenities,
  COALESCE(
    ARRAY(
      SELECT hm.media_url
      FROM host_media hm
      WHERE hm.host_id = h.id
      ORDER BY hm.is_primary DESC, hm.sort_order ASC, hm.created_at ASC
    ),
    '{}'::text[]
  ) AS photos,
  0 AS sort_order,
  NOW() AS created_at,
  NOW() AS updated_at
FROM hosts h
LEFT JOIN families f ON f.id = h.legacy_family_id
WHERE NOT EXISTS (
  SELECT 1
  FROM stay_units_v2 su
  WHERE su.host_id = h.id
    AND su.unit_key = 'primary'
);

UPDATE stay_units_v2 su
SET
  lat = COALESCE(su.lat, h.lat, f.lat),
  lng = COALESCE(su.lng, h.lng, f.lng),
  updated_at = NOW()
FROM hosts h
LEFT JOIN families f ON f.id = h.legacy_family_id
WHERE su.host_id = h.id
  AND su.unit_key = 'primary'
  AND (su.lat IS NULL OR su.lng IS NULL);

NOTIFY pgrst, 'reload schema';
