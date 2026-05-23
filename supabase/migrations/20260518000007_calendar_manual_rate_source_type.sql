ALTER TABLE calendar_events
  DROP CONSTRAINT IF EXISTS calendar_events_source_type_check;

ALTER TABLE calendar_events
  ADD CONSTRAINT calendar_events_source_type_check
  CHECK (source_type IN ('internal_booking', 'manual_block', 'manual_rate', 'booking_hold', 'external_import'));
