UPDATE stories_v2 s
SET
  host_id = COALESCE(s.host_id, bv2.host_id),
  booking_id = COALESCE(s.booking_id, bv2.id)
FROM bookings_v2 bv2
WHERE (
    s.booking_id = bv2.id
    OR s.booking_id = bv2.legacy_booking_id
  )
  AND (
    s.host_id IS NULL
    OR s.booking_id IS NULL
  );

NOTIFY pgrst, 'reload schema';
