import type { SupabaseClient } from "@supabase/supabase-js";

import { parseHostListingMeta } from "@/lib/host-listing-meta";
import { loadUserProfileCompatibility, type UserProfileRecord } from "@/lib/user-profile";

type JsonRecord = Record<string, unknown>;

type AuthUserLike = {
  id: string;
  email: string | null;
  phone?: string | null;
} | null;

type ReelLike = {
  publicUrl?: string | null;
  url?: string | null;
  source?: string | null;
} | null;

type GalleryLike = {
  url?: string | null;
  source?: string | null;
}[];

type RoomLike = {
  id: string;
  name?: string | null;
  isActive?: boolean;
  amenities?: unknown[];
  photos?: string[];
  localityPhotos?: string[];
  priceMorning?: number;
  priceAfternoon?: number;
  priceEvening?: number;
  priceFullday?: number;
}[];

type ChannelFoundationLike = {
  properties?: Array<{ syncStatus?: string | null }>;
  roomMappings?: Array<{ externalRoomTypeId?: string | null }>;
} | null;

type SourceValue<T> = {
  source: string;
  value: T;
};

export type ResolvedHostDisplayProfile = {
  hostName: string;
  hostEmail: string;
  hostPhone: string;
  preferredLanguage: string;
  profilePhoto: string | null;
  propertyName: string;
  propertyAddress: string;
  city: string;
  state: string;
  gstin: string | null;
  documents: Array<{ kind: string; label: string; url: string | null }>;
  gallery: string[];
  reel: string | null;
  rooms: Array<{
    id: string;
    name: string;
    isActive: boolean;
    amenitiesCount: number;
    photosCount: number;
    pricing: {
      morning: number | null;
      afternoon: number | null;
      evening: number | null;
      fullday: number | null;
    };
  }>;
  proStatus: "active" | "grace" | "inactive";
  channelMappingStatus: "connected" | "not_connected";
  sources: {
    hostName: string;
    hostEmail: string;
    hostPhone: string;
    preferredLanguage: string;
    profilePhoto: string;
    propertyName: string;
    propertyAddress: string;
    city: string;
    state: string;
    gstin: string;
    documents: string;
    gallery: string;
    reel: string;
    rooms: string;
    proStatus: string;
    channelMappingStatus: string;
  };
};

