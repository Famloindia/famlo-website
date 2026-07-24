import { NextResponse } from "next/server";

import { requireHostSettingsSession } from "@/lib/host-settings-auth";
import { completeHostWhatsappOtp, hashRequestIp } from "@/lib/host-whatsapp-settings";
import { assertSameOrigin, getRequestIp } from "@/lib/request-security";
import { createAdminSupabaseClient } from "@/lib/supabase";

export async function POST(request: Request): Promise<NextResponse> {
  const supabase = createAdminSupabaseClient();
  try {
    assertSameOrigin(request);
    const session = await requireHostSettingsSession(supabase, request);
    const body = (await request.json()) as { challengeId?: unknown; code?: unknown };
    const challengeId = typeof body.challengeId === "string" ? body.challengeId.trim() : "";
    if (!challengeId) {
      return NextResponse.json({ error: "Verification session is required.", code: "invalid_request" }, { status: 400 });
    }
    const settings = await completeHostWhatsappOtp(supabase, {
      hostUserId: session.hostUserId,
      challengeId,
      code: body.code,
      ipHash: hashRequestIp(getRequestIp(request)),
    });
    return NextResponse.json({ settings });
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? String(error.code) : "otp_verify_failed";
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to verify the code.", code },
      { status: code === "unauthorized" ? 401 : 400 }
    );
  }
}
