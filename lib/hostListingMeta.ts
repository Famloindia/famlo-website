export const HOST_META_PREFIX = "FAMLO_META::";

export type HostListingMeta = {
  complianceNote?: string;
  pccFileName?: string;
  propertyProofFileName?: string;
  formCAcknowledged?: boolean;
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
  photoUrls?: string[];
};

export function parseHostListingMeta(value: string | null | undefined): HostListingMeta {
  if (!value) return {};
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
