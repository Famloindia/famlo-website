import Link from "next/link";

import HomestaysSearchBar from "@/components/public/HomestaysSearchBar";
import { HomePageCard } from "@/components/public/HomePageCard";
import { getHomesDiscoveryDataUncached, type HomeCardRecord } from "@/lib/discovery";
import { createAdminSupabaseClient } from "@/lib/supabase";
import { calculateDistance } from "@/lib/location-utils";
import { enumerateDateRange } from "@/lib/platform-utils";
import { getMostInteractedHostScores } from "@/lib/host-interactions";

interface HomestaysPageProps {
  searchParams?: Promise<{
    q?: string | string[];
    guests?: string | string[];
    from?: string | string[];
    to?: string | string[];
    lat?: string | string[];
    lng?: string | string[];
    near?: string | string[];
    open?: string | string[];
  }>;
}

function asSearchString(value: string | string[] | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function asSearchNumber(value: string | string[] | undefined): number | null {
  if (typeof value !== "string") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function asSearchGuests(value: string | string[] | undefined): number | null {
  if (typeof value !== "string") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : null;
}

function matchesQuery(home: HomeCardRecord, query: string): boolean {
  if (!query) return true;
  const haystack = [
    home.listingTitle,
    home.name,
    home.village,
    home.city,
    home.state,
    home.hostPhotoUrl,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(query);
}

function isAvailableForDateRange(home: HomeCardRecord, fromDate: string, toDate: string): boolean {
  if (!fromDate) return true;
  const end = toDate || fromDate;
  for (const date of enumerateDateRange(fromDate, end)) {
    if (
      home.blockedDates.includes(date) ||
      home.blockedDates.includes(`${date}::fullday`) ||
      home.blockedDates.some((slot) => slot.startsWith(`${date}::`))
    ) {
      return false;
    }
  }
  return true;
}

function prettyDate(value: string): string {
  if (!value) return "";
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

type StayUnitSummaryRow = {
  host_id?: string | null;
  legacy_family_id?: string | null;
  unit_key?: string | null;
  name?: string | null;
  unit_type?: string | null;
  price_fullday?: number | string | null;
  price_morning?: number | string | null;
  price_afternoon?: number | string | null;
  price_evening?: number | string | null;
  is_active?: boolean | null;
  photos?: unknown;
};

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function toPrice(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }
  return 0;
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

function buildRoomStatsMap(
  rows: StayUnitSummaryRow[],
  key: "host_id" | "legacy_family_id"
): Map<string, { roomCount: number; startingRoomPrice: number | null; roomImageUrls: string[] }> {
  const stats = new Map<string, { roomCount: number; startingRoomPrice: number | null; roomImageUrls: string[] }>();
  const seen = new Set<string>();

  for (const row of rows) {
    const lookup = typeof row[key] === "string" ? row[key] : null;
    if (!lookup) continue;
    if (row.is_active === false) continue;

    const photos = asStringArray(row.photos);
    const hasPrices =
      toPrice(row.price_fullday) > 0 ||
      toPrice(row.price_morning) > 0 ||
      toPrice(row.price_afternoon) > 0 ||
      toPrice(row.price_evening) > 0;
    const hasCopy = typeof row.name === "string" && row.name.trim().length > 0;
    const hasUnitType = typeof row.unit_type === "string" && row.unit_type.trim().length > 0;
    if (!hasPrices && photos.length === 0 && !hasCopy && !hasUnitType) continue;

    const rowKey = `${lookup}::${row.unit_key ?? row.name ?? JSON.stringify(row.photos ?? [])}`;
    if (seen.has(rowKey)) continue;
    seen.add(rowKey);

    const current = stats.get(lookup) ?? { roomCount: 0, startingRoomPrice: null, roomImageUrls: [] };
    current.roomCount += 1;

    const candidate = [row.price_fullday, row.price_morning, row.price_afternoon, row.price_evening]
      .map((price) => toPrice(price))
      .filter((price) => price > 0)
      .reduce((lowest, price) => Math.min(lowest, price), Number.POSITIVE_INFINITY);
    if (Number.isFinite(candidate) && candidate > 0) {
      current.startingRoomPrice = current.startingRoomPrice == null ? candidate : Math.min(current.startingRoomPrice, candidate);
    }

    current.roomImageUrls = dedupeStrings([...current.roomImageUrls, ...photos]);
    stats.set(lookup, current);
  }

  return stats;
}

export const dynamic = "force-dynamic";
const MOST_INTERACTED_ENABLED = process.env.NEXT_PUBLIC_ENABLE_MOST_INTERACTED_HOSTS === "true";
const NEAR_RADIUS_KM = 25;

export default async function HomestaysPage({ searchParams }: HomestaysPageProps): Promise<React.JSX.Element> {
  const params = (await searchParams) ?? {};
  const supabase = createAdminSupabaseClient();
  const rawQuery = asSearchString(params.q);
  const query = rawQuery.toLowerCase();
  const guests = asSearchGuests(params.guests);
  const fromDate = asSearchString(params.from);
  const toDate = asSearchString(params.to);
  const searchLat = asSearchNumber(params.lat);
  const searchLng = asSearchNumber(params.lng);
  const nearOnly = asSearchString(params.near) === "1";
  const openOnly = asSearchString(params.open) === "1";

  const homes = await getHomesDiscoveryDataUncached();
  const hostIds = [...new Set(homes.map((home) => home.hostId).filter((hostId): hostId is string => Boolean(hostId)))];
  const legacyFamilyIds = [...new Set(homes.map((home) => home.legacyFamilyId).filter((familyId): familyId is string => Boolean(familyId)))];

  const [hostStayUnitsResult, legacyStayUnitsResult] = await Promise.all([
    hostIds.length > 0
      ? supabase
          .from("stay_units_v2")
          .select("host_id, unit_key, name, unit_type, price_fullday, price_morning, price_afternoon, price_evening, is_active, photos")
          .in("host_id", hostIds)
      : Promise.resolve({ data: [] as StayUnitSummaryRow[], error: null }),
    legacyFamilyIds.length > 0
      ? supabase
          .from("stay_units_v2")
          .select("legacy_family_id, unit_key, name, unit_type, price_fullday, price_morning, price_afternoon, price_evening, is_active, photos")
          .in("legacy_family_id", legacyFamilyIds)
      : Promise.resolve({ data: [] as StayUnitSummaryRow[], error: null }),
  ]);

  const roomStatsMap = new Map<string, { roomCount: number; startingRoomPrice: number | null; roomImageUrls: string[] }>();
  for (const [lookup, stats] of buildRoomStatsMap((hostStayUnitsResult.data ?? []) as StayUnitSummaryRow[], "host_id")) {
    roomStatsMap.set(lookup, stats);
  }
  for (const [lookup, stats] of buildRoomStatsMap((legacyStayUnitsResult.data ?? []) as StayUnitSummaryRow[], "legacy_family_id")) {
    const current = roomStatsMap.get(lookup);
    if (!current) {
      roomStatsMap.set(lookup, stats);
      continue;
    }

    current.roomCount = Math.max(current.roomCount, stats.roomCount);
    current.startingRoomPrice =
      current.startingRoomPrice == null
        ? stats.startingRoomPrice
        : stats.startingRoomPrice == null
          ? current.startingRoomPrice
          : Math.min(current.startingRoomPrice, stats.startingRoomPrice);
    current.roomImageUrls = dedupeStrings([...current.roomImageUrls, ...stats.roomImageUrls]);
  }

  const enrichedHomes = homes.map((home) => {
    const roomStats = roomStatsMap.get(home.hostId ?? "") ?? roomStatsMap.get(home.legacyFamilyId ?? "");
    if (!roomStats) return home;

    return {
      ...home,
      roomCount: home.roomCount ?? roomStats.roomCount,
      startingRoomPrice: home.startingRoomPrice ?? roomStats.startingRoomPrice,
      roomImageUrls: home.roomImageUrls.length > 0 ? home.roomImageUrls : roomStats.roomImageUrls,
    };
  });

  const interactionScores = MOST_INTERACTED_ENABLED
    ? await getMostInteractedHostScores(
        supabase,
        [...new Set(enrichedHomes.map((home) => home.hostId ?? "").filter((hostId): hostId is string => Boolean(hostId)))]
      )
    : new Map();

  const filteredHomes = enrichedHomes.filter((home) => {
    if (guests != null && (home.maxGuests ?? 0) < guests) return false;
    if (!matchesQuery(home, query)) return false;
    if (openOnly && (!home.isActive || !home.isAccepting)) return false;
    if (!isAvailableForDateRange(home, fromDate, toDate)) return false;

    if (nearOnly && searchLat != null && searchLng != null && home.lat != null && home.lng != null) {
      return calculateDistance(searchLat, searchLng, home.lat, home.lng) <= NEAR_RADIUS_KM;
    }

    return true;
  });

  const scoredHomes = filteredHomes.slice().sort((left, right) => {
    const leftLive = left.isActive && left.isAccepting;
    const rightLive = right.isActive && right.isAccepting;
    if (leftLive !== rightLive) return leftLive ? -1 : 1;

    const leftQuery =
      query && [left.listingTitle, left.name, left.village, left.city, left.state].filter(Boolean).join(" ").toLowerCase();
    const rightQuery =
      query && [right.listingTitle, right.name, right.village, right.city, right.state].filter(Boolean).join(" ").toLowerCase();
    const leftExact = leftQuery && (leftQuery === query || left.name?.toLowerCase() === query || left.listingTitle?.toLowerCase() === query);
    const rightExact = rightQuery && (rightQuery === query || right.name?.toLowerCase() === query || right.listingTitle?.toLowerCase() === query);
    if (Boolean(leftExact) !== Boolean(rightExact)) return leftExact ? -1 : 1;

    if (searchLat != null && searchLng != null && left.lat != null && left.lng != null && right.lat != null && right.lng != null) {
      const leftDistance = calculateDistance(searchLat, searchLng, left.lat, left.lng);
      const rightDistance = calculateDistance(searchLat, searchLng, right.lat, right.lng);
      if (leftDistance !== rightDistance) return leftDistance - rightDistance;
    }

    const leftScore = interactionScores.get(left.hostId ?? "")?.finalScore ?? 0;
    const rightScore = interactionScores.get(right.hostId ?? "")?.finalScore ?? 0;
    if (leftScore !== rightScore) return rightScore - leftScore;

    if ((left.featured ? 1 : 0) !== (right.featured ? 1 : 0)) {
      return left.featured ? -1 : 1;
    }

    if (query) {
      const leftHaystack = [left.listingTitle, left.name, left.village, left.city, left.state].filter(Boolean).join(" ").toLowerCase();
      const rightHaystack = [right.listingTitle, right.name, right.village, right.city, right.state].filter(Boolean).join(" ").toLowerCase();
      const leftStarts = leftHaystack.startsWith(query);
      const rightStarts = rightHaystack.startsWith(query);
      if (leftStarts !== rightStarts) return leftStarts ? -1 : 1;
      const leftIncludes = leftHaystack.includes(query);
      const rightIncludes = rightHaystack.includes(query);
      if (leftIncludes !== rightIncludes) return leftIncludes ? -1 : 1;
    }

    return (left.listingTitle ?? left.name).localeCompare(right.listingTitle ?? right.name);
  });

  const heading = searchLat != null && searchLng != null
    ? "Homestays near you"
    : rawQuery
      ? `Homestays near ${rawQuery}`
      : "Homestays";

  const summaryBits = [
    guests != null ? `${guests}+ guests` : "",
    fromDate || toDate ? `${prettyDate(fromDate)}${fromDate && toDate ? " - " : ""}${prettyDate(toDate)}` : "",
    nearOnly ? "Near me" : "",
    openOnly ? "Open only" : "",
  ].filter(Boolean);
  const openCount = scoredHomes.filter((home) => home.isActive && home.isAccepting).length;
  const closedCount = scoredHomes.length - openCount;

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "linear-gradient(180deg, #f8fbff 0%, #ffffff 36%, #eef6ff 100%)",
      }}
    >
      <div style={{ maxWidth: 1440, margin: "0 auto", padding: "22px 18px 64px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px",
            marginBottom: "18px",
            flexWrap: "wrap",
          }}
        >
          <Link href="/" style={{ display: "inline-flex", alignItems: "center", textDecoration: "none" }}>
            <img src="/logo-blue.png" alt="Famlo" style={{ height: "28px", width: "auto", display: "block" }} />
          </Link>
          <Link
            href="/"
            style={{
              padding: "10px 14px",
              borderRadius: "999px",
              border: "1px solid #dbeafe",
              background: "#fff",
              color: "#0f172a",
              fontSize: "13px",
              fontWeight: 800,
              textDecoration: "none",
            }}
          >
            Back home
          </Link>
        </div>

        <section
          style={{
            padding: "24px",
            borderRadius: "32px",
            background: "linear-gradient(135deg, rgba(255,255,255,0.96), rgba(239,246,255,0.96))",
            border: "1px solid #dbeafe",
            boxShadow: "0 20px 50px rgba(15, 23, 42, 0.08)",
            marginBottom: "20px",
          }}
        >
          <div style={{ display: "grid", gap: "10px", marginBottom: "18px" }}>
            <span
              style={{
                fontSize: "12px",
                fontWeight: 900,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "#1d4ed8",
              }}
            >
              Discover Famlo
            </span>
            <h1 style={{ margin: 0, fontSize: "clamp(28px, 4vw, 48px)", lineHeight: 1.02, letterSpacing: "-0.03em" }}>
              {heading}
            </h1>
            <p style={{ margin: 0, color: "#475569", fontSize: "15px", lineHeight: 1.6 }}>
              Search by place, host, guests, or dates. Turn on location to automatically use your current area.
            </p>
          </div>

          <HomestaysSearchBar
            defaultQuery={rawQuery}
            defaultGuests={typeof params.guests === "string" ? params.guests : ""}
            defaultFrom={fromDate}
            defaultTo={toDate}
            defaultNearOnly={nearOnly}
            defaultOpenOnly={openOnly}
            defaultLat={searchLat}
            defaultLng={searchLng}
          />

          {summaryBits.length > 0 ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "16px" }}>
              {summaryBits.map((item) => (
                <span
                  key={item}
                  style={{
                    padding: "6px 10px",
                    borderRadius: "999px",
                    background: "#eff6ff",
                    color: "#1d4ed8",
                    border: "1px solid #bfdbfe",
                    fontSize: "12px",
                    fontWeight: 800,
                  }}
                >
                  {item}
                </span>
              ))}
            </div>
          ) : null}
        </section>

        <section style={{ marginBottom: "16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
          <div style={{ display: "grid", gap: "4px" }}>
            <h2 style={{ margin: 0, fontSize: "22px", fontWeight: 900 }}>All homestays</h2>
            <p style={{ margin: 0, color: "#64748b", fontSize: "14px" }}>
              {openCount} open stay{openCount === 1 ? "" : "s"} and {closedCount} closed
            </p>
          </div>
          <Link href="/joinfamlo" style={{ color: "#1d4ed8", fontWeight: 800, textDecoration: "none", fontSize: "14px" }}>
            Want to join Famlo?
          </Link>
        </section>

        {scoredHomes.length > 0 ? (
          <section
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "18px",
              alignItems: "stretch",
            }}
            >
            {scoredHomes.map((home) => {
              return (
                <HomePageCard
                  key={home.id}
                  home={home}
                />
              );
            })}
          </section>
        ) : (
          <section
            style={{
              borderRadius: "24px",
              padding: "28px",
              background: "#fff",
              border: "1px solid #dbeafe",
              boxShadow: "0 12px 30px rgba(15, 23, 42, 0.06)",
            }}
          >
            <h3 style={{ margin: 0, fontSize: "20px", fontWeight: 900 }}>No matching homestays yet</h3>
            <p style={{ margin: "10px 0 0", color: "#64748b", lineHeight: 1.6 }}>
              Try a different place, relax one of the filters, or turn on location to see stays near you.
            </p>
          </section>
        )}
      </div>
    </main>
  );
}
