"use client";

import type { SupabaseClient, User } from "@supabase/supabase-js";

import type { GuestSessionSnapshot } from "@/lib/guest-session";
import type { ContactEvidence } from "@/lib/auth/contact-evidence";
import type { UserProfileRecord } from "@/lib/user-profile";

type GuestSessionResponse = {
  user?: GuestSessionSnapshot["user"];
  profile?: UserProfileRecord | null;
  profileComplete?: boolean;
  contactEvidence?: ContactEvidence;
  error?: string;
};

function toSupabaseLikeUser(user: GuestSessionSnapshot["user"]): User | null {
  if (!user?.id) return null;

  return {
    id: user.id,
    email: user.email ?? undefined,
    phone: user.phone ?? undefined,
    user_metadata: {},
    app_metadata: user.provider ? { provider: user.provider } : {},
    aud: "authenticated",
    created_at: new Date(0).toISOString(),
  } as User;
}

export function normalizeGuestSessionResponse(payload: GuestSessionResponse | null | undefined): GuestSessionSnapshot {
  return {
    user: payload?.user?.id
      ? {
          id: payload.user.id,
          email: payload.user.email ?? null,
          phone: payload.user.phone ?? null,
          provider: payload.user.provider ?? null,
          authKind: payload.user.authKind ?? "supabase",
        }
      : null,
    profile: (payload?.profile as UserProfileRecord | null) ?? null,
    profileComplete: payload?.profileComplete === true,
    contactEvidence: payload?.contactEvidence ?? {
      email: { value: null, verified: false, readOnly: false, source: "none" },
      phone: { value: null, verified: false, source: "none" },
      providers: [],
    },
  };
}

export async function fetchGuestSessionSnapshot(supabase: SupabaseClient): Promise<{
  snapshot: GuestSessionSnapshot;
  user: User | null;
}> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const response = await fetch("/api/auth/session", {
    cache: "no-store",
    headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
  });
  const payload = (await response.json().catch(() => null)) as GuestSessionResponse | null;

  if (!response.ok) {
    throw new Error(typeof payload?.error === "string" ? payload.error : "Failed to load auth session.");
  }

  const snapshot = normalizeGuestSessionResponse(payload);
  return {
    snapshot,
    user: toSupabaseLikeUser(snapshot.user),
  };
}
