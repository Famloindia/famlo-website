import { NextRequest, NextResponse } from "next/server";

import { hasValidAdminSession } from "@/lib/admin-auth";
import { isSettlementPayoutExecutionEnabled } from "@/lib/finance/feature-flags";
import { initiateApprovedSettlementPayout } from "@/lib/finance/payout-execution-engine";
import { createAdminSupabaseClient } from "@/lib/supabase";

type SettlementPayoutBody = {
  settlementId?: string;
  adminId?: string | null;
};

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    if (!(await hasValidAdminSession())) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!isSettlementPayoutExecutionEnabled()) {
      return NextResponse.json({ error: "Settlement payout execution is disabled." }, { status: 403 });
    }

    const body = (await request.json()) as SettlementPayoutBody;
    const settlementId = String(body.settlementId ?? "").trim();
    if (!settlementId) {
      return NextResponse.json({ error: "settlementId is required." }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();
    const result = await initiateApprovedSettlementPayout(supabase, {
      settlementId,
      actorUserId: body.adminId ?? null,
      explicitAdminAction: true,
    });

    return NextResponse.json({
      success: true,
      result,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to initiate settlement payout." },
      { status: 500 }
    );
  }
}
