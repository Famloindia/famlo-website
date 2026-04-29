const { Client } = require("pg");

const connectionString = process.env.CHAT_DB_URL;
const familyId = process.env.FAMILY_ID;

if (!connectionString) {
  console.error("Missing CHAT_DB_URL");
  process.exit(1);
}

if (!familyId) {
  console.error("Missing FAMILY_ID");
  process.exit(1);
}

const client = new Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

function asString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function asNullableString(value) {
  const next = asString(value);
  return next.length > 0 ? next : null;
}

function asNumber(value, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function asNullableNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function asStringArray(value) {
  return Array.isArray(value)
    ? value.filter((item) => typeof item === "string" && item.trim().length > 0).map((item) => item.trim())
    : [];
}

function dedupeStrings(values) {
  return Array.from(new Set(values.filter((value) => typeof value === "string" && value.trim().length > 0)));
}

function normalizeRoomUnitType(value) {
  const raw = asString(value).toLowerCase();
  if (!raw) return "private_room";
  if (raw.includes("shared")) return "shared_room";
  if (raw.includes("entire")) return "entire_home";
  if (raw.includes("luxury")) return "luxury_room";
  if (raw.includes("premium")) return "premium_room";
  if (raw.includes("standard")) return "standard_room";
  if (raw.includes("private")) return "private_room";
  return raw.replace(/\s+/g, "_");
}

function normalizeBathroomType(value) {
  const next = asNullableString(value);
  if (!next) return null;
  return next.replace(/[,\s•-]+$/, "").replace(/\s+/g, " ").trim() || null;
}

function hasUsefulRoomData(room) {
  const values = [
    room.roomName,
    room.name,
    room.roomType,
    room.room_type,
    room.maxGuests,
    room.max_guests,
    room.bedConfiguration,
    room.roomConfiguration,
    room.balcony,
    room.roomVibe,
    room.standardPrice,
    room.lowDemandPrice,
    room.highDemandPrice,
    room.smartPricingEnabled,
    room.roomPhotos,
    room.photos,
    room.localityPhotos,
    room.locality_photos,
    room.lat,
    room.lng,
  ];

  return values.some((value) => {
    if (Array.isArray(value)) {
      return value.some((item) => typeof item === "string" && item.trim().length > 0);
    }
    if (typeof value === "boolean") return value;
    if (typeof value === "number") return Number.isFinite(value) && value > 0;
    return asString(value).length > 0;
  });
}

function buildRoomRows(rooms, context) {
  const now = new Date().toISOString();

  return rooms
    .map((room, index) => {
      if (!room || typeof room !== "object" || !hasUsefulRoomData(room)) return null;

      const standardPrice = asNullableNumber(room.standardPrice) ?? asNullableNumber(room.standard_price) ?? 0;
      const lowDemandPrice = asNullableNumber(room.lowDemandPrice) ?? asNullableNumber(room.low_demand_price) ?? 0;
      const highDemandPrice = asNullableNumber(room.highDemandPrice) ?? asNullableNumber(room.high_demand_price) ?? 0;
      const smartPricingEnabled = Boolean(room.smartPricingEnabled ?? room.smart_pricing_enabled);
      const smartPricingMidpoint =
        smartPricingEnabled && (lowDemandPrice > 0 || highDemandPrice > 0)
          ? Math.round((Math.max(0, lowDemandPrice) + Math.max(0, highDemandPrice)) / 2)
          : 0;

      const photos = dedupeStrings([
        ...asStringArray(room.roomPhotos),
        ...asStringArray(room.photos),
        ...asStringArray(room.photo_urls),
      ]);
      const localityPhotos = dedupeStrings([
        ...asStringArray(room.localityPhotos),
        ...asStringArray(room.locality_photos),
        ...asStringArray(room.localityImages),
        ...asStringArray(room.locality_images),
      ]);

      const descriptionParts = [
        asNullableString(room.roomConfiguration),
        asNullableString(room.balcony),
        asNullableString(room.roomVibe),
        asNullableString(room.description),
      ].filter(Boolean);

      return {
        host_id: context.hostId,
        legacy_family_id: context.familyId,
        unit_key: asNullableString(room.id) || `room-${index + 1}`,
        name: asNullableString(room.roomName) ?? asNullableString(room.name) ?? `Room ${index + 1}`,
        unit_type: normalizeRoomUnitType(room.roomType ?? room.room_type ?? room.unitType ?? room.unit_type),
        description: descriptionParts.length > 0 ? descriptionParts.join(" • ") : null,
        max_guests: Math.max(1, asNullableNumber(room.maxGuests) ?? 1),
        bed_info: asNullableString(room.bedConfiguration),
        bathroom_type: normalizeBathroomType(room.bathroomType) || normalizeBathroomType(room.roomConfiguration) || null,
        room_size_sqm: asNullableNumber(room.roomSizeSqm),
        lat: asNullableNumber(room.lat),
        lng: asNullableNumber(room.lng),
        price_morning: smartPricingEnabled ? lowDemandPrice || standardPrice : standardPrice,
        price_afternoon: smartPricingEnabled ? smartPricingMidpoint || standardPrice || lowDemandPrice || highDemandPrice : standardPrice || lowDemandPrice || highDemandPrice,
        price_evening: smartPricingEnabled ? highDemandPrice || standardPrice : standardPrice,
        price_fullday: standardPrice || highDemandPrice || lowDemandPrice,
        quarter_enabled: smartPricingEnabled || standardPrice > 0 || lowDemandPrice > 0 || highDemandPrice > 0,
        is_active: room.isActive === false ? false : true,
        is_primary: index === 0,
        amenities: room.roomAmenities && Array.isArray(room.roomAmenities) ? dedupeStrings(room.roomAmenities) : dedupeStrings(asStringArray(room.amenities)),
        photos,
        locality_photos: localityPhotos,
        sort_order: asNumber(room.sortOrder, index),
        updated_at: now,
      };
    })
    .filter(Boolean);
}

(async () => {
  await client.connect();

  const hostResult = await client.query(
    `select id, legacy_family_id from public.hosts where legacy_family_id = $1 limit 1`,
    [familyId]
  );
  const hostRow = hostResult.rows[0];
  if (!hostRow) {
    throw new Error(`No host found for family ${familyId}`);
  }

  const draftResult = await client.query(
    `
      select id, payload, updated_at
      from public.host_onboarding_drafts
      where family_id = $1
        and listing_status in ('approved', 'live', 'published')
      order by updated_at desc
      limit 1
    `,
    [familyId]
  );

  const draft = draftResult.rows[0];
  if (!draft || !draft.payload || typeof draft.payload !== "object") {
    throw new Error(`No approved draft payload found for family ${familyId}`);
  }

  const rooms = Array.isArray(draft.payload.rooms) ? draft.payload.rooms : [];
  const roomRows = buildRoomRows(rooms, { hostId: hostRow.id, familyId });
  if (roomRows.length === 0) {
    throw new Error(`Approved draft has no usable rooms for family ${familyId}`);
  }

  const keptIds = [];

  for (const row of roomRows) {
    const existingResult = await client.query(
      `
        select id
        from public.stay_units_v2
        where host_id = $1
          and unit_key = $2
        limit 1
      `,
      [row.host_id, row.unit_key]
    );

    const params = [
      row.host_id,
      row.legacy_family_id,
      row.unit_key,
      row.name,
      row.unit_type,
      row.description,
      row.max_guests,
      row.bed_info,
      row.bathroom_type,
      row.room_size_sqm,
      row.lat,
      row.lng,
      row.price_morning,
      row.price_afternoon,
      row.price_evening,
      row.price_fullday,
      row.quarter_enabled,
      row.is_active,
      row.is_primary,
      row.amenities,
      row.photos,
      row.locality_photos,
      row.sort_order,
      row.updated_at,
    ];

    if (existingResult.rows[0]?.id) {
      await client.query(
        `
          update public.stay_units_v2
          set
            host_id = $1,
            legacy_family_id = $2,
            unit_key = $3,
            name = $4,
            unit_type = $5,
            description = $6,
            max_guests = $7,
            bed_info = $8,
            bathroom_type = $9,
            room_size_sqm = $10,
            lat = $11,
            lng = $12,
            price_morning = $13,
            price_afternoon = $14,
            price_evening = $15,
            price_fullday = $16,
            quarter_enabled = $17,
            is_active = $18,
            is_primary = $19,
            amenities = $20,
            photos = $21,
            locality_photos = $22,
            sort_order = $23,
            updated_at = $24
          where id = $25
        `,
        [...params, existingResult.rows[0].id]
      );
      keptIds.push(existingResult.rows[0].id);
      continue;
    }

    const insertResult = await client.query(
      `
        insert into public.stay_units_v2 (
          host_id,
          legacy_family_id,
          unit_key,
          name,
          unit_type,
          description,
          max_guests,
          bed_info,
          bathroom_type,
          room_size_sqm,
          lat,
          lng,
          price_morning,
          price_afternoon,
          price_evening,
          price_fullday,
          quarter_enabled,
          is_active,
          is_primary,
          amenities,
          photos,
          locality_photos,
          sort_order,
          updated_at
        )
        values (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
          $11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
          $21,$22,$23,$24
        )
        returning id
      `,
      params
    );
    keptIds.push(insertResult.rows[0]?.id);
  }

  await client.query(
    `
      delete from public.stay_units_v2
      where legacy_family_id = $1
        and not (id = any($2::uuid[]))
    `,
    [familyId, keptIds.filter((value) => typeof value === "string" && value.length > 0)]
  );

  const verifyResult = await client.query(
    `
      select id, host_id, legacy_family_id, unit_key, name, is_active, is_primary, price_fullday, lat, lng, photos, locality_photos
      from public.stay_units_v2
      where legacy_family_id = $1
      order by is_primary desc, sort_order asc, created_at asc nulls last
    `,
    [familyId]
  );

  console.log(
    JSON.stringify(
      {
        repaired: roomRows.length,
        stayUnits: verifyResult.rows,
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
