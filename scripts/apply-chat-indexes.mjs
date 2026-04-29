import fs from "node:fs";
import { Client } from "pg";

const sql = [
  fs.readFileSync("supabase/migrations/20260415_000002_chat_message_enhancements.sql", "utf8"),
  fs.readFileSync("supabase/migrations/20260425_000001_chat_performance_indexes.sql", "utf8"),
].join("\n\n");

const expectedIndexes = [
  "idx_conversations_booking_id",
  "idx_conversations_guest_id_last_message_at",
  "idx_conversations_host_user_id_last_message_at",
  "idx_conversations_last_message_at",
  "idx_messages_conversation_created_at",
  "idx_messages_receiver_seen",
  "messages_conversation_deleted_idx",
  "messages_conversation_seen_idx",
];

const connectionString = process.env.CHAT_DB_URL;

if (!connectionString) {
  console.error("Missing CHAT_DB_URL");
  process.exit(1);
}

const client = new Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

try {
  await client.connect();
  await client.query(sql);
  const result = await client.query(
    `
      select indexname
      from pg_indexes
      where schemaname = 'public'
        and indexname = any($1::text[])
      order by indexname
    `,
    [expectedIndexes]
  );

  console.log(JSON.stringify(result.rows, null, 2));
} finally {
  await client.end().catch(() => {});
}
