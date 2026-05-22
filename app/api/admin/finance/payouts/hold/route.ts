import { NextRequest, NextResponse } from "next/server";

import { hasValidAdminSession } from "@/lib/admin-auth";
import { isPayoutHoldEnabled } from "@/lib/finance/feature-flags";
import { holdPayoutTarget, type PayoutHoldTargetType } from "@/lib/finance/payout-holds";
import { createAdminSupabaseClient } from "@/lib/supabase";

type HoldBody = {
  targetType?: PayoutHoldTargetType;
  targetId?: string;
  adminId?: string | null;
  reason?: string | null;
  isHostActionable?: boolean;
  pause?: boolean;
};

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    if (!(await hasValidAdminSession())) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!isPayoutHoldEnabled()) {
      return NextResponse.json({ error: "Payout hold controls are disabled." }, { status: 403 });
    }

    const body = (await request.json()) as HoldBody;
    const targetType = String(body.targetType ?? "").trim() as PayoutHoldTargetType;
    const targetId = String(body.targetId ?? "").trim();
    if (!targetId || !["host", "property", "settlement", "payout_execution"].includes(targetType)) {
      return NextResponse.json({ error: "Valid targetType and targetId are required." }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();
    const result = await holdPayoutTarget(supabase, {
      targetType,
      targetId,
      actorUserId: body.adminId ?? null,
      reason: body.reason ?? null,
      isHostActionable: body.isHostActionable === true,
      pause: body.pause === true,
    });

    return NextResponse.json({ success: true, result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to apply payout hold." },
      { status: 500 }
    );
  }
}
