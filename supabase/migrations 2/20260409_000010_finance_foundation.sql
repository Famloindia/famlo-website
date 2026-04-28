BEGIN;

CREATE TABLE IF NOT EXISTS finance_rule_sets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  calculation_mode TEXT NOT NULL DEFAULT 'commission_gst_only',
  jurisdiction_country TEXT NOT NULL DEFAULT 'IN',
  version INTEGER NOT NULL DEFAULT 1,
  effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  effective_to TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archived_at TIMESTAMPTZ,
  CONSTRAINT finance_rule_sets_status_check CHECK (status IN ('draft', 'active', 'archived')),
  CONSTRAINT finance_rule_sets_mode_check CHECK (calculation_mode IN ('commission_gst_only', 'full_tax_preview', 'full_tax_live'))
);

CREATE UNIQUE INDEX IF NOT EXISTS finance_rule_sets_default_uidx
  ON finance_rule_sets(is_default)
  WHERE is_default = TRUE;

CREATE TABLE IF NOT EXISTS tax_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_set_id UUID NOT NULL REFERENCES finance_rule_sets(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'global_default',
  product_type TEXT NOT NULL DEFAULT 'host_stay',
  calculation_target TEXT NOT NULL DEFAULT 'platform_fee',
  tax_code TEXT NOT NULL DEFAULT 'GST',
  rate_bps INTEGER NOT NULL DEFAULT 1800,
  split_mode TEXT NOT NULL DEFAULT 'igst',
  jurisdiction_country TEXT NOT NULL DEFAULT 'IN',
  seller_state TEXT,
  buyer_state TEXT,
  intra_state_only BOOLEAN NOT NULL DEFAULT FALSE,
  inter_state_only BOOLEAN NOT NULL DEFAULT FALSE,
  priority INTEGER NOT NULL DEFAULT 100,
  effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  effective_to TIMESTAMPTZ,
  is_preview BOOLEAN NOT NULL DEFAULT FALSE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT tax_rules_split_mode_check CHECK (split_mode IN ('none', 'cgst_sgst', 'igst')),
  CONSTRAINT tax_rules_target_check CHECK (calculation_target IN ('platform_fee', 'stay', 'convenience_fee', 'insurance', 'addon'))
);

CREATE INDEX IF NOT EXISTS tax_rules_rule_set_idx ON tax_rules(rule_set_id);
CREATE INDEX IF NOT EXISTS tax_rules_lookup_idx ON tax_rules(product_type, jurisdiction_country, effective_from, effective_to);

