import { parseHostListingMeta } from "@/lib/host-listing-meta";
import { canListOnMarketplace } from "@/lib/host-access-policy";
import { resolveHomeRoute } from "@/lib/home-route-resolution";
import { getPublicCoordinates, parseGoogleMapsCoordinates } from "@/lib/location-utils";
import { buildHomestayPath, buildListingSlug } from "@/lib/slug";
import { createAdminSupabaseClient } from "@/lib/supabase";
import { unstable_cache } from "next/cache";

export interface HomeCardRecord {
  id: string;
  href: string;
  hostId: string | null;
  hostUserId: string | null;
  legacyFamilyId: string | null;
  name: string;
  hostName?: string | null;
  city: string | null;
  state: string | null;
  village: string | null;
  description: string | null;
  culturalOffering: string | null;
  includedItems: string[];
  houseRules: string[];
  amenities: string[];
  bathroomType: string | null;
  listingTitle: string | null;
  maxGuests: number | null;
  roomCount: number | null;
  startingRoomPrice: number | null;
  priceMorning: number;
  priceAfternoon: number;
  priceEvening: number;
  priceFullday: number;
  rating: number | null;
  totalReviews: number | null;
  superhost: boolean;
  isActive: boolean;
  isAccepting: boolean;
  googleMapsLink: string | null;
  activeQuarters: string[];
  blockedDates: string[];
  platformCommissionPct: number;
  bookingRequiresHostApproval?: boolean;
  checkInTime?: string | null;
  checkOutTime?: string | null;
  lat: number | null;
  lng: number | null;
  latExact: number | null;
  lngExact: number | null;
  landmarks: any[];
  neighborhoodDesc: string | null;
  accessibilityDesc: string | null;
  imageUrls: string[];
  roomImageUrls: string[];
  hostPhotoUrl: string | null;
  featured: boolean;
}

export interface CompanionRecord {
  id: string;
  href: string;
  source: "hommies";
  title: string;
  hostName: string | null;
  city: string | null;
  state: string | null;
  locality: string | null;
  description: string | null;
  activities: string[];
  languages: string[];
  hourlyPrice: number | null;
  nightlyPrice: number | null;
  maxGuests: number | null;
  lat: number | null;
  lng: number | null;
  imageUrl: string | null;
  guideId: string | null;
  guideUserId: string | null;
  isActive: boolean;
  rating: number;
  totalReviews: number;
}

export interface AdRecord {
  id: string;
  label: string;
  title: string;
  description: string | null;
  image_url: string;
  city?: string | null;
  state?: string | null;
  locality?: string | null;
  lat?: number | null;
  lng?: number | null;
  radius_km?: number | null;
  cta_text: string;
  cta_url: string;
  is_active: boolean;
  priority: number;
  starts_at?: string | null;
  ends_at?: string | null;
  weekdays?: number[];
  daily_start_time?: string | null;
  daily_end_time?: string | null;
  timezone?: string | null;
  team_owner?: string | null;
  audience?: string | null;
  placement?: string | null;
}

export interface StoryRecord {
  id: string;
  authorName: string | null;
  fromCity: string | null;
  rating: number | null;
  storyText: string | null;
  imageUrls: string[];
  createdAt: string;
}

export interface HomepageReelRecord {
  id: string;
  familyId: string;
  videoUrl: string;
  thumbnailUrl: string | null;
  title: string;
  hostName: string;
  propertyName: string | null;
  location: string | null;
  locality: string | null;
  city: string | null;
  state: string | null;
  listingHref: string;
  viewCount: number;
  isFeatured: boolean;
  source: "host_property_reels" | "family_legacy_reel";
}

export interface HomepageData {
  homes: HomeCardRecord[];
  companions: CompanionRecord[];
  stories: StoryRecord[];
  ads: AdRecord[];
  heroBanners: { imageUrl: string; alt?: string }[];
  hostReels: HomepageReelRecord[];
}

export interface FamilyWithPhotos {
  id: string;
  name: string;
  village: string | null;
  city: string | null;
  state: string | null;
  description: string | null;
  about: string | null;
  price_fullday: number | null;
  max_guests: number | null;
  is_accepting: boolean | null;
  lat: number | null;
  lng: number | null;
  family_photos?: Array<{
    url?: string | null;
    is_primary?: boolean | null;
  }> | null;
}

type FamilyPhotoRow = {
  family_id: string | null;
  url?: string | null;
  is_primary?: boolean | null;
};

type HostMediaRow = {
  host_id: string | null;
  media_url?: string | null;
  is_primary?: boolean | null;
};

type StayUnitSummaryRow = {
  host_id?: string | null;
  legacy_family_id?: string | null;
  unit_key?: string | null;
  name?: string | null;
  unit_type?: string | null;
  description?: string | null;
  price_fullday?: number | string | null;
  price_morning?: number | string | null;
  price_afternoon?: number | string | null;
  price_evening?: number | string | null;
  quarter_enabled?: boolean | null;
  photos?: unknown;
  locality_photos?: unknown;
  is_active?: boolean | null;
};

type PublicHomeCardViewRow = {
  id: string;
  user_id?: string | null;
  legacy_family_id?: string | null;
  slug?: string | null;
  status?: string | null;
  property_marketplace_status?: string | null;
  trust_status?: string | null;
  display_name?: string | null;
  city?: string | null;
  state?: string | null;
  locality?: string | null;
  about?: string | null;
  family_story?: string | null;
  house_rules?: unknown;
  amenities?: unknown;
  bathroom_type?: string | null;
  max_guests?: number | null;
  price_morning?: number | string | null;
  price_afternoon?: number | string | null;
  price_evening?: number | string | null;
  price_fullday?: number | string | null;
  is_accepting?: boolean | null;
  active_quarters?: unknown;
  blocked_dates?: unknown;
  platform_commission_pct?: number | null;
  booking_requires_host_approval?: boolean | null;
  lat?: number | null;
  lng?: number | null;
  lat_exact?: number | null;
  lng_exact?: number | null;
  landmarks?: unknown;
  neighborhood_desc?: string | null;
  accessibility_desc?: string | null;
  admin_notes?: string | null;
  is_featured?: boolean | null;
  host_photo_url?: string | null;
  image_urls?: unknown;
  room_image_urls?: unknown;
  room_count?: number | null;
  starting_room_price?: number | null;
};

function parseStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.length > 0) : [];
}

function toNumber(value: unknown): number {
  return typeof value === "number" ? value : Number(value ?? 0);
}

function asOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function pickObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function pickFirstString(...values: unknown[]): string | null {
  for (const value of values) {
    const normalized = asOptionalString(value);
    if (normalized) return normalized;
  }
  return null;
}

function resolvePublicAssetUrl(...values: unknown[]): string | null {
  const directUrl = pickFirstString(...values.filter((value) => {
    const normalized = asOptionalString(value);
    return normalized ? /^https?:\/\//i.test(normalized) || normalized.startsWith("/") : false;
  }));
  if (directUrl) return directUrl;

  const storageKey = pickFirstString(...values);
  if (!storageKey) return null;

  const publicBase = asOptionalString(process.env.R2_PUBLIC_URL);
  if (!publicBase) return null;
  return `${publicBase.replace(/\/+$/, "")}/${storageKey.replace(/^\/+/, "")}`;
}

function isPublicReelStatus(row: Record<string, unknown>): boolean {
  const status = asOptionalString(row.status)?.toLowerCase();
  if (status && !["active", "published", "approved", "public"].includes(status)) return false;

  const visibility = asOptionalString(row.visibility)?.toLowerCase();
  if (visibility && !["public", "published"].includes(visibility)) return false;

  if (row.is_public === false || row.is_active === false || row.is_deleted === true) return false;
  return true;
}

function payloadHasHostReel(payload: Record<string, unknown>): boolean {
  const hostReels = Array.isArray(payload.hostReels) ? payload.hostReels : [];
  return Boolean(pickFirstString(payload.hostReelPublicUrl, payload.hostReelStorageKey)) || hostReels.length > 0;
}

function selectPrimaryPhoto(
  rows: Array<{ url?: string | null; is_primary?: boolean | null }> | null | undefined
): string[] {
  return (rows ?? [])
    .slice()
    .sort((left, right) => Number(Boolean(right.is_primary)) - Number(Boolean(left.is_primary)))
    .map((row) => row.url ?? "")
    .filter(Boolean);
}

function pickHostProfilePhoto(
  values: Array<string | null | undefined>
): string | null {
  const normalized = values
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter(Boolean);

  const explicitProfile = normalized.find((value) =>
    value.includes("/host-profiles/") || value.includes("host-profiles/")
  );

  return explicitProfile ?? normalized[0] ?? null;
}

