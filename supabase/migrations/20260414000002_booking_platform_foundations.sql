ALTER TABLE bookings_v2
  ADD COLUMN IF NOT EXISTS hold_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT,
  ADD COLUMN IF NOT EXISTS cancellation_policy_code TEXT,
  ADD COLUMN IF NOT EXISTS source_channel TEXT NOT NULL DEFAULT 'famlo_direct';

CREATE INDEX IF NOT EXISTS bookings_v2_hold_expires_idx ON bookings_v2(hold_expires_at) WHERE status = 'awaiting_payment';
CREATE INDEX IF NOT EXISTS bookings_v2_source_channel_idx ON bookings_v2(source_channel);

CREATE TABLE IF NOT EXISTS calendar_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_type TEXT NOT NULL,
  owner_id UUID NOT NULL,
  provider TEXT NOT NULL DEFAULT 'manual_ics',
  source_label TEXT NOT NULL,
  external_url TEXT,
  import_mode TEXT NOT NULL DEFAULT 'pull',
  export_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  last_synced_at TIMESTAMPTZ,
  last_sync_status TEXT NOT NULL DEFAULT 'never',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT calendar_connections_status_check CHECK (last_sync_status IN ('never', 'success', 'partial', 'failed')),
  CONSTRAINT calendar_connections_import_mode_check CHECK (import_mode IN ('pull', 'push', 'bidirectional')),
  UNIQUE(owner_type, owner_id, provider, source_label)
);

CREATE INDEX IF NOT EXISTS calendar_connections_owner_idx ON calendar_connections(owner_type, owner_id);

CREATE TABLE IF NOT EXISTS calendar_sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID REFERENCES calendar_connections(id) ON DELETE SET NULL,
  owner_type TEXT NOT NULL,
  owner_id UUID NOT NULL,
  provider TEXT NOT NULL,
  direction TEXT NOT NULL DEFAULT 'import',
  status TEXT NOT NULL DEFAULT 'running',
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  events_seen INTEGER NOT NULL DEFAULT 0,
  events_applied INTEGER NOT NULL DEFAULT 0,
  conflicts_found INTEGER NOT NULL DEFAULT 0,
  message TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT calendar_sync_logs_status_check CHECK (status IN ('running', 'success', 'partial', 'failed')),
  CONSTRAINT calendar_sync_logs_direction_check CHECK (direction IN ('import', 'export'))
);

CREATE INDEX IF NOT EXISTS calendar_sync_logs_owner_idx ON calendar_sync_logs(owner_type, owner_id, started_at DESC);

CREATE TABLE IF NOT EXISTS calendar_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_type TEXT NOT NULL,
  owner_id UUID NOT NULL,
  booking_id UUID REFERENCES bookings_v2(id) ON DELETE SET NULL,
  connection_id UUID REFERENCES calendar_connections(id) ON DELETE SET NULL,
  event_uid TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'internal_booking',
  source_reference TEXT,
  title TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  slot_key TEXT,
  status TEXT NOT NULL DEFAULT 'confirmed',
  is_blocking BOOLEAN NOT NULL DEFAULT TRUE,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT calendar_events_status_check CHECK (status IN ('confirmed', 'tentative', 'cancelled', 'released')),
  CONSTRAINT calendar_events_source_type_check CHECK (source_type IN ('internal_booking', 'manual_block', 'booking_hold', 'external_import')),
  UNIQUE(owner_type, owner_id, event_uid)
);

CREATE INDEX IF NOT EXISTS calendar_events_owner_range_idx ON calendar_events(owner_type, owner_id, start_date, end_date);
CREATE INDEX IF NOT EXISTS calendar_events_booking_idx ON calendar_events(booking_id);

CREATE TABLE IF NOT EXISTS calendar_conflicts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_type TEXT NOT NULL,
  owner_id UUID NOT NULL,
  booking_id UUID REFERENCES bookings_v2(id) ON DELETE SET NULL,
  calendar_event_id UUID REFERENCES calendar_events(id) ON DELETE SET NULL,
  sync_log_id UUID REFERENCES calendar_sync_logs(id) ON DELETE SET NULL,
  conflict_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  summary TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  resolved_by_user_id UUID REFERENCES users(id),
  resolution_notes TEXT,
  CONSTRAINT calendar_conflicts_status_check CHECK (status IN ('open', 'resolved', 'ignored'))
);

CREATE INDEX IF NOT EXISTS calendar_conflicts_owner_idx ON calendar_conflicts(owner_type, owner_id, created_at DESC);

