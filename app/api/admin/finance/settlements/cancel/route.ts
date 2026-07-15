import { NextRequest, NextResponse } from "next/server";

import { hasValidAdminSession } from "@/lib/admin-auth";
import { isAdminSettlementActionsEnabled, isAdminSettlementCancelEnabled } from "@/lib/finance/feature-flags";
import { cancelSettlementDraft } from "@/lib/finance/settlement-engine";
import { createAdminSupabaseClient } from "@/lib/supabase";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    if (!(await hasValidAdminSession())) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!isAdminSettlementActionsEnabled() || !isAdminSettlementCancelEnabled()) {
      return NextResponse.json({ error: "Settlement cancellation is disabled." }, { status: 403 });
    }

    const body = (await request.json()) as { settlementId?: string; actorUserId?: string | null };
    const settlementId = String(body.settlementId ?? "").trim();
    if (!settlementId) {
      return NextResponse.json({ error: "settlementId is required." }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();
    const settlement = await cancelSettlementDraft(supabase, {
      settlementId,
      actorUserId: body.actorUserId ?? null,
    });
    return NextResponse.json({ settlement });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to cancel settlement draft." },
      { status: 500 }
    );
  }
}
