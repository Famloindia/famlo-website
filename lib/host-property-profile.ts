import type { SupabaseClient } from "@supabase/supabase-js";

import { parseHostListingMeta, type HostListingMeta } from "@/lib/host-listing-meta";
import { getPublicCoordinates } from "@/lib/location-utils";
import { resolvePublicPropertyMedia } from "@/lib/property-public-media";

type JsonRecord = Record<string, unknown>;

export type HostIdentityProfile = {
  userId: string;
  displayName: string;
  profilePhotoUrl: string;
  hobbies: string[];
  languages: string[];
  biography: string;
};

export type PropertyListingProfile = {
  familyId: string;
  hostId: string | null;
  propertyName: string;
  listingTitle: string;
  hostBio: string;
  city: string;
  state: string;
  locality: string;
  journeyStory: string;
  specialExperience: string;
  localExperience: string;
  culturalOffering: string;
  homeType: string;
  interactionType: string;
  houseRules: string[];
  amenities: string[];
  foodTypes: string[];
  includedItems: string[];
  bathroomType: string;
  checkInTime: string;
  checkOutTime: string;
  commonAreas: string[];
  streetAddress: string;
  googleMapsLink: string;
  exactLatitude: number | null;
  exactLongitude: number | null;
  publicLatitude: number | null;
  publicLongitude: number | null;
  nearbyPlaces: unknown[];
  neighborhoodDescription: string;
  accessibilityDescription: string;
  pincode: string;
  familyType: string;
};

export type ListingPhoto = {
  id: string;
  url: string;
  isPrimary: boolean;
  createdAt: string;
  source: string;
};

export type ListingReel = {
  id: string;
  publicUrl: string;
  storageKey: string;
  title: string;
  caption: string;
  mimeType: string;
  sizeBytes: number | null;
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
  isFeatured: boolean;
  createdAt: string;
  updatedAt: string;
  source: string;
};

export type HostPropertyListingProfile = {
  identity: HostIdentityProfile;
  property: PropertyListingProfile;
  photos: ListingPhoto[];
  reels: ListingReel[];
};

export type PublicListingProfile = Omit<HostPropertyListingProfile, "identity" | "property" | "reels"> & {
  identity: Omit<HostIdentityProfile, "userId">;
  property: Omit<
    PropertyListingProfile,
    "streetAddress" | "googleMapsLink" | "exactLatitude" | "exactLongitude" | "pincode"
  >;
  reels: Array<Omit<ListingReel, "storageKey">>;
};

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function firstString(...values: unknown[]): string {
  for (const value of values) {
    const next = asString(value);
    if (next) return next;
  }
  return "";
}

