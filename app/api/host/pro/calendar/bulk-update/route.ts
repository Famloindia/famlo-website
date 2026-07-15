import { NextResponse } from "next/server";

import {
  enqueueChannexAriSyncJobs,
  triggerQueuedChannexSyncWorker,
  type ChannexAriJobType,
} from "@/lib/channex-ari-jobs";
import { resolveAuthorizedHostResource } from "@/lib/host-access";
import { resolveBulkRoomScopePolicy } from "@/lib/host/pro/calendar/bulk-room-scope-policy";
import { appendInventoryEvent, projectInventoryRange } from "@/lib/inventory";
import { createAdminSupabaseClient } from "@/lib/supabase";

type JsonRecord = Record<string, unknown>;

type BulkCalendarUpdateBody = {
  familyId?: unknown;
  roomIds?: unknown;
  roomScope?: unknown;
  selectedRoomId?: unknown;
  applyToAllRooms?: unknown;
  dateFrom?: unknown;
  dateTo?: unknown;
  rateAction?: unknown;
  rateAmount?: unknown;
  availabilityAction?: unknown;
  restrictions?: unknown;
};

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
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

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function asObject(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = (await request.json()) as BulkCalendarUpdateBody;
    const familyId = asString(body.familyId);
    const roomIds = [...new Set(asStringArray(body.roomIds))];
    const roomScope = body.roomScope === "all" ? "all" : "single";
    const selectedRoomId = asString(body.selectedRoomId);
    const applyToAllRooms = body.applyToAllRooms === true;
    const dateFrom = asString(body.dateFrom);
    const dateTo = asString(body.dateTo) ?? dateFrom;
    const rateAction = body.rateAction === "reset" ? "reset" : body.rateAction === "save" ? "save" : null;
    const rateAmount = asNumber(body.rateAmount);
    const availabilityAction =
      body.availabilityAction === "block"
        ? "block"
        : body.availabilityAction === "unblock"
          ? "unblock"
          : null;
    const restrictions = asObject(body.restrictions);

    if (!familyId || !dateFrom || !dateTo || !isIsoDate(dateFrom) || !isIsoDate(dateTo) || dateTo < dateFrom) {
      return NextResponse.json({ error: "Valid familyId, dateFrom, and dateTo are required." }, { status: 400 });
    }
    const roomScopePolicy = resolveBulkRoomScopePolicy({
      roomIds,
      roomScope,
      selectedRoomId,
      applyToAllRooms,
    });
    if (!roomScopePolicy.ok) {
      return NextResponse.json({ error: roomScopePolicy.error }, { status: 400 });
    }
    const scopedRoomIds = roomScopePolicy.roomIds;
    if (!rateAction && !availabilityAction && Object.keys(restrictions).length === 0) {
      return NextResponse.json({ error: "Choose at least one bulk calendar change." }, { status: 400 });
    }
    if (rateAction === "save" && (rateAmount == null || rateAmount <= 0)) {
      return NextResponse.json({ error: "Enter a valid positive daily rate." }, { status: 400 });
    }

    const normalizedRestrictions: JsonRecord = {};
    const minStay = asNumber(restrictions.minStay);
    const minStayArrival = asNumber(restrictions.minStayArrival);
    const maxStay = asNumber(restrictions.maxStay);
    const cta = asBoolean(restrictions.cta);
    const ctd = asBoolean(restrictions.ctd);
    const stopSell = asBoolean(restrictions.stopSell);
    if (minStay != null) normalizedRestrictions.min_stay = Math.max(1, Math.trunc(minStay));
    if (minStayArrival != null) normalizedRestrictions.min_stay_arrival = Math.max(1, Math.trunc(minStayArrival));
    if (maxStay != null) normalizedRestrictions.max_stay = Math.max(1, Math.trunc(maxStay));
    if (cta != null) normalizedRestrictions.cta = cta;
    if (ctd != null) normalizedRestrictions.ctd = ctd;
    if (stopSell != null) normalizedRestrictions.stop_sell = stopSell;

    const supabase = createAdminSupabaseClient();
    const hostAccess = await resolveAuthorizedHostResource(supabase, request, { familyId });
    if (!hostAccess?.familyId || hostAccess.familyId !== familyId || !hostAccess.hostId) {
      return NextResponse.json({ error: "You do not have access to this property calendar." }, { status: 403 });
    }

    const { data: settings, error: settingsError } = await supabase
      .from("host_pro_settings")
      .select("currency")
      .eq("family_id", familyId)
      .maybeSingle();
    if (settingsError) throw settingsError;
    const currency = typeof settings?.currency === "string" && settings.currency.trim().length > 0
      ? settings.currency.trim()
      : "INR";

    const { data: roomRows, error: roomError } = await supabase
      .from("stay_units_v2")
      .select("id")
      .eq("legacy_family_id", familyId)
      .in("id", scopedRoomIds);
    if (roomError) throw roomError;
    const resolvedRoomIds = ((roomRows ?? []) as Array<{ id?: string | null }>)
      .map((row) => asString(row.id))
      .filter((value): value is string => Boolean(value));
    if (resolvedRoomIds.length !== scopedRoomIds.length) {
      return NextResponse.json({ error: "One or more selected rooms do not belong to this property." }, { status: 403 });
    }

    for (const roomId of resolvedRoomIds) {
      if (rateAction) {
        await appendInventoryEvent(supabase, {
          familyId,
          stayUnitId: roomId,
          eventType: rateAction === "save" ? "manual_rate_set" : "manual_rate_removed",
          eventSource: "famlo_pro_calendar_bulk",
          sourceReference: `${dateFrom}:${dateTo}`,
          effectiveDateStart: dateFrom,
          effectiveDateEnd: dateTo,
          payload:
            rateAction === "save"
              ? { amount: rateAmount, currency, updated_via: "famlo_pro_calendar_bulk" }
              : { reset: true, updated_via: "famlo_pro_calendar_bulk" },
          actorUserId: hostAccess.hostUserId ?? null,
          actorRole: hostAccess.isAdmin ? "admin" : "host",
        });
      }

      if (availabilityAction) {
        await appendInventoryEvent(supabase, {
          familyId,
          stayUnitId: roomId,
          eventType: availabilityAction === "block" ? "manual_block_set" : "manual_block_removed",
          eventSource: "famlo_pro_calendar_bulk",
          sourceReference: `${dateFrom}:${dateTo}`,
          effectiveDateStart: dateFrom,
          effectiveDateEnd: dateTo,
          payload: { updated_via: "famlo_pro_calendar_bulk" },
          actorUserId: hostAccess.hostUserId ?? null,
          actorRole: hostAccess.isAdmin ? "admin" : "host",
        });
      }

      if (Object.keys(normalizedRestrictions).length > 0) {
        await appendInventoryEvent(supabase, {
          familyId,
          stayUnitId: roomId,
          eventType: "restriction_updated",
          eventSource: "famlo_pro_calendar_bulk",
          sourceReference: `${dateFrom}:${dateTo}`,
          effectiveDateStart: dateFrom,
          effectiveDateEnd: dateTo,
          payload: {
            ...normalizedRestrictions,
            updated_via: "famlo_pro_calendar_bulk",
          },
          actorUserId: hostAccess.hostUserId ?? null,
          actorRole: hostAccess.isAdmin ? "admin" : "host",
        });
      }

      await projectInventoryRange(supabase, {
        familyId,
        stayUnitId: roomId,
        from: dateFrom,
        to: dateTo,
      });
    }

    const jobTypes: ChannexAriJobType[] = [];
    if (availabilityAction) jobTypes.push("availability_update");
    if (rateAction) jobTypes.push("rate_update");
    if (Object.keys(normalizedRestrictions).length > 0) jobTypes.push("restriction_update");

    const queuedJobIds = await enqueueChannexAriSyncJobs(supabase, {
      familyId,
      dateFrom,
      dateTo,
      stayUnitIds: resolvedRoomIds,
      jobTypes,
      certificationScenario: "bulk_calendar_update",
      sourceUiAction: "Famlo PMS bulk calendar update",
      sourceRoute: "/api/host/pro/calendar/bulk-update",
      actorUserId: hostAccess.hostUserId ?? null,
      actorRole: hostAccess.isAdmin ? "admin" : "host",
    });
    const stagingWorkerTriggered =
      queuedJobIds.length > 0
        ? await triggerQueuedChannexSyncWorker({
            requestUrl: request.url,
            workerId: "pms-calendar-bulk-update",
            limit: queuedJobIds.length,
          })
        : false;

    return NextResponse.json({
      ok: true,
      affectedRoomCount: resolvedRoomIds.length,
      queuedJobIds,
      stagingWorkerTriggered,
      applied: {
        rateAction,
        availabilityAction,
        restrictions: normalizedRestrictions,
      },
    });
  } catch (error) {
    console.error("[host.pro.calendar.bulk-update] error", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to apply bulk calendar update." },
      { status: 500 }
    );
  }
}
