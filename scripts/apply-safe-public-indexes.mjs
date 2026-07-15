import fs from 'node:fs';
import { Client } from 'pg';

const sql = fs.readFileSync('supabase/migrations/20260429000001_safe_public_path_indexes.sql', 'utf8');
const expectedIndexes = [
  'family_photos_family_id_primary_idx',
  'conversations_family_id_last_message_at_idx',
  'stay_units_v2_host_active_idx',
  'stay_units_v2_family_idx',
];

const connectionString = process.env.CHAT_DB_URL;
if (!connectionString) {
  console.error('Missing CHAT_DB_URL');
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
