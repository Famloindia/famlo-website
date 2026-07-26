"use client";

import dynamic from "next/dynamic";
import { useState, useMemo, useEffect, useRef, useCallback, useSyncExternalStore } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useUser } from "@/components/auth/UserContext";
import type { HomeCardRecord, CompanionRecord, AdRecord, StoryRecord, HomepageReelRecord } from "@/lib/discovery";
import { recordHostInteractionEvent } from "@/lib/host-interactions";
import { recordPublicReelView } from "@/lib/public-reel-view";
import { buildHomestayPath } from "@/lib/slug";
import { readRecentViews, type RecentViewItem } from "@/lib/recent-views";
import { HomePageCard } from "@/components/public/HomePageCard";
import DestinationAutocomplete from "@/components/public/DestinationAutocomplete";
import { buildDiscoverySearchHref, type DestinationSuggestion } from "@/lib/destination-autocomplete";
import { DISCOVERY_STAY_FILTERS, matchesDiscoveryStayFilter, type DiscoveryStayFilter } from "@/lib/discovery-filters";
import { matchesDiscoveryQuery } from "@/lib/discovery-search";
import {
  buildPopularDestinationCards,
  getDestinationImage,
  getValidHomeRating,
  POPULAR_DESTINATIONS,
} from "@/lib/public-destinations";

const AuthModal = dynamic(
  () => import("@/components/auth/AuthModal").then((module) => module.AuthModal),
  { ssr: false }
);

function subscribeToClientReady(): () => void {
  return () => {};
}

function getClientReadySnapshot(): boolean {
  return true;
}

function getServerReadySnapshot(): boolean {
  return false;
}

function RecentViewAvatar({ src, label }: { src?: string | null; label: string }) {
  const [failed, setFailed] = useState(false);
  const initial = (label.trim().slice(0, 1) || "F").toUpperCase();

  if (!src || failed) {
    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "grid",
          placeItems: "center",
          color: "#fff",
          fontSize: "15px",
          fontWeight: 800,
        }}
      >
        {initial}
      </div>
    );
  }

  return (
    <Image
      src={src}
      alt={`${label} host`}
      width={68}
      height={68}
      sizes="34px"
      unoptimized
      onError={() => setFailed(true)}
      style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
    />
  );
}
interface Props {
  homes: HomeCardRecord[];
  mostInteractedHomes?: HomeCardRecord[];
  companions: CompanionRecord[];
  ads: AdRecord[];
  stories: StoryRecord[];
  heroBanners?: { imageUrl: string; alt?: string }[];
  hostReels?: HomepageReelRecord[];
}

/* ─── palette ─────────────────────────────────────────────────── */
const PALETTES: [string, string][] = [
  ["#1A56DB", "#3B82F6"], ["#1e40af", "#60a5fa"], ["#0e7490", "#22d3ee"],
  ["#065f46", "#34d399"], ["#7c3aed", "#a78bfa"], ["#b45309", "#fbbf24"],
  ["#be185d", "#f472b6"], ["#155e75", "#38bdf8"],
];
function pal(id: string): [string, string] {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0xffff;
  return PALETTES[h % PALETTES.length]!;
}
function truncateHostName(name?: string | null): string | null {
  if (!name) return null;
  const clean = name.trim();
  if (!clean) return null;
  return clean.length > 5 ? `${clean.slice(0, 5)}...` : clean;
}
function minPrice(home: HomeCardRecord): number {
  if (home.startingRoomPrice && home.startingRoomPrice > 0) return home.startingRoomPrice;
  return [home.priceMorning, home.priceAfternoon, home.priceEvening, home.priceFullday]
    .filter(p => p > 0).sort((a, b) => a - b)[0] ?? 0;
}

function getHomePriceLabel(home: HomeCardRecord): string {
  const price = minPrice(home);
  return formatCompactPrice(price, price > 0 ? " / room" : "");
}
function haversine(la1: number, lo1: number, la2: number, lo2: number): number {
  const R = 6371, dL = ((la2 - la1) * Math.PI) / 180, dO = ((lo2 - lo1) * Math.PI) / 180;
  const a = Math.sin(dL / 2) ** 2 + Math.cos((la1 * Math.PI) / 180) * Math.cos((la2 * Math.PI) / 180) * Math.sin(dO / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

type EnrichedRecentView = RecentViewItem & {
  href: string;
  subtitle: string;
  hostName: string | null;
  priceLabel: string;
  roomLabel: string;
  hostPhotoUrl: string | null;
  roomImageUrl: string | null;
  accent: [string, string];
};

function formatCompactPrice(price: number | null, suffix: string): string {
  if (!price || price <= 0) return "Price set by host";
  return `₹${price.toLocaleString("en-IN")}${suffix}`;
}

function formatCompactCount(value: number | null, singular: string, fallbackLabel: string): string {
  if (!value || value <= 0) return fallbackLabel;
  return `${value} ${value === 1 ? singular : `${singular}s`}`;
}

function normalizeLocationPart(value?: string | null): string {
  return value?.trim().toLowerCase() ?? "";
}

function parseTimeToMinutes(value?: string | null): number | null {
  if (!value) return null;
  const [hours, minutes] = value.split(":").map((part) => Number(part));
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
}

function isNowInDailyWindow(nowMinutes: number, start?: string | null, end?: string | null): boolean {
  const startMinutes = parseTimeToMinutes(start);
  const endMinutes = parseTimeToMinutes(end);
  if (startMinutes == null && endMinutes == null) return true;
  if (startMinutes != null && endMinutes != null) {
    if (endMinutes >= startMinutes) {
      return nowMinutes >= startMinutes && nowMinutes <= endMinutes;
    }
    return nowMinutes >= startMinutes || nowMinutes <= endMinutes;
  }
  if (startMinutes != null) return nowMinutes >= startMinutes;
  return nowMinutes <= (endMinutes ?? 1440);
}

function getZonedParts(timeZone?: string | null) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timeZone || "Asia/Kolkata",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(new Date());
  const weekday = parts.find((part) => part.type === "weekday")?.value ?? "Sun";
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return {
    weekdayIndex: Math.max(0, weekdays.indexOf(weekday)),
    minutes: hour * 60 + minute,
  };
}

function scoreAdForViewer(
  ad: AdRecord,
  city?: string | null,
  state?: string | null,
  searchQuery?: string | null
): number {
  const viewerCity = normalizeLocationPart(city);
  const viewerState = normalizeLocationPart(state);
  const search = normalizeLocationPart(searchQuery);
  const adCity = normalizeLocationPart(ad.city);
  const adState = normalizeLocationPart(ad.state);
  const adLocality = normalizeLocationPart(ad.locality);
  let score = 0;
  if (!adCity && !adState && !adLocality) score += 1;
  if (viewerCity && adCity && viewerCity === adCity) score += 4;
  if (viewerState && adState && viewerState === adState) score += 2;
  if (
    search &&
    (
      search === adCity ||
      search === adState ||
      search === adLocality ||
      (adCity && search.includes(adCity)) ||
      (adState && search.includes(adState)) ||
      (adLocality && search.includes(adLocality))
    )
  ) {
    score += 5;
  }
  return score;
}

function isAdLive(ad: AdRecord): boolean {
  if (!ad.is_active) return false;
  const now = new Date();
  if (ad.starts_at && new Date(ad.starts_at) > now) return false;
  if (ad.ends_at && new Date(ad.ends_at) < now) return false;
  const zoned = getZonedParts(ad.timezone);
  if (ad.weekdays && ad.weekdays.length > 0 && !ad.weekdays.includes(zoned.weekdayIndex)) return false;
  return isNowInDailyWindow(zoned.minutes, ad.daily_start_time, ad.daily_end_time);
}

const FALLBACK_HERO_GRADIENT = "linear-gradient(135deg, #052e2b 0%, #14532d 38%, #0f172a 100%)";

function getLocalDateInputValue(date: Date): string {
  const timezoneOffsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - timezoneOffsetMs).toISOString().slice(0, 10);
}

function openNativeDatePicker(input: HTMLInputElement | null): void {
  if (!input) return;
  input.focus();
  try {
    (input as HTMLInputElement & { showPicker?: () => void }).showPicker?.();
  } catch {
    // Some browsers only allow showPicker during direct pointer activation.
  }
}

function homeIdentity(home: HomeCardRecord): string {
  return home.legacyFamilyId ?? home.hostId ?? home.id;
}

