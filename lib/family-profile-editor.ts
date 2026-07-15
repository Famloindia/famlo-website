import { parseHostListingMeta, type HostListingMeta } from "@/lib/host-listing-meta";

export type FamilyProfileDraft = {
  hostDisplayName: string;
  email: string;
  hostHobbies: string;
  familyComposition: string;
  city: string;
  state: string;
  cityNeighbourhood: string;
  hostCatchphrase: string;
  hostSelfieUrl: string;
  mobileNumber: string;
  languages: string;
};

export type FamilyListingDraft = {
  propertyName: string;
  hostBio: string;
  listingTitle: string;
  culturalOffering: string;
  journeyStory: string;
  specialExperience: string;
  localExperience: string;
  interactionType: string;
  houseType: string;
  checkInTime: string;
  checkOutTime: string;
  bathroomType: string;
  propertyAddress: string;
  commonAreas: string;
  amenities: string;
  includedItems: string;
  houseRules: string;
  googleMapsLink: string;
  priceMorning: string;
  priceAfternoon: string;
  priceEvening: string;
  priceFullday: string;
  foodType: string;
  hostReelStorageKey?: string;
  hostReelPublicUrl?: string;
  hostReelMimeType?: string;
  hostReelSizeBytes?: number | null;
  hostReelUploadedAt?: string;
};

export type FamilyScheduleDraft = {
  isActive: boolean;
  isAccepting: boolean;
  bookingRequiresHostApproval: boolean;
  maxGuests: string;
  activeQuarters: string;
  blockedDates: string;
};

export type FamilyComplianceDraft = {
  pccFileName: string;
  propertyProofFileName: string;
  formCFileName: string;
  panCardUrl: string;
  propertyOwnershipUrl: string;
  nocUrl: string;
  policeVerificationUrl: string;
  fssaiRegistrationUrl: string;
  idDocumentType: string;
  idDocumentUrl: string;
  liveSelfieUrl: string;
  panNumber: string;
  panMasked: string;
  panLastFour: string;
  panHolderName: string;
  panDateOfBirth: string;
  panVerificationStatus: string;
  panVerificationProvider: string;
  panRiskFlag: boolean;
  panConsentGiven: boolean;
  isPanVerified: boolean;
  panVerifiedAt: string;
  gstin: string;
  gstVerificationStatus?: string;
  platformAgreementAcceptedAt: string;
  adminNotes: string;
};

export type FamilyPhotoItem = {
  id: string;
  url: string;
  isPrimary: boolean;
  family_id?: string;
};

function joinList(values: unknown): string {
  if (Array.isArray(values)) return values.join(", ");
  if (typeof values === "string") return values;
  return "";
}

function pickObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function firstString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed.length > 0) return trimmed;
  }
  return "";
}

function firstListString(...values: unknown[]): string {
  for (const value of values) {
    if (Array.isArray(value) && value.length > 0) {
      return value
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean)
        .join(", ");
    }
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }
  return "";
}

function getPrimaryRoomDraft(payload: Record<string, unknown>): Record<string, unknown> {
  const rooms = Array.isArray(payload.rooms)
    ? payload.rooms.filter((room): room is Record<string, unknown> => Boolean(room && typeof room === "object" && !Array.isArray(room)))
    : [];

  return rooms.find((room) => room.isPrimary === true) ?? rooms[0] ?? {};
}

function parsePrice(value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? String(numeric) : "";
}

export function parseFamilyMeta(adminNotes: unknown): HostListingMeta {
  return parseHostListingMeta(typeof adminNotes === "string" ? adminNotes : null);
}

