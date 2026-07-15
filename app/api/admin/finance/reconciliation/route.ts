import { NextResponse } from "next/server";

import { hasValidAdminSession } from "@/lib/admin-auth";
import { isAdminReconciliationUiEnabled } from "@/lib/finance/feature-flags";
import { buildFinanceReconciliationSnapshot } from "@/lib/finance/reconciliation";
import { createAdminSupabaseClient } from "@/lib/supabase";

export async function GET(): Promise<NextResponse> {
  try {
    if (!(await hasValidAdminSession())) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!isAdminReconciliationUiEnabled()) {
      return NextResponse.json({ error: "Admin reconciliation UI is disabled." }, { status: 403 });
    }

    const supabase = createAdminSupabaseClient();
    const snapshot = await buildFinanceReconciliationSnapshot(supabase);
    return NextResponse.json(snapshot);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load finance reconciliation snapshot." },
      { status: 500 }
    );
  }
}