export async function resolveHostDisplayProfile(
  supabase: SupabaseClient,
  input: {
    hostUserId?: string | null;
    familyId?: string | null;
    hostRow?: JsonRecord | null;
    familyRow?: JsonRecord | null;
    authUser?: AuthUserLike;
    onboardingPayload?: unknown;
    gstProfileRow?: JsonRecord | null;
    gallery?: GalleryLike;
    reel?: ReelLike;
    rooms?: RoomLike;
    channelFoundation?: ChannelFoundationLike;
    proStatus?: string | null;
  }
): Promise<ResolvedHostDisplayProfile> {
  const userProfile =
    typeof input.hostUserId === "string" && input.hostUserId.trim().length > 0
      ? await loadUserProfileCompatibility(supabase, input.hostUserId)
      : null;
  const familyRow = input.familyRow ?? null;
  const hostRow = input.hostRow ?? null;
  const onboardingPayload = parseLooseJsonObject(input.onboardingPayload);
  const meta = parseHostListingMeta(firstString(familyRow?.admin_notes));

  const gstProfile =
    input.gstProfileRow ??
    (typeof input.hostUserId === "string" && input.hostUserId.trim().length > 0
      ? await loadHostGstProfileSafe(supabase, input.hostUserId)
      : null);

  const hostName = pickFirstString(
    ["host_profile.display_name", hostRow?.display_name],
    ["host_profile.full_name", asObject(hostRow?.metadata)?.full_name],
    ["host_profile.user_profile.name", userProfile?.name],
    ["family.host_name", familyRow?.host_name],
    ["family.owner_name", familyRow?.owner_name],
    ["family.primary_host_name", familyRow?.primary_host_name],
    ["latest_onboarding_payload.hostName", onboardingPayload.hostName],
    ["latest_onboarding_payload.fullName", onboardingPayload.fullName],
    ["latest_onboarding_payload.name", onboardingPayload.name],
    ["auth_user.metadata.name", asObject(hostRow?.user_metadata)?.name],
    ["auth_user.profile.name", userProfile?.name],
  ) ?? { source: "fallback", value: "Host" };

  const hostEmail = pickFirstString(
    ["auth_user.email", input.authUser?.email],
    ["host_profile.email", asObject(hostRow?.metadata)?.email],
    ["host_profile.user_profile.email", userProfile?.email],
    ["family.contact_email", familyRow?.contact_email],
    ["family.host_email", familyRow?.host_email],
    ["family.email", familyRow?.email],
    ["latest_onboarding_payload.email", onboardingPayload.email],
    ["latest_onboarding_payload.hostEmail", onboardingPayload.hostEmail],
  ) ?? { source: "fallback", value: "Not added" };

  const hostPhone = pickFirstString(
    ["host_profile.phone", asObject(hostRow?.metadata)?.phone],
    ["host_profile.phone_number", asObject(hostRow?.metadata)?.phone_number],
    ["host_profile.user_profile.phone", userProfile?.phone],
    ["family.phone", familyRow?.phone],
    ["family.contact_phone", familyRow?.contact_phone],
    ["family.host_phone", familyRow?.host_phone],
    ["latest_onboarding_payload.phone", onboardingPayload.phone],
    ["latest_onboarding_payload.phoneNumber", onboardingPayload.phoneNumber],
    ["latest_onboarding_payload.hostPhone", onboardingPayload.hostPhone],
    ["latest_onboarding_payload.contactPhone", onboardingPayload.contactPhone],
    ["auth_user.phone", input.authUser?.phone],
  ) ?? { source: "fallback", value: "Not added" };

  const preferredLanguage = pickFirstString(
    ["host_profile.preferred_language", asObject(hostRow?.metadata)?.preferred_language],
    ["host_profile.user_profile.preferred_language", asObject(userProfile as unknown)?.preferred_language],
    ["family.preferred_language", familyRow?.preferred_language],
    ["family.language", familyRow?.language],
    ["family.languages_spoken", firstListString(familyRow?.languages_spoken)],
    ["family.languages", firstListString(familyRow?.languages)],
    ["latest_onboarding_payload.preferredLanguage", onboardingPayload.preferredLanguage],
    ["latest_onboarding_payload.preferred_language", onboardingPayload.preferred_language],
    ["latest_onboarding_payload.language", onboardingPayload.language],
  ) ?? { source: "fallback", value: "Not added" };

  const profilePhoto = pickFirstString(
    ["host_profile.avatar_url", userProfile?.avatar_url],
    ["host_profile.profile_photo_url", asObject(hostRow?.metadata)?.profile_photo_url],
    ["family.host_image_url", familyRow?.host_image_url],
    ["family.profile_image_url", familyRow?.profile_image_url],
    ["family.host_photo_url", familyRow?.host_photo_url],
    ["latest_onboarding_payload.profilePhotoUrl", onboardingPayload.profilePhotoUrl],
    ["latest_onboarding_payload.hostPhotoUrl", onboardingPayload.hostPhotoUrl],
    ["latest_onboarding_payload.hostPhoto", onboardingPayload.hostPhoto],
    ["public_profile.host_image", input.gallery?.[0]?.url],
  );

  const propertyName = pickFirstString(
    ["family.property_name", familyRow?.property_name],
    ["family.name", familyRow?.name],
    ["latest_onboarding_payload.propertyName", onboardingPayload.propertyName],
    ["latest_onboarding_payload.homeName", onboardingPayload.homeName],
  ) ?? { source: "fallback", value: "Property" };

  const propertyAddress = pickFirstString(
    ["family.address", familyRow?.address],
    ["family.address_line", familyRow?.address_line],
    ["family.street_address", familyRow?.street_address],
    ["family.location_fields", buildLocationAddress(familyRow)],
    ["latest_onboarding_payload.address", onboardingPayload.address],
    ["latest_onboarding_payload.propertyAddress", onboardingPayload.propertyAddress],
  ) ?? { source: "fallback", value: "Not added" };

  const city = pickFirstString(
    ["family.city", familyRow?.city],
    ["latest_onboarding_payload.city", onboardingPayload.city],
  ) ?? { source: "fallback", value: "Not added" };

  const gstState = resolveStateFromGstinRow(gstProfile);
  const state = pickFirstString(
    ["family.state", familyRow?.state],
    ["latest_onboarding_payload.state", onboardingPayload.state],
    ["gst_profile.state", gstState],
  ) ?? { source: "fallback", value: "Not added" };

  const gstin = pickFirstString(
    ["host_gst_profile.gstin", gstProfile?.gstin],
    ["family.gstin", familyRow?.gstin],
    ["latest_onboarding_payload.gstin", onboardingPayload.gstin],
    ["latest_onboarding_payload.gstNumber", onboardingPayload.gstNumber],
  );

  const documents = resolveDocuments(familyRow, onboardingPayload, meta);
  const gallery = Array.from(
    new Set(
      (input.gallery ?? [])
        .map((item) => firstString(item?.url))
        .filter((value): value is string => Boolean(value))
    )
  );
  const reel = firstString(input.reel?.publicUrl, input.reel?.url, onboardingPayload.reelUrl, onboardingPayload.hostReel);
  const rooms = (input.rooms ?? []).map((room) => ({
    id: room.id,
    name: firstString(room.name) ?? "Room",
    isActive: room.isActive !== false,
    amenitiesCount: Array.isArray(room.amenities) ? room.amenities.length : 0,
    photosCount: (Array.isArray(room.photos) ? room.photos.length : 0) + (Array.isArray(room.localityPhotos) ? room.localityPhotos.length : 0),
    pricing: {
      morning: asNumber(room.priceMorning),
      afternoon: asNumber(room.priceAfternoon),
      evening: asNumber(room.priceEvening),
      fullday: asNumber(room.priceFullday),
    },
  }));

  const proStatus = normalizeProStatus(input.proStatus);
  const channelMappingStatus = resolveChannelMappingStatus(input.channelFoundation ?? null);

  return {
    hostName: hostName.value,
    hostEmail: hostEmail.value,
    hostPhone: hostPhone.value,
    preferredLanguage: preferredLanguage.value,
    profilePhoto: profilePhoto?.value ?? null,
    propertyName: propertyName.value,
    propertyAddress: propertyAddress.value,
    city: city.value,
    state: state.value,
    gstin: gstin?.value ?? null,
    documents: documents.items,
    gallery,
    reel: reel ?? null,
    rooms,
    proStatus,
    channelMappingStatus,
    sources: {
      hostName: hostName.source,
      hostEmail: hostEmail.source,
      hostPhone: hostPhone.source,
      preferredLanguage: preferredLanguage.source,
      profilePhoto: profilePhoto?.source ?? "fallback",
      propertyName: propertyName.source,
      propertyAddress: propertyAddress.source,
      city: city.source,
      state: state.source,
      gstin: gstin?.source ?? "fallback",
      documents: documents.source,
      gallery: gallery.length > 0 ? (input.gallery?.[0]?.source ?? "property_media.gallery") : "fallback",
      reel: reel ? (input.reel?.source ?? "property_media.reel") : "fallback",
      rooms: rooms.length > 0 ? "stay_units_v2" : "fallback",
      proStatus: input.proStatus ? "host_pro_subscriptions" : "fallback",
      channelMappingStatus: input.channelFoundation ? "channel_mapping_tables" : "fallback",
    },
  };
}

