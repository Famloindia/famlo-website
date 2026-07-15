import type { SupabaseClient } from "@supabase/supabase-js";

import { enqueueChannexAriSyncJobs } from "@/lib/channex-ari-jobs";
import { provisionSingleStayUnitInChannex } from "@/lib/channex-room-provisioning";
import {
  getChannexMutationGuardSummary,
  updateChannexRatePlanOccupancy,
  updateChannexRoomTypeOccupancy,
} from "@/lib/channel-providers/channex/client";

type JsonRecord = Record<string, unknown>;

export type ChannexRoomSyncStatus = {
  status: "not_mapped" | "queued" | "synced" | "failed";
  message: string;
  externalRoomTypeId: string | null;
  externalRatePlanIds: string[];
};

type ChannexRoomJobResult = {
  ok: boolean;
  message: string;
  retryable: boolean;
  result: JsonRecord;
};

const ROOM_JOB_TYPE = "provider_reconcile";
const ROOM_PROVISION_KIND = "channex_room_provisioning";
const ROOM_OCCUPANCY_KIND = "channex_room_occupancy_update";
const PRO_BOOTSTRAP_KIND = "channex_pro_bootstrap";

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

function asObject(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean)
    : [];
}

function mapRoomKind(unitType: string | null): "room" | "dorm" {
  const normalized = unitType?.trim().toLowerCase() ?? "";
  return normalized.includes("dorm") ? "dorm" : "room";
}

function buildIdempotencyKey(kind: string, familyId: string, stayUnitId: string | null, suffix: string): string {
  return ["channex", kind, familyId, stayUnitId ?? "property", suffix].join(":");
}

async function upsertRoomSyncJob(
  supabase: SupabaseClient,
  input: {
    familyId: string;
    payloadKind: string;
    idempotencyKey: string;
    payload: JsonRecord;
    priority?: number;
  }
): Promise<string | null> {
  const queuedAt = new Date().toISOString();
  const baseJobRow = {
    family_id: input.familyId,
    provider_code: "channex",
    job_type: ROOM_JOB_TYPE,
    status: "queued",
    priority: input.priority ?? 55,
    idempotency_key: input.idempotencyKey,
    payload: {
      ...input.payload,
      payload_kind: input.payloadKind,
    },
    max_attempts: 6,
    run_after: queuedAt,
    updated_at: queuedAt,
  } as const;

  const existingJobResult = await supabase
    .from("channel_sync_jobs")
    .select("id")
    .eq("idempotency_key", input.idempotencyKey)
    .maybeSingle();
  if (existingJobResult.error) throw existingJobResult.error;

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
  return asString((data as JsonRecord | null)?.id);
}

export async function enqueueChannexRoomProvisioningJob(
  supabase: SupabaseClient,
  input: {
    familyId: string;
    stayUnitId: string;
    hostId?: string | null;
    reason: string;
    sourceRoute: string;
    actorUserId?: string | null;
    actorRole?: "admin" | "host" | null;
  }
): Promise<string | null> {
  return upsertRoomSyncJob(supabase, {
    familyId: input.familyId,
    payloadKind: ROOM_PROVISION_KIND,
    idempotencyKey: buildIdempotencyKey(ROOM_PROVISION_KIND, input.familyId, input.stayUnitId, input.reason),
    payload: {
      stay_unit_id: input.stayUnitId,
      host_id: input.hostId ?? null,
      reason: input.reason,
      source_route: input.sourceRoute,
      actor_user_id: input.actorUserId ?? null,
      actor_role: input.actorRole ?? null,
    },
    priority: 45,
  });
}

export async function enqueueChannexRoomOccupancyJob(
  supabase: SupabaseClient,
  input: {
    familyId: string;
    stayUnitId: string;
    maxGuests: number;
    roomName: string;
    unitType: string | null;
    description: string | null;
    sourceRoute: string;
    actorUserId?: string | null;
    actorRole?: "admin" | "host" | null;
  }
): Promise<string | null> {
  return upsertRoomSyncJob(supabase, {
    familyId: input.familyId,
    payloadKind: ROOM_OCCUPANCY_KIND,
    idempotencyKey: buildIdempotencyKey(ROOM_OCCUPANCY_KIND, input.familyId, input.stayUnitId, String(input.maxGuests)),
    payload: {
      stay_unit_id: input.stayUnitId,
      max_guests: input.maxGuests,
      room_name: input.roomName,
      unit_type: input.unitType,
      description: input.description,
      source_route: input.sourceRoute,
      actor_user_id: input.actorUserId ?? null,
      actor_role: input.actorRole ?? null,
    },
    priority: 50,
  });
}

