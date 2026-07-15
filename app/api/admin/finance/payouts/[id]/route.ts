import { NextRequest, NextResponse } from "next/server";

import { hasValidAdminSession } from "@/lib/admin-auth";
import { getAdminPayoutDetail } from "@/lib/finance/payout-admin";
import { createAdminSupabaseClient } from "@/lib/supabase";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    if (!(await hasValidAdminSession())) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id } = await context.params;
    const payoutExecutionId = String(id ?? "").trim();
    if (!payoutExecutionId) {
      return NextResponse.json({ error: "Payout execution id is required." }, { status: 400 });
    }
    const supabase = createAdminSupabaseClient();
    const detail = await getAdminPayoutDetail(supabase, payoutExecutionId);
    if (!detail) {
      return NextResponse.json({ error: "Payout execution not found." }, { status: 404 });
    }
    return NextResponse.json(detail);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load payout detail." },
      { status: 500 }
    );
  }
}
