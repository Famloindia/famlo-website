ALTER TABLE ads_v2
  ADD COLUMN IF NOT EXISTS locality TEXT;

ALTER TABLE coupons_v2
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS state TEXT,
  ADD COLUMN IF NOT EXISTS locality TEXT;

CREATE INDEX IF NOT EXISTS ads_v2_city_state_locality_idx ON ads_v2(city, state, locality);
CREATE INDEX IF NOT EXISTS coupons_v2_city_state_locality_idx ON coupons_v2(city, state, locality);

NOTIFY pgrst, 'reload schema';