function dedupeHomes(homes: HomeCardRecord[]): HomeCardRecord[] {
  const seen = new Set<string>();
  return homes.filter((home) => {
    const key = homeIdentity(home);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function sortTopRatedHomes(homes: HomeCardRecord[]): HomeCardRecord[] {
  return homes
    .map((home, index) => ({ home, index }))
    .sort((left, right) => {
      const leftRating = getValidHomeRating(left.home);
      const rightRating = getValidHomeRating(right.home);
      if (leftRating != null || rightRating != null) {
        if (leftRating == null) return 1;
        if (rightRating == null) return -1;
        if (leftRating !== rightRating) return rightRating - leftRating;
      }
      const leftActiveScore = Number(left.home.isActive !== false && left.home.isAccepting !== false);
      const rightActiveScore = Number(right.home.isActive !== false && right.home.isAccepting !== false);
      if (leftActiveScore !== rightActiveScore) return rightActiveScore - leftActiveScore;
      return left.index - right.index;
    })
    .map(({ home }) => home);
}

function isPlaceholderText(value?: string | null): boolean {
  const normalized = value?.trim().toLowerCase() ?? "";
  return !normalized || normalized === "title" || normalized === "description";
}

function isRealAd(ad: AdRecord): boolean {
  return !isPlaceholderText(ad.title) && !isPlaceholderText(ad.description) && !isPlaceholderText(ad.cta_text);
}

function isRealStory(story: StoryRecord): boolean {
  return Boolean(story.storyText?.trim()) && !isPlaceholderText(story.storyText);
}

function isSafeHomepageImageUrl(value?: string | null): value is string {
  if (!value) return false;
  if (value.startsWith("/")) return true;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && (
      parsed.hostname.endsWith(".r2.dev") ||
      parsed.hostname.endsWith(".supabase.co") ||
      parsed.hostname.includes("supabase")
    );
  } catch {
    return false;
  }
}

/* ═══════════════════════════════════════════════════════════════
   HEADER
═══════════════════════════════════════════════════════════════ */
function SiteHeader({ onAuthOpen }: { onAuthOpen: (mode: "login" | "signup") => void }) {
  const { user, profile, signingOut, signOut } = useUser();
  const [scrolled, setScrolled] = useState(false);
  const [dropOpen, setDropOpen] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 10);
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);
  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setDropOpen(false);
    };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, []);

  const initial = profile?.name?.charAt(0)?.toUpperCase() || user?.email?.charAt(0)?.toUpperCase() || "?";

  return (
    <header style={{
      position: "fixed", top: 0, left: 0, right: 0, zIndex: 1000,
      height: "64px", display: "flex", alignItems: "center",
      background: "#fff",
      borderBottom: scrolled ? "1px solid #e5e7eb" : "1px solid #f0f4ff",
      boxShadow: scrolled ? "0 2px 16px rgba(26,86,219,0.08)" : "none",
      transition: "box-shadow 0.25s ease",
      padding: "0 clamp(16px, 4vw, 48px)",
      justifyContent: "space-between",
    }}>
      <Link href="/">
        <Image
          src="/logo-blue.png"
          alt="Famlo"
          width={1024}
          height={344}
          priority
          fetchPriority="high"
          loading="eager"
          sizes="128px"
          style={{ height: "32px", width: "auto", display: "block" }}
        />
      </Link>

      <div ref={dropRef} style={{ position: "relative" }}>
        {user ? (
          <>
            <button onClick={() => setDropOpen(v => !v)} style={{
              width: "40px", height: "40px", borderRadius: "50%",
              background: "linear-gradient(135deg,#1A56DB,#3B82F6)",
              border: "2px solid #dbeafe", color: "#fff",
              fontWeight: 700, fontSize: "15px", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 2px 8px rgba(26,86,219,0.3)", transition: "transform 0.15s",
              overflow: "hidden",
            }}
              onMouseEnter={e => (e.currentTarget.style.transform = "scale(1.07)")}
              onMouseLeave={e => (e.currentTarget.style.transform = "scale(1)")}
            >
              {profile?.avatar_url ? (
                <Image
                  src={profile.avatar_url}
                  alt={profile?.name || "Profile"}
                  width={80}
                  height={80}
                  sizes="40px"
                  style={{ width: "100%", height: "100%", objectFit: "contain", objectPosition: "center", borderRadius: "50%" }}
                />
              ) : initial}
            </button>
            {dropOpen && (
              <div className="profile-dropdown" style={{
                position: "absolute", top: "calc(100% + 10px)", right: 0,
                width: "170px",
                background: "#ffffff",
                borderRadius: "8px",
                boxShadow: "0 8px 24px rgba(30,64,175,0.1)",
                border: "1px solid #dbeafe",
                overflow: "hidden", animation: "dropIn 0.2s ease",
              }}>
                <div style={{ padding: "6px 10px", borderBottom: "1px solid #e0ecff", background: "#f8fbff" }}>
                  <div style={{ fontWeight: 800, fontSize: "11px", color: "#0f172a" }}>{profile?.name || "User"}</div>
                  <div style={{ fontSize: "9px", color: "#64748b", marginTop: "1px" }}>{user.email || user.phone}</div>
                </div>
                <div style={{ display: "grid", gap: 4, padding: "6px 8px 8px" }}>
                  {[{ label: "Profile", href: "/profile" }, { label: "My Bookings", href: "/bookings" }, { label: "Messages", href: "/messages" }].map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="profile-dropdown-item"
                      onClick={() => setDropOpen(false)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "flex-start",
                        width: "100%",
                        padding: "4px 8px",
                        fontSize: "11px",
                        fontWeight: 800,
                        color: "#1e3a8a",
                        textDecoration: "none",
                        borderRadius: "16px",
                        transition: "all 0.2s ease",
                        background: "#f8fbff",
                        border: "1px solid #dbeafe",
                        boxSizing: "border-box",
                        whiteSpace: "nowrap",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = "#eff6ff";
                        e.currentTarget.style.transform = "translateY(-1px)";
                        e.currentTarget.style.boxShadow = "0 4px 12px rgba(59, 130, 246, 0.08)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "#f8fbff";
                        e.currentTarget.style.transform = "translateY(0)";
                        e.currentTarget.style.boxShadow = "none";
                      }}
                    >
                      {item.label}
                    </Link>
                  ))}
                  <button
                    className="profile-dropdown-item logout-btn"
                    disabled={signingOut}
                    onClick={() => {
                      setDropOpen(false);
                      void signOut();
                    }}
                    style={{
                      width: "100%",
                      padding: "4px 8px",
                      background: "#fff5f5",
                      border: "1px solid #fecaca",
                      borderRadius: "6px",
                      textAlign: "left",
                      fontSize: "11px",
                      color: "#dc2626",
                      cursor: "pointer",
                      fontWeight: 800,
                      transition: "all 0.2s ease",
                      marginTop: "2px"
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "#fee2e2";
                      e.currentTarget.style.transform = "translateY(-1px)";
                      e.currentTarget.style.boxShadow = "0 4px 12px rgba(220, 38, 38, 0.08)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "#fff5f5";
                      e.currentTarget.style.transform = "translateY(0)";
                      e.currentTarget.style.boxShadow = "none";
                    }}
                  >{signingOut ? "Logging out..." : "Log out"}</button>
                </div>
              </div>
            )}
          </>
        ) : (
          <div style={{ display: "flex", alignItems: "center" }}>
            <button className="homepage-auth-login" type="button" onClick={() => onAuthOpen("login")}>Log in</button>
          </div>
        )}
      </div>
    </header>
  );
}

/* ═══════════════════════════════════════════════════════════════
   SECTION WRAPPER — full width content
═══════════════════════════════════════════════════════════════ */
function Section({ title, subtitle, seeAllHref, titleHref, dark = false, id, children }: {
  title: string; subtitle?: string; seeAllHref?: string; titleHref?: string; dark?: boolean; id?: string; children: React.ReactNode;
}) {
  return (
    <section id={id} className="homepage-section" style={{
      background: dark ? "#0d1b2a" : "#f7f9fc",
      contentVisibility: "auto",
      containIntrinsicSize: "1px 720px",
    }}>
      <div className="homepage-section-shell">
        <div className="homepage-section-head">
          <div className="homepage-section-title">
            <h2 style={{
              fontSize: "clamp(16px, 2.5vw, 22px)", fontWeight: 700,
              color: dark ? "#fff" : "#0f172a", margin: 0, letterSpacing: "0",
              fontFamily: "'DM Sans', 'Segoe UI', sans-serif",
            }}>{titleHref ? <Link href={titleHref} style={{ color: "inherit", textDecoration: "none" }}>{title}</Link> : title}</h2>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          {seeAllHref && (
            <Link href={seeAllHref} style={{
              fontSize: "13px", fontWeight: 600,
              color: dark ? "#93c5fd" : "#1A56DB", textDecoration: "none",
              padding: "5px 12px", borderRadius: "8px",
              background: dark ? "rgba(147,197,253,0.12)" : "#eff6ff",
              transition: "background 0.15s",
            }}>See all →</Link>
          )}
        </div>
        {children}
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════
   HOME CARD — bigger, full photo, hover scale
═══════════════════════════════════════════════════════════════ */
function HomeCard({ home, distance }: { home: HomeCardRecord; distance?: string }) {
  const [c1, c2] = pal(home.id);
  const price = minPrice(home);
  const rating = getValidHomeRating(home);
  const isOpen = home.isActive !== false && home.isAccepting !== false;
  const [hov, setHov] = useState(false);
  const bg: React.CSSProperties = home.imageUrls[0]
    ? { backgroundImage: `url(${home.imageUrls[0]})`, backgroundSize: "cover", backgroundPosition: "center" }
    : { background: `linear-gradient(145deg,${c1},${c2})` };

  return (
    <Link href={home.href}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        ...bg,
        flex: "0 0 clamp(236px, 28vw, 330px)",
        height: "clamp(268px, 34vw, 368px)",
        borderRadius: "20px",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        textDecoration: "none",
        flexShrink: 0,
        padding: "14px",
        position: "relative",
        transform: hov ? "scale(1.03) translateY(-4px)" : "scale(1) translateY(0)",
        boxShadow: hov
          ? "0 20px 40px rgba(0,0,0,0.25)"
          : "0 4px 16px rgba(0,0,0,0.14)",
        transition: "transform 0.25s ease, box-shadow 0.25s ease",
      }}
    >
      <div style={{
        position: "absolute", inset: 0,
        background: "linear-gradient(to top, rgba(0,0,0,0.88) 38%, rgba(0,0,0,0.06) 100%)",
        borderRadius: "20px", pointerEvents: "none",
      }} />
      <div style={{
        position: "relative", display: "flex", gap: "6px", flexWrap: "wrap"
      }}>
        {rating == null && <Badge bg="rgba(255,255,255,0.2)" color="#fff">NEW</Badge>}
        {isOpen && <Badge bg="rgba(52,211,153,0.28)" color="#6ee7b7">OPEN</Badge>}
        {home.superhost && <Badge bg="rgba(251,191,36,0.28)" color="#fcd34d">★ Super</Badge>}
      </div>
      <div style={{ position: "relative", display: "flex", flexDirection: "column", gap: "4px" }}>
        {distance && <span style={{ fontSize: "10px", color: "#93c5fd", fontWeight: 600 }}>📍 {distance}</span>}
        <p style={{ fontSize: "11px", color: "rgba(255,255,255,0.58)", margin: 0, fontWeight: 500 }}>
          {[home.city, home.state].filter(Boolean).join(", ")}
        </p>
        <p style={{
          fontSize: "clamp(13px, 1.5vw, 16px)", fontWeight: 700, color: "#fff", margin: 0, lineHeight: 1.3,
          display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
        }}>{home.listingTitle || home.name}</p>
        {price > 0 && (
          <p style={{ fontSize: "clamp(12px, 1.3vw, 14px)", fontWeight: 700, color: "#fff", margin: 0 }}>
            ₹{price.toLocaleString("en-IN")}
            <span style={{ fontSize: "11px", fontWeight: 400, color: "rgba(255,255,255,0.6)" }}> /session</span>
          </p>
        )}
        {rating != null && (
          <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            <span style={{ fontSize: "12px", color: "#fbbf24" }}>★</span>
            <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.75)", fontWeight: 600 }}>{rating.toFixed(1)}</span>
          </div>
        )}
      </div>
    </Link>
  );
}

