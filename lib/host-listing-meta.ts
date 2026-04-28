//host-listing-meta.ts
export const HOST_META_PREFIX = "FAMLO_META::";

export type HostListingMeta = {
  journeyStory?: string;
  specialExperience?: string;
  localExperience?: string;
  interactionType?: string;
  houseType?: string;
  famloExperienceCards?: Array<{ title: string; description: string }>;
  famloExperiencePresetIds?: string[];
  complianceNote?: string;
  pccFileName?: string;
  propertyProofFileName?: string;
  formCFileName?: string;
  includedItems?: string[];
  houseRules?: string[];
  hostHobbies?: string;
  familyComposition?: string;
  culturalOffering?: string;
  bathroomType?: string;
  propertyAddress?: string;
  neighbourhood?: string;
  listingTitle?: string;
  amenities?: string[];
  commonAreas?: string[];
  photoUrls?: string[];
  hostSelfieUrl?: string;
  hostCatchphrase?: string;
  hostDisplayName?: string;
  googleMapsLink?: string;
  hostInstagramGallery?: string[];
  // Compliance Assets (Expanded)
  panCardUrl?: string;
  panMasked?: string;
  panLastFour?: string;
  panHolderName?: string;
  panDateOfBirth?: string;
  panVerificationStatus?: string;
  panVerificationProvider?: string;
  panRiskFlag?: boolean;
  propertyOwnershipUrl?: string;
  nocUrl?: string;
  policeVerificationUrl?: string;
  fssaiRegistrationUrl?: string;
  foodType?: string;
  idDocumentType?: string;
  idDocumentUrl?: string;
  idDocumentPhotoUrl?: string;
  liveSelfieUrl?: string;
  landmarks?: any[];
  neighborhoodDesc?: string;
  accessibilityDesc?: string;
  pincode?: string;
  checkInTime?: string;
  checkOutTime?: string;
};

export function parseHostListingMeta(value: string | null | undefined): HostListingMeta {
  if (!value) {
    return {};
  }

  if (!value.startsWith(HOST_META_PREFIX)) {
    return { complianceNote: value };
  }

  try {
    const parsed = JSON.parse(value.slice(HOST_META_PREFIX.length)) as HostListingMeta;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function serializeHostListingMeta(meta: HostListingMeta): string {
  return `${HOST_META_PREFIX}${JSON.stringify(meta)}`;
}