function asObject(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed.length > 0) return trimmed;
  }
  return null;
}

function firstListString(value: unknown): string | null {
  if (Array.isArray(value)) {
    const items = value
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean);
    return items.length > 0 ? items.join(", ") : null;
  }
  return firstString(value);
}

function pickFirstString(...pairs: Array<[string, unknown]>): SourceValue<string> | null {
  for (const [source, value] of pairs) {
    const normalized = firstString(value);
    if (normalized) {
      return { source, value: normalized };
    }
  }
  return null;
}

function parseLooseJsonObject(value: unknown): JsonRecord {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as JsonRecord;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as JsonRecord) : {};
    } catch {
      return {};
    }
  }
  return {};
}

async function loadHostGstProfileSafe(
  supabase: SupabaseClient,
  hostUserId: string
): Promise<JsonRecord | null> {
  const { data, error } = await supabase
    .from("host_gst_profiles")
    .select("gstin")
    .eq("user_id", hostUserId)
    .maybeSingle();
  if (error) return null;
  return (data as JsonRecord | null) ?? null;
}

function resolveStateFromGstinRow(row: JsonRecord | null): string | null {
  const gstin = firstString(row?.gstin);
  if (!gstin || gstin.length < 2) return null;
  const code = gstin.slice(0, 2);
  return GST_STATE_BY_CODE[code] ?? null;
}

