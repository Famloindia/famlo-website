import { type SupabaseClient } from "@supabase/supabase-js";

import { serializeHostListingMeta } from "@/lib/host-listing-meta";
import { maskCoordinates } from "@/lib/location-utils";
import { syncPrimaryStayUnitForFamily } from "@/lib/stay-units";

type JsonRecord = Record<string, unknown>;

export interface FamilyApprovalCredentials {
  email: string;
  user_id: string;
  password: string | null;
  account_created: boolean;
  profile_type: "family";
  profile_id: string | null;
  profile_code: string | null;
}

export interface HostProfileSyncResult {
  hostId: string | null;
  legacyFamilyId: string | null;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNullableString(value: unknown): string | null {
  const next = asString(value);
  return next.length > 0 ? next : null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

function asExperienceCards(value: unknown): Array<{ title: string; description: string }> {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const next = pickObject(item);
      const title = asString(next.title);
      const description = asString(next.description);
      if (!title || !description) return null;
      return { title, description };
    })
    .filter((item): item is { title: string; description: string } => Boolean(item));
}

function asNullableNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function splitList(value: unknown): string[] {
  if (Array.isArray(value)) return asStringArray(value);
  if (typeof value !== "string") return [];

  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function pickObject(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function buildFamilyPhotoUrls(source: JsonRecord): string[] {
  const directImages = asStringArray(source.images);
  const photoUrls = asStringArray(source.photo_urls);
  const payloadPhotos = asStringArray(pickObject(source.payload).photos);
  const fallbackPhoto = asString(source.photo_url);

  const merged = [...directImages, ...photoUrls, ...payloadPhotos];
  if (fallbackPhoto) merged.push(fallbackPhoto);

  return Array.from(new Set(merged.filter(Boolean)));
}

function buildHostGalleryUrls(source: JsonRecord): string[] {
  const directImages = asStringArray(source.host_gallery_photos);
  const payloadGallery = asStringArray(pickObject(source.payload).hostGalleryPhotos);
  const photoUrls = asStringArray(source.images);
  const fallbackPhoto = asString(source.host_photo_url) || asString(source.photo_url);

  const merged = [...directImages, ...payloadGallery, ...photoUrls];
  if (fallbackPhoto) merged.push(fallbackPhoto);

  return Array.from(new Set(merged.filter(Boolean)));
}

function buildApplicationDraft(source: JsonRecord): JsonRecord {
  const payload = pickObject(source.payload);

  return {
    ...source,
    ...payload,
    fullName: asString(source.primary_host_name) || asString(payload.fullName),
    propertyName:
      asString(source.property_name) ||
      asString(payload.propertyName) ||
      `${asString(source.primary_host_name) || asString(payload.fullName) || "Famlo"}'s Home`,
    hostBio: asString(source.host_bio) || asString(payload.hostBio),
    culturalActivity:
      asString(source.famlo_experience) ||
      asString(payload.culturalActivity) ||
      asString(payload.famloExperience),
    hostPhoto:
      asString(source.host_photo_url) ||
      asString(payload.hostPhoto) ||
      asString(source.photo_url),
    rooms: Array.isArray(payload.rooms)
      ? payload.rooms
      : Array.isArray(source.rooms)
        ? source.rooms
        : [],
    languages:
      asStringArray(source.languages_spoken).length > 0
        ? asStringArray(source.languages_spoken)
        : asStringArray(payload.languagesSpoken).length > 0
          ? asStringArray(payload.languagesSpoken)
          : splitList(payload.languages),
    amenities:
      asStringArray(source.amenities).length > 0
        ? asStringArray(source.amenities)
        : asStringArray(payload.amenities),
    commonAreas:
      asStringArray(source.common_areas).length > 0
        ? asStringArray(source.common_areas)
        : asStringArray(payload.commonAreas),
    includedItems: splitList(payload.includedItems),
    houseRules:
      splitList(payload.customRules).length > 0
        ? splitList(payload.customRules)
        : (() => {
            const houseRules = pickObject(payload.houseRules);
            const next: string[] = [];
            if (houseRules.smoking === false) next.push("No smoking");
            if (houseRules.alcohol === false) next.push("No alcohol");
            if (houseRules.pets === false) next.push("No pets");
            if (asString(houseRules.quietHours)) next.push(`Quiet hours: ${asString(houseRules.quietHours)}`);
            if (asString(houseRules.custom)) next.push(asString(houseRules.custom));
            return next;
          })(),
    images: buildFamilyPhotoUrls(source),
    city:
      asString(source.city_name) ||
      asString(source.city) ||
      asString(payload.city) ||
      asString(source.city_neighbourhood) ||
      asString(payload.areaName),
    village:
      asString(source.village_name) ||
      asString(source.village) ||
      asString(payload.villageName) ||
      asString(payload.cityNeighbourhood) ||
      asString(payload.areaName),
    state: asString(source.state) || asString(payload.state),
    streetAddress:
      asString(source.street_address) ||
      asString(payload.streetAddress) ||
      asString(payload.propertyAddress),
    country: asString(source.country) || asString(payload.country) || "India",
    maxGuests:
      asNullableNumber(source.max_guests) ??
      asNullableNumber(payload.maxGuests) ??
      4,
    priceMorning:
      asNullableNumber(source.price_morning) ??
      asNullableNumber(payload.morningRate),
    priceAfternoon:
      asNullableNumber(source.price_afternoon) ??
      asNullableNumber(payload.afternoonRate),
    priceEvening:
      asNullableNumber(source.price_evening) ??
      asNullableNumber(payload.eveningRate),
    priceFullday:
      asNullableNumber(source.price_fullday) ??
      asNullableNumber(payload.priceFullday) ??
      asNullableNumber(payload.fullDayRate) ??
      asNullableNumber(payload.baseNightlyRate),
    googleMapsLink:
      asString(source.google_maps_link) ||
      asString(payload.googleMapsLink),
    latitude: asNullableNumber(source.latitude) ?? asNullableNumber(payload.latitude),
    longitude: asNullableNumber(source.longitude) ?? asNullableNumber(payload.longitude),
    bathroomType:
      asString(source.bathroom_type) ||
      asString(payload.bathroomType),
    familyComposition:
      asString(source.family_composition) ||
      asString(payload.familyComposition),
    upiId:
      asString(source.upi_id) ||
      asString(payload.upiId),
    bankAccountHolderName:
      asString(source.bank_account_holder_name) ||
      asString(payload.accountHolderName),
    bankAccountNumber:
      asString(source.bank_account_number) ||
      asString(payload.accountNumber),
    ifscCode:
      asString(source.ifsc_code) ||
      asString(payload.ifscCode),
    bankName:
      asString(source.bank_name) ||
      asString(payload.bankName),
    mobileNumber:
      asString(source.mobile_number) ||
      asString(payload.mobileNumber),
    email:
      asString(source.email) ||
      asString(payload.email),
    password: asString(source.password),
    latExact: asNullableNumber(source.lat_exact) ?? asNullableNumber(payload.latExact),
    lngExact: asNullableNumber(source.lng_exact) ?? asNullableNumber(payload.lngExact),
    landmarks: Array.isArray(source.landmarks) ? source.landmarks : Array.isArray(payload.landmarks) ? payload.landmarks : [],
    neighborhoodDesc: asString(source.neighborhood_desc) || asString(payload.neighborhoodDesc),
    accessibilityDesc: asString(source.accessibility_desc) || asString(payload.accessibilityDesc),
    pincode: asString(source.pincode) || asString(payload.pincode),
    panCardUrl: asString(source.pan_card_url) || asString(payload.panCardUrl),
    panHolderName: asString(source.pan_holder_name) || asString(payload.panHolderName),
    panDateOfBirth: asString(source.pan_date_of_birth) || asString(payload.panDateOfBirth),
    panMasked: asString(source.pan_masked) || asString(payload.panMasked),
    panLastFour: asString(source.pan_last_four) || asString(payload.panLastFour),
    panVerificationStatus: asString(source.pan_verification_status) || asString(payload.panVerificationStatus),
    panVerificationProvider: asString(source.pan_verification_provider) || asString(payload.panVerificationProvider),
  };
}

export function generateTemporaryPassword(length = 14): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  return Array.from({ length }, () => alphabet.charAt(Math.floor(Math.random() * alphabet.length))).join("");
}

async function generateUniqueFamilyCode(supabase: SupabaseClient): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
    const candidate = `FAM-${suffix}`;
    const { data, error } = await supabase
      .from("families")
      .select("id")
      .eq("host_id", candidate)
      .maybeSingle();

    if (error) throw error;
    if (!data) return candidate;
  }

  throw new Error("Unable to generate a unique host code. Please try approval again.");
}

