ALTER TABLE ads_v2
  ADD COLUMN IF NOT EXISTS weekdays INTEGER[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS daily_start_time TIME,
  ADD COLUMN IF NOT EXISTS daily_end_time TIME,
  ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'Asia/Kolkata',
  ADD COLUMN IF NOT EXISTS team_owner TEXT,
  ADD COLUMN IF NOT EXISTS audience TEXT DEFAULT 'all',
  ADD COLUMN IF NOT EXISTS placement TEXT DEFAULT 'discover';

CREATE INDEX IF NOT EXISTS ads_v2_city_state_idx ON ads_v2(city, state);
CREATE INDEX IF NOT EXISTS ads_v2_is_active_priority_idx ON ads_v2(is_active, priority);

NOTIFY pgrst, 'reload schema';
