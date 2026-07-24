import { NextResponse } from "next/server";

import { requireHostSettingsSession } from "@/lib/host-settings-auth";
import { hashRequestIp, requestHostWhatsappOtp } from "@/lib/host-whatsapp-settings";
import { assertSameOrigin, getRequestIp } from "@/lib/request-security";
import { createAdminSupabaseClient } from "@/lib/supabase";

export async function POST(request: Request): Promise<NextResponse> {
  const supabase = createAdminSupabaseClient();
  try {
    assertSameOrigin(request);
    const session = await requireHostSettingsSession(supabase, request);
    const body = (await request.json()) as { phone?: unknown; consent?: unknown };
    const result = await requestHostWhatsappOtp(supabase, {
      hostUserId: session.hostUserId,
      phone: body.phone,
      consent: body.consent === true,
      ipHash: hashRequestIp(getRequestIp(request)),
    });
    return NextResponse.json({
      challengeId: result.challengeId,
      expiresAt: result.expiresAt,
      resendAvailableAt: result.resendAvailableAt,
    });
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? String(error.code) : "otp_send_failed";
    const status = code === "unauthorized" ? 401 : code === "rate_limited" || code === "resend_cooldown" ? 429 : 400;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to send verification code.", code },
      { status }
    );
  }
}