function Badge({ bg, color, children }: { bg: string; color: string; children: React.ReactNode }) {
  return (
    <span style={{
      fontSize: "9px", fontWeight: 800, textTransform: "uppercase",
      padding: "3px 8px", borderRadius: "6px", letterSpacing: "0.05em",
      background: bg, color,
    }}>{children}</span>
  );
}

/* ═══════════════════════════════════════════════════════════════
   HOMMIE CARD — hover scale
═══════════════════════════════════════════════════════════════ */
function HommieCard({ companion, distance, onClick }: { companion: CompanionRecord; distance?: string; onClick: () => void }) {
  const [c1, c2] = pal(companion.id);
  const [hov, setHov] = useState(false);
  const avBg: React.CSSProperties = companion.imageUrl
    ? { backgroundImage: `url(${companion.imageUrl})`, backgroundSize: "cover", backgroundPosition: "center" }
    : { background: `linear-gradient(135deg,${c1},${c2})` };

  return (
    <div onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        flex: "0 0 clamp(190px, 22vw, 244px)",
        display: "flex", flexDirection: "column", alignItems: "center",
        textAlign: "center", gap: "10px",
        background: "#fff", borderRadius: "18px",
        padding: "24px 16px",
        boxShadow: hov ? "0 12px 28px rgba(26,86,219,0.15)" : "0 2px 12px rgba(0,0,0,0.08)",
        cursor: "pointer", border: hov ? "1px solid #bfdbfe" : "1px solid #e5e7eb",
        transform: hov ? "scale(1.04) translateY(-3px)" : "scale(1) translateY(0)",
        transition: "all 0.22s ease", flexShrink: 0,
        minHeight: "268px",
      }}
    >
      <div style={{
        width: "clamp(106px,12vw,132px)", height: "clamp(106px,12vw,132px)",
        borderRadius: "18px", overflow: "hidden",
        display: "flex", alignItems: "center", justifyContent: "center",
        border: "2px solid #dbeafe", ...avBg,
      }}>
        {!companion.imageUrl && (
          <span style={{ fontSize: "34px", fontWeight: 700, color: "#fff" }}>{companion.title.charAt(0)}</span>
        )}
      </div>
      <span style={{
        fontSize: "10px", fontWeight: 700, textTransform: "uppercase",
        letterSpacing: "0.06em", color: "#1A56DB", background: "#eff6ff",
        padding: "4px 10px", borderRadius: "999px",
      }}>Hommie</span>
      <p style={{
        fontSize: "15px", fontWeight: 700, color: "#111", margin: 0,
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        maxWidth: "170px",
      }}>{companion.title}</p>
      <p style={{
        fontSize: "12px", color: "#9ca3af", margin: 0,
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "170px",
      }}>{companion.city || "India"}</p>
      {companion.hourlyPrice != null && (
        <p style={{ fontSize: "13px", fontWeight: 700, color: "#059669", margin: 0 }}>₹{companion.hourlyPrice}/hr</p>
      )}
      {distance && <p style={{ fontSize: "11px", color: "#60a5fa", margin: 0, fontWeight: 600 }}>{distance}</p>}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   STORY CARD — no stars, hover scale
═══════════════════════════════════════════════════════════════ */
const STORY_BG = ["#0c1f3d", "#0c2d25", "#1a103a", "#2a1506", "#18092c", "#081e16"];

function StoryCard({ story, index }: { story: StoryRecord; index: number }) {
  const [hov, setHov] = useState(false);
  const [c1, c2] = pal(story.id);
  const storyAuthor = story.authorName || "Famlo Member";
  const coverImage = story.imageUrls?.[0] ?? "";
  return (
    <article
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        flex: "0 0 clamp(184px, 20vw, 236px)",
        borderRadius: "20px", padding: "24px 20px",
        display: "flex", flexDirection: "column", justifyContent: "space-between",
        minHeight: "214px", background: STORY_BG[index % STORY_BG.length],
        border: "1px solid rgba(255,255,255,0.07)", flexShrink: 0,
        transform: hov ? "scale(1.03) translateY(-4px)" : "scale(1) translateY(0)",
        boxShadow: hov ? "0 16px 36px rgba(0,0,0,0.35)" : "0 4px 16px rgba(0,0,0,0.25)",
        transition: "transform 0.22s ease, box-shadow 0.22s ease",
        cursor: "default",
      }}
    >
      <div>
        {coverImage ? (
          <div style={{ marginBottom: "14px", borderRadius: "16px", overflow: "hidden", border: "1px solid rgba(255,255,255,0.12)" }}>
            <Image
              src={coverImage}
              alt={storyAuthor}
              width={472}
              height={240}
              sizes="(max-width: 768px) 184px, 236px"
              style={{ width: "100%", height: "120px", objectFit: "cover", display: "block" }}
            />
          </div>
        ) : null}
        <span style={{ fontSize: "40px", color: "#3B82F6", lineHeight: 0.8, display: "block", marginBottom: "12px" }}>&ldquo;</span>
        <p style={{
          fontSize: "clamp(12px, 1.3vw, 14px)", color: "rgba(255,255,255,0.87)",
          lineHeight: 1.7, margin: 0, fontStyle: "italic",
          display: "-webkit-box", WebkitLineClamp: 7, WebkitBoxOrient: "vertical", overflow: "hidden",
        }}>{story.storyText || "A truly unforgettable experience that felt like home from the very first moment."}</p>
      </div>
      <div style={{
        borderTop: "1px solid rgba(255,255,255,0.1)",
        paddingTop: "14px",
        marginTop: "16px",
        display: "flex",
        alignItems: "center",
        gap: "12px"
      }}>
        <div style={{
          width: "38px",
          height: "38px",
          borderRadius: "50%",
          background: `linear-gradient(135deg, ${c1}, ${c2})`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#fff",
          fontSize: "13px",
          fontWeight: 800,
          boxShadow: "0 8px 20px rgba(15,23,42,0.28)",
          flexShrink: 0
        }}>
          {storyAuthor.charAt(0).toUpperCase()}
        </div>
        <div>
          <p style={{ fontSize: "14px", fontWeight: 700, color: "#fff", margin: 0 }}>{storyAuthor}</p>
          <p style={{ fontSize: "11px", color: "rgba(255,255,255,0.58)", marginTop: "3px" }}>{story.fromCity || "India"}</p>
        </div>
      </div>
    </article>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MAIN
