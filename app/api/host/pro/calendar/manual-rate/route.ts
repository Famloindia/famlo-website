import { NextResponse } from "next/server";

import { toCalendarEventUid, upsertCalendarEvent } from "@/lib/calendar";
import { resolveAuthorizedHostResource } from "@/lib/host-access";
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
              currency: "INR",
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

    return NextResponse.json({
      ok: true,
      action,
      date,
      roomId,
      amount: action === "save" ? amount : null,
    });
  } catch (error) {
    console.error("[host.pro.calendar.manual-rate] error", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update daily room rate." },
      { status: 500 }
    );
  }
}
