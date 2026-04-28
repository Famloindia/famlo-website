import Link from "next/link";
import { BadgeCheck, ChevronLeft } from "lucide-react";

import styles from "@/components/public/RoomDetailPage.module.css";
import { RoomBookingPanel } from "@/components/public/RoomBookingPanel";
import { RoomImageGallery } from "@/components/public/RoomImageGallery";
import { RoomLocationMap } from "@/components/public/RoomLocationMap";
import { addIndiaDays, getTodayInIndia } from "@/lib/booking-time";
import { loadCanonicalCalendar } from "@/lib/calendar";
import { parseHostListingMeta } from "@/lib/host-listing-meta";
import { resolveHomeRoute } from "@/lib/home-route-resolution";
import { getPublicCoordinates } from "@/lib/location-utils";
import { loadStayUnitById, loadStayUnitsForHome, type StayUnitHomeInput, type StayUnitRecord } from "@/lib/stay-units";
import { buildHomestayPath } from "@/lib/slug";
import { createAdminSupabaseClient } from "@/lib/supabase";

interface HostRoomPageProps {
  params: Promise<{
    slug: string;
    roomId: string;
  }>;
}

export const dynamic = "force-dynamic";

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function titleCase(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function dedupeStrings(values: Array<string | null | undefined>): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => (typeof value === "string" ? value.trim() : ""))
        .filter((value) => value.length > 0)
    )
  );
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

function tokeniseBookedDates(event: { startDate: string; endDate: string; isBlocking: boolean; status: string }): string[] {
  if (!event.isBlocking || event.status === "released" || event.status === "cancelled") {
    return [];
  }

  return enumerateDateStrings(event.startDate, event.endDate);
}

async function hydrateRoomWithBlockedDates(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  unit: StayUnitRecord
): Promise<StayUnitRecord> {
  const from = getTodayInIndia();
  const to = addIndiaDays(from, 365);

  try {
    const events = await loadCanonicalCalendar(supabase, {
      ownerType: "stay_unit",
      ownerId: unit.id,
      from,
      to,
    });

    return {
      ...unit,
      blockedDates: Array.from(new Set(events.flatMap(tokeniseBookedDates))),
    };
  } catch (error) {
    console.warn("[room.page] failed to hydrate room calendar", unit.id, error);
    return unit;
  }
}

function roomTypeLabel(unitType: string): string {
  switch (unitType) {
    case "private_room":
      return "Private room";
    case "shared_room":
      return "Shared room";
    case "family_room":
      return "Family room";
    case "deluxe_room":
      return "Deluxe room";
    case "standard_room":
      return "Standard room";
    case "entire_home":
      return "Entire home";
    default:
      return titleCase(unitType || "Private room");
  }
}

function buildFallbackHomeInput(resolved: Awaited<ReturnType<typeof resolveHomeRoute>>, meta: ReturnType<typeof parseHostListingMeta>): StayUnitHomeInput {
  const family = resolved.familyRow ?? {};
  const host = resolved.hostRow ?? {};

  return {
    id: resolved.familyId ?? resolved.hostId ?? "primary-room",
    hostId: resolved.hostId,
    legacyFamilyId: resolved.familyId,
    listingTitle: meta.listingTitle || asString(family.name) || asString(host.display_name) || "Famlo Home",
    name: asString(family.name) || asString(host.display_name) || "Primary room",
    description: asString(family.description) || asString(host.about),
    maxGuests: asNumber(family.max_guests ?? host.max_guests, 1),
    priceMorning: asNumber(family.price_morning ?? host.price_morning, 0),
    priceAfternoon: asNumber(family.price_afternoon ?? host.price_afternoon, 0),
    priceEvening: asNumber(family.price_evening ?? host.price_evening, 0),
    priceFullday: asNumber(family.price_fullday ?? host.price_fullday, 0),
    activeQuarters: Array.isArray(family.active_quarters)
      ? (family.active_quarters as string[])
      : Array.isArray(host.active_quarters)
        ? (host.active_quarters as string[])
        : [],
    isActive: Boolean(family.is_active ?? host.status === "published"),
    isAccepting: Boolean(family.is_accepting ?? host.is_accepting),
    bathroomType: asString(family.bathroom_type) || asString(host.bathroom_type),
    amenities: Array.isArray(family.amenities)
      ? (family.amenities as string[])
      : Array.isArray(host.amenities)
        ? (host.amenities as string[])
        : [],
    imageUrls: [],
    hostPhotoUrl: asString(family.host_photo_url) || meta.hostSelfieUrl || null,
  };
}

