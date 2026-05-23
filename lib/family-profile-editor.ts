import { parseHostListingMeta, type HostListingMeta } from "@/lib/host-listing-meta";

export type FamilyProfileDraft = {
  hostDisplayName: string;
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
      meta.hostDisplayName,
      onboardingPayload.hostName,
      family.primary_host_name,
      family.host_name
    ),
    hostHobbies: firstListString(meta.hostHobbies, onboardingPayload.hostHobbies, onboardingPayload.hobbies),
    familyComposition: String(meta.familyComposition ?? ""),
    city: firstString(onboardingPayload.city, family.city),
    state: firstString(onboardingPayload.state, family.state),
    cityNeighbourhood: firstString(onboardingPayload.cityNeighbourhood, family.village),
    hostCatchphrase: firstString(meta.hostCatchphrase, onboardingPayload.hostCatchphrase),
    hostSelfieUrl: firstString(
      family.host_photo_url,
      onboardingPayload.hostPhoto,
      onboardingPayload.hostPhotoUrl,
      onboardingPayload.photo_url,
      family.photo_url,
      meta.hostSelfieUrl
    ),
    mobileNumber: String(family.host_phone ?? ""),
    languages: joinList(family.languages_spoken ?? family.languages ?? []),
  };
}

export function buildListingFromFamily(
  family: Record<string, unknown>,
  meta: HostListingMeta
): FamilyListingDraft {
  const onboardingPayload = pickObject(family.latest_onboarding_payload);
  const primaryRoomDraft = getPrimaryRoomDraft(onboardingPayload);

  return {
    propertyName: firstString(onboardingPayload.propertyName, family.property_name, family.name),
    hostBio: firstString(onboardingPayload.hostBio, family.about, family.description),
    listingTitle: firstString(meta.listingTitle, onboardingPayload.listingTitle),
    culturalOffering: firstString(onboardingPayload.culturalActivity, family.famlo_experience, meta.culturalOffering),
    journeyStory: firstString(meta.journeyStory, onboardingPayload.journeyStory),
    specialExperience: firstString(meta.specialExperience, onboardingPayload.specialExperience),
    localExperience: firstString(meta.localExperience, onboardingPayload.localExperience),
    interactionType: firstString(meta.interactionType, onboardingPayload.interactionType),
    houseType: firstString(meta.houseType, onboardingPayload.houseType, meta.familyComposition),
    checkInTime: firstString(meta.checkInTime, onboardingPayload.checkInTime),
    checkOutTime: firstString(meta.checkOutTime, onboardingPayload.checkOutTime),
    bathroomType: firstString(
      family.bathroom_type,
      meta.bathroomType,
      onboardingPayload.bathroomType,
      primaryRoomDraft.bathroomType
    ),
    propertyAddress: firstString(onboardingPayload.propertyAddress, family.street_address, meta.propertyAddress),
    commonAreas: firstListString(onboardingPayload.commonAreas, family.common_areas, meta.commonAreas),
    amenities: firstListString(
      onboardingPayload.amenities,
      family.amenities,
      meta.amenities,
      primaryRoomDraft.amenities,
      primaryRoomDraft.roomAmenities
    ),
    includedItems: firstListString(
      onboardingPayload.includedItems,
      onboardingPayload.includedHighlights,
      meta.includedItems
    ),
    houseRules: firstListString(onboardingPayload.houseRules, onboardingPayload.houseRulesText, family.house_rules, meta.houseRules),
    googleMapsLink: firstString(meta.googleMapsLink, onboardingPayload.googleMapsLink, family.google_maps_link, meta.propertyAddress),
    priceMorning: parsePrice(family.price_morning),
    priceAfternoon: parsePrice(family.price_afternoon),
    priceEvening: parsePrice(family.price_evening),
    priceFullday: parsePrice(family.price_fullday),
    foodType: firstListString(onboardingPayload.foodType, family.food_type, meta.foodType),
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
  return {
    pccFileName: String(meta.pccFileName ?? ""),
    propertyProofFileName: String(meta.propertyProofFileName ?? ""),
    formCFileName: String(meta.formCFileName ?? ""),
    panCardUrl: String(meta.panCardUrl ?? ""),
    propertyOwnershipUrl: String(meta.propertyOwnershipUrl ?? ""),
    nocUrl: String(meta.nocUrl ?? ""),
    policeVerificationUrl: String(meta.policeVerificationUrl ?? ""),
    fssaiRegistrationUrl: String(meta.fssaiRegistrationUrl ?? ""),
    idDocumentType: String(family.id_document_type ?? meta.idDocumentType ?? ""),
    idDocumentUrl: String(family.id_document_url ?? meta.idDocumentUrl ?? meta.idDocumentPhotoUrl ?? ""),
    liveSelfieUrl: String(family.live_selfie_url ?? meta.liveSelfieUrl ?? ""),
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
