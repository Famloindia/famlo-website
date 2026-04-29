const { Client } = require("pg");

const connectionString = process.env.CHAT_DB_URL;
const hostId = process.env.HOST_ID;

if (!connectionString) {
  console.error("Missing CHAT_DB_URL");
  process.exit(1);
}

if (!hostId) {
  console.error("Missing HOST_ID");
  process.exit(1);
}

const client = new Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

(async () => {
  await client.connect();

  const hostResult = await client.query(
    `
      select id, legacy_family_id, display_name
      from public.hosts
      where id = $1
    `,
    [hostId]
  );

  const hostRow = hostResult.rows[0] ?? null;
  const familyId = hostRow?.legacy_family_id ?? null;

  const stayUnitResult = await client.query(
    `
      select id, host_id, legacy_family_id, unit_key, name, is_active, photos
      from public.stay_units_v2
      where host_id = $1
         or legacy_family_id = $1
         or ($2::uuid is not null and legacy_family_id = $2::uuid)
      order by is_primary desc nulls last, sort_order asc nulls last, created_at asc nulls last
    `,
    [hostId, familyId]
  );

  console.log(
    JSON.stringify(
      {
        host: hostRow,
        stay_units: stayUnitResult.rows,
      },
      null,
      2
    )
  );

  await client.end();
})().catch(async (error) => {
  console.error(error);
  try {
    await client.end();
  } catch {}
  process.exit(1);
});
