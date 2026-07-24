import Link from "next/link";
import Image from "next/image";

import HomestaysSearchBar from "@/components/public/HomestaysSearchBar";
import { HomePageCard } from "@/components/public/HomePageCard";
import { getHomesDiscoveryData, type HomeCardRecord } from "@/lib/discovery";
import {
  getDiscoveryQueryScore,
  isHomeAvailableForDateRange,
  matchesDiscoveryQuery,
  resolveDiscoveryDateRange,
  supportsGuestCount,
} from "@/lib/discovery-search";
import { createAdminSupabaseClient } from "@/lib/supabase";
import { calculateDistance } from "@/lib/location-utils";
import { getMostInteractedHostScores } from "@/lib/host-interactions";

interface HomestaysPageProps {
  searchParams?: Promise<{
    q?: string | string[];
    guests?: string | string[];
    from?: string | string[];
    to?: string | string[];
    date?: string | string[];
    date_to?: string | string[];
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

function prettyDate(value: string): string {
  if (!value) return "";
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export const revalidate = 60;
const MOST_INTERACTED_ENABLED = process.env.NEXT_PUBLIC_ENABLE_MOST_INTERACTED_HOSTS === "true";
const NEAR_RADIUS_KM = 25;

export default async function HomestaysPage({ searchParams }: HomestaysPageProps): Promise<React.JSX.Element> {
  const params = (await searchParams) ?? {};
  const rawQuery = asSearchString(params.q);
  const query = rawQuery.toLowerCase();
  const guests = asSearchGuests(params.guests);
  const { fromDate, toDate } = resolveDiscoveryDateRange(params);
  const searchLat = asSearchNumber(params.lat);
  const searchLng = asSearchNumber(params.lng);
  const nearOnly = asSearchString(params.near) === "1";
  const openOnly = asSearchString(params.open) === "1";

  const homes = await getHomesDiscoveryData();
  const enrichedHomes = homes;

  const interactionScores = MOST_INTERACTED_ENABLED
    ? await getMostInteractedHostScores(
        createAdminSupabaseClient(),
        [...new Set(enrichedHomes.map((home) => home.hostId ?? "").filter((hostId): hostId is string => Boolean(hostId)))]
      )
    : new Map();

  const filteredHomes = enrichedHomes.filter((home) => {
    if (!supportsGuestCount(home, guests)) return false;
    if (!matchesDiscoveryQuery(home, query)) return false;
    if (openOnly && (!home.isActive || !home.isAccepting)) return false;
    if (!isHomeAvailableForDateRange(home, fromDate, toDate)) return false;

    if (nearOnly && searchLat != null && searchLng != null && home.lat != null && home.lng != null) {
      return calculateDistance(searchLat, searchLng, home.lat, home.lng) <= NEAR_RADIUS_KM;
    }

    return true;
  });

  const scoredHomes = filteredHomes.slice().sort((left, right) => {
    const leftLive = left.isActive && left.isAccepting;
    const rightLive = right.isActive && right.isAccepting;
    if (leftLive !== rightLive) return leftLive ? -1 : 1;

    const leftQueryScore = getDiscoveryQueryScore(left, query);
    const rightQueryScore = getDiscoveryQueryScore(right, query);
    if (leftQueryScore !== rightQueryScore) return rightQueryScore - leftQueryScore;

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
            <Image
              src="/logo-blue.png"
              alt="Famlo"
              width={1024}
              height={344}
              sizes="120px"
              style={{ height: "28px", width: "auto", display: "block" }}
            />
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
              {scoredHomes.length} stay{scoredHomes.length === 1 ? "" : "s"} match your place, date, and guest filters. {openCount} open and {closedCount} closed.
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
