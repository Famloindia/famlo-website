import { NextResponse } from "next/server";

import { toCalendarEventUid, upsertCalendarEvent } from "@/lib/calendar";
import { enqueueChannexAriSyncJobs, triggerQueuedChannexSyncWorker } from "@/lib/channex-ari-jobs";
import { resolveAuthorizedHostResource } from "@/lib/host-access";
import { appendInventoryEvent, projectInventoryRange } from "@/lib/inventory";
import { createAdminSupabaseClient } from "@/lib/supabase";

type JsonRecord = Record<string, unknown>;

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

function nextBlockedDates(current: string[], date: string, action: "block" | "unblock"): string[] {
  if (action === "block") {
    const stripped = current.filter((token) => token !== date && !token.startsWith(`${date}::`));
    return [...stripped, date];
  }

  return current.filter((token) => token !== date && !token.startsWith(`${date}::`));
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = (await request.json()) as {
      familyId?: unknown;
      roomId?: unknown;
      date?: unknown;
      action?: unknown;
    };

    const familyId = asString(body.familyId);
    const roomId = asString(body.roomId);
    const date = asString(body.date);
    const action = body.action === "unblock" ? "unblock" : body.action === "block" ? "block" : null;

    if (!familyId || !roomId || !date || !action || !isIsoDate(date)) {
      return NextResponse.json({ error: "Valid familyId, roomId, date, and action are required." }, { status: 400 });
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

    const [{ data: familyRow, error: familyError }, { data: hostRow, error: hostError }] = await Promise.all([
      supabase.from("families").select("id,blocked_dates").eq("id", hostAccess.familyId).maybeSingle(),
      supabase.from("hosts").select("id,blocked_dates").eq("id", hostAccess.hostId).maybeSingle(),
    ]);

    if (familyError) throw familyError;
    if (hostError) throw hostError;

    await appendInventoryEvent(supabase, {
      familyId: hostAccess.familyId,
      stayUnitId: roomId,
      eventType: action === "block" ? "manual_block_set" : "manual_block_removed",
      eventSource: "famlo_pro_calendar",
      sourceReference: date,
      effectiveDateStart: date,
      effectiveDateEnd: date,
      payload: {
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

    const [familyUpdateResult, hostUpdateResult] = await Promise.all([
      supabase
        .from("families")
        .update({
          blocked_dates: nextBlockedDates(
            asStringArray((familyRow as JsonRecord | null)?.blocked_dates),
            date,
            action
          ),
        })
        .eq("id", hostAccess.familyId),
      supabase
        .from("hosts")
        .update({
          blocked_dates: nextBlockedDates(
            asStringArray((hostRow as JsonRecord | null)?.blocked_dates),
            date,
            action
          ),
        })
        .eq("id", hostAccess.hostId),
    ]);

    if (familyUpdateResult.error) throw familyUpdateResult.error;
    if (hostUpdateResult.error) throw hostUpdateResult.error;

    const eventUid = toCalendarEventUid("manual_block", roomId, date, null);
    await upsertCalendarEvent(supabase, {
      eventUid,
      ownerType: "stay_unit",
      ownerId: roomId,
      title: "Famlo manual block",
      startDate: date,
      endDate: date,
      slotKey: null,
      status: action === "block" ? "confirmed" : "released",
      sourceType: "manual_block",
      sourceReference: date,
      isBlocking: action === "block",
      payload: {
        family_id: hostAccess.familyId,
        room_id: roomId,
        updated_via: "famlo_pro_calendar",
      },
      connectionId: null,
    });

    const queuedJobIds = await enqueueChannexAriSyncJobs(supabase, {
      familyId: hostAccess.familyId,
      dateFrom: date,
      dateTo: date,
      jobTypes: ["availability_update", "restriction_update"],
      certificationScenario: action === "block" ? "availability_block" : "availability_unblock",
      sourceUiAction: action === "block" ? "Famlo PMS availability block" : "Famlo PMS availability unblock",
      sourceRoute: "/api/host/pro/calendar/manual-block",
      stayUnitIds: [roomId],
      actorUserId: hostAccess.hostUserId ?? null,
      actorRole: hostAccess.isAdmin ? "admin" : "host",
    });
    const stagingWorkerTriggered =
      queuedJobIds.length > 0
        ? await triggerQueuedChannexSyncWorker({
            requestUrl: request.url,
            workerId: "pms-calendar-manual-block",
            limit: queuedJobIds.length,
          })
        : false;

    return NextResponse.json({
      ok: true,
      action,
      date,
      roomId,
      queuedJobIds,
      stagingWorkerTriggered,
    });
  } catch (error) {
    console.error("[host.pro.calendar.manual-block] error", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update calendar block." },
      { status: 500 }
    );
  }
}
