import type { SupabaseClient } from "@supabase/supabase-js";

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
    phone: asString(row.phone),
    email: asString(row.email),
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

export function isGuestProfileComplete(profile: UserProfileRecord | null | undefined): boolean {
  if (!profile) return false;
  if (profile.onboarding_completed) return true;
  return Boolean(profile.name && profile.city && profile.state);
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
    name: asString(v2Row?.display_name) ?? base?.name ?? null,
    phone: asString(v2Row?.phone) ?? base?.phone ?? null,
    email: asString(v2Row?.email) ?? base?.email ?? null,
    city: asString(v2Row?.home_city) ?? base?.city ?? null,
    state: asString(v2Row?.home_state) ?? base?.state ?? null,
    onboarding_completed:
      Boolean(base?.onboarding_completed) ||
      Boolean(asString(v2Row?.display_name) && asString(v2Row?.home_city) && asString(v2Row?.home_state)),
    avatar_url: asString(v2Row?.avatar_url) ?? base?.avatar_url ?? null,
    about: asString(v2Row?.bio) ?? base?.about ?? null,
    date_of_birth: asString(v2Row?.date_of_birth) ?? base?.date_of_birth ?? null,
    gender: asString(v2Row?.gender) ?? base?.gender ?? null,
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

export async function upsertUserProfileCompatibility(
  supabase: SupabaseClient,
  params: {
    userId: string;
    name: string;
    email?: string | null;
    phone?: string | null;
    city?: string | null;
    state?: string | null;
    about?: string | null;
    dob?: string | null;
    gender?: string | null;
    avatarUrl?: string | null;
  }
): Promise<void> {
  const { userId, name, email, phone, city, state, about, dob, gender, avatarUrl } = params;
  const hasEmailUpdate = typeof email === "string" && email.trim().length > 0;
  const hasPhoneUpdate = typeof phone === "string" && phone.trim().length > 0;
  const normalizedAvatarUrl = typeof avatarUrl === "string" && avatarUrl.trim().length > 0 ? avatarUrl.trim() : null;

  const userUpdate: Record<string, unknown> = {
    name,
    city,
    state,
    about,
    date_of_birth: dob,
    gender,
    avatar_url: normalizedAvatarUrl,
    onboarding_completed: true,
    updated_at: new Date().toISOString(),
  };

  if (hasEmailUpdate) {
    userUpdate.email = email.trim();
  }

  if (hasPhoneUpdate) {
    userUpdate.phone = phone.trim();
  }

  const { error: updateError } = await supabase.from("users").upsert(
    {
      id: userId,
      ...(hasEmailUpdate ? { email: email!.trim() } : {}),
      ...(hasPhoneUpdate ? { phone: phone!.trim() } : {}),
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
      user_id: userId,
      display_name: name,
      phone: hasPhoneUpdate ? phone!.trim() : null,
      home_city: city ?? null,
      home_state: state ?? null,
      bio: about ?? null,
      date_of_birth: dob ?? null,
      gender: gender ?? null,
      avatar_url: normalizedAvatarUrl,
      updated_at: new Date().toISOString(),
      ...(hasEmailUpdate ? { email: email.trim() } : {}),
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
}
