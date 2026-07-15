import { NextRequest, NextResponse } from "next/server";

import { hasValidAdminSession } from "@/lib/admin-auth";
import { getRefundRequestDetailForAdmin } from "@/lib/finance/refund-admin";
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
    const refundRequestId = String(id ?? "").trim();
    if (!refundRequestId) {
      return NextResponse.json({ error: "Refund request id is required." }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();
    const detail = await getRefundRequestDetailForAdmin(supabase, refundRequestId);
    if (!detail) {
      return NextResponse.json({ error: "Refund request not found." }, { status: 404 });
    }
    return NextResponse.json(detail);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load refund request detail." },
      { status: 500 }
    );
  }
}
