import { NextResponse } from "next/server";

import {
  consumeEmailVerificationAttempt,
  GENERIC_EMAIL_OTP_ERROR,
  isEmailVerificationExpired,
} from "@/lib/auth/email-verification";
import { recordAccountLinkEvent } from "@/lib/auth/account-linking";
import { getOtpClientAddress } from "@/lib/auth/guest-otp";
import { normalizeGuestEmail } from "@/lib/guest-identity";
import { resolveStrictAuthenticatedUser } from "@/lib/request-user";
import {
  createAdminSupabaseClient,
  createEphemeralPublicSupabaseClient,
} from "@/lib/supabase";
import { isGuestProfileComplete, upsertUserProfileCompatibility } from "@/lib/user-profile";

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const supabase = createAdminSupabaseClient();
    const authenticatedUser = await resolveStrictAuthenticatedUser(supabase, request);
    if (!authenticatedUser) {
      return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
    }

    const body = (await request.json()) as {
      email?: unknown;
      otp?: unknown;
      accountLinkRequestId?: unknown;
    };
    const email = normalizeGuestEmail(
      typeof body.email === "string" ? body.email : null
    );
    const otp = typeof body.otp === "string" ? body.otp.trim() : "";
    if (
      !email ||
      !/^\d{6,8}$/.test(otp) ||
      !consumeEmailVerificationAttempt(
        authenticatedUser.id,
        email,
        getOtpClientAddress(request)
      )
    ) {
      return NextResponse.json({ error: GENERIC_EMAIL_OTP_ERROR }, { status: 401 });
    }

    const { data: pending, error: pendingError } = await supabase
      .from("users")
      .select("pending_email,pending_email_requested_at")
      .eq("id", authenticatedUser.id)
      .maybeSingle();
    if (
      pendingError ||
      normalizeGuestEmail(pending?.pending_email) !== email ||
      isEmailVerificationExpired(pending?.pending_email_requested_at)
    ) {
      return NextResponse.json({ error: GENERIC_EMAIL_OTP_ERROR }, { status: 401 });
    }

    const publicClient = createEphemeralPublicSupabaseClient();
    const { data, error: verifyError } = await publicClient.auth.verifyOtp({
      email,
      token: otp,
      type: "email",
    });
    if (
      verifyError ||
      !data.user ||
      !data.session ||
      data.user.id !== authenticatedUser.id ||
      normalizeGuestEmail(data.user.email) !== email ||
      !data.user.email_confirmed_at
    ) {
      return NextResponse.json({ error: GENERIC_EMAIL_OTP_ERROR }, { status: 401 });
    }

    const profile = await upsertUserProfileCompatibility(supabase, {
      userId: authenticatedUser.id,
      email,
      emailVerifiedAt: data.user.email_confirmed_at,
    });
    const { error: clearPendingError } = await supabase
      .from("users")
      .update({ pending_email: null, pending_email_requested_at: null })
      .eq("id", authenticatedUser.id)
      .eq("pending_email", email);
    if (clearPendingError) throw clearPendingError;

    const accountLinkRequestId =
      typeof body.accountLinkRequestId === "string"
        ? body.accountLinkRequestId.trim()
        : "";
    if (accountLinkRequestId) {
      const { data: updatedLink, error: linkUpdateError } = await supabase
        .from("account_link_requests")
        .update({
          target_session_verified_at: new Date().toISOString(),
          status: "awaiting_identity_link",
          updated_at: new Date().toISOString(),
        })
        .eq("id", accountLinkRequestId)
        .eq("target_user_id", authenticatedUser.id)
        .in("status", ["ownership_verified", "awaiting_target_session"])
        .select("id")
        .maybeSingle();
      if (linkUpdateError) throw linkUpdateError;
      if (!updatedLink) {
        return NextResponse.json({ error: GENERIC_EMAIL_OTP_ERROR }, { status: 401 });
      }
      await recordAccountLinkEvent(supabase, {
        requestId: accountLinkRequestId,
        eventType: "target_session_verified",
        actorUserId: authenticatedUser.id,
      });
    }

    return NextResponse.json({
      success: true,
      session: data.session,
      profile,
      profileComplete: isGuestProfileComplete(profile),
    });
  } catch (error) {
    console.error("Profile email OTP verification failed", {
      name: error instanceof Error ? error.name : "Error",
    });
    return NextResponse.json({ error: GENERIC_EMAIL_OTP_ERROR }, { status: 401 });
  }
}
