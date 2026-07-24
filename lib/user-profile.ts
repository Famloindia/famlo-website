import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeGuestEmail, normalizeGuestPhone } from "@/lib/guest-identity";

export interface UserProfileRecord {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  state: string | null;
  onboarding_completed: boolean;
  avatar_url: string | null;
  about: string | null;
  date_of_birth: string | null;
  gender: string | null;
  kyc_status: string | null;
  kyc_submitted_at?: string | null;
  id_document_url: string | null;
  id_document_type: string | null;
  last_lat?: number | null;
  last_lng?: number | null;
  last_location_label?: string | null;
}

type JsonRecord = Record<string, unknown>;

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function asBoolean(value: unknown): boolean {
  return Boolean(value);
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function mapLegacyUserRow(userId: string, row: JsonRecord | null): UserProfileRecord | null {
  if (!row) return null;

  return {
    id: userId,
    name: asString(row.name),
    phone: normalizeGuestPhone(asString(row.phone)),
    email: normalizeGuestEmail(asString(row.email)),
    city: asString(row.city),
    state: asString(row.state),
    onboarding_completed: asBoolean(row.onboarding_completed),
    avatar_url: asString(row.avatar_url),
    about: asString(row.about),
    date_of_birth: asString(row.date_of_birth),
    gender: asString(row.gender),
    kyc_status: asString(row.kyc_status),
    kyc_submitted_at: asString(row.kyc_submitted_at),
    id_document_url: asString(row.id_document_url) ?? asString(row.verification_url),
    id_document_type: asString(row.id_document_type) ?? asString(row.verification_type),
  };
}

export function createEmptyUserProfile(userId: string): UserProfileRecord {
  return {
    id: userId,
    name: null,
    phone: null,
    email: null,
    city: null,
    state: null,
    onboarding_completed: false,
    avatar_url: null,
    about: null,
    date_of_birth: null,
    gender: null,
    kyc_status: null,
    id_document_url: null,
    id_document_type: null,
  };
}

export function isGuestProfileComplete(profile: UserProfileRecord | null | undefined): boolean {
  if (!profile) return false;
  const hasContact = Boolean(profile.phone || profile.email);
  return Boolean(
    profile.name &&
    profile.city &&
    profile.state &&
    profile.gender &&
    profile.date_of_birth &&
    profile.about &&
    hasContact
  );
}

export function hasGuestVerificationSubmission(profile: UserProfileRecord | null | undefined): boolean {
  if (!profile) return false;
  if (profile.kyc_status && ["pending", "verified", "auto_verified", "pending_review"].includes(profile.kyc_status)) {
    return true;
  }
  if (profile.kyc_submitted_at) return true;
  if (profile.id_document_url) return true;
  return false;
}

function mergeUserProfile(
  userId: string,
  legacyRow: JsonRecord | null,
  v2Row: JsonRecord | null
): UserProfileRecord | null {
  const base = mapLegacyUserRow(userId, legacyRow);
  if (!base && !v2Row) return null;

  return {
    id: userId,
    name: base?.name ?? asString(v2Row?.display_name) ?? null,
    phone: base?.phone ?? normalizeGuestPhone(asString(v2Row?.phone)) ?? null,
    email: base?.email ?? normalizeGuestEmail(asString(v2Row?.email)) ?? null,
    city: base?.city ?? asString(v2Row?.home_city) ?? null,
    state: base?.state ?? asString(v2Row?.home_state) ?? null,
    onboarding_completed: Boolean(base?.onboarding_completed) || isGuestProfileComplete(base),
    avatar_url: base?.avatar_url ?? asString(v2Row?.avatar_url) ?? null,
    about: base?.about ?? asString(v2Row?.bio) ?? null,
    date_of_birth: base?.date_of_birth ?? asString(v2Row?.date_of_birth) ?? null,
    gender: base?.gender ?? asString(v2Row?.gender) ?? null,
    kyc_status: base?.kyc_status ?? null,
    id_document_url: base?.id_document_url ?? null,
    id_document_type: base?.id_document_type ?? null,
    last_lat: asNumber(v2Row?.last_lat),
    last_lng: asNumber(v2Row?.last_lng),
    last_location_label: asString(v2Row?.last_location_label),
  };
}

export async function loadUserProfileCompatibility(
  supabase: SupabaseClient,
  userId: string
): Promise<UserProfileRecord | null> {
  const [legacyResult, v2Result] = await Promise.all([
    supabase
      .from("users")
      .select(
        "id, name, phone, email, city, state, onboarding_completed, avatar_url, about, date_of_birth, gender, kyc_status, kyc_submitted_at, id_document_url, id_document_type, verification_url, verification_type"
      )
      .eq("id", userId)
      .maybeSingle(),
    supabase
      .from("user_profiles_v2")
      .select(
        "user_id, display_name, avatar_url, phone, email, date_of_birth, gender, bio, home_city, home_state, last_lat, last_lng, last_location_label"
      )
      .eq("user_id", userId)
      .maybeSingle()
  ]);

  const legacyRow = legacyResult.error ? null : (legacyResult.data as JsonRecord | null);
  const v2Row = v2Result.error ? null : (v2Result.data as JsonRecord | null);

  return mergeUserProfile(userId, legacyRow, v2Row);
}

type UserProfilePatch = {
  userId: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  city?: string | null;
  state?: string | null;
  about?: string | null;
  dob?: string | null;
  gender?: string | null;
  avatarUrl?: string | null;
};

function preserveExistingValue(incoming: string | null | undefined, existing: string | null): string | null {
  if (typeof incoming !== "string") {
    return existing;
  }

  const trimmed = incoming.trim();
  return trimmed.length > 0 ? trimmed : existing;
}

export function mergeUserProfilePatch(
  existing: UserProfileRecord | null,
  patch: UserProfilePatch
): UserProfileRecord {
  const base = existing ?? createEmptyUserProfile(patch.userId);
  const merged: UserProfileRecord = {
    ...base,
    id: patch.userId,
    name: preserveExistingValue(patch.name, base.name),
    phone: normalizeGuestPhone(patch.phone) ?? base.phone,
    email: normalizeGuestEmail(patch.email) ?? base.email,
    city: preserveExistingValue(patch.city, base.city),
    state: preserveExistingValue(patch.state, base.state),
    about: preserveExistingValue(patch.about, base.about),
    date_of_birth: preserveExistingValue(patch.dob, base.date_of_birth),
    gender: preserveExistingValue(patch.gender, base.gender),
    avatar_url: preserveExistingValue(patch.avatarUrl, base.avatar_url),
  };

  merged.onboarding_completed = isGuestProfileComplete(merged);
  return merged;
}

export async function upsertUserProfileCompatibility(
  supabase: SupabaseClient,
  params: UserProfilePatch
): Promise<UserProfileRecord | null> {
  const existingProfile = await loadUserProfileCompatibility(supabase, params.userId);
  const mergedProfile = mergeUserProfilePatch(existingProfile, params);
  const normalizedAvatarUrl =
    typeof mergedProfile.avatar_url === "string" && mergedProfile.avatar_url.trim().length > 0
      ? mergedProfile.avatar_url.trim()
      : null;

  const userUpdate: Record<string, unknown> = {
    name: mergedProfile.name,
    city: mergedProfile.city,
    state: mergedProfile.state,
    about: mergedProfile.about,
    date_of_birth: mergedProfile.date_of_birth,
    gender: mergedProfile.gender,
    avatar_url: normalizedAvatarUrl,
    onboarding_completed: mergedProfile.onboarding_completed,
    updated_at: new Date().toISOString(),
  };

  const { error: updateError } = await supabase.from("users").upsert(
    {
      id: params.userId,
      email: mergedProfile.email,
      phone: mergedProfile.phone,
      ...userUpdate,
    } as never,
    { onConflict: "id" }
  );

  if (updateError) {
    const message = updateError.message.toLowerCase();
    const isPolicyBlocked =
      message.includes("row-level security") ||
      message.includes("permission denied") ||
      message.includes("violates row-level security");

    if (!isPolicyBlocked) {
      throw updateError;
    }
  }

  const { error: upsertV2Error } = await supabase.from("user_profiles_v2").upsert(
    {
      user_id: params.userId,
      display_name: mergedProfile.name,
      phone: mergedProfile.phone,
      home_city: mergedProfile.city,
      home_state: mergedProfile.state,
      bio: mergedProfile.about,
      date_of_birth: mergedProfile.date_of_birth,
      gender: mergedProfile.gender,
      avatar_url: normalizedAvatarUrl,
      updated_at: new Date().toISOString(),
      email: mergedProfile.email,
    },
    { onConflict: "user_id" }
  );

  if (upsertV2Error) {
    const message = upsertV2Error.message.toLowerCase();
    const isMissingTable =
      message.includes("does not exist") || message.includes("relation") || message.includes("schema cache");

    if (!isMissingTable) {
      throw upsertV2Error;
    }
  }

  return loadUserProfileCompatibility(supabase, params.userId);
}
