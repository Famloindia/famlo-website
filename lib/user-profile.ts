import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeGuestEmail, normalizeGuestPhone } from "@/lib/guest-identity";
import { normalizeGuestUsername, validateGuestUsername } from "@/lib/guest-username";

export interface UserProfileRecord {
  id: string;
  username?: string | null;
  name: string | null;
  phone: string | null;
  email: string | null;
  phone_verified_at?: string | null;
  email_verified_at?: string | null;
  profile_completed_at?: string | null;
  pending_email?: string | null;
  pending_email_requested_at?: string | null;
  account_status?: "active" | "linking" | "merged" | "manual_review";
  merged_into_user_id?: string | null;
  merged_at?: string | null;
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
    username: asString(row.username),
    name: asString(row.name),
    phone: normalizeGuestPhone(asString(row.phone)),
    email: normalizeGuestEmail(asString(row.email)),
    phone_verified_at: asString(row.phone_verified_at),
    email_verified_at: asString(row.email_verified_at),
    profile_completed_at: asString(row.profile_completed_at),
    pending_email: normalizeGuestEmail(asString(row.pending_email)),
    pending_email_requested_at: asString(row.pending_email_requested_at),
    account_status:
      row.account_status === "linking" ||
      row.account_status === "merged" ||
      row.account_status === "manual_review"
        ? row.account_status
        : "active",
    merged_into_user_id: asString(row.merged_into_user_id),
    merged_at: asString(row.merged_at),
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
    username: null,
    name: null,
    phone: null,
    email: null,
    phone_verified_at: null,
    email_verified_at: null,
    profile_completed_at: null,
    pending_email: null,
    pending_email_requested_at: null,
    account_status: "active",
    merged_into_user_id: null,
    merged_at: null,
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
  return Boolean(
    (profile.account_status ?? "active") === "active" &&
    profile.username &&
    profile.name &&
    profile.phone &&
    profile.phone_verified_at &&
    profile.email &&
    profile.email_verified_at &&
    profile.city &&
    profile.state &&
    profile.gender &&
    profile.date_of_birth
  );
}

export function getMissingGuestProfileRequirements(
  profile: UserProfileRecord | null | undefined
): string[] {
  if (!profile) return ["Username", "Full name", "Gender", "Date of birth", "City", "State", "Verified email", "Verified phone"];
  const missing: string[] = [];
  if (!profile.username) missing.push("Username");
  if (!profile.name) missing.push("Full name");
  if (!profile.gender) missing.push("Gender");
  if (!profile.date_of_birth) missing.push("Date of birth");
  if (!profile.city) missing.push("City");
  if (!profile.state) missing.push("State");
  if (!profile.email || !profile.email_verified_at) missing.push("Verified email");
  if (!profile.phone || !profile.phone_verified_at) missing.push("Verified phone");
  return missing;
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
    username: base?.username ?? null,
    name: base?.name ?? asString(v2Row?.display_name) ?? null,
    phone: base?.phone ?? normalizeGuestPhone(asString(v2Row?.phone)) ?? null,
    email: base?.email ?? normalizeGuestEmail(asString(v2Row?.email)) ?? null,
    phone_verified_at: base?.phone_verified_at ?? null,
    email_verified_at: base?.email_verified_at ?? null,
    profile_completed_at: base?.profile_completed_at ?? null,
    pending_email: base?.pending_email ?? null,
    pending_email_requested_at: base?.pending_email_requested_at ?? null,
    account_status: base?.account_status ?? "active",
    merged_into_user_id: base?.merged_into_user_id ?? null,
    merged_at: base?.merged_at ?? null,
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
        "id, username, name, phone, email, phone_verified_at, email_verified_at, profile_completed_at, pending_email, pending_email_requested_at, account_status, merged_into_user_id, merged_at, city, state, onboarding_completed, avatar_url, about, date_of_birth, gender, kyc_status, kyc_submitted_at, id_document_url, id_document_type, verification_url, verification_type"
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
  username?: string | null;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  city?: string | null;
  state?: string | null;
  about?: string | null;
  dob?: string | null;
  gender?: string | null;
  avatarUrl?: string | null;
  emailVerifiedAt?: string | null;
  phoneVerifiedAt?: string | null;
};

export type GuestProfileFieldErrors = Partial<
  Record<"avatarUrl" | "username" | "name" | "email" | "phone" | "city" | "state" | "about" | "dob" | "gender", string>
>;

export function validateGuestProfileInput(input: UserProfilePatch): GuestProfileFieldErrors {
  return validateGuestProfileFields(input, true);
}

export function validateGuestProfileDetailsInput(input: UserProfilePatch): GuestProfileFieldErrors {
  return validateGuestProfileFields(input, false);
}

