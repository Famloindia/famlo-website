import { NextResponse } from "next/server";

import { enqueueChannexAriSyncJobs } from "@/lib/channex-ari-jobs";
import { loadHostProCalendarSyncSnapshot } from "@/lib/host-pro-calendar-sync";
import { resolveAuthorizedHostResource } from "@/lib/host-access";
import { createAdminSupabaseClient } from "@/lib/supabase";

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

    const observedAt = new Date().toISOString();
    const snapshot = await loadHostProCalendarSyncSnapshot({
      supabase,
      familyId,
      stayUnitIds: roomIds.length > 0 ? roomIds : null,
      observedAt,
    });
    const shouldQueue = mode !== "status_only" && source === "sync_now";
    const queuedJobIds = shouldQueue
      ? await enqueueChannexAriSyncJobs(supabase, {
          familyId,
          dateFrom,
          dateTo,
          stayUnitIds: roomIds.length > 0 ? roomIds : null,
          jobTypes: ["full_sync"],
          certificationScenario: "calendar_visible_range_sync",
          sourceUiAction: "Famlo Pro calendar visible range sync",
          sourceRoute: "/api/host/pro/calendar/sync",
          actorUserId: hostAccess.hostUserId ?? null,
          actorRole: hostAccess.isAdmin ? "admin" : "host",
        })
      : [];
    const metadata = shouldQueue
      ? {
          ...snapshot,
          syncStatus: queuedJobIds.length > 0 ? ("pending" as const) : snapshot.syncStatus,
          statusTitle: queuedJobIds.length > 0 ? "Sync queued" : snapshot.statusTitle,
          statusDetail:
            queuedJobIds.length > 0
              ? "Showing saved calendar. Channex refresh is queued and will update status after it succeeds."
              : snapshot.statusDetail,
        }
      : snapshot;
    const result = {
      metadata,
      availabilityRows: 0,
      restrictionRows: 0,
      appliedRows: 0,
      queuedJobIds,
    };
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
                queuedJobIds,
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
