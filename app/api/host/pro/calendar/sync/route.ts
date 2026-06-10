import { NextResponse } from "next/server";

import { loadHostProCalendarSyncSnapshot, pullChannexCalendarForFamlo } from "@/lib/host-pro-calendar-sync";
import { resolveAuthorizedHostResource } from "@/lib/host-access";
import { createAdminSupabaseClient } from "@/lib/supabase";

const BACKGROUND_SYNC_RECENCY_MS = 90_000;
const BACKGROUND_SYNC_IN_FLIGHT_MS = 120_000;
const inFlightCalendarSyncs = new Map<string, number>();

type ProjectedCalendarCell = {
  roomId: string;
  date: string;
  availableUnits: number | null;
  effectiveRate: number | null;
  stopSell: boolean;
  updatedAt: string | null;
};

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isRecentIso(timestamp: string | null, windowMs: number): boolean {
  if (!timestamp) return false;
  const parsed = Date.parse(timestamp);
  return Number.isFinite(parsed) && Date.now() - parsed < windowMs;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

async function loadProjectedCalendarCells(input: {
  supabase: ReturnType<typeof createAdminSupabaseClient>;
  familyId: string;
  dateFrom: string;
  dateTo: string;
  roomIds: string[];
}): Promise<ProjectedCalendarCell[]> {
  let query = input.supabase
    .from("inventory_day_projection")
    .select("stay_unit_id,date,available_units,effective_rate,stop_sell,last_projected_at,updated_at")
    .eq("family_id", input.familyId)
    .gte("date", input.dateFrom)
    .lte("date", input.dateTo);

  if (input.roomIds.length > 0) {
    query = query.in("stay_unit_id", input.roomIds);
  }

  const { data, error } = await query;
  if (error) throw error;

  return ((data ?? []) as Array<Record<string, unknown>>)
    .map((row) => {
      const roomId = asString(row.stay_unit_id);
      const date = asString(row.date);
      if (!roomId || !date) return null;
      return {
        roomId,
        date,
        availableUnits: asNumber(row.available_units),
        effectiveRate: asNumber(row.effective_rate),
        stopSell: row.stop_sell === true,
        updatedAt: asString(row.last_projected_at) ?? asString(row.updated_at),
      };
    })
    .filter((row): row is ProjectedCalendarCell => Boolean(row));
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const startedAt = Date.now();
    const body = (await request.json()) as {
      familyId?: unknown;
      dateFrom?: unknown;
      dateTo?: unknown;
      roomIds?: unknown;
      source?: unknown;
      mode?: unknown;
    };
    const familyId = asString(body.familyId);
    const dateFrom = asString(body.dateFrom);
    const dateTo = asString(body.dateTo);
    const roomIds = [...new Set(asStringArray(body.roomIds))];
    const source =
      body.source === "poll"
        ? "poll"
        : body.source === "sync_now"
          ? "sync_now"
          : body.source === "background_open"
            ? "background_open"
            : "calendar_open";
    const mode = body.mode === "status_only" ? "status_only" : "sync";

    if (!familyId || !dateFrom || !dateTo || !isIsoDate(dateFrom) || !isIsoDate(dateTo) || dateTo < dateFrom) {
      return NextResponse.json({ error: "Valid familyId, dateFrom, and dateTo are required." }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();
    const hostAccess = await resolveAuthorizedHostResource(supabase, request, { familyId });
    if (!hostAccess?.familyId || hostAccess.familyId !== familyId) {
      return NextResponse.json({ error: "You do not have access to this property calendar." }, { status: 403 });
    }

    if (roomIds.length > 0) {
      const { data: roomRows, error: roomError } = await supabase
        .from("stay_units_v2")
        .select("id")
        .eq("legacy_family_id", familyId)
        .in("id", roomIds);
      if (roomError) throw roomError;
      const resolvedRoomIds = new Set((roomRows ?? []).map((row) => asString(row.id)).filter(Boolean));
      if (resolvedRoomIds.size !== roomIds.length) {
        return NextResponse.json({ error: "One or more rooms do not belong to this property." }, { status: 403 });
      }
    }

    const syncKey = `${familyId}:${dateFrom}:${dateTo}:${roomIds.length > 0 ? [...roomIds].sort().join(",") : "all"}`;
    const observedAt = new Date().toISOString();
    const snapshot = await loadHostProCalendarSyncSnapshot({
      supabase,
      familyId,
      stayUnitIds: roomIds.length > 0 ? roomIds : null,
      observedAt,
    });
    const backgroundSource = source === "background_open" || source === "poll";
    const inFlightStartedAt = inFlightCalendarSyncs.get(syncKey) ?? null;
    const shouldReturnExistingInFlight =
      mode !== "status_only" &&
      backgroundSource &&
      inFlightStartedAt != null &&
      Date.now() - inFlightStartedAt < BACKGROUND_SYNC_IN_FLIGHT_MS;
    const shouldSkipRecentBackgroundPull =
      mode !== "status_only" &&
      backgroundSource &&
      isRecentIso(snapshot.lastSyncedAt, BACKGROUND_SYNC_RECENCY_MS);

    const result =
      mode === "status_only" || shouldReturnExistingInFlight || shouldSkipRecentBackgroundPull
        ? {
            metadata: shouldReturnExistingInFlight
              ? {
                  ...snapshot,
                  syncStatus: "syncing" as const,
                  statusTitle: "Syncing",
                  statusDetail: "Showing saved calendar. Channex refresh is already running.",
                  stale: snapshot.stale,
                }
              : snapshot,
            availabilityRows: 0,
            restrictionRows: 0,
            appliedRows: 0,
          }
        : await (async () => {
            inFlightCalendarSyncs.set(syncKey, Date.now());
            try {
              return await pullChannexCalendarForFamlo({
                supabase,
                familyId,
                dateFrom,
                dateTo,
                stayUnitIds: roomIds.length > 0 ? roomIds : null,
                source,
              });
            } finally {
              inFlightCalendarSyncs.delete(syncKey);
            }
          })();
    const projectedCells = await loadProjectedCalendarCells({
      supabase,
      familyId,
      dateFrom,
      dateTo,
      roomIds,
    });

    const debug =
      process.env.NODE_ENV !== "production"
        ? {
            localProjectionDurationMs: null,
            channexRefreshDurationMs: Date.now() - startedAt,
            responseSizeBytes: Buffer.byteLength(
              JSON.stringify({
                availabilityRows: result.availabilityRows,
                restrictionRows: result.restrictionRows,
                appliedRows: result.appliedRows,
                metadata: result.metadata,
                projectedCells,
              }),
              "utf8"
            ),
            roomCount: roomIds.length,
            dateCount:
              Math.max(1, Math.round((Date.parse(`${dateTo}T00:00:00.000Z`) - Date.parse(`${dateFrom}T00:00:00.000Z`)) / 86400000) + 1),
          }
        : undefined;

    return NextResponse.json({
      ok: result.metadata.syncStatus === "synced" || result.metadata.syncStatus === "partial",
      ...result,
      projectedCells,
      ...(debug ? { debug } : {}),
    });
  } catch (error) {
    console.error("[host.pro.calendar.sync] error", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to sync the Channex calendar." },
      { status: 500 }
    );
  }
}
