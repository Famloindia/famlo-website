const { Client } = require("pg");

const connectionString = process.env.CHAT_DB_URL;

if (!connectionString) {
  console.error("Missing CHAT_DB_URL");
  process.exit(1);
}

function getArg(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  return process.argv[index + 1] ?? null;
}

const familyFilter = getArg("--family");
const limitArg = Number(getArg("--limit") ?? "100");
const limit = Number.isFinite(limitArg) && limitArg > 0 ? Math.trunc(limitArg) : 100;

const client = new Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

function asString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function getRoomDrafts(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return [];
  return Array.isArray(payload.rooms) ? payload.rooms.filter((room) => room && typeof room === "object") : [];
}

function hasUsefulRoomData(room) {
  const keys = [
    "roomName",
    "name",
    "roomType",
    "maxGuests",
    "bedConfiguration",
    "roomConfiguration",
    "standardPrice",
    "lowDemandPrice",
    "highDemandPrice",
  ];

  if (keys.some((key) => asString(room[key]).length > 0)) return true;
  return ["roomPhotos", "photos", "localityPhotos", "locality_photos"].some((key) =>
    Array.isArray(room[key]) && room[key].some((item) => typeof item === "string" && item.trim().length > 0)
  );
}

(async () => {
  await client.connect();

  const familiesResult = await client.query(
    `
      with latest_drafts as (
        select distinct on (family_id)
          family_id,
          id,
          listing_status,
          payload,
          updated_at
        from public.host_onboarding_drafts
        where family_id is not null
          and listing_status in ('approved', 'live', 'published')
          ${familyFilter ? "and family_id = $1" : ""}
        order by family_id, updated_at desc
      )
      select
        ld.family_id,
        ld.id as draft_id,
        ld.listing_status,
        ld.payload,
        ld.updated_at,
        h.id as host_id
      from latest_drafts ld
      left join public.hosts h on h.legacy_family_id = ld.family_id
      order by ld.updated_at desc
      limit ${limit}
    `,
    familyFilter ? [familyFilter] : []
  );

  const report = [];

  for (const row of familiesResult.rows) {
    const payload = row.payload && typeof row.payload === "object" && !Array.isArray(row.payload) ? row.payload : {};
    const draftRooms = getRoomDrafts(payload).filter((room) => hasUsefulRoomData(room));
    const stayUnitsResult = await client.query(
      `
        select id, unit_key, name, is_active, photos, price_fullday, lat, lng
        from public.stay_units_v2
        where legacy_family_id = $1
        order by is_primary desc, sort_order asc, created_at asc
      `,
      [row.family_id]
    );

    const stayUnits = stayUnitsResult.rows;
    const missingRows = draftRooms.length > 0 && stayUnits.length === 0;
    const countMismatch = draftRooms.length !== stayUnits.length;
    const missingPhotos = stayUnits.filter((unit) => !Array.isArray(unit.photos) || unit.photos.length === 0).length;
    const missingCoordinates = stayUnits.filter((unit) => unit.lat == null || unit.lng == null).length;

    if (missingRows || countMismatch || missingPhotos > 0 || missingCoordinates > 0) {
      report.push({
        familyId: row.family_id,
        hostId: row.host_id,
        draftId: row.draft_id,
        listingStatus: row.listing_status,
        draftRoomCount: draftRooms.length,
        stayUnitCount: stayUnits.length,
        missingRows,
        countMismatch,
        missingPhotos,
        missingCoordinates,
        stayUnits: stayUnits.map((unit) => ({
          id: unit.id,
          unitKey: unit.unit_key,
          name: unit.name,
          hasPhotos: Array.isArray(unit.photos) && unit.photos.length > 0,
          hasCoordinates: unit.lat != null && unit.lng != null,
          priceFullday: unit.price_fullday,
        })),
      });
    }
  }

  console.log(JSON.stringify({ scanned: familiesResult.rows.length, issues: report.length, report }, null, 2));
  await client.end();
})().catch(async (error) => {
  console.error(error);
  try {
    await client.end();
  } catch {}
  process.exit(1);
});