export async function enqueueChannexProBootstrapJob(
  supabase: SupabaseClient,
  input: {
    familyId: string;
    sourceRoute: string;
    billingOrderId: string;
    actorUserId?: string | null;
  }
): Promise<string | null> {
  return upsertRoomSyncJob(supabase, {
    familyId: input.familyId,
    payloadKind: PRO_BOOTSTRAP_KIND,
    idempotencyKey: buildIdempotencyKey(PRO_BOOTSTRAP_KIND, input.familyId, null, input.billingOrderId),
    payload: {
      source_route: input.sourceRoute,
      billing_order_id: input.billingOrderId,
      actor_user_id: input.actorUserId ?? null,
      actor_role: "host",
    },
    priority: 65,
  });
}

export function isChannexRoomSyncJob(job: JsonRecord): boolean {
  const payload = asObject(job.payload);
  return (
    asString(job.provider_code) === "channex" &&
    asString(job.job_type) === ROOM_JOB_TYPE &&
    [ROOM_PROVISION_KIND, ROOM_OCCUPANCY_KIND, PRO_BOOTSTRAP_KIND].includes(asString(payload.payload_kind) ?? "")
  );
}

export async function syncMappedChannexRoomOccupancy(input: {
  supabase: SupabaseClient;
  familyId: string;
  stayUnitId: string;
  maxGuests: number;
  roomName: string;
  unitType: string | null;
  description: string | null;
}): Promise<ChannexRoomSyncStatus> {
  const [roomMappingResult, ratePlanMappingsResult] = await Promise.all([
    input.supabase
      .from("channel_room_mappings")
      .select("external_property_id,external_room_type_id,count_of_rooms")
      .eq("family_id", input.familyId)
      .eq("stay_unit_id", input.stayUnitId)
      .eq("provider_code", "channex")
      .maybeSingle(),
    input.supabase
      .from("channel_rate_plans")
      .select("external_rate_plan_id,title,meal_plan,metadata")
      .eq("family_id", input.familyId)
      .eq("stay_unit_id", input.stayUnitId)
      .eq("provider_code", "channex"),
  ]);
  if (roomMappingResult.error) throw roomMappingResult.error;
  if (ratePlanMappingsResult.error) throw ratePlanMappingsResult.error;

  const externalRoomTypeId = asString((roomMappingResult.data as JsonRecord | null)?.external_room_type_id);
  const externalPropertyId = asString((roomMappingResult.data as JsonRecord | null)?.external_property_id);
  const mappedRatePlans = ((ratePlanMappingsResult.data ?? []) as JsonRecord[])
    .map((row) => ({
      externalRatePlanId: asString(row.external_rate_plan_id),
      title: asString(row.title),
      mealPlan: asString(row.meal_plan),
      metadata: asObject(row.metadata),
    }))
    .filter((row) => Boolean(row.externalRatePlanId));

  if (!externalRoomTypeId || !externalPropertyId || mappedRatePlans.length === 0) {
    return {
      status: "not_mapped",
      message: "Channex room or rate plan mapping is missing, so occupancy sync is pending until mapping is completed.",
      externalRoomTypeId,
      externalRatePlanIds: mappedRatePlans.map((row) => row.externalRatePlanId!).filter(Boolean),
    };
  }

  const mutationGuard = getChannexMutationGuardSummary();
  if (mutationGuard.blockedProductionMutation) {
    return {
      status: "failed",
      message: "Channex occupancy sync is blocked because production mutations are disabled in this environment.",
      externalRoomTypeId,
      externalRatePlanIds: mappedRatePlans.map((row) => row.externalRatePlanId!).filter(Boolean),
    };
  }

  const roomTypeResult = await updateChannexRoomTypeOccupancy({
    roomTypeId: externalRoomTypeId,
    propertyId: externalPropertyId,
    title: input.roomName,
    countOfRooms: Math.max(1, asNumber((roomMappingResult.data as JsonRecord | null)?.count_of_rooms, 1)),
    occAdults: Math.max(1, input.maxGuests),
    occChildren: 0,
    occInfants: 0,
    defaultOccupancy: Math.max(1, input.maxGuests),
    roomKind: mapRoomKind(input.unitType),
    description: input.description,
  });
  if (!roomTypeResult.ok) {
    return {
      status: "failed",
      message: roomTypeResult.message,
      externalRoomTypeId,
      externalRatePlanIds: mappedRatePlans.map((row) => row.externalRatePlanId!).filter(Boolean),
    };
  }

  const ratePlanResults = await Promise.all(
    mappedRatePlans.map((ratePlan) =>
      updateChannexRatePlanOccupancy({
        ratePlanId: ratePlan.externalRatePlanId ?? "",
        title: ratePlan.title ?? `Standard Rate - ${input.roomName}`.trim(),
        propertyId: asString(ratePlan.metadata.property_id) ?? externalPropertyId,
        roomTypeId: asString(ratePlan.metadata.external_room_type_id) ?? externalRoomTypeId,
        currency: "",
        mealType: ratePlan.mealPlan ?? "room_only",
        occupancy: Math.max(1, input.maxGuests),
      })
    )
  );
  const failedRatePlanResult = ratePlanResults.find((result) => !result.ok);
  if (failedRatePlanResult) {
    return {
      status: "failed",
      message: failedRatePlanResult.message,
      externalRoomTypeId,
      externalRatePlanIds: mappedRatePlans.map((row) => row.externalRatePlanId!).filter(Boolean),
    };
  }

  return {
    status: "synced",
    message: `Channex occupancy sync updated ${mappedRatePlans.length} mapped rate plan${mappedRatePlans.length === 1 ? "" : "s"} successfully.`,
    externalRoomTypeId,
    externalRatePlanIds: mappedRatePlans.map((row) => row.externalRatePlanId!).filter(Boolean),
  };
}