async function findExistingPublicUserByEmail(
  supabase: SupabaseClient,
  email: string
): Promise<JsonRecord | null> {
  const { data, error } = await supabase.from("users").select("*").eq("email", email).maybeSingle();
  if (error) throw error;
  return (data as JsonRecord | null) ?? null;
}

async function findExistingAuthUserIdByEmail(
  supabase: SupabaseClient,
  email: string
): Promise<string | null> {
  const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw error;
  return data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase())?.id ?? null;
}

async function ensurePublicUser(supabase: SupabaseClient, payload: JsonRecord): Promise<void> {
  const { error } = await supabase.from("users").upsert(payload as never);
  if (error) throw error;
}

async function ensureFamilyProfile(
  supabase: SupabaseClient,
  application: JsonRecord,
  userId: string,
  password: string | null
): Promise<{ profileId: string | null; profileCode: string | null }> {
  const linkedFamilyId =
    asString(application.approved_family_id) ||
    asString(application.family_id) ||
    asString(application.legacy_family_id);

  let existing: JsonRecord | null = null;

  if (linkedFamilyId) {
    const { data: linkedFamily, error: linkedFamilyError } = await supabase
      .from("families")
      .select("id,host_id,is_active,is_accepting,email,created_at")
      .eq("id", linkedFamilyId)
      .maybeSingle();

    if (linkedFamilyError) throw linkedFamilyError;
    existing = (linkedFamily as JsonRecord | null) ?? null;
  }

  const profileCode =
    existing && typeof existing.host_id === "string"
      ? existing.host_id
      : await generateUniqueFamilyCode(supabase);

  const photoUrls = buildFamilyPhotoUrls(application);
  const listingTitle = asString(application.propertyName);
  const hostBio = asString(application.hostBio);
  const exactLat = asNullableNumber(application.latExact) ?? asNullableNumber(application.latitude);
  const exactLng = asNullableNumber(application.lngExact) ?? asNullableNumber(application.longitude);
  const publicCoords =
    exactLat != null && exactLng != null
      ? maskCoordinates(exactLat, exactLng, String(existing?.id ?? userId ?? profileCode))
      : null;
  const familyMeta = serializeHostListingMeta({
    famloExperienceCards: asExperienceCards(application.famloExperienceCards),
    famloExperiencePresetIds: asStringArray(application.famloExperiencePresetIds),
    complianceNote: asNullableString(application.complianceNotes) ?? undefined,
    familyComposition: asString(application.familyComposition) || undefined,
    culturalOffering: asString(application.culturalActivity) || undefined,
    bathroomType: asString(application.bathroomType) || undefined,
    propertyAddress: asString(application.streetAddress) || undefined,
    neighbourhood: asString(application.village) || undefined,
    listingTitle: listingTitle || undefined,
    amenities: asStringArray(application.amenities),
    commonAreas: asStringArray(application.commonAreas),
    includedItems: asStringArray(application.includedItems),
    houseRules: asStringArray(application.houseRules),
    photoUrls,
    hostSelfieUrl: asNullableString(application.hostPhoto) ?? undefined,
    hostDisplayName: asNullableString(application.fullName) ?? undefined,
    hostHobbies: asNullableString(application.hostProfession) ?? undefined,
    googleMapsLink: asNullableString(application.googleMapsLink) ?? undefined,
    idDocumentType: asNullableString(application.idDocumentType) ?? undefined,
    idDocumentUrl:
      asNullableString(application.idDocumentUrl) ??
      asNullableString(application.idDocumentPhotoUrl) ??
      undefined,
    liveSelfieUrl: asNullableString(application.liveSelfieUrl) ?? undefined,
    panCardUrl: asNullableString(application.panCardUrl) ?? undefined,
    panMasked: asNullableString(application.panMasked) ?? undefined,
    panLastFour: asNullableString(application.panLastFour) ?? undefined,
    panHolderName: asNullableString(application.panHolderName) ?? undefined,
    panDateOfBirth: asNullableString(application.panDateOfBirth) ?? undefined,
    panVerificationStatus: asNullableString(application.panVerificationStatus) ?? undefined,
    panVerificationProvider: asNullableString(application.panVerificationProvider) ?? undefined,
    propertyOwnershipUrl: asNullableString(application.propertyOwnershipProofUrl) ?? undefined,
    landmarks: Array.isArray(application.landmarks) ? application.landmarks : undefined,
    neighborhoodDesc: asNullableString(application.neighborhoodDesc) ?? undefined,
    accessibilityDesc: asNullableString(application.accessibilityDesc) ?? undefined,
    pincode: asNullableString(application.pincode) ?? undefined,
  });

  const payload: JsonRecord = {
    user_id: userId,
    host_id: profileCode,
    name: listingTitle || "Famlo Home",
    email: asString(application.email),
    street_address: asNullableString(application.streetAddress),
    city: asNullableString(application.city),
    state: asNullableString(application.state),
    village: asNullableString(application.village),
    country: asNullableString(application.country),
    family_composition: asNullableString(application.familyComposition),
    about: hostBio || null,
    description: hostBio || null,
    languages_spoken: asStringArray(application.languages),
    languages: asStringArray(application.languages),
    famlo_experience: asNullableString(application.culturalActivity),
    images: photoUrls,
    bathroom_type: asNullableString(application.bathroomType),
    common_areas: asStringArray(application.commonAreas),
    amenities: asStringArray(application.amenities),
    bank_account_holder_name: asNullableString(application.bankAccountHolderName),
    bank_account_number: asNullableString(application.bankAccountNumber),
    ifsc_code: asNullableString(application.ifscCode),
    bank_name: asNullableString(application.bankName),
    upi_id: asNullableString(application.upiId),
    password,
    host_password: password,
    host_photo_url:
      asNullableString(application.host_photo_url) ||
      asNullableString(application.hostPhoto),
    host_phone: asNullableString(application.mobileNumber),
    lat: publicCoords?.lat ?? null,
    lng: publicCoords?.lng ?? null,
    lat_exact: exactLat,
    lng_exact: exactLng,
    landmarks: application.landmarks || [],
    neighborhood_desc: asNullableString(application.neighborhoodDesc),
    accessibility_desc: asNullableString(application.accessibilityDesc),
    pincode: asNullableString(application.pincode),
    google_maps_link: asNullableString(application.googleMapsLink),
    max_guests: asNullableNumber(application.maxGuests),
    price_morning: asNullableNumber(application.priceMorning),
    price_afternoon: asNullableNumber(application.priceAfternoon),
    price_evening: asNullableNumber(application.priceEvening),
    price_fullday: asNullableNumber(application.priceFullday),
    is_verified: true,
    is_active:
      existing && typeof existing.is_active === "boolean"
        ? existing.is_active
        : true,
    is_accepting:
      existing && typeof existing.is_accepting === "boolean"
        ? existing.is_accepting
        : true,
    family_type: "cultural",
    admin_notes: familyMeta,
  };

  let profileId: string | null = null;
  if (existing && typeof existing.id === "string") {
    const { error } = await supabase.from("families").update(payload as never).eq("id", existing.id);
    if (error) throw error;
    profileId = existing.id;
  } else {
    const { data, error } = await supabase
      .from("families")
      .insert(payload as never)
      .select("id,host_id")
      .single();

    if (error) throw error;
    profileId = typeof data.id === "string" ? data.id : null;
  }

  return { profileId, profileCode };
}

