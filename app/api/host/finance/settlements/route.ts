import { NextRequest, NextResponse } from "next/server";

import { isHostSettlementReadEnabled } from "@/lib/finance/feature-flags";
import { resolveFinanceHostAccess } from "@/lib/finance/host-finance-access";
import { createAdminSupabaseClient } from "@/lib/supabase";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    if (!isHostSettlementReadEnabled()) {
      return NextResponse.json({ error: "Host settlement read is disabled." }, { status: 403 });
    }

    const supabase = createAdminSupabaseClient();
    const hostAccess = await resolveFinanceHostAccess(supabase, request);
    if (!hostAccess) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("host_settlements_v2")
      .select("*")
      .eq("host_id", hostAccess.hostId)
      .order("created_at", { ascending: false });
    if (error) throw error;

    return NextResponse.json({
      hostId: hostAccess.hostId,
      settlements: data ?? [],
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load host settlements." },
      { status: 500 }
    );
  }
}
