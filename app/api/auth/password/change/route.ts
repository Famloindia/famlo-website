import { NextResponse } from "next/server";

import { validateGuestPassword } from "@/lib/auth/guest-credentials";
import { resolveStrictAuthenticatedUser } from "@/lib/request-user";
import { createAdminSupabaseClient, createEphemeralPublicSupabaseClient } from "@/lib/supabase";

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
    if (providers.has("email")) {
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
    } else if (!authRecord.user.email_confirmed_at) {
      return NextResponse.json(
        { error: "Verify an email address before creating a password." },
        { status: 400 }
      );
    }

    const { error: updateError } = await admin.auth.admin.updateUserById(authUser.id, { password });
    if (updateError) throw updateError;
    return NextResponse.json({ success: true, message: "Password updated." });
  } catch (error) {
    console.error("Guest password change failed", {
      name: error instanceof Error ? error.name : "Error",
    });
    return NextResponse.json({ error: "Password could not be updated." }, { status: 400 });
  }
}
