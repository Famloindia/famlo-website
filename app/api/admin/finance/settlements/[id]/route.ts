import { NextRequest, NextResponse } from "next/server";

import { hasValidAdminSession } from "@/lib/admin-auth";
import { isSettlementDebugApiEnabled } from "@/lib/finance/feature-flags";
import { getSettlementById } from "@/lib/finance/settlement-engine";
import { createAdminSupabaseClient } from "@/lib/supabase";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    if (!isSettlementDebugApiEnabled()) {
      return NextResponse.json({ error: "Settlement debug API is disabled." }, { status: 403 });
    }

    if (!(await hasValidAdminSession())) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const params = await context.params;
    const settlementId = String(params.id ?? "").trim();
    if (!settlementId) {
      return NextResponse.json({ error: "Settlement id is required." }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();
    const result = await getSettlementById(supabase, settlementId);
    if (!result.settlement) {
      return NextResponse.json({ error: "Settlement not found." }, { status: 404 });
    }

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load settlement detail." },
      { status: 500 }
    );
  }
}
