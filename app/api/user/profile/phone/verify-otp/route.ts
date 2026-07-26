import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";

import {
  consumeOtpVerificationAttempt,
  GENERIC_OTP_ERROR,
  getOtpClientAddress,
  isUsableOtpChallenge,
  normalizeIndianOtpPhone,
  requireTwoFactorApiKey,
  verifyTwoFactorOtp,
} from "@/lib/auth/guest-otp";
import { resolveStrictAuthenticatedUser } from "@/lib/request-user";
import { createAdminSupabaseClient } from "@/lib/supabase";
import { normalizeGuestPhone } from "@/lib/guest-identity";
import { isGuestProfileComplete, upsertUserProfileCompatibility } from "@/lib/user-profile";

async function findAuthUserByPhone(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  phone: string
): Promise<User | null> {
  const normalizedPhone = normalizeGuestPhone(phone);
  for (let page = 1; page <= 100; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const match = data.users.find((user) => normalizeGuestPhone(user.phone) === normalizedPhone);
    if (match) return match;
    if (data.users.length < 1000) return null;
  }
  throw new Error("Unable to resolve the verified phone.");
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const supabase = createAdminSupabaseClient();
    const authUser = await resolveStrictAuthenticatedUser(supabase, request);
    if (!authUser) {
      return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
    }

    const body = (await request.json()) as {
      phone?: unknown;
      otp?: unknown;
      sessionId?: unknown;
    };
    const phone = normalizeIndianOtpPhone(body.phone);
    const otp = typeof body.otp === "string" ? body.otp.trim() : "";
    const sessionId = typeof body.sessionId === "string" ? body.sessionId.trim() : "";
    if (!otp || !sessionId || !consumeOtpVerificationAttempt(phone, getOtpClientAddress(request))) {
      return NextResponse.json({ error: GENERIC_OTP_ERROR }, { status: 401 });
    }

    const { data: challenge, error: challengeError } = await supabase
      .from("phone_otps")
      .select("id,otp_session_id,expires_at,verified,purpose")
      .eq("phone", phone)
      .eq("otp_session_id", sessionId)
      .eq("purpose", "guest_phone_auth")
      .eq("verified", false)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (challengeError || !challenge || !isUsableOtpChallenge(challenge, sessionId)) {
      return NextResponse.json({ error: GENERIC_OTP_ERROR }, { status: 401 });
    }

    await verifyTwoFactorOtp({
      apiKey: requireTwoFactorApiKey(),
      sessionId,
      otp,
    });

    const linkedAuthUser = await findAuthUserByPhone(supabase, `+${phone}`);
    if (linkedAuthUser && linkedAuthUser.id !== authUser.id) {
      const { error: consumeConflictError } = await supabase
        .from("phone_otps")
        .update({ verified: true })
        .eq("id", challenge.id)
        .eq("verified", false);
      if (consumeConflictError) throw consumeConflictError;

      return NextResponse.json(
        {
          error: "This phone number is already linked to another Famlo account.",
          code: "PHONE_ALREADY_LINKED",
          ownershipVerified: true,
        },
        { status: 409 }
      );
    }

    const verifiedAt = new Date().toISOString();
    const { error: authUpdateError } = await supabase.auth.admin.updateUserById(authUser.id, {
      phone: `+${phone}`,
      phone_confirm: true,
    });
    if (authUpdateError) {
      return NextResponse.json(
        { error: "This phone number cannot be linked to the account." },
        { status: 409 }
      );
    }

    const profile = await upsertUserProfileCompatibility(supabase, {
      userId: authUser.id,
      phone: `+${phone}`,
      phoneVerifiedAt: verifiedAt,
    });
    const { error: consumeError } = await supabase
      .from("phone_otps")
      .update({ verified: true })
      .eq("id", challenge.id)
      .eq("verified", false);
    if (consumeError) throw consumeError;

    return NextResponse.json({
      success: true,
      profile,
      profileComplete: isGuestProfileComplete(profile),
    });
  } catch (error) {
    console.error("Profile phone OTP verification failed", {
      name: error instanceof Error ? error.name : "Error",
    });
    return NextResponse.json({ error: GENERIC_OTP_ERROR }, { status: 401 });
  }
}
