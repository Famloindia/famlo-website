UPDATE stories_v2
SET
  is_published = TRUE,
  updated_at = NOW()
WHERE review_status = 'pending'
  AND COALESCE(is_published, FALSE) = FALSE;

UPDATE stories_v2 s
SET
  host_id = COALESCE(s.host_id, b.host_id),
  booking_id = COALESCE(s.booking_id, b.id),
  is_published = TRUE,
  updated_at = NOW()
FROM bookings_v2 b
WHERE s.booking_id = b.id
  AND (s.host_id IS NULL OR COALESCE(s.is_published, FALSE) = FALSE);

NOTIFY pgrst, 'reload schema';