function splitListString(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function normalizeProfileList(value: unknown): string[] {
  const values = Array.isArray(value)
    ? value.map((item) => asString(item)).filter(Boolean)
    : typeof value === "string"
      ? splitListString(value)
      : [];
  const seen = new Set<string>();
  const result: string[] = [];

  for (const item of values) {
    const key = item.toLocaleLowerCase("en-IN");
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function firstList(...values: unknown[]): string[] {
  for (const value of values) {
    const next = normalizeProfileList(value);
    if (next.length > 0) return next;
  }
  return [];
}

function hasOwn(value: unknown, key: string): boolean {
  return Boolean(value) && typeof value === "object" && Object.prototype.hasOwnProperty.call(value, key);
}

function canonicalList(row: JsonRecord, key: string, canonical: boolean, ...fallbacks: unknown[]): string[] {
  if (canonical || hasOwn(row, key)) {
    const value = row[key];
    if (canonical || value !== null) return normalizeProfileList(value);
  }
  return firstList(...fallbacks);
}

function canonicalString(row: JsonRecord, key: string, canonical: boolean, ...fallbacks: unknown[]): string {
  if (canonical || hasOwn(row, key)) {
    const value = asString(row[key]);
    if (canonical || row[key] !== null) return value;
  }
  return firstString(...fallbacks);
}

export function normalizeListingTime(value: unknown): string {
  const raw = asString(value);
  if (!raw) return "";

  const twelveHour = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*([AP]M)$/i);
  if (twelveHour) {
    let hours = Number(twelveHour[1]);
    const minutes = Number(twelveHour[2]);
    if (hours < 1 || hours > 12 || minutes > 59) return "";
    const period = twelveHour[3].toUpperCase();
    if (period === "AM" && hours === 12) hours = 0;
    if (period === "PM" && hours !== 12) hours += 12;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  }

  const twentyFourHour = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/);
  if (!twentyFourHour) return "";
  const hours = Number(twentyFourHour[1]);
  const minutes = Number(twentyFourHour[2]);
  if (hours > 23 || minutes > 59) return "";
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function formatListingTime(value: unknown): string {
  const normalized = normalizeListingTime(value);
  if (!normalized) return "";
  const [hourText, minuteText] = normalized.split(":");
  const hours = Number(hourText);
  const period = hours >= 12 ? "PM" : "AM";
  const displayHours = hours % 12 || 12;
  return `${displayHours}:${minuteText} ${period}`;
}

function draftRules(payload: JsonRecord): string[] {
  return firstList(payload.houseRules, payload.houseRulesText, payload.customRules);
}

function parseNearbyPlaces(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

const FAMILY_TYPES = ["Joint family", "Nuclear family", "Couple", "Solo host", "Shared household"];
const HOME_TYPES = ["Independent home", "Apartment", "Villa", "Farm stay", "Heritage home"];
const INTERACTION_TYPES = [
  "Friendly and available",
  "Extrovert",
  "Introvert",
  "Quiet and helpful",
  "Highly social",
  "Flexible",
  "Social and interactive",
  "Available when needed",
  "Independent stay",
];

function normalizeFamilyType(value: unknown): string {
  const raw = asString(value);
  return FAMILY_TYPES.find((option) => option.toLowerCase() === raw.toLowerCase()) ?? "";
}

function normalizeHomeType(value: unknown): string {
  const raw = asString(value);
  if (normalizeFamilyType(raw)) return "";
  return HOME_TYPES.find((option) => option.toLowerCase() === raw.toLowerCase()) ?? raw;
}

function normalizeInteractionType(value: unknown): string {
  const raw = asString(value);
  return INTERACTION_TYPES.find((option) => option.toLowerCase() === raw.toLowerCase()) ?? raw;
}

async function latestLegacyPayload(supabase: SupabaseClient, familyId: string): Promise<JsonRecord> {
  const { data } = await supabase
    .from("host_onboarding_drafts")
    .select("payload")
    .eq("family_id", familyId)
    .in("listing_status", ["submitted", "approved"])
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return asRecord(data?.payload);
}

export async function getHostPropertyListingProfile(
  supabase: SupabaseClient,
  input: {
    familyId: string;
    familyRow?: JsonRecord | null;
    hostRow?: JsonRecord | null;
    includeLegacyFallback?: boolean;
  }
): Promise<HostPropertyListingProfile> {
  const includeLegacyFallback = input.includeLegacyFallback ?? true;
  const [familyResult, hostResult] = await Promise.all([
    input.familyRow
      ? Promise.resolve({ data: input.familyRow, error: null })
      : supabase.from("families").select("*").eq("id", input.familyId).maybeSingle(),
    input.hostRow
      ? Promise.resolve({ data: input.hostRow, error: null })
      : supabase.from("hosts").select("*").eq("legacy_family_id", input.familyId).maybeSingle(),
  ]);
  if (familyResult.error) throw familyResult.error;
  if (!familyResult.data) throw new Error("Property not found.");
  if (hostResult.error) throw hostResult.error;

  const family = asRecord(familyResult.data);
  const host = asRecord(hostResult.data);
  const familyId = asString(family.id) || input.familyId;
  const hostId = asString(host.id) || null;
  const userId = firstString(family.user_id, host.user_id);
  if (!userId) throw new Error("Property owner is not linked to a user.");

  const [userResult, payload, media] = await Promise.all([
    supabase.from("users").select("*").eq("id", userId).maybeSingle(),
    includeLegacyFallback ? latestLegacyPayload(supabase, familyId) : Promise.resolve({} as JsonRecord),
    resolvePublicPropertyMedia(supabase, {
      familyId,
      hostId,
      familyRow: family,
      hostRow: host,
      debugContext: "canonical-listing-profile",
    }),
  ]);
  if (userResult.error) throw userResult.error;
  const user = asRecord(userResult.data);
  const meta: HostListingMeta = includeLegacyFallback
    ? parseHostListingMeta(asString(family.admin_notes) || null)
    : {};
  const hostCanonical = Number(user.host_profile_version ?? 0) >= 1;
  const propertyCanonical = Number(family.listing_profile_version ?? 0) >= 1;

  const identity: HostIdentityProfile = {
    userId,
    displayName: canonicalString(
      user,
      "name",
      hostCanonical,
      host.display_name,
      family.primary_host_name,
      family.host_name,
      meta.hostDisplayName,
      payload.hostName,
      payload.fullName
    ),
    profilePhotoUrl: canonicalString(
      user,
      "avatar_url",
      hostCanonical,
      family.host_photo_url,
      host.host_photo_url,
      meta.hostSelfieUrl,
      payload.hostPhoto,
      payload.hostPhotoUrl
    ),
    hobbies: canonicalList(user, "host_hobbies", hostCanonical, meta.hostHobbies, payload.hostHobbies, payload.hobbies),
    languages: canonicalList(
      user,
      "host_languages",
      hostCanonical,
      family.languages_spoken,
      family.languages,
      host.languages,
      payload.languages,
      payload.languagesSpoken
    ),
    biography: canonicalString(user, "about", hostCanonical, family.about, host.about, payload.hostBio),
  };

  const checkInSeed = canonicalString(family, "check_in_time", propertyCanonical, meta.checkInTime, payload.checkInTime);
  const checkOutSeed = canonicalString(family, "check_out_time", propertyCanonical, meta.checkOutTime, payload.checkOutTime);
  const property: PropertyListingProfile = {
    familyId,
    hostId,
    propertyName: canonicalString(family, "property_name", propertyCanonical, family.name, payload.propertyName),
    listingTitle: canonicalString(family, "listing_title", propertyCanonical, meta.listingTitle, payload.listingTitle),
    hostBio: canonicalString(family, "about", propertyCanonical, family.description, host.about, payload.hostBio),
    city: canonicalString(family, "city", propertyCanonical, host.city, payload.city, payload.cityName),
    state: canonicalString(family, "state", propertyCanonical, host.state, payload.state),
    locality: canonicalString(
      family,
      "village",
      propertyCanonical,
      family.locality,
      host.locality,
      meta.neighbourhood,
      payload.cityNeighbourhood,
      payload.villageName
    ),
    journeyStory: canonicalString(family, "journey_story", propertyCanonical, meta.journeyStory, payload.journeyStory),
    specialExperience: canonicalString(family, "special_experience", propertyCanonical, meta.specialExperience, payload.specialExperience),
    localExperience: canonicalString(family, "local_experience", propertyCanonical, meta.localExperience, payload.localExperience),
    culturalOffering: canonicalString(family, "famlo_experience", propertyCanonical, meta.culturalOffering, payload.culturalActivity),
    homeType: normalizeHomeType(
      canonicalString(family, "house_type", propertyCanonical, meta.houseType, payload.houseType)
    ),
    interactionType: normalizeInteractionType(
      canonicalString(family, "interaction_type", propertyCanonical, meta.interactionType, payload.interactionType)
    ),
    houseRules: canonicalList(family, "house_rules", propertyCanonical, host.house_rules, meta.houseRules, draftRules(payload)),
    amenities: canonicalList(family, "amenities", propertyCanonical, host.amenities, meta.amenities, payload.amenities),
    foodTypes: canonicalList(family, "food_types", propertyCanonical, family.food_type, host.food_type, meta.foodType, payload.foodType),
    includedItems: canonicalList(family, "included_items", propertyCanonical, meta.includedItems, payload.includedItems, payload.includedHighlights),
    bathroomType: canonicalString(family, "bathroom_type", propertyCanonical, meta.bathroomType, payload.bathroomType),
    checkInTime: normalizeListingTime(checkInSeed),
    checkOutTime: normalizeListingTime(checkOutSeed),
    commonAreas: canonicalList(family, "common_areas", propertyCanonical, host.common_areas, meta.commonAreas, payload.commonAreas),
    streetAddress: canonicalString(family, "street_address", propertyCanonical, family.address, host.address_private, meta.propertyAddress, payload.propertyAddress),
    googleMapsLink: canonicalString(family, "google_maps_link", propertyCanonical, meta.googleMapsLink, payload.googleMapsLink),
    exactLatitude: asNumber(family.lat_exact ?? host.lat_exact),
    exactLongitude: asNumber(family.lng_exact ?? host.lng_exact),
    publicLatitude: asNumber(family.lat ?? host.lat),
    publicLongitude: asNumber(family.lng ?? host.lng),
    nearbyPlaces: parseNearbyPlaces(family.nearby_places ?? family.landmarks ?? payload.nearbyPlaces),
    neighborhoodDescription: canonicalString(family, "neighborhood_desc", propertyCanonical, host.neighborhood_desc, payload.neighborhoodDesc),
    accessibilityDescription: canonicalString(family, "accessibility_desc", propertyCanonical, host.accessibility_desc, payload.accessibilityDesc),
    pincode: canonicalString(family, "pincode", propertyCanonical, host.pincode, payload.pincode),
    familyType: propertyCanonical
      ? normalizeFamilyType(family.host_family_type)
      : normalizeFamilyType(
          firstString(
            family.host_family_type,
            family.family_composition,
            host.family_composition,
            meta.familyComposition,
            payload.familyType,
            payload.familyComposition,
            family.family_type,
            meta.houseType
          )
        ),
  };

  return {
    identity,
    property,
    photos: media.gallery.map((photo) => ({
      id: photo.id,
      url: photo.url,
      isPrimary: photo.isPrimary,
      createdAt: photo.createdAt,
      source: photo.source,
    })),
    reels: media.reels.map((reel) => ({
      id: reel.id,
      publicUrl: reel.publicUrl,
      storageKey: reel.storageKey,
      title: reel.title,
      caption: reel.caption,
      mimeType: reel.mimeType,
      sizeBytes: reel.sizeBytes,
      durationSeconds: reel.durationSeconds,
      width: reel.width,
      height: reel.height,
      isFeatured: reel.isFeatured,
      createdAt: reel.createdAt,
      updatedAt: reel.updatedAt,
      source: reel.source,
    })),
  };
}

export async function getPublicListingProfile(
  supabase: SupabaseClient,
  input: Parameters<typeof getHostPropertyListingProfile>[1]
): Promise<PublicListingProfile> {
  const profile = await getHostPropertyListingProfile(supabase, input);
  return toPublicListingProfile(profile);
}

export function toPublicListingProfile(
  profile: HostPropertyListingProfile
): PublicListingProfile {
  const publicCoordinates = getPublicCoordinates({
    lat: profile.property.publicLatitude,
    lng: profile.property.publicLongitude,
    latExact: profile.property.exactLatitude,
    lngExact: profile.property.exactLongitude,
    seed: profile.property.familyId,
  });
  const {
    streetAddress: _streetAddress,
    googleMapsLink: _googleMapsLink,
    exactLatitude: _exactLatitude,
    exactLongitude: _exactLongitude,
    pincode: _pincode,
    ...publicProperty
  } = profile.property;
  const { userId: _userId, ...publicIdentity } = profile.identity;
  return {
    ...profile,
    identity: publicIdentity,
    property: {
      ...publicProperty,
      publicLatitude: publicCoordinates?.lat ?? null,
      publicLongitude: publicCoordinates?.lng ?? null,
      nearbyPlaces: publicProperty.nearbyPlaces.map((place) => {
        const row = asRecord(place);
        return compactPatch({
          name: patchString(row, "name"),
          distance: patchString(row, "distance"),
          unit: patchString(row, "unit"),
          description: patchString(row, "description"),
        });
      }),
    },
    reels: profile.reels.map(({ storageKey: _storageKey, ...reel }) => reel),
  };
}

function patchString(source: JsonRecord, key: string): string | null | undefined {
  if (!hasOwn(source, key)) return undefined;
  const value = source[key];
  if (value === null) return null;
  return asString(value) || null;
}

function patchList(source: JsonRecord, key: string): string[] | undefined {
  return hasOwn(source, key) ? normalizeProfileList(source[key]) : undefined;
}

function compactPatch(value: JsonRecord): JsonRecord {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

export async function updateHostPropertyListingProfile(
  supabase: SupabaseClient,
  input: {
    familyId: string;
    identityPatch?: JsonRecord;
    propertyPatch?: JsonRecord;
  }
): Promise<HostPropertyListingProfile> {
  const { data: family, error: familyError } = await supabase
    .from("families")
    .select("id,user_id")
    .eq("id", input.familyId)
    .maybeSingle();
  if (familyError) throw familyError;
  if (!family?.id || !family.user_id) throw new Error("Property owner was not found.");

  const identity = asRecord(input.identityPatch);
  const property = asRecord(input.propertyPatch);
  const normalizedPropertyPatch = compactPatch({
    propertyName: patchString(property, "propertyName"),
    listingTitle: patchString(property, "listingTitle"),
    hostBio: patchString(property, "hostBio"),
    city: patchString(property, "city"),
    state: patchString(property, "state"),
    locality: patchString(property, "locality"),
    journeyStory: patchString(property, "journeyStory"),
    specialExperience: patchString(property, "specialExperience"),
    localExperience: patchString(property, "localExperience"),
    culturalOffering: patchString(property, "culturalOffering"),
    homeType: patchString(property, "homeType"),
    interactionType: patchString(property, "interactionType"),
    houseRules: patchList(property, "houseRules"),
    amenities: patchList(property, "amenities"),
    foodTypes: patchList(property, "foodTypes"),
    includedItems: patchList(property, "includedItems"),
    bathroomType: patchString(property, "bathroomType"),
    checkInTime: hasOwn(property, "checkInTime") ? normalizeListingTime(property.checkInTime) || null : undefined,
    checkOutTime: hasOwn(property, "checkOutTime") ? normalizeListingTime(property.checkOutTime) || null : undefined,
    commonAreas: patchList(property, "commonAreas"),
    streetAddress: patchString(property, "streetAddress"),
    googleMapsLink: patchString(property, "googleMapsLink"),
    nearbyPlaces: hasOwn(property, "nearbyPlaces") ? parseNearbyPlaces(property.nearbyPlaces) : undefined,
    neighborhoodDescription: patchString(property, "neighborhoodDescription"),
    accessibilityDescription: patchString(property, "accessibilityDescription"),
    pincode: patchString(property, "pincode"),
    familyType: patchString(property, "familyType"),
  });
  const normalizedIdentityPatch = compactPatch({
    displayName: patchString(identity, "displayName"),
    profilePhotoUrl: patchString(identity, "profilePhotoUrl"),
    hobbies: patchList(identity, "hobbies"),
    languages: patchList(identity, "languages"),
    biography: patchString(identity, "biography"),
  });
  const { error: updateError } = await supabase.rpc("update_host_property_listing_profile", {
    p_family_id: input.familyId,
    p_identity: normalizedIdentityPatch,
    p_property: normalizedPropertyPatch,
  });
  if (updateError) throw updateError;

  return getHostPropertyListingProfile(supabase, {
    familyId: input.familyId,
    includeLegacyFallback: true,
  });
}
