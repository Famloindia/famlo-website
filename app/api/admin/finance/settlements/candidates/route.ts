import { NextRequest, NextResponse } from "next/server";

import { hasValidAdminSession } from "@/lib/admin-auth";
import { isSettlementDebugApiEnabled } from "@/lib/finance/feature-flags";
import { listSettlementCandidates } from "@/lib/finance/settlement-engine";
import { createAdminSupabaseClient } from "@/lib/supabase";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    if (!isSettlementDebugApiEnabled()) {
      return NextResponse.json({ error: "Settlement debug API is disabled." }, { status: 403 });
    }

    if (!(await hasValidAdminSession())) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const hostId = String(request.nextUrl.searchParams.get("hostId") ?? "").trim();
    const propertyId = String(request.nextUrl.searchParams.get("propertyId") ?? "").trim() || null;
    const periodStart = String(request.nextUrl.searchParams.get("periodStart") ?? "").trim();
    const periodEnd = String(request.nextUrl.searchParams.get("periodEnd") ?? "").trim();
    const includeOta = String(request.nextUrl.searchParams.get("includeOta") ?? "").trim().toLowerCase() === "true";

    if (!hostId || !periodStart || !periodEnd) {
      return NextResponse.json({ error: "hostId, periodStart, and periodEnd are required." }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();
    const result = await listSettlementCandidates(supabase, {
      hostId,
      propertyId,
      periodStart,
      periodEnd,
      includeOta,
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load settlement candidates." },
      { status: 500 }
    );
  }
}
