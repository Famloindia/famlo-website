import { NextResponse } from "next/server";

import {
  consumeGuestAuthAttempt,
  GENERIC_AUTH_ERROR,
  getAuthClientAddress,
  resolveLoginIdentifier,
} from "@/lib/auth/guest-credentials";
import { loadGuestSessionSnapshot } from "@/lib/guest-session";
import { createAdminSupabaseClient, createEphemeralPublicSupabaseClient } from "@/lib/supabase";

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = (await request.json()) as { identifier?: unknown; password?: unknown };
    const identifier = resolveLoginIdentifier(body.identifier);
    const password = typeof body.password === "string" ? body.password : "";
    const rateLimitIdentifier = identifier?.normalized ?? "invalid";

    if (
      !identifier ||
      !password ||
      !consumeGuestAuthAttempt(rateLimitIdentifier, getAuthClientAddress(request))
    ) {
      return NextResponse.json({ error: GENERIC_AUTH_ERROR }, { status: 401 });
    }

    let email = identifier.kind === "email" ? identifier.normalized : null;
    const admin = createAdminSupabaseClient();
    if (identifier.kind === "username") {
      const { data } = await admin
        .from("users")
        .select("id")
        .eq("username", identifier.normalized)
        .maybeSingle();
      if (typeof data?.id === "string") {
        const { data: authRecord } = await admin.auth.admin.getUserById(data.id);
        email =
          authRecord.user?.email_confirmed_at && authRecord.user.email
            ? authRecord.user.email.trim().toLowerCase()
            : null;
      }
    }

    const supabase = createEphemeralPublicSupabaseClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email ?? "invalid-login@invalid.famlo.local",
      password,
    });
    if (error || !data.user || !data.session) {
      return NextResponse.json({ error: GENERIC_AUTH_ERROR }, { status: 401 });
    }

    const snapshot = await loadGuestSessionSnapshot(admin, {
      id: data.user.id,
      email: data.user.email ?? null,
      phone: data.user.phone ?? null,
      provider: "email",
      authKind: "supabase",
    });

    return NextResponse.json({
      success: true,
      session: data.session,
      profileComplete: snapshot.profileComplete,
    });
  } catch (error) {
    console.error("Guest password login failed", {
      name: error instanceof Error ? error.name : "Error",
    });
    return NextResponse.json({ error: GENERIC_AUTH_ERROR }, { status: 401 });
  }
}
