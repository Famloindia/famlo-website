import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import { getAdminCookieName, verifyAdminSessionToken } from "@/lib/admin-auth";
import { sendPayoutEmail } from "@/lib/notifications/email/finance-email-service";
import { createAdminSupabaseClient } from "@/lib/supabase";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const cookieStore = await cookies();
    const isAuthenticated = verifyAdminSessionToken(cookieStore.get(getAdminCookieName())?.value);
    if (!isAuthenticated) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as { payoutExecutionId?: string; template?: "processed" | "failed" };
    const payoutExecutionId = String(body.payoutExecutionId ?? "").trim();
    if (!payoutExecutionId) {
      return NextResponse.json({ error: "payoutExecutionId is required." }, { status: 400 });
    }
    const template = body.template === "failed" ? "failed" : "processed";

    const supabase = createAdminSupabaseClient();
    const result = await sendPayoutEmail(supabase, { payoutExecutionId, template });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to send payout email." },
      { status: 500 }
    );
  }
}
