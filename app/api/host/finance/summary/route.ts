import { NextRequest, NextResponse } from "next/server";

import { isHostFinanceUiEnabled } from "@/lib/finance/feature-flags";
import { resolveFinanceHostAccess } from "@/lib/finance/host-finance-access";
import { loadHostFinanceSummary } from "@/lib/finance/host-finance-ui";
import { createAdminSupabaseClient } from "@/lib/supabase";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    if (!isHostFinanceUiEnabled()) {
      return NextResponse.json({ error: "Host finance summary is not enabled in this environment." }, { status: 403 });
    }

    const supabase = createAdminSupabaseClient();
    const hostAccess = await resolveFinanceHostAccess(supabase, request);
    if (!hostAccess) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const summary = await loadHostFinanceSummary(supabase, hostAccess);
    return NextResponse.json({
      hostId: hostAccess.hostId,
      summary,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load host finance summary." },
      { status: 500 }
    );
  }
}
