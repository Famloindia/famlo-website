import { NextResponse } from "next/server";

import { toCalendarEventUid, upsertCalendarEvent } from "@/lib/calendar";
import { enqueueChannexAriSyncJobs, triggerQueuedChannexSyncWorker } from "@/lib/channex-ari-jobs";
import { resolveAuthorizedHostResource } from "@/lib/host-access";
import { appendInventoryEvent, projectInventoryRange } from "@/lib/inventory";
import { createAdminSupabaseClient } from "@/lib/supabase";

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

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = (await request.json()) as {
      familyId?: unknown;
      roomId?: unknown;
      date?: unknown;
      amount?: unknown;
      action?: unknown;
    };

    const familyId = asString(body.familyId);
    const roomId = asString(body.roomId);
    const date = asString(body.date);
    const action = body.action === "reset" ? "reset" : "save";
    const amount = asNumber(body.amount);

    if (!familyId || !roomId || !date || !isIsoDate(date)) {
      return NextResponse.json({ error: "Valid familyId, roomId, and date are required." }, { status: 400 });
    }

    if (action === "save" && (amount == null || amount <= 0)) {
      return NextResponse.json({ error: "Enter a valid positive daily rate." }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();
    const hostAccess = await resolveAuthorizedHostResource(supabase, request, { familyId });
    if (!hostAccess?.familyId || hostAccess.familyId !== familyId) {
      return NextResponse.json({ error: "You do not have access to this room calendar." }, { status: 403 });
    }

    const { data: stayUnitRow, error: stayUnitError } = await supabase
      .from("stay_units_v2")
      .select("id,legacy_family_id")
      .eq("id", roomId)
      .maybeSingle();
    if (stayUnitError) throw stayUnitError;
    if (!stayUnitRow?.id || stayUnitRow.legacy_family_id !== familyId) {
      return NextResponse.json({ error: "You do not have access to this room calendar." }, { status: 403 });
    }

    const { data: settings, error: settingsError } = await supabase
      .from("host_pro_settings")
      .select("currency")
      .eq("family_id", hostAccess.familyId)
      .maybeSingle();
    if (settingsError) throw settingsError;
    const currency = typeof settings?.currency === "string" && settings.currency.trim().length > 0
      ? settings.currency.trim()
      : "INR";

    await appendInventoryEvent(supabase, {
      familyId: hostAccess.familyId,
      stayUnitId: roomId,
      eventType: action === "save" ? "manual_rate_set" : "manual_rate_removed",
      eventSource: "famlo_pro_calendar",
      sourceReference: date,
      effectiveDateStart: date,
      effectiveDateEnd: date,
      payload:
        action === "save"
          ? {
              amount,
              currency,
              updated_via: "famlo_pro_calendar",
            }
          : {
              reset: true,
              updated_via: "famlo_pro_calendar",
            },
      actorUserId: hostAccess.hostUserId ?? null,
      actorRole: hostAccess.isAdmin ? "admin" : "host",
    });

    await projectInventoryRange(supabase, {
      familyId: hostAccess.familyId,
      stayUnitId: roomId,
      from: date,
      to: date,
    });

    const eventUid = toCalendarEventUid("manual_rate", roomId, date, null);
    await upsertCalendarEvent(supabase, {
      eventUid,
      ownerType: "stay_unit",
      ownerId: roomId,
      title: "Famlo manual daily rate",
      startDate: date,
      endDate: date,
      slotKey: null,
      status: action === "save" ? "confirmed" : "released",
      sourceType: "manual_rate",
      sourceReference: date,
      isBlocking: false,
      payload:
        action === "save"
          ? {
              family_id: hostAccess.familyId,
              room_id: roomId,
              amount,
              currency,
              updated_via: "famlo_pro_calendar",
            }
          : {
              family_id: hostAccess.familyId,
              room_id: roomId,
              reset: true,
              updated_via: "famlo_pro_calendar",
            },
      connectionId: null,
    });

    const queuedJobIds = await enqueueChannexAriSyncJobs(supabase, {
      familyId: hostAccess.familyId,
      dateFrom: date,
      dateTo: date,
      jobTypes: ["rate_update"],
      certificationScenario: action === "save" ? "price_save" : "price_reset",
      sourceUiAction: action === "save" ? "Famlo PMS rate save" : "Famlo PMS rate reset",
      sourceRoute: "/api/host/pro/calendar/manual-rate",
      stayUnitIds: [roomId],
      actorUserId: hostAccess.hostUserId ?? null,
      actorRole: hostAccess.isAdmin ? "admin" : "host",
    });
    const stagingWorkerTriggered =
      queuedJobIds.length > 0
        ? await triggerQueuedChannexSyncWorker({
            requestUrl: request.url,
            workerId: "pms-calendar-manual-rate",
            limit: queuedJobIds.length,
          })
        : false;

    return NextResponse.json({
      ok: true,
      action,
      date,
      roomId,
      amount: action === "save" ? amount : null,
      queuedJobIds,
      stagingWorkerTriggered,
    });
  } catch (error) {
    console.error("[host.pro.calendar.manual-rate] error", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update daily room rate." },
      { status: 500 }
    );
  }
}
