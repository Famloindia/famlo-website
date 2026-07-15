import { NextRequest, NextResponse } from "next/server";

import { hasAdminPermission } from "@/lib/admin-auth";
import { rejectRefundRequest } from "@/lib/finance/refund-admin";
import { createAdminSupabaseClient } from "@/lib/supabase";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    if (!(await hasAdminPermission("finance"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await request.json()) as { refundRequestId?: string; adminId?: string | null; reason?: string | null };
    const refundRequestId = String(body.refundRequestId ?? "").trim();
    if (!refundRequestId) {
      return NextResponse.json({ error: "refundRequestId is required." }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();
    const result = await rejectRefundRequest(supabase, {
      refundRequestId,
      actorUserId: body.adminId ?? null,
      reason: body.reason ?? null,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to reject refund request." },
      { status: 500 }
    );
  }
}
