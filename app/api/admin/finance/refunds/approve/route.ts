import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import { hasAdminPermission } from "@/lib/admin-auth";
import { approveAndMaybeInitiateRefund } from "@/lib/finance/refund-requests";
import { createAdminSupabaseClient } from "@/lib/supabase";

type RefundApproveBody = {
  refundRequestId?: string;
  adminId?: string;
};

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    if (!(await hasAdminPermission("finance"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await req.json()) as RefundApproveBody;
    const refundRequestId = String(body.refundRequestId ?? "").trim();
    const adminId = String(body.adminId ?? "").trim() || null;

    if (!refundRequestId) {
      return NextResponse.json({ error: "refundRequestId is required." }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();
    const result = await approveAndMaybeInitiateRefund(supabase, {
      refundRequestId,
      actorUserId: adminId,
    });

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to approve refund request." },
      { status: 500 }
    );
  }
}
