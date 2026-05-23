#!/usr/bin/env bash
set -euo pipefail

export PATH="/opt/homebrew/opt/libpq/bin:/opt/homebrew/bin:${PATH}"

PROD_DB_HOST="aws-1-ap-south-1.pooler.supabase.com"
PROD_DB_PORT="5432"
PROD_DB_NAME="postgres"

require_prod_db_env() {
  : "${PROD_DB_PASSWORD:?PROD_DB_PASSWORD is required}"
  : "${PROD_PROJECT_REF:?PROD_PROJECT_REF is required}"
  PROD_DB_USER="postgres.${PROD_PROJECT_REF}"
}

run_prod_psql() {
  require_prod_db_env
  PGPASSWORD="$PROD_DB_PASSWORD" psql \
    -X \
    -h "$PROD_DB_HOST" \
    -p "$PROD_DB_PORT" \
    -U "$PROD_DB_USER" \
    -d "$PROD_DB_NAME" \
    "$@"
}

CLEAN_TABLES=(
  users
  user_profiles_v2
  host_onboarding_drafts
  family_applications
  families
  family_photos
  hosts
  host_media
  gallery_posts_v2
  stay_units_v2
  availability_rules_v2
  availability_exceptions_v2
  seasonal_pricing_rules
  inventory_rules_v2
  inventory_event_log
  inventory_rule_sets
  inventory_day_projection
  inventory_projection_runs
  inventory_parity_checks
  conversations
  messages
  bookings_v2
  booking_status_history_v2
  booking_checkin_attempts_v2
  guest_feedback_v2
  booking_modifications_v2
  booking_action_jobs
  booking_whatsapp_actions
  whatsapp_action_tokens
  payments_v2
  payment_intents
  payment_events
  booking_financial_snapshots
  refunds_v2
  refund_allocations_v2
  refund_requests
  refund_attempts
  payouts_v2
  payout_transfers_v2
  host_payout_accounts
  host_settlements_v2
  settlement_line_items_v2
  host_payout_executions
  guest_tax_invoices
  platform_fee_invoices
  credit_notes
  credit_notes_v2
  invoices_v2
  finance_document_files
  finance_email_deliveries
  document_exports
  notification_queue
  calendar_connections
  calendar_sync_logs
  calendar_events
  calendar_conflicts
  channel_properties
  channel_room_mappings
  channel_sync_jobs
  channel_sync_logs
  channel_booking_revisions
  channel_provider_accounts
  channel_operation_ledger
  channel_provider_diagnostics
  channel_reconciliation_runs
  host_pro_subscriptions
  host_pro_settings
  activities_v2
  stories_v2
  reviews_v2
  recent_views_v2
  host_applications_v2
  hommie_applications_v2
  hommie_profiles_v2
  hommie_media_v2
  ads_v2
  reservations_v2
  reservation_segments_v2
  reservation_guests_v2
  reservation_assignment_history_v2
  reservation_lifecycle_events_v2
  reservation_folios_v2
  folio_line_items_v2
  finance_overrides
  finance_audit_logs
)

PRESERVE_TABLES=(
  channel_providers
  finance_rule_sets
  tax_rules
  commission_rules
  payout_rules
  finance_settings
  cancellation_policies
  platform_settings
  admin_platform_settings
)
