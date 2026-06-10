import type { SupabaseClient } from "@supabase/supabase-js";

import {
  fetchChannexAvailabilitySnapshot,
  fetchChannexRestrictionsSnapshot,
} from "@/lib/channel-providers/channex/client";
import { appendInventoryEvent, projectInventoryRange } from "@/lib/inventory";

type JsonRecord = Record<string, unknown>;

export type HostProCalendarSyncStatus =
  | "pending"
  | "syncing"
  | "synced"
  | "partial"
  | "failed"
  | "stale"
  | "not_mapped"
  | "not_connected";
export type HostProCalendarSyncSource = "channex" | "cache" | "none";
export type HostProCalendarRoomSyncStatus = "synced" | "syncing" | "pending" | "failed" | "stale" | "not_mapped";

export type HostProCalendarRoomSyncSummary = {
  roomId: string;
  provider: "channex";
  status: HostProCalendarRoomSyncStatus;
  lastSyncedAt: string | null;
  pendingJobCount: number;
  failedJobCount: number;
  safeMessage: string;
};

export type HostProCalendarSyncMetadata = {
  localStatus: "loaded";
  lastLocalLoadAt: string;
  lastAttemptedAt: string | null;
  lastSyncedAt: string | null;
  syncSource: HostProCalendarSyncSource;
  syncStatus: HostProCalendarSyncStatus;
  syncError: string | null;
  stale: boolean;
  connected: boolean;
  applied: boolean;
  partial: boolean;
  statusTitle: string;
  statusDetail: string;
  roomStatuses: HostProCalendarRoomSyncSummary[];
};

export type ChannexCalendarPullResult = {
  metadata: HostProCalendarSyncMetadata;
  availabilityRows: number;
  restrictionRows: number;
  appliedRows: number;
};

export type HostCalendarSyncDisplay = {
  badge: string;
  detail: string;
  warning: string | null;
  tone: "neutral" | "success" | "warning" | "error";
};