async function applyCanonicalHomeProfiles(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  homes: HomeCardRecord[]
): Promise<HomeCardRecord[]> {
  const familyIds = Array.from(new Set(homes.map((home) => home.legacyFamilyId).filter((id): id is string => Boolean(id))));
  if (familyIds.length === 0) return homes;

  const familiesResult = await supabase
    .from("families")
    .select("id,user_id,listing_profile_version,property_name,listing_title,city,state,village")
    .in("id", familyIds);
  if (familiesResult.error) {
    console.warn("[discovery] canonical family profile enrichment failed", { message: familiesResult.error.message });
    return homes;
  }

  const familyById = new Map<string, Record<string, unknown>>();
  const userIds = new Set<string>();
  for (const row of (familiesResult.data ?? []) as Array<Record<string, unknown>>) {
    const familyId = asOptionalString(row.id);
    const userId = asOptionalString(row.user_id);
    if (familyId) familyById.set(familyId, row);
    if (userId) userIds.add(userId);
  }
  homes.forEach((home) => {
    if (home.hostUserId) userIds.add(home.hostUserId);
  });

  const usersResult = userIds.size > 0
    ? await supabase.from("users").select("id,name,avatar_url,host_profile_version").in("id", Array.from(userIds))
    : { data: [] as Array<Record<string, unknown>>, error: null };
  if (usersResult.error) {
    console.warn("[discovery] canonical host identity enrichment failed", { message: usersResult.error.message });
  }
  const userById = new Map<string, Record<string, unknown>>();
  for (const row of (usersResult.data ?? []) as Array<Record<string, unknown>>) {
    const userId = asOptionalString(row.id);
    if (userId) userById.set(userId, row);
  }

  return homes.map((home) => {
    const familyId = home.legacyFamilyId;
    const family = familyId ? familyById.get(familyId) : null;
    if (!familyId || !family) return home;
    const userId = asOptionalString(family.user_id) ?? home.hostUserId;
    const user = userId ? userById.get(userId) : null;
    const hostCanonical = Number(user?.host_profile_version ?? 0) >= 1;
    const propertyCanonical = Number(family.listing_profile_version ?? 0) >= 1;
    const hostName = hostCanonical ? asOptionalString(user?.name) : null;
    const hostPhotoUrl = hostCanonical ? asOptionalString(user?.avatar_url) : null;
    const propertyName = propertyCanonical ? asOptionalString(family.property_name) : null;
    const listingTitle = propertyCanonical ? asOptionalString(family.listing_title) : null;
    const city = propertyCanonical ? asOptionalString(family.city) : null;
    const state = propertyCanonical ? asOptionalString(family.state) : null;
    const village = propertyCanonical ? asOptionalString(family.village) : null;
    const nextName = propertyName ?? home.name;
    const nextTitle = listingTitle ?? propertyName ?? home.listingTitle;
    const nextCity = city ?? home.city;
    const nextVillage = village ?? home.village;

    return {
      ...home,
      hostUserId: userId ?? home.hostUserId,
      hostName: hostName ?? home.hostName,
      hostPhotoUrl: hostCanonical ? hostPhotoUrl : home.hostPhotoUrl,
      name: nextName,
      listingTitle: nextTitle,
      city: nextCity,
      state: state ?? home.state,
      village: nextVillage,
      href: buildHomestayPath(nextTitle ?? nextName, nextVillage, nextCity, familyId),
    };
  });
}

function dedupeUrls(values: Array<string | null | undefined>): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => (typeof value === "string" ? value.trim() : ""))
        .filter(Boolean)
    )
  );
}

function selectRoomImageUrls(
  rows: Array<{ photos?: unknown; locality_photos?: unknown; is_active?: boolean | null }> | null | undefined
): string[] {
  const urls: string[] = [];

  for (const row of rows ?? []) {
    if (row.is_active === false) continue;
    const photos = Array.isArray(row.photos) ? row.photos : [];
    const localityPhotos = Array.isArray(row.locality_photos) ? row.locality_photos : [];

    for (const photo of [...photos, ...localityPhotos]) {
      if (typeof photo === "string" && photo.trim().length > 0) {
        urls.push(photo.trim());
      }
    }
  }

  return dedupeUrls(urls);
}

function toPrice(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }
  return 0;
}

function isMeaningfulStayUnit(row: StayUnitSummaryRow): boolean {
  const hasPrices =
    toPrice(row.price_fullday) > 0 ||
    toPrice(row.price_morning) > 0 ||
    toPrice(row.price_afternoon) > 0 ||
    toPrice(row.price_evening) > 0;
  const hasPhotos =
    (Array.isArray(row.photos) && row.photos.some((photo) => typeof photo === "string" && photo.trim().length > 0)) ||
    (Array.isArray(row.locality_photos) && row.locality_photos.some((photo) => typeof photo === "string" && photo.trim().length > 0));
  const hasCopy = typeof row.name === "string" && row.name.trim().length > 0;
  const hasDescription = typeof row.description === "string" && row.description.trim().length > 0;
  const hasUnitType = typeof row.unit_type === "string" && row.unit_type.trim().length > 0;

  return hasPrices || hasPhotos || hasCopy || hasDescription || hasUnitType;
}

function buildStayUnitStatsMap(rows: StayUnitSummaryRow[], key: "host_id" | "legacy_family_id"): Map<string, { roomCount: number; startingRoomPrice: number | null }> {
  const stats = new Map<string, { roomCount: number; startingRoomPrice: number | null }>();
  const seen = new Set<string>();

  for (const row of rows) {
    const lookup = typeof row[key] === "string" ? row[key] : null;
    if (!lookup) continue;
    if (row.is_active === false) continue;
    if (!isMeaningfulStayUnit(row)) continue;

    const rowKey = `${lookup}::${row.unit_key ?? row.name ?? JSON.stringify(row.photos ?? [])}`;
    if (seen.has(rowKey)) continue;
    seen.add(rowKey);

    const current = stats.get(lookup) ?? { roomCount: 0, startingRoomPrice: null };
    current.roomCount += 1;

    const candidate = [row.price_fullday, row.price_morning, row.price_afternoon, row.price_evening]
      .map((price) => toPrice(price))
      .filter((price) => price > 0)
      .reduce((lowest, price) => Math.min(lowest, price), Number.POSITIVE_INFINITY);
    const normalizedCandidate = Number.isFinite(candidate) ? candidate : 0;
    if (normalizedCandidate > 0) {
      current.startingRoomPrice =
        current.startingRoomPrice == null
          ? normalizedCandidate
          : Math.min(current.startingRoomPrice, normalizedCandidate);
    }

    stats.set(lookup, current);
  }

  return stats;
}

function buildStayUnitImageMap(rows: StayUnitSummaryRow[], key: "host_id" | "legacy_family_id"): Map<string, string[]> {
  const images = new Map<string, string[]>();

  for (const row of rows) {
    const lookup = typeof row[key] === "string" ? row[key] : null;
    if (!lookup) continue;
    if (row.is_active === false) continue;

    const current = images.get(lookup) ?? [];
    const next = dedupeUrls([...current, ...selectRoomImageUrls([row])]);
    images.set(lookup, next);
  }

  return images;
}

