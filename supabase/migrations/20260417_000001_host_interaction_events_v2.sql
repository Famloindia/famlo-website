CREATE TABLE IF NOT EXISTS host_interaction_events_v2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  visitor_id TEXT NOT NULL,
  session_id TEXT,
  host_id UUID NOT NULL REFERENCES hosts(id) ON DELETE CASCADE,
  legacy_family_id UUID,
  event_type TEXT NOT NULL,
  event_bucket TEXT NOT NULL,
  page_path TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT host_interaction_events_v2_event_type_check CHECK (
    event_type IN (
      'listing_view',
      'profile_click',
      'gallery_open',
      'wishlist_add',
      'message_start',
      'booking_page_open',
      'booking_request',
      'booking_confirmed',
      'story_read',
      'repeat_visit'
    )
  ),
  CONSTRAINT host_interaction_events_v2_event_bucket_check CHECK (length(event_bucket) > 0)
);

CREATE INDEX IF NOT EXISTS host_interaction_events_v2_host_type_created_idx
  ON host_interaction_events_v2(host_id, event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS host_interaction_events_v2_visitor_created_idx
  ON host_interaction_events_v2(visitor_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS host_interaction_events_v2_dedupe_idx
  ON host_interaction_events_v2(visitor_id, host_id, event_type, event_bucket);

NOTIFY pgrst, 'reload schema';
