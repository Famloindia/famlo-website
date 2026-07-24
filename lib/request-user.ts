import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { getGuestCookieName, readGuestSessionToken } from "@/lib/guest-auth";
import { getSupabaseAccessTokenCookieName } from "@/lib/auth-constants";

type ResolvedAuthUser = {
  id: string;
  email: string | null;
  phone?: string | null;
  provider?: string | null;
  authKind?: "supabase" | "guest_cookie" | "header_fallback";
};

async function resolveAccessToken(request?: Request): Promise<string | null> {
  const bearerToken =
    request?.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ||
    request?.headers.get("x-sb-access-token")?.trim() ||
    null;

  if (bearerToken) {
    return bearerToken;
  }

  const cookieStore = await cookies();
  return cookieStore.get(getSupabaseAccessTokenCookieName())?.value ?? null;
}

export async function resolveStrictAuthenticatedUser(
  supabase: SupabaseClient,
  request?: Request
): Promise<ResolvedAuthUser | null> {
  const accessToken = await resolveAccessToken(request);

  if (!accessToken) {
    const cookieStore = await cookies();
    const guestSession = readGuestSessionToken(cookieStore.get(getGuestCookieName())?.value);
    if (!guestSession) {
      return null;
    }

    return {
      id: guestSession.userId,
      email: null,
      phone: guestSession.phone,
      provider: "guest_cookie",
      authKind: "guest_cookie",
    };
  }

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(accessToken);

  if (error || !user) {
    return null;
  }

  return {
    id: user.id,
    email: user.email ?? null,
    phone: user.phone ?? null,
    provider:
      typeof user.app_metadata?.provider === "string"
        ? user.app_metadata.provider
        : typeof user.user_metadata?.provider === "string"
          ? user.user_metadata.provider
          : null,
    authKind: "supabase",
  };
}

export async function resolveAuthenticatedUser(
  supabase: SupabaseClient,
  request?: Request
): Promise<ResolvedAuthUser | null> {
  const fallbackUserId = request?.headers.get("x-famlo-user-id")?.trim() || null;
  const fallbackEmail = request?.headers.get("x-famlo-user-email")?.trim() || null;
  const strictUser = await resolveStrictAuthenticatedUser(supabase, request);
  if (strictUser) {
    return strictUser;
  }

  if (fallbackUserId) {
    return {
      id: fallbackUserId,
      email: fallbackEmail,
      phone: null,
      provider: "header_fallback",
      authKind: "header_fallback",
    };
  }

  return null;
}
