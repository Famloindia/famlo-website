import { NextResponse } from "next/server";

import {
  buildAccountLinkIdempotencyKey,
  createSafeAccountLinkResponse,
  findAuthUserByPhone,
  findGoogleProviderId,
  fingerprintIdentityContact,
  fingerprintProviderIdentity,
  hasGoogleIdentity,
  hasUserBusinessData,
  recordAccountLinkEvent,
} from "@/lib/auth/account-linking";
import {
  normalizeIndianOtpPhone,
  OTP_RESEND_COOLDOWN_SECONDS,
  requireTwoFactorApiKey,
  sendTwoFactorOtp,
} from "@/lib/auth/guest-otp";
import { resolveStrictAuthenticatedUser } from "@/lib/request-user";
import { getSafeGuestAuthReturnPath } from "@/lib/site-url";
import { createAdminSupabaseClient } from "@/lib/supabase";

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const supabase = createAdminSupabaseClient();
    const source = await resolveStrictAuthenticatedUser(supabase, request);
    if (!source || source.authKind !== "supabase") {
      return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
    }

    const body = (await request.json()) as { phone?: unknown; returnTo?: unknown };
    const phone = normalizeIndianOtpPhone(body.phone);
    const returnTo = getSafeGuestAuthReturnPath(
      typeof body.returnTo === "string" ? body.returnTo : "/profile"
    );
    const [{ data: sourceAuth }, target] = await Promise.all([
      supabase.auth.admin.getUserById(source.id),
      findAuthUserByPhone(supabase, `+${phone}`),
    ]);
    if (
      !sourceAuth.user ||
      !hasGoogleIdentity(sourceAuth.user) ||
      !target ||
      target.id === source.id ||
      !target.phone_confirmed_at
    ) {
      return NextResponse.json(
        { error: "This account cannot be linked through this flow." },
        { status: 409 }
      );
    }

    const providerId = findGoogleProviderId(sourceAuth.user);
    if (!providerId) {
      return NextResponse.json(
        { error: "This account cannot be linked through this flow." },
        { status: 409 }
      );
    }

    const contactFingerprint = fingerprintIdentityContact("phone", `+${phone}`);
    const idempotencyKey = buildAccountLinkIdempotencyKey({
      sourceUserId: source.id,
      targetUserId: target.id,
      contactFingerprint,
    });
    const [sourceHasBusinessData, targetHasBusinessData] = await Promise.all([
      hasUserBusinessData(supabase, source.id),
      hasUserBusinessData(supabase, target.id),
    ]);

    let { data: linkRequest, error: requestError } = await supabase
      .from("account_link_requests")
      .select("*")
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    if (requestError) throw requestError;

    if (!linkRequest) {
      const inserted = await supabase
        .from("account_link_requests")
        .insert({
          source_user_id: source.id,
          target_user_id: target.id,
          provider: "google",
          contact_type: "phone",
          contact_fingerprint: contactFingerprint,
          intended_return_path: returnTo,
          source_has_business_data: sourceHasBusinessData,
          target_has_business_data: targetHasBusinessData,
          idempotency_key: idempotencyKey,
          metadata: {
            source_provider_fingerprint: fingerprintProviderIdentity(providerId),
          },
        })
        .select("*")
        .single();
      if (inserted.error) throw inserted.error;
      linkRequest = inserted.data;
      await recordAccountLinkEvent(supabase, {
        requestId: linkRequest.id,
        eventType: "link_requested",
        actorUserId: source.id,
      });
    }

    if (linkRequest.status === "linked" || linkRequest.status === "blocked_business_data") {
      return NextResponse.json(
        createSafeAccountLinkResponse({
          requestId: linkRequest.id,
          status: linkRequest.status,
          intendedReturnPath: linkRequest.intended_return_path,
          sourceHasBusinessData: linkRequest.source_has_business_data,
          targetHasBusinessData: linkRequest.target_has_business_data,
        }),
        { status: linkRequest.status === "linked" ? 200 : 409 }
      );
    }

    const cooldownStart = new Date(
      Date.now() - OTP_RESEND_COOLDOWN_SECONDS * 1000
    ).toISOString();
    const { data: recent, error: cooldownError } = await supabase
      .from("phone_otps")
      .select("id")
      .eq("account_link_request_id", linkRequest.id)
      .eq("verified", false)
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
    const { error: otpError } = await supabase.from("phone_otps").insert({
      phone,
      otp: "2FACTOR_MANAGED",
      otp_session_id: sessionId,
      purpose: "guest_account_link",
      account_link_request_id: linkRequest.id,
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      verified: false,
    });
    if (otpError) throw otpError;

    return NextResponse.json({
      success: true,
      requestId: linkRequest.id,
      sessionId,
      message: "A verification code has been sent.",
    });
  } catch (error) {
    console.error("Account-link phone OTP send failed", {
      name: error instanceof Error ? error.name : "Error",
    });
    return NextResponse.json(
      { error: "Account verification could not be started. Please try again." },
      { status: 503 }
    );
  }
}
