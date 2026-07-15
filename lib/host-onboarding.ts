//HOST-ONBOARDING.TS
import { createAdminSupabaseClient } from "@/lib/supabase";
import { sendWhatsAppOTP } from "@/lib/whatsapp";

export type HostOnboardingPayload = Record<string, unknown>;
export type HostCompliancePayload = Record<string, unknown>;

interface CreateDraftParams {
  mobileNumber: string;
  primaryHostName: string;
  cityNeighbourhood: string;
  streetAddress?: string;
  email?: string;
  state?: string;
  country?: string;
  familyComposition?: string;
  hostBio?: string;
  languagesSpoken?: string[];
  famloExperience?: string;
  images?: string[];
  hostGalleryPhotos?: string[];
  bathroomType?: string;
  commonAreas?: string[];
  amenities?: string[];
  upiId?: string;
  bankAccountHolderName?: string;
  bankAccountNumber?: string;
  ifscCode?: string;
  bankName?: string;
  host_photo_url?: string;
  hostReelStorageKey?: string;
  hostReelPublicUrl?: string;
  hostReelMimeType?: string;
  hostReelSizeBytes?: number;
  hostReelUploadedAt?: string;
  gstin?: string;
  platformAgreementAcceptedAt?: string;
  password?: string;
  latExact?: number;
  lngExact?: number;
  landmarks?: any[];
  neighborhoodDesc?: string;
  accessibilityDesc?: string;
  pincode?: string;
  payload?: HostOnboardingPayload;
  compliance?: HostCompliancePayload;
  currentStep?: number;
}

export function generateHostPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // Removed similar looking chars
  let password = "";
  for (let i = 0; i < 8; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

export function normalizePhone(input: unknown): string {
  const clean = typeof input === "string" ? input.replace(/[^\d+]/g, "").trim() : "";
  if (!clean) {
    throw new Error("Mobile number is required");
  }

  const withoutPlus = clean.startsWith("+") ? clean.slice(1) : clean;
  const normalized = withoutPlus.startsWith("91") ? withoutPlus : `91${withoutPlus}`;

  if (!/^91\d{10}$/.test(normalized)) {
    throw new Error("Please enter a valid Indian mobile number.");
  }

  return normalized;
}

export function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function sendOtpMessage(input: {
  mobileNumber: string;
  code: string;
}): Promise<{ sent: boolean; provider: "whatsapp"; error?: string }> {
  const result = await sendWhatsAppOTP(input.mobileNumber, input.code);
  return result.success
    ? { sent: true, provider: "whatsapp" }
    : { sent: false, provider: "whatsapp", error: "Failed to send OTP message." };
}

const OPTIONAL_DRAFT_COLUMNS = new Set([
  "host_reel_storage_key",
  "host_reel_public_url",
  "host_reel_mime_type",
  "host_reel_size_bytes",
  "host_reel_uploaded_at",
  "gstin",
  "platform_agreement_accepted_at",
]);

function extractMissingColumnFromSchemaError(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const message = "message" in error && typeof error.message === "string" ? error.message : "";
  const match = message.match(/Could not find the '([^']+)' column/i);
  return match?.[1] ?? null;
}

async function insertDraftWithSchemaFallback(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  insertData: Record<string, unknown>
): Promise<{ data: { id: string } | null; error: any }> {
  const workingInsertData = { ...insertData };

  for (let attempt = 0; attempt < OPTIONAL_DRAFT_COLUMNS.size + 1; attempt += 1) {
    const result = await supabase
      .from("host_onboarding_drafts")
      .insert(workingInsertData as never)
      .select("id")
      .single();

    if (!result.error) {
      return { data: result.data as { id: string } | null, error: null };
    }

    const missingColumn = extractMissingColumnFromSchemaError(result.error);
    if (!missingColumn || !OPTIONAL_DRAFT_COLUMNS.has(missingColumn) || !(missingColumn in workingInsertData)) {
      return { data: null, error: result.error };
    }

    delete workingInsertData[missingColumn];
  }

  return { data: null, error: new Error("Schema fallback exhausted while creating host onboarding draft.") };
}

async function updateDraftWithSchemaFallback(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  draftId: string,
  updateData: Record<string, unknown>
): Promise<any> {
  const workingUpdateData = { ...updateData };

  for (let attempt = 0; attempt < OPTIONAL_DRAFT_COLUMNS.size + 1; attempt += 1) {
    const { error } = await supabase
      .from("host_onboarding_drafts")
      .update(workingUpdateData as never)
      .eq("id", draftId);

    if (!error) {
      return null;
    }

    const missingColumn = extractMissingColumnFromSchemaError(error);
    if (!missingColumn || !OPTIONAL_DRAFT_COLUMNS.has(missingColumn) || !(missingColumn in workingUpdateData)) {
      return error;
    }

    delete workingUpdateData[missingColumn];
  }

  return new Error("Schema fallback exhausted while updating host onboarding draft.");
}

