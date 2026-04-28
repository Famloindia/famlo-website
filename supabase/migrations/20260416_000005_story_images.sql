ALTER TABLE stories_v2
  ADD COLUMN IF NOT EXISTS image_urls TEXT[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS stories_v2_image_urls_idx ON stories_v2 USING GIN (image_urls);

NOTIFY pgrst, 'reload schema';
