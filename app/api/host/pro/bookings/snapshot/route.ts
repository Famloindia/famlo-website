import { NextResponse } from "next/server";

import { loadLiveProBookingsSnapshot } from "@/lib/host-pro-live-data";
import { resolveAuthorizedHostResource } from "@/lib/host-access";
import { createAdminSupabaseClient } from "@/lib/supabase";

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asPositiveInteger(value: string, fallback: number): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function logDuration(label: string, startedAt: number, status: number, familyId: string): void {
  if (process.env.NODE_ENV === "production") return;
  console.info(`${label} ${status} ${Date.now() - startedAt}ms familyId=${familyId}`);
}

export async function GET(request: Request): Promise<NextResponse> {
  const startedAt = Date.now();
  try {
    const url = new URL(request.url);
    const familyId = asString(url.searchParams.get("familyId"));
    const view = asString(url.searchParams.get("view")) === "list" ? "list" : "full";
    const limit = Math.min(120, asPositiveInteger(asString(url.searchParams.get("limit")), view === "list" ? 30 : 120));

    if (!familyId) {
      const response = NextResponse.json({ error: "familyId is required." }, { status: 400 });
      logDuration("[host.pro.bookings.snapshot]", startedAt, 400, familyId);
      return response;
    }

    const supabase = createAdminSupabaseClient();
    const hostAccess = await resolveAuthorizedHostResource(supabase, request, { familyId });
    if (!hostAccess?.familyId || hostAccess.familyId !== familyId) {
      const response = NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      logDuration("[host.pro.bookings.snapshot]", startedAt, 401, familyId);
      return response;
    }

    const snapshot = await loadLiveProBookingsSnapshot(supabase, { familyId, view, limit });
    const response = NextResponse.json(snapshot, {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    });
    logDuration("[host.pro.bookings.snapshot]", startedAt, 200, familyId);
    return response;
  } catch (error) {
    console.error("[host.pro.bookings.snapshot] failed:", error);
    const response = NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load live bookings snapshot." },
      { status: 500 }
    );
    logDuration("[host.pro.bookings.snapshot]", startedAt, 500, "unknown");
    return response;
  }
}
