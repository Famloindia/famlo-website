import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import { getAdminCookieName, verifyAdminSessionToken } from "@/lib/admin-auth";
import { loadChannelOpsReadiness } from "@/lib/channel-ops-readiness";
import { createAdminSupabaseClient } from "@/lib/supabase";

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

async function isAuthorized(request: NextRequest): Promise<boolean> {
  const secret = process.env.CRON_SECRET?.trim();
  const bearer = request.headers.get("authorization");
  const query = request.nextUrl.searchParams.get("secret");
  if (secret && (bearer === `Bearer ${secret}` || query === secret)) return true;

  const cookieStore = await cookies();
  return verifyAdminSessionToken(cookieStore.get(getAdminCookieName())?.value);
}

async function handleRequest(request: NextRequest): Promise<NextResponse> {
  const startedAt = Date.now();
  try {
    if (!(await isAuthorized(request))) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const familyIdFilter = asString(request.nextUrl.searchParams.get("familyId"));
    const lookbackHours = Math.max(1, Math.min(Number(request.nextUrl.searchParams.get("lookbackHours") ?? 24), 168));
    const supabase = createAdminSupabaseClient();
    const familyIds = familyIdFilter
      ? [familyIdFilter]
      : await (async () => {
          const { data, error } = await supabase
            .from("channel_properties")
            .select("family_id")
            .not("family_id", "is", null)
            .order("updated_at", { ascending: false })
            .limit(100);
          if (error) throw error;
          return Array.from(new Set((data ?? []).map((row) => asString(row.family_id)).filter(Boolean) as string[]));
        })();

    const results = [];
    for (const familyId of familyIds) {
      const readiness = await loadChannelOpsReadiness(supabase, { familyId, lookbackHours });
      const alertRows = readiness.alerts.map((alert) => ({
        family_id: familyId,
        provider_code: alert.providerCode ?? "famlo_pro",
        action: "channel_ops_alert",
        status: alert.severity,
        message: `${alert.title}: ${alert.detail}`,
        payload: {
          alert,
          readinessPercent: readiness.readinessPercent,
          generatedAt: readiness.generatedAt,
          metrics: readiness.metrics,
        },
      }));

      if (alertRows.length > 0) {
        const { error } = await supabase.from("channel_sync_logs").insert(alertRows as never);
        if (error) throw error;
      }

      results.push({
        familyId,
        severity: readiness.severity,
        readinessPercent: readiness.readinessPercent,
        alertCount: readiness.alerts.length,
      });
    }

    console.log(
      JSON.stringify({
        level: "info",
        msg: "channel_ops_alerts_done",
        route: "/api/internal/cron/channel-ops-alerts",
        requestId: request.headers.get("x-vercel-id"),
        ms: Date.now() - startedAt,
        familyCount: familyIds.length,
        alertCount: results.reduce((sum, row) => sum + row.alertCount, 0),
      })
    );

    return NextResponse.json({
      ok: true,
      ranAt: new Date().toISOString(),
      familyCount: familyIds.length,
      results,
    });
  } catch (error) {
    console.error(
      JSON.stringify({
        level: "error",
        msg: "channel_ops_alerts_failed",
        route: "/api/internal/cron/channel-ops-alerts",
        requestId: request.headers.get("x-vercel-id"),
        ms: Date.now() - startedAt,
        error: error instanceof Error ? error.message : "Failed to record channel ops alerts.",
      })
    );
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to record channel ops alerts." },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  return handleRequest(request);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return handleRequest(request);
}
