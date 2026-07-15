ALTER TABLE stay_units_v2
  ADD COLUMN IF NOT EXISTS locality_photos TEXT[] NOT NULL DEFAULT '{}'::text[];
