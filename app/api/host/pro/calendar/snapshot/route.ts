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

function logDuration(label: string, startedAt: number, status: number, familyId: string): void {
  if (process.env.NODE_ENV === "production") return;
  console.info(`${label} ${status} ${Date.now() - startedAt}ms familyId=${familyId}`);
}

export async function POST(request: Request): Promise<NextResponse> {
  const startedAt = Date.now();
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
      const response = NextResponse.json({ error: "Valid familyId, dateFrom, and dateTo are required." }, { status: 400 });
      logDuration("[host.pro.calendar.snapshot]", startedAt, 400, familyId);
      return response;
    }

    const supabase = createAdminSupabaseClient();
    const hostAccess = await resolveAuthorizedHostResource(supabase, request, { familyId });
    if (!hostAccess?.familyId || hostAccess.familyId !== familyId) {
      const response = NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      logDuration("[host.pro.calendar.snapshot]", startedAt, 401, familyId);
      return response;
    }

    const snapshot = await loadLiveCalendarSnapshot(supabase, {
      familyId,
      dateFrom,
      dateTo,
      roomIds: roomIds.length > 0 ? roomIds : null,
    });

    const response = NextResponse.json(snapshot, {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    });
    logDuration("[host.pro.calendar.snapshot]", startedAt, 200, familyId);
    return response;
  } catch (error) {
    console.error("[host.pro.calendar.snapshot] failed:", error);
    const response = NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load live calendar snapshot." },
      { status: 500 }
    );
    logDuration("[host.pro.calendar.snapshot]", startedAt, 500, "unknown");
    return response;
  }
}
