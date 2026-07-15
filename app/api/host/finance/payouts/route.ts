import { NextRequest, NextResponse } from "next/server";

import { resolveFinanceHostAccess } from "@/lib/finance/host-finance-access";
import { listHostPayouts } from "@/lib/finance/payout-admin";
import { resolveAuthorizedHostResource } from "@/lib/host-access";
import { createAdminSupabaseClient } from "@/lib/supabase";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const supabase = createAdminSupabaseClient();
    const familyId = String(request.nextUrl.searchParams.get("familyId") ?? "").trim();
    if (familyId) {
      const hostAccess = await resolveAuthorizedHostResource(supabase, request, { familyId });
      if (!hostAccess?.hostId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }

      let payouts: Record<string, unknown>[] = [];
      try {
        payouts = await listHostPayouts(supabase, hostAccess.hostId);
      } catch (error) {
        console.warn("[host.finance.payouts] fallback empty payouts", {
          familyId,
          hostId: hostAccess.hostId,
          message: error instanceof Error ? error.message : String(error),
        });
      }
      return NextResponse.json({
        hostId: hostAccess.hostId,
        familyId,
        payouts,
      });
    }

    const hostAccess = await resolveFinanceHostAccess(supabase, request);
    if (!hostAccess?.hostId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let payouts: Record<string, unknown>[] = [];
    try {
      payouts = await listHostPayouts(supabase, hostAccess.hostId);
    } catch (error) {
      console.warn("[host.finance.payouts] fallback empty payouts", {
        hostId: hostAccess.hostId,
        message: error instanceof Error ? error.message : String(error),
      });
    }
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
