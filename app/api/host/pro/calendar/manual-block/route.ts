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
      date?: unknown;
      action?: unknown;
    };

    const familyId = asString(body.familyId);
    const date = asString(body.date);
    const action = body.action === "unblock" ? "unblock" : body.action === "block" ? "block" : null;

    if (!familyId || !date || !action || !isIsoDate(date)) {
      return NextResponse.json({ error: "Valid familyId, date, and action are required." }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();
    const hostAccess = await resolveAuthorizedHostResource(supabase, request, { familyId });

    if (!hostAccess?.familyId || !hostAccess.hostId) {
      return NextResponse.json({ error: "You do not have access to this property calendar." }, { status: 403 });
    }

    const [{ data: familyRow, error: familyError }, { data: hostRow, error: hostError }] = await Promise.all([
      supabase.from("families").select("id,blocked_dates").eq("id", hostAccess.familyId).maybeSingle(),
      supabase.from("hosts").select("id,blocked_dates").eq("id", hostAccess.hostId).maybeSingle(),
    ]);

    if (familyError) throw familyError;
    if (hostError) throw hostError;

    const currentFamilyBlockedDates = asStringArray((familyRow as JsonRecord | null)?.blocked_dates);
    const currentHostBlockedDates = asStringArray((hostRow as JsonRecord | null)?.blocked_dates);
    const baseBlockedDates =
      currentFamilyBlockedDates.length > 0 ? currentFamilyBlockedDates : currentHostBlockedDates;
    const blockedDates = nextBlockedDates(baseBlockedDates, date, action);

    const [familyUpdateResult, hostUpdateResult] = await Promise.all([
      supabase
        .from("families")
        .update({ blocked_dates: blockedDates })
        .eq("id", hostAccess.familyId),
      supabase
        .from("hosts")
        .update({ blocked_dates: blockedDates })
        .eq("id", hostAccess.hostId),
    ]);

    if (familyUpdateResult.error) throw familyUpdateResult.error;
    if (hostUpdateResult.error) throw hostUpdateResult.error;

    const eventUid = toCalendarEventUid("manual_block", `host:${hostAccess.hostId}`, date, null);
    await upsertCalendarEvent(supabase, {
      eventUid,
      ownerType: "host",
      ownerId: hostAccess.hostId,
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
        updated_via: "famlo_pro_calendar",
      },
      connectionId: null,
    });

    return NextResponse.json({
      ok: true,
      action,
      date,
      blockedDatesCount: blockedDates.length,
    });
  } catch (error) {
    console.error("[host.pro.calendar.manual-block] error", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update calendar block." },
      { status: 500 }
    );
  }
}
