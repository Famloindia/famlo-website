ALTER TABLE stories_v2
  ADD COLUMN IF NOT EXISTS review_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reviewed_by TEXT,
  ADD COLUMN IF NOT EXISTS featured_rank INTEGER,
  ADD COLUMN IF NOT EXISTS guest_consent_to_feature BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS stay_highlight TEXT,
  ADD COLUMN IF NOT EXISTS experience_tags TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS internal_notes TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'stories_v2_review_status_check'
  ) THEN
    ALTER TABLE stories_v2
      ADD CONSTRAINT stories_v2_review_status_check
      CHECK (review_status IN ('pending', 'approved', 'rejected', 'hidden'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS stories_v2_review_status_idx ON stories_v2(review_status);
CREATE INDEX IF NOT EXISTS stories_v2_featured_rank_idx ON stories_v2(featured_rank) WHERE featured_rank IS NOT NULL;

UPDATE stories_v2
SET review_status = CASE
  WHEN is_published = TRUE THEN 'approved'
  ELSE 'pending'
END
WHERE review_status IS NULL OR review_status = '';

NOTIFY pgrst, 'reload schema';
