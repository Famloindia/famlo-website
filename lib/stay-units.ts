import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeAmenityList } from "@/lib/room-amenities";

export type StayUnitRecord = {
  id: string;
  hostId: string | null;
  legacyFamilyId: string | null;
  unitKey: string;
  name: string;
  unitType: string;
  description: string | null;
  maxGuests: number;
  bedInfo: string | null;
  bathroomType: string | null;
  roomSizeSqm: number | null;
  lat: number | null;
  lng: number | null;
  priceMorning: number;
  priceAfternoon: number;
  priceEvening: number;
  priceFullday: number;
  quarterEnabled: boolean;
  isActive: boolean;
  isPrimary: boolean;
  amenities: string[];
  photos: string[];
  localityPhotos: string[];
  blockedDates: string[];
  sortOrder: number;
  source: "database" | "fallback";
};

export type StayUnitHomeInput = {
  id: string;
  hostId: string | null;
  legacyFamilyId: string | null;
  listingTitle: string | null;
  name: string | null;
  description: string | null;
  maxGuests: number | null;
  priceMorning?: number;
  priceAfternoon?: number;
  priceEvening?: number;
  priceFullday?: number;
  activeQuarters?: string[];
  isActive: boolean;
  isAccepting: boolean;
  bathroomType: string | null;
  amenities: string[];
  imageUrls: string[];
  hostPhotoUrl?: string | null;
  lat?: number | null;
  lng?: number | null;
};

type JsonRecord = Record<string, unknown>;

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNullableString(value: unknown): string | null {
  const next = asString(value);
  return next.length > 0 ? next : null;
}

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function asNullableNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0);
}

function dedupeStrings(values: Array<string | null | undefined>): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => (typeof value === "string" ? value.trim() : ""))
        .filter((value) => value.length > 0)
    )
  );
}

