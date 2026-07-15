import { enqueueChannexAriSyncJobs } from "@/lib/channex-ari-jobs";
import {
  createChannexRatePlan as defaultCreateChannexRatePlan,
  createChannexRoomType as defaultCreateChannexRoomType,
  fetchChannexPropertyById as defaultFetchChannexPropertyById,
  fetchChannexRatePlansForProperty as defaultFetchChannexRatePlansForProperty,
  fetchChannexRoomTypesForProperty as defaultFetchChannexRoomTypesForProperty,
  getChannexConfigSummary,
  getChannexMutationGuardSummary,
  updateChannexRatePlanOccupancy as defaultUpdateChannexRatePlanOccupancy,
  updateChannexRoomTypeOccupancy as defaultUpdateChannexRoomTypeOccupancy,
} from "@/lib/channel-providers/channex/client";
import {
  PRO_DEFAULT_CURRENCY,
  PRO_DEFAULT_MEAL_PLAN,
  PRO_DEFAULT_RATE_PLAN_NAME,
  loadHostProSettings,
} from "@/lib/host-pro-settings";
import { createAdminSupabaseClient } from "@/lib/supabase";

type JsonRecord = Record<string, unknown>;
type AdminSupabase = ReturnType<typeof createAdminSupabaseClient>;

type RoomRecord = {
  id: string;
  name: string;
  unitType: string | null;
  description: string | null;
  maxGuests: number;
  priceFullday: number;
  isActive: boolean;
};

type RoomMappingRecord = {
  id: string | null;
  externalPropertyId: string | null;
  externalRoomTypeId: string | null;
  countOfRooms: number;
  syncStatus: string | null;
  metadata: JsonRecord;
};

type RatePlanMappingRecord = {
  id: string | null;
  externalRatePlanId: string | null;
  title: string;
  mealPlan: string;
  syncStatus: string | null;
  metadata: JsonRecord;
};

type ProvisionStatus =
  | "already_mapped"
  | "provisioned"
  | "failed"
  | "repair_needed"
  | "not_connected"
  | "blocked_production_mutation"
  | "skipped_inactive";

export type SingleStayUnitProvisionResult = {
  ok: boolean;
  status: ProvisionStatus;
  stayUnitId: string;
  externalPropertyId: string | null;
  externalRoomTypeId: string | null;
  externalRatePlanId: string | null;
  queuedJobIds: string[];
  roomMappingStatus: string | null;
  ratePlanStatus: string | null;
  createdRoomType: boolean;
  createdRatePlan: boolean;
  message: string;
};

type ProvisionDependencies = {
  createChannexRoomType?: typeof defaultCreateChannexRoomType;
  createChannexRatePlan?: typeof defaultCreateChannexRatePlan;
  fetchChannexPropertyById?: typeof defaultFetchChannexPropertyById;
  fetchChannexRoomTypesForProperty?: typeof defaultFetchChannexRoomTypesForProperty;
  fetchChannexRatePlansForProperty?: typeof defaultFetchChannexRatePlansForProperty;
  updateChannexRoomTypeOccupancy?: typeof defaultUpdateChannexRoomTypeOccupancy;
  updateChannexRatePlanOccupancy?: typeof defaultUpdateChannexRatePlanOccupancy;
  enqueueChannexAriSyncJobs?: typeof enqueueChannexAriSyncJobs;
  loadHostProSettings?: typeof loadHostProSettings;
};

export type ProvisionSingleStayUnitInput = {
  supabase: AdminSupabase;
  hostId?: string | null;
  familyId: string;
  stayUnitId: string;
  reason: string;
  sourceRoute?: string;
  actorUserId?: string | null;
  actorRole?: "admin" | "host" | null;
};

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
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

