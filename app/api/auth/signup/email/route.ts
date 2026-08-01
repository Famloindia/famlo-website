import { NextResponse } from "next/server";

import {
  consumeGuestAuthAttempt,
  getAuthClientAddress,
  validateGuestPassword,
} from "@/lib/auth/guest-credentials";
import { normalizeGuestEmail } from "@/lib/guest-identity";
import { findAuthUserByEmail } from "@/lib/auth/account-linking";
import { buildOAuthCallbackUrl } from "@/lib/site-url";
import { createAdminSupabaseClient, createEphemeralPublicSupabaseClient } from "@/lib/supabase";

const SIGNUP_ERROR = "Account creation could not be completed. Check your details and try again.";
const ACCOUNT_EXISTS_ERROR = "An account already exists with this email. Sign in or reset your password.";

function accountExistsResponse(): NextResponse {
  return NextResponse.json(
    { error: ACCOUNT_EXISTS_ERROR, code: "ACCOUNT_EXISTS" },
    { status: 409 }
  );
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = (await request.json()) as {
      email?: unknown;
      password?: unknown;
      confirmPassword?: unknown;
      returnTo?: unknown;
    };
    const email = normalizeGuestEmail(typeof body.email === "string" ? body.email : null);
    const password = typeof body.password === "string" ? body.password : "";
    const confirmPassword = typeof body.confirmPassword === "string" ? body.confirmPassword : "";
    const passwordError = validateGuestPassword(password);

    if (
      !email ||
      passwordError ||
      password !== confirmPassword ||
      !consumeGuestAuthAttempt(email, getAuthClientAddress(request))
    ) {
      return NextResponse.json(
        {
          error:
            password !== confirmPassword
              ? "Passwords do not match."
              : passwordError ?? SIGNUP_ERROR,
        },
        { status: 400 }
      );
    }

    const admin = createAdminSupabaseClient();
    if (await findAuthUserByEmail(admin, email)) return accountExistsResponse();

    const returnTo = typeof body.returnTo === "string" ? body.returnTo : "/";
    const supabase = createEphemeralPublicSupabaseClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: buildOAuthCallbackUrl(returnTo),
        data: { role: "guest", source: "famlo-web-email-signup" },
      },
    });
    if (error || !data.user) {
      if (await findAuthUserByEmail(admin, email)) return accountExistsResponse();
      return NextResponse.json({ error: SIGNUP_ERROR }, { status: 400 });
    }

    if (Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      return accountExistsResponse();
    }

    const { error: profileError } = await admin.from("users").upsert(
      {
        id: data.user.id,
        email,
        email_verified_at: data.user.email_confirmed_at ?? null,
        role: "guest",
        auth_provider: "email",
        updated_at: new Date().toISOString(),
      } as never,
      { onConflict: "id" }
    );
    if (profileError) throw profileError;

    return NextResponse.json({
      success: true,
      session: data.session,
      verificationRequired: !data.session,
    });
  } catch (error) {
    console.error("Guest email signup failed", {
      name: error instanceof Error ? error.name : "Error",
    });
    return NextResponse.json({ error: SIGNUP_ERROR }, { status: 400 });
  }
}
