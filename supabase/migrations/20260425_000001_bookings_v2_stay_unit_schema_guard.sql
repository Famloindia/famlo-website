ALTER TABLE bookings_v2
  ADD COLUMN IF NOT EXISTS stay_unit_id UUID REFERENCES stay_units_v2(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS bookings_v2_stay_unit_id_idx
  ON bookings_v2(stay_unit_id);

CREATE INDEX IF NOT EXISTS bookings_v2_host_stay_unit_start_idx
  ON bookings_v2(host_id, stay_unit_id, start_date, end_date, status);

UPDATE bookings_v2 b
SET stay_unit_id = su.id
FROM stay_units_v2 su
WHERE b.stay_unit_id IS NULL
  AND b.booking_type = 'host_stay'
  AND b.host_id = su.host_id
  AND su.is_primary = TRUE;

NOTIFY pgrst, 'reload schema';
