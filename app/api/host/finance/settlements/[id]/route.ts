import { NextRequest, NextResponse } from "next/server";

import { isHostSettlementReadEnabled } from "@/lib/finance/feature-flags";
import { resolveFinanceHostAccess } from "@/lib/finance/host-finance-access";
import { createAdminSupabaseClient } from "@/lib/supabase";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    if (!isHostSettlementReadEnabled()) {
      return NextResponse.json({ error: "Host settlement read is disabled." }, { status: 403 });
    }

    const supabase = createAdminSupabaseClient();
    const hostAccess = await resolveFinanceHostAccess(supabase, request);
    if (!hostAccess) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const params = await context.params;
    const settlementId = String(params.id ?? "").trim();
    if (!settlementId) {
      return NextResponse.json({ error: "Settlement id is required." }, { status: 400 });
    }

    const { data: settlement, error: settlementError } = await supabase
      .from("host_settlements_v2")
      .select("*")
      .eq("id", settlementId)
      .eq("host_id", hostAccess.hostId)
      .maybeSingle();
    if (settlementError) throw settlementError;
    if (!settlement) {
      return NextResponse.json({ error: "Settlement not found." }, { status: 404 });
    }

    const { data: lineItems, error: lineError } = await supabase
      .from("settlement_line_items_v2")
      .select("*")
      .eq("settlement_id", settlementId)
      .order("created_at", { ascending: true });
    if (lineError) throw lineError;

    return NextResponse.json({
      settlement,
      lineItems: lineItems ?? [],
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load host settlement detail." },
      { status: 500 }
    );
  }
}