export async function ensureHostProfileForFamily(
  supabase: SupabaseClient,
  familyId: string,
  application?: JsonRecord
): Promise<HostProfileSyncResult> {
  const normalizedFamilyId = asString(familyId);
  if (!normalizedFamilyId) {
    return { hostId: null, legacyFamilyId: null };
  }

  const { data: family, error: familyError } = await supabase
    .from("families")
    .select("*")
    .eq("id", normalizedFamilyId)
    .maybeSingle();

  if (familyError) throw familyError;
  if (!family) {
    return { hostId: null, legacyFamilyId: normalizedFamilyId };
  }

  const { data: existingHost, error: existingHostError } = await supabase
    .from("hosts")
    .select("id")
    .eq("legacy_family_id", normalizedFamilyId)
    .maybeSingle();

  if (existingHostError) throw existingHostError;

  const displayName = asString(family.name) || "Famlo Home";
  const hostStatus =
    family.is_active === true
      ? "published"
      : family.is_verified === true
        ? "paused"
        : "draft";
  const now = new Date().toISOString();

  const hostPayload: JsonRecord = {
    user_id: asNullableString(family.user_id),
    legacy_family_id: normalizedFamilyId,
    status: hostStatus,
    display_name: displayName,
    city: asNullableString(family.city),
    state: asNullableString(family.state),
    locality: asNullableString(family.village),
    address_private: asNullableString(family.street_address),
    lat: asNullableNumber(family.lat),
    lng: asNullableNumber(family.lng),
    about: asNullableString(family.about) ?? asNullableString(family.description),
    family_story: asNullableString(family.famlo_experience),
    family_composition: asNullableString(family.family_composition),
    languages: asStringArray(family.languages_spoken).length > 0 ? asStringArray(family.languages_spoken) : asStringArray(family.languages),
    amenities: asStringArray(family.amenities),
    house_rules: asStringArray(family.house_rules),
    bathroom_type: asNullableString(family.bathroom_type),
    common_areas: asStringArray(family.common_areas),
    max_guests: asNullableNumber(family.max_guests),
    pricing_mode: "quarterly",
    price_morning: asNullableNumber(family.price_morning) ?? 0,
    price_afternoon: asNullableNumber(family.price_afternoon) ?? 0,
    price_evening: asNullableNumber(family.price_evening) ?? 0,
    price_fullday: asNullableNumber(family.price_fullday) ?? 0,
    blocked_dates: asStringArray(family.blocked_dates),
    active_quarters: asStringArray(family.active_quarters),
    platform_commission_pct: asNullableNumber(family.platform_commission_pct),
    host_discount_pct: asNullableNumber(family.host_discount_pct),
    upi_id: asNullableString(family.upi_id),
    bank_account_holder_name: asNullableString(family.bank_account_holder_name),
    bank_account_number: asNullableString(family.bank_account_number),
    ifsc_code: asNullableString(family.ifsc_code),
    bank_name: asNullableString(family.bank_name),
    compliance_status: asNullableString(family.compliance_status),
    is_featured: false,
    is_accepting: family.is_accepting === true,
    published_at: hostStatus === "published" ? now : null,
    lat_exact: asNullableNumber(family.lat_exact),
    lng_exact: asNullableNumber(family.lng_exact),
    landmarks: Array.isArray(family.landmarks) ? family.landmarks : [],
    neighborhood_desc: asNullableString(family.neighborhood_desc),
    accessibility_desc: asNullableString(family.accessibility_desc),
    pincode: asNullableString(family.pincode),
    updated_at: now,
  };

  let hostId: string | null = null;
  if (existingHost && typeof existingHost.id === "string") {
    const { error: updateHostError } = await supabase
      .from("hosts")
      .update(hostPayload as never)
      .eq("id", existingHost.id);

    if (updateHostError) throw updateHostError;
    hostId = existingHost.id;
  } else {
    const { data: insertedHost, error: insertHostError } = await supabase
      .from("hosts")
      .insert(hostPayload as never)
      .select("id")
      .single();

    if (insertHostError) throw insertHostError;
    hostId = typeof insertedHost.id === "string" ? insertedHost.id : null;
  }

  if (hostId) {
    const photoUrls = buildFamilyPhotoUrls(family);
    const hostGalleryUrls = buildHostGalleryUrls(family);
    const { error: deleteMediaError } = await supabase.from("host_media").delete().eq("host_id", hostId);
    if (deleteMediaError) throw deleteMediaError;

    if (hostGalleryUrls.length > 0) {
      const { error: insertMediaError } = await supabase.from("host_media").insert(
        hostGalleryUrls.map((url, index) => ({
          host_id: hostId,
          media_url: url,
          is_primary: index === 0,
          sort_order: index,
        })) as never
      );

      if (insertMediaError) throw insertMediaError;
    }

    try {
      await syncPrimaryStayUnitForFamily(supabase, { familyId: normalizedFamilyId, application: application ?? family });
    } catch (roomSyncError) {
      console.error("[FamilyApproval] Stay unit sync failed:", roomSyncError);
    }
  }

  return {
    hostId,
    legacyFamilyId: normalizedFamilyId,
  };
}

