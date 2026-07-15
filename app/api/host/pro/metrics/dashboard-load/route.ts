import { NextResponse } from "next/server";

import { resolveAuthorizedHostResource } from "@/lib/host-access";
import { sanitizeDashboardLoadMetrics } from "@/lib/pro-dashboard-performance";
import { createAdminSupabaseClient } from "@/lib/supabase";

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = await request.json().catch(() => null);
    const metrics = sanitizeDashboardLoadMetrics(body);
    if (!metrics) {
      return NextResponse.json({ ok: false, error: "Valid dashboard load metrics are required." }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();
    const hostAccess = await resolveAuthorizedHostResource(supabase, request, { familyId: metrics.familyId });
    if (!hostAccess?.familyId || hostAccess.familyId !== metrics.familyId) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const { error } = await supabase.from("channel_sync_logs").insert({
      family_id: metrics.familyId,
      provider_code: "famlo_pro",
      action: "dashboard_load_metric",
      status: "success",
      message: `Famlo Pro ${metrics.initialSection} loaded in ${metrics.serverRenderMs}ms server / ${metrics.clientHydratedMs ?? "unknown"}ms client.`,
      payload: metrics,
    } as never);

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[host.pro.metrics.dashboard-load] failed:", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to record dashboard load metrics." },
      { status: 500 }
    );
  }
}
