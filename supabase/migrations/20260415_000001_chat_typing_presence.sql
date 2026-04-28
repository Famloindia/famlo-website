ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS typing_user_id UUID,
  ADD COLUMN IF NOT EXISTS typing_updated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS conversations_typing_updated_idx ON conversations(typing_updated_at);

NOTIFY pgrst, 'reload schema';
