import { NextResponse } from "next/server";

import { hasValidAdminSession } from "@/lib/admin-auth";
import { buildProductionFinanceReadinessReport } from "@/lib/finance/production-readiness";
import { createAdminSupabaseClient } from "@/lib/supabase";

export async function GET(): Promise<NextResponse> {
  try {
    if (!(await hasValidAdminSession())) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createAdminSupabaseClient();
    const report = await buildProductionFinanceReadinessReport(supabase);
    return NextResponse.json(report);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load production finance readiness." },
      { status: 500 }
    );
  }
}
