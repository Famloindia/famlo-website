const { Client } = require("pg");
const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.SUPABASE_DB_URL || process.env.CHAT_DB_URL;

if (!connectionString) {
  console.error("Set DATABASE_URL, POSTGRES_URL, SUPABASE_DB_URL, or CHAT_DB_URL before running this inspection.");
  process.exit(1);
}

const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });

(async () => {
  await client.connect();
  const res = await client.query("select id, display_name, status, is_accepting, room_count, starting_room_price from public_home_cards_v1 limit 5");
  console.log(JSON.stringify(res.rows, null, 2));
  await client.end();
})().catch(async (e) => {
  console.error(e);
  try {
    await client.end();
  } catch {}
  process.exit(1);
});