export async function createHostDraft(params: CreateDraftParams): Promise<string> {
  const supabase = createAdminSupabaseClient();
  const draftImages =
    Array.isArray(params.images) && params.images.length > 0
      ? params.images
      : Array.isArray(params.hostGalleryPhotos)
        ? params.hostGalleryPhotos
        : [];
  
  const insertData: any = {
    mobile_number: params.mobileNumber,
    primary_host_name: params.primaryHostName || null,
    city_neighbourhood: params.cityNeighbourhood || null,
    street_address: params.streetAddress || null,
    email: params.email || null,
    state: params.state || null,
    country: params.country || null,
    family_composition: params.familyComposition || null,
    host_bio: params.hostBio || null,
    languages_spoken: params.languagesSpoken || [],
    famlo_experience: params.famloExperience || null,
    images: draftImages,
    bathroom_type: params.bathroomType || null,
    common_areas: params.commonAreas || [],
    amenities: params.amenities || [],
    upi_id: params.upiId || null,
    bank_account_holder_name: params.bankAccountHolderName || null,
    bank_account_number: params.bankAccountNumber || null,
    ifsc_code: params.ifscCode || null,
    bank_name: params.bankName || null,
    host_photo_url: params.host_photo_url || null,
    host_reel_storage_key: params.hostReelStorageKey || null,
    host_reel_public_url: params.hostReelPublicUrl || null,
    host_reel_mime_type: params.hostReelMimeType || null,
    host_reel_size_bytes: params.hostReelSizeBytes ?? null,
    host_reel_uploaded_at: params.hostReelUploadedAt || null,
    gstin: params.gstin || null,
    platform_agreement_accepted_at: params.platformAgreementAcceptedAt || null,
    password: params.password || null,
    current_step: params.currentStep ?? 1,
    lat_exact: params.latExact ?? null,
    lng_exact: params.lngExact ?? null,
    landmarks: params.landmarks || [],
    neighborhood_desc: params.neighborhoodDesc || null,
    accessibility_desc: params.accessibilityDesc || null,
    pincode: params.pincode || null,
    listing_status: "draft",
    payload: params.payload ?? {},
    compliance: params.compliance ?? {}
  };

  const { data, error } = await insertDraftWithSchemaFallback(supabase, insertData);

  if (error) {
    console.error("[HostOnboarding] Draft creation failed:", error.message, error.details);
    // Add custom diagnostic info for the portal
    (error as any).hint = "Ensure 'host_onboarding_drafts' table exists with current schema.";
    throw error;
  }

  if (!data || typeof data.id !== "string") {
    throw new Error("Draft ID missing from database response.");
  }

  return data.id;
}