export async function processChannexRoomSyncJob(
  supabase: SupabaseClient,
  job: JsonRecord
): Promise<ChannexRoomJobResult> {
  const familyId = asString(job.family_id);
  const payload = asObject(job.payload);
  const payloadKind = asString(payload.payload_kind);
  if (!familyId || !payloadKind) {
    throw new Error("Queued Channex room job is missing family or payload kind.");
  }

  if (payloadKind === ROOM_PROVISION_KIND) {
    const stayUnitId = asString(payload.stay_unit_id);
    if (!stayUnitId) throw new Error("Queued Channex room provisioning job is missing stay_unit_id.");
    const result = await provisionSingleStayUnitInChannex({
      supabase,
      hostId: asString(payload.host_id),
      familyId,
      stayUnitId,
      reason: asString(payload.reason) ?? "queued_room_provisioning",
      sourceRoute: asString(payload.source_route) ?? "/api/host/stay-units",
      actorUserId: asString(payload.actor_user_id),
      actorRole: asString(payload.actor_role) === "admin" ? "admin" : "host",
    });
    return {
      ok: result.ok,
      message: result.message,
      retryable: result.status === "failed",
      result: { ...result, payload_kind: payloadKind },
    };
  }

  if (payloadKind === ROOM_OCCUPANCY_KIND) {
    const stayUnitId = asString(payload.stay_unit_id);
    if (!stayUnitId) throw new Error("Queued Channex occupancy job is missing stay_unit_id.");
    const result = await syncMappedChannexRoomOccupancy({
      supabase,
      familyId,
      stayUnitId,
      maxGuests: Math.max(1, Math.trunc(asNumber(payload.max_guests, 1))),
      roomName: asString(payload.room_name) ?? "Room",
      unitType: asString(payload.unit_type),
      description: asString(payload.description),
    });
    return {
      ok: result.status === "synced",
      message: result.message,
      retryable: result.status === "failed",
      result: { ...result, payload_kind: payloadKind },
    };
  }

  if (payloadKind === PRO_BOOTSTRAP_KIND) {
    const { data: rooms, error } = await supabase
      .from("stay_units_v2")
      .select("id")
      .eq("legacy_family_id", familyId)
      .eq("is_active", true);
    if (error) throw error;

    const stayUnitIds = ((rooms ?? []) as JsonRecord[]).map((row) => asString(row.id)).filter((value): value is string => Boolean(value));
    const queuedJobIds =
      stayUnitIds.length > 0
        ? await enqueueChannexAriSyncJobs(supabase, {
            familyId,
            dateFrom: new Date().toISOString().slice(0, 10),
            dateTo: new Date().toISOString().slice(0, 10),
            jobTypes: ["full_sync"],
            certificationScenario: "famlo_pro_activation_bootstrap",
            sourceUiAction: "Famlo Pro payment verification",
            sourceRoute: asString(payload.source_route) ?? "/api/host/pro/billing/verify",
            stayUnitIds,
            actorUserId: asString(payload.actor_user_id),
            actorRole: "host",
          })
        : [];
    return {
      ok: true,
      message: "Famlo Pro Channex bootstrap queued.",
      retryable: false,
      result: {
        payload_kind: payloadKind,
        stay_unit_ids: stayUnitIds,
        queued_ari_job_ids: queuedJobIds,
      },
    };
  }

  throw new Error(`Unsupported queued Channex room payload kind: ${payloadKind}`);
}

export function queuedRoomSyncStatus(jobIds: string[], message: string): ChannexRoomSyncStatus {
  return {
    status: jobIds.length > 0 ? "queued" : "not_mapped",
    message,
    externalRoomTypeId: null,
    externalRatePlanIds: [],
  };
}