export function buildProfileFromFamily(
  family: Record<string, unknown>,
  meta: HostListingMeta
): FamilyProfileDraft {
  const onboardingPayload = pickObject(family.latest_onboarding_payload);

  return {
    hostDisplayName: firstString(
      family.host_display_name,
      family.primary_host_name,
      family.host_name,
      family.display_name,
      onboardingPayload.hostName,
      meta.hostDisplayName
    ),
    email: firstString(
      family.email,
      family.host_email,
      onboardingPayload.email,
      onboardingPayload.hostEmail
    ),
    hostHobbies: firstListString(meta.hostHobbies, onboardingPayload.hostHobbies, onboardingPayload.hobbies),
    familyComposition: firstString(meta.familyComposition, onboardingPayload.familyComposition),
    city: firstString(family.city, onboardingPayload.city, onboardingPayload.cityName),
    state: firstString(family.state, onboardingPayload.state),
    cityNeighbourhood: firstString(family.village, family.locality, onboardingPayload.cityNeighbourhood, onboardingPayload.villageName),
    hostCatchphrase: firstString(meta.hostCatchphrase, onboardingPayload.hostCatchphrase),
    hostSelfieUrl: firstString(
      family.host_photo_url,
      onboardingPayload.hostPhoto,
      onboardingPayload.hostPhotoUrl,
      onboardingPayload.photo_url,
      family.photo_url,
      meta.hostSelfieUrl
    ),
    mobileNumber: firstString(family.host_phone, onboardingPayload.mobileNumber, onboardingPayload.phone, onboardingPayload.hostPhone),
    languages: firstListString(family.languages_spoken, family.languages, onboardingPayload.languages, onboardingPayload.preferredLanguage),
  };
}

export function buildListingFromFamily(
  family: Record<string, unknown>,
  meta: HostListingMeta
): FamilyListingDraft {
  const onboardingPayload = pickObject(family.latest_onboarding_payload);
  const primaryRoomDraft = getPrimaryRoomDraft(onboardingPayload);

  return {
    propertyName: firstString(family.property_name, family.name, onboardingPayload.propertyName),
    hostBio: firstString(family.about, family.description, onboardingPayload.hostBio),
    listingTitle: firstString(family.listing_title, family.property_name, meta.listingTitle, onboardingPayload.listingTitle),
    culturalOffering: firstString(family.famlo_experience, onboardingPayload.culturalActivity, meta.culturalOffering),
    journeyStory: firstString(family.journey_story, meta.journeyStory, onboardingPayload.journeyStory),
    specialExperience: firstString(family.special_experience, meta.specialExperience, onboardingPayload.specialExperience),
    localExperience: firstString(family.local_experience, meta.localExperience, onboardingPayload.localExperience),
    interactionType: firstString(family.interaction_type, meta.interactionType, onboardingPayload.interactionType),
    houseType: firstString(family.house_type, meta.houseType, onboardingPayload.houseType, meta.familyComposition),
    checkInTime: firstString(family.check_in_time, meta.checkInTime, onboardingPayload.checkInTime),
    checkOutTime: firstString(family.check_out_time, meta.checkOutTime, onboardingPayload.checkOutTime),
    bathroomType: firstString(
      family.bathroom_type,
      meta.bathroomType,
      onboardingPayload.bathroomType,
      primaryRoomDraft.bathroomType
    ),
    propertyAddress: firstString(family.street_address, family.address, family.address_line, onboardingPayload.propertyAddress, onboardingPayload.address, meta.propertyAddress),
    commonAreas: firstListString(family.common_areas, onboardingPayload.commonAreas, meta.commonAreas),
    amenities: firstListString(
      (family as Record<string, unknown>).primary_stay_unit_amenities,
      family.amenities,
      meta.amenities,
      onboardingPayload.amenities,
      primaryRoomDraft.amenities,
      primaryRoomDraft.roomAmenities
    ),
    includedItems: firstListString(
      onboardingPayload.includedItems,
      onboardingPayload.includedHighlights,
      meta.includedItems
    ),
    houseRules: firstListString(family.house_rules, onboardingPayload.houseRules, onboardingPayload.houseRulesText, onboardingPayload.customRules, meta.houseRules),
    googleMapsLink: firstString(meta.googleMapsLink, onboardingPayload.googleMapsLink, family.google_maps_link, meta.propertyAddress),
    priceMorning: parsePrice(family.price_morning),
    priceAfternoon: parsePrice(family.price_afternoon),
    priceEvening: parsePrice(family.price_evening),
    priceFullday: parsePrice(family.price_fullday),
    foodType: firstListString(family.food_type, onboardingPayload.foodType, meta.foodType),
    hostReelStorageKey: firstString((family as Record<string, unknown>).canonical_host_reel_storage_key, (family as Record<string, unknown>).host_reel_storage_key, onboardingPayload.hostReelStorageKey, meta.hostReelStorageKey),
    hostReelPublicUrl: firstString((family as Record<string, unknown>).canonical_host_reel_public_url, (family as Record<string, unknown>).host_reel_public_url, onboardingPayload.hostReelPublicUrl, meta.hostReelPublicUrl),
    hostReelMimeType: firstString((family as Record<string, unknown>).canonical_host_reel_mime_type, (family as Record<string, unknown>).host_reel_mime_type, onboardingPayload.hostReelMimeType, meta.hostReelMimeType),
    hostReelSizeBytes:
      typeof (family as Record<string, unknown>).canonical_host_reel_size_bytes === "number"
        ? ((family as Record<string, unknown>).canonical_host_reel_size_bytes as number)
        : typeof (family as Record<string, unknown>).host_reel_size_bytes === "number"
          ? ((family as Record<string, unknown>).host_reel_size_bytes as number)
        : typeof onboardingPayload.hostReelSizeBytes === "number"
          ? (onboardingPayload.hostReelSizeBytes as number)
          : meta.hostReelSizeBytes ?? null,
    hostReelUploadedAt: firstString((family as Record<string, unknown>).canonical_host_reel_uploaded_at, (family as Record<string, unknown>).host_reel_uploaded_at, onboardingPayload.hostReelUploadedAt, meta.hostReelUploadedAt),
  };
}

