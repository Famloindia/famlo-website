CREATE TABLE IF NOT EXISTS public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID,
  family_id UUID REFERENCES public.families(id) ON DELETE SET NULL,
  guest_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  host_id UUID REFERENCES public.hosts(id) ON DELETE SET NULL,
  host_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  guest_unread INTEGER NOT NULL DEFAULT 0,
  host_unread INTEGER NOT NULL DEFAULT 0,
  last_message TEXT,
  last_message_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  typing_user_id UUID,
  typing_updated_at TIMESTAMPTZ
);

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS typing_user_id UUID,
  ADD COLUMN IF NOT EXISTS typing_updated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS conversations_typing_updated_idx ON conversations(typing_updated_at);

NOTIFY pgrst, 'reload schema';
