import { NextRequest, NextResponse } from "next/server";

import { resolveFinanceHostAccess } from "@/lib/finance/host-finance-access";
import { listHostPayouts } from "@/lib/finance/payout-admin";
import { createAdminSupabaseClient } from "@/lib/supabase";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const supabase = createAdminSupabaseClient();
    const hostAccess = await resolveFinanceHostAccess(supabase, request);
    if (!hostAccess?.hostId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payouts = await listHostPayouts(supabase, hostAccess.hostId);
    return NextResponse.json({
      hostId: hostAccess.hostId,
      payouts,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load host payouts." },
      { status: 500 }
    );
  }
}
