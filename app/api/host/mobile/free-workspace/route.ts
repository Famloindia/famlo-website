import { NextResponse } from "next/server";

import { resolveAuthorizedHostResource } from "@/lib/host-access";
import { loadHostMobileFreeWorkspace } from "@/lib/host-mobile-free-workspace";
import { createAdminSupabaseClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

function logDuration(label: string, startedAt: number, status: number, familyId: string): void {
  if (process.env.NODE_ENV === "production") return;
  console.info(`${label} ${status} ${Date.now() - startedAt}ms familyId=${familyId}`);
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function GET(request: Request): Promise<NextResponse> {
  const startedAt = Date.now();
  try {
    const url = new URL(request.url);
    const familyId = asString(url.searchParams.get("familyId"));
    const view = asString(url.searchParams.get("view")) === "critical" ? "critical" : "full";

    if (!familyId) {
      const response = NextResponse.json({ ok: false, error: "familyId is required." }, { status: 400 });
      logDuration("[host.mobile.free-workspace]", startedAt, 400, familyId);
      return response;
    }

    const supabase = createAdminSupabaseClient();
    const hostAccess = await resolveAuthorizedHostResource(supabase, request, { familyId });
    if (!hostAccess?.familyId || hostAccess.familyId !== familyId) {
      const response = NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
      logDuration("[host.mobile.free-workspace]", startedAt, 401, familyId);
      return response;
    }

    const workspace = await loadHostMobileFreeWorkspace(supabase, {
      familyId,
      hostId: hostAccess.hostId,
      hostUserId: hostAccess.hostUserId,
      hostDisplayName: null,
      view,
    });

    const response = NextResponse.json(workspace, {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    });
    logDuration("[host.mobile.free-workspace]", startedAt, 200, familyId);
    return response;
  } catch (error) {
    console.error("[host.mobile.free-workspace] failed:", error);
    const response = NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to load mobile free workspace." },
      { status: 500 }
    );
    logDuration("[host.mobile.free-workspace]", startedAt, 500, "unknown");
    return response;
  }
}