export function buildScheduleFromFamily(family: Record<string, unknown>): FamilyScheduleDraft {
  const onboardingPayload = pickObject(family.latest_onboarding_payload);
  const meta = parseFamilyMeta(family.admin_notes);
  return {
    isActive: Boolean(family.is_active),
    isAccepting: Boolean(family.is_accepting),
    bookingRequiresHostApproval:
      typeof family.booking_requires_host_approval === "boolean"
        ? family.booking_requires_host_approval
        : typeof onboardingPayload.bookingRequiresHostApproval === "boolean"
          ? onboardingPayload.bookingRequiresHostApproval
          : Boolean(meta.bookingRequiresHostApproval),
    maxGuests: String(family.max_guests ?? 3),
    activeQuarters: joinList(
      family.active_quarters ?? ["morning", "afternoon", "evening", "fullday"]
    ),
    blockedDates: joinList(family.blocked_dates),
  };
}

export function buildComplianceFromFamily(
  family: Record<string, unknown>,
  meta: HostListingMeta,
  hostTaxDetails?: {
    pan_last_four?: string | null;
    pan_holder_name?: string | null;
    pan_date_of_birth?: string | null;
    verification_status?: string | null;
    verification_provider?: string | null;
    is_verified?: boolean | null;
    risk_flag?: boolean | null;
    consent_given?: boolean | null;
    verified_at?: string | null;
  } | null
): FamilyComplianceDraft {
  const onboardingPayload = pickObject(family.latest_onboarding_payload);
  return {
    pccFileName: String(meta.pccFileName ?? ""),
    propertyProofFileName: String(meta.propertyProofFileName ?? ""),
    formCFileName: String(meta.formCFileName ?? ""),
    panCardUrl: firstString(meta.panCardUrl, onboardingPayload.panCardUrl, onboardingPayload.propertyPanCardUrl),
    propertyOwnershipUrl: firstString(meta.propertyOwnershipUrl, onboardingPayload.propertyOwnershipUrl, onboardingPayload.propertyOwnershipProofUrl),
    nocUrl: firstString(meta.nocUrl, onboardingPayload.nocUrl, onboardingPayload.nocDocumentUrl),
    policeVerificationUrl: firstString(meta.policeVerificationUrl, onboardingPayload.policeVerificationUrl),
    fssaiRegistrationUrl: firstString(meta.fssaiRegistrationUrl, onboardingPayload.fssaiRegistrationUrl),
    idDocumentType: String(family.id_document_type ?? meta.idDocumentType ?? ""),
    idDocumentUrl: firstString(family.id_document_url, meta.idDocumentUrl, meta.idDocumentPhotoUrl, onboardingPayload.idDocumentUrl, onboardingPayload.idDocumentPhotoUrl),
    liveSelfieUrl: firstString(family.live_selfie_url, meta.liveSelfieUrl, onboardingPayload.liveSelfieUrl),
    panNumber: "",
    panMasked: String(meta.panMasked ?? (hostTaxDetails?.pan_last_four ? `******${hostTaxDetails.pan_last_four}` : "")),
    panLastFour: String(meta.panLastFour ?? hostTaxDetails?.pan_last_four ?? ""),
    panHolderName: String(meta.panHolderName ?? hostTaxDetails?.pan_holder_name ?? ""),
    panDateOfBirth: String(meta.panDateOfBirth ?? hostTaxDetails?.pan_date_of_birth ?? ""),
    panVerificationStatus: String(meta.panVerificationStatus ?? hostTaxDetails?.verification_status ?? "pending"),
    panVerificationProvider: String(meta.panVerificationProvider ?? hostTaxDetails?.verification_provider ?? ""),
    panRiskFlag: Boolean(meta.panRiskFlag ?? hostTaxDetails?.risk_flag),
    panConsentGiven: Boolean(hostTaxDetails?.consent_given ?? false),
    isPanVerified: Boolean(hostTaxDetails?.is_verified ?? false),
    panVerifiedAt: String(hostTaxDetails?.verified_at ?? ""),
    gstin: firstString(family.gstin, onboardingPayload.gstin, onboardingPayload.gstNumber, meta.gstin),
    gstVerificationStatus: "",
    platformAgreementAcceptedAt: String(meta.platformAgreementAcceptedAt ?? ""),
    adminNotes: String(meta.complianceNote ?? ""),
  };
}