CREATE TABLE IF NOT EXISTS seasonal_pricing_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_type TEXT NOT NULL,
  owner_id UUID NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  starts_on DATE,
  ends_on DATE,
  weekdays INTEGER[] NOT NULL DEFAULT '{}'::INTEGER[],
  slot_key TEXT,
  adjustment_type TEXT NOT NULL DEFAULT 'percentage',
  adjustment_value INTEGER NOT NULL DEFAULT 0,
  min_price INTEGER,
  priority INTEGER NOT NULL DEFAULT 100,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT seasonal_pricing_rules_status_check CHECK (status IN ('active', 'paused')),
  CONSTRAINT seasonal_pricing_rules_adjustment_type_check CHECK (adjustment_type IN ('percentage', 'fixed_delta', 'override'))
);

CREATE INDEX IF NOT EXISTS seasonal_pricing_rules_owner_idx ON seasonal_pricing_rules(owner_type, owner_id, priority);

CREATE TABLE IF NOT EXISTS inventory_rules_v2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_type TEXT NOT NULL,
  owner_id UUID NOT NULL,
  lead_time_hours INTEGER NOT NULL DEFAULT 0,
  booking_window_days INTEGER NOT NULL DEFAULT 365,
  min_stay_days INTEGER NOT NULL DEFAULT 1,
  max_stay_days INTEGER NOT NULL DEFAULT 30,
  allow_same_day BOOLEAN NOT NULL DEFAULT TRUE,
  closed_to_arrival BOOLEAN NOT NULL DEFAULT FALSE,
  closed_to_departure BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(owner_type, owner_id)
);

CREATE TABLE IF NOT EXISTS cancellation_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_type TEXT NOT NULL,
  owner_id UUID,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  refund_type TEXT NOT NULL DEFAULT 'percentage',
  refund_value INTEGER NOT NULL DEFAULT 100,
  penalty_type TEXT NOT NULL DEFAULT 'none',
  penalty_value INTEGER NOT NULL DEFAULT 0,
  applies_before_hours INTEGER NOT NULL DEFAULT 24,
  applies_after_hours INTEGER NOT NULL DEFAULT 0,
  priority INTEGER NOT NULL DEFAULT 100,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT cancellation_policies_status_check CHECK (status IN ('active', 'paused')),
  CONSTRAINT cancellation_policies_refund_type_check CHECK (refund_type IN ('percentage', 'fixed_amount')),
  CONSTRAINT cancellation_policies_penalty_type_check CHECK (penalty_type IN ('none', 'percentage', 'fixed_amount'))
);

CREATE INDEX IF NOT EXISTS cancellation_policies_owner_idx ON cancellation_policies(owner_type, owner_id, priority);

CREATE TABLE IF NOT EXISTS booking_modifications_v2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES bookings_v2(id) ON DELETE CASCADE,
  requested_by_user_id UUID REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'pending',
  old_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  requested_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  financial_delta JSONB NOT NULL DEFAULT '{}'::jsonb,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT booking_modifications_v2_status_check CHECK (status IN ('pending', 'approved', 'rejected', 'applied'))
);

CREATE INDEX IF NOT EXISTS booking_modifications_v2_booking_idx ON booking_modifications_v2(booking_id, created_at DESC);

CREATE TABLE IF NOT EXISTS notification_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'email',
  status TEXT NOT NULL DEFAULT 'pending',
  user_id UUID REFERENCES users(id),
  booking_id UUID REFERENCES bookings_v2(id) ON DELETE SET NULL,
  payout_id UUID REFERENCES payouts_v2(id) ON DELETE SET NULL,
  dedupe_key TEXT,
  subject TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  scheduled_for TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT notification_queue_status_check CHECK (status IN ('pending', 'processed', 'failed', 'skipped'))
);

CREATE INDEX IF NOT EXISTS notification_queue_status_idx ON notification_queue(status, scheduled_for);
CREATE UNIQUE INDEX IF NOT EXISTS notification_queue_dedupe_idx ON notification_queue(dedupe_key) WHERE dedupe_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS document_exports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_type TEXT NOT NULL,
  booking_id UUID REFERENCES bookings_v2(id) ON DELETE SET NULL,
  payout_id UUID REFERENCES payouts_v2(id) ON DELETE SET NULL,
  owner_user_id UUID REFERENCES users(id),
  access_scope TEXT NOT NULL DEFAULT 'private',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT document_exports_access_scope_check CHECK (access_scope IN ('private', 'guest', 'host', 'admin'))
);

CREATE INDEX IF NOT EXISTS document_exports_lookup_idx ON document_exports(document_type, booking_id, payout_id);

INSERT INTO cancellation_policies (owner_type, owner_id, code, name, refund_type, refund_value, applies_before_hours, applies_after_hours, priority, metadata)
SELECT
  'global',
  NULL,
  'famlo_flexible_24h',
  'Famlo Flexible 24h',
  'percentage',
  100,
  24,
  999999,
  100,
  jsonb_build_object('source', 'seed', 'description', '100 percent refund until 24 hours before check-in')
WHERE NOT EXISTS (
  SELECT 1 FROM cancellation_policies WHERE code = 'famlo_flexible_24h'
);
