import { NextResponse } from "next/server";

import { loadLiveCalendarSnapshot } from "@/lib/host-pro-live-data";
import { resolveAuthorizedHostResource } from "@/lib/host-access";
import { createAdminSupabaseClient } from "@/lib/supabase";

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = (await request.json()) as {
      familyId?: unknown;
      dateFrom?: unknown;
      dateTo?: unknown;
      roomIds?: unknown;
    };

    const familyId = asString(body.familyId);
    const dateFrom = asString(body.dateFrom);
    const dateTo = asString(body.dateTo);
    const roomIds = asStringArray(body.roomIds);

    if (!familyId || !dateFrom || !dateTo || !isIsoDate(dateFrom) || !isIsoDate(dateTo) || dateTo < dateFrom) {
      return NextResponse.json({ error: "Valid familyId, dateFrom, and dateTo are required." }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();
    const hostAccess = await resolveAuthorizedHostResource(supabase, request, { familyId });
    if (!hostAccess?.familyId || hostAccess.familyId !== familyId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const snapshot = await loadLiveCalendarSnapshot(supabase, {
      familyId,
      dateFrom,
      dateTo,
      roomIds: roomIds.length > 0 ? roomIds : null,
    });

    return NextResponse.json(snapshot, {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (error) {
    console.error("[host.pro.calendar.snapshot] failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load live calendar snapshot." },
      { status: 500 }
    );
  }
}