CREATE TABLE IF NOT EXISTS commission_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_set_id UUID NOT NULL REFERENCES finance_rule_sets(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'global_default',
  target_type TEXT NOT NULL DEFAULT 'product_type',
  target_id UUID,
  product_type TEXT NOT NULL DEFAULT 'host_stay',
  rate_bps INTEGER NOT NULL DEFAULT 1800,
  min_fee_amount INTEGER NOT NULL DEFAULT 0,
  max_fee_amount INTEGER,
  priority INTEGER NOT NULL DEFAULT 100,
  effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  effective_to TIMESTAMPTZ,
  is_preview BOOLEAN NOT NULL DEFAULT FALSE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS commission_rules_rule_set_idx ON commission_rules(rule_set_id);
CREATE INDEX IF NOT EXISTS commission_rules_lookup_idx ON commission_rules(product_type, priority, effective_from, effective_to);

CREATE TABLE IF NOT EXISTS payout_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_set_id UUID NOT NULL REFERENCES finance_rule_sets(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'global_default',
  target_type TEXT NOT NULL DEFAULT 'product_type',
  target_id UUID,
  payout_timing TEXT NOT NULL DEFAULT 'after_completion',
  delay_hours INTEGER NOT NULL DEFAULT 0,
  reserve_bps INTEGER NOT NULL DEFAULT 0,
  gateway_fee_burden TEXT NOT NULL DEFAULT 'platform',
  withholding_bps INTEGER NOT NULL DEFAULT 0,
  release_after_status TEXT NOT NULL DEFAULT 'completed',
  allow_partial BOOLEAN NOT NULL DEFAULT FALSE,
  priority INTEGER NOT NULL DEFAULT 100,
  effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  effective_to TIMESTAMPTZ,
  is_preview BOOLEAN NOT NULL DEFAULT FALSE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT payout_rules_timing_check CHECK (payout_timing IN ('immediate', 'after_check_in', 'after_completion', 'manual_release'))
);

CREATE INDEX IF NOT EXISTS payout_rules_rule_set_idx ON payout_rules(rule_set_id);

CREATE TABLE IF NOT EXISTS booking_financial_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES bookings_v2(id) ON DELETE CASCADE,
  payment_id UUID REFERENCES payments_v2(id) ON DELETE SET NULL,
  snapshot_kind TEXT NOT NULL DEFAULT 'checkout',
  snapshot_version INTEGER NOT NULL DEFAULT 1,
  calculation_mode TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'INR',
  booking_amount INTEGER NOT NULL DEFAULT 0,
  discount_amount INTEGER NOT NULL DEFAULT 0,
  taxable_base_for_service_fee INTEGER NOT NULL DEFAULT 0,
  platform_fee INTEGER NOT NULL DEFAULT 0,
  platform_fee_tax INTEGER NOT NULL DEFAULT 0,
  stay_tax INTEGER NOT NULL DEFAULT 0,
  guest_total INTEGER NOT NULL DEFAULT 0,
  host_payout INTEGER NOT NULL DEFAULT 0,
  gateway_fee_estimate INTEGER NOT NULL DEFAULT 0,
  withholding_estimate INTEGER NOT NULL DEFAULT 0,
  rounding_adjustment INTEGER NOT NULL DEFAULT 0,
  net_platform_revenue INTEGER NOT NULL DEFAULT 0,
  total_tax_liability INTEGER NOT NULL DEFAULT 0,
  commission_rate_bps INTEGER NOT NULL DEFAULT 0,
  applied_rule_ids JSONB NOT NULL DEFAULT '{}'::jsonb,
  geography_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  coupon_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  tax_breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,
  payout_breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,
  display_breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,
  formulas JSONB NOT NULL DEFAULT '{}'::jsonb,
  warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(booking_id, snapshot_kind, snapshot_version)
);

CREATE INDEX IF NOT EXISTS booking_financial_snapshots_booking_idx ON booking_financial_snapshots(booking_id, created_at DESC);

