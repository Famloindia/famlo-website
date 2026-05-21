# Famlo Central Finance Batch 1

## Scope
- No settlement tables yet
- No admin settlement approval UI
- No host payout execution changes
- No GST/TCS/TDS enablement
- No guest checkout pricing changes
- No automatic folio writes yet

## Batch 1 Goals
1. Inspect current `reservation_folios_v2` and `folio_line_items_v2` definitions
2. Produce exact migration-readiness delta without recreating existing tables
3. Normalize OTA `source_channel`
4. Add OTA external guest identity safety markers
5. Add shared finance event contract
6. Add deterministic folio line idempotency standard
7. Run folio posting in dry-run/log-only mode first

## Migration Readiness

### Existing `reservation_folios_v2`
- `id`
- `reservation_id`
- `status`
- `currency`
- `balance_amount`
- `metadata`
- `opened_at`
- `closed_at`
- `created_at`
- `updated_at`

### Proposed additional `reservation_folios_v2` columns
- `booking_id`
- `property_id`
- `host_id`
- `guest_user_id`
- `source_channel`
- `booking_status`
- `payment_status`
- `guest_total_amount`
- `platform_fee_amount`
- `platform_fee_tax_amount`
- `host_payout_amount`
- `refund_total_amount`
- `calculation_snapshot_id`
- `tax_mode`
- `gst_collection_enabled`
- `tcs_enabled`
- `tds_enabled`
- `version`

### Existing `folio_line_items_v2`
- `id`
- `folio_id`
- `reservation_id`
- `booking_id`
- `line_type`
- `direction`
- `amount`
- `currency`
- `occurred_at`
- `reference_type`
- `reference_id`
- `description`
- `metadata`
- `created_at`

### Proposed additional `folio_line_items_v2` columns
- `line_code`
- `line_subtype`
- `quantity`
- `unit_amount`
- `source_event_type`
- `source_event_id`
- `source_system`
- `reversal_of_line_item_id`
- `calculation_snapshot_id`
- `tax_mode`
- `sort_order`
- `idempotency_key`

### Exact ALTER readiness plan
- Do not recreate `reservation_folios_v2`
- Do not recreate `folio_line_items_v2`
- Do not add duplicate `booking_id` to `folio_line_items_v2`
- Add only columns that are missing from the current schema
- Add `idempotency_key` before any real folio line posting rollout
- Extend or replace the current `line_type` check only after final taxonomy is approved
- Keep current `direction` check intact in Batch 1 because no folio writes happen yet

## Idempotency Standard
Every planned folio line item must derive a deterministic idempotency key from:
- `booking_id`
- `event_type`
- `source_event_id`
- `line_code`
- `calculation_version`

Canonical raw format:

```txt
booking_id:event_type:source_event_id:line_code:calculation_version
```

Persisted form:
- hashed deterministic key derived from the canonical raw format

## Rollout Rule
- `FINANCE_EVENT_DRY_RUN=true` must be on before any folio-line write rollout
- Batch 1 only plans and logs finance events
- No Batch 1 code may insert folio proof lines yet

## Explicit Non-Goals
- Do not enable GST collection
- Do not enable TCS
- Do not enable TDS
- Do not build GST filing/export automation
- Do not change guest checkout pricing yet
- Do not auto-pay hosts yet

## MVP Success Criteria
For a new direct booking, once later write-mode rollout is approved, admin should be able to see:
- booking amount
- platform fee
- guest payment line after capture
- host payout pending amount
- refund line if refunded
- no tax collected
- no settlement unless checkout/completed condition is met

## Feature Flags
- `FINANCE_EVENT_PIPELINE_ENABLED=false`
- `FINANCE_EVENT_DRY_RUN=true`
- `OTA_FINANCE_ENGINE_ENABLED=false`
- `GST_COLLECTION_ENABLED=false`
- `TCS_ENABLED=false`
- `TDS_ENABLED=false`
- `GST_EXPORT_ENABLED=false`
