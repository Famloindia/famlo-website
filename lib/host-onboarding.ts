//HOST-ONBOARDING.TS
import { createAdminSupabaseClient } from "@/lib/supabase";

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

export async function createHostDraft(params: CreateDraftParams): Promise<string> {
  const supabase = createAdminSupabaseClient();
  
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
    images: params.hostGalleryPhotos || params.images || [],
    bathroom_type: params.bathroomType || null,
    common_areas: params.commonAreas || [],
    amenities: params.amenities || [],
    upi_id: params.upiId || null,
    bank_account_holder_name: params.bankAccountHolderName || null,
    bank_account_number: params.bankAccountNumber || null,
    ifsc_code: params.ifscCode || null,
    bank_name: params.bankName || null,
    host_photo_url: params.host_photo_url || null,
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

  const { data, error } = await supabase
    .from("host_onboarding_drafts")
    .insert(insertData)
    .select("id")
    .single();

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
  if (params.images !== undefined) updateData.images = params.images || [];
  if (params.hostGalleryPhotos !== undefined) updateData.images = params.hostGalleryPhotos || params.images || [];
  if (params.bathroomType !== undefined) updateData.bathroom_type = params.bathroomType || null;
  if (params.commonAreas !== undefined) updateData.common_areas = params.commonAreas || [];
  if (params.amenities !== undefined) updateData.amenities = params.amenities || [];
  if (params.upiId !== undefined) updateData.upi_id = params.upiId || null;
  if (params.bankAccountHolderName !== undefined) updateData.bank_account_holder_name = params.bankAccountHolderName || null;
  if (params.bankAccountNumber !== undefined) updateData.bank_account_number = params.bankAccountNumber || null;
  if (params.ifscCode !== undefined) updateData.ifsc_code = params.ifscCode || null;
  if (params.bankName !== undefined) updateData.bank_name = params.bankName || null;
  if (params.host_photo_url !== undefined) updateData.host_photo_url = params.host_photo_url || null;
  if (params.latExact !== undefined) updateData.lat_exact = params.latExact;
  if (params.lngExact !== undefined) updateData.lng_exact = params.lngExact;
  if (params.landmarks !== undefined) updateData.landmarks = params.landmarks || [];
  if (params.neighborhoodDesc !== undefined) updateData.neighborhood_desc = params.neighborhoodDesc || null;
  if (params.accessibilityDesc !== undefined) updateData.accessibility_desc = params.accessibilityDesc || null;
  if (params.pincode !== undefined) updateData.pincode = params.pincode || null;

  const { error: updateError } = await supabase
    .from("host_onboarding_drafts")
    .update(updateData)
    .eq("id", params.draftId);

  if (updateError) {
    console.error("[HostOnboarding] Draft update failed:", updateError.message);
    throw updateError;
  }
}
