import type { SupabaseClient } from "@supabase/supabase-js";

import {
  fetchChannexAvailabilitySnapshot,
  fetchChannexChannelsForProperty,
  fetchChannexPropertyById,
  fetchChannexRestrictionsSnapshot,
  getChannexConfigSummary,
  pushChannexAvailability,
  pushChannexRestrictions,
  type ChannexAvailabilityChange,
  type ChannexRestrictionChange,
} from "@/lib/channel-providers/channex/client";
import { loadCanonicalCalendar, type CanonicalCalendarEvent } from "@/lib/calendar";
import { loadHostProAccess } from "@/lib/host-pro-access";
import { loadHostProSettings, PRO_DEFAULT_CURRENCY } from "@/lib/host-pro-settings";
import { enumerateDateRange } from "@/lib/platform-utils";
import { loadStayUnitsForSelector } from "@/lib/stay-units";

type JsonRecord = Record<string, unknown>;

type RoomSummary = {
  stayUnitId: string;
  name: string;
  status: "eligible" | "missing_fields";
  missingFields: string[];
};

type VerificationSummary = {
  verifiedAvailabilityCount: number;
  verifiedRateCount: number;
  verifiedMinStayThroughCount: number;
  availabilityMismatches: Array<{ roomTypeId: string; date: string; expected: number; actual: number | null }>;
  rateMismatches: Array<{ ratePlanId: string; date: string; expected: string; actual: string | null }>;
};

type PushRangeSummary = {
  roomName: string;
  roomTypeId: string;
  ratePlanId: string;
  availabilityRanges: Array<{ dateFrom: string; dateTo: string; availability: number }>;
  rateRanges: Array<{ dateFrom: string; dateTo: string; rate: string; stopSell: boolean; minStayThrough: number }>;
};

type AriChannelHealth = {
  channelAttached: boolean;
  channelActive: boolean;
  accChannelsCount: number | null;
  activeChannelId: string | null;
  activeChannelTitle: string | null;
  hotelId: string | null;
};

export type ChannexAriHealthSnapshot = {
  lastAriSyncAt: string | null;
  lastSuccessfulAriSyncAt: string | null;
  lastAriSyncError: string | null;
  lastAriSyncErrorAt: string | null;
  consecutiveAriFailures: number;
  syncedDateRange: { from: string; to: string; windowDays: number } | null;
  verifiedAvailabilityCount: number;
  verifiedRateCount: number;
  verifiedMinStayThroughCount: number;
  availabilityMismatchCount: number;
  rateMismatchCount: number;
  lastAriSyncAction: string | null;
  lastAriSyncStatus: "synced" | "sync_failed" | "sync_overdue" | "channel_disconnected" | "not_started";
  lastAriSyncMessage: string | null;
  channelAttached: boolean;
  channelActive: boolean;
  accChannelsCount: number | null;
  activeChannelId: string | null;
  activeChannelTitle: string | null;
  hotelId: string | null;
};

export type ChannexAriSyncResult = {
  ok: boolean;
  status:
    | "completed"
    | "warning"
    | "verification_failed"
    | "failed"
    | "create_property_first"
    | "no_eligible_rooms"
    | "channel_disconnected"
    | "famlo_pro_inactive";
  message: string;
  dateRange: { from: string; to: string };
  windowDays: number;
  eligibleRooms: number;
  availabilityChanges: number;
  restrictionChanges: number;
  verifiedAvailabilityCount: number;
  verifiedRateCount: number;
  verifiedMinStayThroughCount: number;
  warnings: string[];
  availabilityVerificationOk: boolean;
  restrictionsVerificationOk: boolean;
  verificationFailed: boolean;
  chunkSummary: {
    availabilityChunkCount: number;
    restrictionChunkCount: number;
  };
  verificationSummary: {
    availabilityMismatchCount: number;
    rateMismatchCount: number;
    availabilityMismatches: VerificationSummary["availabilityMismatches"];
    rateMismatches: VerificationSummary["rateMismatches"];
  };
  rooms: RoomSummary[];
  pushedRanges: PushRangeSummary[];
  availabilityMessage: string | null;
  restrictionsMessage: string | null;
  availabilityWarnings: string[];
  restrictionsWarnings: string[];
  channelHealth: AriChannelHealth;
  healthSnapshot: ChannexAriHealthSnapshot;
};

type SyncInput = {
  supabase: SupabaseClient;
  familyId: string;
  hostId?: string | null;
  windowDays: number;
  action: "push_ari_30_day" | "push_ari_365_day";
  route: string;
  requireActiveChannel: boolean;
};

