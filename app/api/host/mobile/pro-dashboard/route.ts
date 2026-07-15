import { NextResponse } from "next/server";

import { resolveAuthorizedHostResource } from "@/lib/host-access";
import { loadHostMobileProDashboardOverview } from "@/lib/host-mobile-pro-dashboard";
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
      logDuration("[host.mobile.pro-dashboard]", startedAt, 400, familyId);
      return response;
    }

    const supabase = createAdminSupabaseClient();
    const hostAccess = await resolveAuthorizedHostResource(supabase, request, { familyId });
    if (!hostAccess?.familyId || hostAccess.familyId !== familyId) {
      const response = NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
      logDuration("[host.mobile.pro-dashboard]", startedAt, 401, familyId);
      return response;
    }

    const overview = await loadHostMobileProDashboardOverview(supabase, {
      familyId,
      hostId: hostAccess.hostId,
      hostUserId: hostAccess.hostUserId,
      view,
    });

    if (!overview.property.proAllowed) {
      const response = NextResponse.json(
        {
          ok: false,
          error: "Famlo Pro is not active for this property.",
          pro: {
            status: overview.property.proStatus,
            reason: overview.property.proReason,
            currentPeriodEnd: overview.property.proCurrentPeriodEnd,
            graceUntil: overview.property.proGraceUntil,
          },
        },
        { status: 403 }
      );
      logDuration("[host.mobile.pro-dashboard]", startedAt, 403, familyId);
      return response;
    }

    const response = NextResponse.json(overview, {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    });
    logDuration("[host.mobile.pro-dashboard]", startedAt, 200, familyId);
    return response;
  } catch (error) {
    console.error("[host.mobile.pro-dashboard] failed:", error);
    const response = NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to load mobile Pro dashboard." },
      { status: 500 }
    );
    logDuration("[host.mobile.pro-dashboard]", startedAt, 500, "unknown");
    return response;
  }
}
