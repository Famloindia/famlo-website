CREATE EXTENSION IF NOT EXISTS "pgcrypto";

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS guest_checkin_seed UUID DEFAULT gen_random_uuid();

UPDATE users
SET guest_checkin_seed = COALESCE(guest_checkin_seed, gen_random_uuid())
WHERE guest_checkin_seed IS NULL;

ALTER TABLE users
  ALTER COLUMN guest_checkin_seed SET DEFAULT gen_random_uuid();

ALTER TABLE bookings_v2
  ADD COLUMN IF NOT EXISTS guest_arrival_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS checked_in_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS checked_in_by_host_user_id UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS checked_out_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS checked_out_by_host_user_id UUID REFERENCES users(id);

CREATE TABLE IF NOT EXISTS booking_checkin_attempts_v2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES bookings_v2(id) ON DELETE CASCADE,
  guest_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  host_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  entered_code_suffix TEXT,
  success BOOLEAN NOT NULL DEFAULT FALSE,
  failure_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS booking_checkin_attempts_v2_booking_idx ON booking_checkin_attempts_v2(booking_id);
CREATE INDEX IF NOT EXISTS booking_checkin_attempts_v2_guest_idx ON booking_checkin_attempts_v2(guest_user_id);
CREATE INDEX IF NOT EXISTS booking_checkin_attempts_v2_host_idx ON booking_checkin_attempts_v2(host_user_id);
CREATE INDEX IF NOT EXISTS booking_checkin_attempts_v2_created_idx ON booking_checkin_attempts_v2(created_at);

CREATE TABLE IF NOT EXISTS guest_feedback_v2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES bookings_v2(id) ON DELETE CASCADE,
  guest_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  host_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  would_host_again BOOLEAN NOT NULL DEFAULT TRUE,
  behavior_tags TEXT[] NOT NULL DEFAULT '{}',
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT guest_feedback_v2_booking_uidx UNIQUE (booking_id)
);

CREATE INDEX IF NOT EXISTS guest_feedback_v2_guest_idx ON guest_feedback_v2(guest_user_id);
CREATE INDEX IF NOT EXISTS guest_feedback_v2_host_idx ON guest_feedback_v2(host_user_id);
CREATE INDEX IF NOT EXISTS guest_feedback_v2_created_idx ON guest_feedback_v2(created_at);

NOTIFY pgrst, 'reload schema';