export function buildPhotosFromAllPhotos(
  allPhotos: Array<Record<string, unknown>>,
  familyId: string
): FamilyPhotoItem[] {
  return allPhotos
    .filter((photo) => String(photo.family_id) === familyId)
    .map((photo) => ({
      id: String(photo.id),
      url: String(photo.url),
      isPrimary: Boolean(photo.is_primary),
      family_id: String(photo.family_id ?? familyId),
    }));
}

export async function saveFamilyProfileWorkspace(params: {
  familyId: string;
  profile: FamilyProfileDraft;
  listing: FamilyListingDraft;
  schedule: FamilyScheduleDraft;
  photos: FamilyPhotoItem[];
  compliance: FamilyComplianceDraft;
}): Promise<{ ok: true; warnings?: string[] } | { ok: false; error: string }> {
  const response = await fetch("/api/onboarding/home/dashboard-save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      familyId: params.familyId,
      profile: params.profile,
      listing: params.listing,
      schedule: params.schedule,
      photos: [
        ...params.photos.filter((photo) => photo.isPrimary),
        ...params.photos.filter((photo) => !photo.isPrimary),
      ].map((photo) => ({
        url: photo.url,
        isPrimary: photo.isPrimary,
      })),
      compliancePatch: {
        pccFileName: params.compliance.pccFileName,
        propertyProofFileName: params.compliance.propertyProofFileName,
        formCFileName: params.compliance.formCFileName,
        panCardUrl: params.compliance.panCardUrl,
        propertyOwnershipUrl: params.compliance.propertyOwnershipUrl,
        nocUrl: params.compliance.nocUrl,
        policeVerificationUrl: params.compliance.policeVerificationUrl,
        fssaiRegistrationUrl: params.compliance.fssaiRegistrationUrl,
        idDocumentType: params.compliance.idDocumentType,
        idDocumentUrl: params.compliance.idDocumentUrl,
        liveSelfieUrl: params.compliance.liveSelfieUrl,
        panNumber: params.compliance.panNumber,
        panHolderName: params.compliance.panHolderName,
        panDateOfBirth: params.compliance.panDateOfBirth,
        panConsentGiven: params.compliance.panConsentGiven,
        gstin: params.compliance.gstin,
        platformAgreementAcceptedAt: params.compliance.platformAgreementAcceptedAt,
        adminNotes: params.compliance.adminNotes,
      },
    }),
  });

  const payload = (await response.json()) as { error?: string; warnings?: string[] };
  if (!response.ok) {
    return { ok: false, error: payload.error ?? "Sync failed. Connection error." };
  }

  return { ok: true, warnings: Array.isArray(payload.warnings) ? payload.warnings : undefined };
}