function asObject(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function addIndiaDays(date: string, days: number): string {
  const base = new Date(`${date}T00:00:00.000Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

function normalizeLabel(value: string | null | undefined): string {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCurrency(value: string | null): string | null {
  return value ? value.trim().toUpperCase() : null;
}

function normalizeMealType(value: string | null): string {
  const normalized = value?.trim().toLowerCase() ?? "";
  const allowed = new Set([
    "none",
    "all_inclusive",
    "breakfast",
    "lunch",
    "dinner",
    "american",
    "bed_and_breakfast",
    "buffet_breakfast",
    "carribean_breakfast",
    "continental_breakfast",
    "english_breakfast",
    "european_plan",
    "family_plan",
    "full_board",
    "full_breakfast",
    "half_board",
    "room_only",
    "self_catering",
    "bermuda",
    "dinner_bed_and_breakfast_plan",
    "family_american",
    "breakfast_and_lunch",
    "lunch_and_dinner",
  ]);

  return allowed.has(normalized) ? normalized : "room_only";
}

function mapRoomKind(unitType: string | null): "room" | "dorm" {
  const normalized = unitType?.trim().toLowerCase() ?? "";
  return normalized.includes("dorm") ? "dorm" : "room";
}

function buildRatePlanTitle(roomName: string): string {
  return `${PRO_DEFAULT_RATE_PLAN_NAME} - ${roomName}`.trim();
}

function findRoomTypeCandidate(
  roomName: string,
  roomTypes: Array<{ id: string; title: string | null }>
): { roomTypeId: string | null; ambiguous: boolean } {
  const normalizedRoomName = normalizeLabel(roomName);
  if (!normalizedRoomName) {
    return { roomTypeId: null, ambiguous: false };
  }

  const exactMatches = roomTypes.filter((roomType) => normalizeLabel(roomType.title) === normalizedRoomName);
  if (exactMatches.length === 1) {
    return { roomTypeId: exactMatches[0]?.id ?? null, ambiguous: false };
  }
  if (exactMatches.length > 1) {
    return { roomTypeId: null, ambiguous: true };
  }

  const partialMatches = roomTypes.filter((roomType) => {
    const normalizedTitle = normalizeLabel(roomType.title);
    return Boolean(
      normalizedTitle &&
      (normalizedTitle.includes(normalizedRoomName) || normalizedRoomName.includes(normalizedTitle))
    );
  });
  if (partialMatches.length === 1) {
    return { roomTypeId: partialMatches[0]?.id ?? null, ambiguous: false };
  }
  if (partialMatches.length > 1) {
    return { roomTypeId: null, ambiguous: true };
  }

  return { roomTypeId: null, ambiguous: false };
}

function findRatePlanCandidate(
  title: string,
  roomTypeId: string,
  ratePlans: Array<{ id: string; title: string | null; roomTypeId: string | null }>
): string | null {
  const normalizedTitle = normalizeLabel(title);
  const scopedRatePlans = ratePlans.filter((ratePlan) => !ratePlan.roomTypeId || ratePlan.roomTypeId === roomTypeId);

  const exact = scopedRatePlans.find((ratePlan) => normalizeLabel(ratePlan.title) === normalizedTitle);
  if (exact) return exact.id;

  const standard = scopedRatePlans.find((ratePlan) => {
    const normalized = normalizeLabel(ratePlan.title);
    return normalized.includes("standard") || normalized.includes("room only");
  });
  return standard?.id ?? null;
}

async function logProvisioningEvent(input: {
  supabase: AdminSupabase;
  familyId: string;
  status: "success" | "failed";
  message: string;
  payload: JsonRecord;
}): Promise<void> {
  const { error } = await input.supabase.from("channel_sync_logs").insert({
    family_id: input.familyId,
    provider_code: "channex",
    action: "provision_single_room",
    status: input.status,
    message: input.message,
    payload: input.payload,
  } as never);

  if (error) {
    const message = String(error.message ?? "");
    if (!/relation|does not exist|schema cache/i.test(message)) {
      console.error("[channex-room-provisioning] log failed:", error);
    }
  }
}

async function loadStayUnit(
  supabase: AdminSupabase,
  familyId: string,
  stayUnitId: string
): Promise<RoomRecord | null> {
  const { data, error } = await supabase
    .from("stay_units_v2")
    .select("id,legacy_family_id,name,unit_type,description,max_guests,price_fullday,is_active")
    .eq("id", stayUnitId)
    .eq("legacy_family_id", familyId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const row = data as JsonRecord;
  return {
    id: asString(row.id) ?? stayUnitId,
    name: asString(row.name) ?? "Room",
    unitType: asString(row.unit_type),
    description: asString(row.description),
    maxGuests: Math.max(1, asNumber(row.max_guests, 1)),
    priceFullday: Math.max(0, asNumber(row.price_fullday, 0)),
    isActive: asBoolean(row.is_active, true),
  };
}

async function loadRoomMapping(
  supabase: AdminSupabase,
  familyId: string,
  stayUnitId: string
): Promise<RoomMappingRecord | null> {
  const { data, error } = await supabase
    .from("channel_room_mappings")
    .select("id,external_property_id,external_room_type_id,count_of_rooms,sync_status,metadata")
    .eq("family_id", familyId)
    .eq("provider_code", "channex")
    .eq("stay_unit_id", stayUnitId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as JsonRecord;
  return {
    id: asString(row.id),
    externalPropertyId: asString(row.external_property_id),
    externalRoomTypeId: asString(row.external_room_type_id),
    countOfRooms: Math.max(1, asNumber(row.count_of_rooms, 1)),
    syncStatus: asString(row.sync_status),
    metadata: asObject(row.metadata),
  };
}

async function loadRatePlanMapping(
  supabase: AdminSupabase,
  familyId: string,
  stayUnitId: string
): Promise<RatePlanMappingRecord | null> {
  const { data, error } = await supabase
    .from("channel_rate_plans")
    .select("id,external_rate_plan_id,title,meal_plan,sync_status,metadata")
    .eq("family_id", familyId)
    .eq("provider_code", "channex")
    .eq("stay_unit_id", stayUnitId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as JsonRecord;
  return {
    id: asString(row.id),
    externalRatePlanId: asString(row.external_rate_plan_id),
    title: asString(row.title) ?? PRO_DEFAULT_RATE_PLAN_NAME,
    mealPlan: normalizeMealType(asString(row.meal_plan) ?? PRO_DEFAULT_MEAL_PLAN),
    syncStatus: asString(row.sync_status),
    metadata: asObject(row.metadata),
  };
}

async function upsertRoomMapping(input: {
  supabase: AdminSupabase;
  familyId: string;
  stayUnitId: string;
  externalPropertyId: string | null;
  externalRoomTypeId: string | null;
  countOfRooms: number;
  syncStatus: string;
  metadata: JsonRecord;
}): Promise<void> {
  const payload = {
    family_id: input.familyId,
    stay_unit_id: input.stayUnitId,
    provider_code: "channex",
    external_property_id: input.externalPropertyId,
    external_room_type_id: input.externalRoomTypeId,
    count_of_rooms: Math.max(1, input.countOfRooms),
    sync_status: input.syncStatus,
    metadata: input.metadata,
    updated_at: new Date().toISOString(),
  };

  if (input.externalRoomTypeId) {
    const { data: existingExternalRows, error: existingExternalError } = await input.supabase
      .from("channel_room_mappings")
      .select("id,stay_unit_id")
      .eq("family_id", input.familyId)
      .eq("provider_code", "channex")
      .eq("external_room_type_id", input.externalRoomTypeId)
      .limit(10);
    if (existingExternalError) throw existingExternalError;

    const rows = (existingExternalRows ?? []) as JsonRecord[];
    const primaryRow =
      rows.find((row) => asString(row.stay_unit_id) === input.stayUnitId) ??
      rows.find((row) => asString(row.id)) ??
      null;
    const primaryId = asString(primaryRow?.id);
    if (primaryId) {
      const { error: updateExistingExternalError } = await input.supabase
        .from("channel_room_mappings")
        .update(payload as never)
        .eq("id", primaryId);
      if (updateExistingExternalError) throw updateExistingExternalError;

      const duplicateIds = rows
        .map((row) => asString(row.id))
        .filter((id): id is string => Boolean(id) && id !== primaryId);
      if (duplicateIds.length > 0) {
        const { error: deleteDuplicateError } = await input.supabase
          .from("channel_room_mappings")
          .delete()
          .in("id", duplicateIds);
        if (deleteDuplicateError) throw deleteDuplicateError;
      }
      return;
    }
  }

  const { error } = await input.supabase.from("channel_room_mappings").upsert(
    payload as never,
    { onConflict: "family_id,stay_unit_id,provider_code" }
  );
  if (!error) return;
  if (String((error as { code?: unknown }).code ?? "") !== "42P10") {
    throw error;
  }

  const { data: existing, error: existingError } = await input.supabase
    .from("channel_room_mappings")
    .select("id")
    .eq("family_id", input.familyId)
    .eq("provider_code", "channex")
    .eq("stay_unit_id", input.stayUnitId)
    .maybeSingle();
  if (existingError) throw existingError;

  if (existing?.id) {
    const { error: updateError } = await input.supabase
      .from("channel_room_mappings")
      .update(payload as never)
      .eq("id", existing.id);
    if (updateError) throw updateError;
    return;
  }

  const { error: insertError } = await input.supabase.from("channel_room_mappings").insert(payload as never);
  if (insertError) throw insertError;
}

async function upsertRatePlanMapping(input: {
  supabase: AdminSupabase;
  familyId: string;
  stayUnitId: string;
  externalRatePlanId: string | null;
  title: string;
  mealPlan: string;
  syncStatus: string;
  metadata: JsonRecord;
}): Promise<void> {
  const payload = {
    family_id: input.familyId,
    stay_unit_id: input.stayUnitId,
    provider_code: "channex",
    external_rate_plan_id: input.externalRatePlanId,
    title: input.title,
    meal_plan: input.mealPlan,
    sync_status: input.syncStatus,
    metadata: input.metadata,
    updated_at: new Date().toISOString(),
  };

  if (input.externalRatePlanId) {
    const { data: existingExternalRows, error: existingExternalError } = await input.supabase
      .from("channel_rate_plans")
      .select("id,stay_unit_id")
      .eq("family_id", input.familyId)
      .eq("provider_code", "channex")
      .eq("external_rate_plan_id", input.externalRatePlanId)
      .limit(10);
    if (existingExternalError) throw existingExternalError;

    const rows = (existingExternalRows ?? []) as JsonRecord[];
    const primaryRow =
      rows.find((row) => asString(row.stay_unit_id) === input.stayUnitId) ??
      rows.find((row) => asString(row.id)) ??
      null;
    const primaryId = asString(primaryRow?.id);
    if (primaryId) {
      const { error: updateExistingExternalError } = await input.supabase
        .from("channel_rate_plans")
        .update(payload as never)
        .eq("id", primaryId);
      if (updateExistingExternalError) throw updateExistingExternalError;

      const duplicateIds = rows
        .map((row) => asString(row.id))
        .filter((id): id is string => Boolean(id) && id !== primaryId);
      if (duplicateIds.length > 0) {
        const { error: deleteDuplicateError } = await input.supabase
          .from("channel_rate_plans")
          .delete()
          .in("id", duplicateIds);
        if (deleteDuplicateError) throw deleteDuplicateError;
      }
      return;
    }
  }

  const { error } = await input.supabase.from("channel_rate_plans").upsert(
    payload as never,
    { onConflict: "family_id,provider_code,stay_unit_id" }
  );
  if (!error) return;
  if (String((error as { code?: unknown }).code ?? "") !== "42P10") {
    throw error;
  }

  const { data: existing, error: existingError } = await input.supabase
    .from("channel_rate_plans")
    .select("id")
    .eq("family_id", input.familyId)
    .eq("provider_code", "channex")
    .eq("stay_unit_id", input.stayUnitId)
    .maybeSingle();
  if (existingError) throw existingError;

  if (existing?.id) {
    const { error: updateError } = await input.supabase
      .from("channel_rate_plans")
      .update(payload as never)
      .eq("id", existing.id);
    if (updateError) throw updateError;
    return;
  }

  const { error: insertError } = await input.supabase.from("channel_rate_plans").insert(payload as never);
  if (insertError) throw insertError;
}

function buildFailureResult(input: {
  stayUnitId: string;
  externalPropertyId: string | null;
  externalRoomTypeId: string | null;
  externalRatePlanId: string | null;
  roomMappingStatus: string | null;
  ratePlanStatus: string | null;
  status: ProvisionStatus;
  message: string;
}): SingleStayUnitProvisionResult {
  return {
    ok: false,
    status: input.status,
    stayUnitId: input.stayUnitId,
    externalPropertyId: input.externalPropertyId,
    externalRoomTypeId: input.externalRoomTypeId,
    externalRatePlanId: input.externalRatePlanId,
    queuedJobIds: [],
    roomMappingStatus: input.roomMappingStatus,
    ratePlanStatus: input.ratePlanStatus,
    createdRoomType: false,
    createdRatePlan: false,
    message: input.message,
  };
}

export async function provisionSingleStayUnitInChannex(
  input: ProvisionSingleStayUnitInput,
  dependencies: ProvisionDependencies = {}
): Promise<SingleStayUnitProvisionResult> {
  const createChannexRoomType = dependencies.createChannexRoomType ?? defaultCreateChannexRoomType;
  const createChannexRatePlan = dependencies.createChannexRatePlan ?? defaultCreateChannexRatePlan;
  const fetchChannexPropertyById = dependencies.fetchChannexPropertyById ?? defaultFetchChannexPropertyById;
  const fetchChannexRoomTypesForProperty =
    dependencies.fetchChannexRoomTypesForProperty ?? defaultFetchChannexRoomTypesForProperty;
  const fetchChannexRatePlansForProperty =
    dependencies.fetchChannexRatePlansForProperty ?? defaultFetchChannexRatePlansForProperty;
  const updateChannexRoomTypeOccupancy =
    dependencies.updateChannexRoomTypeOccupancy ?? defaultUpdateChannexRoomTypeOccupancy;
  const updateChannexRatePlanOccupancy =
    dependencies.updateChannexRatePlanOccupancy ?? defaultUpdateChannexRatePlanOccupancy;
  const queueAriJobs = dependencies.enqueueChannexAriSyncJobs ?? enqueueChannexAriSyncJobs;
  const loadSettings = dependencies.loadHostProSettings ?? loadHostProSettings;

  const mutationGuard = getChannexMutationGuardSummary();
  if (mutationGuard.blockedProductionMutation) {
    const message = "Blocked Channex provisioning because production mutations are disabled in this environment.";
    await logProvisioningEvent({
      supabase: input.supabase,
      familyId: input.familyId,
      status: "failed",
      message,
      payload: {
        stay_unit_id: input.stayUnitId,
        reason: input.reason,
        source_route: input.sourceRoute ?? null,
        environment: mutationGuard.environment,
      },
    });
    return buildFailureResult({
      stayUnitId: input.stayUnitId,
      externalPropertyId: null,
      externalRoomTypeId: null,
      externalRatePlanId: null,
      roomMappingStatus: "failed",
      ratePlanStatus: null,
      status: "blocked_production_mutation",
      message,
    });
  }

  const config = getChannexConfigSummary();
  if (!config.configured) {
    const message = "Channex configuration is incomplete, so the room could not be provisioned automatically.";
    await logProvisioningEvent({
      supabase: input.supabase,
      familyId: input.familyId,
      status: "failed",
      message,
      payload: {
        stay_unit_id: input.stayUnitId,
        reason: input.reason,
        source_route: input.sourceRoute ?? null,
      },
    });
    return buildFailureResult({
      stayUnitId: input.stayUnitId,
      externalPropertyId: null,
      externalRoomTypeId: null,
      externalRatePlanId: null,
      roomMappingStatus: null,
      ratePlanStatus: null,
      status: "failed",
      message,
    });
  }

  const [room, channelProperty, roomMapping, ratePlanMapping] = await Promise.all([
    loadStayUnit(input.supabase, input.familyId, input.stayUnitId),
    input.supabase
      .from("channel_properties")
      .select("external_property_id")
      .eq("family_id", input.familyId)
      .eq("provider_code", "channex")
      .maybeSingle(),
    loadRoomMapping(input.supabase, input.familyId, input.stayUnitId),
    loadRatePlanMapping(input.supabase, input.familyId, input.stayUnitId),
  ]);
  if (channelProperty.error) {
    throw channelProperty.error;
  }

  if (!room) {
    return buildFailureResult({
      stayUnitId: input.stayUnitId,
      externalPropertyId: null,
      externalRoomTypeId: roomMapping?.externalRoomTypeId ?? null,
      externalRatePlanId: ratePlanMapping?.externalRatePlanId ?? null,
      roomMappingStatus: roomMapping?.syncStatus ?? null,
      ratePlanStatus: ratePlanMapping?.syncStatus ?? null,
      status: "failed",
      message: "The local room could not be found for Channex provisioning.",
    });
  }

  if (!room.isActive) {
    return {
      ok: true,
      status: "skipped_inactive",
      stayUnitId: room.id,
      externalPropertyId: asString((channelProperty.data as JsonRecord | null)?.external_property_id),
      externalRoomTypeId: roomMapping?.externalRoomTypeId ?? null,
      externalRatePlanId: ratePlanMapping?.externalRatePlanId ?? null,
      queuedJobIds: [],
      roomMappingStatus: roomMapping?.syncStatus ?? null,
      ratePlanStatus: ratePlanMapping?.syncStatus ?? null,
      createdRoomType: false,
      createdRatePlan: false,
      message: "Inactive rooms are not auto-provisioned in Channex.",
    };
  }

  const externalPropertyId = asString((channelProperty.data as JsonRecord | null)?.external_property_id);
  if (!externalPropertyId) {
    const message = "Channex property mapping is missing, so the room stays local until Channex is connected.";
    await logProvisioningEvent({
      supabase: input.supabase,
      familyId: input.familyId,
      status: "failed",
      message,
      payload: {
        stay_unit_id: input.stayUnitId,
        reason: input.reason,
        source_route: input.sourceRoute ?? null,
      },
    });
    return buildFailureResult({
      stayUnitId: room.id,
      externalPropertyId: null,
      externalRoomTypeId: roomMapping?.externalRoomTypeId ?? null,
      externalRatePlanId: ratePlanMapping?.externalRatePlanId ?? null,
      roomMappingStatus: roomMapping?.syncStatus ?? null,
      ratePlanStatus: ratePlanMapping?.syncStatus ?? null,
      status: "not_connected",
      message,
    });
  }

  const propertyLookup = await fetchChannexPropertyById(externalPropertyId);
  if (!propertyLookup.ok || !propertyLookup.data?.id) {
    const message = "Saved Channex property mapping is stale or inaccessible, so single-room provisioning could not continue.";
    await upsertRoomMapping({
      supabase: input.supabase,
      familyId: input.familyId,
      stayUnitId: room.id,
      externalPropertyId,
      externalRoomTypeId: roomMapping?.externalRoomTypeId ?? null,
      countOfRooms: roomMapping?.countOfRooms ?? 1,
      syncStatus: "failed",
      metadata: {
        ...(roomMapping?.metadata ?? {}),
        source: "single_room_provisioning",
        provisioning_reason: input.reason,
        last_error: message,
        last_error_at: new Date().toISOString(),
      },
    });
    await logProvisioningEvent({
      supabase: input.supabase,
      familyId: input.familyId,
      status: "failed",
      message,
      payload: {
        stay_unit_id: input.stayUnitId,
        external_property_id: externalPropertyId,
        provider_lookup_http_status: propertyLookup.httpStatus,
        provider_lookup_message: propertyLookup.message,
        reason: input.reason,
        source_route: input.sourceRoute ?? null,
      },
    });
    return buildFailureResult({
      stayUnitId: room.id,
      externalPropertyId,
      externalRoomTypeId: roomMapping?.externalRoomTypeId ?? null,
      externalRatePlanId: ratePlanMapping?.externalRatePlanId ?? null,
      roomMappingStatus: "failed",
      ratePlanStatus: ratePlanMapping?.syncStatus ?? null,
      status: "failed",
      message,
    });
  }

  if (!roomMapping?.externalRoomTypeId && ratePlanMapping?.externalRatePlanId) {
    const message =
      "Channex rate-plan mapping exists without a room mapping. This room needs repair before provisioning can continue safely.";
    await upsertRoomMapping({
      supabase: input.supabase,
      familyId: input.familyId,
      stayUnitId: room.id,
      externalPropertyId,
      externalRoomTypeId: null,
      countOfRooms: roomMapping?.countOfRooms ?? 1,
      syncStatus: "failed",
      metadata: {
        ...(roomMapping?.metadata ?? {}),
        source: "single_room_provisioning",
        provisioning_reason: input.reason,
        last_error: message,
        last_error_at: new Date().toISOString(),
      },
    });
    await logProvisioningEvent({
      supabase: input.supabase,
      familyId: input.familyId,
      status: "failed",
      message,
      payload: {
        stay_unit_id: room.id,
        external_property_id: externalPropertyId,
        external_rate_plan_id: ratePlanMapping.externalRatePlanId,
        reason: input.reason,
        source_route: input.sourceRoute ?? null,
      },
    });
    return buildFailureResult({
      stayUnitId: room.id,
      externalPropertyId,
      externalRoomTypeId: null,
      externalRatePlanId: ratePlanMapping.externalRatePlanId,
      roomMappingStatus: "failed",
      ratePlanStatus: ratePlanMapping.syncStatus ?? "failed",
      status: "repair_needed",
      message,
    });
  }

  const settings = await loadSettings(input.supabase, input.familyId);
  const ratePlanTitle = buildRatePlanTitle(room.name);
  const defaultMealPlan = normalizeMealType(asString(settings.defaultMealPlan) ?? PRO_DEFAULT_MEAL_PLAN);
  const currency = normalizeCurrency(asString(settings.currency) ?? PRO_DEFAULT_CURRENCY) ?? PRO_DEFAULT_CURRENCY;

  let externalRoomTypeId = roomMapping?.externalRoomTypeId ?? null;
  let createdRoomType = false;
  const roomTypesResult = !externalRoomTypeId ? await fetchChannexRoomTypesForProperty(externalPropertyId) : null;
  if (roomTypesResult && !roomTypesResult.ok) {
    const message = `Unable to verify Channex room types before provisioning: ${roomTypesResult.message}`;
    await upsertRoomMapping({
      supabase: input.supabase,
      familyId: input.familyId,
      stayUnitId: room.id,
      externalPropertyId,
      externalRoomTypeId: null,
      countOfRooms: roomMapping?.countOfRooms ?? 1,
      syncStatus: "failed",
      metadata: {
        ...(roomMapping?.metadata ?? {}),
        source: "single_room_provisioning",
        provisioning_reason: input.reason,
        last_error: message,
        last_error_at: new Date().toISOString(),
      },
    });
    return buildFailureResult({
      stayUnitId: room.id,
      externalPropertyId,
      externalRoomTypeId: null,
      externalRatePlanId: ratePlanMapping?.externalRatePlanId ?? null,
      roomMappingStatus: "failed",
      ratePlanStatus: ratePlanMapping?.syncStatus ?? null,
      status: "failed",
      message,
    });
  }

  if (!externalRoomTypeId) {
    const roomCandidate = findRoomTypeCandidate(room.name, roomTypesResult?.data ?? []);
    if (roomCandidate.ambiguous) {
      const message =
        "Channex already has multiple similar room types for this room name. Automatic provisioning stopped to avoid duplicates.";
      await upsertRoomMapping({
        supabase: input.supabase,
        familyId: input.familyId,
        stayUnitId: room.id,
        externalPropertyId,
        externalRoomTypeId: null,
        countOfRooms: roomMapping?.countOfRooms ?? 1,
        syncStatus: "failed",
        metadata: {
          ...(roomMapping?.metadata ?? {}),
          source: "single_room_provisioning",
          provisioning_reason: input.reason,
          last_error: message,
          last_error_at: new Date().toISOString(),
        },
      });
      await logProvisioningEvent({
        supabase: input.supabase,
        familyId: input.familyId,
        status: "failed",
        message,
        payload: {
          stay_unit_id: room.id,
          external_property_id: externalPropertyId,
          reason: input.reason,
          source_route: input.sourceRoute ?? null,
        },
      });
      return buildFailureResult({
        stayUnitId: room.id,
        externalPropertyId,
        externalRoomTypeId: null,
        externalRatePlanId: ratePlanMapping?.externalRatePlanId ?? null,
        roomMappingStatus: "failed",
        ratePlanStatus: ratePlanMapping?.syncStatus ?? null,
        status: "repair_needed",
        message,
      });
    }

    if (roomCandidate.roomTypeId) {
      externalRoomTypeId = roomCandidate.roomTypeId;
    } else {
      const createRoomResult = await createChannexRoomType({
        propertyId: externalPropertyId,
        title: room.name,
        countOfRooms: roomMapping?.countOfRooms ?? 1,
        occAdults: Math.max(1, room.maxGuests),
        occChildren: 0,
        occInfants: 0,
        defaultOccupancy: Math.max(1, room.maxGuests),
        roomKind: mapRoomKind(room.unitType),
        description: room.description,
      });
      if (!createRoomResult.ok || !createRoomResult.externalRoomTypeId) {
        const message = createRoomResult.message;
        await upsertRoomMapping({
          supabase: input.supabase,
          familyId: input.familyId,
          stayUnitId: room.id,
          externalPropertyId,
          externalRoomTypeId: null,
          countOfRooms: roomMapping?.countOfRooms ?? 1,
          syncStatus: "failed",
          metadata: {
            ...(roomMapping?.metadata ?? {}),
            source: "single_room_provisioning",
            provisioning_reason: input.reason,
            last_error: message,
            last_error_at: new Date().toISOString(),
          },
        });
        await logProvisioningEvent({
          supabase: input.supabase,
          familyId: input.familyId,
          status: "failed",
          message,
          payload: {
            stay_unit_id: room.id,
            external_property_id: externalPropertyId,
            http_status: createRoomResult.httpStatus,
            provider_validation: createRoomResult.rawValidation,
            reason: input.reason,
            source_route: input.sourceRoute ?? null,
          },
        });
        return buildFailureResult({
          stayUnitId: room.id,
          externalPropertyId,
          externalRoomTypeId: null,
          externalRatePlanId: ratePlanMapping?.externalRatePlanId ?? null,
          roomMappingStatus: "failed",
          ratePlanStatus: ratePlanMapping?.syncStatus ?? null,
          status: "failed",
          message,
        });
      }
      externalRoomTypeId = createRoomResult.externalRoomTypeId;
      createdRoomType = true;
    }
  }

  if (externalRoomTypeId) {
    const updateRoomResult = await updateChannexRoomTypeOccupancy({
      roomTypeId: externalRoomTypeId,
      propertyId: externalPropertyId,
      title: room.name,
      countOfRooms: roomMapping?.countOfRooms ?? 1,
      occAdults: Math.max(1, room.maxGuests),
      occChildren: 0,
      occInfants: 0,
      defaultOccupancy: Math.max(1, room.maxGuests),
      roomKind: mapRoomKind(room.unitType),
      description: room.description,
    });
    if (!updateRoomResult.ok) {
      const message = updateRoomResult.message;
      await upsertRoomMapping({
        supabase: input.supabase,
        familyId: input.familyId,
        stayUnitId: room.id,
        externalPropertyId,
        externalRoomTypeId,
        countOfRooms: roomMapping?.countOfRooms ?? 1,
        syncStatus: "failed",
        metadata: {
          ...(roomMapping?.metadata ?? {}),
          source: "single_room_provisioning",
          provisioning_reason: input.reason,
          external_room_type_title: room.name,
          last_error: message,
          last_error_at: new Date().toISOString(),
        },
      });
      await logProvisioningEvent({
        supabase: input.supabase,
        familyId: input.familyId,
        status: "failed",
        message,
        payload: {
          stay_unit_id: room.id,
          external_property_id: externalPropertyId,
          external_room_type_id: externalRoomTypeId,
          http_status: updateRoomResult.httpStatus,
          provider_validation: updateRoomResult.rawValidation,
          reason: input.reason,
          source_route: input.sourceRoute ?? null,
        },
      });
      return buildFailureResult({
        stayUnitId: room.id,
        externalPropertyId,
        externalRoomTypeId,
        externalRatePlanId: ratePlanMapping?.externalRatePlanId ?? null,
        roomMappingStatus: "failed",
        ratePlanStatus: ratePlanMapping?.syncStatus ?? null,
        status: "failed",
        message,
      });
    }
  }

  await upsertRoomMapping({
    supabase: input.supabase,
    familyId: input.familyId,
    stayUnitId: room.id,
    externalPropertyId,
    externalRoomTypeId,
    countOfRooms: roomMapping?.countOfRooms ?? 1,
    syncStatus: "mapped",
    metadata: {
      ...(roomMapping?.metadata ?? {}),
      source: "single_room_provisioning",
      provisioning_reason: input.reason,
      created_via: createdRoomType ? "single_room_channex_room_provisioning" : roomMapping?.metadata?.created_via ?? "single_room_channex_room_match",
      external_room_type_title: room.name,
      last_error: null,
      last_error_at: null,
      last_provisioned_at: new Date().toISOString(),
      last_room_type_updated_at: new Date().toISOString(),
    },
  });

  let externalRatePlanId = ratePlanMapping?.externalRatePlanId ?? null;
  let createdRatePlan = false;
  const ratePlansResult = !externalRatePlanId ? await fetchChannexRatePlansForProperty(externalPropertyId) : null;
  if (ratePlansResult && !ratePlansResult.ok) {
    const message = `Unable to verify Channex rate plans before provisioning: ${ratePlansResult.message}`;
    await upsertRatePlanMapping({
      supabase: input.supabase,
      familyId: input.familyId,
      stayUnitId: room.id,
      externalRatePlanId: null,
      title: ratePlanTitle,
      mealPlan: defaultMealPlan,
      syncStatus: "failed",
      metadata: {
        ...(ratePlanMapping?.metadata ?? {}),
        source: "single_room_provisioning",
        provisioning_reason: input.reason,
        external_room_type_id: externalRoomTypeId,
        property_id: externalPropertyId,
        last_error: message,
        last_error_at: new Date().toISOString(),
      },
    });
    return buildFailureResult({
      stayUnitId: room.id,
      externalPropertyId,
      externalRoomTypeId,
      externalRatePlanId: null,
      roomMappingStatus: "mapped",
      ratePlanStatus: "failed",
      status: "failed",
      message,
    });
  }

  if (!externalRatePlanId) {
    externalRatePlanId = findRatePlanCandidate(ratePlanTitle, externalRoomTypeId ?? "", ratePlansResult?.data ?? []);
    if (!externalRatePlanId) {
      const createRateResult = await createChannexRatePlan({
        title: ratePlanTitle,
        propertyId: externalPropertyId,
        roomTypeId: externalRoomTypeId ?? "",
        currency,
        mealType: defaultMealPlan,
        occupancy: Math.max(1, room.maxGuests),
      });
      if (!createRateResult.ok || !createRateResult.externalRatePlanId) {
        const message = createRateResult.message;
        await upsertRatePlanMapping({
          supabase: input.supabase,
          familyId: input.familyId,
          stayUnitId: room.id,
          externalRatePlanId: null,
          title: ratePlanTitle,
          mealPlan: defaultMealPlan,
          syncStatus: "failed",
          metadata: {
            ...(ratePlanMapping?.metadata ?? {}),
            source: "single_room_provisioning",
            provisioning_reason: input.reason,
            external_room_type_id: externalRoomTypeId,
            property_id: externalPropertyId,
            last_error: message,
            last_error_at: new Date().toISOString(),
          },
        });
        await logProvisioningEvent({
          supabase: input.supabase,
          familyId: input.familyId,
          status: "failed",
          message,
          payload: {
            stay_unit_id: room.id,
            external_property_id: externalPropertyId,
            external_room_type_id: externalRoomTypeId,
            http_status: createRateResult.httpStatus,
            provider_validation: createRateResult.rawValidation,
            reason: input.reason,
            source_route: input.sourceRoute ?? null,
          },
        });
        return buildFailureResult({
          stayUnitId: room.id,
          externalPropertyId,
          externalRoomTypeId,
          externalRatePlanId: null,
          roomMappingStatus: "mapped",
          ratePlanStatus: "failed",
          status: "failed",
          message,
        });
      }
      externalRatePlanId = createRateResult.externalRatePlanId;
      createdRatePlan = true;
    }
  }

  if (externalRatePlanId) {
    const updateRatePlanResult = await updateChannexRatePlanOccupancy({
      ratePlanId: externalRatePlanId,
      title: ratePlanTitle,
      propertyId: externalPropertyId,
      roomTypeId: externalRoomTypeId ?? "",
      currency,
      mealType: defaultMealPlan,
      occupancy: Math.max(1, room.maxGuests),
    });
    if (!updateRatePlanResult.ok) {
      const message = updateRatePlanResult.message;
      await upsertRatePlanMapping({
        supabase: input.supabase,
        familyId: input.familyId,
        stayUnitId: room.id,
        externalRatePlanId,
        title: ratePlanTitle,
        mealPlan: defaultMealPlan,
        syncStatus: "failed",
        metadata: {
          ...(ratePlanMapping?.metadata ?? {}),
          source: "single_room_provisioning",
          provisioning_reason: input.reason,
          external_room_type_id: externalRoomTypeId,
          external_rate_plan_title: ratePlanTitle,
          property_id: externalPropertyId,
          last_error: message,
          last_error_at: new Date().toISOString(),
        },
      });
      await logProvisioningEvent({
        supabase: input.supabase,
        familyId: input.familyId,
        status: "failed",
        message,
        payload: {
          stay_unit_id: room.id,
          external_property_id: externalPropertyId,
          external_room_type_id: externalRoomTypeId,
          external_rate_plan_id: externalRatePlanId,
          http_status: updateRatePlanResult.httpStatus,
          provider_validation: updateRatePlanResult.rawValidation,
          reason: input.reason,
          source_route: input.sourceRoute ?? null,
        },
      });
      return buildFailureResult({
        stayUnitId: room.id,
        externalPropertyId,
        externalRoomTypeId,
        externalRatePlanId,
        roomMappingStatus: "mapped",
        ratePlanStatus: "failed",
        status: "failed",
        message,
      });
    }
  }

  await upsertRatePlanMapping({
    supabase: input.supabase,
    familyId: input.familyId,
    stayUnitId: room.id,
    externalRatePlanId,
    title: ratePlanTitle,
    mealPlan: defaultMealPlan,
    syncStatus: "mapped",
    metadata: {
      ...(ratePlanMapping?.metadata ?? {}),
      source: "single_room_provisioning",
      provisioning_reason: input.reason,
      external_room_type_id: externalRoomTypeId,
      property_id: externalPropertyId,
      created_via: createdRatePlan ? "single_room_channex_rate_plan_provisioning" : ratePlanMapping?.metadata?.created_via ?? "single_room_channex_rate_plan_match",
      external_rate_plan_title: ratePlanTitle,
      last_error: null,
      last_error_at: null,
      last_provisioned_at: new Date().toISOString(),
      last_rate_plan_updated_at: new Date().toISOString(),
    },
  });

  const ariStartDate = new Date().toISOString().slice(0, 10);
  const queuedJobIds = await queueAriJobs(input.supabase, {
    familyId: input.familyId,
    dateFrom: ariStartDate,
    dateTo: addIndiaDays(ariStartDate, 364),
    jobTypes: ["full_sync"],
    certificationScenario: input.reason,
    sourceUiAction: "Famlo PMS single-room Channex provisioning",
    sourceRoute: input.sourceRoute ?? "/api/host/stay-units",
    stayUnitIds: [room.id],
    actorUserId: input.actorUserId ?? null,
    actorRole: input.actorRole ?? null,
  });

  const successStatus: ProvisionStatus =
    roomMapping?.externalRoomTypeId && ratePlanMapping?.externalRatePlanId && !createdRoomType && !createdRatePlan
      ? "already_mapped"
      : "provisioned";
  const successMessage =
    successStatus === "already_mapped"
      ? "Updated the existing Channex room and rate plan, then queued ARI sync."
      : "Provisioned or refreshed the room in Channex and queued the first ARI sync.";

  await logProvisioningEvent({
    supabase: input.supabase,
    familyId: input.familyId,
    status: "success",
    message: successMessage,
    payload: {
      stay_unit_id: room.id,
      external_property_id: externalPropertyId,
      external_room_type_id: externalRoomTypeId,
      external_rate_plan_id: externalRatePlanId,
      created_room_type: createdRoomType,
      created_rate_plan: createdRatePlan,
      queued_job_ids: queuedJobIds,
      reason: input.reason,
      source_route: input.sourceRoute ?? null,
    },
  });

  return {
    ok: true,
    status: successStatus,
    stayUnitId: room.id,
    externalPropertyId,
    externalRoomTypeId,
    externalRatePlanId,
    queuedJobIds,
    roomMappingStatus: "mapped",
    ratePlanStatus: "mapped",
    createdRoomType,
    createdRatePlan,
    message: successMessage,
  };
}
