//

// app/homes/[id]/page.tsx

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Bath, Bed, Coffee, Globe, Heart, Lock, MapPin, MessageCircle, Monitor, ShieldCheck, ShowerHead, Snowflake, Sunrise, Sun, Sunset, SunMoon, Users, Wifi } from "lucide-react";

import { HomeBookingPreview } from "@/components/public/HomeBookingPreview";
import { HomeDetailTopBar } from "@/components/public/HomeDetailTopBar";
import { HomeCoverCard } from "@/components/public/HomeCoverCard";
import { HostGalleryViewer } from "@/components/public/HostGalleryViewer";
import { RecentHomeViewTracker } from "@/components/public/RecentHomeViewTracker";
import { addIndiaDays, getTodayInIndia } from "@/lib/booking-time";
import { loadHostStayBookingRecordsCompatibility } from "@/lib/booking-compat";
import { loadCanonicalCalendar } from "@/lib/calendar";
import { loadHostGuestNetworkSummary } from "@/lib/host-guest-network";
import { loadFamilyStories, loadLikedGuestCounts } from "@/lib/home-social-proof";
import { DEFAULT_EXPERIENCE_CARDS, parseMultiValueList } from "@/lib/home-listing-options";
import { parseHostListingMeta } from "@/lib/host-listing-meta";
import { getPublicCoordinates } from "@/lib/location-utils";
import { getCachedHomeRouteResolution } from "@/lib/home-route-resolution";
import { getHomesDiscoveryDataUncached } from "@/lib/discovery";
import { loadStayUnitRatingSummaries } from "@/lib/stay-unit-ratings";
import { loadStayUnitsForHome, type StayUnitRecord } from "@/lib/stay-units";
import { buildHomestayPath } from "@/lib/slug";
import { createAdminSupabaseClient } from "@/lib/supabase";
import styles from "./home-details.module.css";

export const dynamic = "force-dynamic";

function enumerateDateStrings(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const cursor = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);

  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return dates;
}

function tokeniseRoomCalendarBlock(event: { startDate: string; endDate: string; slotKey?: string | null; isBlocking: boolean; status: string }): string[] {
  if (!event.isBlocking || event.status === "released" || event.status === "cancelled") {
    return [];
  }

  const tokens: string[] = [];
  for (const date of enumerateDateStrings(event.startDate, event.endDate)) {
    if (event.slotKey && event.slotKey !== "fullday") {
      tokens.push(`${date}::${event.slotKey}`);
      continue;
    }

    tokens.push(date, `${date}::fullday`);
  }

  return tokens;
}

async function hydrateStayUnitsWithBlockedDates(supabase: ReturnType<typeof createAdminSupabaseClient>, stayUnits: StayUnitRecord[]): Promise<StayUnitRecord[]> {
  const from = getTodayInIndia();
  const to = addIndiaDays(from, 365);

  return Promise.all(
    stayUnits.map(async (unit) => {
      try {
        const events = await loadCanonicalCalendar(supabase, {
          ownerType: "stay_unit",
          ownerId: unit.id,
          from,
          to,
        });

        return {
          ...unit,
          blockedDates: Array.from(new Set(events.flatMap(tokeniseRoomCalendarBlock))),
        };
      } catch (error) {
        console.warn("[homes.page] failed to hydrate room calendar", unit.id, error);
        return unit;
      }
    })
  );
}

export async function generateMetadata({
  params,
}: Readonly<HomeDetailPageProps>): Promise<Metadata> {
  const { id } = await params;
  const resolved = await getCachedHomeRouteResolution(id);
  const family = resolved.familyRow;
  const host = resolved.hostRow;

  if (!family && !host) {
    return {};
  }

  const meta = parseHostListingMeta(asString(family?.admin_notes) || null);
  const homeTitle =
    meta.listingTitle ||
    asString(family?.name) ||
    asString(host?.display_name) ||
    "Famlo homestay";
  const canonicalPath = buildHomestayPath(
    homeTitle,
    asString(family?.village) || asString(host?.locality),
    asString(family?.city) || asString(host?.city),
    resolved.familyId || resolved.hostId || id
  );
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://famlo.in").replace(/\/+$/, "");

  return {
    title: homeTitle,
    description:
      asString(family?.description) ||
      asString(host?.about) ||
      meta.culturalOffering ||
      `Discover ${homeTitle} on Famlo.`,
    alternates: {
      canonical: new URL(canonicalPath, siteUrl).toString(),
    },
  };
}

interface HomeDetailPageProps {
  params: Promise<{
    id: string;
  }>;
}

const QUARTERS = [
  { id: "morning", label: "Morning", time: "7AM - 12PM", meal: "Breakfast", key: "price_morning" },
  { id: "afternoon", label: "Afternoon", time: "12PM - 5PM", meal: "Lunch", key: "price_afternoon" },
  { id: "evening", label: "Evening", time: "5PM - 10PM", meal: "Dinner", key: "price_evening" },
  { id: "fullday", label: "Full day", time: "7AM - 10PM", meal: "All meals", key: "price_fullday" }
] as const;

function QuarterIcon({ quarterId }: Readonly<{ quarterId: string }>): React.JSX.Element {
  const commonProps = { size: 18, strokeWidth: 2.1 };
  switch (quarterId) {
    case "morning":
      return <Sunrise {...commonProps} />;
    case "afternoon":
      return <Sun {...commonProps} />;
    case "evening":
      return <Sunset {...commonProps} />;
    default:
      return <SunMoon {...commonProps} />;
  }
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asNumber(value: unknown): number {
  if (typeof value === "number") return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function asNullableNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function asArray(value: unknown): string[] {
  return Array.isArray(value) ? value : [];
}

function splitLines(value: unknown): string[] {
  if (typeof value !== "string") return [];
  return value
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function firstStringValue(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed.length > 0) return trimmed;
  }
  return "";
}

function firstArrayValue<T = unknown>(...values: unknown[]): T[] {
  for (const value of values) {
    if (Array.isArray(value) && value.length > 0) {
      return value as T[];
    }
  }
  return [];
}

function pickObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asExperienceCards(value: unknown): Array<{ title: string; description: string }> {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const next = item as Record<string, unknown>;
      const title = asString(next.title);
      const description = asString(next.description);
      if (!title || !description) return null;
      return { title, description };
    })
    .filter((item): item is { title: string; description: string } => Boolean(item));
}

