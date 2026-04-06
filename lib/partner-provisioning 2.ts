import type { SupabaseClient } from "@supabase/supabase-js";

import type { AppUser, ApprovalCredentials, FamilyApplication, FamilyProfile } from "./types";

function generateTemporaryPassword(length = 14): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  return Array.from({ length }, () =>
    alphabet.charAt(Math.floor(Math.random() * alphabet.length))
  ).join("");
}

function generateProfileCode(prefix: "FAM"): string {
  const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${prefix}-${suffix}`;
}

async function findExistingUserByEmail(supabase: SupabaseClient, email: string): Promise<AppUser | null> {
  const { data, error } = await supabase.from("users").select("*").eq("email", email).maybeSingle();
  if (error) throw error;
  return (data as AppUser | null) ?? null;
}

async function findExistingAuthUserIdByEmail(supabase: SupabaseClient, email: string): Promise<string | null> {
  const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw error;
  return data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase())?.id ?? null;
}

async function ensurePublicUser(supabase: SupabaseClient, user: AppUser): Promise<void> {
  const { error } = await supabase.from("users").upsert({
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    city: user.city,
    state: user.state,
    about: user.about,
    avatar_url: user.avatar_url,
    role: user.role,
    onboarding_completed: user.onboarding_completed
  } as never);
  if (error) throw error;
}

async function ensureFamilyProfile(
  supabase: SupabaseClient,
  application: FamilyApplication,
  userId: string,
  password: string | null
): Promise<{ profileId: string | null; profileCode: string | null }> {
  const { data: existing, error: existingError } = await supabase
    .from("families")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (existingError) throw existingError;

  const profileCode = (existing as FamilyProfile | null)?.host_id ?? generateProfileCode("FAM");
  const payload = {
    user_id: userId,
    host_id: profileCode,
    name: application.property_name,
    village: application.village,
    city: application.village,
    state: application.state,
    description: application.about_family,
    about: application.about_family,
    max_guests: application.max_guests,
    is_verified: true,
    is_active: true,
    is_accepting: true,
    family_type: "cultural",
    languages: application.languages,
    password,
    host_password: password,
    host_phone: application.whatsapp_number || application.phone,
    google_maps_link: application.google_maps_link,
    lat: application.latitude,
    lng: application.longitude
  };

  if (existing) {
    const { error } = await supabase.from("families").update(payload as never).eq("id", (existing as FamilyProfile).id);
    if (error) throw error;
    return { profileId: (existing as FamilyProfile).id, profileCode };
  }

  const { data, error } = await supabase.from("families").insert(payload as never).select("id, host_id").single();
  if (error) throw error;
  return {
    profileId: (data as { id: string; host_id: string | null }).id,
    profileCode: (data as { id: string; host_id: string | null }).host_id
  };
}

export async function provisionFamilyFromApplication(
  supabase: SupabaseClient,
  application: FamilyApplication
): Promise<ApprovalCredentials> {
  const existingUser = await findExistingUserByEmail(supabase, application.email);
  const existingAuthUserId = await findExistingAuthUserIdByEmail(supabase, application.email);
  let userId = existingUser?.id ?? "";
  let generatedPassword: string | null = null;
  let accountCreated = false;

  if (!existingUser && existingAuthUserId) {
    userId = existingAuthUserId;
  } else if (!existingUser) {
    generatedPassword = generateTemporaryPassword();
    const { data, error } = await supabase.auth.admin.createUser({
      email: application.email,
      password: generatedPassword,
      email_confirm: true,
      user_metadata: { role: "family", source: "famlo-home-onboarding" }
    });
    if (error || !data.user) throw error ?? new Error("Unable to create auth user.");
    userId = data.user.id;
    accountCreated = true;
  } else {
    userId = existingUser.id;
  }

  await ensurePublicUser(supabase, {
    id: userId,
    name: application.full_name,
    email: application.email,
    phone: application.phone,
    city: application.village,
    state: application.state,
    about: application.about_family,
    avatar_url: application.photo_url,
    role: "family",
    onboarding_completed: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  });

  const profile = await ensureFamilyProfile(supabase, application, userId, generatedPassword);

  return {
    email: application.email,
    user_id: userId,
    password: generatedPassword,
    account_created: accountCreated,
    profile_type: "family",
    profile_id: profile.profileId,
    profile_code: profile.profileCode
  };
}
