import fs from "node:fs";
import { Client } from "pg";

const connectionString = process.env.CHAT_DB_URL;
if (!connectionString) {
  console.error("Missing CHAT_DB_URL");
  process.exit(1);
}

const sql = fs.readFileSync(
  "supabase/migrations/20260429_000003_stay_units_v2_location_and_public_rooms.sql",
  "utf8"
);

const client = new Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

try {
  await client.connect();
  await client.query(sql);

  const [columnResult, viewResult] = await Promise.all([
    client.query(
      `
        select column_name
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'stay_units_v2'
          and column_name = any($1::text[])
        order by column_name
      `,
      [["lat", "lng", "locality_photos"]]
    ),
    client.query(
      `
        select column_name
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'public_home_rooms_v1'
        order by ordinal_position
      `
    ),
  ]);

  console.log(
    JSON.stringify(
      {
        stayUnitColumns: columnResult.rows,
        publicHomeRoomsViewColumns: viewResult.rows,
      },
      null,
      2
    )
  );
} finally {
  await client.end().catch(() => {});
}
