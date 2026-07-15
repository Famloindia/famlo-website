const { Client } = require("pg");

const connectionString = process.env.CHAT_DB_URL;

if (!connectionString) {
  console.error("Missing CHAT_DB_URL");
  process.exit(1);
}

const client = new Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

(async () => {
  await client.connect();
  const result = await client.query(`
    select column_name
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'stay_units_v2'
    order by ordinal_position
  `);
  console.log(JSON.stringify(result.rows, null, 2));
  await client.end();
})().catch(async (error) => {
  console.error(error);
  try {
    await client.end();
  } catch {}
  process.exit(1);
});
