CREATE TABLE IF NOT EXISTS booking_whatsapp_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES bookings_v2(id) ON DELETE CASCADE,
  host_phone TEXT NOT NULL,
  family_id UUID REFERENCES families(id) ON DELETE SET NULL,
  action_token TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending',
  approve_payload TEXT NOT NULL,
  reject_payload TEXT NOT NULL,
  whatsapp_message_id TEXT,
  responded_whatsapp_message_id TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  responded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT booking_whatsapp_actions_status_check
    CHECK (status IN ('pending', 'approved', 'rejected', 'expired', 'ignored'))
);

CREATE INDEX IF NOT EXISTS booking_whatsapp_actions_booking_idx
  ON booking_whatsapp_actions(booking_id, created_at DESC);

CREATE INDEX IF NOT EXISTS booking_whatsapp_actions_token_idx
  ON booking_whatsapp_actions(action_token);

CREATE INDEX IF NOT EXISTS booking_whatsapp_actions_host_phone_idx
  ON booking_whatsapp_actions(host_phone, status, expires_at DESC);

CREATE TABLE IF NOT EXISTS booking_action_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID REFERENCES bookings_v2(id) ON DELETE SET NULL,
  booking_whatsapp_action_id UUID REFERENCES booking_whatsapp_actions(id) ON DELETE SET NULL,
  action_token TEXT NOT NULL,
  requested_action TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  inbound_message_id TEXT NOT NULL UNIQUE,
  inbound_phone TEXT,
  error_message TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT booking_action_jobs_requested_action_check
    CHECK (requested_action IN ('approve', 'reject')),
  CONSTRAINT booking_action_jobs_status_check
    CHECK (status IN ('pending', 'processed', 'failed', 'ignored'))
);

CREATE INDEX IF NOT EXISTS booking_action_jobs_status_idx
  ON booking_action_jobs(status, created_at);

CREATE INDEX IF NOT EXISTS booking_action_jobs_action_token_idx
  ON booking_action_jobs(action_token, created_at DESC);