function pickObject(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function getRoomsFromSource(source: JsonRecord): unknown[] {
  if (Array.isArray(source.rooms)) {
    return source.rooms;
  }

  const payload = pickObject(source.payload);
  return Array.isArray(payload.rooms) ? payload.rooms : [];
}

function getRoomField(source: JsonRecord, payload: JsonRecord, keys: string[]): unknown {
  for (const key of keys) {
    const sourceValue = source[key];
    if (sourceValue !== undefined && sourceValue !== null) {
      return sourceValue;
    }

    const payloadValue = payload[key];
    if (payloadValue !== undefined && payloadValue !== null) {
      return payloadValue;
    }
  }

  return undefined;
}

function buildLegacyRoomDraft(source: JsonRecord): JsonRecord | null {
  const payload = pickObject(source.payload);
  const hasLegacyRoomSignals =
    asNullableString(getRoomField(source, payload, ["roomType", "room_type", "unitType", "unit_type"])) != null ||
    asNullableNumber(getRoomField(source, payload, ["maxGuests", "max_guests"])) != null ||
    asNullableNumber(getRoomField(source, payload, ["standardPrice", "standard_price", "priceFullday", "price_fullday", "fullDayRate", "baseNightlyRate"])) != null ||
    asNullableNumber(getRoomField(source, payload, ["lowDemandPrice", "low_demand_price", "priceMorning", "price_morning", "morningRate"])) != null ||
    asNullableNumber(getRoomField(source, payload, ["highDemandPrice", "high_demand_price", "priceEvening", "price_evening", "eveningRate"])) != null ||
    asStringArray(getRoomField(source, payload, ["roomPhotos", "room_photos", "photo_urls", "photos", "roomImages", "room_images"])).length > 0 ||
    asNullableString(getRoomField(source, payload, ["bedConfiguration", "bed_configuration", "bedInfo", "bed_info", "roomConfiguration", "room_configuration", "balcony", "roomVibe", "room_vibe"])) != null ||
    asNullableString(getRoomField(source, payload, ["bathroomType", "bathroom_type"])) != null ||
    asStringArray(getRoomField(source, payload, ["roomAmenities", "room_amenities", "amenities"])).length > 0;

  if (!hasLegacyRoomSignals) {
    return null;
  }

  const roomName =
    asNullableString(getRoomField(source, payload, ["roomName", "room_name", "property_name", "propertyName", "listingTitle", "name"])) ??
    asNullableString(source.primary_host_name) ??
    "Primary room";
  const roomType = asNullableString(getRoomField(source, payload, ["roomType", "room_type", "unitType", "unit_type"])) ?? "Private room";
  const maxGuests = asNullableNumber(getRoomField(source, payload, ["maxGuests", "max_guests"])) ?? 1;
  const bedConfiguration = asNullableString(getRoomField(source, payload, ["bedConfiguration", "bed_configuration", "bedInfo", "bed_info"])) ?? "";
  const roomConfiguration = asNullableString(getRoomField(source, payload, ["roomConfiguration", "room_configuration"])) ?? "";
  const balcony = asNullableString(getRoomField(source, payload, ["balcony"])) ?? "";
  const roomVibe = asNullableString(getRoomField(source, payload, ["roomVibe", "room_vibe"])) ?? "";
  const roomAmenities = dedupeStrings([
    ...asStringArray(getRoomField(source, payload, ["roomAmenities", "room_amenities"])),
    ...asStringArray(getRoomField(source, payload, ["amenities"])),
  ]);
  const roomPhotos = dedupeStrings([
    ...asStringArray(getRoomField(source, payload, ["roomPhotos", "room_photos"])),
    ...asStringArray(getRoomField(source, payload, ["photo_urls"])),
    ...asStringArray(getRoomField(source, payload, ["photos"])),
    ...asStringArray(getRoomField(source, payload, ["roomImages", "room_images"])),
  ]);
  const standardPrice = asNullableNumber(getRoomField(source, payload, ["standardPrice", "standard_price", "priceFullday", "price_fullday", "fullDayRate", "baseNightlyRate"])) ?? 0;
  const lowDemandPrice = asNullableNumber(getRoomField(source, payload, ["lowDemandPrice", "low_demand_price", "priceMorning", "price_morning", "morningRate"])) ?? 0;
  const highDemandPrice = asNullableNumber(getRoomField(source, payload, ["highDemandPrice", "high_demand_price", "priceEvening", "price_evening", "eveningRate"])) ?? 0;
  const smartPricingEnabled = Boolean(getRoomField(source, payload, ["smartPricingEnabled", "smart_pricing_enabled"])) || lowDemandPrice > 0 || highDemandPrice > 0;

  if (!roomName && !roomType && maxGuests <= 1 && standardPrice <= 0 && lowDemandPrice <= 0 && highDemandPrice <= 0 && roomPhotos.length === 0) {
    return null;
  }

  return {
    id: asNullableString(getRoomField(source, payload, ["roomId", "room_id", "id"])) ?? "primary",
    roomName,
    roomType,
    maxGuests,
    bedConfiguration,
    roomConfiguration,
    balcony,
    roomVibe,
    roomAmenities,
    roomPhotos,
    lat: asNullableNumber(getRoomField(source, payload, ["lat", "latitude"])),
    lng: asNullableNumber(getRoomField(source, payload, ["lng", "longitude"])),
    standardPrice: standardPrice > 0 ? String(standardPrice) : "",
    lowDemandPrice: lowDemandPrice > 0 ? String(lowDemandPrice) : "",
    highDemandPrice: highDemandPrice > 0 ? String(highDemandPrice) : "",
    smartPricingEnabled,
  };
}

function getRoomDraftsFromSource(source: JsonRecord): JsonRecord[] {
  const payload = pickObject(source.payload);
  const rawRooms = Array.isArray(source.rooms)
    ? source.rooms
    : Array.isArray(payload.rooms)
      ? payload.rooms
      : [];

  const normalizedRooms = rawRooms.filter((item): item is JsonRecord => Boolean(item && typeof item === "object" && !Array.isArray(item)));
  if (normalizedRooms.length > 0) {
    return normalizedRooms;
  }

  const legacyRoom = buildLegacyRoomDraft(source);
  return legacyRoom ? [legacyRoom] : [];
}

function countRoomsFromSource(source: JsonRecord): number {
  return getRoomDraftsFromSource(source).filter((item) => {
    const room = pickObject(item);
    return hasUsefulRoomData(room);
  }).length;
}

function normalizeApplicationSource(source: JsonRecord): JsonRecord {
  return {
    ...source,
    rooms: getRoomDraftsFromSource(source),
  };
}

function looksLikePlaceholderRows(rows: StayUnitRecord[]): boolean {
  if (rows.length === 0) return true;

  return rows.every((row) => {
    const hasAnyPrice =
      row.priceMorning > 0 ||
      row.priceAfternoon > 0 ||
      row.priceEvening > 0 ||
      row.priceFullday > 0;

    return !hasAnyPrice && row.photos.length === 0;
  });
}

function scoreStayUnitRow(row: StayUnitRecord): number {
  const pricedSlots = [row.priceMorning, row.priceAfternoon, row.priceEvening, row.priceFullday].filter((price) => price > 0).length;
  return (
    row.photos.length * 100 +
    pricedSlots * 25 +
    (row.description ? 10 : 0) +
    (row.amenities.length > 0 ? 5 : 0) +
    (row.isPrimary ? 3 : 0) +
    (row.lat != null && row.lng != null ? 2 : 0) +
    Math.max(0, row.sortOrder)
  );
}

function dedupeStayUnitRows(rows: StayUnitRecord[]): StayUnitRecord[] {
  const byKey = new Map<string, StayUnitRecord>();

  for (const row of rows) {
    const dedupeKey = `${row.hostId ?? row.legacyFamilyId ?? "room"}::${row.unitKey || row.name || row.id}`;
    const existing = byKey.get(dedupeKey);
    if (!existing || scoreStayUnitRow(row) > scoreStayUnitRow(existing)) {
      byKey.set(dedupeKey, row);
    }
  }

  return Array.from(byKey.values()).sort((left, right) => {
    if (left.isPrimary !== right.isPrimary) {
      return left.isPrimary ? -1 : 1;
    }
    if (left.sortOrder !== right.sortOrder) {
      return left.sortOrder - right.sortOrder;
    }
    return left.name.localeCompare(right.name);
  });
}

function buildComparableStayUnitSnapshot(row: StayUnitRecord): JsonRecord {
  return {
    unitKey: row.unitKey,
    name: row.name,
    unitType: row.unitType,
    description: row.description ?? null,
    maxGuests: row.maxGuests,
    bedInfo: row.bedInfo ?? null,
    bathroomType: row.bathroomType ?? null,
    roomSizeSqm: row.roomSizeSqm ?? null,
    lat: row.lat ?? null,
    lng: row.lng ?? null,
    priceMorning: row.priceMorning,
    priceAfternoon: row.priceAfternoon,
    priceEvening: row.priceEvening,
    priceFullday: row.priceFullday,
    quarterEnabled: row.quarterEnabled,
    isActive: row.isActive,
    isPrimary: row.isPrimary,
    amenities: dedupeStrings(row.amenities),
    photos: dedupeStrings(row.photos),
    localityPhotos: dedupeStrings(row.localityPhotos),
    sortOrder: row.sortOrder,
  };
}

function stayUnitRowsMatch(existingRows: StayUnitRecord[], desiredRows: JsonRecord[]): boolean {
  const desiredRecords = desiredRows.map((row) => mapStayUnitRow(row));
  if (existingRows.length !== desiredRecords.length) {
    return false;
  }

  const existingSnapshots = existingRows.map(buildComparableStayUnitSnapshot);
  const desiredSnapshots = desiredRecords.map(buildComparableStayUnitSnapshot);
  return JSON.stringify(existingSnapshots) === JSON.stringify(desiredSnapshots);
}

export function mapStayUnitRow(row: JsonRecord): StayUnitRecord {
  return {
    id: asString(row.id),
    hostId: asNullableString(row.host_id),
    legacyFamilyId: asNullableString(row.legacy_family_id),
    unitKey: asString(row.unit_key) || "primary",
    name: asString(row.name) || "Primary room",
    unitType: asString(row.unit_type) || "private_room",
    description: asNullableString(row.description),
    maxGuests: Math.max(1, Math.trunc(asNumber(row.max_guests, 1))),
    bedInfo: asNullableString(row.bed_info),
    bathroomType: asNullableString(row.bathroom_type),
    roomSizeSqm: asNullableNumber(row.room_size_sqm),
    lat: asNullableNumber(row.lat),
    lng: asNullableNumber(row.lng),
    priceMorning: asNumber(row.price_morning),
    priceAfternoon: asNumber(row.price_afternoon),
    priceEvening: asNumber(row.price_evening),
    priceFullday: asNumber(row.price_fullday),
    quarterEnabled: Boolean(row.quarter_enabled ?? true),
    isActive: Boolean(row.is_active ?? true),
    isPrimary: Boolean(row.is_primary ?? true),
    amenities: normalizeAmenityList(asStringArray(row.amenities)),
    photos: asStringArray(row.photos),
    localityPhotos: asStringArray(row.locality_photos),
    blockedDates: [],
    sortOrder: Math.trunc(asNumber(row.sort_order)),
    source: "database",
  };
}

function buildFallbackStayUnit(home: StayUnitHomeInput): StayUnitRecord {
  return {
    id: home.hostId ?? home.legacyFamilyId ?? home.id,
    hostId: home.hostId,
    legacyFamilyId: home.legacyFamilyId,
    unitKey: "primary",
    name: home.listingTitle || home.name || "Primary room",
    unitType: "private_room",
    description: home.description,
    maxGuests: Math.max(1, home.maxGuests ?? 1),
    bedInfo: home.description ? "Host-provided stay" : "1 bed",
    bathroomType: home.bathroomType,
    roomSizeSqm: null,
    lat: home.lat ?? null,
    lng: home.lng ?? null,
    priceMorning: home.priceMorning ?? 0,
    priceAfternoon: home.priceAfternoon ?? 0,
    priceEvening: home.priceEvening ?? 0,
    priceFullday: home.priceFullday ?? 0,
    quarterEnabled: Boolean(home.activeQuarters?.length ?? 0),
    isActive: home.isActive && home.isAccepting,
    isPrimary: true,
    amenities: normalizeAmenityList(home.amenities),
    photos: [],
    localityPhotos: [],
    blockedDates: [],
    sortOrder: 0,
    source: "fallback",
  };
}

function normalizeRoomUnitType(value: unknown): string {
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

function normalizeBathroomType(value: unknown): string | null {
  const next = asNullableString(value);
  if (!next) return null;
  return next.replace(/[,\s•-]+$/, "").replace(/\s+/g, " ").trim() || null;
}

function hasUsefulRoomData(room: JsonRecord): boolean {
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

function buildRoomRowsFromApplication(
  application: JsonRecord,
  context: { hostId: string | null; legacyFamilyId: string }
): JsonRecord[] {
  const payload = pickObject(application.payload);
  const rawRooms = getRoomDraftsFromSource({
    ...application,
    payload,
  });
  const now = new Date().toISOString();

  const rows = rawRooms
    .map((room, index) => {
      const roomRow = pickObject(room);
      if (!hasUsefulRoomData(roomRow)) {
        return null;
      }

      const standardPrice = asNullableNumber(roomRow.standardPrice) ?? asNullableNumber(roomRow.standard_price) ?? 0;
      const lowDemandPrice = asNullableNumber(roomRow.lowDemandPrice) ?? asNullableNumber(roomRow.low_demand_price) ?? 0;
      const highDemandPrice = asNullableNumber(roomRow.highDemandPrice) ?? asNullableNumber(roomRow.high_demand_price) ?? 0;
      const smartPricingEnabled = Boolean(roomRow.smartPricingEnabled ?? roomRow.smart_pricing_enabled);
      const smartPricingMidpoint =
        smartPricingEnabled && (lowDemandPrice > 0 || highDemandPrice > 0)
          ? Math.round((Math.max(0, lowDemandPrice) + Math.max(0, highDemandPrice)) / 2)
          : 0;
      const name = asNullableString(roomRow.roomName) ?? asNullableString(roomRow.name) ?? `Room ${index + 1}`;
      const id = asNullableString(roomRow.id) || `room-${index + 1}`;
      const photos = dedupeStrings([
        ...asStringArray(roomRow.roomPhotos),
        ...asStringArray(roomRow.photos),
        ...asStringArray(roomRow.photo_urls),
      ]);
      const localityPhotos = dedupeStrings([
        ...asStringArray(roomRow.localityPhotos),
        ...asStringArray(roomRow.locality_photos),
        ...asStringArray(roomRow.localityImages),
        ...asStringArray(roomRow.locality_images),
      ]);
      const amenities = normalizeAmenityList(dedupeStrings([
        ...asStringArray(roomRow.roomAmenities),
        ...asStringArray(roomRow.amenities),
      ]));
      const descriptionParts = [
        asNullableString(roomRow.roomConfiguration),
        asNullableString(roomRow.balcony),
        asNullableString(roomRow.roomVibe),
        asNullableString(roomRow.description),
      ].filter((part): part is string => Boolean(part));

      return {
        host_id: context.hostId,
        legacy_family_id: context.legacyFamilyId,
        unit_key: id,
        name,
        unit_type: normalizeRoomUnitType(roomRow.roomType ?? roomRow.room_type ?? roomRow.unitType ?? roomRow.unit_type),
        description: descriptionParts.length > 0 ? descriptionParts.join(" • ") : null,
        max_guests: Math.max(1, asNullableNumber(roomRow.maxGuests) ?? 1),
        bed_info: asNullableString(roomRow.bedConfiguration) || null,
        bathroom_type: normalizeBathroomType(roomRow.bathroomType) || normalizeBathroomType(roomRow.roomConfiguration) || null,
        room_size_sqm: asNullableNumber(roomRow.roomSizeSqm) ?? null,
        lat: asNullableNumber(roomRow.lat) ?? null,
        lng: asNullableNumber(roomRow.lng) ?? null,
        price_morning: smartPricingEnabled ? lowDemandPrice || standardPrice : standardPrice,
        price_afternoon: smartPricingEnabled ? smartPricingMidpoint || standardPrice || lowDemandPrice || highDemandPrice : standardPrice || lowDemandPrice || highDemandPrice,
        price_evening: smartPricingEnabled ? highDemandPrice || standardPrice : standardPrice,
        price_fullday: standardPrice || highDemandPrice || lowDemandPrice,
        quarter_enabled: smartPricingEnabled || standardPrice > 0 || lowDemandPrice > 0 || highDemandPrice > 0,
        is_active: roomRow.isActive === false ? false : true,
        is_primary: index === 0,
        amenities,
        photos,
        sort_order: asNumber(roomRow.sortOrder, index),
        updated_at: now,
      };
    })
    .filter(Boolean) as JsonRecord[];

  return rows;
}

async function loadRowsForSelector(
  supabase: SupabaseClient,
  selector: { column: "host_id" | "legacy_family_id"; value: string }
): Promise<StayUnitRecord[]> {
  const { data, error } = await supabase
    .from("stay_units_v2")
    .select("*")
    .eq(selector.column, selector.value)
    .order("is_primary", { ascending: false })
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    const message = String(error.message ?? "");
    if (/relation|does not exist|schema cache/i.test(message)) {
      return [];
    }
    console.warn("[stay-units] query failed", error);
    return [];
  }

  return Array.isArray(data) ? data.map((row) => mapStayUnitRow(row as JsonRecord)) : [];
}

async function fetchStayUnitRowsRaw(
  supabase: SupabaseClient,
  selector: { hostId?: string | null; legacyFamilyId?: string | null }
): Promise<StayUnitRecord[]> {
  const hostId = asNullableString(selector.hostId);
  const legacyFamilyId = asNullableString(selector.legacyFamilyId);
  const collectedRows: StayUnitRecord[] = [];

  if (hostId) {
    const hostRows = await loadRowsForSelector(supabase, { column: "host_id", value: hostId });
    collectedRows.push(...hostRows);
  }

  if (legacyFamilyId) {
    const familyRows = await loadRowsForSelector(supabase, { column: "legacy_family_id", value: legacyFamilyId });
    collectedRows.push(...familyRows);
  }

  return dedupeStayUnitRows(collectedRows);
}

async function loadApprovedRoomSourceForFamily(
  supabase: SupabaseClient,
  familyId: string
): Promise<JsonRecord | null> {
  const normalizedFamilyId = asNullableString(familyId);
  if (!normalizedFamilyId) {
    return null;
  }

  const { data: drafts, error: draftError } = await supabase
    .from("host_onboarding_drafts")
    .select("*")
    .eq("family_id", normalizedFamilyId)
    .in("listing_status", ["approved", "live", "published"])
    .order("updated_at", { ascending: false })
    .limit(5);

  if (draftError) {
    console.warn("[stay-units] approved draft lookup failed", draftError);
  } else if (Array.isArray(drafts)) {
    const preferredDraft = drafts.find((row) => countRoomsFromSource(row as JsonRecord) > 0);
    if (preferredDraft && typeof preferredDraft === "object") {
      return preferredDraft as JsonRecord;
    }
  }

  const { data: applications, error: applicationError } = await supabase
    .from("family_applications")
    .select("*")
    .eq("approved_family_id", normalizedFamilyId)
    .order("created_at", { ascending: false })
    .limit(5);

  if (applicationError) {
    console.warn("[stay-units] approved application lookup failed", applicationError);
    return null;
  }

  if (!Array.isArray(applications)) {
    return null;
  }

  const preferredApplication = applications.find((row) => countRoomsFromSource(row as JsonRecord) > 0);
  return preferredApplication && typeof preferredApplication === "object"
    ? (preferredApplication as JsonRecord)
    : null;
}

async function repairStayUnitsFromApprovedSource(
  supabase: SupabaseClient,
  selector: { hostId?: string | null; legacyFamilyId?: string | null },
  existingRows: StayUnitRecord[]
): Promise<StayUnitRecord[]> {
  const legacyFamilyId = asNullableString(selector.legacyFamilyId) ?? existingRows[0]?.legacyFamilyId ?? null;
  if (!legacyFamilyId) {
    return existingRows;
  }

  const roomSource = await loadApprovedRoomSourceForFamily(supabase, legacyFamilyId);
  if (!roomSource) {
    return existingRows;
  }

  const expectedRoomCount = countRoomsFromSource(roomSource);
  if (expectedRoomCount === 0) {
    return existingRows;
  }

  const desiredRows = buildRoomRowsFromApplication(normalizeApplicationSource(roomSource), {
    hostId: asNullableString(selector.hostId) ?? null,
    legacyFamilyId,
  });
  const shouldRepairByMismatch = desiredRows.length > 0 && !stayUnitRowsMatch(existingRows, desiredRows);
  const shouldRepair =
    existingRows.length === 0 ||
    shouldRepairByMismatch ||
    (
      looksLikePlaceholderRows(existingRows) &&
      existingRows.length !== expectedRoomCount
    );

  if (!shouldRepair) {
    return existingRows;
  }

  try {
    await syncPrimaryStayUnitForFamily(supabase, {
      familyId: legacyFamilyId,
      application: normalizeApplicationSource(roomSource),
    });
  } catch (error) {
    console.error("[stay-units] approved room repair failed", error);
    return existingRows;
  }

  return fetchStayUnitRowsRaw(supabase, selector);
}

export async function loadStayUnitsForSelector(
  supabase: SupabaseClient,
  selector: { hostId?: string | null; legacyFamilyId?: string | null }
): Promise<StayUnitRecord[]> {
  const rows = await fetchStayUnitRowsRaw(supabase, selector);
  return repairStayUnitsFromApprovedSource(supabase, selector, rows);
}

export async function loadStayUnitsForHome(
  supabase: SupabaseClient,
  home: StayUnitHomeInput
): Promise<StayUnitRecord[]> {
  const rows = await loadStayUnitsForSelector(supabase, {
    hostId: home.hostId,
    legacyFamilyId: home.legacyFamilyId,
  });

  if (rows.length > 0) {
    return rows;
  }

  return [buildFallbackStayUnit(home)];
}

export async function loadStayUnitById(
  supabase: SupabaseClient,
  roomId: string
): Promise<StayUnitRecord | null> {
  const nextRoomId = asNullableString(roomId);
  if (!nextRoomId) {
    return null;
  }

  const { data, error } = await supabase
    .from("stay_units_v2")
    .select("*")
    .eq("id", nextRoomId)
    .maybeSingle();

  if (error) {
    const message = String(error.message ?? "");
    if (/relation|does not exist|schema cache/i.test(message)) {
      return null;
    }
    throw error;
  }

  return data ? mapStayUnitRow(data as JsonRecord) : null;
}

export async function resolvePrimaryStayUnitId(
  supabase: SupabaseClient,
  selector: { hostId?: string | null; legacyFamilyId?: string | null }
): Promise<string | null> {
  const rows = await loadStayUnitsForSelector(supabase, selector);
  return rows.find((row) => row.isPrimary)?.id ?? rows[0]?.id ?? null;
}

export async function syncPrimaryStayUnitForFamily(
  supabase: SupabaseClient,
  input: {
    familyId: string;
    application?: JsonRecord;
  }
): Promise<{ stayUnitId: string | null }> {
  const familyId = asNullableString(input.familyId);
  if (!familyId) {
    return { stayUnitId: null };
  }

  const [{ data: family, error: familyError }, { data: host, error: hostError }] = await Promise.all([
    supabase.from("families").select("*").eq("id", familyId).maybeSingle(),
    supabase.from("hosts").select("*").eq("legacy_family_id", familyId).maybeSingle(),
  ]);

  if (familyError) throw familyError;
  if (hostError) throw hostError;
  if (!family) return { stayUnitId: null };

  const hostId = asNullableString((host as JsonRecord | null)?.id);
  const roomsFromApplication = input.application
    ? buildRoomRowsFromApplication(input.application, { hostId, legacyFamilyId: familyId })
    : [];

  if (roomsFromApplication.length > 0) {
    if (hostId) {
      const { error: deleteHostRoomsError } = await supabase.from("stay_units_v2").delete().eq("host_id", hostId);
      if (deleteHostRoomsError) throw deleteHostRoomsError;
    }

    const { error: deleteFamilyRoomsError } = await supabase.from("stay_units_v2").delete().eq("legacy_family_id", familyId);
    if (deleteFamilyRoomsError) throw deleteFamilyRoomsError;

    const { data: insertedRooms, error: insertRoomsError } = await supabase
      .from("stay_units_v2")
      .insert(roomsFromApplication as never)
      .select("id,is_primary");

    if (insertRoomsError) throw insertRoomsError;

    const primaryRow = Array.isArray(insertedRooms)
      ? insertedRooms.find((row) => Boolean((row as JsonRecord).is_primary)) ?? insertedRooms[0] ?? null
      : null;

    return {
      stayUnitId: asNullableString((primaryRow as JsonRecord | null)?.id),
    };
  }

  const mediaPromise = hostId
    ? supabase
        .from("host_media")
        .select("media_url,is_primary,sort_order,created_at")
        .eq("host_id", hostId)
        .order("is_primary", { ascending: false })
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true })
    : supabase
        .from("family_photos")
        .select("url,is_primary,created_at")
        .eq("family_id", familyId)
        .order("is_primary", { ascending: false })
        .order("created_at", { ascending: true });

  const { data: mediaRows, error: mediaError } = await mediaPromise;
  if (mediaError) throw mediaError;

  const photos = dedupeStrings(
    (mediaRows ?? []).map((row) => {
      const item = row as JsonRecord;
      return asString(item.media_url ?? item.url);
    })
  );

  const stayUnitPayload: JsonRecord = {
    host_id: hostId,
    legacy_family_id: familyId,
    unit_key: "primary",
    name:
      asNullableString((family as JsonRecord).name) ??
      asNullableString((host as JsonRecord | null)?.display_name) ??
      "Primary room",
    unit_type: asNullableString((family as JsonRecord).room_type) ?? "private_room",
    description:
      asNullableString((host as JsonRecord | null)?.about) ??
      asNullableString((family as JsonRecord).about) ??
      asNullableString((family as JsonRecord).description),
    max_guests:
      asNullableNumber((host as JsonRecord | null)?.max_guests) ??
      asNullableNumber((family as JsonRecord).max_guests) ??
      1,
    bed_info: asNullableString((family as JsonRecord).family_composition) ?? "1 bed",
    bathroom_type:
      asNullableString((host as JsonRecord | null)?.bathroom_type) ??
      asNullableString((family as JsonRecord).bathroom_type),
    room_size_sqm: asNullableNumber((family as JsonRecord).room_size_sqm),
    lat: asNullableNumber((host as JsonRecord | null)?.lat) ?? asNullableNumber((family as JsonRecord).lat),
    lng: asNullableNumber((host as JsonRecord | null)?.lng) ?? asNullableNumber((family as JsonRecord).lng),
    price_morning:
      asNumber((host as JsonRecord | null)?.price_morning) ||
      asNumber((family as JsonRecord).price_morning),
    price_afternoon:
      asNumber((host as JsonRecord | null)?.price_afternoon) ||
      asNumber((family as JsonRecord).price_afternoon),
    price_evening:
      asNumber((host as JsonRecord | null)?.price_evening) ||
      asNumber((family as JsonRecord).price_evening),
    price_fullday:
      asNumber((host as JsonRecord | null)?.price_fullday) ||
      asNumber((family as JsonRecord).price_fullday),
    quarter_enabled:
      asNumber((host as JsonRecord | null)?.price_morning) > 0 ||
      asNumber((host as JsonRecord | null)?.price_afternoon) > 0 ||
      asNumber((host as JsonRecord | null)?.price_evening) > 0 ||
      asNumber((host as JsonRecord | null)?.price_fullday) > 0 ||
      asNumber((family as JsonRecord).price_morning) > 0 ||
      asNumber((family as JsonRecord).price_afternoon) > 0 ||
      asNumber((family as JsonRecord).price_evening) > 0 ||
      asNumber((family as JsonRecord).price_fullday) > 0,
    is_active:
      (host ? Boolean((host as JsonRecord).status === "published") : true) &&
      Boolean((host as JsonRecord | null)?.is_accepting ?? (family as JsonRecord).is_active),
    is_primary: true,
    amenities: normalizeAmenityList(
      asStringArray((host as JsonRecord | null)?.amenities).length > 0
        ? asStringArray((host as JsonRecord | null)?.amenities)
        : asStringArray((family as JsonRecord).amenities)
    ),
    photos,
    sort_order: 0,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("stay_units_v2")
    .upsert(stayUnitPayload as never, { onConflict: "host_id,unit_key" })
    .select("id")
    .single();

  if (error) {
    throw error;
  }

  return {
    stayUnitId: typeof data?.id === "string" ? data.id : null,
  };
}
