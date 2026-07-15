ALTER TABLE payments_v2
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS payments_v2_gateway_order_id_uidx
  ON payments_v2(gateway_order_id)
  WHERE gateway_order_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS payments_v2_gateway_payment_id_uidx
  ON payments_v2(gateway_payment_id)
  WHERE gateway_payment_id IS NOT NULL;

ALTER TABLE stories_v2
  ADD COLUMN IF NOT EXISTS legacy_story_id UUID,
  ADD COLUMN IF NOT EXISTS booking_id UUID REFERENCES bookings_v2(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS host_id UUID REFERENCES hosts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rating INTEGER,
  ADD COLUMN IF NOT EXISTS liked_host BOOLEAN;

CREATE UNIQUE INDEX IF NOT EXISTS stories_v2_legacy_story_id_uidx
  ON stories_v2(legacy_story_id)
  WHERE legacy_story_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS stories_v2_host_id_idx ON stories_v2(host_id);
CREATE INDEX IF NOT EXISTS stories_v2_booking_id_idx ON stories_v2(booking_id);

DO $$
BEGIN
  IF to_regclass('public.trip_stories') IS NOT NULL THEN
    EXECUTE $sql$
      UPDATE stories_v2 s
      SET
        legacy_story_id = ts.id,
        booking_id = COALESCE(bv2.id, bv2_legacy.id, s.booking_id),
        host_id = COALESCE(h.id, s.host_id),
        author_user_id = COALESCE(s.author_user_id, ts.user_id),
        rating = COALESCE(s.rating, ts.rating),
        liked_host = COALESCE(s.liked_host, b.liked_host)
      FROM trip_stories ts
      LEFT JOIN hosts h
        ON h.legacy_family_id = ts.family_id
      LEFT JOIN bookings_v2 bv2
        ON bv2.id = ts.booking_id
      LEFT JOIN bookings_v2 bv2_legacy
        ON bv2_legacy.legacy_booking_id = ts.booking_id
      LEFT JOIN bookings b
        ON b.id = ts.booking_id
      WHERE s.legacy_story_id IS NULL
        AND s.author_name IS NOT DISTINCT FROM ts.author_name
        AND s.body IS NOT DISTINCT FROM ts.story_text
        AND s.created_at = COALESCE(ts.created_at, s.created_at);
    $sql$;

    EXECUTE $sql$
      INSERT INTO stories_v2 (
        legacy_story_id,
        booking_id,
        host_id,
        author_user_id,
        author_name,
        city,
        title,
        body,
        rating,
        liked_host,
        is_published,
        created_at,
        updated_at
      )
      SELECT
        ts.id,
        COALESCE(bv2.id, bv2_legacy.id),
        h.id,
        ts.user_id,
        ts.author_name,
        ts.from_city,
        COALESCE(NULLIF(ts.author_name, ''), 'Famlo Story'),
        ts.story_text,
        ts.rating,
        b.liked_host,
        COALESCE(ts.is_published, false),
        COALESCE(ts.created_at, NOW()),
        COALESCE(ts.created_at, NOW())
      FROM trip_stories ts
      LEFT JOIN hosts h
        ON h.legacy_family_id = ts.family_id
      LEFT JOIN bookings_v2 bv2
        ON bv2.id = ts.booking_id
      LEFT JOIN bookings_v2 bv2_legacy
        ON bv2_legacy.legacy_booking_id = ts.booking_id
      LEFT JOIN bookings b
        ON b.id = ts.booking_id
      WHERE NOT EXISTS (
        SELECT 1
        FROM stories_v2 s
        WHERE s.legacy_story_id = ts.id
      );
    $sql$;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
