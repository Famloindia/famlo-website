import { NextResponse } from "next/server";

import {
  consumeGuestAuthAttempt,
  getAuthClientAddress,
} from "@/lib/auth/guest-credentials";
import { normalizeGuestEmail } from "@/lib/guest-identity";
import { getPublicSiteUrl } from "@/lib/site-url";
import { createEphemeralPublicSupabaseClient } from "@/lib/supabase";

const GENERIC_RESPONSE =
  "If an eligible account exists, password reset instructions have been sent.";

export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json().catch(() => null)) as { email?: unknown } | null;
  const email = normalizeGuestEmail(typeof body?.email === "string" ? body.email : null);
  if (email && consumeGuestAuthAttempt(`forgot:${email}`, getAuthClientAddress(request))) {
    const supabase = createEphemeralPublicSupabaseClient();
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: new URL("/auth/reset-password", getPublicSiteUrl()).toString(),
    });
  }
  return NextResponse.json({ success: true, message: GENERIC_RESPONSE });
}