CREATE TABLE IF NOT EXISTS payment_intents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES bookings_v2(id) ON DELETE CASCADE,
  payment_id UUID REFERENCES payments_v2(id) ON DELETE SET NULL,
  finance_snapshot_id UUID REFERENCES booking_financial_snapshots(id) ON DELETE SET NULL,
  provider TEXT NOT NULL,
  provider_order_id TEXT,
  provider_payment_id TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  amount_total INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'INR',
  status TEXT NOT NULL DEFAULT 'draft',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT payment_intents_status_check CHECK (status IN ('draft', 'created', 'authorized', 'paid', 'failed', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS payment_intents_booking_idx ON payment_intents(booking_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS payment_intents_provider_order_uidx
  ON payment_intents(provider, provider_order_id)
  WHERE provider_order_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS payment_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID REFERENCES payments_v2(id) ON DELETE SET NULL,
  payment_intent_id UUID REFERENCES payment_intents(id) ON DELETE SET NULL,
  provider TEXT NOT NULL,
  event_name TEXT NOT NULL,
  provider_event_id TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  processing_status TEXT NOT NULL DEFAULT 'received',
  event_created_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT payment_events_status_check CHECK (processing_status IN ('received', 'processed', 'ignored', 'failed'))
);

CREATE INDEX IF NOT EXISTS payment_events_payment_idx ON payment_events(payment_id, created_at DESC);

ALTER TABLE payments_v2
  ADD COLUMN IF NOT EXISTS finance_snapshot_id UUID REFERENCES booking_financial_snapshots(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS payment_intent_id UUID REFERENCES payment_intents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS calculation_mode TEXT,
  ADD COLUMN IF NOT EXISTS reconciliation_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS refund_status TEXT NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS last_webhook_event TEXT,
  ADD COLUMN IF NOT EXISTS last_webhook_received_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS webhook_payload JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS payout_transfers_v2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payout_id UUID NOT NULL REFERENCES payouts_v2(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'manual',
  transfer_reference TEXT,
  beneficiary_reference TEXT,
  amount INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  attempt_number INTEGER NOT NULL DEFAULT 1,
  error_code TEXT,
  error_message TEXT,
  raw_response JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  UNIQUE(payout_id, attempt_number)
);

ALTER TABLE payouts_v2
  ADD COLUMN IF NOT EXISTS finance_rule_id UUID REFERENCES payout_rules(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS settlement_batch_id UUID,
  ADD COLUMN IF NOT EXISTS gross_booking_value INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS platform_fee INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS platform_fee_tax INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gateway_fee_burden_amount INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS withholding_amount INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reserve_amount INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS net_transferable_amount INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS hold_reason TEXT,
  ADD COLUMN IF NOT EXISTS beneficiary_reference TEXT;

CREATE TABLE IF NOT EXISTS refunds_v2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES bookings_v2(id) ON DELETE CASCADE,
  payment_id UUID REFERENCES payments_v2(id) ON DELETE SET NULL,
  provider TEXT NOT NULL DEFAULT 'razorpay',
  provider_refund_id TEXT,
  amount_total INTEGER NOT NULL DEFAULT 0,
  reason_code TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  initiated_by_user_id UUID REFERENCES users(id),
  initiated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE(provider, provider_refund_id)
);

CREATE INDEX IF NOT EXISTS refunds_v2_booking_idx ON refunds_v2(booking_id, initiated_at DESC);

CREATE TABLE IF NOT EXISTS refund_allocations_v2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  refund_id UUID NOT NULL REFERENCES refunds_v2(id) ON DELETE CASCADE,
  allocation_type TEXT NOT NULL,
  amount INTEGER NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT refund_allocations_v2_type_check CHECK (allocation_type IN ('guest_principal', 'platform_fee_reversal', 'platform_tax_reversal', 'host_clawback', 'coupon_reversal'))
);

CREATE TABLE IF NOT EXISTS ledger_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID REFERENCES bookings_v2(id) ON DELETE SET NULL,
  payment_id UUID REFERENCES payments_v2(id) ON DELETE SET NULL,
  payout_id UUID REFERENCES payouts_v2(id) ON DELETE SET NULL,
  refund_id UUID REFERENCES refunds_v2(id) ON DELETE SET NULL,
  entry_type TEXT NOT NULL,
  account_code TEXT NOT NULL,
  direction TEXT NOT NULL,
  amount INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'INR',
  effective_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reference_type TEXT,
  reference_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ledger_entries_type_check CHECK (entry_type IN ('payment_captured', 'booking_confirmed', 'payout_scheduled', 'payout_completed', 'refund_initiated', 'refund_completed', 'dispute_hold', 'manual_adjustment', 'tax_liability')),
  CONSTRAINT ledger_entries_direction_check CHECK (direction IN ('debit', 'credit'))
);

CREATE INDEX IF NOT EXISTS ledger_entries_booking_idx ON ledger_entries(booking_id, effective_at DESC);
CREATE INDEX IF NOT EXISTS ledger_entries_account_idx ON ledger_entries(account_code, effective_at DESC);

CREATE TABLE IF NOT EXISTS settlement_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_code TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'draft',
  scheduled_for TIMESTAMPTZ,
  processed_at TIMESTAMPTZ,
  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT settlement_batches_status_check CHECK (status IN ('draft', 'scheduled', 'processing', 'processed', 'failed', 'cancelled'))
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'payouts_v2_settlement_batch_fk'
  ) THEN
    ALTER TABLE payouts_v2
      ADD CONSTRAINT payouts_v2_settlement_batch_fk
      FOREIGN KEY (settlement_batch_id) REFERENCES settlement_batches(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS reconciliation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'running',
  matched_count INTEGER NOT NULL DEFAULT 0,
  mismatched_count INTEGER NOT NULL DEFAULT 0,
  missing_count INTEGER NOT NULL DEFAULT 0,
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT reconciliation_runs_status_check CHECK (status IN ('running', 'matched', 'mismatched', 'failed'))
);

