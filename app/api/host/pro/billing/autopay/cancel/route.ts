import { NextRequest, NextResponse } from "next/server";

import { resolveAuthorizedHostSession } from "@/lib/chat-access";
import { cancelHostProAutopayAtPeriodEnd } from "@/lib/pro-billing/service";
import { createAdminSupabaseClient } from "@/lib/supabase";

type CancelBody = {
  razorpaySubscriptionId?: string;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const supabase = createAdminSupabaseClient();
    const hostSession = await resolveAuthorizedHostSession(supabase, request);

    if (!hostSession?.hostUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as CancelBody;
    const razorpaySubscriptionId = asString(body.razorpaySubscriptionId);
    if (!razorpaySubscriptionId) {
      return NextResponse.json({ error: "razorpaySubscriptionId is required." }, { status: 400 });
    }

    await cancelHostProAutopayAtPeriodEnd(supabase, {
      hostUserId: hostSession.hostUserId,
      razorpaySubscriptionId,
    });

    return NextResponse.json({ success: true, cancelledAtPeriodEnd: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to cancel Famlo Pro auto-renewal." },
      { status: 400 }
    );
  }
}
