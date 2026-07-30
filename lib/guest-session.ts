import type { SupabaseClient } from "@supabase/supabase-js";

import { normalizeGuestEmail, normalizeGuestPhone } from "@/lib/guest-identity";
import { deriveContactEvidence, type ContactEvidence } from "@/lib/auth/contact-evidence";
import { isGuestProfileComplete, loadUserProfileCompatibility, type UserProfileRecord, upsertUserProfileCompatibility } from "@/lib/user-profile";

export type AuthenticatedGuestUser = {
  id: string;
  email: string | null;
  phone?: string | null;
  provider?: string | null;
  authKind?: "supabase" | "guest_cookie" | "header_fallback";
};

export type GuestSessionSnapshot = {
  user: {
    id: string;
    email: string | null;
    phone: string | null;
    provider: string | null;
    authKind: "supabase" | "guest_cookie" | "header_fallback";
  } | null;
  profile: UserProfileRecord | null;
  profileComplete: boolean;
  contactEvidence: ContactEvidence;
};

export function createGuestSessionSnapshot(
  user: GuestSessionSnapshot["user"],
  profile: UserProfileRecord | null,
  contactEvidence: ContactEvidence = deriveContactEvidence(null, profile)
): GuestSessionSnapshot {
  return {
    user,
    profile,
    profileComplete: isGuestProfileComplete(profile),
    contactEvidence,
  };
}

export async function loadGuestSessionSnapshot(
  supabase: SupabaseClient,
  authUser: AuthenticatedGuestUser | null
): Promise<GuestSessionSnapshot> {
  if (!authUser) {
    return createGuestSessionSnapshot(null, null);
  }

  let profile = await loadUserProfileCompatibility(supabase, authUser.id);

  const authRecord =
    supabase.auth?.admin?.getUserById
      ? (await supabase.auth.admin.getUserById(authUser.id)).data
      : null;

  if (authUser.authKind !== "guest_cookie") {
    let confirmedEmailAt = profile?.email_verified_at ?? null;
    let confirmedPhoneAt = profile?.phone_verified_at ?? null;
    if (authRecord?.user) {
      const authEmail = normalizeGuestEmail(authRecord.user.email);
      const authPhone = normalizeGuestPhone(authRecord.user.phone);
      if (authEmail && authEmail === normalizeGuestEmail(authUser.email)) {
        confirmedEmailAt = authRecord.user.email_confirmed_at ?? confirmedEmailAt;
      }
      if (authPhone && authPhone === normalizeGuestPhone(authUser.phone)) {
        confirmedPhoneAt = authRecord.user.phone_confirmed_at ?? confirmedPhoneAt;
      }
    }
    const metadata = authRecord?.user?.user_metadata ?? {};
    const googleName =
      typeof metadata.full_name === "string"
        ? metadata.full_name
        : typeof metadata.name === "string"
          ? metadata.name
          : null;
    const googleAvatar =
      typeof metadata.avatar_url === "string"
        ? metadata.avatar_url
        : typeof metadata.picture === "string"
          ? metadata.picture
          : null;
    await upsertUserProfileCompatibility(supabase, {
      userId: authUser.id,
      email: normalizeGuestEmail(authUser.email) ?? profile?.email ?? null,
      phone: normalizeGuestPhone(authUser.phone) ?? profile?.phone ?? null,
      name: profile?.name ?? googleName,
      avatarUrl: profile?.avatar_url ?? googleAvatar,
      emailVerifiedAt: confirmedEmailAt,
      phoneVerifiedAt: confirmedPhoneAt,
    });

    profile = await loadUserProfileCompatibility(supabase, authUser.id);
  }

  const canonicalAuthUser = authRecord?.user ?? null;
  return createGuestSessionSnapshot(
    {
      id: authUser.id,
      email: normalizeGuestEmail(authUser.email),
      phone: normalizeGuestPhone(authUser.phone),
      provider: authUser.provider ?? null,
      authKind: authUser.authKind ?? "supabase",
    },
    profile,
    deriveContactEvidence(canonicalAuthUser, profile)
  );
}
