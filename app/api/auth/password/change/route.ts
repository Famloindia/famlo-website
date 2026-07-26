import { NextResponse } from "next/server";

import { validateGuestPassword } from "@/lib/auth/guest-credentials";
import { normalizeGuestPhone } from "@/lib/guest-identity";
import { resolveStrictAuthenticatedUser } from "@/lib/request-user";
import { createAdminSupabaseClient, createEphemeralPublicSupabaseClient } from "@/lib/supabase";

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const admin = createAdminSupabaseClient();
    const authUser = await resolveStrictAuthenticatedUser(admin, request);
    if (!authUser) {
      return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
    }
    const { data, error } = await admin.auth.admin.getUserById(authUser.id);
    if (error || !data.user) {
      return NextResponse.json({ error: "Password status could not be loaded." }, { status: 400 });
    }
    const providers = new Set((data.user.identities ?? []).map((identity) => identity.provider));
    return NextResponse.json({
      hasPassword:
        providers.has("email") ||
        data.user.user_metadata?.famlo_password_configured === true,
    });
  } catch {
    return NextResponse.json({ error: "Password status could not be loaded." }, { status: 400 });
  }
}

export async function PATCH(request: Request): Promise<NextResponse> {
  try {
    const body = (await request.json()) as {
      currentPassword?: unknown;
      password?: unknown;
      confirmPassword?: unknown;
    };
    const password = typeof body.password === "string" ? body.password : "";
    const confirmPassword = typeof body.confirmPassword === "string" ? body.confirmPassword : "";
    const currentPassword = typeof body.currentPassword === "string" ? body.currentPassword : "";
    const passwordError = validateGuestPassword(password);
    if (passwordError || password !== confirmPassword) {
      return NextResponse.json(
        { error: password !== confirmPassword ? "Passwords do not match." : passwordError },
        { status: 400 }
      );
    }

    const admin = createAdminSupabaseClient();
    const authUser = await resolveStrictAuthenticatedUser(admin, request);
    if (!authUser) {
      return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
    }
    const { data: authRecord, error: authError } = await admin.auth.admin.getUserById(authUser.id);
    if (authError || !authRecord.user) {
      return NextResponse.json({ error: "Password could not be updated." }, { status: 400 });
    }

    const providers = new Set(
      (authRecord.user.identities ?? []).map((identity) => identity.provider)
    );
    const verifiedPhoneRecovery =
      authUser.authKind === "guest_cookie" &&
      Boolean(authRecord.user.phone_confirmed_at) &&
      normalizeGuestPhone(authRecord.user.phone) === normalizeGuestPhone(authUser.phone);

    if (!verifiedPhoneRecovery && providers.has("email")) {
      if (!authRecord.user.email || !currentPassword) {
        return NextResponse.json({ error: "Enter your current password." }, { status: 400 });
      }
      const publicClient = createEphemeralPublicSupabaseClient();
      const { error } = await publicClient.auth.signInWithPassword({
        email: authRecord.user.email,
        password: currentPassword,
      });
      if (error) {
        return NextResponse.json({ error: "Current password is incorrect." }, { status: 400 });
      }
    } else if (!verifiedPhoneRecovery && !authRecord.user.email_confirmed_at) {
      return NextResponse.json(
        { error: "Verify an email address before creating a password." },
        { status: 400 }
      );
    }

    const { error: updateError } = await admin.auth.admin.updateUserById(authUser.id, {
      password,
      user_metadata: {
        ...(authRecord.user.user_metadata ?? {}),
        famlo_password_configured: true,
      },
    });
    if (updateError) throw updateError;
    return NextResponse.json({ success: true, message: "Password updated." });
  } catch (error) {
    console.error("Guest password change failed", {
      name: error instanceof Error ? error.name : "Error",
    });
    return NextResponse.json({ error: "Password could not be updated." }, { status: 400 });
  }
}