function buildLocationAddress(familyRow: JsonRecord | null): string | null {
  const parts = [
    firstString(familyRow?.street_address),
    firstString(familyRow?.village),
    firstString(familyRow?.city),
    firstString(familyRow?.state),
  ].filter((value): value is string => Boolean(value));
  return parts.length > 0 ? parts.join(", ") : null;
}

function resolveDocuments(
  familyRow: JsonRecord | null,
  onboardingPayload: JsonRecord,
  meta: ReturnType<typeof parseHostListingMeta>
): { source: string; items: Array<{ kind: string; label: string; url: string | null }> } {
  const complianceDocs = [
    { kind: "property_ownership_proof", label: "Property ownership proof", url: firstString(meta.propertyOwnershipUrl) },
    { kind: "live_selfie", label: "Live verification selfie", url: firstString(familyRow?.live_selfie_url, meta.liveSelfieUrl) },
    { kind: "id_proof", label: "ID proof", url: firstString(familyRow?.id_document_url, meta.idDocumentUrl, meta.idDocumentPhotoUrl) },
    { kind: "pan_card", label: "PAN card", url: firstString(meta.panCardUrl) },
    { kind: "noc_permission", label: "NOC / permission", url: firstString(meta.nocUrl) },
  ].filter((item) => item.url);
  if (complianceDocs.length > 0) {
    return { source: "compliance_tables", items: complianceDocs };
  }

  const onboardingDocs = [
    { kind: "property_ownership_proof", label: "Property ownership proof", url: firstString(onboardingPayload.propertyOwnershipUrl) },
    { kind: "live_selfie", label: "Live verification selfie", url: firstString(onboardingPayload.liveSelfieUrl) },
    { kind: "id_proof", label: "ID proof", url: firstString(onboardingPayload.idDocumentUrl) },
    { kind: "pan_card", label: "PAN card", url: firstString(onboardingPayload.panCardUrl) },
    { kind: "platform_agreement", label: "Platform agreement", url: firstString(onboardingPayload.platformAgreementUrl) },
  ].filter((item) => item.url);
  if (onboardingDocs.length > 0) {
    return { source: "onboarding_tables", items: onboardingDocs };
  }

  return { source: "fallback", items: [] };
}

function normalizeProStatus(value: string | null | undefined): "active" | "grace" | "inactive" {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (normalized === "active") return "active";
  if (normalized === "grace") return "grace";
  return "inactive";
}

function resolveChannelMappingStatus(channelFoundation: ChannelFoundationLike): "connected" | "not_connected" {
  const hasPropertyConnection = Boolean(
    channelFoundation?.properties?.some((property) => property.syncStatus === "connected")
  );
  const hasRoomMapping = Boolean(
    channelFoundation?.roomMappings?.some((mapping) => firstString(mapping.externalRoomTypeId))
  );
  return hasPropertyConnection || hasRoomMapping ? "connected" : "not_connected";
}

const GST_STATE_BY_CODE: Record<string, string> = {
  "01": "Jammu and Kashmir",
  "02": "Himachal Pradesh",
  "03": "Punjab",
  "04": "Chandigarh",
  "05": "Uttarakhand",
  "06": "Haryana",
  "07": "Delhi",
  "08": "Rajasthan",
  "09": "Uttar Pradesh",
  "10": "Bihar",
  "11": "Sikkim",
  "12": "Arunachal Pradesh",
  "13": "Nagaland",
  "14": "Manipur",
  "15": "Mizoram",
  "16": "Tripura",
  "17": "Meghalaya",
  "18": "Assam",
  "19": "West Bengal",
  "20": "Jharkhand",
  "21": "Odisha",
  "22": "Chhattisgarh",
  "23": "Madhya Pradesh",
  "24": "Gujarat",
  "26": "Dadra and Nagar Haveli and Daman and Diu",
  "27": "Maharashtra",
  "29": "Karnataka",
  "30": "Goa",
  "31": "Lakshadweep",
  "32": "Kerala",
  "33": "Tamil Nadu",
  "34": "Puducherry",
  "35": "Andaman and Nicobar Islands",
  "36": "Telangana",
  "37": "Andhra Pradesh",
  "38": "Ladakh",
};
