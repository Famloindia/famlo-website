import type { SupabaseClient } from "@supabase/supabase-js";

import {
  getGuestPhoneLookupVariants,
  mergeGuestProfileCandidates,
  normalizeGuestEmail,
  normalizeGuestPhone,
} from "@/lib/guest-identity";
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
};

type GuestUserRow = {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  state: string | null;
  onboarding_completed: boolean | null;
  avatar_url: string | null;
  about: string | null;
  date_of_birth: string | null;
  gender: string | null;
  updated_at: string | null;
};

const USER_PROFILE_SELECT =
  "id, name, phone, email, city, state, onboarding_completed, avatar_url, about, date_of_birth, gender, updated_at";

function dedupeRows(rows: GuestUserRow[]): GuestUserRow[] {
  const byId = new Map<string, GuestUserRow>();

  for (const row of rows) {
    if (!row?.id) continue;
    byId.set(row.id, row);
  }

  return Array.from(byId.values());
}

async function loadGuestIdentityRows(
  supabase: SupabaseClient,
  authUser: AuthenticatedGuestUser
): Promise<GuestUserRow[]> {
  const normalizedEmail = normalizeGuestEmail(authUser.email);
  const phoneVariants = getGuestPhoneLookupVariants(authUser.phone);
  const rows: GuestUserRow[] = [];
  const currentUserResult = await supabase.from("users").select(USER_PROFILE_SELECT).eq("id", authUser.id).maybeSingle();
  if (!currentUserResult.error && currentUserResult.data) {
    rows.push(currentUserResult.data as GuestUserRow);
  }

  if (normalizedEmail) {
    const emailResult = await supabase.from("users").select(USER_PROFILE_SELECT).ilike("email", normalizedEmail).limit(20);
    if (!emailResult.error && Array.isArray(emailResult.data)) {
      rows.push(...(emailResult.data as GuestUserRow[]));
    }
  }

  if (phoneVariants.length > 0) {
    const phoneResult = await supabase.from("users").select(USER_PROFILE_SELECT).in("phone", phoneVariants).limit(20);
    if (!phoneResult.error && Array.isArray(phoneResult.data)) {
      rows.push(...(phoneResult.data as GuestUserRow[]));
    }
  }

  return dedupeRows(rows);
}

export function createGuestSessionSnapshot(
  user: GuestSessionSnapshot["user"],
  profile: UserProfileRecord | null
): GuestSessionSnapshot {
  return {
    user,
    profile,
    profileComplete: isGuestProfileComplete(profile),
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

  if (authUser.authKind !== "guest_cookie") {
    const candidateRows = await loadGuestIdentityRows(supabase, authUser);
    const mergedCandidate = mergeGuestProfileCandidates(candidateRows, authUser.id);

    await upsertUserProfileCompatibility(supabase, {
      userId: authUser.id,
      email: normalizeGuestEmail(authUser.email) ?? mergedCandidate?.email ?? null,
      phone: normalizeGuestPhone(authUser.phone) ?? mergedCandidate?.phone ?? null,
      name: mergedCandidate?.name ?? null,
      city: mergedCandidate?.city ?? null,
      state: mergedCandidate?.state ?? null,
      about: mergedCandidate?.about ?? null,
      dob: mergedCandidate?.date_of_birth ?? null,
      gender: mergedCandidate?.gender ?? null,
      avatarUrl: mergedCandidate?.avatar_url ?? null,
    });

    profile = await loadUserProfileCompatibility(supabase, authUser.id);
  }

  return createGuestSessionSnapshot(
    {
      id: authUser.id,
      email: normalizeGuestEmail(authUser.email),
      phone: normalizeGuestPhone(authUser.phone),
      provider: authUser.provider ?? null,
      authKind: authUser.authKind ?? "supabase",
    },
    profile
  );
}