async function loadHomepageReels(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  homes: HomeCardRecord[],
  options: { limit?: number } = {}
): Promise<HomepageReelRecord[]> {
  const resultLimit = Math.max(1, Math.min(options.limit ?? 8, 120));
  const homesByFamilyId = new Map<string, HomeCardRecord>();
  const homesByHostId = new Map<string, HomeCardRecord>();
  const homesById = new Map<string, HomeCardRecord>();
  for (const home of homes) {
    if (home.legacyFamilyId) {
      homesByFamilyId.set(home.legacyFamilyId, home);
    }
    if (home.hostId) {
      homesByHostId.set(home.hostId, home);
    }
    homesById.set(home.id, home);
  }

  const [canonicalResult, draftsResult, publicFamiliesResult] = await Promise.all([
    supabase
      .from("host_property_reels")
      .select("*")
      .neq("status", "deleted")
      .order("is_featured", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(Math.max(48, resultLimit)),
    supabase
      .from("host_onboarding_drafts")
      .select("family_id,payload,listing_status,updated_at")
      .eq("listing_status", "approved")
      .order("updated_at", { ascending: false })
      .limit(120),
    supabase
      .from("families")
      .select("*")
      .eq("is_active", true)
      .eq("is_accepting", true)
      .limit(120),
  ]);

  const canonicalRows = canonicalResult.error ? [] : ((canonicalResult.data ?? []) as Array<Record<string, unknown>>);
  if (canonicalResult.error) {
    console.warn("[homepage.discovery] host_property_reels load failed; hiding Host reels", {
      message: canonicalResult.error.message,
    });
  }

  const draftRows = draftsResult.error ? [] : ((draftsResult.data ?? []) as Array<Record<string, unknown>>);
  if (draftsResult.error) {
    console.warn("[homepage.discovery] host_onboarding_drafts reel load failed; legacy reels unavailable", {
      message: draftsResult.error.message,
    });
  }

  const hostIds = new Set<string>();
  const familyIds = new Set<string>();
  const addId = (set: Set<string>, value: unknown) => {
    const normalized = asOptionalString(value);
    if (normalized) set.add(normalized);
  };

  canonicalRows.forEach((row) => {
    addId(familyIds, row.family_id);
    addId(familyIds, row.legacy_family_id);
    addId(familyIds, row.property_id);
    addId(hostIds, row.host_id);
  });
  homes.forEach((home) => addId(familyIds, home.legacyFamilyId));
  ((publicFamiliesResult.data ?? []) as Array<Record<string, unknown>>).forEach((row) => addId(familyIds, row.id));
  draftRows.forEach((row) => {
    if (payloadHasHostReel(pickObject(row.payload))) {
      addId(familyIds, row.family_id);
    }
  });

  const hostsResult = hostIds.size > 0
    ? await supabase.from("hosts").select("*").in("id", Array.from(hostIds))
    : { data: [] as Array<Record<string, unknown>>, error: null };
  if (hostsResult.error) {
    console.warn("[homepage.discovery] host reel host relation load failed", {
      message: hostsResult.error.message,
    });
  }

  const hostRows = ((hostsResult.data ?? []) as Array<Record<string, unknown>>);
  const hostById = new Map<string, Record<string, unknown>>();
  hostRows.forEach((row) => {
    const hostId = asOptionalString(row.id);
    if (hostId) hostById.set(hostId, row);
    addId(familyIds, row.legacy_family_id);
    addId(familyIds, row.family_id);
  });

  const familyIdList = Array.from(familyIds);
  const [familiesResult, familyPhotosResult, publicCardsResult] = await Promise.all([
    familyIdList.length > 0
      ? supabase.from("families").select("*").in("id", familyIdList)
      : Promise.resolve({ data: [] as Array<Record<string, unknown>>, error: null }),
    familyIdList.length > 0
      ? supabase.from("family_photos").select("family_id,url,is_primary").in("family_id", familyIdList)
      : Promise.resolve({ data: [] as Array<Record<string, unknown>>, error: null }),
    familyIdList.length > 0
      ? supabase.from("public_home_cards_v1").select("*").in("legacy_family_id", familyIdList)
      : Promise.resolve({ data: [] as Array<Record<string, unknown>>, error: null }),
  ]);

  if (familiesResult.error) {
    console.warn("[homepage.discovery] host reel family relation load failed", {
      message: familiesResult.error.message,
    });
  }
  if (publicCardsResult.error) {
    console.warn("[homepage.discovery] host reel public card relation load failed", {
      message: publicCardsResult.error.message,
    });
  }

  const familyById = new Map<string, Record<string, unknown>>();
  ((publicFamiliesResult.data ?? []) as Array<Record<string, unknown>>).forEach((row) => {
    const familyId = asOptionalString(row.id);
    if (familyId) familyById.set(familyId, row);
  });
  ((familiesResult.data ?? []) as Array<Record<string, unknown>>).forEach((row) => {
    const familyId = asOptionalString(row.id);
    if (familyId) familyById.set(familyId, row);
  });

  const reelUserIds = Array.from(new Set(Array.from(familyById.values())
    .map((family) => asOptionalString(family.user_id))
    .filter((id): id is string => Boolean(id))));
  const reelUsersResult = reelUserIds.length > 0
    ? await supabase.from("users").select("id,name,avatar_url,host_profile_version").in("id", reelUserIds)
    : { data: [] as Array<Record<string, unknown>>, error: null };
  const reelUserById = new Map<string, Record<string, unknown>>();
  ((reelUsersResult.data ?? []) as Array<Record<string, unknown>>).forEach((row) => {
    const userId = asOptionalString(row.id);
    if (userId) reelUserById.set(userId, row);
  });

  const publicCardByFamilyId = new Map<string, Record<string, unknown>>();
  ((publicCardsResult.data ?? []) as Array<Record<string, unknown>>).forEach((row) => {
    const familyId = asOptionalString(row.legacy_family_id);
    if (familyId) publicCardByFamilyId.set(familyId, row);
  });

  const familyPhotosById = new Map<string, string[]>();
  ((familyPhotosResult.data ?? []) as Array<Record<string, unknown>>)
    .sort((left, right) => Number(right.is_primary === true) - Number(left.is_primary === true))
    .forEach((row) => {
      const familyId = asOptionalString(row.family_id);
      const url = asOptionalString(row.url);
      if (!familyId || !url) return;
      const current = familyPhotosById.get(familyId) ?? [];
      current.push(url);
      familyPhotosById.set(familyId, current);
    });

  const resolveFamilyId = (row: Record<string, unknown>): string | null => {
    const directFamilyId = pickFirstString(row.family_id, row.legacy_family_id, row.property_id);
    if (directFamilyId) return directFamilyId;

    const host = hostById.get(asOptionalString(row.host_id) ?? "");
    return pickFirstString(host?.legacy_family_id, host?.family_id);
  };

  const getRelation = (row: Record<string, unknown>) => {
    const familyId = resolveFamilyId(row);
    const hostId = asOptionalString(row.host_id);
    const cardId = pickFirstString(row.home_id, row.stay_unit_id, row.id);
    const home =
      (familyId ? homesByFamilyId.get(familyId) : undefined) ??
      (hostId ? homesByHostId.get(hostId) : undefined) ??
      (cardId ? homesById.get(cardId) : undefined) ??
      null;
    const family = familyId ? familyById.get(familyId) ?? null : null;
    const publicCard = familyId ? publicCardByFamilyId.get(familyId) ?? null : null;
    const host = hostId ? hostById.get(hostId) ?? null : null;
    const user = family ? reelUserById.get(asOptionalString(family.user_id) ?? "") ?? null : null;
    return { familyId, hostId, home, family, publicCard, host, user };
  };

  const isPublicRelation = (relation: ReturnType<typeof getRelation>): boolean => {
    if (relation.home) {
      return relation.home.isActive !== false && relation.home.isAccepting !== false;
    }
    if (relation.publicCard) {
      const status = asOptionalString(relation.publicCard.status)?.toLowerCase();
      return (!status || status === "published" || status === "active") && relation.publicCard.is_accepting !== false;
    }
    if (relation.family) {
      return relation.family.is_active !== false && relation.family.is_accepting !== false;
    }
    return false;
  };

  const buildTitle = (relation: ReturnType<typeof getRelation>, fallback = "Famlo host reel"): string => {
    return pickFirstString(
      Number(relation.user?.host_profile_version ?? 0) >= 1 && relation.user?.name
        ? `${relation.user.name}'s Famlo reel`
        : null,
      relation.home?.hostName ? `${relation.home.hostName}'s Famlo reel` : null,
      relation.publicCard?.display_name ? `${relation.publicCard.display_name}'s Famlo reel` : null,
      relation.family?.primary_host_name ? `${relation.family.primary_host_name}'s Famlo reel` : null,
      relation.family?.host_name ? `${relation.family.host_name}'s Famlo reel` : null,
      relation.family?.name ? `${relation.family.name} reel` : null,
      relation.host?.display_name ? `${relation.host.display_name}'s Famlo reel` : null,
      fallback
    ) ?? fallback;
  };

  const buildPropertyName = (relation: ReturnType<typeof getRelation>): string | null => {
    return pickFirstString(
      relation.home?.listingTitle,
      relation.home?.name,
      relation.family?.listing_title,
      relation.family?.property_name,
      relation.family?.name,
      relation.publicCard?.display_name,
      relation.host?.display_name
    );
  };

  const buildLocation = (relation: ReturnType<typeof getRelation>): string | null => {
    const parts = [
      relation.home?.village,
      relation.home?.city,
      relation.family?.village,
      relation.family?.city,
      relation.family?.state,
      relation.publicCard?.locality,
      relation.publicCard?.city,
      relation.host?.city,
    ]
      .map((value) => asOptionalString(value))
      .filter((value, index, list): value is string => Boolean(value) && list.indexOf(value) === index);
    return parts.slice(0, 2).join(", ") || pickFirstString(relation.home?.state, relation.publicCard?.state, relation.family?.state, relation.host?.state);
  };

  const buildHostName = (relation: ReturnType<typeof getRelation>): string => pickFirstString(
    Number(relation.user?.host_profile_version ?? 0) >= 1 ? relation.user?.name : null,
    relation.home?.hostName,
    relation.publicCard?.display_name,
    relation.family?.primary_host_name,
    relation.family?.host_name,
    relation.host?.display_name,
    "Famlo host"
  ) ?? "Famlo host";

  const buildThumbnail = (row: Record<string, unknown>, relation: ReturnType<typeof getRelation>): string | null => {
    const familyPhotos = relation.familyId ? familyPhotosById.get(relation.familyId) ?? [] : [];
    return resolvePublicAssetUrl(
      row.thumbnail_url,
      row.poster_url,
      row.cover_url,
      row.image_url,
      relation.home?.roomImageUrls[0],
      relation.home?.imageUrls[0],
      Array.isArray(relation.publicCard?.room_image_urls) ? relation.publicCard.room_image_urls[0] : null,
      Array.isArray(relation.publicCard?.image_urls) ? relation.publicCard.image_urls[0] : null,
      familyPhotos[0],
      relation.home?.hostPhotoUrl,
      relation.publicCard?.host_photo_url,
      relation.family?.host_photo_url
    );
  };

  const seen = new Set<string>();
  const dropped = {
    noPlayableUrl: 0,
    filteredStatus: 0,
    missingRelation: 0,
    privateRelation: 0,
  };

  const toReel = (
    row: Record<string, unknown>,
    source: HomepageReelRecord["source"],
    fallbackId: string
  ): HomepageReelRecord | null => {
    if (!isPublicReelStatus(row)) {
      dropped.filteredStatus += 1;
      return null;
    }
    const videoUrl = resolvePublicAssetUrl(
      row.public_url,
      row.video_url,
      row.reel_url,
      row.media_url,
      row.url,
      row.storage_path,
      row.file_path,
      row.storage_key,
      row.r2_key
    );
    if (!videoUrl) {
      dropped.noPlayableUrl += 1;
      return null;
    }
    if (seen.has(videoUrl)) return null;

    const relation = getRelation(row);
    if (!relation.familyId && !relation.hostId && !relation.home) {
      dropped.missingRelation += 1;
      return null;
    }
    if (!isPublicRelation(relation)) {
      dropped.privateRelation += 1;
      return null;
    }

    seen.add(videoUrl);

    return {
      id: pickFirstString(row.id, fallbackId) ?? fallbackId,
      familyId: relation.familyId ?? "",
      videoUrl,
      thumbnailUrl: buildThumbnail(row, relation),
      title: pickFirstString(row.title, buildTitle(relation)) ?? buildTitle(relation),
      hostName: buildHostName(relation),
      propertyName: buildPropertyName(relation),
      location: buildLocation(relation),
      locality: pickFirstString(relation.home?.village, relation.family?.village, relation.publicCard?.locality),
      city: pickFirstString(relation.home?.city, relation.family?.city, relation.publicCard?.city, relation.host?.city),
      state: pickFirstString(relation.home?.state, relation.family?.state, relation.publicCard?.state, relation.host?.state),
      listingHref: relation.home?.href ?? buildHomestayPath(
        buildPropertyName(relation) ?? buildHostName(relation),
        pickFirstString(relation.family?.village, relation.publicCard?.locality),
        pickFirstString(relation.family?.city, relation.publicCard?.city),
        relation.familyId ?? relation.hostId ?? fallbackId
      ),
      viewCount: 0,
      isFeatured: row.is_featured === true,
      source,
    };
  };

  const canonicalReels = canonicalRows
    .map((row, index) => toReel(row, "host_property_reels", `canonical-reel-${index + 1}`))
    .filter((reel): reel is HomepageReelRecord => reel !== null);

  const latestDraftByFamilyId = new Map<string, Record<string, unknown>>();
  for (const row of draftRows) {
    const familyId = asOptionalString(row.family_id);
    if (!payloadHasHostReel(pickObject(row.payload))) continue;
    if (!familyId || latestDraftByFamilyId.has(familyId)) continue;
    latestDraftByFamilyId.set(familyId, row);
  }

  const legacyRows: Record<string, unknown>[] = [];
  for (const [familyId, family] of familyById.entries()) {
    const meta = parseHostListingMeta(asOptionalString(family.admin_notes));
    const savedReels = Array.isArray(meta.hostReels) ? meta.hostReels : [];
    savedReels.forEach((item, index) => {
      legacyRows.push({
        ...item,
        id: pickFirstString(item.id, `family-${familyId}-${index + 1}`),
        family_id: familyId,
        public_url: pickFirstString(item.publicUrl),
        storage_key: pickFirstString(item.storageKey),
        title: pickFirstString(item.title),
        is_featured: item.isFeatured === true,
      });
    });
    if (savedReels.length === 0 && meta.hostReelPublicUrl) {
      legacyRows.push({
        id: `legacy-reel-1`,
        family_id: familyId,
        public_url: meta.hostReelPublicUrl,
        storage_key: meta.hostReelStorageKey,
        title: "Host reel",
        is_featured: true,
      });
    }
  }
  for (const [familyId, draft] of latestDraftByFamilyId.entries()) {
    const payload = pickObject(draft.payload);
    const hostReels = Array.isArray(payload.hostReels) ? payload.hostReels : [];
    hostReels.forEach((item, index) => {
      const row = pickObject(item);
      legacyRows.push({
        ...row,
        id: pickFirstString(row.id, `legacy-${familyId}-${index + 1}`),
        family_id: familyId,
        public_url: pickFirstString(row.publicUrl, row.public_url, row.videoUrl, row.video_url),
        storage_key: pickFirstString(row.storageKey, row.storage_key),
        thumbnail_url: pickFirstString(row.thumbnailUrl, row.thumbnail_url, row.posterUrl, row.poster_url, row.coverUrl, row.cover_url),
        mime_type: pickFirstString(row.mimeType, row.mime_type, "video/mp4"),
        is_featured: row.isFeatured === true || row.is_featured === true,
      });
    });

    const singlePublicUrl = pickFirstString(payload.hostReelPublicUrl);
    if (singlePublicUrl) {
      legacyRows.push({
        id: `legacy-${familyId}-featured`,
        family_id: familyId,
        public_url: singlePublicUrl,
        storage_key: pickFirstString(payload.hostReelStorageKey),
        mime_type: pickFirstString(payload.hostReelMimeType, "video/mp4"),
        is_featured: true,
        created_at: pickFirstString(payload.hostReelUploadedAt, draft.updated_at),
      });
    }
  }

  const legacyReels = legacyRows
    .map((row, index) => toReel(row, "family_legacy_reel", `legacy-reel-${index + 1}`))
    .filter((reel): reel is HomepageReelRecord => reel !== null);

  const unresolvedReels = [...canonicalReels, ...legacyReels];
  const reelFamilyIds = Array.from(new Set(unresolvedReels.map((reel) => reel.familyId).filter(Boolean)));
  const countsResult = reelFamilyIds.length > 0
    ? await supabase.from("reel_view_counts").select("family_id,reel_key,view_count").in("family_id", reelFamilyIds)
    : { data: [] as Array<Record<string, unknown>>, error: null };
  const viewCountByKey = new Map<string, number>();
  if (!countsResult.error) {
    ((countsResult.data ?? []) as Array<Record<string, unknown>>).forEach((row) => {
      const familyId = asOptionalString(row.family_id);
      const reelKey = asOptionalString(row.reel_key);
      if (familyId && reelKey) viewCountByKey.set(`${familyId}:${reelKey}`, Math.max(0, Number(row.view_count ?? 0)));
    });
  }

  const reels = unresolvedReels
    .map((reel) => ({ ...reel, viewCount: viewCountByKey.get(`${reel.familyId}:${reel.id}`) ?? 0 }))
    .sort((left, right) => right.viewCount - left.viewCount || Number(right.isFeatured) - Number(left.isFeatured))
    .slice(0, resultLimit);

  if (process.env.NODE_ENV !== "production") {
    console.info("[homepage.discovery] host reels", {
      canonicalRows: canonicalRows.length,
      approvedDraftRows: draftRows.length,
      rendered: reels.length,
      dropped,
    });
  }

  return reels;
}

function mapFamily(
  row: Record<string, unknown>,
  familyPhotos: Array<{ url?: string | null; is_primary?: boolean | null }>,
  roomStats?: { roomCount: number; startingRoomPrice: number | null },
  roomImageUrls: string[] = []
): HomeCardRecord {
  const meta = parseHostListingMeta(typeof row.admin_notes === "string" ? row.admin_notes : null);
  const hostName =
    typeof row.primary_host_name === "string"
      ? row.primary_host_name
      : typeof row.host_name === "string"
        ? row.host_name
        : typeof row.display_name === "string"
          ? row.display_name
          : null;
  const imageUrls = dedupeUrls([
    ...selectPrimaryPhoto(familyPhotos),
    ...parseStringArray(row.images),
    ...((meta.photoUrls ?? []).filter((item): item is string => typeof item === "string")),
    typeof row.host_photo_url === "string" ? row.host_photo_url : null,
  ]);
  const mapLink = typeof row.google_maps_link === "string" ? row.google_maps_link : null;
  const mapCoords = parseGoogleMapsCoordinates(mapLink);
  const exactLat =
    typeof row.lat_exact === "number"
      ? row.lat_exact
      : typeof row.lat === "number"
        ? row.lat
        : mapCoords?.lat ?? null;
  const exactLng =
    typeof row.lng_exact === "number"
      ? row.lng_exact
      : typeof row.lng === "number"
        ? row.lng
        : mapCoords?.lng ?? null;
  const publicCoords = getPublicCoordinates({
    lat: typeof row.lat === "number" ? row.lat : null,
    lng: typeof row.lng === "number" ? row.lng : null,
    latExact: exactLat,
    lngExact: exactLng,
    seed: String(row.id),
  });

  return {
    id: String(row.id),
    href: buildHomestayPath(
      String(row.name ?? row.id),
      typeof row.village === "string" ? row.village : null,
      typeof row.city === "string" ? row.city : null,
      String(row.id)
    ),
    hostId: null,
    hostUserId: typeof row.user_id === "string" ? row.user_id : null,
    legacyFamilyId: typeof row.id === "string" ? row.id : null,
    name: typeof row.name === "string" ? row.name : "Famlo stay",
    hostName,
    city: typeof row.city === "string" ? row.city : null,
    state: typeof row.state === "string" ? row.state : null,
    village: typeof row.village === "string" ? row.village : null,
    description:
      typeof row.about === "string"
        ? row.about
        : typeof row.description === "string"
          ? row.description
          : null,
    culturalOffering: meta.culturalOffering ?? null,
    includedItems: meta.includedItems ?? [],
    houseRules: meta.houseRules ?? [],
    amenities: meta.amenities ?? [],
    bathroomType: meta.bathroomType ?? null,
    listingTitle: meta.listingTitle ?? null,
    maxGuests: typeof row.max_guests === "number" ? row.max_guests : null,
    roomCount: roomStats?.roomCount ?? null,
    startingRoomPrice: roomStats?.startingRoomPrice ?? null,
    priceMorning: toNumber(row.price_morning),
    priceAfternoon: toNumber(row.price_afternoon),
    priceEvening: toNumber(row.price_evening),
    priceFullday: toNumber(row.price_fullday),
    rating: typeof row.rating === "number" ? row.rating : null,
    totalReviews: typeof row.total_reviews === "number" ? row.total_reviews : null,
    superhost: Boolean(row.superhost),
    isActive: Boolean(row.is_active),
    isAccepting: Boolean(row.is_accepting),
    googleMapsLink: mapLink,
    activeQuarters: parseStringArray(row.active_quarters),
    blockedDates: parseStringArray(row.blocked_dates),
    platformCommissionPct:
      typeof row.platform_commission_pct === "number" ? row.platform_commission_pct : 16,
    bookingRequiresHostApproval: Boolean(row.booking_requires_host_approval),
    lat: publicCoords?.lat ?? null,
    lng: publicCoords?.lng ?? null,
    latExact: exactLat,
    lngExact: exactLng,
    landmarks: Array.isArray(row.landmarks) ? row.landmarks : [],
    neighborhoodDesc: typeof row.neighborhood_desc === "string" ? row.neighborhood_desc : null,
    accessibilityDesc: typeof row.accessibility_desc === "string" ? row.accessibility_desc : null,
    imageUrls,
    roomImageUrls,
    hostPhotoUrl: pickHostProfilePhoto([
      typeof row.host_photo_url === "string" ? row.host_photo_url : null,
      typeof meta.hostSelfieUrl === "string" ? meta.hostSelfieUrl : null,
      ...imageUrls,
    ]),
    featured: Boolean(row.superhost) || (typeof row.rating === "number" && row.rating >= 4.8)
  };
}

function mapHostV2(
  row: Record<string, unknown>,
  mediaRows: Array<{ media_url?: string | null; is_primary?: boolean | null }>,
  roomStats?: { roomCount: number; startingRoomPrice: number | null },
  roomImageUrls: string[] = []
): HomeCardRecord {
  const familyId = typeof row.legacy_family_id === "string" ? row.legacy_family_id.trim() : "";
  if (!familyId) {
    throw new Error("Published host card is missing its canonical family id.");
  }
  const meta = parseHostListingMeta(typeof row.admin_notes === "string" ? row.admin_notes : null);
  const hostName =
    typeof row.display_name === "string"
      ? row.display_name
      : typeof row.primary_host_name === "string"
        ? row.primary_host_name
        : typeof row.host_name === "string"
          ? row.host_name
          : null;
  const hostMediaUrls = mediaRows.map((row) => row.media_url ?? null);
  const imageUrls = dedupeUrls([
    ...selectPrimaryPhoto(
      mediaRows.map((row) => ({ url: row.media_url ?? null, is_primary: row.is_primary ?? null }))
    ),
    ...parseStringArray(row.images),
    ...((meta.photoUrls ?? []).filter((item): item is string => typeof item === "string")),
    typeof row.host_photo_url === "string" ? row.host_photo_url : null,
    typeof meta.hostSelfieUrl === "string" ? meta.hostSelfieUrl : null,
  ]);
  const mapLink = typeof row.google_maps_link === "string" ? row.google_maps_link : null;
  const mapCoords = parseGoogleMapsCoordinates(mapLink);
  const exactLat =
    typeof row.lat_exact === "number"
      ? row.lat_exact
      : typeof row.lat === "number"
        ? row.lat
        : mapCoords?.lat ?? null;
  const exactLng =
    typeof row.lng_exact === "number"
      ? row.lng_exact
      : typeof row.lng === "number"
        ? row.lng
        : mapCoords?.lng ?? null;
  const publicCoords = getPublicCoordinates({
    lat: typeof row.lat === "number" ? row.lat : null,
    lng: typeof row.lng === "number" ? row.lng : null,
    latExact: exactLat,
    lngExact: exactLng,
    seed: String(row.id),
  });
  return {
    id: familyId,
    href: buildHomestayPath(
      String(row.display_name ?? row.id),
      typeof row.locality === "string" ? row.locality : null,
      typeof row.city === "string" ? row.city : null,
      familyId
    ),
    hostId: typeof row.id === "string" ? row.id : null,
    hostUserId: typeof row.user_id === "string" ? row.user_id : null,
    legacyFamilyId: typeof row.legacy_family_id === "string" ? row.legacy_family_id : null,
    name: typeof row.display_name === "string" ? row.display_name : "Famlo host",
    hostName,
    city: typeof row.city === "string" ? row.city : null,
    state: typeof row.state === "string" ? row.state : null,
    village: typeof row.locality === "string" ? row.locality : null,
    description: typeof row.about === "string" ? row.about : null,
    culturalOffering: typeof row.family_story === "string" ? row.family_story : null,
    includedItems: [],
    houseRules: parseStringArray(row.house_rules),
    amenities: parseStringArray(row.amenities),
    bathroomType: typeof row.bathroom_type === "string" ? row.bathroom_type : null,
    listingTitle: typeof row.display_name === "string" ? row.display_name : null,
    maxGuests: typeof row.max_guests === "number" ? row.max_guests : null,
    roomCount: roomStats?.roomCount ?? null,
    startingRoomPrice: roomStats?.startingRoomPrice ?? null,
    priceMorning: toNumber(row.price_morning),
    priceAfternoon: toNumber(row.price_afternoon),
    priceEvening: toNumber(row.price_evening),
    priceFullday: toNumber(row.price_fullday),
    rating: null,
    totalReviews: null,
    superhost: Boolean(row.is_featured),
    isActive: typeof row.status === "string" ? row.status === "published" : false,
    isAccepting: Boolean(row.is_accepting),
    googleMapsLink: mapLink,
    activeQuarters: parseStringArray(row.active_quarters),
    blockedDates: parseStringArray(row.blocked_dates),
    platformCommissionPct:
      typeof row.platform_commission_pct === "number" ? row.platform_commission_pct : 16,
    bookingRequiresHostApproval: Boolean(row.booking_requires_host_approval),
    lat: publicCoords?.lat ?? null,
    lng: publicCoords?.lng ?? null,
    latExact: exactLat,
    lngExact: exactLng,
    landmarks: Array.isArray(row.landmarks) ? row.landmarks : [],
    neighborhoodDesc: typeof row.neighborhood_desc === "string" ? row.neighborhood_desc : null,
    accessibilityDesc: typeof row.accessibility_desc === "string" ? row.accessibility_desc : null,
    imageUrls,
    roomImageUrls,
    hostPhotoUrl: pickHostProfilePhoto([
      typeof row.host_photo_url === "string" ? row.host_photo_url : null,
      typeof meta.hostSelfieUrl === "string" ? meta.hostSelfieUrl : null,
      ...hostMediaUrls,
    ]),
    featured: Boolean(row.is_featured)
  };
}

function mapPublicHomeCardViewRow(
  row: PublicHomeCardViewRow,
  familyRow: Record<string, unknown> | null = null
): HomeCardRecord | null {
  const familyId = typeof row.legacy_family_id === "string" ? row.legacy_family_id.trim() : "";
  if (!familyId) return null;

  const meta = parseHostListingMeta(typeof row.admin_notes === "string" ? row.admin_notes : null);
  const familyMeta = parseHostListingMeta(typeof familyRow?.admin_notes === "string" ? familyRow.admin_notes : null);
  const canonicalPathName =
    asOptionalString(familyRow?.listing_title) ??
    familyMeta.listingTitle ??
    asOptionalString(familyRow?.property_name) ??
    asOptionalString(familyRow?.name) ??
    asOptionalString(row.display_name) ??
    familyId;
  const canonicalLocality =
    asOptionalString(familyRow?.village) ??
    asOptionalString(familyRow?.locality) ??
    asOptionalString(row.locality);
  const canonicalCity = asOptionalString(familyRow?.city) ?? asOptionalString(row.city);
  const hostName =
    typeof row.display_name === "string"
      ? row.display_name
      : null;
  const imageUrls = dedupeUrls([
    ...parseStringArray(row.image_urls),
    ...((meta.photoUrls ?? []).filter((item): item is string => typeof item === "string")),
    typeof row.host_photo_url === "string" ? row.host_photo_url : null,
    typeof meta.hostSelfieUrl === "string" ? meta.hostSelfieUrl : null,
  ]);
  const exactLat = typeof row.lat_exact === "number" ? row.lat_exact : typeof row.lat === "number" ? row.lat : null;
  const exactLng = typeof row.lng_exact === "number" ? row.lng_exact : typeof row.lng === "number" ? row.lng : null;
  const publicCoords = getPublicCoordinates({
    lat: typeof row.lat === "number" ? row.lat : null,
    lng: typeof row.lng === "number" ? row.lng : null,
    latExact: exactLat,
    lngExact: exactLng,
    seed: String(row.id),
  });

  return {
    id: familyId,
    href: buildHomestayPath(
      canonicalPathName,
      canonicalLocality,
      canonicalCity,
      familyId
    ),
    hostId: typeof row.id === "string" ? row.id : null,
    hostUserId: typeof row.user_id === "string" ? row.user_id : null,
    legacyFamilyId: familyId,
    name: typeof row.display_name === "string" ? row.display_name : "Famlo host",
    hostName,
    city: typeof row.city === "string" ? row.city : null,
    state: typeof row.state === "string" ? row.state : null,
    village: typeof row.locality === "string" ? row.locality : null,
    description: typeof row.about === "string" ? row.about : null,
    culturalOffering: typeof row.family_story === "string" ? row.family_story : null,
    includedItems: meta.includedItems ?? [],
    houseRules: parseStringArray(row.house_rules),
    amenities: parseStringArray(row.amenities),
    bathroomType: typeof row.bathroom_type === "string" ? row.bathroom_type : null,
    listingTitle: meta.listingTitle ?? (typeof row.display_name === "string" ? row.display_name : null),
    maxGuests: typeof row.max_guests === "number" ? row.max_guests : null,
    roomCount: typeof row.room_count === "number" ? row.room_count : null,
    startingRoomPrice: typeof row.starting_room_price === "number" ? row.starting_room_price : null,
    priceMorning: toNumber(row.price_morning),
    priceAfternoon: toNumber(row.price_afternoon),
    priceEvening: toNumber(row.price_evening),
    priceFullday: toNumber(row.price_fullday),
    rating: null,
    totalReviews: null,
    superhost: Boolean(row.is_featured),
    isActive: typeof row.status === "string" ? row.status === "published" : false,
    isAccepting: Boolean(row.is_accepting),
    googleMapsLink: null,
    activeQuarters: parseStringArray(row.active_quarters),
    blockedDates: parseStringArray(row.blocked_dates),
    platformCommissionPct: typeof row.platform_commission_pct === "number" ? row.platform_commission_pct : 16,
    bookingRequiresHostApproval: Boolean(row.booking_requires_host_approval),
    lat: publicCoords?.lat ?? null,
    lng: publicCoords?.lng ?? null,
    latExact: exactLat,
    lngExact: exactLng,
    landmarks: Array.isArray(row.landmarks) ? row.landmarks : [],
    neighborhoodDesc: typeof row.neighborhood_desc === "string" ? row.neighborhood_desc : null,
    accessibilityDesc: typeof row.accessibility_desc === "string" ? row.accessibility_desc : null,
    imageUrls,
    roomImageUrls: parseStringArray(row.room_image_urls),
    hostPhotoUrl: pickHostProfilePhoto([
      typeof row.host_photo_url === "string" ? row.host_photo_url : null,
      typeof meta.hostSelfieUrl === "string" ? meta.hostSelfieUrl : null,
      ...imageUrls,
    ]),
    featured: Boolean(row.is_featured),
  };
}

function mapHommieV2(
  row: Record<string, unknown>,
  mediaRow?: Record<string, unknown> | null
): CompanionRecord {
  const slug =
    typeof row.slug === "string" && row.slug.length > 0
      ? row.slug
      : typeof row.legacy_hommie_id === "string"
        ? row.legacy_hommie_id
        : String(row.id);
  return {
    id: String(row.id),
    href: `/hommies/${slug}`,
    source: "hommies",
    title: typeof row.display_name === "string" ? row.display_name : "Famlo hommie",
    hostName: typeof row.display_name === "string" ? row.display_name : null,
    city: typeof row.city === "string" ? row.city : null,
    state: typeof row.state === "string" ? row.state : null,
    locality: typeof row.locality === "string" ? row.locality : null,
    description: typeof row.bio === "string" ? row.bio : null,
    activities: parseStringArray(row.service_tags),
    languages: parseStringArray(row.languages),
    hourlyPrice: typeof row.hourly_price === "number" ? row.hourly_price : null,
    nightlyPrice: typeof row.nightly_price === "number" ? row.nightly_price : null,
    maxGuests: typeof row.max_guests === "number" ? row.max_guests : null,
    lat: typeof row.lat === "number" ? row.lat : null,
    lng: typeof row.lng === "number" ? row.lng : null,
    imageUrl: typeof mediaRow?.media_url === "string" ? mediaRow.media_url : null,
    guideId: typeof row.legacy_city_guide_id === "string" ? row.legacy_city_guide_id : null,
    guideUserId: typeof row.user_id === "string" ? row.user_id : null,
    isActive: typeof row.status === "string" ? row.status === "published" : false,
    rating: 4.8,
    totalReviews: 0
  };
}

async function loadPublicCardFamilies(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  rows: PublicHomeCardViewRow[]
): Promise<Map<string, Record<string, unknown>>> {
  const familyIds = Array.from(
    new Set(
      rows
        .map((row) => asOptionalString(row.legacy_family_id))
        .filter((value): value is string => Boolean(value))
    )
  );
  if (familyIds.length === 0) return new Map();

  const { data, error } = await supabase.from("families").select("*").in("id", familyIds);
  if (error) {
    console.warn("[homepage.discovery] canonical family slug data unavailable", {
      message: error.message,
    });
    return new Map();
  }

  return new Map(
    ((data ?? []) as Record<string, unknown>[])
      .map((row) => [asOptionalString(row.id), row] as const)
      .filter((entry): entry is readonly [string, Record<string, unknown>] => Boolean(entry[0]))
  );
}

async function loadHomepageDataV2(
  supabase: ReturnType<typeof createAdminSupabaseClient>
): Promise<HomepageData | null> {
  const [publicHomesResult, hommiesResult, storiesResult, adsResult] = await Promise.all([
    supabase
      .from("public_home_cards_v1")
      .select("*")
      .eq("status", "published")
      .eq("is_accepting", true)
      .limit(36),
    supabase
      .from("hommie_profiles_v2")
      .select("*")
      .eq("status", "published")
      .order("published_at", { ascending: false })
      .limit(18),
    supabase
      .from("stories_v2")
      .select("id,author_name,city,body,rating,created_at,featured_rank,stay_highlight,cover_image_url")
      .eq("is_published", true)
      .order("featured_rank", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(18),
    supabase
      .from("ads_v2")
      .select("*")
      .eq("is_active", true)
      .order("priority", { ascending: true })
  ]);

  if (publicHomesResult.error || hommiesResult.error || adsResult.error) {
    return null;
  }

  if (storiesResult.error) {
    console.warn("[homepage.discovery] stories_v2 load failed; rendering homes without stories", {
      message: storiesResult.error.message,
    });
  }

  const publicHomeRows = (publicHomesResult.data ?? []) as PublicHomeCardViewRow[];
  const familyById = await loadPublicCardFamilies(supabase, publicHomeRows);
  const hommieRows = (hommiesResult.data ?? []) as Record<string, unknown>[];
  const storyRows = storiesResult.error ? [] : ((storiesResult.data ?? []) as Record<string, unknown>[]);
  const hommieIds = hommieRows.map((row) => String(row.id));

  const [hommieMediaResult, bannersResult] = await Promise.all([
    hommieIds.length > 0
      ? supabase
          .from("hommie_media_v2")
          .select("hommie_id, media_url, is_primary")
          .in("hommie_id", hommieIds)
      : Promise.resolve({ data: [] as Array<Record<string, unknown>>, error: null }),
    supabase
      .from("hero_banners")
      .select("image_url, alt_text")
      .eq("is_active", true)
      .order("sort_order", { ascending: true }),
  ]);

  const hommieMediaMap = new Map<string, Record<string, unknown>[]>();
  for (const media of ((hommieMediaResult.data ?? []) as Array<Record<string, unknown>>)) {
    const hommieId = typeof media.hommie_id === "string" ? media.hommie_id : null;
    if (!hommieId) continue;
    const current = hommieMediaMap.get(hommieId) ?? [];
    current.push(media);
    hommieMediaMap.set(hommieId, current);
  }

  const homes = publicHomeRows
    .filter((row) => canListOnMarketplace(row).allowed)
    .map((row) => mapPublicHomeCardViewRow(row, familyById.get(asOptionalString(row.legacy_family_id) ?? "") ?? null))
    .filter((home): home is HomeCardRecord => Boolean(home));
  const companions = hommieRows.map((row) => mapHommieV2(row, (hommieMediaMap.get(String(row.id)) ?? [])[0] ?? null));
  const stories = storyRows
    .sort((a: Record<string, unknown>, b: Record<string, unknown>) => {
      const rankA = typeof a.featured_rank === "number" ? a.featured_rank : Number.MAX_SAFE_INTEGER;
      const rankB = typeof b.featured_rank === "number" ? b.featured_rank : Number.MAX_SAFE_INTEGER;
      if (rankA !== rankB) return rankA - rankB;
      return String(b.created_at ?? "").localeCompare(String(a.created_at ?? ""));
    })
    .map((story) => ({
      id: String(story.id),
      authorName: typeof story.author_name === "string" ? story.author_name : null,
      fromCity: typeof story.city === "string" ? story.city : null,
      rating: typeof story.rating === "number" ? story.rating : null,
      storyText: typeof story.stay_highlight === "string" && story.stay_highlight.trim().length > 0
        ? story.stay_highlight
        : typeof story.body === "string"
          ? story.body
          : null,
      imageUrls: typeof story.cover_image_url === "string" && story.cover_image_url.trim().length > 0
        ? [story.cover_image_url.trim()]
        : [],
      createdAt: typeof story.created_at === "string" ? story.created_at : new Date().toISOString(),
    }));

  const adRows = (adsResult.data ?? []) as Array<Record<string, unknown>>;
  const ads = adRows.map((ad) => ({
    id: String(ad.id),
    label: typeof ad.label === "string" ? ad.label : "",
    title: typeof ad.title === "string" ? ad.title : "Famlo",
    description: typeof ad.description === "string" ? ad.description : null,
    image_url: typeof ad.image_url === "string" ? ad.image_url : "",
    city: typeof ad.city === "string" ? ad.city : null,
    state: typeof ad.state === "string" ? ad.state : null,
    lat: typeof ad.lat === "number" ? ad.lat : typeof ad.lat === "string" ? Number(ad.lat) : null,
    lng: typeof ad.lng === "number" ? ad.lng : typeof ad.lng === "string" ? Number(ad.lng) : null,
    radius_km:
      typeof ad.radius_km === "number"
        ? ad.radius_km
        : typeof ad.radius_km === "string"
          ? Number(ad.radius_km)
          : null,
    cta_text: typeof ad.cta_text === "string" ? ad.cta_text : "Explore",
    cta_url: typeof ad.cta_url === "string" ? ad.cta_url : "/",
    is_active: Boolean(ad.is_active),
    priority: typeof ad.priority === "number" ? ad.priority : 0,
    starts_at: typeof ad.starts_at === "string" ? ad.starts_at : null,
    ends_at: typeof ad.ends_at === "string" ? ad.ends_at : null,
    weekdays: Array.isArray(ad.weekdays)
      ? ad.weekdays.filter((value): value is number => typeof value === "number")
      : [],
    daily_start_time: typeof ad.daily_start_time === "string" ? ad.daily_start_time : null,
    daily_end_time: typeof ad.daily_end_time === "string" ? ad.daily_end_time : null,
    timezone: typeof ad.timezone === "string" ? ad.timezone : null,
    team_owner: typeof ad.team_owner === "string" ? ad.team_owner : null,
    audience: typeof ad.audience === "string" ? ad.audience : null,
    placement: typeof ad.placement === "string" ? ad.placement : null,
  }));

  const heroBanners = ((bannersResult.data ?? []) as Array<Record<string, unknown>>)
    .map((row) => ({
      imageUrl: typeof row.image_url === "string" ? row.image_url : "",
      alt: typeof row.alt_text === "string" ? row.alt_text : undefined,
    }))
    .filter((row) => row.imageUrl);
  return { homes, companions, stories, ads, heroBanners, hostReels: [] };
}

async function loadHomesDiscoveryDataV2(
  supabase: ReturnType<typeof createAdminSupabaseClient>
): Promise<HomeCardRecord[] | null> {
  const publicHomesResult = await supabase
    .from("public_home_cards_v1")
    .select("*")
    .eq("status", "published")
    .eq("is_accepting", true)
    .limit(36);

  if (publicHomesResult.error) {
    return null;
  }

  const publicHomeRows = (publicHomesResult.data ?? []) as PublicHomeCardViewRow[];
  const familyById = await loadPublicCardFamilies(supabase, publicHomeRows);
  return publicHomeRows
    .filter((row) => canListOnMarketplace(row).allowed)
    .map((row) => mapPublicHomeCardViewRow(row, familyById.get(asOptionalString(row.legacy_family_id) ?? "") ?? null))
    .filter((home): home is HomeCardRecord => Boolean(home));
}

async function loadHomepageDataLegacy(
  supabase: ReturnType<typeof createAdminSupabaseClient>
): Promise<HomepageData> {
  const [familiesResult, bannersResult] = await Promise.all([
    supabase
      .from("families")
      .select("*")
      .eq("is_active", true)
      .eq("is_accepting", true)
      .order("rating", { ascending: false })
      .limit(36),
    supabase
      .from("hero_banners")
      .select("image_url, alt_text")
      .eq("is_active", true)
      .order("sort_order", { ascending: true }),
  ]);

  const familyRows = (familiesResult.data ?? []) as Record<string, unknown>[];
  const familyIds = familyRows.map((row) => String(row.id));
  const familyPhotosResult =
    familyIds.length > 0
      ? await supabase
          .from("family_photos")
          .select("family_id, url, is_primary")
          .in("family_id", familyIds)
      : { data: [] as FamilyPhotoRow[] };

  const familyPhotoMap = new Map<string, FamilyPhotoRow[]>();
  for (const photo of ((familyPhotosResult.data ?? []) as FamilyPhotoRow[])) {
    if (!photo.family_id) {
      continue;
    }

    const current = familyPhotoMap.get(photo.family_id) ?? [];
    current.push(photo);
    familyPhotoMap.set(photo.family_id, current);
  }

  const familyRoomStatsResult = familyIds.length > 0
    ? await supabase
        .from("stay_units_v2")
        .select("legacy_family_id, unit_key, name, unit_type, description, price_fullday, price_morning, price_afternoon, price_evening, is_active, photos")
        .in("legacy_family_id", familyIds)
    : { data: [] as StayUnitSummaryRow[], error: null };
  const familyRoomStatsMap = buildStayUnitStatsMap((familyRoomStatsResult.data ?? []) as StayUnitSummaryRow[], "legacy_family_id");
  const familyRoomImageMap = buildStayUnitImageMap((familyRoomStatsResult.data ?? []) as StayUnitSummaryRow[], "legacy_family_id");

  const homes = familyRows.map((row) =>
    mapFamily(
      row,
      familyPhotoMap.get(String(row.id)) ?? [],
      familyRoomStatsMap.get(String(row.id)) ?? undefined,
      familyRoomImageMap.get(String(row.id)) ?? []
    )
  );
  const hostReels = await loadHomepageReels(supabase, homes);
  return {
    homes,
    companions: [],
    stories: [],
    ads: [],
    heroBanners: ((bannersResult.data ?? []) as Record<string, unknown>[])
      .map((row) => ({
        imageUrl: typeof row.image_url === "string" ? row.image_url : "",
        alt: typeof row.alt_text === "string" ? row.alt_text : undefined,
      }))
      .filter((row) => row.imageUrl),
    hostReels: [],
  };
}

async function loadHomesDiscoveryDataLegacy(
  supabase: ReturnType<typeof createAdminSupabaseClient>
): Promise<HomeCardRecord[]> {
  const familiesResult = await supabase
    .from("families")
    .select("*")
    .eq("is_active", true)
    .eq("is_accepting", true)
    .order("rating", { ascending: false })
    .limit(36);

  const familyRows = (familiesResult.data ?? []) as Record<string, unknown>[];
  const familyIds = familyRows.map((row) => String(row.id));
  const familyPhotosResult =
    familyIds.length > 0
      ? await supabase
          .from("family_photos")
          .select("family_id, url, is_primary")
          .in("family_id", familyIds)
      : { data: [] as FamilyPhotoRow[] };

  const familyPhotoMap = new Map<string, FamilyPhotoRow[]>();
  for (const photo of ((familyPhotosResult.data ?? []) as FamilyPhotoRow[])) {
    if (!photo.family_id) continue;
    const current = familyPhotoMap.get(photo.family_id) ?? [];
    current.push(photo);
    familyPhotoMap.set(photo.family_id, current);
  }

  const familyRoomStatsResult = familyIds.length > 0
    ? await supabase
        .from("stay_units_v2")
        .select("legacy_family_id, unit_key, name, unit_type, description, price_fullday, price_morning, price_afternoon, price_evening, is_active, photos")
        .in("legacy_family_id", familyIds)
    : { data: [] as StayUnitSummaryRow[], error: null };
  const familyRoomStatsMap = buildStayUnitStatsMap((familyRoomStatsResult.data ?? []) as StayUnitSummaryRow[], "legacy_family_id");
  const familyRoomImageMap = buildStayUnitImageMap((familyRoomStatsResult.data ?? []) as StayUnitSummaryRow[], "legacy_family_id");

  return familyRows.map((row) =>
    mapFamily(
      row,
      familyPhotoMap.get(String(row.id)) ?? [],
      familyRoomStatsMap.get(String(row.id)) ?? undefined,
      familyRoomImageMap.get(String(row.id)) ?? []
    )
  );
}

async function loadHomepageDataCompatibility(): Promise<HomepageData> {
  const supabase = createAdminSupabaseClient();
  const v2Data = await loadHomepageDataV2(supabase);
  if (!v2Data) {
    return loadHomepageDataLegacy(supabase);
  }
  const legacyData = await loadHomepageDataLegacy(supabase);
  const mergedHomes = new Map<string, HomeCardRecord>();

  for (const home of v2Data.homes) {
    mergedHomes.set(home.legacyFamilyId ?? `v2:${home.id}`, home);
  }

  for (const home of legacyData.homes) {
    const dedupeKey = home.legacyFamilyId ?? `legacy:${home.id}`;
    if (!mergedHomes.has(dedupeKey)) {
      mergedHomes.set(dedupeKey, home);
    }
  }

  const result = {
    homes: await applyCanonicalHomeProfiles(supabase, Array.from(mergedHomes.values())),
    companions: v2Data.companions.length > 0 ? v2Data.companions : legacyData.companions,
    stories: v2Data.stories,
    ads: v2Data.ads,
    heroBanners: legacyData.heroBanners,
    hostReels: [],
  };
  return result;
}

const getCachedHomepageData = unstable_cache(
  async (): Promise<HomepageData> => {
    try {
      const cached = await loadHomepageDataCompatibility();
      if (cached.homes.length > 0) return cached;

      const uncached = await getHomepageDataUncached();
      return uncached.homes.length > 0 ? uncached : cached;
    } catch (error) {
      console.error("Discovery Error:", error);
      return {
        homes: [],
        companions: [],
        stories: [],
        ads: [],
        heroBanners: [],
        hostReels: [],
      };
    }
  },
  ["homepage-discovery-v4-canonical-profile"],
  { revalidate: 300, tags: ["homepage-discovery"] }
);

const getCachedHomepageReelsData = unstable_cache(
  async (): Promise<HomepageReelRecord[]> => {
    try {
      return loadHomepageReels(createAdminSupabaseClient(), [], { limit: 8 });
    } catch (error) {
      console.error("Homepage reels discovery error:", error);
      return [];
    }
  },
  ["homepage-reels-discovery-v3-canonical-property"],
  { revalidate: 60, tags: ["homepage-discovery", "homepage-reels-discovery"] }
);

const getCachedHomestayReelsData = unstable_cache(
  async (): Promise<HomepageReelRecord[]> => {
    try {
      return loadHomepageReels(createAdminSupabaseClient(), [], { limit: 120 });
    } catch (error) {
      console.error("Homestay reels discovery error:", error);
      return [];
    }
  },
  ["homestay-reels-discovery-v2-canonical-property"],
  { revalidate: 60, tags: ["homepage-discovery", "homepage-reels-discovery"] }
);

export async function getHomepageData(): Promise<HomepageData> {
  return getCachedHomepageData();
}

export async function getHomepageReelsData(): Promise<HomepageReelRecord[]> {
  return getCachedHomepageReelsData();
}

export async function getHomestayReelsData(): Promise<HomepageReelRecord[]> {
  return getCachedHomestayReelsData();
}

export async function getHomepageDataUncached(): Promise<HomepageData> {
  try {
    return loadHomepageDataCompatibility();
  } catch (error) {
    console.error("Discovery Error:", error);
    return {
      homes: [],
      companions: [],
      stories: [],
      ads: [],
      heroBanners: [],
      hostReels: [],
    };
  }
}

async function loadHomesDiscoveryDataCompatibility(): Promise<HomeCardRecord[]> {
  const supabase = createAdminSupabaseClient();
  const v2Homes = await loadHomesDiscoveryDataV2(supabase);

  if (!v2Homes) {
    return loadHomesDiscoveryDataLegacy(supabase);
  }

  const legacyHomes = await loadHomesDiscoveryDataLegacy(supabase);
  const mergedHomes = new Map<string, HomeCardRecord>();

  for (const home of v2Homes) {
    mergedHomes.set(home.legacyFamilyId ?? `v2:${home.id}`, home);
  }

  for (const home of legacyHomes) {
    const dedupeKey = home.legacyFamilyId ?? `legacy:${home.id}`;
    if (!mergedHomes.has(dedupeKey)) {
      mergedHomes.set(dedupeKey, home);
    }
  }

  return applyCanonicalHomeProfiles(supabase, Array.from(mergedHomes.values()));
}

const getCachedHomesDiscoveryData = unstable_cache(
  async (): Promise<HomeCardRecord[]> => {
    try {
      return loadHomesDiscoveryDataCompatibility();
    } catch (error) {
      console.error("Homes discovery error:", error);
      return [];
    }
  },
  ["homes-discovery-v4-canonical-profile"],
  { revalidate: 300, tags: ["homepage-discovery", "homes-discovery"] }
);

export async function getHomesDiscoveryData(): Promise<HomeCardRecord[]> {
  const cached = await getCachedHomesDiscoveryData();
  if (cached.length > 0) return cached;

  const uncached = await getHomesDiscoveryDataUncached();
  return uncached.length > 0 ? uncached : cached;
}

export async function getHomesDiscoveryDataUncached(): Promise<HomeCardRecord[]> {
  try {
    return loadHomesDiscoveryDataCompatibility();
  } catch (error) {
    console.error("Homes discovery error:", error);
    return [];
  }
}

export async function getHomeDetail(id: string): Promise<HomeCardRecord | null> {
  try {
    const supabase = createAdminSupabaseClient();
    const resolved = await resolveHomeRoute(supabase, id);
    if (resolved.kind !== "family" || !resolved.familyId || !resolved.familyRow) return null;
    if (resolved.familyRow.is_active === false || resolved.familyRow.is_accepting === false) return null;

    if (resolved.hostRow) {
      const resolvedHostId = String(resolved.hostRow.id);
      const familyId = resolved.familyId;
      const [mediaResult, familyPhotoResult] = await Promise.all([
        supabase
          .from("host_media")
          .select("host_id, media_url, is_primary")
          .eq("host_id", resolvedHostId),
        supabase
          .from("family_photos")
          .select("family_id, url, is_primary")
          .eq("family_id", familyId),
      ]);

      const propertyBackedMedia =
        (familyPhotoResult.data ?? []).length > 0
          ? ((familyPhotoResult.data ?? []) as Array<{ url?: string | null; is_primary?: boolean | null }>).map((row) => ({
              media_url: row.url ?? null,
              is_primary: row.is_primary ?? null,
            }))
          : ((mediaResult.data ?? []) as HostMediaRow[]);

      return mapHostV2(
        resolved.hostRow,
        propertyBackedMedia
      );
    }

    const photosResult = await supabase
      .from("family_photos")
      .select("family_id, url, is_primary")
      .eq("family_id", resolved.familyId);

    return mapFamily(
      resolved.familyRow,
      (photosResult.data ?? []) as Array<{ url?: string | null; is_primary?: boolean | null }>
    );
  } catch {
    return null;
  }
}

export async function getCompanionDetail(id: string): Promise<CompanionRecord | null> {
  try {
    const supabase = createAdminSupabaseClient();
    const v2HommieResult = await supabase
      .from("hommie_profiles_v2")
      .select("*")
      .or(`id.eq.${id},slug.eq.${id},legacy_hommie_id.eq.${id},legacy_city_guide_id.eq.${id}`)
      .eq("status", "published")
      .maybeSingle();

    if (!v2HommieResult.error && v2HommieResult.data) {
      const resolvedHommieId = String((v2HommieResult.data as Record<string, unknown>).id);
      const mediaResult = await supabase
        .from("hommie_media_v2")
        .select("hommie_id, media_url, is_primary")
        .eq("hommie_id", resolvedHommieId)
        .order("is_primary", { ascending: false })
        .limit(1);

      return mapHommieV2(
        v2HommieResult.data as Record<string, unknown>,
        ((mediaResult.data ?? []) as Record<string, unknown>[])[0] ?? null
      );
    }

    return null;
  } catch {
    return null;
  }
}
