import { NextResponse } from "next/server";

import {
  consumeGuestAuthAttempt,
  getAuthClientAddress,
} from "@/lib/auth/guest-credentials";
import { normalizeGuestUsername, validateGuestUsername } from "@/lib/guest-username";
import { resolveStrictAuthenticatedUser } from "@/lib/request-user";
import { createAdminSupabaseClient } from "@/lib/supabase";

export async function GET(request: Request): Promise<NextResponse> {
  const username = normalizeGuestUsername(new URL(request.url).searchParams.get("username"));
  const validationError = validateGuestUsername(username);
  if (validationError) {
    return NextResponse.json({ valid: false, available: false, error: validationError }, { status: 400 });
  }
  if (!consumeGuestAuthAttempt(`username:${username}`, getAuthClientAddress(request))) {
    return NextResponse.json({ valid: true, available: false, error: "Please wait and try again." }, { status: 429 });
  }

  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("users")
    .select("id")
    .eq("username", username)
    .limit(1);
  if (error) {
    return NextResponse.json({ valid: true, available: false, error: "Availability could not be checked." }, { status: 503 });
  }
  const authenticatedUser = await resolveStrictAuthenticatedUser(supabase, request);
  const ownerId = data?.[0]?.id;
  const available = !ownerId || ownerId === authenticatedUser?.id;
  return NextResponse.json({ valid: true, available, username });
}
