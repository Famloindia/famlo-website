import { NextResponse } from "next/server";

import {
  normalizeIndianOtpPhone,
  OTP_RESEND_COOLDOWN_SECONDS,
  requireTwoFactorApiKey,
  sendTwoFactorOtp,
} from "@/lib/auth/guest-otp";
import { findAuthUserByPhone } from "@/lib/auth/account-linking";
import { resolveStrictAuthenticatedUser } from "@/lib/request-user";
import { createAdminSupabaseClient } from "@/lib/supabase";

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const supabase = createAdminSupabaseClient();
    const authUser = await resolveStrictAuthenticatedUser(supabase, request);
    if (!authUser) {
      return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
    }

    const body = (await request.json()) as { phone?: unknown };
    const phone = normalizeIndianOtpPhone(body.phone);
    const owner = await findAuthUserByPhone(supabase, `+${phone}`);
    if (owner && owner.id !== authUser.id) {
      return NextResponse.json(
        {
          error: "This phone number is already linked to another Famlo account.",
          code: "PHONE_ALREADY_LINKED",
        },
        { status: 409 }
      );
    }
    const cooldownStart = new Date(Date.now() - OTP_RESEND_COOLDOWN_SECONDS * 1000).toISOString();
    const { data: recent, error: cooldownError } = await supabase
      .from("phone_otps")
      .select("id")
      .eq("phone", phone)
      .eq("purpose", "guest_phone_auth")
      .gte("created_at", cooldownStart)
      .limit(1);
    if (cooldownError) throw cooldownError;
    if ((recent?.length ?? 0) > 0) {
      return NextResponse.json(
        { error: "Please wait before requesting another verification code." },
        { status: 429 }
      );
    }

    const sessionId = await sendTwoFactorOtp({
      apiKey: requireTwoFactorApiKey(),
      phone,
    });
    const { error } = await supabase.from("phone_otps").insert({
      phone,
      otp: "2FACTOR_MANAGED",
      otp_session_id: sessionId,
      purpose: "guest_phone_auth",
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      verified: false,
    });
    if (error) throw error;
    return NextResponse.json({ success: true, sessionId });
  } catch (error) {
    console.error("Profile phone OTP send failed", {
      name: error instanceof Error ? error.name : "Error",
    });
    return NextResponse.json(
      { error: "Unable to send a verification code. Please try again." },
      { status: 503 }
    );
  }
}
