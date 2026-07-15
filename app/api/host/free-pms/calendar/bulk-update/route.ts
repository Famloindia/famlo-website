import { NextResponse } from "next/server";

import { loadFreePmsRooms, writeFreePmsBulkUpdate, type FreePmsCalendarRestrictionInput } from "@/lib/free-pms-calendar";
import { resolveAuthorizedHostResource } from "@/lib/host-access";
import { createAdminSupabaseClient } from "@/lib/supabase";

type JsonRecord = Record<string, unknown>;

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function asBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  return null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
}

function asObject(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function normalizeRestrictions(input: unknown): FreePmsCalendarRestrictionInput {
  const restrictions = asObject(input);
  const output: FreePmsCalendarRestrictionInput = {};
  const minStay = asNumber(restrictions.minStay ?? restrictions.min_stay ?? restrictions.min_stay_through);
  const minStayArrival = asNumber(restrictions.minStayArrival ?? restrictions.min_stay_arrival);
  const maxStay = asNumber(restrictions.maxStay ?? restrictions.max_stay);
  const cta = asBoolean(restrictions.cta ?? restrictions.closedToArrival ?? restrictions.closed_to_arrival);
  const ctd = asBoolean(restrictions.ctd ?? restrictions.closedToDeparture ?? restrictions.closed_to_departure);
  const stopSell = asBoolean(restrictions.stopSell ?? restrictions.stop_sell);
  if (minStay != null) output.minStay = minStay;
  if (minStayArrival != null) output.minStayArrival = minStayArrival;
  if (maxStay != null) output.maxStay = maxStay;
  if (cta != null) output.cta = cta;
  if (ctd != null) output.ctd = ctd;
  if (stopSell != null) output.stopSell = stopSell;
  return output;
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = (await request.json()) as {
      familyId?: unknown;
      roomIds?: unknown;
      roomScope?: unknown;
      selectedRoomId?: unknown;
      applyToAllRooms?: unknown;
      dateFrom?: unknown;
      dateTo?: unknown;
      weekdays?: unknown;
      rateAction?: unknown;
      rateAmount?: unknown;
      availabilityAction?: unknown;
      restrictions?: unknown;
    };

    const familyId = asString(body.familyId);
    const dateFrom = asString(body.dateFrom);
    const dateTo = asString(body.dateTo) || dateFrom;
    const requestedRoomIds = [...new Set(asStringArray(body.roomIds))];
    const selectedRoomId = asString(body.selectedRoomId);
    const useAllRooms = body.roomScope === "all" || body.applyToAllRooms === true;
    const rateAction = body.rateAction === "save" ? "save" : body.rateAction === "reset" ? "reset" : null;
    const rateAmount = asNumber(body.rateAmount);
    const availabilityAction =
      body.availabilityAction === "block"
        ? "block"
        : body.availabilityAction === "unblock"
          ? "unblock"
          : null;
    const restrictions = normalizeRestrictions(body.restrictions);
    const weekdays = asStringArray(body.weekdays);

    if (!familyId || !dateFrom || !dateTo || !isIsoDate(dateFrom) || !isIsoDate(dateTo) || dateTo < dateFrom) {
      return NextResponse.json({ error: "Valid familyId, dateFrom, and dateTo are required." }, { status: 400 });
    }
    if (rateAction === "save" && (rateAmount == null || rateAmount <= 0)) {
      return NextResponse.json({ error: "Enter a valid positive daily rate." }, { status: 400 });
    }
    if (!rateAction && !availabilityAction && Object.keys(restrictions).length === 0) {
      return NextResponse.json({ error: "Choose at least one Free calendar change." }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();
    const hostAccess = await resolveAuthorizedHostResource(supabase, request, { familyId });
    if (!hostAccess?.familyId || hostAccess.familyId !== familyId) {
      return NextResponse.json({ error: "You do not have access to this Free calendar." }, { status: 403 });
    }

    const roomIds = useAllRooms
      ? (await loadFreePmsRooms(supabase, { familyId })).map((room) => room.id)
      : requestedRoomIds.length > 0
        ? requestedRoomIds
        : selectedRoomId
          ? [selectedRoomId]
          : [];

    if (roomIds.length === 0) {
      return NextResponse.json({ error: "Select at least one room." }, { status: 400 });
    }

    const result = await writeFreePmsBulkUpdate(supabase, {
      familyId,
      roomIds,
      dateFrom,
      dateTo,
      weekdays: weekdays.length > 0 ? weekdays : null,
      rateAction,
      rateAmount,
      availabilityAction,
      restrictions,
      actorUserId: hostAccess.hostUserId ?? null,
      actorRole: hostAccess.isAdmin ? "admin" : "host",
    });

    return NextResponse.json({
      ok: true,
      affectedRoomCount: result.affectedRoomCount,
      affectedDateCount: result.affectedDateCount,
      queuedJobIds: [],
      stagingWorkerTriggered: false,
      applied: {
        rateAction,
        availabilityAction,
        restrictions,
      },
    });
  } catch (error) {
    console.error("[host.free-pms.calendar.bulk-update] error", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to apply Free calendar bulk update." },
      { status: 500 }
    );
  }
}
