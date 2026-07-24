import type { SupabaseClient } from "@supabase/supabase-js";

import {
  ensureProjectedInventory,
  type InventoryProjectionDay,
} from "@/lib/inventory";
import {
  pushChannexAvailability,
  pushChannexRestrictions,
  type ChannexAriPushResult,
  type ChannexAvailabilityChange,
  type ChannexRestrictionChange,
} from "@/lib/channel-providers/channex/client";
import {
  getChannelProviderCapabilities,
  resolveChannelStorageProviderCode,
} from "@/lib/channel-providers/provider-capabilities";
import type { ChannelProviderKey } from "@/lib/channel-providers/provider-registry";
import { enumerateDateRange } from "@/lib/platform-utils";
import { loadStayUnitsForSelector } from "@/lib/stay-units";

type JsonRecord = Record<string, unknown>;
type MappingRebindCandidate = {
  roomMappingId: string;
  previousStayUnitId: string;
  externalRoomTypeId: string | null;
  ratePlanIds: string[];
  ratePlanTitles: string[];
};

export const CHANNEX_ARI_JOB_TYPES = [
  "availability_update",
  "rate_update",
  "restriction_update",
  "full_sync",
] as const;

export type ChannexAriJobType = (typeof CHANNEX_ARI_JOB_TYPES)[number];

type AriJobPayload = {
  payload_kind: ChannexAriJobType;
  property_id: string | null;
  provider: ChannelProviderKey;
  provider_code: string;
  stay_unit_ids: string[] | null;
  date_from: string;
  date_to: string;
  room_mappings: Array<{ stay_unit_id: string; external_room_type_id: string | null }>;
  rate_plan_mappings: Array<{ stay_unit_id: string; external_rate_plan_id: string | null }>;
  certification_scenario: string;
  source_ui_action: string;
  source_route: string;
  actor_user_id: string | null;
  actor_role: string | null;
  unsupported: string[];
};

type QueueMutationInput = {
  familyId: string;
  dateFrom: string;
  dateTo: string;
  jobTypes: ChannexAriJobType[];
  certificationScenario: string;
  sourceUiAction: string;
  sourceRoute: string;
  stayUnitIds?: string[] | null;
  actorUserId?: string | null;
  actorRole?: string | null;
  providerKeys?: ChannelProviderKey[] | null;
};

type BookingAriQueueInput = {
  familyId: string;
  stayUnitIds: string[];
  dateFrom: string;
  dateTo: string;
  certificationScenario: string;
  sourceUiAction: string;
  sourceRoute: string;
  actorUserId?: string | null;
  actorRole?: string | null;
};

