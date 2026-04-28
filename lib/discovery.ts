import { parseHostListingMeta } from "@/lib/host-listing-meta";
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

export interface HomepageData {
  homes: HomeCardRecord[];
  companions: CompanionRecord[];
  stories: StoryRecord[];
  ads: AdRecord[];
  heroBanners: { imageUrl: string; alt?: string }[];
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

function parseStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.length > 0) : [];
}

function toNumber(value: unknown): number {
  return typeof value === "number" ? value : Number(value ?? 0);
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
      typeof row.platform_commission_pct === "number" ? row.platform_commission_pct : 18,
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
    id: String(row.id),
    href: buildHomestayPath(
      String(row.display_name ?? row.id),
      typeof row.locality === "string" ? row.locality : null,
      typeof row.city === "string" ? row.city : null,
      String(row.id)
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
      typeof row.platform_commission_pct === "number" ? row.platform_commission_pct : 18,
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

async function loadHomepageDataV2(
  supabase: ReturnType<typeof createAdminSupabaseClient>
): Promise<HomepageData | null> {
  const [hostsResult, hommiesResult, storiesResult, adsResult] = await Promise.all([
    supabase
      .from("hosts")
      .select("*")
      .eq("status", "published")
      .eq("is_accepting", true)
      .order("published_at", { ascending: false })
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

  if (hostsResult.error || hommiesResult.error || adsResult.error) {
    return null;
  }

  if (storiesResult.error) {
    console.warn("[homepage.discovery] stories_v2 load failed; rendering homes without stories", {
      message: storiesResult.error.message,
    });
  }

  const hostRows = (hostsResult.data ?? []) as Record<string, unknown>[];
  const hommieRows = (hommiesResult.data ?? []) as Record<string, unknown>[];
  const storyRows = storiesResult.error ? [] : ((storiesResult.data ?? []) as Record<string, unknown>[]);

  const hostIds = hostRows.map((row) => String(row.id));
  const hommieIds = hommieRows.map((row) => String(row.id));

  const [hostMediaResult, hommieMediaResult, bannersResult] = await Promise.all([
    hostIds.length > 0
      ? supabase.from("host_media").select("host_id, media_url, is_primary").in("host_id", hostIds)
      : Promise.resolve({ data: [] as HostMediaRow[], error: null }),
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

  const hostMediaMap = new Map<string, HostMediaRow[]>();
  for (const media of ((hostMediaResult.data ?? []) as HostMediaRow[])) {
    if (!media.host_id) continue;
    const current = hostMediaMap.get(media.host_id) ?? [];
    current.push(media);
    hostMediaMap.set(media.host_id, current);
  }

  const hommieMediaMap = new Map<string, Record<string, unknown>[]>();
  for (const media of ((hommieMediaResult.data ?? []) as Array<Record<string, unknown>>)) {
    const hommieId = typeof media.hommie_id === "string" ? media.hommie_id : null;
    if (!hommieId) continue;
    const current = hommieMediaMap.get(hommieId) ?? [];
    current.push(media);
    hommieMediaMap.set(hommieId, current);
  }

  const hostRoomStatsResult = hostIds.length > 0
    ? await supabase
        .from("stay_units_v2")
        .select("host_id, unit_key, name, unit_type, description, price_fullday, price_morning, price_afternoon, price_evening, is_active, photos")
        .in("host_id", hostIds)
    : { data: [] as StayUnitSummaryRow[], error: null };
  const hostRoomStatsMap = buildStayUnitStatsMap((hostRoomStatsResult.data ?? []) as StayUnitSummaryRow[], "host_id");
  const hostRoomImageMap = buildStayUnitImageMap((hostRoomStatsResult.data ?? []) as StayUnitSummaryRow[], "host_id");

  const homes = hostRows.map((row) =>
    mapHostV2(
      row,
      hostMediaMap.get(String(row.id)) ?? [],
      hostRoomStatsMap.get(String(row.id)) ?? undefined,
      hostRoomImageMap.get(String(row.id)) ?? []
    )
  );
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

  return { homes, companions, stories, ads, heroBanners };
}

async function loadHomesDiscoveryDataV2(
  supabase: ReturnType<typeof createAdminSupabaseClient>
): Promise<HomeCardRecord[] | null> {
  const hostsResult = await supabase
    .from("hosts")
    .select("*")
    .in("status", ["published", "draft", "paused"])
    .order("published_at", { ascending: false })
    .limit(36);

  if (hostsResult.error) {
    return null;
  }

  const hostRows = (hostsResult.data ?? []) as Record<string, unknown>[];
  const hostIds = hostRows.map((row) => String(row.id));

  const [hostMediaResult, hostRoomStatsResult] = await Promise.all([
    hostIds.length > 0
      ? supabase.from("host_media").select("host_id, media_url, is_primary").in("host_id", hostIds)
      : Promise.resolve({ data: [] as HostMediaRow[], error: null }),
    hostIds.length > 0
      ? supabase
          .from("stay_units_v2")
          .select("host_id, unit_key, name, unit_type, description, price_fullday, price_morning, price_afternoon, price_evening, is_active, photos")
          .in("host_id", hostIds)
      : Promise.resolve({ data: [] as StayUnitSummaryRow[], error: null }),
  ]);

  const hostMediaMap = new Map<string, HostMediaRow[]>();
  for (const media of ((hostMediaResult.data ?? []) as HostMediaRow[])) {
    if (!media.host_id) continue;
    const current = hostMediaMap.get(media.host_id) ?? [];
    current.push(media);
    hostMediaMap.set(media.host_id, current);
  }

  const hostRoomStatsMap = buildStayUnitStatsMap((hostRoomStatsResult.data ?? []) as StayUnitSummaryRow[], "host_id");
  const hostRoomImageMap = buildStayUnitImageMap((hostRoomStatsResult.data ?? []) as StayUnitSummaryRow[], "host_id");

  return hostRows.map((row) =>
    mapHostV2(
      row,
      hostMediaMap.get(String(row.id)) ?? [],
      hostRoomStatsMap.get(String(row.id)) ?? undefined,
      hostRoomImageMap.get(String(row.id)) ?? []
    )
  );
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
    homes: Array.from(mergedHomes.values()),
    companions: v2Data.companions.length > 0 ? v2Data.companions : legacyData.companions,
    stories: v2Data.stories,
    ads: v2Data.ads,
    heroBanners: legacyData.heroBanners,
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
      };
    }
  },
  ["homepage-discovery"],
  { revalidate: 60, tags: ["homepage-discovery"] }
);

export async function getHomepageData(): Promise<HomepageData> {
  return getCachedHomepageData();
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

  const result = Array.from(mergedHomes.values());
  return result;
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
  ["homes-discovery"],
  { revalidate: 60, tags: ["homepage-discovery", "homes-discovery"] }
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
    const v2HostResult = await supabase
      .from("hosts")
      .select("*")
      .or(`id.eq.${id},legacy_family_id.eq.${id}`)
      .eq("status", "published")
      .eq("is_accepting", true)
      .maybeSingle();

    if (!v2HostResult.error && v2HostResult.data) {
      const resolvedHostId = String((v2HostResult.data as Record<string, unknown>).id);
      const mediaResult = await supabase
        .from("host_media")
        .select("host_id, media_url, is_primary")
        .eq("host_id", resolvedHostId);

      return mapHostV2(
        v2HostResult.data as Record<string, unknown>,
        (mediaResult.data ?? []) as HostMediaRow[]
      );
    }

    const { data, error } = await supabase
      .from("families")
      .select("*")
      .eq("id", id)
      .eq("is_active", true)
      .eq("is_accepting", true)
      .maybeSingle();

    if (error || !data) {
      return null;
    }

    const photosResult = await supabase
      .from("family_photos")
      .select("family_id, url, is_primary")
      .eq("family_id", id);

    return mapFamily(
      data as Record<string, unknown>,
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
