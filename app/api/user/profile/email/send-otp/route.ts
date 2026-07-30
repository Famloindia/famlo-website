import { NextResponse } from "next/server";

import { findAuthUserByEmail, hasGoogleIdentity } from "@/lib/auth/account-linking";
import {
  classifyEmailVerificationRequest,
  EMAIL_VERIFICATION_COOLDOWN_SECONDS,
  GENERIC_EMAIL_VERIFICATION_MESSAGE,
} from "@/lib/auth/email-verification";
import { normalizeGuestEmail } from "@/lib/guest-identity";
import { resolveStrictAuthenticatedUser } from "@/lib/request-user";
import { buildOAuthCallbackUrl, getSafeGuestAuthReturnPath } from "@/lib/site-url";
import {
  createAdminSupabaseClient,
  createEphemeralPublicSupabaseClient,
} from "@/lib/supabase";

async function findVerifiedProfileEmailOwner(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  email: string,
  currentUserId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from("users")
    .select("id,email")
    .neq("id", currentUserId)
    .not("email_verified_at", "is", null);
  if (error) throw error;
  const match = (data ?? []).find(
    (row) => normalizeGuestEmail(row.email) === email
  );
  return match?.id ?? null;
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const supabase = createAdminSupabaseClient();
    const authUser = await resolveStrictAuthenticatedUser(supabase, request);
    if (!authUser) {
      return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
    }

    const body = (await request.json()) as { email?: unknown; returnTo?: unknown };
    const email = normalizeGuestEmail(
      typeof body.email === "string" ? body.email : null
    );
    if (!email) {
      return NextResponse.json(
        { error: "Enter a valid email address." },
        { status: 400 }
      );
    }

    const { data: authRecord, error: authError } =
      await supabase.auth.admin.getUserById(authUser.id);
    if (authError || !authRecord.user) {
      return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
    }

    const [authOwner, profileOwner] = await Promise.all([
      findAuthUserByEmail(supabase, email),
      findVerifiedProfileEmailOwner(supabase, email, authUser.id),
    ]);
    const eligibility = classifyEmailVerificationRequest({
      requestedEmail: email,
      authEmail: authRecord.user.email ?? null,
      authEmailConfirmed: Boolean(authRecord.user.email_confirmed_at),
      googleAuthenticated: hasGoogleIdentity(authRecord.user),
      ownedByAnotherAccount:
        Boolean(authOwner && authOwner.id !== authUser.id) || Boolean(profileOwner),
    });

    if (eligibility === "google_email_read_only") {
      return NextResponse.json(
        {
          error: "Your Google email is already verified and cannot be changed here.",
          code: "AUTH_EMAIL_READ_ONLY",
        },
        { status: 409 }
      );
    }
    if (eligibility === "verified_email_change_requires_reauthentication") {
      return NextResponse.json(
        {
          error: "Changing a verified email requires a separate reauthentication flow.",
          code: "EMAIL_CHANGE_REAUTH_REQUIRED",
        },
        { status: 409 }
      );
    }
    if (eligibility === "owned_by_another_account") {
      return NextResponse.json(
        {
          error: "This email is already linked to another Famlo account.",
          code: "EMAIL_ALREADY_LINKED",
        },
        { status: 409 }
      );
    }

    const { data: profileState, error: profileStateError } = await supabase
      .from("users")
      .select("pending_email,pending_email_requested_at")
      .eq("id", authUser.id)
      .maybeSingle();
    if (profileStateError) throw profileStateError;
    const requestedAt = profileState?.pending_email_requested_at
      ? Date.parse(profileState.pending_email_requested_at)
      : Number.NaN;
    const inCooldown =
      normalizeGuestEmail(profileState?.pending_email) === email &&
      Number.isFinite(requestedAt) &&
      requestedAt + EMAIL_VERIFICATION_COOLDOWN_SECONDS * 1000 > Date.now();
    if (inCooldown) {
      return NextResponse.json(
        { success: true, message: GENERIC_EMAIL_VERIFICATION_MESSAGE },
        { status: 202 }
      );
    }

    const { error: pendingError } = await supabase
      .from("users")
      .update({ pending_email: email, pending_email_requested_at: null })
      .eq("id", authUser.id);
    if (pendingError) throw pendingError;

    const matchesConfirmedAuthEmail =
      normalizeGuestEmail(authRecord.user.email) === email &&
      Boolean(authRecord.user.email_confirmed_at);
    if (!matchesConfirmedAuthEmail) {
      const { error: authUpdateError } = await supabase.auth.admin.updateUserById(
        authUser.id,
        { email, email_confirm: false }
      );
      if (authUpdateError) {
        return NextResponse.json(
          {
            error: "This email cannot be verified for this account.",
            code: "EMAIL_ALREADY_LINKED",
          },
          { status: 409 }
        );
      }
    }

    const publicClient = createEphemeralPublicSupabaseClient();
    const returnTo = getSafeGuestAuthReturnPath(
      typeof body.returnTo === "string" ? body.returnTo : "/profile"
    );
    const { error: sendError } = await publicClient.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: false,
        emailRedirectTo: buildOAuthCallbackUrl(returnTo),
      },
    });
    if (sendError) throw sendError;

    const { error: requestedError } = await supabase
      .from("users")
      .update({ pending_email_requested_at: new Date().toISOString() })
      .eq("id", authUser.id)
      .eq("pending_email", email);
    if (requestedError) throw requestedError;

    return NextResponse.json(
      { success: true, message: GENERIC_EMAIL_VERIFICATION_MESSAGE },
      { status: 202 }
    );
  } catch (error) {
    console.error("Profile email OTP send failed", {
      name: error instanceof Error ? error.name : "Error",
    });
    return NextResponse.json(
      { error: "Email verification could not be started. Please try again." },
      { status: 503 }
    );
  }
}