export async function approveFamilyApplication(
  supabase: SupabaseClient,
  application: JsonRecord,
  notes?: string | null
): Promise<{
  credentials: FamilyApprovalCredentials;
  hostName: string;
}> {
  const onboardingDraftId = asString(application.onboarding_draft_id);
  let draftSource: JsonRecord = {};

  if (onboardingDraftId) {
    const { data: draftRow, error: draftError } = await supabase
      .from("host_onboarding_drafts")
      .select("*")
      .eq("id", onboardingDraftId)
      .maybeSingle();

    if (draftError) {
      throw draftError;
    }

    if (draftRow && typeof draftRow === "object") {
      const draftRecord = draftRow as JsonRecord;
      draftSource = {
        ...draftRecord,
        payload: {
          ...pickObject(draftRecord.payload),
          ...pickObject(application.payload),
        },
      };
    }
  }

  const normalized = buildApplicationDraft({
    ...draftSource,
    ...application,
    payload: {
      ...pickObject(draftSource.payload),
      ...pickObject(application.payload),
    },
  });
  const email = asString(normalized.email).toLowerCase();

  if (!email) {
    throw new Error("Approved application is missing an email address.");
  }

  const existingUser = await findExistingPublicUserByEmail(supabase, email);
  const existingAuthUserId = await findExistingAuthUserIdByEmail(supabase, email);

  let userId = existingUser && typeof existingUser.id === "string" ? existingUser.id : "";
  let generatedPassword = asNullableString(normalized.password);
  let accountCreated = false;

  if (!existingUser && existingAuthUserId) {
    userId = existingAuthUserId;
  } else if (!existingUser) {
    if (!generatedPassword) generatedPassword = generateTemporaryPassword();

    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password: generatedPassword,
      email_confirm: true,
      user_metadata: {
        role: "family",
        source: "famlo-web-review-approval",
      },
    });

    if (error || !data.user) {
      throw new Error(error?.message ?? "Unable to create auth user.");
    }

    userId = data.user.id;
    accountCreated = true;
  }

  if (!userId) {
    throw new Error("Could not resolve host user account.");
  }

  await ensurePublicUser(supabase, {
    id: userId,
    name: asString(normalized.fullName),
    email,
    phone: asNullableString(normalized.mobileNumber),
    city: asNullableString(normalized.city),
    state: asNullableString(normalized.state),
    about: asNullableString(normalized.hostBio),
    avatar_url: asNullableString(normalized.hostPhoto),
    role: "family",
    onboarding_completed: true,
  });

  const profile = await ensureFamilyProfile(supabase, normalized, userId, generatedPassword);
  await ensureHostProfileForFamily(supabase, profile.profileId ?? "", normalized);

  const now = new Date().toISOString();
  const reviewNotes = notes?.trim() || "Approved by Famlo review team.";

  const { error: applicationUpdateError } = await supabase
    .from("family_applications")
    .update({
      status: "approved",
      reviewed_at: now,
      review_notes: reviewNotes,
      approved_family_id: profile.profileId,
    } as never)
    .eq("id", String(application.id));

  if (applicationUpdateError) throw applicationUpdateError;

  if (onboardingDraftId) {
    const { error: draftUpdateError } = await supabase
      .from("host_onboarding_drafts")
      .update({
        listing_status: "approved",
        review_notes: reviewNotes,
        family_id: profile.profileId,
      } as never)
      .eq("id", onboardingDraftId);

    if (draftUpdateError) {
      // Keep approval successful even if the legacy draft row cannot be synced.
      console.error("[FamilyApproval] Draft sync failed after approval:", draftUpdateError);
    }
  }

  return {
    credentials: {
      email,
      user_id: userId,
      password: generatedPassword,
      account_created: accountCreated,
      profile_type: "family",
      profile_id: profile.profileId,
      profile_code: profile.profileCode,
    },
    hostName: asString(normalized.fullName) || "Partner",
  };
}
