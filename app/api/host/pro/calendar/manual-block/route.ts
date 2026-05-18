import { NextResponse } from "next/server";

import { toCalendarEventUid, upsertCalendarEvent } from "@/lib/calendar";
import { resolveAuthorizedHostResource } from "@/lib/host-access";
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
    const hostAccess = await resolveAuthorizedHostResource(supabase, request, {
      ownerType: "stay_unit",
      ownerId: roomId,
    });

    if (
      !hostAccess?.familyId ||
      !hostAccess.hostId ||
      hostAccess.stayUnitId !== roomId ||
      hostAccess.familyId !== familyId
    ) {
      return NextResponse.json({ error: "You do not have access to this room calendar." }, { status: 403 });
    }

    const [{ data: familyRow, error: familyError }, { data: hostRow, error: hostError }] = await Promise.all([
      supabase.from("families").select("id,blocked_dates").eq("id", hostAccess.familyId).maybeSingle(),
      supabase.from("hosts").select("id,blocked_dates").eq("id", hostAccess.hostId).maybeSingle(),
    ]);

    if (familyError) throw familyError;
    if (hostError) throw hostError;

    const [familyUpdateResult, hostUpdateResult] = await Promise.all([
      supabase
        .from("families")
        .update({
          blocked_dates: nextBlockedDates(
            asStringArray((familyRow as JsonRecord | null)?.blocked_dates),
            date,
            "unblock"
          ),
        })
        .eq("id", hostAccess.familyId),
      supabase
        .from("hosts")
        .update({
          blocked_dates: nextBlockedDates(
            asStringArray((hostRow as JsonRecord | null)?.blocked_dates),
            date,
            "unblock"
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

    return NextResponse.json({
      ok: true,
      action,
      date,
      roomId,
    });
  } catch (error) {
    console.error("[host.pro.calendar.manual-block] error", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update calendar block." },
      { status: 500 }
    );
  }
}