function formatRoomType(value: string | null | undefined): string {
  if (!value) return "Room";
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim();
}

type StoryItem = {
  id: string;
  authorName: string;
  fromCity: string;
  storyText: string;
  rating: number | null;
  createdAt?: string;
};

export default async function HomeDetailPage({
  params
}: Readonly<HomeDetailPageProps>): Promise<React.JSX.Element> {
  const { id } = await params;
  const supabase = createAdminSupabaseClient();
  const resolved = await getCachedHomeRouteResolution(id);
  const family = resolved.familyRow;
  const host = resolved.hostRow;

  // 2. Not found OR not live
  if (!family && !host) {
    notFound();
  }

  const isAccepting = Boolean(family?.is_accepting ?? host?.is_accepting);
  const isActive = family ? Boolean(family.is_active) : typeof host?.status === "string" ? host.status === "published" : false;

  if (!isActive || !isAccepting) {
    notFound();
  }

  const familyId = resolved.familyId;
  const hostId = resolved.hostId;
  const metricsId = familyId ?? hostId ?? id;
  const moreHomesPromise = getHomesDiscoveryDataUncached();

  // 3. Fetch the independent data in parallel.
  const familyPhotosPromise = familyId
    ? supabase
        .from("family_photos")
        .select("url,is_primary,created_at")
        .eq("family_id", familyId)
        .order("is_primary", { ascending: false })
        .order("created_at", { ascending: true })
    : Promise.resolve({ data: [] as Array<{ url?: string | null; is_primary?: boolean | null; created_at?: string | null }> });

  const hostMediaPromise = hostId
    ? supabase
        .from("host_media")
        .select("media_url,is_primary,created_at")
        .eq("host_id", hostId)
        .order("is_primary", { ascending: false })
        .order("created_at", { ascending: true })
    : Promise.resolve({ data: [] as Array<{ media_url?: string | null; is_primary?: boolean | null; created_at?: string | null }> });

  const approvedDraftPromise = familyId
    ? supabase
        .from("host_onboarding_drafts")
        .select("payload,updated_at")
        .eq("family_id", familyId)
        .eq("listing_status", "approved")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle()
    : Promise.resolve({ data: null as { payload?: unknown; updated_at?: string | null } | null });

  const [familyPhotosResult, hostMediaResult, approvedDraftResult, stories, likedCountMap, stayBookingRows, verifiedGuestNetwork, moreHomes] = await Promise.all([
    familyPhotosPromise,
    hostMediaPromise,
    approvedDraftPromise,
    loadFamilyStories(metricsId, 4),
    loadLikedGuestCounts([metricsId]),
    loadHostStayBookingRecordsCompatibility(supabase, {
      hostId,
      legacyFamilyId: familyId,
    }),
    familyId
      ? loadHostGuestNetworkSummary(supabase, {
          familyId,
          viewerUserId: null,
          limit: 6,
        })
      : Promise.resolve({
          familyId: "",
          hostUserId: null,
          guestCount: 0,
          viewerCanAccessPeerChat: false,
          guests: [],
        }),
    moreHomesPromise,
  ]);
  const existingBookings = stayBookingRows;

  const meta = parseHostListingMeta(asString(family?.admin_notes) || null);
  const approvedDraft = approvedDraftResult.data;
  const onboardingPayload = pickObject(approvedDraft?.payload);
  const hostPhotoSeed = asString(family?.host_photo_url) || asString(host?.host_photo_url) || meta.hostSelfieUrl || "";
  const listingImageUrls = ((familyPhotosResult.data ?? []).map((p) => asString(p.url))).filter(Boolean);
  const hostGalleryImageUrls = ((hostMediaResult.data ?? []).map((p) => asString(p.media_url))).filter(
    (url) => Boolean(url) && url !== hostPhotoSeed
  );
  const imageUrls = hostGalleryImageUrls.length > 0 ? hostGalleryImageUrls : listingImageUrls;
  const draftIncludedItems = asArray(onboardingPayload.includedHighlights).length > 0
    ? asArray(onboardingPayload.includedHighlights)
    : asArray(onboardingPayload.includedItems);
  const draftHouseRules = splitLines(onboardingPayload.houseRulesText).length > 0
    ? splitLines(onboardingPayload.houseRulesText)
    : asArray(onboardingPayload.customRules);
  const draftCommonAreas = asArray(onboardingPayload.commonAreas);
  const draftHobbies = asArray(onboardingPayload.hobbies);
  const draftNearbyPlaces =
    Array.isArray(onboardingPayload.nearbyPlaces) && onboardingPayload.nearbyPlaces.length > 0
      ? onboardingPayload.nearbyPlaces
      : [];

  const title = meta.listingTitle || asString(family?.name) || asString(host?.display_name);
  const propertyName = asString(family?.name) || title || asString(host?.display_name);
  const hostName =
    meta.hostDisplayName ||
    asString(family?.primary_host_name) ||
    asString(family?.host_name) ||
    asString(family?.name) ||
    asString(host?.display_name) ||
    "Famlo host";
  const hostPhotoUrl = hostPhotoSeed;
  const likedCount = likedCountMap.get(metricsId) ?? (typeof family?.total_reviews === "number" ? family.total_reviews : stories.length);
  const languageList = asArray(family?.languages ?? host?.languages);
  const blockedDateSource =
    asArray(family?.blocked_dates).length > 0 ? asArray(family?.blocked_dates) : asArray(host?.blocked_dates);
  const publicCoords = getPublicCoordinates({
    lat: asNullableNumber(family?.lat ?? host?.lat),
    lng: asNullableNumber(family?.lng ?? host?.lng),
    latExact: asNullableNumber(family?.lat_exact ?? host?.lat_exact),
    lngExact: asNullableNumber(family?.lng_exact ?? host?.lng_exact),
    seed: String(familyId || hostId || id),
  });

  // 4. Normalize data
  const home = {
    id: familyId || hostId || id,
    hostId: hostId || familyId || id,
    legacyFamilyId: familyId,
    hostUserId: resolved.hostUserId,
    name: propertyName,
    listingTitle: title,
    description: asString(family?.description) || asString(host?.about),
    culturalOffering: meta.culturalOffering || asString(family?.famlo_experience) || asString(family?.about) || asString(host?.family_story),
    village: asString(family?.village) || asString(host?.locality),
    city: asString(family?.city) || asString(host?.city),
    state: asString(family?.state) || asString(host?.state),
    maxGuests: asNumber(family?.max_guests ?? host?.max_guests),
    rating: family?.rating ? Number(family.rating) : null,
    isActive,
    isAccepting,
    imageUrls,
    languages: languageList,
    amenities: meta.amenities ?? asArray(host?.amenities),
    includedItems: firstArrayValue<string>(meta.includedItems, draftIncludedItems),
    houseRules: firstArrayValue<string>(meta.houseRules, asArray(host?.house_rules), draftHouseRules),
    bathroomType: meta.bathroomType || asString(family?.bathroom_type) || asString(host?.bathroom_type),
    foodType: meta.foodType || asString(family?.food_type) || asString(host?.food_type),
    commonAreas: firstArrayValue<string>(meta.commonAreas, asArray(family?.common_areas), asArray(host?.common_areas), draftCommonAreas),
    blockedDates: blockedDateSource,
    hostBio: asString(family?.about) || asString(family?.description) || asString(host?.about),
    hostHobbies: firstStringValue(meta.hostHobbies, draftHobbies.join(", ")),
    hostCatchphrase: meta.hostCatchphrase || "",
    hostPhotoUrl,
    hostName,
    googleMapsLink: asString(family?.google_maps_link) || asString(host?.google_maps_link) || null,
    likedCount,
    stories,
    platformCommissionPct:
      typeof family?.platform_commission_pct === "number"
        ? family.platform_commission_pct
        : typeof host?.platform_commission_pct === "number"
          ? host.platform_commission_pct
          : 18,
    bookingRequiresHostApproval: Boolean(family?.booking_requires_host_approval ?? host?.booking_requires_host_approval),
    price_morning: asNumber(family?.price_morning ?? host?.price_morning),
    price_afternoon: asNumber(family?.price_afternoon ?? host?.price_afternoon),
    price_evening: asNumber(family?.price_evening ?? host?.price_evening),
    price_fullday: asNumber(family?.price_fullday ?? host?.price_fullday),
    lat: publicCoords?.lat ?? null,
    lng: publicCoords?.lng ?? null,
    landmarks:
      firstArrayValue<any>(family?.landmarks, host?.landmarks, draftNearbyPlaces),
    neighborhoodDesc: asString(family?.neighborhood_desc ?? host?.neighborhood_desc),
    accessibilityDesc: asString(family?.accessibility_desc ?? host?.accessibility_desc),
    checkInTime: firstStringValue(meta.checkInTime, asString(family?.check_in_time), asString(host?.check_in_time), asString(onboardingPayload.checkInTime)),
    checkOutTime: firstStringValue(meta.checkOutTime, asString(family?.check_out_time), asString(host?.check_out_time), asString(onboardingPayload.checkOutTime)),
    journeyStory: firstStringValue(meta.journeyStory, asString(onboardingPayload.journeyStory)),
    specialExperience: firstStringValue(meta.specialExperience, asString(onboardingPayload.specialExperience)),
    localExperience: firstStringValue(meta.localExperience, asString(onboardingPayload.localExperience)),
    interactionType: firstStringValue(meta.interactionType, asString(onboardingPayload.interactionType)),
    houseType: firstStringValue(meta.houseType, meta.familyComposition, asString(onboardingPayload.houseType)),
  };
  const stayUnitsPromise = loadStayUnitsForHome(supabase, home);
  const [stayUnitsRaw] = await Promise.all([stayUnitsPromise]);
  const stayUnits = await hydrateStayUnitsWithBlockedDates(supabase, stayUnitsRaw);
  const visibleStayUnits = stayUnits.filter((unit) => unit.isActive);
  const roomRatingSummaryMap = await loadStayUnitRatingSummaries(
    supabase,
    visibleStayUnits.map((unit) => unit.id)
  );
  const primaryStayUnit =
    visibleStayUnits.find((unit) => unit.isPrimary) ??
    visibleStayUnits[0] ??
    stayUnits.find((unit) => unit.isPrimary) ??
    stayUnits[0] ??
    null;
  const homeAmenities = primaryStayUnit?.amenities.length ? primaryStayUnit.amenities : home.amenities;
  const homeQuarterPrices = {
    morning: primaryStayUnit?.priceMorning && primaryStayUnit.priceMorning > 0 ? primaryStayUnit.priceMorning : home.price_morning,
    afternoon: primaryStayUnit?.priceAfternoon && primaryStayUnit.priceAfternoon > 0 ? primaryStayUnit.priceAfternoon : home.price_afternoon,
    evening: primaryStayUnit?.priceEvening && primaryStayUnit.priceEvening > 0 ? primaryStayUnit.priceEvening : home.price_evening,
    fullday: primaryStayUnit?.priceFullday && primaryStayUnit.priceFullday > 0 ? primaryStayUnit.priceFullday : home.price_fullday,
  };

  const publicLocation = [home.village, home.city].filter(Boolean).join(", ");
  const amenityIncluded = homeAmenities.map((item) => item);
  const nonAmenityIncluded = Array.from(new Set([
    ...parseMultiValueList(home.foodType).map((item) => `Food type: ${item}`),
    ...home.includedItems.filter((item) => !item.toLowerCase().startsWith("amenity:")),
  ]));
  const included = Array.from(new Set([
    ...parseMultiValueList(home.foodType).map((item) => `Food type: ${item}`),
    ...homeAmenities.map((item) => `Amenity: ${item}`),
    ...home.includedItems,
  ]));
  const rules = home.houseRules;
  const activeQuarterIds =
    ((Array.isArray(family?.active_quarters) ? family?.active_quarters : Array.isArray(host?.active_quarters) ? host?.active_quarters : []) as string[])
      .filter((quarterId) => typeof quarterId === "string" && quarterId.length > 0);
  const quarterOptions = QUARTERS
    .filter((quarter) => (activeQuarterIds.length > 0 ? activeQuarterIds.includes(quarter.id) : true))
    .map((quarter) => ({
      id: quarter.id,
      label: quarter.label,
      time: quarter.time,
      meal: quarter.meal,
      price: homeQuarterPrices[quarter.id]
    }))
    .filter((quarter) => Number.isFinite(quarter.price) && quarter.price > 0);
  const totalStaysCount = stayBookingRows.length;
  const hostStatusLabel = home.isActive && home.isAccepting ? "Professional Active" : "Professional Inactive";
  const hostInitial = home.hostName.charAt(0).toUpperCase() || "F";
  const activeStayUnitCount = visibleStayUnits.length;
  const hasInactiveStayUnits = stayUnits.length > 0 && activeStayUnitCount === 0;
  const profileIntro = home.hostCatchphrase.trim();
  const recentRoomImageUrl =
    visibleStayUnits.flatMap((unit) => unit.photos ?? []).find((photo) => typeof photo === "string" && photo.trim().length > 0) ||
    home.imageUrls[0] ||
    hostGalleryImageUrls[0] ||
    "";
  const recentRoomPrice = [homeQuarterPrices.fullday, homeQuarterPrices.morning, homeQuarterPrices.afternoon, homeQuarterPrices.evening]
    .filter((price): price is number => Number.isFinite(price) && price > 0)
    .sort((left, right) => left - right)[0] ?? 0;
  const recentPriceLabel = recentRoomPrice > 0 ? `₹${recentRoomPrice.toLocaleString("en-IN")} / room` : "Price set by host";
  const recentRoomLabel = activeStayUnitCount > 0
    ? `${activeStayUnitCount} room${activeStayUnitCount === 1 ? "" : "s"}`
    : home.maxGuests
      ? `${home.maxGuests} guests`
      : "Rooms available";
  const customExperienceCards = asExperienceCards(meta.famloExperienceCards);
  const experienceCards =
    customExperienceCards.length > 0
      ? customExperienceCards.map((card) => ({ title: card.title, body: card.description }))
      : DEFAULT_EXPERIENCE_CARDS.map((card) => ({ title: card.title, body: card.description }));
  const foodOffering = parseMultiValueList(meta.foodType || asString(family?.food_type) || asString(host?.food_type));
  const foodOfferingCards =
    foodOffering.length > 0
      ? foodOffering.map((item) => ({
          tag: item,
          title: `${item} offering`,
          body:
            item.toLowerCase() === "veg"
              ? "Vegetarian meals and homestyle dishes prepared by the host family."
              : item.toLowerCase() === "non-veg"
                ? "Non-vegetarian options can be arranged according to the host's kitchen style."
                : "Higher-protein meals and fuller plates for active travelers and longer stays.",
        }))
      : [
          {
            tag: "Veg",
            title: "Vegetarian meals",
            body: "Home-style plant-forward cooking with regional ingredients.",
          },
          {
            tag: "Non-veg",
            title: "Non-vegetarian meals",
            body: "Fresh non-vegetarian dishes depending on the host kitchen setup.",
          },
          {
            tag: "Protein+",
            title: "Protein-rich plates",
            body: "Balanced meals with extra nutrition for longer or active stays.",
          },
        ];
  const amenityItems = homeAmenities.length > 0 ? homeAmenities : ["Wi-Fi", "Filtered water", "Hosted welcome"];
  const amenityIconMap = new Map<string, () => React.JSX.Element>([
    ["wi-fi", () => <Wifi size={18} />],
    ["wifi", () => <Wifi size={18} />],
    ["air conditioning", () => <Snowflake size={18} />],
    ["filtered water", () => <Bath size={18} />],
    ["hosted welcome", () => <Coffee size={18} />],
    ["hot shower", () => <ShowerHead size={18} />],
    ["secure room", () => <Lock size={18} />],
    ["chai included", () => <Coffee size={18} />],
    ["fresh linen", () => <Bath size={18} />],
    ["24 hr water", () => <Bath size={18} />],
    ["common tv", () => <Monitor size={18} />],
    ["near metro", () => <MapPin size={18} />],
    ["toiletries", () => <Globe size={18} />],
    ["parking", () => <Users size={18} />],
  ]);
  const setupRows = [
    {
      title: "Private Bedroom",
      body: "Double bed · AC · fan · lockable door",
      badge: "Private",
      icon: <Users size={18} />,
    },
    {
      title: "Shared Bathroom",
      body: "Hot water · geyser · shared with host family",
      badge: "Shared",
      icon: <Bath size={18} />,
    },
    {
      title: "Home Kitchen",
      body: "Fresh meals prepared daily · guests welcome to observe",
      badge: "Host-run",
      icon: <Coffee size={18} />,
    },
    {
      title: "Common Living Area",
      body: "TV · sofa · natural light · open 7 am – 10 pm",
      badge: "Shared",
      icon: <Monitor size={18} />,
    },
  ];
  const moreHomesList = moreHomes
    .filter((item) => item.id !== home.id)
    .filter((item) => item.isActive && item.isAccepting)
    .slice(0, 4);

  return (
    <main className="shell famlo-booking-page home-details-page" style={{ maxWidth: 1280, paddingTop: 20 }}>
      <RecentHomeViewTracker
        id={home.id}
        hostId={resolved.hostId}
        legacyFamilyId={resolved.familyId}
        title={home.listingTitle || home.name}
        image={recentRoomImageUrl || home.imageUrls[0] || hostGalleryImageUrls[0] || ""}
        hostName={home.hostName || hostName}
        hostPhotoUrl={home.hostPhotoUrl || hostPhotoSeed || null}
        roomImageUrl={recentRoomImageUrl || ""}
        priceLabel={recentPriceLabel}
        roomLabel={recentRoomLabel}
        subtitle={publicLocation || null}
      />
      <div className={styles.homeDetailsGrid}>
        <div className={styles.homeMainColumn}>
          <section
            className={styles.homeHeroCard}
            style={{
              background: "#fff",
              borderRadius: "24px",
              border: "1px solid #e2e8f0",
              padding: "16px 18px",
              boxShadow: "0 10px 40px -10px rgba(0,0,0,0.06)"
            }}
          >
            <div style={{ display: "grid", gridTemplateColumns: "132px minmax(0, 1fr)", gap: "16px", alignItems: "start" }}>
              <div style={{ width: "132px", height: "132px", borderRadius: "18px", overflow: "hidden", background: "#f1f5f9" }}>
                {home.hostPhotoUrl ? (
                  <img src={home.hostPhotoUrl} alt={home.hostName} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <div style={{ width: "100%", height: "100%", display: "grid", placeItems: "center", fontSize: "44px", fontWeight: 800, color: "#64748b" }}>{hostInitial}</div>
                )}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px" }}>
                  <div style={{ minWidth: 0 }}>
                    <h1 style={{ fontSize: "clamp(24px, 3.3vw, 32px)", fontWeight: 800, margin: 0, fontFamily: "'DM Sans', sans-serif", lineHeight: 1.06, letterSpacing: "-0.03em" }}>
                      {home.hostName}
                    </h1>
                    <p style={{ fontSize: "16px", color: "#475569", fontWeight: 700, margin: "4px 0 0" }}>
                      {home.listingTitle || home.name}
                    </p>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "#0f172a", fontWeight: 700, fontSize: "11px", flexShrink: 0, marginTop: "2px" }}>
                    <span>Verified</span>
                    <ShieldCheck size={14} fill="#1d9bf0" color="#fff" />
                  </div>
                </div>
                <div style={{ fontSize: "11px", fontWeight: 700, color: "#94a3b8", marginTop: "10px", display: "flex", alignItems: "center", gap: "8px" }}>
                  {publicLocation}
                </div>
                {profileIntro ? (
                  <p style={{ fontSize: "12px", color: "#64748b", lineHeight: 1.5, margin: "14px 0 0", fontWeight: 700 }}>
                    {profileIntro}
                  </p>
                ) : null}
              </div>
            </div>
          </section>

          <div className={styles.homeMainContent}>
            {(home.journeyStory || home.specialExperience) ? (
              <section style={{ display: "grid", gap: "12px" }}>
                {home.journeyStory ? (
                  <div className={styles.contentTab} style={{ borderRadius: "16px", border: "1px solid #e2e8f0", padding: "20px 22px" }}>
                    <div style={{ fontSize: "11px", fontWeight: 900, letterSpacing: "0.1em", textTransform: "uppercase", color: "#60a5fa", marginBottom: "12px" }}>
                      My Journey{home.city ? ` of ${home.city}` : ""}
                    </div>
                    <div style={{ fontSize: "15px", lineHeight: 1.75, color: "#334155", fontWeight: 400, fontFamily: "Georgia, 'Times New Roman', serif", letterSpacing: "0.01em" }}>{home.journeyStory}</div>
                  </div>
                ) : null}

                {/* ── Mobile-only rooms block — hidden on desktop via CSS ── */}
                <div className={styles.mobileRoomsInline}>
                  <div className={styles.roomsHeader}>
                    <Bed size={22} strokeWidth={2.5} />
                    Rooms Available
                  </div>
                  <div className={styles.roomsContent}>
                    {hasInactiveStayUnits ? (
                      <div style={{ marginBottom: "16px", padding: "14px 16px", borderRadius: "16px", background: "#fff7ed", border: "1px solid #fed7aa", color: "#9a3412", fontSize: "13px", fontWeight: 700, lineHeight: 1.6 }}>
                        All rooms are closed right now. Reopen a room in the host dashboard to bring it back onto this listing.
                      </div>
                    ) : null}
                    <div style={{ display: "grid", gap: "24px", width: "100%" }}>
                      {visibleStayUnits.map((unit) => {
                        const price = unit.priceFullday || unit.priceMorning || 0;
                        const roomCoverImage = unit.photos[0] || null;
                        const roomRating = roomRatingSummaryMap.get(unit.id) ?? null;
                        const roomRatingLabel = roomRating?.averageRating != null ? roomRating.averageRating.toFixed(1) : "New";
                        const roomMeta = [
                          `${unit.maxGuests || 1} guest${(unit.maxGuests || 1) === 1 ? "" : "s"}`,
                          unit.bedInfo || null,
                          unit.bathroomType || "Shared bath",
                        ].filter(Boolean);
                        return (
                          <Link
                            key={unit.id}
                            href={`/host/${home.hostId}/room/${unit.id}`}
                            style={{ textDecoration: "none", color: "inherit", display: "block" }}
                          >
                            <div className={styles.roomCard}>
                              <div style={{ height: "168px", position: "relative" }}>
                                {roomCoverImage ? (
                                  <img src={roomCoverImage} alt={unit.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                                ) : (
                                  <div style={{ width: "100%", height: "100%", background: "#f1f5f9", display: "grid", placeItems: "center", color: "#94a3b8" }}>
                                    <Bed size={32} strokeWidth={1.5} />
                                    <span style={{ fontSize: "12px", fontWeight: 600, marginTop: "8px" }}>No room image</span>
                                  </div>
                                )}
                                <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(15,23,42,0) 35%, rgba(15,23,42,0.88) 100%)" }} />
                                <div style={{ position: "absolute", inset: 0, padding: "14px", display: "flex", flexDirection: "column", justifyContent: "space-between", color: "#fff" }}>
                                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "10px" }}>
                                    <div style={{ fontSize: "11px", fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase", background: "rgba(255,255,255,0.95)", color: "#1890ff", padding: "5px 12px", borderRadius: "999px", boxShadow: "0 2px 8px rgba(0,0,0,0.08)" }}>
                                      {formatRoomType(unit.unitType)}
                                    </div>
                                    <div style={{ fontSize: "11px", fontWeight: 800, background: "rgba(34,197,94,0.9)", color: "#fff", padding: "5px 10px", borderRadius: "999px", backdropFilter: "blur(4px)" }}>
                                      Available
                                    </div>
                                  </div>
                                  <div style={{ display: "grid", gap: "6px" }}>
                                    <div style={{ fontSize: "17px", fontWeight: 800, lineHeight: 1.2 }}>{unit.name}</div>
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px" }}>
                                      <div style={{ display: "flex", alignItems: "baseline", gap: "4px" }}>
                                        {price > 0 ? (
                                          <>
                                            <span style={{ fontSize: "18px", fontWeight: 900 }}>₹{price}</span>
                                            <span style={{ fontSize: "11px", fontWeight: 600, opacity: 0.8 }}>/ room</span>
                                          </>
                                        ) : (
                                          <span style={{ fontSize: "13px", fontWeight: 800, opacity: 0.85 }}>Price set by host</span>
                                        )}
                                      </div>
                                      <div style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "13px", fontWeight: 700, background: "rgba(0,0,0,0.3)", padding: "3px 8px", borderRadius: "10px", backdropFilter: "blur(8px)" }}>
                                        <span>{roomRatingLabel}</span>
                                        <span style={{ color: "#fbbf24" }}>★</span>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                              <div style={{ padding: "14px 14px 16px", background: "#fff" }}>
                                <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", marginBottom: "12px" }}>
                                  {roomMeta.slice(0, 3).map((meta) => (
                                    <span key={meta} style={{ padding: "6px 10px", borderRadius: "999px", background: "#f8fafc", border: "1px solid #e2e8f0", color: "#334155", fontSize: "12px", fontWeight: 700 }}>
                                      {meta}
                                    </span>
                                  ))}
                                </div>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px", marginTop: "6px" }}>
                                  <span style={{ fontSize: "12px", fontWeight: 700, color: "#1890ff", background: "#f0f7ff", padding: "5px 11px", borderRadius: "10px" }}>
                                    {unit.roomSizeSqm ? `${unit.roomSizeSqm} sqm` : "Verified Room"}
                                  </span>
                                  <div style={{ fontSize: "12px", fontWeight: 700, color: "#64748b", display: "flex", alignItems: "center", gap: "4px" }}>
                                    <ShieldCheck size={14} color="#1890ff" />
                                    <span>Famlo Protection</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <section style={{ background: "#fff", borderRadius: "24px", padding: "22px", border: "1px solid #eee" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px", gap: "12px" }}>
                    <div>
                      <h2 style={{ fontSize: "18px", fontWeight: 800, margin: 0, fontFamily: "'DM Sans', sans-serif" }}>{home.hostName} Gallery</h2>
                      <p style={{ margin: "6px 0 0", color: "#94a3b8", fontSize: "12px", fontWeight: 600 }}>
                        Guest memories and host moments that shape the personality of this home.
                      </p>
                    </div>
                    <span style={{ color: "#94a3b8", fontSize: "12px", fontWeight: 700, whiteSpace: "nowrap" }}>Shared by the host</span>
                  </div>
                  {imageUrls.length > 0 ? (
                    <HostGalleryViewer title={home.hostName} images={imageUrls} />
                  ) : (
                    <div style={{ borderRadius: "16px", padding: "26px", background: "#f8fafc", color: "#64748b", fontSize: "14px", textAlign: "center", border: "1px dashed #cbd5e1" }}>
                      No home photos available yet.
                    </div>
                  )}
                </section>

                {home.specialExperience ? (
                  <div className={styles.contentTab} style={{ borderRadius: "16px", border: "1px solid #e2e8f0", padding: "20px 22px" }}>
                    <div style={{ fontSize: "11px", fontWeight: 900, letterSpacing: "0.1em", textTransform: "uppercase", color: "#60a5fa", marginBottom: "12px" }}>My Special Place</div>
                    <div style={{ fontSize: "15px", lineHeight: 1.75, color: "#334155", fontWeight: 400, fontFamily: "Georgia, 'Times New Roman', serif", letterSpacing: "0.01em" }}>{home.specialExperience}</div>
                  </div>
                ) : null}
              </section>
            ) : null}

            <section
              className={styles.contentTabSection}
              style={{
                borderRadius: "24px",
                border: "1px solid #e2e8f0",
                padding: "14px 14px 18px",
                boxShadow: "0 10px 40px -10px rgba(0,0,0,0.06)"
              }}
            >
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                background: "#3b82f6",
                borderRadius: "12px",
                overflow: "hidden",
                marginBottom: "18px"
              }}>
                {[
                  { label: "Guests Hosted", value: verifiedGuestNetwork.guestCount },
                  { label: "Rooms", value: activeStayUnitCount },
                  { label: "Stories", value: home.stories.length },
                  { label: "Liked by", value: likedCount }
                ].map((stat, i) => (
                  <div key={stat.label} style={{
                    padding: "12px 8px 10px",
                    textAlign: "center",
                    borderRight: i < 3 ? "1px solid rgba(255,255,255,0.2)" : "none",
                    display: "flex",
                    flexDirection: "column",
                    gap: "2px",
                    minWidth: 0
                  }}>
                    <strong style={{ fontSize: "22px", color: "#fff", fontWeight: 800, lineHeight: 1.05 }}>{stat.value}</strong>
                    <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.92)", fontWeight: 700 }}>{stat.label}</span>
                  </div>
                ))}
              </div>

              <div className={styles.infoWhatsGrid}>
                <div>
                  <h2 style={{ fontSize: "20px", fontWeight: 800, marginBottom: "14px", fontFamily: "'DM Sans', sans-serif", letterSpacing: "-0.02em" }}>Info</h2>
                  <div style={{ display: "grid", gap: "14px" }}>
                    {[
                      { label: "Speaks", value: home.languages.join(", ") || "Not shared yet" },
                      { label: "Family Type", value: home.houseType || "Not shared yet" },
                      {
                        label: "Hobbies",
                        value: parseMultiValueList(home.hostHobbies || "").length > 0 ? (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                            {parseMultiValueList(home.hostHobbies || "").map((hobby) => (
                              <span key={hobby} style={{ padding: "6px 10px", borderRadius: "999px", background: "#eff6ff", border: "1px solid #bfdbfe", color: "#1d4ed8", fontSize: "12px", fontWeight: 800 }}>
                                {hobby}
                              </span>
                            ))}
                          </div>
                        ) : (
                          "Not shared yet"
                        ),
                      },
                      { label: "Interaction Style", value: home.interactionType || "Not shared yet" },
                      { label: "Check In / Check Out", value: (
                        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", justifyContent: "flex-start" }}>
                          <span style={{ padding: "5px 10px", border: "1px solid #e2e8f0", borderRadius: "10px", background: "#f8fafc", color: "#334155", fontSize: "13px", fontWeight: 700 }}>{home.checkInTime || "Not set"}</span>
                          <span style={{ padding: "5px 10px", border: "1px solid #e2e8f0", borderRadius: "10px", background: "#f8fafc", color: "#334155", fontSize: "13px", fontWeight: 700 }}>{home.checkOutTime || "Not set"}</span>
                        </div>
                      )},
                    ].map((item, index, arr) => (
                      <div key={item.label} style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "4px",
                        paddingBottom: index === arr.length - 1 ? 0 : "14px",
                        borderBottom: index === arr.length - 1 ? "none" : "1px solid #eef2ff"
                      }}>
                        <div style={{ fontSize: "10px", fontWeight: 900, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                          {item.label}
                        </div>
                        <div style={{ fontSize: "14px", fontWeight: 700, color: "#0f172a", lineHeight: 1.45 }}>
                          {item.value}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ display: "grid", gap: "12px" }}>
                  {[
                    {
                      title: "Whats Included",
                      items: included,
                      isIncluded: true
                    },
                    {
                      title: "Near by place to vist",
                      landmark: home.landmarks[0] || null
                    },
                    {
                      title: "House Rule",
                      rules
                    },
                    {
                      title: "Common Area Access",
                      items: home.commonAreas.length > 0 ? home.commonAreas : ["No common area details shared yet."],
                      isCommonArea: true
                    }
                  ].map((section) => (
                    <div key={section.title} style={{
                      border: "1px solid #bfdbfe",
                      borderRadius: "14px",
                      overflow: "hidden",
                      background: "#eff6ff"
                    }}>
                      <div style={{ background: "#e0f2fe", padding: "8px 16px", color: "#60a5fa", fontWeight: 800, fontSize: "14px", textAlign: "center", borderBottom: "1px solid #bfdbfe" }}>
                        {section.title}
                      </div>
                      <div style={{ padding: "12px 16px" }}>
                        {section.isIncluded && (
                          (() => {
                            const amenityRows = amenityIncluded;
                            const otherRows = nonAmenityIncluded;
                            const hasAny = amenityRows.length > 0 || otherRows.length > 0;
                            if (!hasAny) return <div style={{ fontSize: "13px", color: "#64748b", fontWeight: 600 }}>No included items shared yet.</div>;
                            return (
                              <div style={{ display: "grid", gap: "10px" }}>
                                {otherRows.length > 0 && (
                                  <div style={{ display: "grid", gap: "8px" }}>
                                    {otherRows.map((it) => (
                                      <div key={it} style={{ display: "flex", gap: "10px", alignItems: "center", fontSize: "13px", fontWeight: 700, lineHeight: 1.4 }}>
                                        <span style={{ color: "#3b82f6" }}>●</span> {it}
                                      </div>
                                    ))}
                                  </div>
                                )}
                                {amenityRows.length > 0 && (
                                  <div>
                                    <div style={{ fontSize: "10px", fontWeight: 900, textTransform: "uppercase", color: "#3b82f6", letterSpacing: "0.08em", marginBottom: "6px", borderTop: otherRows.length > 0 ? "1px solid #bfdbfe" : "none", paddingTop: otherRows.length > 0 ? "8px" : 0 }}>Amenities</div>
                                    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                                      {amenityRows.map((it) => (
                                        <span key={it} style={{ padding: "4px 10px", borderRadius: "999px", background: "#dbeafe", color: "#1d4ed8", fontSize: "11px", fontWeight: 800 }}>{it}</span>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })()
                        )}
                        {section.isCommonArea && (
                          section.items.length > 0 ? (
                            <div style={{ display: "grid", gap: "8px" }}>
                              {section.items.map((item) => (
                                <div key={item} style={{ fontSize: "13px", fontWeight: 700, lineHeight: 1.45 }}>
                                  {item}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div style={{ fontSize: "13px", color: "#64748b", fontWeight: 600 }}>No common area access shared yet.</div>
                          )
                        )}
                        {section.landmark && (
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", fontSize: "13px", fontWeight: 700 }}>
                            <span>{asString((section.landmark as Record<string, unknown>).name) || "Nearby place"}</span>
                            <span style={{ borderBottom: "2px solid #60a5fa", paddingBottom: "2px", whiteSpace: "nowrap" }}>
                              {[asString((section.landmark as Record<string, unknown>).distance), asString((section.landmark as Record<string, unknown>).unit)].filter(Boolean).join(" ") || "Not shared"}
                            </span>
                          </div>
                        )}
                        {!section.landmark && section.title === "Near by place to vist" ? (
                          <div style={{ fontSize: "13px", color: "#64748b", fontWeight: 600 }}>No nearby place shared yet.</div>
                        ) : null}
                        {section.rules && (
                          section.rules.length > 0 ? (
                            <div style={{ display: "grid", gap: "8px" }}>
                              {section.rules.map((rule) => (
                                <div key={rule} style={{ fontSize: "13px", fontWeight: 700, lineHeight: 1.45 }}>
                                  {rule}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div style={{ fontSize: "13px", color: "#64748b", fontWeight: 600 }}>No house rules shared yet.</div>
                          )
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            {home.localExperience ? (
              <div className={styles.contentTab} style={{ borderRadius: "16px", border: "1px solid #e2e8f0", padding: "20px 22px" }}>
                <div style={{ fontSize: "11px", fontWeight: 900, letterSpacing: "0.1em", textTransform: "uppercase", color: "#60a5fa", marginBottom: "12px" }}>My Local Experience</div>
                <div style={{ fontSize: "15px", lineHeight: 1.75, color: "#334155", fontWeight: 400, fontFamily: "Georgia, 'Times New Roman', serif", letterSpacing: "0.01em" }}>{home.localExperience}</div>
              </div>
            ) : null}

            <section
              style={{
                background: "linear-gradient(180deg, #ffffff 0%, #f8fbff 100%)",
                borderRadius: "32px",
                padding: "28px",
                border: "1px solid #dbeafe",
                boxShadow: "0 18px 40px rgba(15, 23, 42, 0.08)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", gap: "12px" }}>
                <h2 style={{ fontSize: "24px", fontWeight: 800, margin: 0 }}>More Homes</h2>
                <Link href="/homestays" style={{ color: "#1890ff", fontWeight: 700, textDecoration: "none" }}>
                  See more
                </Link>
              </div>
              <div
                style={{
                  display: "flex",
                  gap: "18px",
                  overflowX: "auto",
                  paddingBottom: "10px",
                  scrollbarWidth: "none",
                  scrollSnapType: "x proximity",
                }}
              >
                {moreHomesList.length > 0 ? moreHomesList.map((item) => {
                  const isSameListing = item.hostId === home.hostId || item.legacyFamilyId === home.legacyFamilyId;
                  return (
                    <HomeCoverCard
                      key={item.id}
                      home={item}
                      roomCountOverride={isSameListing ? activeStayUnitCount : item.roomCount ?? undefined}
                      roomImageUrlsOverride={isSameListing
                        ? visibleStayUnits.flatMap((unit) => unit.photos ?? []).filter((photo): photo is string => typeof photo === "string" && photo.trim().length > 0)
                        : item.roomImageUrls}
                      suppressHomeFallback={false}
                    />
                  );
                }) : (
                  <>
                    <div style={{ minWidth: "clamp(280px, 25vw, 340px)", height: "220px", borderRadius: "22px", background: "#f1f5f9" }} />
                    <div style={{ minWidth: "clamp(280px, 25vw, 340px)", height: "220px", borderRadius: "22px", background: "#f1f5f9" }} />
                  </>
                )}
              </div>
            </section>
          </div>
        </div>

        <aside className={styles.homeRoomsSidebar}>
          <div className={styles.roomsHeader}>
            <Bed size={22} strokeWidth={2.5} />
            Rooms Available
          </div>
          <div className={styles.roomsScrollable}>
          {hasInactiveStayUnits ? (
            <div style={{ marginBottom: "16px", padding: "14px 16px", borderRadius: "16px", background: "#fff7ed", border: "1px solid #fed7aa", color: "#9a3412", fontSize: "13px", fontWeight: 700, lineHeight: 1.6 }}>
              All rooms are closed right now. Reopen a room in the host dashboard to bring it back onto this listing.
            </div>
          ) : null}
          <div style={{ display: "grid", gap: "24px", width: "100%" }}>
            {visibleStayUnits.map((unit) => {
              const price = unit.priceFullday || unit.priceMorning || 0;
              const roomCoverImage = unit.photos[0] || null;
              const roomRating = roomRatingSummaryMap.get(unit.id) ?? null;
              const roomRatingLabel = roomRating?.averageRating != null ? roomRating.averageRating.toFixed(1) : "New";
              const roomMeta = [
                `${unit.maxGuests || 1} guest${(unit.maxGuests || 1) === 1 ? "" : "s"}`,
                unit.bedInfo || null,
                unit.bathroomType || "Shared bath",
              ].filter(Boolean);
              return (
                <Link
                  key={unit.id}
                  href={`/host/${home.hostId}/room/${unit.id}`}
                  style={{ textDecoration: "none", color: "inherit", display: "block" }}
                >
                  <div className={styles.roomCard}>
                    <div style={{ height: "168px", position: "relative" }}>
                      {roomCoverImage ? (
                        <img src={roomCoverImage} alt={unit.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      ) : (
                        <div style={{ width: "100%", height: "100%", background: "#f1f5f9", display: "grid", placeItems: "center", color: "#94a3b8" }}>
                          <Bed size={32} strokeWidth={1.5} />
                          <span style={{ fontSize: "12px", fontWeight: 600, marginTop: "8px" }}>No room image</span>
                        </div>
                      )}
                      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(15,23,42,0) 35%, rgba(15,23,42,0.88) 100%)" }} />
                      <div style={{ position: "absolute", inset: 0, padding: "14px", display: "flex", flexDirection: "column", justifyContent: "space-between", color: "#fff" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "10px" }}>
                            <div style={{
                              fontSize: "11px",
                              fontWeight: 800,
                              letterSpacing: "0.05em",
                              textTransform: "uppercase",
                              background: "rgba(255, 255, 255, 0.95)",
                              color: "#1890ff",
                              padding: "5px 12px",
                              borderRadius: "999px",
                              boxShadow: "0 2px 8px rgba(0,0,0,0.08)"
                            }}>
                              {formatRoomType(unit.unitType)}
                            </div>
                            <div style={{
                              fontSize: "11px",
                              fontWeight: 800,
                              background: "rgba(34,197,94,0.9)",
                              color: "#fff",
                              padding: "5px 10px",
                              borderRadius: "999px",
                              backdropFilter: "blur(4px)"
                            }}>
                              Available
                            </div>
                        </div>
                        <div style={{ display: "grid", gap: "6px" }}>
                          <div style={{ fontSize: "17px", fontWeight: 800, lineHeight: 1.2 }}>{unit.name}</div>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px" }}>
                            <div style={{ display: "flex", alignItems: "baseline", gap: "4px" }}>
                              {price > 0 ? (
                                <>
                                  <span style={{ fontSize: "18px", fontWeight: 900 }}>₹{price}</span>
                                  <span style={{ fontSize: "11px", fontWeight: 600, opacity: 0.8 }}>/ room</span>
                                </>
                              ) : (
                                <span style={{ fontSize: "13px", fontWeight: 800, opacity: 0.85 }}>Price set by host</span>
                              )}
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "13px", fontWeight: 700, background: "rgba(0,0,0,0.3)", padding: "3px 8px", borderRadius: "10px", backdropFilter: "blur(8px)" }}>
                              <span>{roomRatingLabel}</span>
                              <span style={{ color: "#fbbf24" }}>★</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div style={{ padding: "14px 14px 16px", background: "#fff" }}>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", marginBottom: "12px" }}>
                        {roomMeta.slice(0, 3).map((meta) => (
                          <span
                            key={meta}
                            style={{
                              padding: "6px 10px",
                              borderRadius: "999px",
                              background: "#f8fafc",
                              border: "1px solid #e2e8f0",
                              color: "#334155",
                              fontSize: "12px",
                              fontWeight: 700,
                            }}
                          >
                            {meta}
                          </span>
                        ))}
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px", marginTop: "6px" }}>
                        <span style={{ fontSize: "12px", fontWeight: 700, color: "#1890ff", background: "#f0f7ff", padding: "5px 11px", borderRadius: "10px" }}>
                          {unit.roomSizeSqm ? `${unit.roomSizeSqm} sqm` : "Verified Room"}
                        </span>
                        <div style={{ fontSize: "12px", fontWeight: 700, color: "#64748b", display: "flex", alignItems: "center", gap: "4px" }}>
                          <ShieldCheck size={14} color="#1890ff" />
                          <span>Famlo Protection</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>

          </div>
        </aside>
      </div>
    </main>
  );
}
