CREATE TABLE IF NOT EXISTS public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE,
  booking_id UUID REFERENCES public.bookings_v2(id) ON DELETE SET NULL,
  sender_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  receiver_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  sender_type TEXT,
  text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  message_type TEXT NOT NULL DEFAULT 'text',
  image_url TEXT,
  image_name TEXT,
  deleted_at TIMESTAMPTZ,
  deleted_by UUID,
  seen_at TIMESTAMPTZ
);

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS message_type TEXT NOT NULL DEFAULT 'text',
  ADD COLUMN IF NOT EXISTS image_url TEXT,
  ADD COLUMN IF NOT EXISTS image_name TEXT,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by UUID,
  ADD COLUMN IF NOT EXISTS seen_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'messages_message_type_check'
  ) THEN
    ALTER TABLE messages
      ADD CONSTRAINT messages_message_type_check
      CHECK (message_type IN ('text', 'image', 'location', 'system', 'deleted'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS messages_conversation_seen_idx ON messages(conversation_id, seen_at);
CREATE INDEX IF NOT EXISTS messages_conversation_deleted_idx ON messages(conversation_id, deleted_at);

NOTIFY pgrst, 'reload schema';