export async function mergeDraftPayload(params: {
  draftId: string;
  payloadPatch?: HostOnboardingPayload;
  compliancePatch?: HostCompliancePayload;
  currentStep?: number;
  listingStatus?: string;
  applicationId?: string;
  // Top level fields
  primaryHostName?: string;
  mobileNumber?: string;
  cityNeighbourhood?: string;
  streetAddress?: string;
  email?: string;
  state?: string;
  country?: string;
  familyComposition?: string;
  hostBio?: string;
  languagesSpoken?: string[];
  famloExperience?: string;
  images?: string[];
  hostGalleryPhotos?: string[];
  bathroomType?: string;
  commonAreas?: string[];
  amenities?: string[];
  upiId?: string;
  bankAccountHolderName?: string;
  bankAccountNumber?: string;
  ifscCode?: string;
  bankName?: string;
  host_photo_url?: string;
  hostReelStorageKey?: string;
  hostReelPublicUrl?: string;
  hostReelMimeType?: string;
  hostReelSizeBytes?: number;
  hostReelUploadedAt?: string;
  gstin?: string;
  platformAgreementAcceptedAt?: string;
  latExact?: number;
  lngExact?: number;
  landmarks?: any[];
  neighborhoodDesc?: string;
  accessibilityDesc?: string;
  pincode?: string;
}): Promise<void> {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("host_onboarding_drafts")
    .select("payload, compliance, current_step")
    .eq("id", params.draftId)
    .single();

  if (error || !data) {
    console.error("[HostOnboarding] Draft lookup failed:", error?.message);
    throw error ?? new Error(`Draft ${params.draftId} not found.`);
  }

  const existingPayload = (data as any).payload ?? {};
  const existingCompliance = (data as any).compliance ?? {};

  const payload = {
    ...existingPayload,
    ...(params.payloadPatch ?? {})
  };

  const compliance = {
    ...existingCompliance,
    ...(params.compliancePatch ?? {})
  };

  const updateData: any = {
    payload,
    compliance,
    current_step: Math.max(
      params.currentStep ?? 1,
      (data as any).current_step ?? 1
    )
  };

  const mergedImages =
    Array.isArray(params.images) && params.images.length > 0
      ? params.images
      : Array.isArray(params.hostGalleryPhotos)
        ? params.hostGalleryPhotos
        : undefined;

  if (params.listingStatus) updateData.listing_status = params.listingStatus;
  if (params.applicationId) updateData.family_application_id = params.applicationId;
  
  // Map parameters to columns
  if (params.primaryHostName !== undefined) updateData.primary_host_name = params.primaryHostName || null;
  if (params.mobileNumber !== undefined) updateData.mobile_number = params.mobileNumber || null;
  if (params.cityNeighbourhood !== undefined) updateData.city_neighbourhood = params.cityNeighbourhood || null;
  if (params.streetAddress !== undefined) updateData.street_address = params.streetAddress || null;
  if (params.email !== undefined) updateData.email = params.email || null;
  if (params.state !== undefined) updateData.state = params.state || null;
  if (params.country !== undefined) updateData.country = params.country || null;
  if (params.familyComposition !== undefined) updateData.family_composition = params.familyComposition || null;
  if (params.hostBio !== undefined) updateData.host_bio = params.hostBio || null;
  if (params.languagesSpoken !== undefined) updateData.languages_spoken = params.languagesSpoken || [];
  if (params.famloExperience !== undefined) updateData.famlo_experience = params.famloExperience || null;
  if (mergedImages !== undefined) updateData.images = mergedImages;
  if (params.bathroomType !== undefined) updateData.bathroom_type = params.bathroomType || null;
  if (params.commonAreas !== undefined) updateData.common_areas = params.commonAreas || [];
  if (params.amenities !== undefined) updateData.amenities = params.amenities || [];
  if (params.upiId !== undefined) updateData.upi_id = params.upiId || null;
  if (params.bankAccountHolderName !== undefined) updateData.bank_account_holder_name = params.bankAccountHolderName || null;
  if (params.bankAccountNumber !== undefined) updateData.bank_account_number = params.bankAccountNumber || null;
  if (params.ifscCode !== undefined) updateData.ifsc_code = params.ifscCode || null;
  if (params.bankName !== undefined) updateData.bank_name = params.bankName || null;
  if (params.host_photo_url !== undefined) updateData.host_photo_url = params.host_photo_url || null;
  if (params.hostReelStorageKey !== undefined) updateData.host_reel_storage_key = params.hostReelStorageKey || null;
  if (params.hostReelPublicUrl !== undefined) updateData.host_reel_public_url = params.hostReelPublicUrl || null;
  if (params.hostReelMimeType !== undefined) updateData.host_reel_mime_type = params.hostReelMimeType || null;
  if (params.hostReelSizeBytes !== undefined) updateData.host_reel_size_bytes = params.hostReelSizeBytes ?? null;
  if (params.hostReelUploadedAt !== undefined) updateData.host_reel_uploaded_at = params.hostReelUploadedAt || null;
  if (params.gstin !== undefined) updateData.gstin = params.gstin || null;
  if (params.platformAgreementAcceptedAt !== undefined) {
    updateData.platform_agreement_accepted_at = params.platformAgreementAcceptedAt || null;
  }
  if (params.latExact !== undefined) updateData.lat_exact = params.latExact;
  if (params.lngExact !== undefined) updateData.lng_exact = params.lngExact;
  if (params.landmarks !== undefined) updateData.landmarks = params.landmarks || [];
  if (params.neighborhoodDesc !== undefined) updateData.neighborhood_desc = params.neighborhoodDesc || null;
  if (params.accessibilityDesc !== undefined) updateData.accessibility_desc = params.accessibilityDesc || null;
  if (params.pincode !== undefined) updateData.pincode = params.pincode || null;

  const updateError = await updateDraftWithSchemaFallback(supabase, params.draftId, updateData);

  if (updateError) {
    console.error("[HostOnboarding] Draft update failed:", updateError.message);
    throw updateError;
  }
}
