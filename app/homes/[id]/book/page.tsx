import { notFound } from "next/navigation";

import { HomeBookingFlow } from "@/components/public/HomeBookingFlow";
import { addIndiaDays, getTodayInIndia } from "@/lib/booking-time";
import { loadHostStayBookingRecordsCompatibility } from "@/lib/booking-compat";
import { loadCanonicalCalendar } from "@/lib/calendar";
import type { HomeCardRecord } from "@/lib/discovery";
import { parseHostListingMeta } from "@/lib/host-listing-meta";
import { getPublicCoordinates } from "@/lib/location-utils";
import { resolveHomeRoute } from "@/lib/home-route-resolution";
import { loadStayUnitsForHome, type StayUnitRecord } from "@/lib/stay-units";
import { buildHomestayPath } from "@/lib/slug";
import { createAdminSupabaseClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

interface BookingPageProps {
  params: Promise<{
    id: string;
  }>;
}

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
        console.warn("[homes.book] failed to hydrate room calendar", unit.id, error);
        return unit;
      }
    })
  );
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

export default async function BookingPage({
  params,
}: Readonly<BookingPageProps>): Promise<React.JSX.Element> {
  const { id } = await params;
  const supabase = createAdminSupabaseClient();
  const resolved = await resolveHomeRoute(supabase, id);
  const family = resolved.familyRow;
  const host = resolved.hostRow;

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
  const existingBookings = await loadHostStayBookingRecordsCompatibility(supabase, {
    hostId,
    legacyFamilyId: familyId,
  });

  const { data: familyPhotos } = familyId
    ? await supabase
        .from("family_photos")
        .select("url,is_primary,created_at")
        .eq("family_id", familyId)
        .order("is_primary", { ascending: false })
        .order("created_at", { ascending: true })
    : { data: [] };

  const { data: hostMedia } = hostId
    ? await supabase
        .from("host_media")
        .select("media_url,is_primary,created_at")
        .eq("host_id", hostId)
        .order("is_primary", { ascending: false })
        .order("created_at", { ascending: true })
    : { data: [] };

  const imageUrls = ((familyPhotos ?? []).length > 0
    ? (familyPhotos ?? []).map((row) => asString(row.url))
    : (hostMedia ?? []).map((row) => asString(row.media_url)))
    .filter((value): value is string => Boolean(value));

  const meta = parseHostListingMeta(asString(family?.admin_notes) || null);
  const activeQuarterSource = asStringArray(family?.active_quarters).length > 0 ? asStringArray(family?.active_quarters) : asStringArray(host?.active_quarters);
  const blockedDateSource = asStringArray(family?.blocked_dates).length > 0 ? asStringArray(family?.blocked_dates) : asStringArray(host?.blocked_dates);
  const publicCoords = getPublicCoordinates({
    lat: asNumber(family?.lat ?? host?.lat),
    lng: asNumber(family?.lng ?? host?.lng),
    latExact: asNumber(family?.lat_exact ?? host?.lat_exact),
    lngExact: asNumber(family?.lng_exact ?? host?.lng_exact),
    seed: String(familyId || hostId || id),
  });

  const home: HomeCardRecord = {
    id: familyId || hostId || id,
    href: buildHomestayPath(
      asString(family?.name) || asString(host?.display_name) || "Famlo Home",
      asString(family?.village) || asString(host?.locality),
      asString(family?.city) || asString(host?.city),
      familyId || hostId || id
    ),
    hostId: hostId || familyId || id,
    hostUserId: resolved.hostUserId,
    legacyFamilyId: familyId,
    name: asString(family?.name) || asString(host?.display_name) || "Famlo Home",
    city: asString(family?.city) || asString(host?.city),
    state: asString(family?.state) || asString(host?.state),
    village: asString(family?.village) || asString(host?.locality),
    description: asString(family?.description) || asString(host?.about),
    culturalOffering: meta.culturalOffering || asString(family?.famlo_experience) || asString(family?.about) || asString(host?.family_story),
    includedItems: meta.includedItems ?? [],
    houseRules: meta.houseRules ?? [],
    amenities: meta.amenities ?? asStringArray(host?.amenities),
    bathroomType: meta.bathroomType || asString(family?.bathroom_type) || asString(host?.bathroom_type),
    listingTitle: meta.listingTitle || asString(family?.name) || asString(host?.display_name),
    maxGuests: asNumber(family?.max_guests ?? host?.max_guests),
    roomCount: null,
    startingRoomPrice: null,
    priceMorning: asNumber(family?.price_morning ?? host?.price_morning) ?? 0,
    priceAfternoon: asNumber(family?.price_afternoon ?? host?.price_afternoon) ?? 0,
    priceEvening: asNumber(family?.price_evening ?? host?.price_evening) ?? 0,
    priceFullday: asNumber(family?.price_fullday ?? host?.price_fullday) ?? 0,
    rating: asNumber(family?.rating),
    totalReviews: asNumber(family?.total_reviews),
    superhost: Boolean(family?.superhost),
    isActive,
    isAccepting,
    googleMapsLink: meta.googleMapsLink || asString(family?.google_maps_link),
    activeQuarters: activeQuarterSource.length > 0 ? activeQuarterSource : ["morning", "afternoon", "evening", "fullday"],
    blockedDates: blockedDateSource,
    platformCommissionPct: asNumber(family?.platform_commission_pct ?? host?.platform_commission_pct) ?? 18,
    bookingRequiresHostApproval: Boolean(family?.booking_requires_host_approval ?? host?.booking_requires_host_approval),
    checkInTime: asString(meta.checkInTime) || asString(family?.check_in_time) || asString(host?.check_in_time) || null,
    checkOutTime: asString(meta.checkOutTime) || asString(family?.check_out_time) || asString(host?.check_out_time) || null,
    lat: publicCoords?.lat ?? null,
    lng: publicCoords?.lng ?? null,
    latExact: asNumber(family?.lat_exact ?? host?.lat_exact),
    lngExact: asNumber(family?.lng_exact ?? host?.lng_exact),
    landmarks: Array.isArray(family?.landmarks ?? host?.landmarks) ? ((family?.landmarks ?? host?.landmarks) as unknown[]) : [],
    neighborhoodDesc: asString(family?.neighborhood_desc ?? host?.neighborhood_desc),
    accessibilityDesc: asString(family?.accessibility_desc ?? host?.accessibility_desc),
    imageUrls,
    roomImageUrls: [],
    hostPhotoUrl: asString(family?.host_photo_url) || imageUrls[0] || meta.hostSelfieUrl || null,
    featured: false,
  };
  const stayUnitsRaw = await loadStayUnitsForHome(supabase, home);
  const stayUnits = await hydrateStayUnitsWithBlockedDates(supabase, stayUnitsRaw);
  const visibleStayUnits = stayUnits.filter((unit) => unit.isActive);
  const primaryStayUnit =
    visibleStayUnits.find((unit) => unit.isPrimary) ??
    visibleStayUnits[0] ??
    stayUnits.find((unit) => unit.isPrimary) ??
    stayUnits[0] ??
    null;
  const bookingHomeAmenities = primaryStayUnit?.amenities.length ? primaryStayUnit.amenities : meta.amenities ?? asStringArray(host?.amenities);
  const bookingHomePrices = {
    morning: primaryStayUnit?.priceMorning && primaryStayUnit.priceMorning > 0 ? primaryStayUnit.priceMorning : asNumber(family?.price_morning ?? host?.price_morning) ?? 0,
    afternoon: primaryStayUnit?.priceAfternoon && primaryStayUnit.priceAfternoon > 0 ? primaryStayUnit.priceAfternoon : asNumber(family?.price_afternoon ?? host?.price_afternoon) ?? 0,
    evening: primaryStayUnit?.priceEvening && primaryStayUnit.priceEvening > 0 ? primaryStayUnit.priceEvening : asNumber(family?.price_evening ?? host?.price_evening) ?? 0,
    fullday: primaryStayUnit?.priceFullday && primaryStayUnit.priceFullday > 0 ? primaryStayUnit.priceFullday : asNumber(family?.price_fullday ?? host?.price_fullday) ?? 0,
  };
  const bookingHome: HomeCardRecord = {
    ...home,
    amenities: bookingHomeAmenities,
    priceMorning: bookingHomePrices.morning,
    priceAfternoon: bookingHomePrices.afternoon,
    priceEvening: bookingHomePrices.evening,
    priceFullday: bookingHomePrices.fullday,
  };

  return (
    <main className="shell">
      <HomeBookingFlow home={bookingHome} existingBookings={existingBookings} stayUnits={stayUnits} />
    </main>
  );
}
