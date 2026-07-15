import { NextRequest, NextResponse } from "next/server";

import { hasValidAdminSession } from "@/lib/admin-auth";
import { listRefundRequestsForAdmin } from "@/lib/finance/refund-admin";
import { createAdminSupabaseClient } from "@/lib/supabase";

export async function GET(_request: NextRequest): Promise<NextResponse> {
  try {
    if (!(await hasValidAdminSession())) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createAdminSupabaseClient();
    const rows = await listRefundRequestsForAdmin(supabase);
    return NextResponse.json({ refunds: rows });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load refund requests." },
      { status: 500 }
    );
  }
}
