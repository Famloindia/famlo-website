import crypto from "crypto";
import { after, NextRequest, NextResponse } from "next/server";

import { evaluateRuntimeSafety } from "@/lib/app-env";
import { enqueueChannexAriSyncJobs, triggerQueuedChannexSyncWorker } from "@/lib/channex-ari-jobs";
import {
  enqueueChannexRoomOccupancyJob,
  enqueueChannexRoomProvisioningJob,
  queuedRoomSyncStatus,
} from "@/lib/channex-room-sync-jobs";
import { resolveAuthorizedHostResource } from "@/lib/host-access";
import { loadHostProAccess } from "@/lib/host-pro-access";
import { projectInventoryRange } from "@/lib/inventory";
import {
  assertPaidHostProAddonOrderAvailable,
  buildHostProAddonQuote,
  consumePaidHostProAddonOrder,
} from "@/lib/pro-billing/service";
import { buildCalendarExportUrl } from "@/lib/calendar-export";
import { loadStayUnitsForSelector, mapStayUnitRow } from "@/lib/stay-units";
import { normalizeAmenityList } from "@/lib/room-amenities";
import { createAdminSupabaseClient } from "@/lib/supabase";

type JsonRecord = Record<string, unknown>;
type RoomOccupancySyncStatus = {
  status: "not_mapped" | "queued" | "synced" | "failed";
  message: string;
  externalRoomTypeId: string | null;
  externalRatePlanIds: string[];
};

type NonBlockingSaveWarning = {
  step: string;
  message: string;
};

function withCanonicalStayUnitIdentifiers<T extends JsonRecord>(
  stayUnit: T,
  input: { canonicalStayUnitId: string | null; familyId: string; unitKey?: string | null }
): T & { unitId: string | null; canonicalStayUnitId: string | null; familyId: string; propertyId: string } {
  const canonicalStayUnitId = input.canonicalStayUnitId ?? asNullableString(stayUnit.id);
  return {
    ...stayUnit,
    id: canonicalStayUnitId ?? stayUnit.id,
    unitId: canonicalStayUnitId,
    canonicalStayUnitId,
    familyId: input.familyId,
    propertyId: input.familyId,
    unitKey: input.unitKey ?? asNullableString(stayUnit.unitKey) ?? null,
  };
}

function nudgeRoomChannexWorker(input: {
  requestUrl: string;
  workerId: string;
  limit?: number;
  passes?: number;
  warnings: NonBlockingSaveWarning[];
}): void {
  after(async () => {
    try {
      const triggered = await triggerQueuedChannexSyncWorker({
        requestUrl: input.requestUrl,
        workerId: input.workerId,
        limit: input.limit,
        passes: input.passes,
      });
      if (!triggered) {
        console.warn("[stay-units] Channex worker nudge did not run; queued job remains for cron/retry.", {
          workerId: input.workerId,
        });
      }
    } catch (error) {
      console.warn("[stay-units] Channex worker nudge failed; queued job remains for cron/retry.", {
        workerId: input.workerId,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });
}

function logDuration(label: string, startedAt: number, status: number, familyId: string, extra?: Record<string, string | number | null | undefined>): void {
  if (process.env.NODE_ENV === "production") return;
  const meta = Object.entries(extra ?? {})
    .filter(([, value]) => value != null)
    .map(([key, value]) => `${key}=${value}`)
    .join(" ");
  console.info(`${label} ${status} ${Date.now() - startedAt}ms familyId=${familyId}${meta ? ` ${meta}` : ""}`);
}

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

function asNullableInteger(value: unknown): number | null {
  const parsed = asNullableNumber(value);
  return parsed == null ? null : Math.trunc(parsed);
}

function coerceIntegerCompatibleField(value: unknown): number | null {
  const parsed = asNullableNumber(value);
  return parsed == null ? null : Math.trunc(parsed);
}

function asBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(normalized)) return true;
    if (["false", "0", "no", "off"].includes(normalized)) return false;
  }
  return fallback;
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter((item) => item.length > 0);
  }

  if (typeof value === "string") {
    return value
      .split(/[\n,]/)
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }

  return [];
}

function normalizeMoney(value: unknown, fallback = 0): number {
  const amount = Math.max(0, asNumber(value, fallback));
  return Number(amount.toFixed(2));
}

function makeUnitKey(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
  return `room-${slug || "unit"}-${Date.now().toString(36)}`;
}

function makeIdempotentCreateUnitKey(name: string, draftReference: string | null): string {
  if (!draftReference) return makeUnitKey(name);
  if (!draftReference.startsWith("temp-")) return draftReference;

  const digest = crypto.createHash("sha256").update(draftReference).digest("hex").slice(0, 24);
  return `draft-${digest}`;
}

