CREATE TABLE IF NOT EXISTS whatsapp_action_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID REFERENCES bookings_v2(id) ON DELETE CASCADE,
  family_id UUID REFERENCES families(id) ON DELETE SET NULL,
  host_id UUID REFERENCES hosts(id) ON DELETE SET NULL,
  host_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT whatsapp_action_tokens_action_check CHECK (action IN ('accept_booking', 'reject_booking'))
);

CREATE INDEX IF NOT EXISTS whatsapp_action_tokens_booking_idx
  ON whatsapp_action_tokens(booking_id, action, expires_at DESC);