const DEFAULT_WINDOW_DAYS = 30;
const LONG_WINDOW_DAYS = 365;
const MAX_SEGMENTS_PER_REQUEST = 120;

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asObject(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function normalizeCurrency(value: string | null): string | null {
  return value ? value.trim().toUpperCase() : null;
}

function addMissing(list: string[], value: unknown, label: string): void {
  if (!value) list.push(label);
}

function formatPriceForChannex(value: number): string {
  return value.toFixed(2);
}

function getLocalDateString(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function getDateRange(timeZone: string, windowDays: number): { from: string; to: string } {
  const now = new Date();
  const from = getLocalDateString(now, timeZone);
  const safeWindowDays = Math.max(1, Math.floor(windowDays));
  const toDate = new Date(now.getTime() + (safeWindowDays - 1) * 24 * 60 * 60 * 1000);
  return { from, to: getLocalDateString(toDate, timeZone) };
}

function buildSegments(
  dates: string[],
  availabilityByDate: Record<string, number>,
  rateByDate: Record<string, string>,
  stopSellByDate: Record<string, boolean>
): Array<{ dateFrom: string; dateTo: string; availability: number; rate: string; stopSell: boolean }> {
  const segments: Array<{ dateFrom: string; dateTo: string; availability: number; rate: string; stopSell: boolean }> = [];
  for (const date of dates) {
    const availability = availabilityByDate[date] ?? 0;
    const rate = rateByDate[date] ?? "0.00";
    const stopSell = stopSellByDate[date] ?? availability <= 0;
    const last = segments[segments.length - 1];
    if (last && last.availability === availability && last.rate === rate && last.stopSell === stopSell) {
      last.dateTo = date;
      continue;
    }
    segments.push({ dateFrom: date, dateTo: date, availability, rate, stopSell });
  }
  return segments;
}

function normalizeWarningMessages(warnings: unknown[]): string[] {
  return warnings.flatMap((warning) => {
    if (typeof warning === "string" && warning.trim().length > 0) return [warning.trim()];
    if (warning && typeof warning === "object" && !Array.isArray(warning)) {
      return Object.entries(warning as Record<string, unknown>).flatMap(([key, value]) => {
        if (typeof value === "string" && value.trim().length > 0) return [`${key}: ${value.trim()}`];
        if (Array.isArray(value)) return value.map((entry) => `${key}: ${String(entry)}`);
        return [`${key}: ${JSON.stringify(value)}`];
      });
    }
    return [String(warning)];
  });
}

function chunkArray<T>(values: T[], size: number): T[][] {
  if (values.length === 0) return [];
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

function aggregatePushResults(input: Array<{ ok: boolean; httpStatus: number | null; message: string; meta: Record<string, unknown> | null; warnings: unknown[] }>) {
  return {
    ok: input.every((item) => item.ok),
    httpStatus: input.find((item) => !item.ok)?.httpStatus ?? input[0]?.httpStatus ?? null,
    message: input.map((item) => item.message).filter(Boolean).join(" | "),
    warnings: input.flatMap((item) => normalizeWarningMessages(item.warnings)),
    meta: {
      chunk_count: input.length,
      http_statuses: input.map((item) => item.httpStatus),
      messages: input.map((item) => item.message),
      metas: input.map((item) => item.meta),
    },
  };
}

function verifySnapshots(input: {
  availabilitySnapshot: Record<string, Record<string, number>>;
  restrictionsSnapshot: Record<string, Record<string, Record<string, unknown>>>;
  availabilityValues: ChannexAvailabilityChange[];
  restrictionValues: ChannexRestrictionChange[];
}): VerificationSummary {
  const availabilityMismatches: VerificationSummary["availabilityMismatches"] = [];
  const rateMismatches: VerificationSummary["rateMismatches"] = [];
  let verifiedAvailabilityCount = 0;
  let verifiedRateCount = 0;
  let verifiedMinStayThroughCount = 0;

  for (const value of input.availabilityValues) {
    for (const date of enumerateDateRange(value.dateFrom, value.dateTo)) {
      const actual = input.availabilitySnapshot[value.roomTypeId]?.[date];
      if (actual === value.availability) {
        verifiedAvailabilityCount += 1;
      } else {
        availabilityMismatches.push({
          roomTypeId: value.roomTypeId,
          date,
          expected: value.availability,
          actual: typeof actual === "number" ? actual : null,
        });
      }
    }
  }

  for (const value of input.restrictionValues) {
    for (const date of enumerateDateRange(value.dateFrom, value.dateTo)) {
      const actualRestrictions = input.restrictionsSnapshot[value.ratePlanId]?.[date] ?? null;
      const actualRate = actualRestrictions?.rate;
      const actualMinStayThrough = actualRestrictions?.min_stay_through;
      const normalizedActual =
        typeof actualRate === "string" ? actualRate : typeof actualRate === "number" ? actualRate.toFixed(2) : null;
      const normalizedMinStayThrough =
        typeof actualMinStayThrough === "number"
          ? actualMinStayThrough
          : typeof actualMinStayThrough === "string" && actualMinStayThrough.trim().length > 0
            ? Number(actualMinStayThrough)
            : null;
      if (normalizedActual === value.rate && normalizedMinStayThrough === value.minStayThrough) {
        verifiedRateCount += 1;
        verifiedMinStayThroughCount += 1;
      } else {
        rateMismatches.push({
          ratePlanId: value.ratePlanId,
          date,
          expected: `${value.rate} / min_stay_through=${value.minStayThrough}`,
          actual:
            normalizedActual != null || normalizedMinStayThrough != null
              ? `${normalizedActual ?? "null"} / min_stay_through=${normalizedMinStayThrough ?? "null"}`
              : null,
        });
      }
    }
  }

  return {
    verifiedAvailabilityCount,
    verifiedRateCount,
    verifiedMinStayThroughCount,
    availabilityMismatches,
    rateMismatches,
  };
}

function addIndiaDays(date: string, days: number): string {
  const base = new Date(`${date}T00:00:00+05:30`);
  base.setDate(base.getDate() + days);
  return base.toISOString().slice(0, 10);
}

function resolveBlockingEndDate(event: CanonicalCalendarEvent): string | null {
  if (!event.isBlocking) return null;
  if (event.sourceType === "internal_booking" && event.endDate > event.startDate) {
    return addIndiaDays(event.endDate, -1);
  }
  return event.endDate;
}

async function logAriPush(input: {
  supabase: SupabaseClient;
  familyId: string;
  action: "push_ari_30_day" | "push_ari_365_day";
  status: "success" | "warning" | "failed";
  message: string;
  payload: Record<string, unknown>;
}): Promise<void> {
  const { error } = await input.supabase.from("channel_sync_logs").insert({
    family_id: input.familyId,
    provider_code: "channex",
    action: input.action,
    status: input.status,
    message: input.message,
    payload: input.payload,
  } as never);

  if (error) {
    const message = String(error.message ?? "");
    if (!/relation|does not exist|schema cache/i.test(message)) {
      console.error("[channex-ari-sync] log failed:", error);
    }
  }
}

function readAriHealthMetadata(metadata: JsonRecord | null): ChannexAriHealthSnapshot | null {
  const health = asObject(metadata?.channexAriHealth);
  if (!health) return null;
  const syncedDateRange = asObject(health.syncedDateRange);
  return {
    lastAriSyncAt: asString(health.lastAriSyncAt),
    lastSuccessfulAriSyncAt: asString(health.lastSuccessfulAriSyncAt),
    lastAriSyncError: asString(health.lastAriSyncError),
    lastAriSyncErrorAt: asString(health.lastAriSyncErrorAt),
    consecutiveAriFailures: asNumber(health.consecutiveAriFailures, 0),
    syncedDateRange:
      syncedDateRange && asString(syncedDateRange.from) && asString(syncedDateRange.to)
        ? {
            from: asString(syncedDateRange.from) ?? "",
            to: asString(syncedDateRange.to) ?? "",
            windowDays: asNumber(syncedDateRange.windowDays, LONG_WINDOW_DAYS),
          }
        : null,
    verifiedAvailabilityCount: asNumber(health.verifiedAvailabilityCount, 0),
    verifiedRateCount: asNumber(health.verifiedRateCount, 0),
    verifiedMinStayThroughCount: asNumber(health.verifiedMinStayThroughCount, 0),
    availabilityMismatchCount: asNumber(health.availabilityMismatchCount, 0),
    rateMismatchCount: asNumber(health.rateMismatchCount, 0),
    lastAriSyncAction: asString(health.lastAriSyncAction),
    lastAriSyncStatus:
      asString(health.lastAriSyncStatus) === "sync_failed" ||
      asString(health.lastAriSyncStatus) === "sync_overdue" ||
      asString(health.lastAriSyncStatus) === "channel_disconnected" ||
      asString(health.lastAriSyncStatus) === "synced"
        ? (asString(health.lastAriSyncStatus) as ChannexAriHealthSnapshot["lastAriSyncStatus"])
        : "not_started",
    lastAriSyncMessage: asString(health.lastAriSyncMessage),
    channelAttached: health.channelAttached === true,
    channelActive: health.channelActive === true,
    accChannelsCount: health.accChannelsCount == null ? null : asNumber(health.accChannelsCount, 0),
    activeChannelId: asString(health.activeChannelId),
    activeChannelTitle: asString(health.activeChannelTitle),
    hotelId: asString(health.hotelId),
  };
}

function buildAriHealthMetadata(input: {
  previous: JsonRecord | null;
  observedAt: string;
  resultStatus: ChannexAriHealthSnapshot["lastAriSyncStatus"];
  message: string;
  dateRange: { from: string; to: string };
  windowDays: number;
  verification: VerificationSummary;
  channelHealth: AriChannelHealth;
  action: string;
}): ChannexAriHealthSnapshot {
  const previousHealth = readAriHealthMetadata(input.previous);
  const successful = input.resultStatus === "synced";
  return {
    lastAriSyncAt: input.observedAt,
    lastSuccessfulAriSyncAt: successful ? input.observedAt : previousHealth?.lastSuccessfulAriSyncAt ?? null,
    lastAriSyncError: successful ? null : input.message,
    lastAriSyncErrorAt: successful ? previousHealth?.lastAriSyncErrorAt ?? null : input.observedAt,
    consecutiveAriFailures: successful ? 0 : (previousHealth?.consecutiveAriFailures ?? 0) + 1,
    syncedDateRange: successful
      ? { from: input.dateRange.from, to: input.dateRange.to, windowDays: input.windowDays }
      : previousHealth?.syncedDateRange ?? null,
    verifiedAvailabilityCount: input.verification.verifiedAvailabilityCount,
    verifiedRateCount: input.verification.verifiedRateCount,
    verifiedMinStayThroughCount: input.verification.verifiedMinStayThroughCount,
    availabilityMismatchCount: input.verification.availabilityMismatches.length,
    rateMismatchCount: input.verification.rateMismatches.length,
    lastAriSyncAction: input.action,
    lastAriSyncStatus: input.resultStatus,
    lastAriSyncMessage: input.message,
    channelAttached: input.channelHealth.channelAttached,
    channelActive: input.channelHealth.channelActive,
    accChannelsCount: input.channelHealth.accChannelsCount,
    activeChannelId: input.channelHealth.activeChannelId,
    activeChannelTitle: input.channelHealth.activeChannelTitle,
    hotelId: input.channelHealth.hotelId,
  };
}

export function shouldSkipChannexAriSync(metadata: JsonRecord | null, now: Date): { skip: boolean; nextEligibleAt: string | null } | null {
  const health = readAriHealthMetadata(metadata);
  if (!health?.lastAriSyncAt) return null;
  const lastTs = Date.parse(health.lastAriSyncAt);
  if (!Number.isFinite(lastTs)) return null;
  const nowTs = now.getTime();
  const backoffMinutes = health.consecutiveAriFailures > 0 ? Math.min(180, 15 * Math.pow(2, Math.max(0, health.consecutiveAriFailures - 1))) : 23 * 60;
  const nextEligibleTs = lastTs + backoffMinutes * 60_000;
  if (nowTs < nextEligibleTs) {
    return { skip: true, nextEligibleAt: new Date(nextEligibleTs).toISOString() };
  }
  return null;
}

export async function syncChannexAriForFamily(input: SyncInput): Promise<ChannexAriSyncResult> {
  const observedAt = new Date().toISOString();
  const config = getChannexConfigSummary();
  const windowDays = input.windowDays === LONG_WINDOW_DAYS ? LONG_WINDOW_DAYS : DEFAULT_WINDOW_DAYS;

  if (config.environment === "production" && !config.productionMutationsAllowed) {
    return {
      ok: false,
      status: "failed",
      message: "Production ARI mutation is blocked by the Channex safety guard.",
      dateRange: { from: "", to: "" },
      windowDays,
      eligibleRooms: 0,
      availabilityChanges: 0,
      restrictionChanges: 0,
      verifiedAvailabilityCount: 0,
      verifiedRateCount: 0,
      verifiedMinStayThroughCount: 0,
      warnings: [],
      availabilityVerificationOk: false,
      restrictionsVerificationOk: false,
      verificationFailed: true,
      chunkSummary: { availabilityChunkCount: 0, restrictionChunkCount: 0 },
      verificationSummary: { availabilityMismatchCount: 0, rateMismatchCount: 0, availabilityMismatches: [], rateMismatches: [] },
      rooms: [],
      pushedRanges: [],
      availabilityMessage: null,
      restrictionsMessage: null,
      availabilityWarnings: [],
      restrictionsWarnings: [],
      channelHealth: {
        channelAttached: false,
        channelActive: false,
        accChannelsCount: null,
        activeChannelId: null,
        activeChannelTitle: null,
        hotelId: null,
      },
      healthSnapshot: {
        lastAriSyncAt: observedAt,
        lastSuccessfulAriSyncAt: null,
        lastAriSyncError: "Production ARI mutation is blocked by the Channex safety guard.",
        lastAriSyncErrorAt: observedAt,
        consecutiveAriFailures: 1,
        syncedDateRange: null,
        verifiedAvailabilityCount: 0,
        verifiedRateCount: 0,
        verifiedMinStayThroughCount: 0,
        availabilityMismatchCount: 0,
        rateMismatchCount: 0,
        lastAriSyncAction: input.action,
        lastAriSyncStatus: "sync_failed",
        lastAriSyncMessage: "Production ARI mutation is blocked by the Channex safety guard.",
        channelAttached: false,
        channelActive: false,
        accChannelsCount: null,
        activeChannelId: null,
        activeChannelTitle: null,
        hotelId: null,
      },
    };
  }

  const access = await loadHostProAccess(input.supabase, input.familyId);
  if (!access.allowed) {
    return {
      ok: false,
      status: "famlo_pro_inactive",
      message: "Famlo Pro is not active for this property.",
      dateRange: { from: "", to: "" },
      windowDays,
      eligibleRooms: 0,
      availabilityChanges: 0,
      restrictionChanges: 0,
      verifiedAvailabilityCount: 0,
      verifiedRateCount: 0,
      verifiedMinStayThroughCount: 0,
      warnings: [],
      availabilityVerificationOk: false,
      restrictionsVerificationOk: false,
      verificationFailed: true,
      chunkSummary: { availabilityChunkCount: 0, restrictionChunkCount: 0 },
      verificationSummary: { availabilityMismatchCount: 0, rateMismatchCount: 0, availabilityMismatches: [], rateMismatches: [] },
      rooms: [],
      pushedRanges: [],
      availabilityMessage: null,
      restrictionsMessage: null,
      availabilityWarnings: [],
      restrictionsWarnings: [],
      channelHealth: {
        channelAttached: false,
        channelActive: false,
        accChannelsCount: null,
        activeChannelId: null,
        activeChannelTitle: null,
        hotelId: null,
      },
      healthSnapshot: {
        lastAriSyncAt: observedAt,
        lastSuccessfulAriSyncAt: null,
        lastAriSyncError: "Famlo Pro is not active for this property.",
        lastAriSyncErrorAt: observedAt,
        consecutiveAriFailures: 1,
        syncedDateRange: null,
        verifiedAvailabilityCount: 0,
        verifiedRateCount: 0,
        verifiedMinStayThroughCount: 0,
        availabilityMismatchCount: 0,
        rateMismatchCount: 0,
        lastAriSyncAction: input.action,
        lastAriSyncStatus: "sync_failed",
        lastAriSyncMessage: "Famlo Pro is not active for this property.",
        channelAttached: false,
        channelActive: false,
        accChannelsCount: null,
        activeChannelId: null,
        activeChannelTitle: null,
        hotelId: null,
      },
    };
  }

  const [settings, propertyResult, roomMappingsResult, ratePlansResult] = await Promise.all([
    loadHostProSettings(input.supabase, input.familyId),
    input.supabase
      .from("channel_properties")
    .select("id,external_property_id,metadata,sync_status,last_synced_at")
      .eq("family_id", input.familyId)
      .eq("provider_code", "channex")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    input.supabase
      .from("channel_room_mappings")
      .select("stay_unit_id,external_room_type_id")
      .eq("family_id", input.familyId)
      .eq("provider_code", "channex"),
    input.supabase
      .from("channel_rate_plans")
      .select("stay_unit_id,external_rate_plan_id")
      .eq("family_id", input.familyId)
      .eq("provider_code", "channex"),
  ]);

  if (propertyResult.error) throw propertyResult.error;
  if (roomMappingsResult.error) throw roomMappingsResult.error;
  if (ratePlansResult.error) throw ratePlansResult.error;

  const propertyRow = propertyResult.data ?? null;
  const externalPropertyId = asString(propertyRow?.external_property_id);
  const dateRange = getDateRange(settings.timezone || "Asia/Kolkata", windowDays);

  const defaultChannelHealth: AriChannelHealth = {
    channelAttached: false,
    channelActive: false,
    accChannelsCount: null,
    activeChannelId: null,
    activeChannelTitle: null,
    hotelId: null,
  };

  if (!externalPropertyId) {
    const healthSnapshot = buildAriHealthMetadata({
      previous: propertyRow?.metadata ? asObject(propertyRow.metadata) : null,
      observedAt,
      resultStatus: "sync_failed",
      message: "Create provider property first.",
      dateRange,
      windowDays,
      verification: {
        verifiedAvailabilityCount: 0,
        verifiedRateCount: 0,
        verifiedMinStayThroughCount: 0,
        availabilityMismatches: [],
        rateMismatches: [],
      },
      channelHealth: defaultChannelHealth,
      action: input.action,
    });
    return {
      ok: false,
      status: "create_property_first",
      message: "Create provider property first.",
      dateRange,
      windowDays,
      eligibleRooms: 0,
      availabilityChanges: 0,
      restrictionChanges: 0,
      verifiedAvailabilityCount: 0,
      verifiedRateCount: 0,
      verifiedMinStayThroughCount: 0,
      warnings: [],
      availabilityVerificationOk: false,
      restrictionsVerificationOk: false,
      verificationFailed: true,
      chunkSummary: { availabilityChunkCount: 0, restrictionChunkCount: 0 },
      verificationSummary: { availabilityMismatchCount: 0, rateMismatchCount: 0, availabilityMismatches: [], rateMismatches: [] },
      rooms: [],
      pushedRanges: [],
      availabilityMessage: null,
      restrictionsMessage: null,
      availabilityWarnings: [],
      restrictionsWarnings: [],
      channelHealth: defaultChannelHealth,
      healthSnapshot,
    };
  }

  const [propertyHealthResult, channelResult] = await Promise.all([
    fetchChannexPropertyById(externalPropertyId),
    fetchChannexChannelsForProperty(externalPropertyId),
  ]);

  const activeChannel = channelResult.data.find((channel) => channel.isActive) ?? channelResult.data[0] ?? null;
  const channelHealth: AriChannelHealth = {
    channelAttached: (propertyHealthResult.data?.accChannelsCount ?? 0) > 0 || channelResult.data.length > 0,
    channelActive: channelResult.data.some((channel) => channel.isActive),
    accChannelsCount: propertyHealthResult.data?.accChannelsCount ?? null,
    activeChannelId: activeChannel?.id ?? null,
    activeChannelTitle: activeChannel?.title ?? null,
    hotelId: activeChannel?.hotelId ?? null,
  };

  if (input.requireActiveChannel && (!channelHealth.channelAttached || !channelHealth.channelActive)) {
    const healthSnapshot = buildAriHealthMetadata({
      previous: asObject(propertyRow?.metadata),
      observedAt,
      resultStatus: "channel_disconnected",
      message: "Channel is detached or inactive, so daily ARI sync was skipped safely.",
      dateRange,
      windowDays,
      verification: {
        verifiedAvailabilityCount: 0,
        verifiedRateCount: 0,
        verifiedMinStayThroughCount: 0,
        availabilityMismatches: [],
        rateMismatches: [],
      },
      channelHealth,
      action: input.action,
    });
    await input.supabase
      .from("channel_properties")
      .update({
        metadata: {
          ...asObject(propertyRow?.metadata),
          channexAriHealth: healthSnapshot,
        },
      } as never)
      .eq("id", propertyRow?.id);
    await logAriPush({
      supabase: input.supabase,
      familyId: input.familyId,
      action: input.action,
      status: "warning",
      message: "Skipped ARI sync because channel is detached or inactive.",
      payload: { environment: config.environment, property_id: externalPropertyId, channel_health: channelHealth, date_range: dateRange },
    });
    return {
      ok: false,
      status: "channel_disconnected",
      message: "Channel is detached or inactive, so daily ARI sync was skipped safely.",
      dateRange,
      windowDays,
      eligibleRooms: 0,
      availabilityChanges: 0,
      restrictionChanges: 0,
      verifiedAvailabilityCount: 0,
      verifiedRateCount: 0,
      verifiedMinStayThroughCount: 0,
      warnings: [],
      availabilityVerificationOk: false,
      restrictionsVerificationOk: false,
      verificationFailed: true,
      chunkSummary: { availabilityChunkCount: 0, restrictionChunkCount: 0 },
      verificationSummary: { availabilityMismatchCount: 0, rateMismatchCount: 0, availabilityMismatches: [], rateMismatches: [] },
      rooms: [],
      pushedRanges: [],
      availabilityMessage: null,
      restrictionsMessage: null,
      availabilityWarnings: [],
      restrictionsWarnings: [],
      channelHealth,
      healthSnapshot,
    };
  }

  let hostId = input.hostId ?? null;
  if (!hostId) {
    const { data: hostRow, error: hostLookupError } = await input.supabase
      .from("hosts")
      .select("id")
      .eq("legacy_family_id", input.familyId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (hostLookupError) throw hostLookupError;
    hostId = asString(hostRow?.id);
  }
  if (!hostId) {
    throw new Error("Unable to resolve host for ARI sync.");
  }

  const rooms = await loadStayUnitsForSelector(input.supabase, { hostId, legacyFamilyId: input.familyId });
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
  const currency = normalizeCurrency(asString(settings.currency) ?? PRO_DEFAULT_CURRENCY);
  const activeRooms = rooms.filter((room) => room.isActive);
  const roomSummaries: RoomSummary[] = [];
  const eligibleRooms: Array<{ roomId: string; roomName: string; externalRoomTypeId: string; externalRatePlanId: string; basePrice: number }> = [];

  for (const room of activeRooms) {
    const externalRoomTypeId = roomMappingsByRoomId.get(room.id) ?? null;
    const externalRatePlanId = ratePlansByRoomId.get(room.id) ?? null;
    const missingFields: string[] = [];
    addMissing(missingFields, externalPropertyId, "external_property_id");
    addMissing(missingFields, externalRoomTypeId, "external_room_type_id");
    addMissing(missingFields, externalRatePlanId, "external_rate_plan_id");
    addMissing(missingFields, room.priceFullday > 0 ? String(room.priceFullday) : null, "base_price");
    addMissing(missingFields, currency && currency.length === 3 ? currency : null, "currency");
    addMissing(missingFields, dateRange.from && dateRange.to ? `${dateRange.from}:${dateRange.to}` : null, "date_range");
    if (missingFields.length > 0) {
      roomSummaries.push({ stayUnitId: room.id, name: room.name, status: "missing_fields", missingFields });
      continue;
    }
    roomSummaries.push({ stayUnitId: room.id, name: room.name, status: "eligible", missingFields: [] });
    eligibleRooms.push({
      roomId: room.id,
      roomName: room.name,
      externalRoomTypeId: externalRoomTypeId ?? "",
      externalRatePlanId: externalRatePlanId ?? "",
      basePrice: room.priceFullday,
    });
  }

  if (eligibleRooms.length === 0) {
    const message = `No eligible active mapped rooms were ready for ${windowDays}-day sync.`;
    const verification: VerificationSummary = {
      verifiedAvailabilityCount: 0,
      verifiedRateCount: 0,
      verifiedMinStayThroughCount: 0,
      availabilityMismatches: [],
      rateMismatches: [],
    };
    const healthSnapshot = buildAriHealthMetadata({
      previous: asObject(propertyRow?.metadata),
      observedAt,
      resultStatus: "sync_failed",
      message,
      dateRange,
      windowDays,
      verification,
      channelHealth,
      action: input.action,
    });
    await input.supabase
      .from("channel_properties")
      .update({
        metadata: { ...asObject(propertyRow?.metadata), channexAriHealth: healthSnapshot },
      } as never)
      .eq("id", propertyRow?.id);
    await logAriPush({
      supabase: input.supabase,
      familyId: input.familyId,
      action: input.action,
      status: "failed",
      message,
      payload: { environment: config.environment, date_range: dateRange, window_days: windowDays, skipped_rooms: roomSummaries.filter((room) => room.status === "missing_fields") },
    });
    return {
      ok: false,
      status: "no_eligible_rooms",
      message,
      dateRange,
      windowDays,
      eligibleRooms: 0,
      availabilityChanges: 0,
      restrictionChanges: 0,
      verifiedAvailabilityCount: 0,
      verifiedRateCount: 0,
      verifiedMinStayThroughCount: 0,
      warnings: [],
      availabilityVerificationOk: false,
      restrictionsVerificationOk: false,
      verificationFailed: true,
      chunkSummary: { availabilityChunkCount: 0, restrictionChunkCount: 0 },
      verificationSummary: { availabilityMismatchCount: 0, rateMismatchCount: 0, availabilityMismatches: [], rateMismatches: [] },
      rooms: roomSummaries,
      pushedRanges: [],
      availabilityMessage: null,
      restrictionsMessage: null,
      availabilityWarnings: [],
      restrictionsWarnings: [],
      channelHealth,
      healthSnapshot,
    };
  }

  const dates = enumerateDateRange(dateRange.from, dateRange.to);
  const roomCalendars = await Promise.all(
    eligibleRooms.map(async (room) => ({
      room,
      events: await loadCanonicalCalendar(input.supabase, {
        ownerType: "stay_unit",
        ownerId: room.roomId,
        from: dateRange.from,
        to: dateRange.to,
      }),
    }))
  );

  const availabilityValues: ChannexAvailabilityChange[] = [];
  const restrictionValues: ChannexRestrictionChange[] = [];
  const pushedRangeSummaries: PushRangeSummary[] = [];

  for (const item of roomCalendars) {
    const blockedDates = new Set<string>();
    for (const event of item.events) {
      const blockingEndDate = resolveBlockingEndDate(event);
      if (!blockingEndDate) continue;
      for (const date of enumerateDateRange(event.startDate, blockingEndDate)) {
        if (date >= dateRange.from && date <= dateRange.to) blockedDates.add(date);
      }
    }

    const availabilityByDate: Record<string, number> = {};
    const rateByDate: Record<string, string> = {};
    const stopSellByDate: Record<string, boolean> = {};
    for (const date of dates) {
      const blocked = blockedDates.has(date);
      availabilityByDate[date] = blocked ? 0 : 1;
      rateByDate[date] = formatPriceForChannex(item.room.basePrice);
      stopSellByDate[date] = blocked;
    }

    const segments = buildSegments(dates, availabilityByDate, rateByDate, stopSellByDate);
    pushedRangeSummaries.push({
      roomName: item.room.roomName,
      roomTypeId: item.room.externalRoomTypeId,
      ratePlanId: item.room.externalRatePlanId,
      availabilityRanges: segments.map((segment) => ({ dateFrom: segment.dateFrom, dateTo: segment.dateTo, availability: segment.availability })),
      rateRanges: segments.map((segment) => ({ dateFrom: segment.dateFrom, dateTo: segment.dateTo, rate: segment.rate, stopSell: segment.stopSell, minStayThrough: 1 })),
    });
    for (const segment of segments) {
      availabilityValues.push({
        propertyId: externalPropertyId,
        roomTypeId: item.room.externalRoomTypeId,
        dateFrom: segment.dateFrom,
        dateTo: segment.dateTo,
        availability: segment.availability,
      });
      restrictionValues.push({
        propertyId: externalPropertyId,
        ratePlanId: item.room.externalRatePlanId,
        dateFrom: segment.dateFrom,
        dateTo: segment.dateTo,
        rate: segment.rate,
        stopSell: segment.stopSell,
        minStayThrough: 1,
      });
    }
  }

  const [availabilityChunkResults, restrictionChunkResults] = await Promise.all([
    Promise.all(chunkArray(availabilityValues, MAX_SEGMENTS_PER_REQUEST).map((chunk) => pushChannexAvailability(chunk))),
    Promise.all(chunkArray(restrictionValues, MAX_SEGMENTS_PER_REQUEST).map((chunk) => pushChannexRestrictions(chunk))),
  ]);

  const availabilityResult = aggregatePushResults(availabilityChunkResults);
  const restrictionsResult = aggregatePushResults(restrictionChunkResults);
  const [availabilitySnapshot, restrictionsSnapshot] = await Promise.all([
    fetchChannexAvailabilitySnapshot({ propertyId: externalPropertyId, dateFrom: dateRange.from, dateTo: dateRange.to }),
    fetchChannexRestrictionsSnapshot({ propertyId: externalPropertyId, dateFrom: dateRange.from, dateTo: dateRange.to }),
  ]);
  const availabilityWarnings = availabilityResult.warnings;
  const restrictionsWarnings = restrictionsResult.warnings;
  const verification = availabilitySnapshot.ok && restrictionsSnapshot.ok
    ? verifySnapshots({
        availabilitySnapshot: availabilitySnapshot.data,
        restrictionsSnapshot: restrictionsSnapshot.data,
        availabilityValues,
        restrictionValues,
      })
    : {
        verifiedAvailabilityCount: 0,
        verifiedRateCount: 0,
        verifiedMinStayThroughCount: 0,
        availabilityMismatches: [],
        rateMismatches: [],
      };

  const verificationOk =
    availabilitySnapshot.ok &&
    restrictionsSnapshot.ok &&
    verification.availabilityMismatches.length === 0 &&
    verification.rateMismatches.length === 0;
  const ok = availabilityResult.ok && restrictionsResult.ok && availabilityWarnings.length === 0 && restrictionsWarnings.length === 0 && verificationOk;
  const summaryMessage = ok
    ? `${windowDays}-day ARI sync pushed and verified for ${eligibleRooms.length} rooms from ${dateRange.from} to ${dateRange.to}.`
    : verificationOk
      ? `${windowDays}-day ARI sync was accepted by Channex but returned warnings. Availability: ${availabilityResult.message} Restrictions: ${restrictionsResult.message}`
      : `Pushed but not verified in Channex. Availability: ${availabilityResult.message} Restrictions: ${restrictionsResult.message}`;
  const resultStatus: ChannexAriHealthSnapshot["lastAriSyncStatus"] = ok
    ? "synced"
    : !channelHealth.channelAttached || !channelHealth.channelActive
      ? "channel_disconnected"
      : "sync_failed";
  const healthSnapshot = buildAriHealthMetadata({
    previous: asObject(propertyRow?.metadata),
    observedAt,
    resultStatus,
    message: summaryMessage,
    dateRange,
    windowDays,
    verification,
    channelHealth,
    action: input.action,
  });

  await input.supabase
    .from("channel_properties")
    .update({
      metadata: { ...asObject(propertyRow?.metadata), channexAriHealth: healthSnapshot },
      last_synced_at: ok ? observedAt : propertyRow?.last_synced_at ?? null,
    } as never)
    .eq("id", propertyRow?.id);

  await logAriPush({
    supabase: input.supabase,
    familyId: input.familyId,
    action: input.action,
    status: ok ? "success" : verificationOk ? "warning" : "failed",
    message: summaryMessage,
    payload: {
      environment: config.environment,
      route: input.route,
      date_range: dateRange,
      window_days: windowDays,
      property_id: externalPropertyId,
      room_count: eligibleRooms.length,
      rate_count: eligibleRooms.length,
      channel_health: channelHealth,
      availability_response: {
        http_status: availabilityResult.httpStatus,
        message: availabilityResult.message,
        meta: availabilityResult.meta,
        warnings: availabilityWarnings,
        chunk_count: availabilityChunkResults.length,
      },
      restrictions_response: {
        http_status: restrictionsResult.httpStatus,
        message: restrictionsResult.message,
        meta: restrictionsResult.meta,
        warnings: restrictionsWarnings,
        chunk_count: restrictionChunkResults.length,
      },
      verification_summary: {
        availability_http_status: availabilitySnapshot.httpStatus,
        restrictions_http_status: restrictionsSnapshot.httpStatus,
        verified_availability_count: verification.verifiedAvailabilityCount,
        verified_rate_count: verification.verifiedRateCount,
        verified_min_stay_through_count: verification.verifiedMinStayThroughCount,
        availability_mismatch_count: verification.availabilityMismatches.length,
        rate_mismatch_count: verification.rateMismatches.length,
      },
      pushed_range_summary: pushedRangeSummaries.map((summary) => ({
        room_name: summary.roomName,
        room_type_id: summary.roomTypeId,
        rate_plan_id: summary.ratePlanId,
        availability_range_count: summary.availabilityRanges.length,
        rate_range_count: summary.rateRanges.length,
      })),
      skipped_rooms: roomSummaries.filter((room) => room.status === "missing_fields"),
    },
  });

  return {
    ok,
    status: ok ? "completed" : verificationOk ? "warning" : "verification_failed",
    message: summaryMessage,
    dateRange,
    windowDays,
    eligibleRooms: eligibleRooms.length,
    availabilityChanges: availabilityValues.length,
    restrictionChanges: restrictionValues.length,
    verifiedAvailabilityCount: verification.verifiedAvailabilityCount,
    verifiedRateCount: verification.verifiedRateCount,
    verifiedMinStayThroughCount: verification.verifiedMinStayThroughCount,
    warnings: [...availabilityWarnings, ...restrictionsWarnings],
    availabilityVerificationOk: availabilitySnapshot.ok,
    restrictionsVerificationOk: restrictionsSnapshot.ok,
    verificationFailed: !verificationOk,
    chunkSummary: {
      availabilityChunkCount: availabilityChunkResults.length,
      restrictionChunkCount: restrictionChunkResults.length,
    },
    verificationSummary: {
      availabilityMismatchCount: verification.availabilityMismatches.length,
      rateMismatchCount: verification.rateMismatches.length,
      availabilityMismatches: verification.availabilityMismatches.slice(0, 10),
      rateMismatches: verification.rateMismatches.slice(0, 10),
    },
    rooms: roomSummaries,
    pushedRanges: pushedRangeSummaries,
    availabilityMessage: availabilityResult.message,
    restrictionsMessage: restrictionsResult.message,
    availabilityWarnings,
    restrictionsWarnings,
    channelHealth,
    healthSnapshot,
  };
}