export default async function HostRoomPage({
  params,
}: Readonly<HostRoomPageProps>): Promise<React.JSX.Element> {
  const { slug, roomId } = await params;
  const supabase = createAdminSupabaseClient();
  const resolvedRoute = await resolveHomeRoute(supabase, slug);
  const resolved = resolvedRoute.hostId || resolvedRoute.familyId
    ? resolvedRoute
    : {
        hostId: slug,
        familyId: null,
        hostUserId: null,
        hostRow: null,
        familyRow: null,
      };

  const canonicalId = resolved.familyId ?? resolved.hostId ?? slug ?? roomId;
  const routeId = canonicalId ?? slug ?? roomId;

  const familyId = resolved.familyId;
  const hostId = resolved.hostId;

  const meta = parseHostListingMeta(asString(resolved.familyRow?.admin_notes) || null);
  const fallbackRoom = await loadStayUnitsForHome(supabase, buildFallbackHomeInput(resolved, meta));
  const directRoom = await loadStayUnitById(supabase, roomId);
  const directRoomMatchesHost = !directRoom || !resolved.hostId || !directRoom.hostId || directRoom.hostId === resolved.hostId;
  const directRoomMatchesFamily = !directRoom || !resolved.familyId || !directRoom.legacyFamilyId || directRoom.legacyFamilyId === resolved.familyId;
  const resolvedRoom =
    (directRoomMatchesHost && directRoomMatchesFamily ? directRoom : null) ??
    fallbackRoom.find((unit) => unit.id === roomId) ??
    fallbackRoom.find((unit) => unit.isPrimary) ??
    fallbackRoom[0] ??
    {
      id: roomId || routeId,
      hostId: resolved.hostId ?? null,
      legacyFamilyId: resolved.familyId ?? null,
      unitKey: "primary",
      name: "Primary room",
      unitType: "private_room",
      description: "A warm, local room designed for comfortable travel and an easy booking rhythm.",
      maxGuests: 1,
      bedInfo: "1 bed",
      bathroomType: "Shared or attached",
      roomSizeSqm: null,
      priceMorning: 0,
      priceAfternoon: 0,
      priceEvening: 0,
      priceFullday: 0,
      quarterEnabled: true,
      isActive: true,
      isPrimary: true,
      amenities: [],
      photos: [],
      blockedDates: [],
      sortOrder: 0,
      source: "fallback",
    };

  const room = await hydrateRoomWithBlockedDates(supabase, resolvedRoom as StayUnitRecord);
  const homeName = meta.listingTitle || asString(resolved.familyRow?.name) || asString(resolved.hostRow?.display_name) || "Famlo Home";
  const hostName =
    meta.hostDisplayName ||
    asString(resolved.familyRow?.primary_host_name) ||
    asString(resolved.familyRow?.host_name) ||
    asString(resolved.hostRow?.display_name) ||
    "Famlo host";
  const areaLabel =
    [
      asString(resolved.familyRow?.village) || asString(resolved.hostRow?.locality),
      asString(resolved.familyRow?.city) || asString(resolved.hostRow?.city),
      asString(resolved.familyRow?.state) || asString(resolved.hostRow?.state),
    ]
      .filter(Boolean)
      .join(", ") || "Home area";
  const checkInTime = meta.checkInTime || "11 AM";
  const checkOutTime = meta.checkOutTime || "1 PM";
  const publicCoords = getPublicCoordinates({
    lat: asNumber(resolved.familyRow?.lat ?? resolved.hostRow?.lat, NaN),
    lng: asNumber(resolved.familyRow?.lng ?? resolved.hostRow?.lng, NaN),
    latExact: asNumber(resolved.familyRow?.lat_exact ?? resolved.hostRow?.lat_exact, NaN),
    lngExact: asNumber(resolved.familyRow?.lng_exact ?? resolved.hostRow?.lng_exact, NaN),
    seed: routeId,
  });
  const roomLat = Number.isFinite(room.lat ?? NaN) ? room.lat : publicCoords?.lat ?? null;
  const roomLng = Number.isFinite(room.lng ?? NaN) ? room.lng : publicCoords?.lng ?? null;

  const galleryImages = dedupeStrings(room.photos);
  const localityImages = dedupeStrings(room.localityPhotos);

  const roomFacts = [
    { label: "Room type", value: roomTypeLabel(room.unitType) },
    { label: "Max guests", value: `${room.maxGuests}` },
    { label: "Bed configuration", value: room.bedInfo || "1 bed" },
    { label: "Bathroom", value: room.bathroomType || "Shared or attached" },
    { label: "Room size", value: room.roomSizeSqm != null ? `${room.roomSizeSqm} sqm` : "Not specified" },
    { label: "Check-in", value: checkInTime },
    { label: "Check-out", value: checkOutTime },
  ];

  const amenityItems = room.amenities.length > 0
    ? room.amenities
    : [
        "WiFi",
        "AC / Fan",
        "Attached bathroom",
        "Hot water",
        "Parking",
        "Kitchen access",
      ];

  return (
    <main
      className={styles.page}
      style={{
        background:
          "radial-gradient(circle at top left, rgba(24,144,255,0.10), transparent 35%), linear-gradient(180deg, #f7fbff 0%, #ffffff 100%)",
      }}
    >
      <div className={styles.shell}>
        <section className={styles.headerCard}>
          <div className={styles.headerRow}>
            <div className={styles.headerCopy}>
              <Link
                href={buildHomestayPath(
                  homeName,
                  asString(resolved.familyRow?.village) || asString(resolved.hostRow?.locality) || areaLabel,
                  asString(resolved.familyRow?.city) || asString(resolved.hostRow?.city),
                  routeId
                )}
                className={styles.aboutLink}
              >
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <ChevronLeft size={16} />
                  About {hostName}
                </span>
              </Link>
              <h1 className={styles.homeTitle}>{room.name}</h1>
              <div className={styles.roomSubtitle}>{homeName}</div>
              <div className={styles.areaLabel}>{areaLabel}</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", justifyContent: "flex-end" }}>

              <div className={styles.verifiedPill}>
                <span>Verified</span>
                <BadgeCheck size={26} color="#1890ff" />
              </div>
            </div>
          </div>
        </section>

        <section className={styles.heroCard}>
          <h2 className={styles.heroTitle}>{room.name}</h2>
          <div className={styles.mainLayoutGrid}>
            <div className={styles.leftColumn}>
              <RoomImageGallery roomName={room.name} images={galleryImages} />

          <section className={styles.roomInfoSection}>
            <div className={styles.roomOverviewCard}>
              <div className={styles.roomOverviewHeader}>
                <div>
                  <div className={styles.roomOverviewKicker}>Room overview</div>
                  <h3 className={styles.roomOverviewTitle}>{room.name}</h3>
                  <p className={styles.roomOverviewDescription}>
                    {room.description || "A calm, comfortable room shaped for real local stays."}
                  </p>
                </div>
                <div className={styles.roomOverviewBadge}>{room.isPrimary ? "Primary room" : "Secondary room"}</div>
              </div>

              <div className={styles.roomFactGrid}>
                {roomFacts.map((fact) => (
                  <div key={fact.label} className={styles.roomFactChip}>
                    <div className={styles.roomFactLabel}>{fact.label}</div>
                    <div className={styles.roomFactValue}>{fact.value}</div>
                  </div>
                ))}
              </div>
            </div>

            <aside className={styles.amenitiesStripCard}>
              <div className={styles.amenitiesHeader}>
                <div className={styles.roomOverviewKicker}>Amenities</div>

              </div>
              <div className={styles.amenitiesChipRow}>
                {amenityItems.map((item) => (
                  <div key={item} className={styles.amenitiesChip}>
                    {item}
                  </div>
                ))}
              </div>
            </aside>
          </section>

          {localityImages.length > 0 ? (
            <section className={styles.roomLocalityCard}>
              <div className={styles.roomLocalityHeader}>
                <div>
                  <div className={styles.roomOverviewKicker}>Locality</div>
                  <h3 className={styles.roomLocalityTitle}>Around the home</h3>
                  <p className={styles.roomLocalityDescription}>
                    A visual look at the neighborhood shared by the host. This section stays hidden when no locality photos are uploaded.
                  </p>
                </div>
                <div className={styles.roomLocationBadge}>Locality photos</div>
              </div>
              <div className={styles.roomLocalityGrid}>
                {localityImages.slice(0, 4).map((imageUrl, index) => (
                  <div key={`${imageUrl}-${index}`} className={styles.roomLocalityTile}>
                    <img src={imageUrl} alt={`${room.name} locality ${index + 1}`} />
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <RoomLocationMap
            roomName={room.name}
            areaLabel={areaLabel}
            lat={roomLat}
            lng={roomLng}
          />
            </div>

            <aside className={styles.rightColumnSticky}>
              <RoomBookingPanel
                home={{
                  id: routeId,
                  hostId: resolved.hostId,
                  legacyFamilyId: resolved.familyId,
                  hostUserId: resolved.hostUserId,
                  name: homeName,
                  listingTitle: homeName,
                  city: asString(resolved.familyRow?.city) || asString(resolved.hostRow?.city),
                  state: asString(resolved.familyRow?.state) || asString(resolved.hostRow?.state),
                  googleMapsLink: asString(resolved.familyRow?.google_maps_link) || asString(resolved.hostRow?.google_maps_link) || null,
                  platformCommissionPct: asNumber(resolved.familyRow?.platform_commission_pct ?? resolved.hostRow?.platform_commission_pct) ?? 18,
                  bookingRequiresHostApproval: Boolean(resolved.familyRow?.booking_requires_host_approval ?? resolved.hostRow?.booking_requires_host_approval),
                  isActive: Boolean(
                    resolved.familyRow
                      ? resolved.familyRow.is_active
                      : typeof resolved.hostRow?.status === "string"
                        ? resolved.hostRow.status === "published"
                        : room.isActive
                  ),
                  isAccepting: Boolean(resolved.familyRow?.is_accepting ?? resolved.hostRow?.is_accepting ?? room.isActive),
                  checkInTime,
                  checkOutTime,
                }}
                room={room}
                areaLabel={areaLabel}
              />
            </aside>
          </div>
        </section>
      </div>
    </main>
  );
}