type AriJobExecutionResult = {
  ok: boolean;
  message: string;
  httpStatus: number | null;
  retryAfterAt: string | null;
  taskIds: string[];
  result: JsonRecord;
};

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asObject(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function addIndiaDays(date: string, days: number): string {
  const base = new Date(`${date}T00:00:00.000Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

function normalizeLabel(value: unknown): string {
  return typeof value === "string"
    ? value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim()
    : "";
}

function labelMatchesRoomName(label: string, roomName: string): boolean {
  const normalizedLabel = normalizeLabel(label);
  const normalizedRoomName = normalizeLabel(roomName);
  if (!normalizedLabel || !normalizedRoomName) return false;
  return (
    normalizedLabel === normalizedRoomName ||
    normalizedLabel.endsWith(normalizedRoomName) ||
    normalizedLabel.includes(` ${normalizedRoomName}`) ||
    normalizedLabel.includes(normalizedRoomName)
  );
}

export function findStaleMappingRebindCandidate(
  roomName: string,
  availableStayUnitIds: string[],
  candidates: MappingRebindCandidate[]
): MappingRebindCandidate | null {
  const availableIds = new Set(availableStayUnitIds.filter(Boolean));
  for (const candidate of candidates) {
    if (!candidate.previousStayUnitId || availableIds.has(candidate.previousStayUnitId)) {
      continue;
    }
    if (candidate.ratePlanTitles.some((title) => labelMatchesRoomName(title, roomName))) {
      return candidate;
    }
  }
  return null;
}

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function buildLongRange(): { from: string; to: string } {
  const from = todayDate();
  return { from, to: addIndiaDays(from, 499) };
}

export function isChannexAriJobType(value: string | null | undefined): value is ChannexAriJobType {
  return CHANNEX_ARI_JOB_TYPES.includes((value ?? "") as ChannexAriJobType);
}

function chunkIdempotencyKey(input: {
  familyId: string;
  providerKey: ChannelProviderKey;
  jobType: ChannexAriJobType;
  dateFrom: string;
  dateTo: string;
  stayUnitIds: string[] | null;
  certificationScenario: string;
}): string {
  const stayUnitKey = (input.stayUnitIds ?? []).slice().sort().join(",");
  return [
    "channex",
    "ari",
    input.familyId,
    input.providerKey,
    input.jobType,
    input.dateFrom,
    input.dateTo,
    stayUnitKey || "all_rooms",
    input.certificationScenario,
  ].join(":");
}

function formatPrice(amount: number): string {
  return Math.max(0, amount).toFixed(2);
}

function buildSegments(days: InventoryProjectionDay[]): Array<{
  dateFrom: string;
  dateTo: string;
  availability: number;
  rate: string;
  stopSell: boolean;
  cta: boolean;
  ctd: boolean;
  minStayThrough: number;
  minStayArrival: number;
  maxStay: number;
}> {
  const segments: Array<{
    dateFrom: string;
    dateTo: string;
    availability: number;
    rate: string;
    stopSell: boolean;
    cta: boolean;
    ctd: boolean;
    minStayThrough: number;
    minStayArrival: number;
    maxStay: number;
  }> = [];

  for (const day of days) {
    const availability = projectChannexAvailabilityValue(day);
    const rate = formatPrice(day.effectiveRate);
    const stopSell = day.stopSell || day.isBlocked;
    const minStayThrough = Math.max(1, day.minStay);
    const minStayArrival = Math.max(1, day.minStayArrival);
    const maxStay = Math.max(minStayArrival, day.maxStay);
    const cta = day.cta;
    const ctd = day.ctd;
    const last = segments[segments.length - 1];
    if (
      last &&
      last.availability === availability &&
      last.rate === rate &&
      last.stopSell === stopSell &&
      last.cta === cta &&
      last.ctd === ctd &&
      last.minStayThrough === minStayThrough &&
      last.minStayArrival === minStayArrival &&
      last.maxStay === maxStay
    ) {
      last.dateTo = day.date;
      continue;
    }

    segments.push({
      dateFrom: day.date,
      dateTo: day.date,
      availability,
      rate,
      stopSell,
      cta,
      ctd,
      minStayThrough,
      minStayArrival,
      maxStay,
    });
  }

  return segments;
}

export function projectChannexAvailabilityValue(day: InventoryProjectionDay): number {
  return day.isBlocked ? 0 : Math.max(0, day.availableUnits);
}

function extractTaskIds(result: ChannexAriPushResult): string[] {
  const meta = result.meta && typeof result.meta === "object" ? (result.meta as JsonRecord) : {};
  const data = result.data;
  const taskIds = new Set<string>();
  const directCandidates = [
    asString(meta.task_id),
    asString(meta.taskId),
    asString((data as JsonRecord | null)?.task_id),
    asString((data as JsonRecord | null)?.taskId),
  ];
  for (const candidate of directCandidates) {
    if (candidate) taskIds.add(candidate);
  }

  const nestedCollections = [
    asArray<JsonRecord>((meta.tasks as unknown) ?? []),
    asArray<JsonRecord>((data as JsonRecord | null)?.tasks),
    Array.isArray(data) ? (data as JsonRecord[]) : [],
  ];

  for (const collection of nestedCollections) {
    for (const entry of collection) {
      const taskId = asString(entry.task_id) ?? asString(entry.taskId) ?? asString(entry.id);
      if (taskId) taskIds.add(taskId);
    }
  }

  return [...taskIds];
}

async function loadEligibleProviders(
  supabase: SupabaseClient,
  input: { familyId: string; providerKeys?: ChannelProviderKey[] | null }
): Promise<Array<{ providerKey: ChannelProviderKey; propertyId: string | null }>> {
  const providerFilter = input.providerKeys?.length
    ? input.providerKeys
    : (["booking", "mmt", "airbnb", "agoda", "expedia"] as ChannelProviderKey[]);

  const [providerRowsResult, channexRowResult] = await Promise.all([
    supabase
      .from("channel_properties")
      .select("provider_code")
      .eq("family_id", input.familyId)
      .in("provider_code", providerFilter),
    supabase
      .from("channel_properties")
      .select("external_property_id")
      .eq("family_id", input.familyId)
      .eq("provider_code", "channex")
      .maybeSingle(),
  ]);

  if (providerRowsResult.error) throw providerRowsResult.error;
  if (channexRowResult.error) throw channexRowResult.error;

  const propertyId = asString(channexRowResult.data?.external_property_id);
  const providers = (providerRowsResult.data ?? [])
    .map((row) => asString(row.provider_code) as ChannelProviderKey | null)
    .filter((providerKey): providerKey is ChannelProviderKey => Boolean(providerKey))
    .filter((providerKey) => getChannelProviderCapabilities(providerKey).supportsAriSync)
    .map((providerKey) => ({ providerKey, propertyId }));

  if (providers.length > 0 || !propertyId) {
    return providers;
  }

  const [{ count: roomMappingCount, error: roomMappingError }, { count: ratePlanCount, error: ratePlanError }] = await Promise.all([
    supabase
      .from("channel_room_mappings")
      .select("id", { count: "exact", head: true })
      .eq("family_id", input.familyId)
      .eq("provider_code", "channex"),
    supabase
      .from("channel_rate_plans")
      .select("id", { count: "exact", head: true })
      .eq("family_id", input.familyId)
      .eq("provider_code", "channex"),
  ]);
  if (roomMappingError) throw roomMappingError;
  if (ratePlanError) throw ratePlanError;

  if ((roomMappingCount ?? 0) > 0 && (ratePlanCount ?? 0) > 0) {
    return [{ providerKey: "booking", propertyId }];
  }

  return providers;
}

async function repairStaleScopedMappings(
  supabase: SupabaseClient,
  input: {
    familyId: string;
    storageProviderCode: string;
    stayUnitIds: string[];
  }
): Promise<void> {
  const targetStayUnitIds = [...new Set(input.stayUnitIds.filter(Boolean))];
  if (targetStayUnitIds.length === 0) return;

  const [roomsResult, roomMappingsResult, ratePlansResult] = await Promise.all([
    supabase
      .from("stay_units_v2")
      .select("id,name,is_active")
      .eq("legacy_family_id", input.familyId),
    supabase
      .from("channel_room_mappings")
      .select("id,stay_unit_id,external_room_type_id,metadata")
      .eq("family_id", input.familyId)
      .eq("provider_code", input.storageProviderCode),
    supabase
      .from("channel_rate_plans")
      .select("id,stay_unit_id,external_rate_plan_id,title,metadata")
      .eq("family_id", input.familyId)
      .eq("provider_code", input.storageProviderCode),
  ]);

  if (roomsResult.error) throw roomsResult.error;
  if (roomMappingsResult.error) throw roomMappingsResult.error;
  if (ratePlansResult.error) throw ratePlansResult.error;

  const rooms = ((roomsResult.data ?? []) as Array<Record<string, unknown>>)
    .map((row) => ({
      id: asString(row.id) ?? "",
      name: asString(row.name) ?? "Room",
      isActive: row.is_active !== false,
    }))
    .filter((room) => room.id);
  const roomById = new Map(rooms.map((room) => [room.id, room]));
  const availableStayUnitIds = rooms.filter((room) => room.isActive).map((room) => room.id);
  const ratePlansByStayUnitId = new Map<string, Array<Record<string, unknown>>>();

  for (const row of (ratePlansResult.data ?? []) as Array<Record<string, unknown>>) {
    const stayUnitId = asString(row.stay_unit_id);
    if (!stayUnitId) continue;
    const collection = ratePlansByStayUnitId.get(stayUnitId) ?? [];
    collection.push(row);
    ratePlansByStayUnitId.set(stayUnitId, collection);
  }

  const mappingCandidates: MappingRebindCandidate[] = ((roomMappingsResult.data ?? []) as Array<Record<string, unknown>>)
    .map((row) => {
      const previousStayUnitId = asString(row.stay_unit_id) ?? "";
      const pairedRatePlans = ratePlansByStayUnitId.get(previousStayUnitId) ?? [];
      return {
        roomMappingId: asString(row.id) ?? "",
        previousStayUnitId,
        externalRoomTypeId: asString(row.external_room_type_id),
        ratePlanIds: pairedRatePlans.map((plan) => asString(plan.id)).filter((value): value is string => Boolean(value)),
        ratePlanTitles: pairedRatePlans
          .map((plan) => asString(plan.title))
          .filter((value): value is string => Boolean(value)),
      };
    })
    .filter((candidate) => candidate.roomMappingId && candidate.previousStayUnitId);

  const roomMappingById = new Map(
    ((roomMappingsResult.data ?? []) as Array<Record<string, unknown>>).map((row) => [asString(row.id) ?? "", row])
  );
  const ratePlanById = new Map(
    ((ratePlansResult.data ?? []) as Array<Record<string, unknown>>).map((row) => [asString(row.id) ?? "", row])
  );

  for (const stayUnitId of targetStayUnitIds) {
    const room = roomById.get(stayUnitId);
    if (!room || !room.isActive) continue;

    const hasDirectRoomMapping = ((roomMappingsResult.data ?? []) as Array<Record<string, unknown>>).some((row) => {
      return asString(row.stay_unit_id) === stayUnitId && Boolean(asString(row.external_room_type_id));
    });
    const hasDirectRatePlan = ((ratePlansResult.data ?? []) as Array<Record<string, unknown>>).some((row) => {
      return asString(row.stay_unit_id) === stayUnitId && Boolean(asString(row.external_rate_plan_id));
    });
    if (hasDirectRoomMapping && hasDirectRatePlan) {
      continue;
    }

    const candidate = findStaleMappingRebindCandidate(room.name, availableStayUnitIds, mappingCandidates);
    if (!candidate) continue;

    const now = new Date().toISOString();
    const currentRoomMapping = roomMappingById.get(candidate.roomMappingId);
    const { error: roomMappingUpdateError } = await supabase
      .from("channel_room_mappings")
      .update({
        stay_unit_id: stayUnitId,
        metadata: {
          ...asObject(currentRoomMapping?.metadata),
          repaired_via: "queued_channex_stale_mapping_rebind",
          repaired_at: now,
          repaired_room_name: room.name,
          repaired_from_stay_unit_id: candidate.previousStayUnitId,
        },
        updated_at: now,
      } as never)
      .eq("id", candidate.roomMappingId);
    if (roomMappingUpdateError) throw roomMappingUpdateError;

    if (candidate.ratePlanIds.length > 0) {
      const mergedRatePlanMetadata = candidate.ratePlanIds.reduce<JsonRecord>(
        (accumulator, ratePlanId) => ({
          ...accumulator,
          ...asObject(ratePlanById.get(ratePlanId)?.metadata),
        }),
        {}
      );
      const { error: ratePlanUpdateError } = await supabase
        .from("channel_rate_plans")
        .update({
          stay_unit_id: stayUnitId,
          metadata: {
            ...mergedRatePlanMetadata,
            repaired_via: "queued_channex_stale_mapping_rebind",
            repaired_at: now,
            repaired_room_name: room.name,
            repaired_from_stay_unit_id: candidate.previousStayUnitId,
          },
          updated_at: now,
        } as never)
        .in("id", candidate.ratePlanIds);
      if (ratePlanUpdateError) throw ratePlanUpdateError;
    }
  }
}

export async function enqueueChannexAriSyncJobs(
  supabase: SupabaseClient,
  input: QueueMutationInput
): Promise<string[]> {
  const providers = await loadEligibleProviders(supabase, {
    familyId: input.familyId,
    providerKeys: input.providerKeys ?? null,
  });
  if (providers.length === 0) {
    return [];
  }

  const queuedIds: string[] = [];
  for (const { providerKey, propertyId } of providers) {
    const storageProviderCode = resolveChannelStorageProviderCode(providerKey);
    const stayUnitIds = input.stayUnitIds?.length ? [...new Set(input.stayUnitIds)] : null;
    if (stayUnitIds?.length) {
      await repairStaleScopedMappings(supabase, {
        familyId: input.familyId,
        storageProviderCode,
        stayUnitIds,
      });
    }
    let roomMappingsQuery = supabase
      .from("channel_room_mappings")
      .select("stay_unit_id,external_room_type_id")
      .eq("family_id", input.familyId)
      .eq("provider_code", storageProviderCode);
    let ratePlanMappingsQuery = supabase
      .from("channel_rate_plans")
      .select("stay_unit_id,external_rate_plan_id")
      .eq("family_id", input.familyId)
      .eq("provider_code", storageProviderCode);

    if (stayUnitIds?.length) {
      roomMappingsQuery = roomMappingsQuery.in("stay_unit_id", stayUnitIds);
      ratePlanMappingsQuery = ratePlanMappingsQuery.in("stay_unit_id", stayUnitIds);
    }

    const [roomMappingsResult, ratePlanMappingsResult] = await Promise.all([
      roomMappingsQuery,
      ratePlanMappingsQuery,
    ]);
    if (roomMappingsResult.error) throw roomMappingsResult.error;
    if (ratePlanMappingsResult.error) throw ratePlanMappingsResult.error;

    const roomMappings =
      ((roomMappingsResult.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
        stay_unit_id: asString(row.stay_unit_id) ?? "",
        external_room_type_id: asString(row.external_room_type_id),
      }));
    const ratePlanMappings =
      ((ratePlanMappingsResult.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
        stay_unit_id: asString(row.stay_unit_id) ?? "",
        external_rate_plan_id: asString(row.external_rate_plan_id),
      }));

    for (const jobType of input.jobTypes) {
      const payload: AriJobPayload = {
        payload_kind: jobType,
        property_id: propertyId,
        provider: providerKey,
        provider_code: storageProviderCode,
        stay_unit_ids: stayUnitIds,
        date_from: input.dateFrom,
        date_to: input.dateTo,
        room_mappings: roomMappings,
        rate_plan_mappings: ratePlanMappings,
        certification_scenario: input.certificationScenario,
        source_ui_action: input.sourceUiAction,
        source_route: input.sourceRoute,
        actor_user_id: input.actorUserId ?? null,
        actor_role: input.actorRole ?? null,
        unsupported: [],
      };

      const idempotencyKey = chunkIdempotencyKey({
        familyId: input.familyId,
        providerKey,
        jobType,
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
        stayUnitIds,
        certificationScenario: input.certificationScenario,
      });

      const queuedAt = new Date().toISOString();
      const baseJobRow = {
        family_id: input.familyId,
        provider_code: providerKey,
        job_type: jobType,
        status: "queued",
        priority: jobType === "full_sync" ? 80 : 40,
        idempotency_key: idempotencyKey,
        payload,
        max_attempts: 6,
        run_after: queuedAt,
        updated_at: queuedAt,
      } as const;

      const existingJobResult = await supabase
        .from("channel_sync_jobs")
        .select("id,status")
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle();
      if (existingJobResult.error) throw existingJobResult.error;

      const existingStatus = asString((existingJobResult.data as JsonRecord | null)?.status);
      if (
        existingJobResult.data?.id &&
        existingStatus &&
        ["queued", "running", "retrying", "succeeded"].includes(existingStatus)
      ) {
        queuedIds.push(String(existingJobResult.data.id));
        continue;
      }

      const { data, error } = existingJobResult.data?.id
        ? await supabase
            .from("channel_sync_jobs")
            .update(baseJobRow as never)
            .eq("id", existingJobResult.data.id)
            .select("id")
            .maybeSingle()
        : await supabase
            .from("channel_sync_jobs")
            .insert(baseJobRow as never)
            .select("id")
            .maybeSingle();
      if (error) throw error;
      const jobId = asString((data as JsonRecord | null)?.id);
      if (jobId) queuedIds.push(jobId);
    }
  }

  return queuedIds;
}

export async function enqueueBookingInventoryAriSyncJobs(
  supabase: SupabaseClient,
  input: BookingAriQueueInput
): Promise<string[]> {
  if (!input.stayUnitIds.length) return [];
  return enqueueChannexAriSyncJobs(supabase, {
    familyId: input.familyId,
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
    jobTypes: ["availability_update"],
    certificationScenario: input.certificationScenario,
    sourceUiAction: input.sourceUiAction,
    sourceRoute: input.sourceRoute,
    stayUnitIds: input.stayUnitIds,
    actorUserId: input.actorUserId ?? null,
    actorRole: input.actorRole ?? null,
  });
}

export async function triggerQueuedChannexSyncWorker(input: {
  requestUrl: string;
  workerId: string;
  limit?: number;
}): Promise<boolean> {
  const secret = asString(process.env.CRON_SECRET);
  if (!secret) return false;

  const base = new URL(input.requestUrl);
  const cronUrl = new URL("/api/internal/cron/channel-sync-jobs", base.origin);
  // Give the worker enough headroom to drain a small backlog so the newly queued
  // ARI job does not get starved behind an older queued job.
  cronUrl.searchParams.set("limit", String(Math.max(5, Math.min(input.limit ?? 5, 10))));
  cronUrl.searchParams.set("workerId", input.workerId);

  try {
    const response = await fetch(cronUrl.toString(), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
      },
      cache: "no-store",
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function resolveHostId(supabase: SupabaseClient, familyId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("hosts")
    .select("id")
    .eq("legacy_family_id", familyId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return asString(data?.id);
}

async function buildAriPayloadForJob(
  supabase: SupabaseClient,
  input: {
    familyId: string;
    providerKey: ChannelProviderKey;
    dateFrom: string;
    dateTo: string;
    stayUnitIds: string[] | null;
    propertyId: string | null;
  }
): Promise<{
  availabilityValues: ChannexAvailabilityChange[];
  restrictionValues: ChannexRestrictionChange[];
  roomsConsidered: string[];
  unsupported: string[];
}> {
  const hostId = await resolveHostId(supabase, input.familyId);
  if (!hostId) {
    throw new Error("Unable to resolve host for queued ARI sync job.");
  }

  const storageProviderCode = resolveChannelStorageProviderCode(input.providerKey);
  if (input.stayUnitIds?.length) {
    await repairStaleScopedMappings(supabase, {
      familyId: input.familyId,
      storageProviderCode,
      stayUnitIds: input.stayUnitIds,
    });
  }
  const [roomMappingsResult, ratePlansResult, rooms] = await Promise.all([
    supabase
      .from("channel_room_mappings")
      .select("stay_unit_id,external_room_type_id")
      .eq("family_id", input.familyId)
      .eq("provider_code", storageProviderCode),
    supabase
      .from("channel_rate_plans")
      .select("stay_unit_id,external_rate_plan_id")
      .eq("family_id", input.familyId)
      .eq("provider_code", storageProviderCode),
    loadStayUnitsForSelector(supabase, { hostId, legacyFamilyId: input.familyId }),
  ]);

  if (roomMappingsResult.error) throw roomMappingsResult.error;
  if (ratePlansResult.error) throw ratePlansResult.error;

  const roomMappingsByRoomId = new Map(
    ((roomMappingsResult.data ?? []) as Array<Record<string, unknown>>).map((row) => [
      asString(row.stay_unit_id) ?? "",
      asString(row.external_room_type_id),
    ])
  );
  const ratePlansByRoomId = new Map(
    ((ratePlansResult.data ?? []) as Array<Record<string, unknown>>).map((row) => [
      asString(row.stay_unit_id) ?? "",
      asString(row.external_rate_plan_id),
    ])
  );

  const filteredRooms = rooms.filter((room) => {
    if (!room.isActive) return false;
    if (input.stayUnitIds && input.stayUnitIds.length > 0) {
      return input.stayUnitIds.includes(room.id);
    }
    return true;
  });

  const availabilityValues: ChannexAvailabilityChange[] = [];
  const restrictionValues: ChannexRestrictionChange[] = [];
  const roomsConsidered: string[] = [];

  for (const room of filteredRooms) {
    const externalRoomTypeId = roomMappingsByRoomId.get(room.id);
    const externalRatePlanId = ratePlansByRoomId.get(room.id);
    if (!input.propertyId || !externalRoomTypeId || !externalRatePlanId) {
      continue;
    }

    const days = await ensureProjectedInventory(supabase, {
      familyId: input.familyId,
      stayUnitId: room.id,
      from: input.dateFrom,
      to: input.dateTo,
    });
    if (days.length === 0) continue;

    const segments = buildSegments(days);
    roomsConsidered.push(room.id);

    for (const segment of segments) {
      availabilityValues.push({
        propertyId: input.propertyId,
        roomTypeId: externalRoomTypeId,
        dateFrom: segment.dateFrom,
        dateTo: segment.dateTo,
        availability: segment.availability,
      });
      restrictionValues.push({
        propertyId: input.propertyId,
        ratePlanId: externalRatePlanId,
        dateFrom: segment.dateFrom,
        dateTo: segment.dateTo,
        rate: segment.rate,
        stopSell: segment.stopSell,
        cta: segment.cta,
        ctd: segment.ctd,
        minStayThrough: segment.minStayThrough,
        minStayArrival: segment.minStayArrival,
        maxStay: segment.maxStay,
      });
    }
  }

  return {
    availabilityValues,
    restrictionValues,
    roomsConsidered,
    unsupported: [],
  };
}

function nextRetryAt(base: Date, retryAfterSeconds: number | null, attempts: number): string {
  if (retryAfterSeconds && retryAfterSeconds > 0) {
    return new Date(base.getTime() + retryAfterSeconds * 1000).toISOString();
  }
  const delayMinutes = Math.min(15, Math.max(1, Math.pow(2, Math.max(0, attempts - 1))));
  return new Date(base.getTime() + delayMinutes * 60_000).toISOString();
}

function buildPushFailureResult(
  result: ChannexAriPushResult,
  fallbackMessage: string,
  extra: JsonRecord
): AriJobExecutionResult {
  return {
    ok: false,
    message: result.message || fallbackMessage,
    httpStatus: result.httpStatus,
    retryAfterAt: nextRetryAt(new Date(), result.retryAfterSeconds ?? null, 1),
    taskIds: extractTaskIds(result),
    result: {
      ...extra,
      endpoint: result.endpoint,
      environment: result.environment,
      warnings: result.warnings,
      meta: result.meta,
      raw_validation: result.rawValidation,
      data: result.data,
    },
  };
}

export async function processChannexAriSyncJob(
  supabase: SupabaseClient,
  job: JsonRecord
): Promise<AriJobExecutionResult> {
  const familyId = asString(job.family_id);
  const providerKey = asString(job.provider_code) as ChannelProviderKey | null;
  const jobType = asString(job.job_type);
  const payload = asObject(job.payload);
  if (!familyId || !providerKey || !isChannexAriJobType(jobType)) {
    throw new Error("Queued ARI job is missing family, provider, or payload kind.");
  }

  const range =
    jobType === "full_sync"
      ? buildLongRange()
      : {
          from: asString(payload.date_from) ?? todayDate(),
          to: asString(payload.date_to) ?? asString(payload.date_from) ?? todayDate(),
        };

  const changeSet = await buildAriPayloadForJob(supabase, {
    familyId,
    providerKey,
    dateFrom: range.from,
    dateTo: range.to,
    stayUnitIds: asArray<string>(payload.stay_unit_ids).filter(Boolean),
    propertyId: asString(payload.property_id),
  });

  if (changeSet.roomsConsidered.length === 0) {
    return {
      ok: false,
      message: "No mapped active rooms were available for this queued ARI job.",
      httpStatus: 409,
      retryAfterAt: null,
      taskIds: [],
      result: {
        certification_scenario: asString(payload.certification_scenario),
        payload_kind: jobType,
        unsupported: changeSet.unsupported,
      },
    };
  }

  const extraResult: JsonRecord = {
    certification_scenario: asString(payload.certification_scenario),
    payload_kind: jobType,
    provider: providerKey,
    property_id: asString(payload.property_id),
    date_from: range.from,
    date_to: range.to,
    rooms_considered: changeSet.roomsConsidered,
    availability_value_count: changeSet.availabilityValues.length,
    restriction_value_count: changeSet.restrictionValues.length,
    unsupported: changeSet.unsupported,
  };

  if (jobType === "availability_update") {
    const result = await pushChannexAvailability(changeSet.availabilityValues);
    if (!result.ok) return buildPushFailureResult(result, "Queued availability update failed.", extraResult);
    return {
      ok: true,
      message: result.message,
      httpStatus: result.httpStatus,
      retryAfterAt: null,
      taskIds: extractTaskIds(result),
      result: {
        ...extraResult,
        endpoint: result.endpoint,
        environment: result.environment,
        meta: result.meta,
      },
    };
  }

  if (jobType === "rate_update" || jobType === "restriction_update") {
    const result = await pushChannexRestrictions(changeSet.restrictionValues);
    if (!result.ok) return buildPushFailureResult(result, "Queued restrictions update failed.", extraResult);
    return {
      ok: true,
      message: result.message,
      httpStatus: result.httpStatus,
      retryAfterAt: null,
      taskIds: extractTaskIds(result),
      result: {
        ...extraResult,
        endpoint: result.endpoint,
        environment: result.environment,
        meta: result.meta,
      },
    };
  }

  const [availabilityResult, restrictionResult] = await Promise.all([
    pushChannexAvailability(changeSet.availabilityValues),
    pushChannexRestrictions(changeSet.restrictionValues),
  ]);

  if (!availabilityResult.ok) {
    return buildPushFailureResult(availabilityResult, "Queued full sync availability step failed.", extraResult);
  }
  if (!restrictionResult.ok) {
    return buildPushFailureResult(restrictionResult, "Queued full sync restrictions step failed.", extraResult);
  }

  return {
    ok: true,
    message: "Queued full sync completed successfully.",
    httpStatus: restrictionResult.httpStatus ?? availabilityResult.httpStatus,
    retryAfterAt: null,
    taskIds: [...extractTaskIds(availabilityResult), ...extractTaskIds(restrictionResult)],
    result: {
      ...extraResult,
      availability_endpoint: availabilityResult.endpoint,
      restrictions_endpoint: restrictionResult.endpoint,
      environment: restrictionResult.environment,
      availability_meta: availabilityResult.meta,
      restrictions_meta: restrictionResult.meta,
    },
  };
}

export function nextChannexRetryAt(attempts: number, retryAfterSeconds: number | null): string {
  return nextRetryAt(new Date(), retryAfterSeconds, attempts);
}