CREATE TABLE IF NOT EXISTS invoices_v2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID REFERENCES bookings_v2(id) ON DELETE SET NULL,
  payment_id UUID REFERENCES payments_v2(id) ON DELETE SET NULL,
  invoice_number TEXT NOT NULL UNIQUE,
  invoice_type TEXT NOT NULL DEFAULT 'tax_invoice',
  status TEXT NOT NULL DEFAULT 'draft',
  issued_to_user_id UUID REFERENCES users(id),
  amount_total INTEGER NOT NULL DEFAULT 0,
  tax_amount INTEGER NOT NULL DEFAULT 0,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  issued_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS credit_notes_v2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  refund_id UUID REFERENCES refunds_v2(id) ON DELETE SET NULL,
  invoice_id UUID REFERENCES invoices_v2(id) ON DELETE SET NULL,
  credit_note_number TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'draft',
  amount_total INTEGER NOT NULL DEFAULT 0,
  tax_amount INTEGER NOT NULL DEFAULT 0,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  issued_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS finance_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  override_scope TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id UUID,
  finance_rule_set_id UUID REFERENCES finance_rule_sets(id) ON DELETE SET NULL,
  commission_rate_bps INTEGER,
  tax_rule_id UUID REFERENCES tax_rules(id) ON DELETE SET NULL,
  payout_rule_id UUID REFERENCES payout_rules(id) ON DELETE SET NULL,
  reason TEXT NOT NULL,
  created_by_user_id UUID REFERENCES users(id),
  effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  effective_to TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS finance_overrides_target_idx ON finance_overrides(target_type, target_id, effective_from DESC);

CREATE TABLE IF NOT EXISTS finance_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID REFERENCES users(id),
  action_type TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  before_value JSONB,
  after_value JSONB,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO finance_rule_sets (code, name, status, is_default, calculation_mode, version, metadata)
SELECT
  'famlo_default_mvp',
  'Famlo Default MVP Finance Rules',
  'active',
  TRUE,
  'commission_gst_only',
  1,
  jsonb_build_object(
    'notes', 'Current live model: commission on booking amount, GST only on platform fee, host payout net of commission.',
    'legal_review', 'LEGAL_REVIEW_REQUIRED'
  )
WHERE NOT EXISTS (
  SELECT 1 FROM finance_rule_sets WHERE code = 'famlo_default_mvp'
);

INSERT INTO commission_rules (rule_set_id, code, scope, target_type, product_type, rate_bps, metadata)
SELECT
  frs.id,
  'famlo_default_commission',
  'global_default',
  'product_type',
  'host_stay',
  1800,
  jsonb_build_object('source', 'mvp_seed')
FROM finance_rule_sets frs
WHERE frs.code = 'famlo_default_mvp'
  AND NOT EXISTS (
    SELECT 1 FROM commission_rules cr WHERE cr.code = 'famlo_default_commission'
  );

INSERT INTO tax_rules (rule_set_id, code, scope, product_type, calculation_target, tax_code, rate_bps, split_mode, metadata)
SELECT
  frs.id,
  'famlo_default_platform_fee_gst',
  'global_default',
  'host_stay',
  'platform_fee',
  'GST',
  1800,
  'igst',
  jsonb_build_object('source', 'mvp_seed', 'mode', 'commission_gst_only')
FROM finance_rule_sets frs
WHERE frs.code = 'famlo_default_mvp'
  AND NOT EXISTS (
    SELECT 1 FROM tax_rules tr WHERE tr.code = 'famlo_default_platform_fee_gst'
  );

INSERT INTO payout_rules (rule_set_id, code, scope, target_type, payout_timing, delay_hours, gateway_fee_burden, release_after_status, metadata)
SELECT
  frs.id,
  'famlo_default_host_payout',
  'global_default',
  'product_type',
  'after_completion',
  0,
  'platform',
  'completed',
  jsonb_build_object('source', 'mvp_seed')
FROM finance_rule_sets frs
WHERE frs.code = 'famlo_default_mvp'
  AND NOT EXISTS (
    SELECT 1 FROM payout_rules pr WHERE pr.code = 'famlo_default_host_payout'
  );

COMMIT;

NOTIFY pgrst, 'reload schema';
