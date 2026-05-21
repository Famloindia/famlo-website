import { NextRequest, NextResponse } from "next/server";

import { hasValidAdminSession } from "@/lib/admin-auth";
import { listAdminPayouts } from "@/lib/finance/payout-admin";
import { createAdminSupabaseClient } from "@/lib/supabase";

export async function GET(_request: NextRequest): Promise<NextResponse> {
  try {
    if (!(await hasValidAdminSession())) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const supabase = createAdminSupabaseClient();
    const payouts = await listAdminPayouts(supabase);
    return NextResponse.json({ payouts });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load payouts." },
      { status: 500 }
    );
  }
}