type CalendarMapping = {
  stayUnitId: string;
  externalRoomTypeId: string | null;
  externalRatePlanId: string | null;
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

function asObject(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isSchemaCompatibilityError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const record = error as { code?: unknown; message?: unknown };
  const message = typeof record.message === "string" ? record.message.toLowerCase() : "";
  return (
    record.code === "42P01" ||
    record.code === "42703" ||
    message.includes("schema cache") ||
    message.includes("does not exist") ||
    message.includes("relation")
  );
}

function addDays(date: string, days: number): string {
  const next = new Date(`${date}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

function enumerateDates(from: string, to: string): string[] {
  const dates: string[] = [];
  let cursor = from;
  while (cursor <= to) {
    dates.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return dates;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as JsonRecord)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function normalizeRestrictionSnapshotPayload(restriction: JsonRecord): JsonRecord {
  const cta = restriction.closed_to_arrival ?? restriction.cta ?? null;
  const ctd = restriction.closed_to_departure ?? restriction.ctd ?? null;
  const minStayThrough = restriction.min_stay_through ?? restriction.minStayThrough ?? null;
  const minStayArrival = restriction.min_stay_arrival ?? restriction.minStayArrival ?? null;
  const maxStay = restriction.max_stay ?? restriction.maxStay ?? null;
  const stopSell = restriction.stop_sell ?? restriction.stopSell ?? null;
  const amount = restriction.rate ?? null;

  return {
    amount: amount != null ? asNumber(amount, 0) || null : null,
    stop_sell: stopSell === true,
    cta: cta === true,
    ctd: ctd === true,
    min_stay_through: minStayThrough != null ? asNumber(minStayThrough, 0) || null : null,
    min_stay_arrival: minStayArrival != null ? asNumber(minStayArrival, 0) || null : null,
    max_stay: maxStay != null ? asNumber(maxStay, 0) || null : null,
  };
}

export function checkoutExclusiveDateRange(checkInDate: string, checkOutDate: string): string[] {
  if (!isIsoDate(checkInDate) || !isIsoDate(checkOutDate) || checkOutDate <= checkInDate) {
    return isIsoDate(checkInDate) ? [checkInDate] : [];
  }
  return enumerateDates(checkInDate, addDays(checkOutDate, -1));
}

export function buildCalendarSyncMetadata(input: {
  localStatus?: "loaded";
  lastLocalLoadAt?: string | null;
  lastAttemptedAt?: string | null;
  lastSyncedAt?: string | null;
  connected: boolean;
  ok?: boolean;
  observedAt: string;
  error?: string | null;
  applied?: boolean;
  partial?: boolean;
  syncStatus?: HostProCalendarSyncStatus;
  syncSource?: HostProCalendarSyncSource;
  stale?: boolean;
  statusTitle?: string;
  statusDetail?: string;
  roomStatuses?: HostProCalendarRoomSyncSummary[];
}): HostProCalendarSyncMetadata {
  const safeError = sanitizeHostCalendarSyncMessage(input.error);
  const roomStatuses = input.roomStatuses ?? [];
  const base = {
    localStatus: input.localStatus ?? "loaded",
    lastLocalLoadAt: input.lastLocalLoadAt ?? input.observedAt,
    lastAttemptedAt: input.lastAttemptedAt ?? input.observedAt,
    lastSyncedAt: input.lastSyncedAt ?? null,
    roomStatuses,
  };

  if (!input.connected) {
    return {
      ...base,
      syncSource: "none",
      syncStatus: "not_connected",
      syncError: safeError,
      stale: false,
      connected: false,
      applied: false,
      partial: false,
      statusTitle: input.statusTitle ?? "Not connected",
      statusDetail: input.statusDetail ?? "Showing saved calendar. Channex is not connected for this property yet.",
    };
  }

  if (input.syncStatus === "not_mapped") {
    return {
      ...base,
      syncSource: input.syncSource ?? "cache",
      syncStatus: "not_mapped",
      syncError: safeError,
      stale: true,
      connected: true,
      applied: false,
      partial: false,
      statusTitle: input.statusTitle ?? "Not mapped",
      statusDetail:
        input.statusDetail ?? "Showing saved calendar. One or more rooms still need Channex room or rate mapping.",
    };
  }

  if (input.partial || input.syncStatus === "partial") {
    return {
      ...base,
      syncSource: input.syncSource ?? "cache",
      syncStatus: "partial",
      syncError: safeError ?? "Channex returned a partial refresh. Showing saved calendar.",
      stale: true,
      connected: true,
      applied: input.applied === true,
      partial: true,
      statusTitle: input.statusTitle ?? "Partial sync",
      statusDetail: input.statusDetail ?? "Showing saved calendar. Channex returned only part of the refresh.",
    };
  }

  if (input.syncStatus === "pending" || input.syncStatus === "syncing" || input.syncStatus === "stale") {
    return {
      ...base,
      syncSource: input.syncSource ?? "cache",
      syncStatus: input.syncStatus,
      syncError: safeError,
      stale: input.stale ?? true,
      connected: true,
      applied: false,
      partial: false,
      statusTitle:
        input.statusTitle ??
        (input.syncStatus === "syncing" ? "Syncing" : input.syncStatus === "pending" ? "Refresh pending" : "Stale"),
      statusDetail:
        input.statusDetail ??
        (input.syncStatus === "syncing"
          ? "Showing saved calendar. Channex refresh is running."
          : input.syncStatus === "pending"
            ? "Showing saved calendar. Channex refresh is queued."
            : "Showing saved calendar. Channex needs another refresh."),
    };
  }

  if (input.ok === false || input.syncStatus === "failed") {
    return {
      ...base,
      syncSource: input.syncSource ?? "cache",
      syncStatus: "failed",
      syncError: safeError ?? "Channex calendar sync failed.",
      stale: true,
      connected: true,
      applied: false,
      partial: false,
      statusTitle: input.statusTitle ?? "Sync failed",
      statusDetail: input.statusDetail ?? "Showing saved calendar. Last Channex refresh failed.",
    };
  }

  return {
    ...base,
    lastSyncedAt: input.lastSyncedAt ?? input.observedAt,
    syncSource: input.syncSource ?? "channex",
    syncStatus: "synced",
    syncError: null,
    stale: false,
    connected: true,
    applied: input.applied === true,
    partial: false,
    statusTitle: input.statusTitle ?? "Synced",
    statusDetail: input.statusDetail ?? "Saved calendar is up to date with the latest Channex refresh.",
  };
}

export function sanitizeHostCalendarSyncMessage(value: string | null | undefined): string | null {
  const message = typeof value === "string" ? value.trim() : "";
  if (!message) return null;
  const normalized = message.toLowerCase();

  if (normalized.includes("no channex property is mapped")) {
    return "Channex is not connected for this property yet.";
  }
  if (normalized.includes("timeout")) {
    return "Channex refresh timed out. Showing saved calendar.";
  }
  if (normalized.includes("no mapped active rooms")) {
    return "Room or rate mapping is missing. Open Room & Price Matching.";
  }
  if (normalized.includes("fetch failed") || normalized.includes("network")) {
    return "Channex refresh could not be completed right now. Showing saved calendar.";
  }
  if (normalized.includes("availability:") || normalized.includes("restrictions:")) {
    const availabilityFailed = normalized.includes("availability:");
    const restrictionsFailed = normalized.includes("restrictions:");
    if (availabilityFailed && restrictionsFailed) {
      return "Channex refresh did not complete. Showing saved calendar.";
    }
  }
  return message.length > 220 ? `${message.slice(0, 217)}...` : message;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function safeJobRoomIds(payload: unknown): string[] {
  return asArray(asObject(payload).stay_unit_ids)
    .map((entry) => asString(entry))
    .filter((entry): entry is string => Boolean(entry));
}

function maxIsoDate(left: string | null, right: string | null): string | null {
  if (!left) return right;
  if (!right) return left;
  return left > right ? left : right;
}

function latestIsoDate(values: Array<string | null | undefined>): string | null {
  return values.reduce<string | null>((latest, value) => {
    const token = asString(value);
    if (!token) return latest;
    return latest == null || token > latest ? token : latest;
  }, null);
}

export function buildHostCalendarSyncDisplay(input: {
  metadata: HostProCalendarSyncMetadata;
  isBackgroundSyncRunning: boolean;
  isBackgroundSyncTimedOut: boolean;
  timeAnchor: number;
}): HostCalendarSyncDisplay {
  const { metadata } = input;
  const lastSyncedLabel = metadata.lastSyncedAt ? `Last synced ${formatRelativeAgeForHostSync(metadata.lastSyncedAt, input.timeAnchor)}` : null;

  if (input.isBackgroundSyncRunning && !input.isBackgroundSyncTimedOut) {
    return {
      badge: "Syncing",
      detail: "Showing saved calendar. Channex refresh is running.",
      warning: null,
      tone: "neutral",
    };
  }

  if (input.isBackgroundSyncTimedOut) {
    return {
      badge: "Saved data loaded",
      detail: "Showing saved calendar. Channex refresh is still running.",
      warning: null,
      tone: "warning",
    };
  }

  if (metadata.syncStatus === "synced") {
    return {
      badge: "Synced",
      detail: lastSyncedLabel ?? metadata.statusDetail,
      warning: null,
      tone: "success",
    };
  }

  if (metadata.syncStatus === "partial") {
    return {
      badge: "Partial sync",
      detail: metadata.statusDetail,
      warning: metadata.syncError,
      tone: "warning",
    };
  }

  if (metadata.syncStatus === "failed") {
    return {
      badge: "Sync failed",
      detail: metadata.statusDetail,
      warning: metadata.syncError,
      tone: "error",
    };
  }

  if (metadata.syncStatus === "not_mapped") {
    return {
      badge: "Not mapped",
      detail: metadata.statusDetail,
      warning: metadata.syncError,
      tone: "warning",
    };
  }

  if (metadata.syncStatus === "pending") {
    return {
      badge: "Refresh pending",
      detail: metadata.statusDetail,
      warning: null,
      tone: "neutral",
    };
  }

  if (metadata.syncStatus === "syncing") {
    return {
      badge: "Syncing",
      detail: metadata.statusDetail,
      warning: null,
      tone: "neutral",
    };
  }

  if (metadata.syncStatus === "stale") {
    return {
      badge: "Stale",
      detail: metadata.statusDetail,
      warning: metadata.syncError,
      tone: "warning",
    };
  }

  if (metadata.syncStatus === "not_connected") {
    return {
      badge: "Not connected",
      detail: metadata.statusDetail,
      warning: metadata.syncError,
      tone: "warning",
    };
  }

  return {
    badge: "Saved data loaded",
    detail: metadata.statusDetail,
    warning: metadata.syncError,
    tone: "neutral",
  };
}

function formatRelativeAgeForHostSync(timestamp: string, timeAnchor: number): string {
  const value = Date.parse(timestamp);
  if (!Number.isFinite(value)) return "recently";
  const diffSeconds = Math.max(0, Math.round((timeAnchor - value) / 1000));
  if (diffSeconds < 45) return "just now";
  if (diffSeconds < 3600) return `${Math.max(1, Math.round(diffSeconds / 60))} minute${Math.round(diffSeconds / 60) === 1 ? "" : "s"} ago`;
  const hours = Math.round(diffSeconds / 3600);
  return `${hours} hour${hours === 1 ? "" : "s"} ago`;
}

export function summarizeCalendarRoomSyncStatuses(input: {
  requestedRoomIds: string[];
  connected: boolean;
  lastSyncedAt: string | null;
  roomMappings: Array<{ stayUnitId: string; externalRoomTypeId: string | null; syncStatus: string | null }>;
  ratePlans: Array<{ stayUnitId: string; externalRatePlanId: string | null; syncStatus: string | null }>;
  jobs: Array<{ status: string | null; updatedAt: string | null; runAfter: string | null; payload: JsonRecord }>;
}): HostProCalendarRoomSyncSummary[] {
  return input.requestedRoomIds.map((roomId) => {
    const roomMapping = input.roomMappings.find((entry) => entry.stayUnitId === roomId) ?? null;
    const ratePlan = input.ratePlans.find((entry) => entry.stayUnitId === roomId) ?? null;
    const mapped = Boolean(roomMapping?.externalRoomTypeId) && Boolean(ratePlan?.externalRatePlanId);
    const roomJobs = input.jobs.filter((job) => {
      const jobRoomIds = safeJobRoomIds(job.payload);
      return jobRoomIds.length === 0 || jobRoomIds.includes(roomId);
    });
    const pendingJobCount = roomJobs.filter((job) => {
      const status = asString(job.status);
      return status === "queued" || status === "retrying" || status === "running";
    }).length;
    const failedJobCount = roomJobs.filter((job) => {
      const status = asString(job.status);
      return status === "failed" || status === "dead_lettered";
    }).length;
    const latestFailedAt = latestIsoDate(
      roomJobs
        .filter((job) => {
          const status = asString(job.status);
          return status === "failed" || status === "dead_lettered";
        })
        .map((job) => job.updatedAt ?? job.runAfter)
    );

    let status: HostProCalendarRoomSyncStatus;
    let safeMessage: string;

    if (!input.connected) {
      status = "stale";
      safeMessage = "Channex is not connected for this property yet.";
    } else if (!mapped) {
      status = "not_mapped";
      safeMessage = "Room or rate mapping is missing.";
    } else if (roomJobs.some((job) => asString(job.status) === "running")) {
      status = "syncing";
      safeMessage = "Channex refresh is running for this room.";
    } else if (roomJobs.some((job) => {
      const token = asString(job.status);
      return token === "queued" || token === "retrying";
    })) {
      status = "pending";
      safeMessage = "Channex refresh is queued for this room.";
    } else if (failedJobCount > 0 && (!input.lastSyncedAt || (latestFailedAt != null && latestFailedAt >= input.lastSyncedAt))) {
      status = "failed";
      safeMessage = "Last Channex refresh failed for this room.";
    } else if (input.lastSyncedAt) {
      status = "synced";
      safeMessage = "Saved calendar is synced for this room.";
    } else {
      status = "stale";
      safeMessage = "Showing saved calendar for this room.";
    }

    return {
      roomId,
      provider: "channex",
      status,
      lastSyncedAt: input.lastSyncedAt,
      pendingJobCount,
      failedJobCount,
      safeMessage,
    };
  });
}

async function loadCalendarSyncDiagnostics(input: {
  supabase: SupabaseClient;
  familyId: string;
}): Promise<Array<{ status: string | null; message: string | null; lastSeenAt: string | null }>> {
  const { data, error } = await input.supabase
    .from("channel_provider_diagnostics")
    .select("status,message,last_seen_at")
    .eq("family_id", input.familyId)
    .eq("provider_code", "channex")
    .order("last_seen_at", { ascending: false })
    .limit(20);

  if (error) {
    if (isSchemaCompatibilityError(error)) return [];
    throw error;
  }

  return ((data ?? []) as JsonRecord[]).map((row) => ({
    status: asString(row.status),
    message: asString(row.message),
    lastSeenAt: asString(row.last_seen_at),
  }));
}

export async function loadHostProCalendarSyncSnapshot(input: {
  supabase: SupabaseClient;
  familyId: string;
  stayUnitIds?: string[] | null;
  observedAt?: string;
}): Promise<HostProCalendarSyncMetadata> {
  const observedAt = input.observedAt ?? new Date().toISOString();
  const requestedRoomIds = [...new Set((input.stayUnitIds ?? []).filter(Boolean))];
  let roomMappingsQuery = input.supabase
    .from("channel_room_mappings")
    .select("stay_unit_id,external_room_type_id,sync_status")
    .eq("family_id", input.familyId)
    .eq("provider_code", "channex");
  let ratePlansQuery = input.supabase
    .from("channel_rate_plans")
    .select("stay_unit_id,external_rate_plan_id,sync_status")
    .eq("family_id", input.familyId)
    .eq("provider_code", "channex");

  if (requestedRoomIds.length > 0) {
    roomMappingsQuery = roomMappingsQuery.in("stay_unit_id", requestedRoomIds);
    ratePlansQuery = ratePlansQuery.in("stay_unit_id", requestedRoomIds);
  }

  const [propertyResult, roomMappingsResult, ratePlansResult, jobsResult, logsResult, diagnostics] = await Promise.all([
    input.supabase
      .from("channel_properties")
      .select("id,external_property_id,sync_status,last_synced_at,metadata")
      .eq("family_id", input.familyId)
      .eq("provider_code", "channex")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    roomMappingsQuery,
    ratePlansQuery,
    input.supabase
      .from("channel_sync_jobs")
      .select("status,updated_at,run_after,payload")
      .eq("family_id", input.familyId)
      .eq("provider_code", "channex")
      .order("created_at", { ascending: false })
      .limit(100),
    input.supabase
      .from("channel_sync_logs")
      .select("status,message,created_at")
      .eq("family_id", input.familyId)
      .eq("provider_code", "channex")
      .eq("action", "calendar_pull_sync")
      .order("created_at", { ascending: false })
      .limit(20),
    loadCalendarSyncDiagnostics({
      supabase: input.supabase,
      familyId: input.familyId,
    }),
  ]);

  if (propertyResult.error) throw propertyResult.error;
  if (roomMappingsResult.error) throw roomMappingsResult.error;
  if (ratePlansResult.error) throw ratePlansResult.error;
  if (jobsResult.error) throw jobsResult.error;
  if (logsResult.error) throw logsResult.error;

  const property = (propertyResult.data ?? null) as JsonRecord | null;
  const metadata = asObject(property?.metadata);
  const externalPropertyId = asString(property?.external_property_id);
  const connected = Boolean(externalPropertyId);
  const roomMappings = ((roomMappingsResult.data ?? []) as JsonRecord[]).map((row) => ({
    stayUnitId: asString(row.stay_unit_id) ?? "",
    externalRoomTypeId: asString(row.external_room_type_id),
    syncStatus: asString(row.sync_status),
  }));
  const ratePlans = ((ratePlansResult.data ?? []) as JsonRecord[]).map((row) => ({
    stayUnitId: asString(row.stay_unit_id) ?? "",
    externalRatePlanId: asString(row.external_rate_plan_id),
    syncStatus: asString(row.sync_status),
  }));
  const jobs = ((jobsResult.data ?? []) as JsonRecord[]).map((row) => ({
    status: asString(row.status),
    updatedAt: asString(row.updated_at),
    runAfter: asString(row.run_after),
    payload: asObject(row.payload),
  }));
  const logs = ((logsResult.data ?? []) as JsonRecord[]).map((row) => ({
    status: asString(row.status),
    message: asString(row.message),
    createdAt: asString(row.created_at),
  }));
  const latestSuccessAt = latestIsoDate([
    asString(property?.last_synced_at),
    asString(metadata.last_calendar_pull_success_at),
    ...logs.filter((row) => row.status === "success").map((row) => row.createdAt),
  ]);
  const latestFailure = logs.find((row) => row.status === "failed") ?? null;
  const latestFailureAt = latestIsoDate([
    asString(metadata.last_calendar_pull_failed_at),
    latestFailure?.createdAt,
    ...diagnostics.filter((row) => row.status === "open").map((row) => row.lastSeenAt),
  ]);
  const anyRunning = jobs.some((job) => job.status === "running");
  const anyQueued = jobs.some((job) => job.status === "queued" || job.status === "retrying");
  const failedJobCount = jobs.filter((job) => job.status === "failed" || job.status === "dead_lettered").length;
  const roomStatuses = summarizeCalendarRoomSyncStatuses({
    requestedRoomIds,
    connected,
    lastSyncedAt: latestSuccessAt,
    roomMappings,
    ratePlans,
    jobs,
  });
  const unmappedRooms = roomStatuses.filter((entry) => entry.status === "not_mapped").length;
  const latestOpenDiagnostic = diagnostics.find((row) => row.status === "open") ?? null;

  if (!connected) {
    return buildCalendarSyncMetadata({
      connected: false,
      ok: false,
      observedAt,
      roomStatuses,
      error: "Channex is not connected for this property yet.",
      statusTitle: "Not connected",
      statusDetail: "Showing saved calendar. Channex is not connected for this property yet.",
    });
  }

  if (requestedRoomIds.length > 0 && unmappedRooms === requestedRoomIds.length) {
    return buildCalendarSyncMetadata({
      connected: true,
      observedAt,
      syncStatus: "not_mapped",
      syncSource: latestSuccessAt ? "cache" : "none",
      lastSyncedAt: latestSuccessAt,
      roomStatuses,
      error: "Room or rate mapping is missing. Open Room & Price Matching.",
      statusTitle: "Not mapped",
      statusDetail: "Showing saved calendar. One or more rooms still need Channex room or rate mapping.",
    });
  }

  if (anyRunning) {
    return buildCalendarSyncMetadata({
      connected: true,
      observedAt,
      syncStatus: "syncing",
      syncSource: latestSuccessAt ? "cache" : "none",
      lastSyncedAt: latestSuccessAt,
      roomStatuses,
      statusTitle: "Syncing",
      statusDetail: "Showing saved calendar. Channex refresh is running.",
    });
  }

  if (anyQueued) {
    return buildCalendarSyncMetadata({
      connected: true,
      observedAt,
      syncStatus: "pending",
      syncSource: latestSuccessAt ? "cache" : "none",
      lastSyncedAt: latestSuccessAt,
      roomStatuses,
      statusTitle: "Refresh pending",
      statusDetail: "Showing saved calendar. Channex refresh is queued.",
    });
  }

  if (failedJobCount > 0 && (!latestSuccessAt || (latestFailureAt != null && latestFailureAt >= latestSuccessAt))) {
    return buildCalendarSyncMetadata({
      connected: true,
      ok: false,
      observedAt,
      lastSyncedAt: latestSuccessAt,
      roomStatuses,
      error: latestOpenDiagnostic?.message ?? latestFailure?.message ?? "Channex refresh failed.",
      statusTitle: "Sync failed",
      statusDetail: "Showing saved calendar. Last Channex refresh failed.",
    });
  }

  if (latestSuccessAt) {
    return buildCalendarSyncMetadata({
      connected: true,
      ok: true,
      observedAt,
      lastSyncedAt: latestSuccessAt,
      roomStatuses,
      applied: false,
      statusTitle: "Synced",
      statusDetail: "Saved calendar is up to date with the latest Channex refresh.",
    });
  }

  return buildCalendarSyncMetadata({
    connected: true,
    observedAt,
    syncStatus: "stale",
    syncSource: "cache",
    lastSyncedAt: null,
    roomStatuses,
    error: latestOpenDiagnostic?.message ?? null,
    statusTitle: "Saved data loaded",
    statusDetail: "Showing saved calendar. Channex has not refreshed this range yet.",
  });
}

async function persistCalendarSyncPropertySnapshot(input: {
  supabase: SupabaseClient;
  propertyId: string;
  currentMetadata: JsonRecord;
  observedAt: string;
  status: "success" | "failed" | "partial";
  error?: string | null;
  availabilityRows?: number;
  restrictionRows?: number;
  appliedRows?: number;
}): Promise<void> {
  const nextMetadata: JsonRecord = {
    ...input.currentMetadata,
    last_calendar_pull_status: input.status,
    last_calendar_pull_attempt_at: input.observedAt,
    last_calendar_pull_error: input.status === "success" ? null : sanitizeHostCalendarSyncMessage(input.error),
    last_calendar_pull_availability_rows: input.availabilityRows ?? 0,
    last_calendar_pull_restriction_rows: input.restrictionRows ?? 0,
    last_calendar_pull_applied_rows: input.appliedRows ?? 0,
  };

  if (input.status === "success") {
    nextMetadata.last_calendar_pull_success_at = input.observedAt;
  } else {
    nextMetadata.last_calendar_pull_failed_at = input.observedAt;
  }

  const updatePayload: JsonRecord = {
    metadata: nextMetadata,
    updated_at: input.observedAt,
  };
  if (input.status === "success") {
    updatePayload.last_synced_at = input.observedAt;
  }

  const { error } = await input.supabase
    .from("channel_properties")
    .update(updatePayload as never)
    .eq("id", input.propertyId);

  if (error && !isSchemaCompatibilityError(error)) {
    console.error("[host-pro-calendar-sync] unable to persist property snapshot", error);
  }
}

async function logCalendarSyncAttempt(input: {
  supabase: SupabaseClient;
  familyId: string;
  status: "success" | "failed";
  message: string;
  payload: JsonRecord;
}): Promise<void> {
  const { error } = await input.supabase.from("channel_sync_logs").insert({
    family_id: input.familyId,
    provider_code: "channex",
    action: "calendar_pull_sync",
    status: input.status,
    message: input.message,
    payload: input.payload,
  } as never);

  if (error) {
    const message = String(error.message ?? "");
    if (!/relation|does not exist|schema cache/i.test(message)) {
      console.error("[host-pro-calendar-sync] log failed:", error);
    }
  }
}

async function loadCalendarMappings(
  supabase: SupabaseClient,
  input: { familyId: string; stayUnitIds?: string[] | null }
): Promise<CalendarMapping[]> {
  let roomMappingsQuery = supabase
    .from("channel_room_mappings")
    .select("stay_unit_id,external_room_type_id")
    .eq("family_id", input.familyId)
    .eq("provider_code", "channex");
  let ratePlansQuery = supabase
    .from("channel_rate_plans")
    .select("stay_unit_id,external_rate_plan_id")
    .eq("family_id", input.familyId)
    .eq("provider_code", "channex");

  if (input.stayUnitIds?.length) {
    roomMappingsQuery = roomMappingsQuery.in("stay_unit_id", input.stayUnitIds);
    ratePlansQuery = ratePlansQuery.in("stay_unit_id", input.stayUnitIds);
  }

  const [roomMappingsResult, ratePlansResult] = await Promise.all([roomMappingsQuery, ratePlansQuery]);
  if (roomMappingsResult.error) throw roomMappingsResult.error;
  if (ratePlansResult.error) throw ratePlansResult.error;

  const byRoom = new Map<string, CalendarMapping>();
  for (const row of (roomMappingsResult.data ?? []) as JsonRecord[]) {
    const stayUnitId = asString(row.stay_unit_id);
    if (!stayUnitId) continue;
    byRoom.set(stayUnitId, {
      stayUnitId,
      externalRoomTypeId: asString(row.external_room_type_id),
      externalRatePlanId: null,
    });
  }
  for (const row of (ratePlansResult.data ?? []) as JsonRecord[]) {
    const stayUnitId = asString(row.stay_unit_id);
    if (!stayUnitId) continue;
    const current = byRoom.get(stayUnitId) ?? {
      stayUnitId,
      externalRoomTypeId: null,
      externalRatePlanId: null,
    };
    current.externalRatePlanId = asString(row.external_rate_plan_id);
    byRoom.set(stayUnitId, current);
  }

  return [...byRoom.values()];
}

async function applySnapshotsToFamlo(input: {
  supabase: SupabaseClient;
  familyId: string;
  from: string;
  to: string;
  mappings: CalendarMapping[];
  availability: Record<string, Record<string, number>>;
  restrictions: Record<string, Record<string, JsonRecord>>;
}): Promise<number> {
  let appliedRows = 0;
  for (const mapping of input.mappings) {
    if (!mapping.externalRoomTypeId && !mapping.externalRatePlanId) continue;
    const dates = enumerateDates(input.from, input.to);
    for (const date of dates) {
      const availability = mapping.externalRoomTypeId
        ? input.availability[mapping.externalRoomTypeId]?.[date]
        : undefined;
      const restriction = mapping.externalRatePlanId
        ? asObject(input.restrictions[mapping.externalRatePlanId]?.[date])
        : {};
      if (availability == null && Object.keys(restriction).length === 0) continue;

      const normalizedRestriction = normalizeRestrictionSnapshotPayload(restriction);
      const stopSell = normalizedRestriction.stop_sell === true;
      const sourceReference = `${mapping.externalRoomTypeId ?? ""}:${mapping.externalRatePlanId ?? ""}:${date}`;
      const payload = {
        availability: availability ?? null,
        amount: normalizedRestriction.amount,
        stop_sell: stopSell,
        cta: normalizedRestriction.cta,
        ctd: normalizedRestriction.ctd,
        min_stay: normalizedRestriction.min_stay_through,
        min_stay_through: normalizedRestriction.min_stay_through,
        min_stay_arrival: normalizedRestriction.min_stay_arrival,
        max_stay: normalizedRestriction.max_stay,
        is_blocked: availability != null ? availability <= 0 || stopSell : stopSell,
        updated_via: "channex_calendar_pull",
      };

      const { data: existingEvent, error: existingEventError } = await input.supabase
        .from("inventory_event_log")
        .select("id,payload")
        .eq("family_id", input.familyId)
        .eq("stay_unit_id", mapping.stayUnitId)
        .eq("event_source", "channex_calendar_pull")
        .eq("source_reference", sourceReference)
        .eq("effective_date_start", date)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (existingEventError && !isSchemaCompatibilityError(existingEventError)) throw existingEventError;
      if (existingEvent?.id && stableStringify(asObject(existingEvent.payload)) === stableStringify(payload)) {
        continue;
      }

      await appendInventoryEvent(input.supabase, {
        familyId: input.familyId,
        stayUnitId: mapping.stayUnitId,
        eventType: "ota_sync_applied",
        eventSource: "channex_calendar_pull",
        sourceReference,
        effectiveDateStart: date,
        effectiveDateEnd: date,
        payload,
        actorRole: "system",
      });
      appliedRows += 1;
    }

    await projectInventoryRange(input.supabase, {
      familyId: input.familyId,
      stayUnitId: mapping.stayUnitId,
      from: input.from,
      to: input.to,
    });
  }
  return appliedRows;
}

export async function pullChannexCalendarForFamlo(input: {
  supabase: SupabaseClient;
  familyId: string;
  dateFrom: string;
  dateTo: string;
  stayUnitIds?: string[] | null;
  source: "calendar_open" | "background_open" | "poll" | "sync_now" | "webhook";
}): Promise<ChannexCalendarPullResult> {
  const observedAt = new Date().toISOString();
  if (!isIsoDate(input.dateFrom) || !isIsoDate(input.dateTo) || input.dateTo < input.dateFrom) {
    throw new Error("Valid calendar sync date range is required.");
  }

  const { data: propertyRow, error: propertyError } = await input.supabase
    .from("channel_properties")
    .select("id,external_property_id,sync_status,last_synced_at,metadata")
    .eq("family_id", input.familyId)
    .eq("provider_code", "channex")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (propertyError) throw propertyError;

  const externalPropertyId = asString((propertyRow as JsonRecord | null)?.external_property_id);
  if (!externalPropertyId) {
    const snapshot = await loadHostProCalendarSyncSnapshot({
      supabase: input.supabase,
      familyId: input.familyId,
      stayUnitIds: input.stayUnitIds ?? null,
      observedAt,
    });
    return {
      metadata: snapshot,
      availabilityRows: 0,
      restrictionRows: 0,
      appliedRows: 0,
    };
  }

  const propertyId = asString((propertyRow as JsonRecord | null)?.id);
  const propertyMetadata = asObject((propertyRow as JsonRecord | null)?.metadata);

  try {
    const [availabilityResult, restrictionsResult, mappings] = await Promise.all([
      fetchChannexAvailabilitySnapshot({
        propertyId: externalPropertyId,
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
      }),
      fetchChannexRestrictionsSnapshot({
        propertyId: externalPropertyId,
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
      }),
      loadCalendarMappings(input.supabase, {
        familyId: input.familyId,
        stayUnitIds: input.stayUnitIds ?? null,
      }),
    ]);
    const availabilityOk = availabilityResult.ok;
    const restrictionsOk = restrictionsResult.ok;
    if (!availabilityOk || !restrictionsOk) {
      const partial = availabilityOk !== restrictionsOk;
      const message = partial
        ? availabilityOk
          ? `Channex restrictions refresh failed. ${restrictionsResult.message}`
          : `Channex availability refresh failed. ${availabilityResult.message}`
        : `Channex calendar pull failed. Availability: ${availabilityResult.message} Restrictions: ${restrictionsResult.message}`;
      await logCalendarSyncAttempt({
        supabase: input.supabase,
        familyId: input.familyId,
        status: "failed",
        message,
        payload: {
          source: input.source,
          property_id: externalPropertyId,
          date_from: input.dateFrom,
          date_to: input.dateTo,
          availability_http_status: availabilityResult.httpStatus,
          restrictions_http_status: restrictionsResult.httpStatus,
        },
      });
      if (propertyId) {
        await persistCalendarSyncPropertySnapshot({
          supabase: input.supabase,
          propertyId,
          currentMetadata: propertyMetadata,
          observedAt,
          status: partial ? "partial" : "failed",
          error: message,
        });
      }
      const snapshot = await loadHostProCalendarSyncSnapshot({
        supabase: input.supabase,
        familyId: input.familyId,
        stayUnitIds: input.stayUnitIds ?? null,
        observedAt,
      });
      return {
        metadata: buildCalendarSyncMetadata({
          ...snapshot,
          connected: true,
          observedAt,
          lastSyncedAt: snapshot.lastSyncedAt,
          roomStatuses: snapshot.roomStatuses,
          syncStatus: partial ? "partial" : "failed",
          syncSource: "cache",
          error: message,
          partial,
          stale: true,
          statusTitle: partial ? "Partial sync" : "Sync failed",
          statusDetail: partial
            ? "Showing saved calendar. Channex returned only part of the refresh."
            : "Showing saved calendar. Last Channex refresh failed.",
        }),
        availabilityRows: availabilityOk
          ? Object.values(availabilityResult.data).reduce<number>((sum, byDate) => sum + Object.keys(byDate).length, 0)
          : 0,
        restrictionRows: restrictionsOk
          ? Object.values(restrictionsResult.data).reduce<number>((sum, byDate) => sum + Object.keys(byDate).length, 0)
          : 0,
        appliedRows: 0,
      };
    }

    const availabilityRows = Object.values(availabilityResult.data).reduce<number>(
      (sum, byDate) => sum + Object.keys(byDate).length,
      0
    );
    const restrictionRows = Object.values(restrictionsResult.data).reduce<number>(
      (sum, byDate) => sum + Object.keys(byDate).length,
      0
    );
    const appliedRows = await applySnapshotsToFamlo({
      supabase: input.supabase,
      familyId: input.familyId,
      from: input.dateFrom,
      to: input.dateTo,
      mappings,
      availability: availabilityResult.data,
      restrictions: restrictionsResult.data,
    });

    await logCalendarSyncAttempt({
      supabase: input.supabase,
      familyId: input.familyId,
      status: "success",
      message: "Fresh Channex calendar pull completed and was applied to Famlo inventory.",
      payload: {
        source: input.source,
        property_id: externalPropertyId,
        date_from: input.dateFrom,
        date_to: input.dateTo,
        availability_rows: availabilityRows,
        restriction_rows: restrictionRows,
        applied_rows: appliedRows,
        stay_unit_ids: input.stayUnitIds ?? null,
      },
    });
    if (propertyId) {
      await persistCalendarSyncPropertySnapshot({
        supabase: input.supabase,
        propertyId,
        currentMetadata: propertyMetadata,
        observedAt,
        status: "success",
        availabilityRows,
        restrictionRows,
        appliedRows,
      });
    }
    const snapshot = await loadHostProCalendarSyncSnapshot({
      supabase: input.supabase,
      familyId: input.familyId,
      stayUnitIds: input.stayUnitIds ?? null,
      observedAt,
    });

    return {
      metadata: buildCalendarSyncMetadata({
        ...snapshot,
        connected: true,
        ok: true,
        observedAt,
        lastSyncedAt: snapshot.lastSyncedAt ?? observedAt,
        roomStatuses: snapshot.roomStatuses,
        applied: true,
      }),
      availabilityRows,
      restrictionRows,
      appliedRows,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Channex calendar pull failed.";
    await logCalendarSyncAttempt({
      supabase: input.supabase,
      familyId: input.familyId,
      status: "failed",
      message,
      payload: {
        source: input.source,
        property_id: externalPropertyId,
        date_from: input.dateFrom,
        date_to: input.dateTo,
        stay_unit_ids: input.stayUnitIds ?? null,
      },
    });
    if (propertyId) {
      await persistCalendarSyncPropertySnapshot({
        supabase: input.supabase,
        propertyId,
        currentMetadata: propertyMetadata,
        observedAt,
        status: "failed",
        error: message,
      });
    }
    const snapshot = await loadHostProCalendarSyncSnapshot({
      supabase: input.supabase,
      familyId: input.familyId,
      stayUnitIds: input.stayUnitIds ?? null,
      observedAt,
    });
    return {
      metadata: buildCalendarSyncMetadata({
        ...snapshot,
        connected: true,
        ok: false,
        observedAt,
        lastSyncedAt: snapshot.lastSyncedAt,
        roomStatuses: snapshot.roomStatuses,
        error: message,
        statusTitle: "Sync failed",
        statusDetail: "Showing saved calendar. Last Channex refresh failed.",
      }),
      availabilityRows: 0,
      restrictionRows: 0,
      appliedRows: 0,
    };
  }
}
