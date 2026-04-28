import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { getGuestCookieName, readGuestSessionToken } from "@/lib/guest-auth";
import { getSupabaseAccessTokenCookieName } from "@/lib/auth-constants";

export async function resolveAuthenticatedUser(
  supabase: SupabaseClient,
  request?: Request
): Promise<{ id: string; email: string | null; phone?: string | null } | null> {
  const fallbackUserId = request?.headers.get("x-famlo-user-id")?.trim() || null;
  const fallbackEmail = request?.headers.get("x-famlo-user-email")?.trim() || null;
  const bearerToken =
    request?.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ||
    request?.headers.get("x-sb-access-token")?.trim() ||
    null;

  let accessToken = bearerToken;

  if (!accessToken) {
    const cookieStore = await cookies();
    accessToken = cookieStore.get(getSupabaseAccessTokenCookieName())?.value ?? null;

    if (!accessToken) {
      const guestSession = readGuestSessionToken(cookieStore.get(getGuestCookieName())?.value);
      if (guestSession) {
        return {
          id: guestSession.userId,
          email: fallbackEmail,
          phone: guestSession.phone,
        };
      }
    }
  }

  if (!accessToken) return null;

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(accessToken);

  if (!error && user) {
    return {
      id: user.id,
      email: user.email ?? null,
      phone: user.phone ?? null,
    };
  }

  if (fallbackUserId) {
    return {
      id: fallbackUserId,
      email: fallbackEmail,
      phone: null,
    };
  }

  return null;
}
