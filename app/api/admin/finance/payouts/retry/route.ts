import { NextRequest, NextResponse } from "next/server";

import { hasValidAdminSession } from "@/lib/admin-auth";
import { isSettlementPayoutExecutionEnabled } from "@/lib/finance/feature-flags";
import { retryFailedSettlementPayout } from "@/lib/finance/payout-execution-engine";
import { createAdminSupabaseClient } from "@/lib/supabase";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    if (!(await hasValidAdminSession())) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!isSettlementPayoutExecutionEnabled()) {
      return NextResponse.json({ error: "Settlement payout execution is disabled." }, { status: 403 });
    }

    const body = (await request.json()) as { payoutExecutionId?: string; adminId?: string | null };
    const payoutExecutionId = String(body.payoutExecutionId ?? "").trim();
    if (!payoutExecutionId) {
      return NextResponse.json({ error: "payoutExecutionId is required." }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();
    const result = await retryFailedSettlementPayout(supabase, {
      payoutExecutionId,
      actorUserId: body.adminId ?? null,
      explicitAdminAction: true,
    });
    return NextResponse.json({ success: true, result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to retry payout execution." },
      { status: 500 }
    );
  }
}