═══════════════════════════════════════════════════════════════ */
export default function DiscoveryHomepage({ homes, companions, ads, stories, heroBanners, hostReels = [] }: Props) {
  const router = useRouter();
  const { user, profile } = useUser();
  const [showAuth, setShowAuth] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [pending, setPending] = useState<(() => void) | null>(null);
  const [query, setQuery] = useState("");
  const [selectedDestination, setSelectedDestination] = useState<DestinationSuggestion | null>(null);
  const [checkInDate, setCheckInDate] = useState("");
  const [checkOutDate, setCheckOutDate] = useState("");
  const [guestCount, setGuestCount] = useState("2");
  const [selectedStayFilter, setSelectedStayFilter] = useState<DiscoveryStayFilter>("All");
  const [selectedReel, setSelectedReel] = useState<HomepageReelRecord | null>(null);
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [searchCoords, setSearchCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [searchingLocation, setSearchingLocation] = useState(false);
  const [locatingUser, setLocatingUser] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [bannerIdx, setBannerIdx] = useState(0);
  const [showDeferredSections, setShowDeferredSections] = useState(false);
  const checkInInputRef = useRef<HTMLInputElement>(null);
  const checkOutInputRef = useRef<HTMLInputElement>(null);
  const todayInputValue = useMemo(() => getLocalDateInputValue(new Date()), []);
  const safeHeroBanners = useMemo(() => {
    return (heroBanners ?? []).filter((banner) => isSafeHomepageImageUrl(banner.imageUrl));
  }, [heroBanners]);
  const banners = safeHeroBanners;
  const safeBannerIdx = banners.length > 0 ? bannerIdx % banners.length : 0;
  const userId = user?.id;
  const mounted = useSyncExternalStore(
    subscribeToClientReady,
    getClientReadySnapshot,
    getServerReadySnapshot
  );
  const recentViews = useMemo(() => {
    if (!mounted) return [];
    try {
      return readRecentViews(userId)
        .filter((rv: RecentViewItem) => rv.id && rv.title && rv.title !== "Famlo stay")
        .slice(0, 10);
    } catch {
      return [];
    }
  }, [mounted, userId]);

  useEffect(() => {
    let cancelled = false;
    const revealDeferredSections = () => {
      if (!cancelled) setShowDeferredSections(true);
    };
    const scheduleDeferredReveal = () => {
      if (typeof window !== "undefined" && "requestIdleCallback" in window) {
        const idleHandle = window.requestIdleCallback(revealDeferredSections, { timeout: 1400 });
        return () => window.cancelIdleCallback(idleHandle);
      }

      const timeoutHandle = globalThis.setTimeout(revealDeferredSections, 900);
      return () => {
        globalThis.clearTimeout(timeoutHandle);
      };
    };

    const cleanup = scheduleDeferredReveal();

    return () => {
      cancelled = true;
      cleanup();
    };
  }, []);

  const requestCurrentLocation = useCallback(() => {
    if (typeof window === "undefined") return;
    if (!("geolocation" in navigator)) {
      setLocationError("Location is not supported in this browser.");
      return;
    }

    setLocatingUser(true);
    setLocationError(null);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocatingUser(false);
      },
      (error) => {
        const message =
          error.code === error.PERMISSION_DENIED
            ? "Location permission was denied."
            : error.code === error.POSITION_UNAVAILABLE
              ? "Your location is unavailable right now."
              : error.code === error.TIMEOUT
                ? "Location request timed out."
                : "Could not get your current location.";
        setLocationError(message);
        setLocatingUser(false);
      },
      {
        enableHighAccuracy: false,
        timeout: 10000,
        maximumAge: 300000,
      }
    );
  }, []);

  useEffect(() => {
    if (!selectedReel) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelectedReel(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedReel]);

  useEffect(() => {
    if (banners.length <= 1) return;
    const interval = window.setInterval(() => {
      setBannerIdx((current) => (current + 1) % banners.length);
    }, 3000);
    return () => window.clearInterval(interval);
  }, [banners.length]);

  const distLabel = useCallback((lat?: number | null, lng?: number | null) => {
    if (!userCoords || lat == null || lng == null) return undefined;
    const km = haversine(userCoords.lat, userCoords.lng, lat, lng);
    return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
  }, [userCoords]);

  const sortedHomes = useMemo(() => [...homes].sort((a, b) => {
    if (userCoords && a.lat && a.lng && b.lat && b.lng)
      return haversine(userCoords.lat, userCoords.lng, a.lat, a.lng) - haversine(userCoords.lat, userCoords.lng, b.lat, b.lng);
    const leftRating = getValidHomeRating(a);
    const rightRating = getValidHomeRating(b);
    if (leftRating != null || rightRating != null) {
      if (leftRating == null) return 1;
      if (rightRating == null) return -1;
      return rightRating - leftRating;
    }
    return 0;
  }), [homes, userCoords]);

  const activeHomes = useMemo(() => homes.filter((home) => home.isActive !== false && home.isAccepting !== false), [homes]);

  const homepageStats = useMemo(() => {
    const destinations = new Set<string>();
    for (const home of activeHomes) {
      [home.city, home.state, home.village]
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value))
        .forEach((value) => destinations.add(value.toLowerCase()));
    }

    const ratings = activeHomes
      .map(getValidHomeRating)
      .filter((rating): rating is number => rating != null);
    const averageRating = ratings.length > 0
      ? ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length
      : null;

    return {
      totalProperties: activeHomes.length,
      destinations: destinations.size,
      averageRating,
    };
  }, [activeHomes]);

  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) return sortedHomes;

    // Exact text matches (Village, City, State, Name)
    const exactMatches = sortedHomes.filter((home) => matchesDiscoveryQuery(home, q));

    if (exactMatches.length > 0) return exactMatches;

    // Radius Fallback: 50km radius search
    if (searchCoords) {
      return sortedHomes.filter(h => {
        if (!h.lat || !h.lng) return false;
        const dist = haversine(searchCoords.lat, searchCoords.lng, h.lat, h.lng);
        return dist <= 50; // 50km threshold
      });
    }

    return [];
  }, [sortedHomes, query, searchCoords]);

  const sortedCompanions = useMemo(() => companions
    .filter((companion) => companion.isActive !== false && !isPlaceholderText(companion.title))
    .sort((a, b) => {
    if (userCoords && a.lat && a.lng && b.lat && b.lng)
      return haversine(userCoords.lat, userCoords.lng, a.lat, a.lng) - haversine(userCoords.lat, userCoords.lng, b.lat, b.lng);
    return b.rating - a.rating;
  }), [companions, userCoords]);

  const visibleAds = useMemo(() => {
    return [...ads]
      .filter(isAdLive)
      .filter(isRealAd)
      .sort((left, right) => {
        const scoreDiff =
          scoreAdForViewer(right, profile?.city, profile?.state, query) -
          scoreAdForViewer(left, profile?.city, profile?.state, query);
        if (scoreDiff !== 0) return scoreDiff;
        return left.priority - right.priority;
      });
  }, [ads, profile?.city, profile?.state, query]);

  const visibleStories = useMemo(() => stories.filter(isRealStory).slice(0, 10), [stories]);

  const topRatedHomes = useMemo(() => {
    const source = dedupeHomes(filtered);
    return sortTopRatedHomes(source).filter((home) => matchesDiscoveryStayFilter(home, selectedStayFilter)).slice(0, 10);
  }, [filtered, selectedStayFilter]);

  const destinationCards = useMemo(() => {
    return buildPopularDestinationCards(homes);
  }, [homes]);

  const visibleHostReels = useMemo(() => {
    return hostReels
      .filter((reel) => typeof reel.videoUrl === "string" && reel.videoUrl.trim().length > 0)
      .slice(0, 8);
  }, [hostReels]);

  const enrichedRecentViews = useMemo<EnrichedRecentView[]>(() => {
    const findMatchedHome = (id: string) => homes.find((home) => home.id === id || home.legacyFamilyId === id || home.hostId === id);

    return recentViews.map((rv) => {
      if (rv.type === "home") {
        const matchedHome = findMatchedHome(rv.id);
        if (matchedHome) {
          const roomImage = matchedHome.roomImageUrls?.[0] || rv.roomImageUrl || rv.image || matchedHome.imageUrls?.[0] || "";
          const hostName = matchedHome.hostName || rv.hostName || matchedHome.listingTitle || matchedHome.name || rv.title;
          const listingTitle = matchedHome.listingTitle || matchedHome.name || rv.title;
          return {
            ...rv,
            title: listingTitle,
            image: roomImage,
            subtitle: [matchedHome.village, matchedHome.city].filter(Boolean).join(", ") || [matchedHome.city, matchedHome.state].filter(Boolean).join(", ") || "",
            hostName,
            href: matchedHome.href || buildHomestayPath(
              matchedHome.name || rv.title,
              matchedHome.village,
              matchedHome.city,
              matchedHome.legacyFamilyId || matchedHome.id
            ),
            priceLabel: getHomePriceLabel(matchedHome),
            roomLabel: matchedHome.roomCount != null && matchedHome.roomCount > 0 ? `${matchedHome.roomCount} room${matchedHome.roomCount === 1 ? "" : "s"}` : "",
            hostPhotoUrl: matchedHome.hostPhotoUrl || rv.hostPhotoUrl || null,
            roomImageUrl: roomImage || null,
            accent: pal(matchedHome.id)
          };
        }
      }

      if (rv.type === "companion") {
        const matchedCompanion = companions.find((companion) => companion.id === rv.id);
        if (matchedCompanion) {
          const price = matchedCompanion.hourlyPrice ?? matchedCompanion.nightlyPrice;
          return {
            ...rv,
            title: matchedCompanion.title || rv.title,
            image: matchedCompanion.imageUrl || rv.roomImageUrl || rv.image,
            subtitle: matchedCompanion.city || "",
            hostName: matchedCompanion.hostName || matchedCompanion.title || rv.hostName || null,
            href: matchedCompanion.href || `/hommies/${rv.id}`,
            priceLabel: formatCompactPrice(price, matchedCompanion.hourlyPrice ? " / hr" : matchedCompanion.nightlyPrice ? " / night" : ""),
            roomLabel: matchedCompanion.maxGuests != null && matchedCompanion.maxGuests > 0 ? `${matchedCompanion.maxGuests} guest${matchedCompanion.maxGuests === 1 ? "" : "s"}` : "",
            hostPhotoUrl: matchedCompanion.imageUrl,
            roomImageUrl: matchedCompanion.imageUrl || rv.roomImageUrl || rv.image,
            accent: pal(matchedCompanion.id)
          };
        }
      }

      return {
        ...rv,
        subtitle: rv.subtitle || "",
        hostName: rv.hostName || truncateHostName(rv.title),
        priceLabel: rv.priceLabel || "Price set by host",
        roomLabel: rv.roomLabel || "",
        hostPhotoUrl: rv.hostPhotoUrl || null,
        roomImageUrl: rv.roomImageUrl || rv.image || null,
        accent: pal(rv.id),
        href:
          rv.type === "home"
            ? "/homestays"
            : `/hommies/${rv.id}`
      };
    });
  }, [companions, homes, recentViews]);

  const guard = (fn: () => void) => {
    if (!user) {
      setPending(() => fn);
      setAuthMode("login");
      setShowAuth(true);
    } else fn();
  };

  const submitSearch = useCallback(() => {
    router.push(
      buildDiscoverySearchHref({
        query,
        selectedDestination,
        checkInDate,
        checkOutDate,
        guestCount,
        userCoords,
      })
    );
  }, [checkInDate, checkOutDate, guestCount, query, router, selectedDestination, userCoords]);

  return (
    <div style={{ background: "#f7f9fc", minHeight: "100vh", display: "flex", flexDirection: "column", fontFamily: "'DM Sans','Segoe UI',sans-serif" }}>
      {/* ══ HERO ══ */}
      <section className="homepage-hero" style={{ background: banners[safeBannerIdx] ? "#0f172a" : FALLBACK_HERO_GRADIENT }}>
        {banners[safeBannerIdx] ? (
          <Image
            key={`${safeBannerIdx}-${banners[safeBannerIdx]?.imageUrl ?? "banner"}`}
            src={banners[safeBannerIdx]!.imageUrl}
            alt={banners[safeBannerIdx]!.alt ?? "Famlo homestay"}
            fill
            priority={safeBannerIdx === 0}
            loading={safeBannerIdx === 0 ? "eager" : "lazy"}
            fetchPriority={safeBannerIdx === 0 ? "high" : "auto"}
            sizes="100vw"
            unoptimized
            style={{ objectFit: "cover", objectPosition: "center" }}
          />
        ) : null}
        <div className="homepage-hero-overlay" />
        <div className="homepage-hero-inner">
          <div className="homepage-hero-copy">
            <h1>Find homes that feel like home</h1>
            <p>Book real homestays, warm hosts, and local stays across India.</p>
          </div>

          <form
            className="homepage-search-box"
            onSubmit={(event) => {
              event.preventDefault();
              submitSearch();
            }}
          >
            <DestinationAutocomplete
              homes={activeHomes}
              value={query}
              onValueChange={(value) => {
                setQuery(value);
                setSelectedDestination(null);
              }}
              onSuggestionSelect={(suggestion) => {
                setQuery(suggestion.name);
                setSelectedDestination(suggestion);
              }}
            />
            <label
              className="homepage-search-field homepage-date-field"
              onClick={() => openNativeDatePicker(checkInInputRef.current)}
            >
              <span>Check-in</span>
              <input
                ref={checkInInputRef}
                min={todayInputValue}
                name="date"
                value={checkInDate}
                onChange={(e) => {
                  const nextDate = e.target.value;
                  setCheckInDate(nextDate);
                  setCheckOutDate((current) => (nextDate && current && current < nextDate ? "" : current));
                }}
                onFocus={() => openNativeDatePicker(checkInInputRef.current)}
                type="date"
              />
            </label>
            <label
              className="homepage-search-field homepage-date-field"
              onClick={() => openNativeDatePicker(checkOutInputRef.current)}
            >
              <span>Check-out</span>
              <input
                ref={checkOutInputRef}
                min={checkInDate || todayInputValue}
                name="date_to"
                value={checkOutDate}
                onChange={(e) => {
                  const nextDate = e.target.value;
                  setCheckOutDate(checkInDate && nextDate && nextDate < checkInDate ? "" : nextDate);
                }}
                onFocus={() => openNativeDatePicker(checkOutInputRef.current)}
                type="date"
              />
            </label>
            <label className="homepage-search-field">
              <span>Guests</span>
              <input
                min={1}
                name="guests"
                value={guestCount}
                onChange={e => setGuestCount(e.target.value)}
                inputMode="numeric"
                type="number"
              />
            </label>
            <button className="homepage-search-button" type="submit">Search</button>
            <button
              className="homepage-location-button"
              type="button"
              onClick={requestCurrentLocation}
              disabled={locatingUser}
            >
              {locatingUser ? "Locating..." : userCoords ? "Location on" : "Use my location"}
            </button>
          </form>

          {(locationError || userCoords) && (
            <div className={locationError ? "homepage-location-note is-error" : "homepage-location-note"}>
              {locationError
                ? locationError
                : "Location will be included when you search."}
            </div>
          )}
        </div>
      </section>

      <section className="homepage-stats" aria-label="Famlo stats">
        <div>
          <strong>{homepageStats.totalProperties}</strong>
          <span>Total properties</span>
        </div>
        <div>
          <strong>{homepageStats.destinations}</strong>
          <span>Destinations</span>
        </div>
        <div>
          <strong>Growing</strong>
          <span>Guest community</span>
        </div>
        <div>
          <strong>{homepageStats.averageRating ? homepageStats.averageRating.toFixed(1) : "New stays"}</strong>
          <span>{homepageStats.averageRating ? "Average rating" : "Guest rating"}</span>
        </div>
      </section>

      {/* ══ RECENT VIEW — only shown if user has actual recent views ══ */}
      {showDeferredSections && enrichedRecentViews.length > 0 && (
        <Section title="Recent View">
          <div style={{ display: "flex", gap: "14px", overflowX: "auto", paddingBottom: "12px" }} className="hide-scroll">
            {enrichedRecentViews.map((rv) => (
              <Link
                key={rv.id}
                href={rv.href}
                style={{
                  flex: "0 0 clamp(290px, 34vw, 360px)",
                  width: "clamp(290px, 34vw, 360px)",
                  minHeight: "126px",
                  borderRadius: "16px",
                  overflow: "hidden",
                  textDecoration: "none",
                  boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.1), 0 10px 20px -5px rgba(0, 0, 0, 0.05)",
                  border: "1px solid rgba(255,255,255,1)",
                  background: "#ffffff",
                  flexShrink: 0,
                  transition: "transform 0.18s ease, box-shadow 0.18s ease",
                  position: "relative",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "translateY(-4px)";
                  e.currentTarget.style.boxShadow = "0 30px 60px -12px rgba(0, 0, 0, 0.15), 0 15px 25px -5px rgba(0, 0, 0, 0.08)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.boxShadow = "0 25px 50px -12px rgba(0, 0, 0, 0.1), 0 10px 20px -5px rgba(0, 0, 0, 0.05)";
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    background: "linear-gradient(180deg, rgba(15,23,42,0.04) 0%, rgba(15,23,42,0.08) 100%)",
                  }}
                />
                <div
                  style={{
                    position: "relative",
                    zIndex: 1,
                    height: "100%",
                    display: "flex",
                    gap: "10px",
                    alignItems: "stretch",
                    padding: "8px",
                  }}
                >
                  <div
                    style={{
                      width: "96px",
                      minWidth: "96px",
                      borderRadius: "12px",
                      overflow: "hidden",
                      background: rv.roomImageUrl || rv.image ? `url(${rv.roomImageUrl || rv.image}) center 34% / cover no-repeat` : `linear-gradient(135deg, ${rv.accent[0]}, ${rv.accent[1]})`,
                      boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.28)",
                      position: "relative",
                    }}
                  >
                    <div
                      style={{
                        position: "absolute",
                        inset: 0,
                        background: "linear-gradient(180deg, rgba(15,23,42,0.02) 0%, rgba(15,23,42,0.18) 100%)",
                      }}
                    />
                    <div
                      style={{
                        width: "34px",
                        height: "34px",
                        borderRadius: "11px",
                        overflow: "hidden",
                        border: "2px solid rgba(255,255,255,0.94)",
                        boxShadow: "0 6px 14px rgba(0,0,0,0.18)",
                        background: rv.hostPhotoUrl ? "#fff" : `linear-gradient(135deg, ${rv.accent[0]}, ${rv.accent[1]})`,
                        flexShrink: 0,
                        position: "absolute",
                        top: "8px",
                        left: "8px",
                      }}
                    >
                      <RecentViewAvatar src={rv.hostPhotoUrl} label={rv.hostName || rv.title || "Famlo"} />
                    </div>
                  </div>

                  <div
                    style={{
                      flex: 1,
                      minWidth: 0,
                      borderRadius: "14px",
                      background: "rgba(255,255,255,0.98)",
                      backdropFilter: "blur(10px)",
                      boxShadow: "0 8px 24px rgba(15,23,42,0.08)",
                      padding: "10px 10px 10px 12px",
                      display: "grid",
                      gap: "8px",
                      alignContent: "center",
                    }}
                  >
                    <div style={{ display: "grid", gap: "3px" }}>
                      <div
                        style={{
                          fontSize: "13px",
                          fontWeight: 900,
                          color: "#0f172a",
                          lineHeight: 1.25,
                          letterSpacing: "0",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {rv.hostName || rv.title || "Famlo recent view"}
                      </div>
                      <div
                        style={{
                          fontSize: "11px",
                          fontWeight: 700,
                          color: "#475569",
                          lineHeight: 1.25,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {rv.title || rv.subtitle || "Recently viewed"}
                      </div>
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "6px",
                          padding: "4px 7px",
                          borderRadius: "999px",
                          background: "rgba(26,86,219,0.1)",
                          color: "#1A56DB",
                          fontSize: "9px",
                          fontWeight: 800,
                          lineHeight: 1,
                        }}
                      >
                        {rv.priceLabel}
                      </span>
                      {rv.roomLabel ? (
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "6px",
                            padding: "4px 7px",
                            borderRadius: "999px",
                            background: "rgba(15,23,42,0.06)",
                            color: "#334155",
                            fontSize: "9px",
                            fontWeight: 800,
                            lineHeight: 1,
                          }}
                        >
                          {rv.roomLabel}
                        </span>
                      ) : null}
                    </div>

                  </div>
                </div>
              </Link>
            ))}
          </div>
        </Section>
      )}

      {/* ══ TOP RATED HOMES ══ */}
      <Section title="Top-rated stays near you" seeAllHref="/homestays">
        <div className="stay-filter-row" aria-label="Stay filters">
          {DISCOVERY_STAY_FILTERS.map((filter) => {
            const isSelected = selectedStayFilter === filter;
            return (
              <button
                key={filter}
                type="button"
                className={isSelected ? "stay-filter is-selected" : "stay-filter"}
                onClick={() => setSelectedStayFilter(filter)}
              >
                {filter}
              </button>
            );
          })}
        </div>

        {topRatedHomes.length === 0 ? (
          <div className="homepage-empty-state">
            <h3>No stays match this filter yet.</h3>
            <p>Try another filter or browse all Famlo stays.</p>
            <Link href="/homestays">Browse all stays</Link>
          </div>
        ) : (
          <div className="top-rated-grid">
            {topRatedHomes.map((home) => (
              <HomePageCard key={`top-rated-${home.id}`} home={home} distance={distLabel(home.lat, home.lng)} />
            ))}
          </div>
        )}
      </Section>

      {/* ══ POPULAR DESTINATIONS ══ */}
      {showDeferredSections && (
        <Section title="Popular destinations" seeAllHref="/popular-destinations" id="popular-destinations">
          <div className="popular-destinations-rail">
            {destinationCards.map((destination) => (
              <Link
                key={destination.slug}
                href={`/${destination.slug}`}
                className="popular-destination-card"
                style={{
                  background: destination.imageUrl
                    ? `linear-gradient(180deg, rgba(15,23,42,0.08), rgba(15,23,42,0.76)), url(${destination.imageUrl}) center 42% / cover`
                    : `linear-gradient(135deg, ${destination.gradient[0]}, ${destination.gradient[1]})`,
                }}
              >
                <span>{destination.name}</span>
                <strong>
                  {destination.count} stay{destination.count === 1 ? "" : "s"}
                </strong>
              </Link>
            ))}
          </div>
        </Section>
      )}

      {showDeferredSections && visibleHostReels.length > 0 ? (
        <Section title="Most viewed host reels" titleHref="/homestay-reel" seeAllHref="/homestay-reel" subtitle="Watch real glimpses from Famlo homes and hosts.">
          <div className="host-reels-rail">
            {visibleHostReels.map((reel, index) => (
              <button
                key={reel.id}
                type="button"
                className="host-reel-card"
                onClick={() => setSelectedReel(reel)}
              >
                <div
                  className="host-reel-thumb"
                  style={{
                    background: reel.thumbnailUrl
                      ? `linear-gradient(180deg, rgba(15,23,42,0.08), rgba(15,23,42,0.68)), url(${reel.thumbnailUrl}) center / cover`
                      : "linear-gradient(135deg, #1688f0, #16a34a)",
                  }}
                >
                  {index === 0 ? <span className="host-reel-rank">Most viewed</span> : null}
                  <span className="host-reel-play" aria-hidden="true">▶</span>
                </div>
                <span>{reel.title}</span>
                <small>{[reel.location, `${reel.viewCount.toLocaleString("en-IN")} views`].filter(Boolean).join(" · ")}</small>
              </button>
            ))}
          </div>
        </Section>
      ) : null}

      {/* ══ HOMMIES ══ */}
      {showDeferredSections && sortedCompanions.length > 0 && (
        <Section title="Hommies near you" seeAllHref="/joinfamlo">
          <div style={{ display: "flex", gap: "14px", overflowX: "auto", paddingBottom: "8px" }} className="hide-scroll">
            {sortedCompanions.slice(0, 14).map(c => (
              <HommieCard key={c.id} companion={c} distance={distLabel(c.lat, c.lng)}
                onClick={() => guard(() => { window.location.href = c.href; })} />
            ))}
          </div>
        </Section>
      )}

      {/* ══ AD / DISCOVER MORE ══ */}
      {showDeferredSections && visibleAds.length > 0 && (
        <Section title="Discover More">
          <div className="discover-more-rail">
            {visibleAds.map(ad => {
              const safe = ad.cta_url.startsWith("http") || ad.cta_url.startsWith("/") ? ad.cta_url : "#";
              return (
                <article key={ad.id} className="discover-more-card">
                  <div className="discover-more-media">
                    {ad.image_url
                      ? (
                        <Image
                          src={ad.image_url}
                          alt={ad.title}
                          width={1200}
                          height={720}
                          sizes="(max-width: 768px) 100vw, 50vw"
                          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                        />
                      )
                      : <div style={{ width: "100%", height: "100%", minHeight: "100%", background: "linear-gradient(135deg,#1A56DB,#3B82F6)" }} />}
                  </div>
                  <div className="discover-more-copy">
                    <span style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0", color: "#1A56DB" }}>{ad.label}</span>
                    <h3 style={{ fontSize: "clamp(18px,2.5vw,26px)", fontWeight: 700, color: "#0f172a", lineHeight: 1.22, margin: 0 }}>{ad.title}</h3>
                    {ad.description && <p style={{ fontSize: "clamp(13px,1.4vw,15px)", color: "#6b7280", lineHeight: 1.65, margin: 0 }}>{ad.description}</p>}
                    <a href={safe} target="_blank" rel="noopener noreferrer" style={{
                      alignSelf: "flex-start", marginTop: "4px",
                      background: "linear-gradient(135deg,#1A56DB,#3B82F6)", color: "#fff",
                      padding: "12px 26px", borderRadius: "8px",
                      fontSize: "14px", fontWeight: 600, textDecoration: "none",
                      boxShadow: "0 4px 14px rgba(26,86,219,0.32)", transition: "transform 0.15s",
                    }}
                      onMouseEnter={e => ((e.target as HTMLElement).style.transform = "scale(1.04)")}
                      onMouseLeave={e => ((e.target as HTMLElement).style.transform = "scale(1)")}
                    >{ad.cta_text}</a>
                  </div>
                </article>
              );
            })}
          </div>
        </Section>
      )}

      {/* ══ STORIES — no stars, dark bg ══ */}
      {showDeferredSections && visibleStories.length > 0 ? (
        <Section title="Moments that stayed" dark>
          <div style={{ display: "flex", gap: "16px", overflowX: "auto", paddingBottom: "10px" }} className="hide-scroll">
            {visibleStories.map((s, i) => (
              <StoryCard key={s.id} story={s} index={i} />
            ))}
          </div>
        </Section>
      ) : null}

      {/* ══ TRUST + CTA + FOOTER ══ */}
      <section className="famlo-dark-trust">
        <div className="famlo-dark-shell">
          <div className="famlo-trust-head">
            <h2>Why book with Famlo?</h2>
            <p>Verified homes, clear pricing, and support when you need it.</p>
          </div>
          <div className="famlo-trust-grid">
            {[
              ["Instant confirmation", "No waiting for approval"],
              ["Verified homes", "Every listing is checked"],
              ["No hidden fees", "What you see is what you pay"],
              ["24/7 support", "We’re always here to help"],
            ].map(([title, copy]) => (
              <article key={title} className="famlo-trust-card">
                <span className="famlo-trust-icon" aria-hidden="true" />
                <div>
                  <strong>{title}</strong>
                  <p>{copy}</p>
                </div>
              </article>
            ))}
          </div>

          <div className="famlo-bottom-cta">
            <div>
              <h2>Ready to find your perfect stay?</h2>
              <p>Find real homes, warm hosts, and stays that feel personal.</p>
            </div>
            <div className="famlo-cta-actions">
              <Link href="/homestays">Browse all stays</Link>
              <Link href="/joinfamlo/homes">List your property</Link>
            </div>
          </div>
        </div>
      </section>

      <footer className="famlo-footer">
        <div className="famlo-footer-shell">
          <div className="famlo-footer-brand">
            <Link href="/" className="famlo-footer-logo" aria-label="Famlo home">
              <Image
                src="/logo-blue.png"
                alt="Famlo"
                width={1024}
                height={344}
                sizes="112px"
                style={{ width: "112px", height: "auto", display: "block" }}
              />
            </Link>
            <p>India&apos;s platform for living like local wooo hooo</p>
          </div>
          <nav className="famlo-footer-column" aria-label="Explore">
            <h3>Explore</h3>
            <Link href="/homestays">Homestays</Link>
            <Link href="#popular-destinations">Popular destinations</Link>
            <Link href="/homestays">Family stays</Link>
            <Link href="/homestays">Experiences</Link>
          </nav>
          <nav className="famlo-footer-column" aria-label="Support">
            <h3>Support</h3>
            <Link href="/help">Help centre</Link>
            <Link href="/help">Cancellations</Link>
            <Link href="/help">Safety</Link>
            <Link href="/contact">Contact us</Link>
          </nav>
          <nav className="famlo-footer-column" aria-label="Hosting">
            <h3>Hosting</h3>
            <Link href="/joinfamlo/homes">List your property</Link>
            <Link href="/partners">Host resources</Link>
            <Link href="/partners/login">Partner login</Link>
            <Link href="/partnerslogin/home/pro/dashboard">Famlo Pro</Link>
          </nav>
        </div>
        <div className="famlo-footer-bottom">
          <span>© 2026 Famlo Traveltech Private Limited</span>
          <div>
            <Link href="/legal/privacy">Privacy</Link>
            <Link href="/legal">Terms</Link>
            <Link href="/contact">Contact</Link>
          </div>
        </div>
      </footer>

      {selectedReel ? (
        <div className="host-reel-modal" role="dialog" aria-modal="true" aria-label={selectedReel.title}>
          <button className="host-reel-modal-backdrop" type="button" aria-label="Close reel" onClick={() => setSelectedReel(null)} />
          <div className="host-reel-modal-panel">
            <button className="host-reel-close" type="button" onClick={() => setSelectedReel(null)}>Close</button>
            <video
              key={selectedReel.videoUrl}
              src={selectedReel.videoUrl}
              poster={selectedReel.thumbnailUrl ?? undefined}
              controls
              autoPlay
              playsInline
              preload="metadata"
              onPlay={() => void recordPublicReelView(selectedReel)}
            />
            <div>
              <strong>{selectedReel.title}</strong>
              {selectedReel.propertyName ? <span>{selectedReel.propertyName}</span> : null}
            </div>
          </div>
        </div>
      ) : null}

      {showAuth && (
        <AuthModal key={`discovery-auth-${authMode}`} isOpen={showAuth} initialMode={authMode} onClose={() => {
          setShowAuth(false);
          if (user && pending) { pending(); setPending(null); }
        }} />
      )}

      <style jsx global>{`
        @keyframes dropIn { from { opacity:0; transform:translateY(-8px); } to { opacity:1; transform:translateY(0); } }
        @keyframes fadeUp { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }
        .hide-scroll { scrollbar-width:none; -webkit-overflow-scrolling:touch; }
        .hide-scroll::-webkit-scrollbar { display:none; }
        *, *::before, *::after { box-sizing:border-box; }
        body { margin:0; }
        .homepage-auth-login {
          height: 46px;
          padding: 0 28px;
          border: none;
          border-radius: 999px;
          background: var(--accent-primary);
          color: #fff;
          font: inherit;
          font-weight: 600;
          line-height: 1;
          cursor: pointer;
          box-shadow: 0 6px 18px rgba(24,144,255,0.18);
          transition: background 160ms ease, box-shadow 160ms ease, transform 160ms ease;
        }
        .homepage-auth-login:hover {
          background: var(--accent-hover);
          box-shadow: 0 8px 22px rgba(24,144,255,0.24);
          transform: translateY(-1px);
        }
        .homepage-auth-login:active {
          transform: translateY(0) scale(0.98);
        }
        .homepage-auth-login:focus-visible {
          outline: 3px solid color-mix(in srgb, var(--accent-primary) 28%, transparent);
          outline-offset: 3px;
        }
        .homepage-section {
          padding: 44px 0 24px;
        }
        .homepage-section-shell,
        .famlo-dark-shell,
        .famlo-footer-shell,
        .famlo-footer-bottom {
          width: min(94vw, 1560px);
          max-width: none;
          margin-left: auto;
          margin-right: auto;
          padding-left: 24px;
          padding-right: 24px;
        }
        .homepage-section-head {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 18px;
          margin-bottom: 20px;
        }
        .homepage-section-title {
          display: grid;
          gap: 5px;
        }
        .homepage-section-title p {
          margin: 0;
          color: #64748b;
          font-size: 14px;
          line-height: 1.45;
          font-weight: 700;
        }
        .homepage-hero {
          position: relative;
          min-height: clamp(420px, 58vh, 560px);
          overflow: hidden;
          display: grid;
          align-items: center;
          padding: 86px clamp(16px, 5vw, 72px) 74px;
        }
        .homepage-hero-overlay {
          position: absolute;
          inset: 0;
          background:
            linear-gradient(180deg, rgba(7,19,18,0.26) 0%, rgba(7,19,18,0.58) 48%, rgba(7,19,18,0.92) 100%),
            radial-gradient(circle at 20% 20%, rgba(34,197,94,0.28), transparent 34%);
        }
        .homepage-hero-inner {
          position: relative;
          z-index: 1;
          width: 100%;
          max-width: 1560px;
          margin: 0 auto;
          padding: 0 24px;
          display: grid;
          gap: 22px;
          justify-items: center;
          text-align: center;
        }
        .homepage-hero-copy {
          width: min(820px, 100%);
          display: grid;
          gap: 10px;
          justify-items: center;
        }
        .homepage-hero-copy h1 {
          margin: 0;
          color: #fff;
          font-family: inherit;
          font-size: clamp(34px, 4.8vw, 60px);
          line-height: 1.04;
          font-weight: 850;
          letter-spacing: 0;
          text-shadow: 0 8px 30px rgba(0,0,0,0.34);
        }
        .homepage-hero-copy p {
          margin: 0;
          max-width: 620px;
          color: rgba(255,255,255,0.88);
          font-size: clamp(15px, 1.7vw, 18px);
          line-height: 1.5;
        }
        .homepage-search-box {
          display: grid;
          grid-template-columns: minmax(240px, 1.7fr) repeat(3, minmax(128px, 1fr)) minmax(112px, auto) minmax(142px, auto);
          gap: 10px;
          align-items: end;
          width: min(86vw, 1160px);
          max-width: none;
          margin: 0 auto;
          padding: 12px;
          border: 1px solid rgba(219,234,254,0.92);
          border-radius: 26px;
          background: rgba(255,255,255,0.97);
          box-shadow: 0 18px 42px rgba(15,23,42,0.18), 0 1px 0 rgba(255,255,255,0.74) inset;
          backdrop-filter: blur(18px);
        }
        .homepage-search-field {
          min-width: 0;
          display: grid;
          gap: 6px;
          position: relative;
        }
        .homepage-search-field span {
          color: #64748b;
          font-size: 11px;
          font-weight: 900;
          letter-spacing: 0;
          text-transform: uppercase;
        }
        .homepage-search-field input {
          width: 100%;
          min-width: 0;
          height: 48px;
          border: 1px solid rgba(191,219,254,0.86);
          border-radius: 16px;
          padding: 0 12px;
          color: #0f172a;
          background: #fff;
          font-size: 14px;
          font-weight: 800;
          outline: none;
          box-shadow: 0 1px 0 rgba(15,23,42,0.02);
          transition: border-color 160ms ease, box-shadow 160ms ease;
        }
        .homepage-search-field input:focus {
          border-color: rgba(22,136,240,0.72);
          box-shadow: 0 0 0 3px rgba(22,136,240,0.12);
        }
        .homepage-date-field {
          cursor: pointer;
        }
        .homepage-date-field::after {
          content: "⌄";
          position: absolute;
          right: 13px;
          bottom: 13px;
          color: #1A56DB;
          font-size: 16px;
          font-weight: 950;
          pointer-events: none;
        }
        .homepage-date-field input {
          cursor: pointer;
          padding-right: 34px;
        }
        .destination-suggestions {
          position: absolute;
          top: calc(100% + 8px);
          left: 0;
          right: 0;
          z-index: 20;
          display: grid;
          gap: 6px;
          padding: 8px;
          border: 1px solid rgba(191,219,254,0.9);
          border-radius: 18px;
          background: rgba(255,255,255,0.98);
          box-shadow: 0 18px 42px rgba(15,23,42,0.16);
          backdrop-filter: blur(14px);
        }
        .destination-suggestions-group {
          padding: 4px 8px 2px;
          color: #64748b;
          font-size: 11px;
          font-weight: 900;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
        .destination-suggestion {
          border: 0;
          border-radius: 12px;
          background: transparent;
          color: #0f172a;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          padding: 10px 11px;
          text-align: left;
          font: inherit;
        }
        .destination-suggestion:hover,
        .destination-suggestion.is-active {
          background: #eff6ff;
          color: #1A56DB;
        }
        .destination-suggestion:focus-visible {
          outline: none;
          box-shadow: inset 0 0 0 2px rgba(29,78,216,0.28);
        }
        .destination-suggestion-icon {
          width: 18px;
          height: 18px;
          flex-shrink: 0;
          color: currentColor;
        }
        .destination-suggestion-copy {
          min-width: 0;
          flex: 1;
          display: grid;
          gap: 3px;
        }
        .destination-suggestion-title {
          color: #0f172a;
          font-size: 14px;
          font-weight: 850;
          line-height: 1.2;
        }
        .destination-suggestion-meta {
          color: #64748b;
          font-size: 12px;
          font-weight: 700;
          line-height: 1.3;
        }
        .destination-suggestion-count {
          flex-shrink: 0;
          color: #1d4ed8;
          font-size: 12px;
          font-weight: 800;
          line-height: 1.2;
        }
        .destination-suggestions-empty {
          padding: 12px;
          border-radius: 12px;
          color: #475569;
          font-size: 13px;
          font-weight: 700;
          background: rgba(248,250,252,0.92);
        }
        .homepage-search-button,
        .homepage-location-button {
          height: 48px;
          border-radius: 16px;
          padding: 0 16px;
          font-size: 14px;
          font-weight: 900;
          white-space: nowrap;
          cursor: pointer;
          transition: transform 160ms ease, box-shadow 160ms ease, background 160ms ease, border-color 160ms ease;
        }
        .homepage-search-button {
          border: 0;
          background: linear-gradient(135deg, #1688f0, #1A56DB);
          color: #fff;
          box-shadow: 0 10px 22px rgba(22,136,240,0.24);
        }
        .homepage-search-button:hover {
          transform: translateY(-1px);
          box-shadow: 0 14px 28px rgba(22,136,240,0.3);
        }
        .homepage-location-button {
          border: 1px solid rgba(147,197,253,0.86);
          background: #ffffff;
          color: #1A56DB;
        }
        .homepage-location-button:hover {
          border-color: rgba(22,136,240,0.74);
          background: #eff6ff;
        }
        .homepage-location-button:disabled {
          cursor: wait;
          opacity: 0.72;
        }
        .homepage-location-note {
          width: fit-content;
          max-width: 100%;
          padding: 9px 12px;
          border-radius: 8px;
          background: rgba(22,163,74,0.24);
          color: #fff;
          font-size: 12px;
          font-weight: 800;
        }
        .homepage-location-note.is-error {
          background: rgba(127,29,29,0.28);
        }
        .homepage-stats {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 1px;
          width: min(86vw, 1160px);
          margin: 20px auto 0;
          position: relative;
          z-index: 1;
          overflow: hidden;
          border-radius: 18px;
          border: 1px solid #dcfce7;
          background: #dcfce7;
          box-shadow: 0 14px 34px rgba(15,23,42,0.08);
        }
        .homepage-stats div {
          background: #fff;
          padding: 16px 20px;
          display: grid;
          gap: 5px;
        }
        .homepage-stats strong {
          color: #052e16;
          font-size: clamp(22px, 3vw, 34px);
          line-height: 1;
          font-weight: 950;
        }
        .homepage-stats span {
          color: #64748b;
          font-size: 12px;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: 0;
        }
        .stay-filter-row {
          display: flex;
          flex-wrap: wrap;
          gap: 9px;
          margin: -4px 0 18px;
        }
        .stay-filter {
          border: 1px solid #dbeafe;
          border-radius: 999px;
          background: #fff;
          color: #334155;
          padding: 8px 12px;
          font-size: 12px;
          font-weight: 900;
          cursor: pointer;
        }
        .stay-filter.is-selected {
          border-color: rgba(22,163,74,0.45);
          background: linear-gradient(135deg, #dcfce7, #eff6ff);
          color: #14532d;
        }
        .top-rated-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 20px;
          align-items: stretch;
          padding-bottom: 10px;
        }
        .top-rated-grid > a {
          width: 100% !important;
          min-width: 0 !important;
          max-width: 100% !important;
          flex: 1 1 auto !important;
          overflow: hidden;
          transform: none !important;
        }
        .homepage-empty-state {
          border: 1px solid #dbeafe;
          background: #fff;
          border-radius: 8px;
          padding: 24px;
          display: grid;
          gap: 10px;
          justify-items: start;
        }
        .homepage-empty-state h3 {
          margin: 0;
          color: #0f172a;
          font-size: 20px;
          font-weight: 900;
        }
        .homepage-empty-state p {
          margin: 0;
          color: #64748b;
        }
        .homepage-empty-state a {
          margin-top: 4px;
          border-radius: 8px;
          background: #16a34a;
          color: #fff;
          padding: 10px 14px;
          text-decoration: none;
          font-size: 13px;
          font-weight: 900;
        }
        .popular-destinations-rail {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 20px;
        }
        .popular-destination-card {
          min-height: 176px;
          border-radius: 20px;
          padding: 18px;
          display: flex;
          flex-direction: column;
          justify-content: flex-end;
          gap: 6px;
          color: #fff;
          text-decoration: none;
          box-shadow: 0 14px 32px rgba(15, 23, 42, 0.12);
          overflow: hidden;
          position: relative;
          isolation: isolate;
          transition: transform 180ms ease, box-shadow 180ms ease;
        }
        .popular-destination-card::after {
          content: "";
          position: absolute;
          inset: 0;
          background: linear-gradient(180deg, rgba(15,23,42,0.04) 0%, rgba(15,23,42,0.56) 100%);
          z-index: -1;
        }
        .popular-destination-card:hover {
          transform: translateY(-3px);
          box-shadow: 0 18px 38px rgba(15, 23, 42, 0.18);
        }
        .popular-destination-card span {
          font-size: 22px;
          line-height: 1.05;
          font-weight: 900;
          text-shadow: 0 2px 14px rgba(0,0,0,0.22);
        }
        .popular-destination-card strong {
          width: fit-content;
          padding: 6px 10px;
          border-radius: 999px;
          background: rgba(255,255,255,0.22);
          color: #fff;
          font-size: 12px;
          font-weight: 800;
          backdrop-filter: blur(8px);
        }
        .host-reels-rail {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 18px;
        }
        .host-reel-card {
          border: 1px solid #dbeafe;
          border-radius: 20px;
          background: #fff;
          box-shadow: 0 12px 30px rgba(15,23,42,0.08);
          cursor: pointer;
          display: grid;
          gap: 10px;
          min-width: 0;
          overflow: hidden;
          padding: 10px;
          text-align: left;
          transition: transform 180ms ease, box-shadow 180ms ease;
        }
        .host-reel-card:hover {
          transform: translateY(-3px);
          box-shadow: 0 18px 38px rgba(15,23,42,0.13);
        }
        .host-reel-thumb {
          aspect-ratio: 4 / 5;
          border-radius: 16px;
          display: grid;
          overflow: hidden;
          place-items: center;
          position: relative;
        }
        .host-reel-play {
          width: 46px;
          height: 46px;
          border-radius: 999px;
          background: rgba(255,255,255,0.92);
          color: #1A56DB;
          display: grid;
          place-items: center;
          font-size: 18px;
          font-weight: 950;
          box-shadow: 0 10px 26px rgba(15,23,42,0.22);
          padding-left: 2px;
        }
        .host-reel-card > span {
          color: #0f172a;
          font-size: 14px;
          font-weight: 900;
          line-height: 1.25;
        }
        .host-reel-card small {
          color: #64748b;
          font-size: 12px;
          font-weight: 750;
          margin-top: -5px;
        }
        .host-reel-rank {
          position: absolute;
          top: 10px;
          left: 10px;
          z-index: 2;
          padding: 5px 8px;
          border-radius: 6px;
          background: rgba(255,255,255,0.94);
          color: #165dcc;
          font-size: 9px;
          font-weight: 900;
          text-transform: uppercase;
        }
        .host-reel-modal {
          position: fixed;
          inset: 0;
          z-index: 2000;
          display: grid;
          place-items: center;
          padding: 18px;
        }
        .host-reel-modal-backdrop {
          position: absolute;
          inset: 0;
          border: 0;
          background: rgba(2,6,23,0.72);
          cursor: pointer;
        }
        .host-reel-modal-panel {
          position: relative;
          z-index: 1;
          width: min(92vw, 420px);
          display: grid;
          gap: 12px;
          border-radius: 24px;
          background: #071b2f;
          padding: 12px;
          box-shadow: 0 28px 70px rgba(0,0,0,0.38);
        }
        .host-reel-modal-panel video {
          width: 100%;
          max-height: min(78vh, 720px);
          border-radius: 18px;
          background: #020617;
          display: block;
        }
        .host-reel-modal-panel div {
          display: grid;
          gap: 3px;
          padding: 0 4px 4px;
        }
        .host-reel-modal-panel strong {
          color: #fff;
          font-size: 15px;
          font-weight: 900;
        }
        .host-reel-modal-panel span {
          color: rgba(255,255,255,0.7);
          font-size: 13px;
          font-weight: 700;
        }
        .host-reel-close {
          justify-self: end;
          border: 1px solid rgba(255,255,255,0.16);
          border-radius: 999px;
          background: rgba(255,255,255,0.1);
          color: #fff;
          cursor: pointer;
          font-size: 12px;
          font-weight: 900;
          padding: 8px 12px;
        }
        .famlo-dark-trust {
          background: #f6f8fb;
          color: #0f172a;
          padding: 46px 0 28px;
        }
        .famlo-dark-shell {
          display: grid;
          gap: 22px;
        }
        .famlo-trust-head {
          display: grid;
          gap: 7px;
          max-width: 640px;
        }
        .famlo-trust-head h2,
        .famlo-bottom-cta h2 {
          margin: 0;
          color: #0f172a;
          font-family: inherit;
          font-size: clamp(24px, 3vw, 34px);
          line-height: 1.18;
          font-weight: 850;
          letter-spacing: 0;
        }
        .famlo-trust-head p {
          margin: 0;
          color: #64748b;
          font-size: 15px;
          line-height: 1.6;
        }
        .famlo-trust-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 14px;
        }
        .famlo-trust-card {
          min-height: 126px;
          border-radius: 20px;
          border: 1px solid #dbeafe;
          background: #fff;
          padding: 18px;
          display: grid;
          align-content: start;
          gap: 14px;
          box-shadow: 0 12px 30px rgba(15,23,42,0.06);
        }
        .famlo-trust-icon {
          width: 34px;
          height: 34px;
          border-radius: 14px;
          background:
            radial-gradient(circle at 50% 50%, #fff 0 18%, transparent 20%),
            linear-gradient(135deg, #16a34a, #1A56DB);
          box-shadow: 0 8px 18px rgba(26,86,219,0.16);
        }
        .famlo-trust-card strong {
          color: #0f172a;
          font-size: 15px;
          font-weight: 850;
        }
        .famlo-trust-card p,
        .famlo-bottom-cta p,
        .famlo-footer-brand p {
          margin: 0;
          color: #64748b;
          line-height: 1.55;
        }
        .famlo-bottom-cta {
          border-radius: 24px;
          border: 1px solid #bfdbfe;
          background: linear-gradient(135deg, #ffffff 0%, #eff6ff 54%, #dcfce7 100%);
          padding: clamp(22px, 4vw, 34px);
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 20px;
          flex-wrap: wrap;
          box-shadow: 0 18px 42px rgba(15,23,42,0.08);
        }
        .famlo-bottom-cta > div:first-child {
          display: grid;
          gap: 8px;
          max-width: 680px;
        }
        .famlo-cta-actions {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }
        .famlo-cta-actions a {
          border-radius: 12px;
          padding: 12px 16px;
          text-decoration: none;
          font-size: 14px;
          font-weight: 950;
        }
        .famlo-cta-actions a:first-child {
          background: linear-gradient(135deg, #16a34a, #1A56DB);
          color: #fff;
          box-shadow: 0 10px 22px rgba(26,86,219,0.18);
        }
        .famlo-cta-actions a:last-child {
          border: 1px solid #bfdbfe;
          background: #fff;
          color: #1e3a8a;
        }
        .famlo-footer {
          background: linear-gradient(180deg, #071b2f 0%, #041310 100%);
          color: #fff;
          margin-top: auto;
          flex-shrink: 0;
          padding: 36px 0 22px;
        }
        .famlo-footer-shell {
          display: grid;
          grid-template-columns: minmax(220px, 1.4fr) repeat(3, minmax(140px, 1fr));
          gap: 28px;
        }
        .famlo-footer-brand {
          display: grid;
          gap: 12px;
          max-width: 320px;
        }
        .famlo-footer-brand p {
          color: rgba(255,255,255,0.68);
        }
        .famlo-footer-logo {
          width: fit-content;
          display: inline-flex;
          align-items: center;
          text-decoration: none;
        }
        .famlo-footer-column {
          display: grid;
          gap: 10px;
          align-content: start;
        }
        .famlo-footer-column h3 {
          margin: 0 0 4px;
          color: #fff;
          font-size: 13px;
          font-weight: 850;
          text-transform: uppercase;
          letter-spacing: 0;
        }
        .famlo-footer-column a,
        .famlo-footer-bottom a {
          color: rgba(255,255,255,0.68);
          text-decoration: none;
          font-size: 14px;
          font-weight: 700;
        }
        .famlo-footer-column a:hover,
        .famlo-footer-bottom a:hover {
          color: #86efac;
        }
        .famlo-footer-bottom {
          margin: 32px auto 0;
          padding-top: 18px;
          border-top: 1px solid rgba(255,255,255,0.1);
          display: flex;
          justify-content: space-between;
          gap: 14px;
          flex-wrap: wrap;
          color: rgba(255,255,255,0.54);
          font-size: 13px;
          font-weight: 700;
        }
        .famlo-footer-bottom div {
          display: flex;
          gap: 14px;
          flex-wrap: wrap;
        }
        @media (max-width: 980px) {
          .homepage-section {
            padding: 36px 0 22px;
          }
          .homepage-search-box {
            grid-template-columns: 1fr 1fr;
          }
          .homepage-search-destination,
          .homepage-search-button,
          .homepage-location-button {
            grid-column: 1 / -1;
          }
          .famlo-trust-grid,
          .famlo-footer-shell {
            grid-template-columns: 1fr 1fr;
          }
          .top-rated-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 16px;
          }
          .popular-destinations-rail {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
          .host-reels-rail {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }
        @media (max-width: 640px) {
          .hide-scroll { padding-bottom: 4px !important; }
          .homepage-section {
            padding: 28px 0 18px;
          }
          .homepage-section-shell,
          .famlo-dark-shell,
          .famlo-footer-shell,
          .famlo-footer-bottom {
            width: 100%;
            padding-left: 16px;
            padding-right: 16px;
          }
          .homepage-section-head {
            margin-bottom: 16px;
          }
          .homepage-hero {
            min-height: 620px;
            padding: 84px 0 34px;
            align-items: center;
          }
          .homepage-hero-inner {
            padding-left: 16px;
            padding-right: 16px;
          }
          .homepage-hero-copy h1 {
            font-size: clamp(32px, 9vw, 38px);
          }
          .homepage-search-box,
          .famlo-trust-grid,
          .famlo-footer-shell {
            grid-template-columns: 1fr;
          }
          .homepage-stats {
            width: calc(100% - 32px);
            margin-top: 16px;
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
          .homepage-stats div {
            padding: 16px;
          }
          .stay-filter-row {
            flex-wrap: nowrap;
            overflow-x: auto;
            padding-bottom: 6px;
            scrollbar-width: none;
          }
          .stay-filter-row::-webkit-scrollbar { display: none; }
          .top-rated-grid {
            display: flex;
            gap: 14px;
            overflow-x: auto;
            padding-bottom: 10px;
            scrollbar-width: none;
            -webkit-overflow-scrolling: touch;
          }
          .top-rated-grid::-webkit-scrollbar { display: none; }
          .top-rated-grid > a {
            flex: 0 0 min(82vw, 340px) !important;
            width: min(82vw, 340px) !important;
            min-width: 0 !important;
            max-width: min(82vw, 340px) !important;
          }
          .popular-destinations-rail {
            display: flex;
            gap: 12px;
            overflow-x: auto;
            padding-bottom: 8px;
            scrollbar-width: none;
            -webkit-overflow-scrolling: touch;
          }
          .popular-destinations-rail::-webkit-scrollbar { display: none; }
          .popular-destination-card {
            flex: 0 0 236px;
            min-height: 146px;
          }
          .host-reels-rail {
            display: flex;
            gap: 12px;
            overflow-x: auto;
            padding-bottom: 8px;
            scrollbar-width: none;
            -webkit-overflow-scrolling: touch;
          }
          .host-reels-rail::-webkit-scrollbar { display: none; }
          .host-reel-card {
            flex: 0 0 230px;
          }
          .famlo-dark-trust {
            padding-top: 42px;
          }
          .famlo-bottom-cta,
          .famlo-cta-actions,
          .famlo-cta-actions a {
            width: 100%;
          }
          .famlo-footer-bottom {
            display: grid;
          }
        }
      `}</style>
    </div>
  );
}
