CREATE INDEX IF NOT EXISTS idx_messages_conversation_created_at
  ON public.messages (conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_conversations_last_message_at
  ON public.conversations (last_message_at DESC);

CREATE INDEX IF NOT EXISTS idx_conversations_guest_id_last_message_at
  ON public.conversations (guest_id, last_message_at DESC);

CREATE INDEX IF NOT EXISTS idx_conversations_host_user_id_last_message_at
  ON public.conversations (host_user_id, last_message_at DESC);

CREATE INDEX IF NOT EXISTS idx_conversations_booking_id
  ON public.conversations (booking_id);

CREATE INDEX IF NOT EXISTS idx_messages_receiver_seen
  ON public.messages (receiver_id, seen_at);

NOTIFY pgrst, 'reload schema';