function addIndiaDays(date: string, days: number): string {
  const base = new Date(`${date}T00:00:00.000Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

function extractMissingColumnFromSchemaError(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const message = "message" in error && typeof error.message === "string" ? error.message : "";
  const match = message.match(/Could not find the '([^']+)' column/i);
  return match?.[1] ?? null;
}

function hasInvalidIntegerSyntaxError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = "code" in error && typeof error.code === "string" ? error.code : "";
  const message = "message" in error && typeof error.message === "string" ? error.message : "";
  return code === "22P02" && /invalid input syntax for type integer/i.test(message);
}

function isNonIntegerNumber(value: unknown): boolean {
  if (typeof value === "number" && Number.isFinite(value)) {
    return !Number.isInteger(value);
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && !Number.isInteger(parsed);
  }
  return false;
}

function pickObject(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function mergeRoomIntoDraftRooms(
  currentRooms: unknown,
  roomPatch: JsonRecord,
  identity: { roomId: string | null; unitKey: string | null; name: string }
): JsonRecord[] {
  const rooms = Array.isArray(currentRooms)
    ? currentRooms
        .filter((room): room is JsonRecord => Boolean(room && typeof room === "object" && !Array.isArray(room)))
        .map((room) => ({ ...room }))
    : [];

  const roomIndex = rooms.findIndex((room) => {
    const roomId = asNullableString(room.id);
    const roomName = asNullableString(room.roomName ?? room.name);
    return (
      (identity.roomId != null && roomId === identity.roomId) ||
      (identity.unitKey != null && roomId === identity.unitKey) ||
      roomName === identity.name
    );
  });

  if (roomIndex >= 0) {
    rooms[roomIndex] = {
      ...rooms[roomIndex],
      ...roomPatch,
    };
    return rooms;
  }

  return [...rooms, roomPatch];
}

async function syncRoomDraftPayload(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  familyId: string,
  roomIdentity: { roomId: string | null; unitKey: string | null; name: string },
  roomPatch: JsonRecord
): Promise<void> {
  const { data: drafts } = await supabase
    .from("host_onboarding_drafts")
    .select("id,payload")
    .eq("family_id", familyId)
    .in("listing_status", ["approved", "live", "published"])
    .order("updated_at", { ascending: false })
    .limit(5);

  if (!Array.isArray(drafts) || drafts.length === 0) {
    return;
  }

  for (const draft of drafts) {
    const draftRecord = pickObject(draft);
    const payload = pickObject(draftRecord.payload);
    const nextRooms = mergeRoomIntoDraftRooms(payload.rooms, roomPatch, roomIdentity);
    const nextPayload: JsonRecord = {
      ...payload,
      rooms: nextRooms,
    };

    await supabase
      .from("host_onboarding_drafts")
      .update({
        payload: nextPayload,
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id", asString(draftRecord.id));
  }
}

async function mutateStayUnitWithSchemaFallback(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  mode: "insert" | "update",
  payload: JsonRecord,
  unitId?: string | null
): Promise<{ data: JsonRecord | null; error: unknown; strippedColumns: string[] }> {
  const workingPayload: JsonRecord = { ...payload };
  const strippedColumns: string[] = [];

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const query =
      mode === "update"
        ? supabase
            .from("stay_units_v2")
            .update(workingPayload as never)
            .eq("id", unitId ?? "")
            .select("*")
            .maybeSingle()
        : supabase.from("stay_units_v2").insert(workingPayload as never).select("*").maybeSingle();

    const { data, error } = await query;
    if (!error) {
      return { data: (data as JsonRecord | null) ?? null, error: null, strippedColumns };
    }

    if (hasInvalidIntegerSyntaxError(error)) {
      let coercedIntegerColumn = false;
      for (const column of ["max_guests", "sort_order", "room_size_sqm"] as const) {
        if (!(column in workingPayload)) continue;
        const nextValue = coerceIntegerCompatibleField(workingPayload[column]);
        if (nextValue == null) continue;
        if (workingPayload[column] !== nextValue) {
          workingPayload[column] = nextValue;
          strippedColumns.push(`${column}:coerced_integer`);
          coercedIntegerColumn = true;
          break;
        }
      }
      if (coercedIntegerColumn) {
        continue;
      }

      const invalidIntegerColumn = ["max_guests", "sort_order", "room_size_sqm"]
        .find((column) => column in workingPayload && isNonIntegerNumber(workingPayload[column]));
      if (invalidIntegerColumn) {
        delete workingPayload[invalidIntegerColumn];
        strippedColumns.push(invalidIntegerColumn);
        continue;
      }
    }

    const missingColumn = extractMissingColumnFromSchemaError(error);
    if (!missingColumn || !(missingColumn in workingPayload)) {
      return { data: null, error, strippedColumns };
    }

    delete workingPayload[missingColumn];
    strippedColumns.push(missingColumn);
  }

  return {
    data: null,
    error: new Error("Schema fallback exhausted for stay_units_v2."),
    strippedColumns,
  };
}

async function resolveHostContext(supabase: ReturnType<typeof createAdminSupabaseClient>, familyId: string): Promise<{
  legacyFamilyId: string;
  hostId: string | null;
}> {
  const { data: family } = await supabase
    .from("families")
    .select("id")
    .eq("id", familyId)
    .maybeSingle();

  if (!family) {
    return { legacyFamilyId: familyId, hostId: null };
  }

  const { data: host } = await supabase
    .from("hosts")
    .select("id")
    .eq("legacy_family_id", familyId)
    .maybeSingle();

  return {
    legacyFamilyId: familyId,
    hostId: asNullableString((host as JsonRecord | null)?.id),
  };
}

async function loadCompactStayUnitsForList(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  input: {
    familyId: string;
    hostId: string | null;
    legacyFamilyId: string;
  }
): Promise<Array<Record<string, unknown>>> {
  const traceStartedAt = Date.now();
  let query = supabase
    .from("stay_units_v2")
    .select("id,host_id,legacy_family_id,unit_key,name,unit_type,description,max_guests,bed_info,bathroom_type,toilet_types,toilet_type,room_size_sqm,lat,lng,price_morning,price_afternoon,price_evening,price_fullday,quarter_enabled,is_active,is_primary,amenities,photos,locality_photos,updated_at,sort_order")
    .order("is_primary", { ascending: false })
    .order("sort_order", { ascending: true })
    .order("updated_at", { ascending: false })
    .limit(200);

  if (input.hostId) {
    query = query.eq("host_id", input.hostId);
  } else {
    query = query.eq("legacy_family_id", input.legacyFamilyId);
  }

  const { data, error } = await query;
  if (error) {
    console.warn("[host.stay-units:list] compact query fallback", {
      familyId: input.familyId,
      hostId: input.hostId,
      durationMs: Date.now() - traceStartedAt,
      message: error.message,
    });
    return [];
  }

  const dedupedRowsByUnitKey = new Map<string, Record<string, unknown>>();
  for (const row of (data ?? []) as Array<Record<string, unknown>>) {
    const rowRecord = row as JsonRecord;
    const dedupeKey =
      asNullableString(rowRecord.unit_key) ??
      asNullableString(rowRecord.id) ??
      `${asString(rowRecord.name)}-${asString(rowRecord.updated_at)}`;
    if (!dedupedRowsByUnitKey.has(dedupeKey)) {
      dedupedRowsByUnitKey.set(dedupeKey, rowRecord);
    }
  }

  const rows = Array.from(dedupedRowsByUnitKey.values()).map((row) => ({
    ...row,
    detailLevel: "list",
  }));
  if (process.env.NODE_ENV !== "production") {
    console.info(`[host.stay-units:list] compact_query ${Date.now() - traceStartedAt}ms familyId=${input.familyId} rows=${rows.length}`);
  }
  return rows;
}

async function loadChannexMappingReadiness(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  input: { familyId: string; stayUnitId: string }
): Promise<{ hasRoomMapping: boolean; hasRatePlan: boolean }> {
  const [{ data: roomMapping, error: roomMappingError }, { data: ratePlan, error: ratePlanError }] = await Promise.all([
    supabase
      .from("channel_room_mappings")
      .select("id,external_room_type_id,sync_status")
      .eq("family_id", input.familyId)
      .eq("provider_code", "channex")
      .eq("stay_unit_id", input.stayUnitId)
      .maybeSingle(),
    supabase
      .from("channel_rate_plans")
      .select("id,external_rate_plan_id,sync_status")
      .eq("family_id", input.familyId)
      .eq("provider_code", "channex")
      .eq("stay_unit_id", input.stayUnitId)
      .maybeSingle(),
  ]);
  if (roomMappingError) throw roomMappingError;
  if (ratePlanError) throw ratePlanError;

  const roomMappingRecord = (roomMapping as JsonRecord | null) ?? null;
  const ratePlanRecord = (ratePlan as JsonRecord | null) ?? null;
  return {
    hasRoomMapping: Boolean(asNullableString(roomMappingRecord?.external_room_type_id)),
    hasRatePlan: Boolean(asNullableString(ratePlanRecord?.external_rate_plan_id)),
  };
}

async function findExistingStayUnitIdForSave(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  input: {
    hostId: string | null;
    legacyFamilyId: string;
    unitKey: string | null;
    name: string;
    allowNameFallback?: boolean;
  }
): Promise<string | null> {
  if (input.unitKey) {
    let query = supabase
      .from("stay_units_v2")
      .select("id")
      .eq("unit_key", input.unitKey)
      .eq("legacy_family_id", input.legacyFamilyId)
      .order("updated_at", { ascending: false })
      .limit(5);

    if (input.hostId) {
      query = query.eq("host_id", input.hostId);
    }

    const { data, error } = await query;
    if (error) throw error;
    const existingId = Array.isArray(data) ? asNullableString((data[0] as JsonRecord | undefined)?.id) : null;
    if (existingId) return existingId;
  }

  if (input.allowNameFallback === false) {
    return null;
  }

  const { data: sameNameRows, error: sameNameError } = await supabase
    .from("stay_units_v2")
    .select("id")
    .eq("legacy_family_id", input.legacyFamilyId)
    .eq("name", input.name)
    .order("updated_at", { ascending: false })
    .limit(5);
  if (sameNameError) throw sameNameError;
  return Array.isArray(sameNameRows) ? asNullableString((sameNameRows[0] as JsonRecord | undefined)?.id) : null;
}

async function resolveCanonicalStayUnitId(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  input: {
    candidateId: string | null;
    hostId: string | null;
    legacyFamilyId: string;
    unitKey: string | null;
    name: string;
  }
): Promise<string | null> {
  if (
    input.candidateId &&
    input.candidateId !== input.unitKey &&
    (await doesStayUnitExist(supabase, {
      unitId: input.candidateId,
      hostId: input.hostId,
      legacyFamilyId: input.legacyFamilyId,
    }))
  ) {
    return input.candidateId;
  }

  return findExistingStayUnitIdForSave(supabase, {
    hostId: input.hostId,
    legacyFamilyId: input.legacyFamilyId,
    unitKey: input.unitKey,
    name: input.name,
    allowNameFallback: true,
  });
}

async function loadVerifiedSavedStayUnitRow(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  input: {
    candidateId: string | null;
    hostId: string | null;
    familyId: string;
    legacyFamilyId: string;
    unitKey: string | null;
    clientId: string | null;
    name: string;
    operation: "create" | "update";
  }
): Promise<JsonRecord | null> {
  const selectColumns = "*";
  const applyScope = (query: ReturnType<typeof supabase.from>) => {
    let scoped = query.select(selectColumns).eq("legacy_family_id", input.legacyFamilyId);
    if (input.hostId) scoped = scoped.eq("host_id", input.hostId);
    return scoped;
  };

  if (input.candidateId) {
    const { data, error } = await applyScope(supabase.from("stay_units_v2"))
      .eq("id", input.candidateId)
      .maybeSingle();
    if (error) throw error;
    if (data) return data as JsonRecord;
  }

  const lookupUnitKeys = [input.unitKey, input.clientId, input.candidateId]
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter((value, index, values) => value.length > 0 && values.indexOf(value) === index);
  if (lookupUnitKeys.length > 0) {
    const { data, error } = await applyScope(supabase.from("stay_units_v2"))
      .in("unit_key", lookupUnitKeys)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (data) return data as JsonRecord;
  }

  const { data: byName, error: byNameError } = await applyScope(supabase.from("stay_units_v2"))
    .eq("name", input.name)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (byNameError) throw byNameError;
  if (byName) return byName as JsonRecord;

  const { data: byIdWithoutScope } = input.candidateId
    ? await supabase.from("stay_units_v2").select("id,host_id,legacy_family_id,unit_key,name,created_at,updated_at").eq("id", input.candidateId).maybeSingle()
    : { data: null };
  const { data: byFamilyClientId } = input.clientId
    ? await supabase
        .from("stay_units_v2")
        .select("id,host_id,legacy_family_id,unit_key,name,created_at,updated_at")
        .eq("legacy_family_id", input.legacyFamilyId)
        .eq("unit_key", input.clientId)
        .maybeSingle()
    : { data: null };
  const { data: byFamilyRoomName } = await supabase
    .from("stay_units_v2")
    .select("id,host_id,legacy_family_id,unit_key,name,created_at,updated_at")
    .eq("legacy_family_id", input.legacyFamilyId)
    .eq("name", input.name)
    .order("updated_at", { ascending: false })
    .limit(3);

  console.error("[stay-units:save] verified row lookup failed", {
    operation: input.operation,
    familyId: input.familyId,
    legacyFamilyId: input.legacyFamilyId,
    hostId: input.hostId,
    candidateId: input.candidateId,
    unitKey: input.unitKey,
    clientId: input.clientId,
    name: input.name,
    byIdWithoutScope,
    byFamilyClientId,
    byFamilyRoomName,
  });

  return null;
}

async function doesStayUnitExist(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  input: {
    unitId: string;
    hostId: string | null;
    legacyFamilyId: string;
  }
): Promise<boolean> {
  let query = supabase
    .from("stay_units_v2")
    .select("id")
    .eq("id", input.unitId)
    .eq("legacy_family_id", input.legacyFamilyId);

  if (input.hostId) {
    query = query.eq("host_id", input.hostId);
  }

  const rowQuery = query.limit(1).maybeSingle();

  const { data, error } = await rowQuery;
  if (error) throw error;
  return Boolean(asNullableString((data as JsonRecord | null)?.id));
}

async function collapseDuplicateStayUnits(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  input: {
    familyId: string;
    keepUnitId: string;
    unitKey: string | null;
    aliasUnitKeys?: Array<string | null | undefined>;
  }
): Promise<void> {
  const unitKeys = Array.from(new Set([
    input.unitKey,
    ...(input.aliasUnitKeys ?? []),
  ].map((value) => asNullableString(value)).filter((value): value is string => Boolean(value))));
  if (unitKeys.length === 0) return;

  const { data: rows, error } = await supabase
    .from("stay_units_v2")
    .select("id")
    .eq("legacy_family_id", input.familyId)
    .in("unit_key", unitKeys)
    .order("updated_at", { ascending: false });
  if (error) throw error;

  const duplicateIds = (rows ?? [])
    .map((row) => asNullableString((row as JsonRecord).id))
    .filter((value): value is string => Boolean(value) && value !== input.keepUnitId);
  if (duplicateIds.length === 0) return;

  const migrationResults = await Promise.all([
    supabase.from("channel_room_mappings").update({ stay_unit_id: input.keepUnitId } as never).in("stay_unit_id", duplicateIds),
    supabase.from("channel_rate_plans").update({ stay_unit_id: input.keepUnitId } as never).in("stay_unit_id", duplicateIds),
    supabase.from("inventory_event_log").update({ stay_unit_id: input.keepUnitId } as never).in("stay_unit_id", duplicateIds),
    supabase.from("inventory_day_projection").update({ stay_unit_id: input.keepUnitId } as never).in("stay_unit_id", duplicateIds),
    supabase
      .from("calendar_events")
      .update({ owner_id: input.keepUnitId } as never)
      .eq("owner_type", "stay_unit")
      .in("owner_id", duplicateIds),
  ]);
  for (const result of migrationResults) {
    if (result.error) throw result.error;
  }

  const { error: deleteError } = await supabase.from("stay_units_v2").delete().in("id", duplicateIds);
  if (deleteError) throw deleteError;
}

function toListStayUnit(room: ReturnType<typeof mapStayUnitRow> | Record<string, unknown>) {
  const rawRecord = room as Record<string, unknown>;
  const record =
    "maxGuests" in rawRecord || "priceFullday" in rawRecord || "unitKey" in rawRecord
      ? (room as ReturnType<typeof mapStayUnitRow>)
      : mapStayUnitRow(rawRecord as JsonRecord);
  return {
    id: record.id,
    detailLevel: "list" as const,
    unitKey: record.unitKey,
    name: record.name,
    unitType: record.unitType,
    maxGuests: record.maxGuests,
    description: record.description,
    bedInfo: record.bedInfo,
    bathroomType: record.bathroomType,
    toiletTypes: record.toiletTypes,
    roomSizeSqm: record.roomSizeSqm,
    lat: record.lat,
    lng: record.lng,
    priceMorning: record.priceMorning,
    priceAfternoon: record.priceAfternoon,
    priceEvening: record.priceEvening,
    priceFullday: record.priceFullday,
    quarterEnabled: record.quarterEnabled,
    isActive: record.isActive,
    isPrimary: record.isPrimary,
    amenities: record.amenities,
    photos: record.photos?.[0] ? [record.photos[0]] : [],
    localityPhotos: record.localityPhotos,
    sortOrder: record.sortOrder,
    source: record.source,
  };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const startedAt = Date.now();
  const familyId = request.nextUrl.searchParams.get("familyId");
  const view = request.nextUrl.searchParams.get("view") === "list" ? "list" : "full";
  if (!familyId) {
    const response = NextResponse.json({ error: "Missing familyId." }, { status: 400 });
    logDuration("[host.stay-units]", startedAt, 400, "");
    return response;
  }

  const supabase = createAdminSupabaseClient();
  const hostAccess = await resolveAuthorizedHostResource(supabase, request, { familyId });
  if (!hostAccess) {
    const response = NextResponse.json({ error: "You do not have access to these rooms." }, { status: 403 });
    logDuration("[host.stay-units]", startedAt, 403, familyId);
    return response;
  }
  const hostId = hostAccess.hostId;
  const legacyFamilyId = hostAccess.familyId ?? familyId;
  if (view === "list") {
    const compactStayUnits = await loadCompactStayUnitsForList(supabase, { familyId, hostId, legacyFamilyId });
    if (compactStayUnits.length > 0) {
      const response = NextResponse.json({
        stayUnits: compactStayUnits.map((room) => toListStayUnit(room)),
      });
      logDuration("[host.stay-units]", startedAt, 200, familyId, { rooms: compactStayUnits.length, view, source: "compact" });
      return response;
    }
  }
  const stayUnits = await loadStayUnitsForSelector(supabase, { hostId, legacyFamilyId });
  if (view === "list") {
    const response = NextResponse.json({
      stayUnits: stayUnits.map((room) => toListStayUnit(room)),
    });
    logDuration("[host.stay-units]", startedAt, 200, familyId, { rooms: stayUnits.length, view, source: "selector_fallback" });
    return response;
  }
  const roomIds = stayUnits
    .map((room) => asNullableString(room.id))
    .filter((roomId): roomId is string => Boolean(roomId));

  const exportUrlsByRoom = new Map<string, { exportUrl: string; publicExportUrl: string | null }>();
  if (roomIds.length > 0) {
    try {
      const { data: exportConnections, error: exportError } = await supabase
        .from("channel_manager_connections")
        .select("owner_id,metadata")
        .eq("owner_type", "stay_unit")
        .eq("provider", "famlo_export")
        .in("owner_id", roomIds);

      if (exportError) {
        throw exportError;
      }

      for (const row of (exportConnections ?? []) as Array<{ owner_id?: string | null; metadata?: unknown }>) {
        const ownerId = asNullableString(row.owner_id);
        const metadata = pickObject(row.metadata);
        const exportToken = asNullableString(metadata.export_token);
        if (!ownerId || !exportToken) continue;
        exportUrlsByRoom.set(ownerId, {
          exportUrl: `/api/host/calendar/export?ownerType=stay_unit&ownerId=${encodeURIComponent(ownerId)}`,
          publicExportUrl: buildCalendarExportUrl({
            hostId: ownerId,
            token: exportToken,
            baseUrl: request.nextUrl.origin,
          }),
        });
      }
    } catch (error) {
      console.warn("[stay-units] export url preload skipped", {
        familyId,
        hostId,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const response = NextResponse.json({
    stayUnits: stayUnits.map((room) => {
      const roomId = asNullableString(room.id);
      const exportUrls = roomId ? exportUrlsByRoom.get(roomId) : null;
      const detailedRoom = { ...room, detailLevel: "full" as const };
      return exportUrls ? { ...detailedRoom, ...exportUrls } : detailedRoom;
    }),
  });
  logDuration("[host.stay-units]", startedAt, 200, familyId, { rooms: stayUnits.length, view });
  return response;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const startedAt = Date.now();
  try {
    const body = (await request.json()) as JsonRecord;
    const familyId = asNullableString(body.familyId);
    const clientId = asNullableString(body.clientId);
    const operation = asNullableString(body.operation);
    const forceCreate = operation === "create" || body.forceCreate === true;
    const addonOrderId = asNullableString(body.addonOrderId);
    if (!familyId) {
      logDuration("[host.stay-units:save]", startedAt, 400, "");
      return NextResponse.json({ error: "Missing familyId." }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();
    const hostAccess = await resolveAuthorizedHostResource(supabase, request, { familyId });
    if (!hostAccess) {
      logDuration("[host.stay-units:save]", startedAt, 403, familyId);
      return NextResponse.json({ error: "You do not have access to these rooms." }, { status: 403 });
    }
    const { hostId, legacyFamilyId } = await resolveHostContext(supabase, familyId);
    const unit = body.unit && typeof body.unit === "object" ? (body.unit as JsonRecord) : {};
    const unitId = forceCreate ? null : asNullableString(unit.id);
    const name = asString(unit.name);
    if (!name) {
      logDuration("[host.stay-units:save]", startedAt, 400, familyId);
      return NextResponse.json({ error: "Room name is required." }, { status: 400 });
    }

    const requestedUnitKey = asNullableString(unit.unitKey);
    const unitKey = forceCreate
      ? makeIdempotentCreateUnitKey(name, requestedUnitKey ?? clientId)
      : requestedUnitKey || (unitId ? null : makeUnitKey(name));
    const providedUnitIdExists =
      !forceCreate && unitId != null
        ? await doesStayUnitExist(supabase, {
            unitId,
            hostId,
            legacyFamilyId,
          })
        : false;
    const idempotentCreateRetryUnitId =
      forceCreate && unitKey
        ? await findExistingStayUnitIdForSave(supabase, {
            hostId,
            legacyFamilyId,
            unitKey,
            name,
            allowNameFallback: false,
          })
        : null;
    const resolvedExistingUnitId =
      idempotentCreateRetryUnitId ??
      ((providedUnitIdExists ? unitId : null) ??
        (forceCreate
          ? null
          : await findExistingStayUnitIdForSave(supabase, {
              hostId,
              legacyFamilyId,
              unitKey,
              name,
              allowNameFallback: !(clientId?.startsWith("temp-") && !providedUnitIdExists),
            })));
    if (idempotentCreateRetryUnitId) {
      console.info("[stay-units:save] idempotent create retry resolved existing room", {
        familyId,
        hostId,
        clientId,
        unitKey,
        roomName: name,
        canonicalStayUnitId: idempotentCreateRetryUnitId,
        addonOrderId: addonOrderId ?? null,
      });
    }
    const previousStayUnit =
      resolvedExistingUnitId
        ? await supabase
            .from("stay_units_v2")
            .select("id,name,unit_type,description,max_guests,price_fullday,is_active")
            .eq("id", resolvedExistingUnitId)
            .maybeSingle()
        : null;
    if (previousStayUnit?.error) {
      throw previousStayUnit.error;
    }
    const proAccess = await loadHostProAccess(supabase, familyId);
    const isNewRoomInsert = !resolvedExistingUnitId;
    if (isNewRoomInsert) {
      if (!proAccess.allowed || proAccess.status !== "active") {
        return NextResponse.json(
          { error: "Active Famlo Pro access is required before adding a new room." },
          { status: 403 }
        );
      }
      if (!hostAccess.hostUserId) {
        logDuration("[host.stay-units:save]", startedAt, 403, familyId, { operation: "create" });
        return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
      }
      if (!addonOrderId) {
        const quote = await buildHostProAddonQuote(supabase, {
          familyId,
          addonType: "room",
        });
        const paymentExecution = evaluateRuntimeSafety("pro_billing_payment_execution");
        const message = paymentExecution.ok
          ? "Room add-on payment is required before creation."
          : paymentExecution.code === "feature_disabled"
            ? `Payment execution disabled in ${paymentExecution.appEnv} environment.`
            : paymentExecution.message ?? "Room add-on checkout is unavailable in this environment.";
        return NextResponse.json(
          {
            error: message,
            message,
            errorCode: "PRO_ROOM_ADDON_REQUIRED",
            paymentErrorCode: paymentExecution.ok ? null : "PRO_BILLING_PAYMENT_EXECUTION_DISABLED",
            paymentExecutionEnabled: paymentExecution.ok,
            addonPaymentRequired: true,
            addonType: "room",
            addonQuote: quote,
            clientId,
            unitKey,
          },
          { status: 402 }
        );
      }
      await assertPaidHostProAddonOrderAvailable(supabase, {
        billingOrderId: addonOrderId,
        hostUserId: hostAccess.hostUserId,
        familyId,
        addonType: "room",
      });
    }
    const normalizedLat = asNullableNumber(unit.lat);
    const normalizedLng = asNullableNumber(unit.lng);
    const payload: JsonRecord = {
      host_id: hostId,
      legacy_family_id: legacyFamilyId,
      unit_key: unitKey ?? "primary",
      name,
      unit_type: asString(unit.unitType) || "private_room",
      description: asNullableString(unit.description),
      max_guests: Math.max(1, Math.trunc(asNumber(unit.maxGuests, 1))),
      bed_info: asNullableString(unit.bedInfo),
      bathroom_type: asNullableString(unit.bathroomType),
      toilet_types: asStringArray((unit as JsonRecord).toiletTypes),
      toilet_type: asNullableString((unit as JsonRecord).toiletType) ?? asStringArray((unit as JsonRecord).toiletTypes).join(", "),
      room_size_sqm:
        typeof unit.roomSizeSqm === "number" || typeof unit.roomSizeSqm === "string"
          ? asNullableNumber(unit.roomSizeSqm)
          : null,
      lat: normalizedLat,
      lng: normalizedLng,
      price_morning: normalizeMoney(unit.priceMorning, 0),
      price_afternoon: normalizeMoney(unit.priceAfternoon, 0),
      price_evening: normalizeMoney(unit.priceEvening, 0),
      price_fullday: normalizeMoney(unit.priceFullday, 0),
      quarter_enabled: asBoolean(unit.quarterEnabled, true),
      is_active: asBoolean(unit.isActive, true),
      is_primary: asBoolean(unit.isPrimary, false),
      amenities: normalizeAmenityList(asStringArray(unit.amenities)),
      photos: asStringArray(unit.photos),
      locality_photos: asStringArray(unit.localityPhotos),
      sort_order: Math.trunc(asNumber(unit.sortOrder, 0)),
      updated_at: new Date().toISOString(),
    };
    const nextMaxGuests = Math.max(1, Math.trunc(asNumber(unit.maxGuests, 1)));
    const previousMaxGuests = asNullableNumber((previousStayUnit?.data as JsonRecord | null)?.max_guests);
    const shouldSyncMaxGuests = previousMaxGuests == null || previousMaxGuests !== nextMaxGuests;

    const roomDraftPatch: JsonRecord = {
      id: unitId ?? clientId ?? unitKey ?? name,
      roomName: name,
      roomType: asString(unit.unitType) || "private_room",
      description: asNullableString(unit.description),
      roomDescription: asNullableString(unit.description),
      maxGuests: Math.max(1, Math.trunc(asNumber(unit.maxGuests, 1))),
      bedConfiguration: asNullableString(unit.bedInfo),
      bathroomType: asNullableString(unit.bathroomType),
      toiletTypes: asStringArray((unit as JsonRecord).toiletTypes),
      toiletType: asNullableString((unit as JsonRecord).toiletType) ?? asStringArray((unit as JsonRecord).toiletTypes).join(", "),
      roomSizeSqm:
        typeof unit.roomSizeSqm === "number" || typeof unit.roomSizeSqm === "string"
          ? asNullableNumber(unit.roomSizeSqm)
          : null,
      lat: normalizedLat,
      lng: normalizedLng,
      latitude: normalizedLat,
      longitude: normalizedLng,
      standardPrice: normalizeMoney(unit.priceFullday, 0),
      lowDemandPrice: normalizeMoney(unit.priceMorning, 0),
      highDemandPrice: normalizeMoney(unit.priceEvening, 0),
      smartPricingEnabled: asBoolean(unit.quarterEnabled, true),
      isActive: asBoolean(unit.isActive, true),
      isPrimary: asBoolean(unit.isPrimary, false),
      roomAmenities: normalizeAmenityList(asStringArray(unit.amenities)),
      amenities: normalizeAmenityList(asStringArray(unit.amenities)),
      roomPhotos: asStringArray(unit.photos),
      photos: asStringArray(unit.photos),
      localityPhotos: asStringArray(unit.localityPhotos),
      locality_photos: asStringArray(unit.localityPhotos),
      sortOrder: Math.trunc(asNumber(unit.sortOrder, 0)),
    };

    if (idempotentCreateRetryUnitId && asStringArray(unit.photos).length === 0) {
      delete payload.photos;
      delete roomDraftPatch.roomPhotos;
      delete roomDraftPatch.photos;
    }
    if (idempotentCreateRetryUnitId && asStringArray(unit.localityPhotos).length === 0) {
      delete payload.locality_photos;
      delete roomDraftPatch.localityPhotos;
      delete roomDraftPatch.locality_photos;
    }

    if (payload.is_primary) {
      await supabase
            .from("stay_units_v2")
            .update({ is_primary: false })
            .eq("legacy_family_id", legacyFamilyId)
            .neq("id", resolvedExistingUnitId ?? "00000000-0000-0000-0000-000000000000");
      if (hostId) {
        await supabase
          .from("stay_units_v2")
          .update({ is_primary: false })
          .eq("host_id", hostId)
          .neq("id", resolvedExistingUnitId ?? "00000000-0000-0000-0000-000000000000");
      }
    }

    if (resolvedExistingUnitId) {
      console.info("[stay-units] update payload summary", {
        resolvedExistingUnitId,
        providedUnitId: unitId,
        unitKey,
        roomSizeSqm: payload.room_size_sqm ?? null,
        maxGuests: payload.max_guests ?? null,
        sortOrder: payload.sort_order ?? null,
        lat: payload.lat ?? null,
        lng: payload.lng ?? null,
      });
      const { data, error, strippedColumns } = await mutateStayUnitWithSchemaFallback(
        supabase,
        "update",
        payload,
        resolvedExistingUnitId
      );
      if (strippedColumns.length > 0) {
        console.warn("[stay-units] stripped unsupported columns during update", strippedColumns);
      }
      if (error) throw error;
      if (!data) {
        throw new Error("Room save matched a stale room id. Please reopen the room and try again.");
      }
      const saveWarnings: NonBlockingSaveWarning[] = [];
      const initialCanonicalStayUnitId = await resolveCanonicalStayUnitId(supabase, {
        candidateId: asNullableString((data as JsonRecord | null)?.id) ?? resolvedExistingUnitId,
        hostId,
        legacyFamilyId,
        unitKey: asNullableString((data as JsonRecord | null)?.unit_key) ?? unitKey,
        name,
      });
      const verifiedStayUnitRow = await loadVerifiedSavedStayUnitRow(supabase, {
        candidateId: initialCanonicalStayUnitId ?? asNullableString((data as JsonRecord | null)?.id) ?? resolvedExistingUnitId,
        hostId,
        familyId,
        legacyFamilyId,
        unitKey: asNullableString((data as JsonRecord | null)?.unit_key) ?? unitKey,
        clientId,
        name,
        operation: "update",
      });
      if (!verifiedStayUnitRow) {
        throw new Error("Room save could not be verified in stay_units_v2. Please retry without another payment.");
      }
      const mappedStayUnit = mapStayUnitRow(verifiedStayUnitRow);
      const canonicalStayUnitId = asNullableString(verifiedStayUnitRow.id);
      const canonicalRoomDraftPatch: JsonRecord = {
        ...roomDraftPatch,
        id: canonicalStayUnitId ?? roomDraftPatch.id,
        unitKey: mappedStayUnit.unitKey,
      };
      try {
        await syncRoomDraftPayload(
          supabase,
          familyId,
          {
            roomId: canonicalStayUnitId ?? resolvedExistingUnitId ?? clientId,
            unitKey: unitKey,
            name,
          },
          canonicalRoomDraftPatch
        );
      } catch (warning) {
        saveWarnings.push({
          step: "draft_sync",
          message: warning instanceof Error ? warning.message : String(warning),
        });
      }
      if (canonicalStayUnitId) {
        try {
        await collapseDuplicateStayUnits(supabase, {
            familyId,
            keepUnitId: canonicalStayUnitId,
            unitKey: mappedStayUnit.unitKey,
            aliasUnitKeys: [clientId, unitId],
          });
        } catch (warning) {
          saveWarnings.push({
            step: "collapse_duplicates",
            message: warning instanceof Error ? warning.message : String(warning),
          });
        }
      }
      if (canonicalStayUnitId) {
        const today = new Date().toISOString().slice(0, 10);
        try {
          await projectInventoryRange(supabase, {
            familyId,
            stayUnitId: canonicalStayUnitId,
            from: today,
            to: addIndiaDays(today, 364),
          });
        } catch (warning) {
          saveWarnings.push({
            step: "inventory_projection",
            message: warning instanceof Error ? warning.message : String(warning),
          });
        }
      }
      const previousRow = (previousStayUnit?.data as JsonRecord | null) ?? null;
      let channexProvisioning: {
        ok: boolean;
        status: "queued" | "not_mapped" | "failed";
        stayUnitId: string | null;
        queuedJobIds: string[];
        message: string;
      } | null = null;
      let shouldRefreshChannexRoom = false;
      if (canonicalStayUnitId && asBoolean(payload.is_active, true)) {
        try {
          const readiness = await loadChannexMappingReadiness(supabase, {
            familyId,
            stayUnitId: canonicalStayUnitId,
          });
          shouldRefreshChannexRoom =
            !readiness.hasRoomMapping ||
            !readiness.hasRatePlan ||
            asString(previousRow?.name) !== name ||
            asString(previousRow?.unit_type) !== asString(payload.unit_type) ||
            (asNullableString(previousRow?.description) ?? "") !== (asNullableString(payload.description) ?? "") ||
            asNumber(previousRow?.max_guests, 1) !== nextMaxGuests ||
            normalizeMoney(previousRow?.price_fullday, 0) !== normalizeMoney(payload.price_fullday, 0) ||
            asBoolean(previousRow?.is_active, true) !== asBoolean(payload.is_active, true);
        } catch (warning) {
          saveWarnings.push({
            step: "channex_mapping_readiness",
            message: warning instanceof Error ? warning.message : String(warning),
          });
        }
      }
      if (canonicalStayUnitId && shouldRefreshChannexRoom) {
        try {
          const provisioningJobId = await enqueueChannexRoomProvisioningJob(supabase, {
            hostId,
            familyId,
            stayUnitId: canonicalStayUnitId,
            reason: "room_details_saved",
            sourceRoute: "/api/host/stay-units",
            actorUserId: hostAccess.hostUserId ?? null,
            actorRole: hostAccess.isAdmin ? "admin" : "host",
          });
          if (provisioningJobId) {
            nudgeRoomChannexWorker({
              requestUrl: request.url,
              workerId: "room-provisioning-after-edit",
              limit: 5,
              passes: 2,
              warnings: saveWarnings,
            });
          }
          channexProvisioning = {
            ok: Boolean(provisioningJobId),
            status: provisioningJobId ? "queued" : "not_mapped",
            stayUnitId: canonicalStayUnitId,
            queuedJobIds: provisioningJobId ? [provisioningJobId] : [],
            message: provisioningJobId
              ? "Room details saved. Channex room, rate-plan, and ARI refresh is queued."
              : "Room details saved. Channex property is not connected yet.",
          };
        } catch (warning) {
          const message = warning instanceof Error ? warning.message : String(warning);
          saveWarnings.push({ step: "channex_room_provisioning", message });
          channexProvisioning = {
            ok: false,
            status: "failed",
            stayUnitId: canonicalStayUnitId,
            queuedJobIds: [],
            message,
          };
        }
      }
      let occupancySync: RoomOccupancySyncStatus | null = null;
      if (canonicalStayUnitId && shouldSyncMaxGuests && (channexProvisioning?.queuedJobIds.length ?? 0) === 0) {
        try {
          const occupancyJobId = await enqueueChannexRoomOccupancyJob(supabase, {
            familyId,
            stayUnitId: canonicalStayUnitId,
            maxGuests: nextMaxGuests,
            roomName: mappedStayUnit.name,
            unitType: mappedStayUnit.unitType,
            description: mappedStayUnit.description,
            sourceRoute: "/api/host/stay-units",
            actorUserId: hostAccess.hostUserId ?? null,
          actorRole: hostAccess.isAdmin ? "admin" : "host",
        });
        if (occupancyJobId) {
          nudgeRoomChannexWorker({
            requestUrl: request.url,
            workerId: "room-occupancy-after-save",
            limit: 5,
            warnings: saveWarnings,
          });
        }
        occupancySync = queuedRoomSyncStatus(
          occupancyJobId ? [occupancyJobId] : [],
            occupancyJobId
              ? "Room occupancy update saved. Channex sync is queued."
              : "Room occupancy update saved. Channex mapping is not ready yet."
          );
        } catch (warning) {
          const message = warning instanceof Error ? warning.message : String(warning);
          saveWarnings.push({
            step: "occupancy_sync",
            message,
          });
          occupancySync = {
            status: "failed",
            message,
            externalRoomTypeId: null,
            externalRatePlanIds: [],
          };
        }
      }
      let ariJobIds: string[] = [];
      if ((channexProvisioning?.queuedJobIds.length ?? 0) === 0) {
        try {
          const today = new Date().toISOString().slice(0, 10);
          ariJobIds = await enqueueChannexAriSyncJobs(supabase, {
          familyId,
          dateFrom: today,
          dateTo: addIndiaDays(today, 364),
          jobTypes: ["full_sync"],
          certificationScenario: "room_setup_saved",
          sourceUiAction: "Famlo PMS room setup save",
          sourceRoute: "/api/host/stay-units",
          stayUnitIds: canonicalStayUnitId ? [canonicalStayUnitId] : [],
          actorUserId: hostAccess.hostUserId ?? null,
          actorRole: hostAccess.isAdmin ? "admin" : "host",
        });
        } catch (warning) {
          saveWarnings.push({
            step: "queue_ari_sync",
            message: warning instanceof Error ? warning.message : String(warning),
          });
        }
      }
      const queuedJobIds = [...(channexProvisioning?.queuedJobIds ?? []), ...ariJobIds];
      logDuration("[host.stay-units:save]", startedAt, 200, familyId, {
        operation: "update",
        localSaveMs: Date.now() - startedAt,
        channexJobs: queuedJobIds.length + (occupancySync?.status === "queued" ? 1 : 0),
        canonicalStayUnitId,
        unitKey: mappedStayUnit.unitKey,
        clientId,
      });
      return NextResponse.json({
        stayUnit: withCanonicalStayUnitIdentifiers(mappedStayUnit as unknown as JsonRecord, {
          canonicalStayUnitId,
          familyId,
          unitKey: mappedStayUnit.unitKey,
        }),
        unitId: canonicalStayUnitId,
        canonicalStayUnitId,
        familyId,
        propertyId: familyId,
        clientId,
        queuedJobIds,
        occupancySync,
        channexProvisioning,
        warnings: saveWarnings,
      });
    }

    const { data, error, strippedColumns } = await mutateStayUnitWithSchemaFallback(
      supabase,
      "insert",
      payload
    );
    if (strippedColumns.length > 0) {
      console.warn("[stay-units] stripped unsupported columns during insert", strippedColumns);
    }
    if (error) throw error;
    const saveWarnings: NonBlockingSaveWarning[] = [];
    const initialCanonicalStayUnitId = await resolveCanonicalStayUnitId(supabase, {
      candidateId: asNullableString((data as JsonRecord | null)?.id),
      hostId,
      legacyFamilyId,
      unitKey: asNullableString((data as JsonRecord | null)?.unit_key) ?? unitKey,
      name,
    });
    const verifiedStayUnitRow = await loadVerifiedSavedStayUnitRow(supabase, {
      candidateId: initialCanonicalStayUnitId ?? asNullableString((data as JsonRecord | null)?.id),
      hostId,
      familyId,
      legacyFamilyId,
      unitKey: asNullableString((data as JsonRecord | null)?.unit_key) ?? unitKey,
      clientId,
      name,
      operation: "create",
    });
    if (!verifiedStayUnitRow) {
      throw new Error("Room save could not be verified in stay_units_v2. Please retry without another payment.");
    }
    const mappedStayUnit = mapStayUnitRow(verifiedStayUnitRow);
    const canonicalStayUnitId = asNullableString(verifiedStayUnitRow.id);
    const canonicalRoomDraftPatch: JsonRecord = {
      ...roomDraftPatch,
      id: canonicalStayUnitId ?? roomDraftPatch.id,
      unitKey: mappedStayUnit.unitKey,
    };
    if (hostAccess.hostUserId && canonicalStayUnitId) {
      await consumePaidHostProAddonOrder(supabase, {
        billingOrderId: addonOrderId ?? "",
        hostUserId: hostAccess.hostUserId,
        familyId,
        addonType: "room",
        targetReference: canonicalStayUnitId,
      });
    }
    try {
      await syncRoomDraftPayload(
        supabase,
        familyId,
        {
          roomId: canonicalStayUnitId ?? asNullableString((data as JsonRecord | null)?.id) ?? clientId,
          unitKey: asNullableString((data as JsonRecord | null)?.unit_key) ?? unitKey,
          name,
        },
        canonicalRoomDraftPatch
      );
    } catch (warning) {
      saveWarnings.push({
        step: "draft_sync",
        message: warning instanceof Error ? warning.message : String(warning),
      });
    }
    if (canonicalStayUnitId) {
      try {
      await collapseDuplicateStayUnits(supabase, {
          familyId,
          keepUnitId: canonicalStayUnitId,
          unitKey: mappedStayUnit.unitKey,
          aliasUnitKeys: [clientId, unitId],
        });
      } catch (warning) {
        saveWarnings.push({
          step: "collapse_duplicates",
          message: warning instanceof Error ? warning.message : String(warning),
        });
      }
    }
    if (canonicalStayUnitId) {
      const today = new Date().toISOString().slice(0, 10);
      try {
        await projectInventoryRange(supabase, {
          familyId,
          stayUnitId: canonicalStayUnitId,
          from: today,
          to: addIndiaDays(today, 364),
        });
      } catch (warning) {
        saveWarnings.push({
          step: "inventory_projection",
          message: warning instanceof Error ? warning.message : String(warning),
        });
      }
    }
    let channexProvisioning: {
      ok: boolean;
      status: "queued" | "not_mapped" | "failed";
      stayUnitId: string | null;
      queuedJobIds: string[];
      message: string;
    } | null = null;
    if (canonicalStayUnitId) {
      try {
        const provisioningJobId = await enqueueChannexRoomProvisioningJob(supabase, {
          hostId,
          familyId,
          stayUnitId: canonicalStayUnitId,
          reason: "paid_room_addon",
          sourceRoute: "/api/host/stay-units",
          actorUserId: hostAccess.hostUserId ?? null,
          actorRole: hostAccess.isAdmin ? "admin" : "host",
        });
        if (provisioningJobId) {
          nudgeRoomChannexWorker({
            requestUrl: request.url,
            workerId: "room-provisioning-after-save",
            limit: 5,
            passes: 2,
            warnings: saveWarnings,
          });
        }
        channexProvisioning = {
          ok: Boolean(provisioningJobId),
          status: provisioningJobId ? "queued" : "not_mapped",
          stayUnitId: canonicalStayUnitId,
          queuedJobIds: provisioningJobId ? [provisioningJobId] : [],
          message: provisioningJobId
            ? "Room saved locally. Channex room and rate-plan provisioning is queued."
            : "Room saved locally. Channex property is not connected yet.",
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Channex room provisioning failed.";
        console.error("[stay-units] paid room provisioning enqueue failed:", {
          familyId,
          stayUnitId: canonicalStayUnitId,
          message,
        });
        channexProvisioning = {
          ok: false,
          status: "failed",
          stayUnitId: canonicalStayUnitId,
          queuedJobIds: [],
          message,
        };
      }
    }
    const occupancySync =
      canonicalStayUnitId &&
      shouldSyncMaxGuests
        ? queuedRoomSyncStatus(
            channexProvisioning?.queuedJobIds ?? [],
            "Room occupancy will sync after Channex room provisioning completes."
          )
        : null;
    const queuedJobIds = channexProvisioning?.queuedJobIds ?? [];
    logDuration("[host.stay-units:save]", startedAt, 200, familyId, {
      operation: "create",
      localSaveMs: Date.now() - startedAt,
      channexJobs: queuedJobIds.length,
      canonicalStayUnitId,
      unitKey: mappedStayUnit.unitKey,
      clientId,
    });
    return NextResponse.json({
      stayUnit: withCanonicalStayUnitIdentifiers(mappedStayUnit as unknown as JsonRecord, {
        canonicalStayUnitId,
        familyId,
        unitKey: mappedStayUnit.unitKey,
      }),
      unitId: canonicalStayUnitId,
      canonicalStayUnitId,
      familyId,
      propertyId: familyId,
      clientId,
      queuedJobIds,
      occupancySync,
      channexProvisioning,
      warnings: saveWarnings,
    });
  } catch (error) {
    const serialized =
      error && typeof error === "object"
        ? (() => {
            try {
              return JSON.stringify(error);
            } catch {
              return String(error);
            }
          })()
        : String(error);
    const message = error instanceof Error ? error.message : serialized;
    const stack = error instanceof Error ? error.stack ?? "" : "";
    console.error(`[stay-units] save failed: ${message}${stack ? `\n${stack}` : ""}`);
    logDuration("[host.stay-units:save]", startedAt, 500, "unknown");
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save room." },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  try {
    const body = (await request.json()) as JsonRecord;
    const familyId = asNullableString(body.familyId);
    const unitId = asNullableString(body.unitId);

    if (!familyId || !unitId) {
      return NextResponse.json({ error: "Missing familyId or unitId." }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();
    const hostAccess = await resolveAuthorizedHostResource(supabase, request, { familyId });
    if (!hostAccess) {
      return NextResponse.json({ error: "You do not have access to these rooms." }, { status: 403 });
    }
    const { hostId, legacyFamilyId } = await resolveHostContext(supabase, familyId);

    const deleteQuery = supabase.from("stay_units_v2").delete().eq("id", unitId);
    if (legacyFamilyId) {
      deleteQuery.eq("legacy_family_id", legacyFamilyId);
    }
    if (hostId) {
      deleteQuery.eq("host_id", hostId);
    }

    const { error } = await deleteQuery;
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete room." },
      { status: 500 }
    );
  }
}