function validateGuestProfileFields(
  input: UserProfilePatch,
  requireContacts: boolean
): GuestProfileFieldErrors {
  const errors: GuestProfileFieldErrors = {};
  const username = normalizeGuestUsername(input.username);
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const email = typeof input.email === "string" ? input.email.trim() : "";
  const phone = typeof input.phone === "string" ? input.phone.trim() : "";
  const city = typeof input.city === "string" ? input.city.trim() : "";
  const state = typeof input.state === "string" ? input.state.trim() : "";
  const about = typeof input.about === "string" ? input.about.trim() : "";
  const dob = typeof input.dob === "string" ? input.dob.trim() : "";
  const gender = typeof input.gender === "string" ? input.gender.trim() : "";

  const usernameError = validateGuestUsername(username);
  if (usernameError) errors.username = usernameError;
  if (name.length < 2 || name.length > 100) errors.name = "Enter your full name.";
  if (requireContacts && !email) errors.email = "Add your email address.";
  if (requireContacts && !phone) errors.phone = "Add your phone number.";
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = "Enter a valid email address.";
  if (phone && !normalizeGuestPhone(phone)) errors.phone = "Enter a valid phone number.";
  if (!city || city.length > 100) errors.city = "Enter your city.";
  if (!state || state.length > 100) errors.state = "Enter your state.";
  if (about.length > 2000) errors.about = "About you must be 2,000 characters or fewer.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob) || Number.isNaN(Date.parse(`${dob}T00:00:00Z`))) {
    errors.dob = "Enter a valid date of birth.";
  } else if (dob > new Date().toISOString().slice(0, 10)) {
    errors.dob = "Date of birth cannot be in the future.";
  }
  if (!["female", "male", "non_binary", "prefer_not_to_say"].includes(gender)) {
    errors.gender = "Select a gender option.";
  }

  return errors;
}

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
    username: preserveExistingValue(
      typeof patch.username === "string" ? normalizeGuestUsername(patch.username) : patch.username,
      base.username ?? null
    ),
    name: preserveExistingValue(patch.name, base.name),
    phone: normalizeGuestPhone(patch.phone) ?? base.phone,
    email: normalizeGuestEmail(patch.email) ?? base.email,
    city: preserveExistingValue(patch.city, base.city),
    state: preserveExistingValue(patch.state, base.state),
    about: preserveExistingValue(patch.about, base.about),
    date_of_birth: preserveExistingValue(patch.dob, base.date_of_birth),
    gender: preserveExistingValue(patch.gender, base.gender),
    avatar_url: preserveExistingValue(patch.avatarUrl, base.avatar_url),
    email_verified_at:
      patch.emailVerifiedAt !== undefined
        ? patch.emailVerifiedAt
        : normalizeGuestEmail(patch.email) === base.email
          ? base.email_verified_at
          : null,
    phone_verified_at:
      patch.phoneVerifiedAt !== undefined
        ? patch.phoneVerifiedAt
        : normalizeGuestPhone(patch.phone) === base.phone
          ? base.phone_verified_at
          : null,
  };

  merged.onboarding_completed = isGuestProfileComplete(merged);
  merged.profile_completed_at = merged.onboarding_completed
    ? base.profile_completed_at ?? new Date().toISOString()
    : null;
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
    username: mergedProfile.username,
    name: mergedProfile.name,
    city: mergedProfile.city,
    state: mergedProfile.state,
    about: mergedProfile.about,
    date_of_birth: mergedProfile.date_of_birth,
    gender: mergedProfile.gender,
    avatar_url: normalizedAvatarUrl,
    email_verified_at: mergedProfile.email_verified_at,
    phone_verified_at: mergedProfile.phone_verified_at,
    profile_completed_at: mergedProfile.profile_completed_at,
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

export async function updateUserProfileAvatarCompatibility(
  supabase: SupabaseClient,
  userId: string,
  avatarUrl: string
): Promise<UserProfileRecord | null> {
  const existingProfile = await loadUserProfileCompatibility(supabase, userId);
  const previousAvatarUrl = existingProfile?.avatar_url ?? null;
  const updatedAt = new Date().toISOString();
  let v2Updated = false;

  const { error: v2Error } = await supabase.from("user_profiles_v2").upsert(
    {
      user_id: userId,
      avatar_url: avatarUrl,
      updated_at: updatedAt,
    },
    { onConflict: "user_id" }
  );

  if (v2Error) {
    const message = v2Error.message.toLowerCase();
    const isMissingTable =
      message.includes("does not exist") || message.includes("relation") || message.includes("schema cache");
    if (!isMissingTable) throw v2Error;
  } else {
    v2Updated = true;
  }

  const { error: userError } = await supabase.from("users").upsert(
    {
      id: userId,
      email: existingProfile?.email ?? null,
      phone: existingProfile?.phone ?? null,
      avatar_url: avatarUrl,
      updated_at: updatedAt,
    } as never,
    { onConflict: "id" }
  );

  if (userError) {
    if (v2Updated) {
      await supabase
        .from("user_profiles_v2")
        .update({ avatar_url: previousAvatarUrl, updated_at: new Date().toISOString() })
        .eq("user_id", userId);
    }
    throw userError;
  }

  return loadUserProfileCompatibility(supabase, userId);
}
