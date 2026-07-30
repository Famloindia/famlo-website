import { NextResponse } from "next/server";

import {
  createSafeAccountLinkResponse,
  decideAccountLink,
  recordAccountLinkEvent,
} from "@/lib/auth/account-linking";
import {
  consumeOtpVerificationAttempt,
  GENERIC_OTP_ERROR,
  getOtpClientAddress,
  isUsableOtpChallenge,
  normalizeIndianOtpPhone,
  requireTwoFactorApiKey,
  verifyTwoFactorOtp,
} from "@/lib/auth/guest-otp";
import {
  createGuestSessionToken,
  getGuestCookieName,
  getGuestSessionMaxAge,
} from "@/lib/guest-auth";
import { normalizeGuestPhone } from "@/lib/guest-identity";
import { resolveStrictAuthenticatedUser } from "@/lib/request-user";
import { createAdminSupabaseClient } from "@/lib/supabase";

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const supabase = createAdminSupabaseClient();
    const source = await resolveStrictAuthenticatedUser(supabase, request);
    if (!source || source.authKind !== "supabase") {
      return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
    }

    const body = (await request.json()) as {
      requestId?: unknown;
      phone?: unknown;
      otp?: unknown;
      sessionId?: unknown;
    };
    const requestId = typeof body.requestId === "string" ? body.requestId.trim() : "";
    const phone = normalizeIndianOtpPhone(body.phone);
    const otp = typeof body.otp === "string" ? body.otp.trim() : "";
    const sessionId = typeof body.sessionId === "string" ? body.sessionId.trim() : "";
    if (
      !requestId ||
      !otp ||
      !sessionId ||
      !consumeOtpVerificationAttempt(phone, getOtpClientAddress(request))
    ) {
      return NextResponse.json({ error: GENERIC_OTP_ERROR }, { status: 401 });
    }

    const { data: linkRequest, error: linkError } = await supabase
      .from("account_link_requests")
      .select("*")
      .eq("id", requestId)
      .eq("source_user_id", source.id)
      .maybeSingle();
    if (
      linkError ||
      !linkRequest ||
      !["pending_phone_proof", "ownership_verified", "awaiting_target_session"].includes(
        linkRequest.status
      )
    ) {
      return NextResponse.json({ error: GENERIC_OTP_ERROR }, { status: 401 });
    }

    const { data: challenge, error: challengeError } = await supabase
      .from("phone_otps")
      .select("id,otp_session_id,expires_at,verified,purpose,account_link_request_id")
      .eq("account_link_request_id", requestId)
      .eq("otp_session_id", sessionId)
      .eq("purpose", "guest_account_link")
      .eq("verified", false)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (challengeError || !challenge || !isUsableOtpChallenge(challenge, sessionId)) {
      return NextResponse.json({ error: GENERIC_OTP_ERROR }, { status: 401 });
    }

    const { data: targetAuth, error: targetError } =
      await supabase.auth.admin.getUserById(linkRequest.target_user_id);
    if (
      targetError ||
      !targetAuth.user ||
      normalizeGuestPhone(targetAuth.user.phone) !== normalizeGuestPhone(`+${phone}`)
    ) {
      return NextResponse.json({ error: GENERIC_OTP_ERROR }, { status: 401 });
    }

    await verifyTwoFactorOtp({
      apiKey: requireTwoFactorApiKey(),
      sessionId,
      otp,
    });

    const consumedAt = new Date().toISOString();
    const { data: consumedChallenge, error: consumeError } = await supabase
      .from("phone_otps")
      .update({ verified: true })
      .eq("id", challenge.id)
      .eq("verified", false)
      .select("id")
      .maybeSingle();
    if (consumeError) throw consumeError;
    if (!consumedChallenge) {
      return NextResponse.json({ error: GENERIC_OTP_ERROR }, { status: 401 });
    }

    const decision = decideAccountLink({
      ownershipVerified: true,
      sourceHasBusinessData: linkRequest.source_has_business_data,
      targetHasBusinessData: linkRequest.target_has_business_data,
      targetSupabaseSessionVerified: false,
      identityLinked: false,
    });
    const { error: updateError } = await supabase
      .from("account_link_requests")
      .update({
        status: decision.status,
        ownership_verified_at: consumedAt,
        proof_attempts: linkRequest.proof_attempts + 1,
        blocked_reason: decision.blockedReason,
        updated_at: consumedAt,
      })
      .eq("id", requestId)
      .eq("source_user_id", source.id);
    if (updateError) throw updateError;

    await recordAccountLinkEvent(supabase, {
      requestId,
      eventType:
        decision.status === "blocked_business_data"
          ? "automatic_merge_blocked"
          : "phone_ownership_verified",
      actorUserId: source.id,
      metadata: decision.blockedReason
        ? { blocked_reason: decision.blockedReason }
        : {},
    });

    const safeResult = createSafeAccountLinkResponse({
      requestId,
      status: decision.status,
      intendedReturnPath: linkRequest.intended_return_path,
      sourceHasBusinessData: linkRequest.source_has_business_data,
      targetHasBusinessData: linkRequest.target_has_business_data,
    });
    const response = NextResponse.json({
      success: decision.status !== "blocked_business_data",
      ...safeResult,
    }, { status: decision.status === "blocked_business_data" ? 409 : 200 });
    if (decision.status !== "blocked_business_data") {
      response.cookies.set(
        getGuestCookieName(),
        createGuestSessionToken(targetAuth.user.id, `+${phone}`),
        {
          httpOnly: true,
          sameSite: "lax",
          secure: process.env.NODE_ENV === "production",
          path: "/",
          maxAge: getGuestSessionMaxAge(),
        }
      );
    }
    return response;
  } catch (error) {
    console.error("Account-link phone OTP verification failed", {
      name: error instanceof Error ? error.name : "Error",
    });
    return NextResponse.json({ error: GENERIC_OTP_ERROR }, { status: 401 });
  }
}
