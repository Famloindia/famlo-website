create index if not exists idx_messages_conversation_created_at
on public.messages (conversation_id, created_at desc);

create index if not exists idx_conversations_last_message_at
on public.conversations (last_message_at desc);

create index if not exists idx_conversations_guest_id_last_message_at
on public.conversations (guest_id, last_message_at desc);

create index if not exists idx_conversations_host_user_id_last_message_at
on public.conversations (host_user_id, last_message_at desc);

create index if not exists idx_conversations_booking_id
on public.conversations (booking_id);

create index if not exists idx_messages_receiver_seen
on public.messages (receiver_id, seen_at);
