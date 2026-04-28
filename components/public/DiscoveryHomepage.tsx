"use client";

import { useState, useMemo, useEffect, useRef, useCallback, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthModal } from "@/components/auth/AuthModal";
import { useUser } from "@/components/auth/UserContext";
import { HomeCardRecord, CompanionRecord, AdRecord, StoryRecord } from "@/lib/discovery";
import { recordHostInteractionEvent } from "@/lib/host-interactions";
import { buildHomestayPath } from "@/lib/slug";
import { readRecentViews, type RecentViewItem } from "@/lib/recent-views";
import { HomePageCard } from "@/components/public/HomePageCard";
interface Props {
  homes: HomeCardRecord[];
  mostInteractedHomes?: HomeCardRecord[];
  companions: CompanionRecord[];
  ads: AdRecord[];
  stories: StoryRecord[];
  heroBanners?: { imageUrl: string; alt?: string }[];
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

/* ─── default banners ─────────────────────────────────────────── */
const DEFAULT_BANNERS = [
  { imageUrl: "https://images.unsplash.com/photo-1524492412937-b28074a5d7da?w=1600&q=85", alt: "India streets" },
  { imageUrl: "https://images.unsplash.com/photo-1598091383021-15ddea10925d?w=1600&q=85", alt: "Local home" },
  { imageUrl: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1600&q=85", alt: "Cultural travel" },
  { imageUrl: "https://images.unsplash.com/photo-1587474260584-136574528ed5?w=1600&q=85", alt: "Delhi streets" },
];

/* ═══════════════════════════════════════════════════════════════
   HEADER
═══════════════════════════════════════════════════════════════ */
function SiteHeader({ onAuthOpen }: { onAuthOpen: () => void }) {
  const { user, profile, signOut } = useUser();
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
        <img 
          src="/logo-blue.png" 
          alt="Famlo" 
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
                <img
                  src={profile.avatar_url}
                  alt={profile?.name || "Profile"}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              ) : initial}
            </button>
            {dropOpen && (
              <div className="profile-dropdown" style={{
                position: "absolute", top: "calc(100% + 10px)", right: 0,
                width: "248px",
                background: "linear-gradient(180deg,#ffffff,#f8fbff)",
                borderRadius: "18px",
                boxShadow: "0 18px 38px rgba(30,64,175,0.16)",
                border: "1px solid #dbeafe",
                overflow: "hidden", animation: "dropIn 0.2s ease",
              }}>
                <div style={{ padding: "16px 18px", borderBottom: "1px solid #e0ecff", background: "linear-gradient(180deg,#f8fbff,#eef5ff)" }}>
                  <div style={{ fontWeight: 800, fontSize: "15px", color: "#0f172a" }}>{profile?.name || "Welcome"}</div>
                  <div style={{ fontSize: "12px", color: "#64748b", marginTop: "4px" }}>{user.email || user.phone}</div>
                </div>
                <div style={{ display: "grid", gap: 8, padding: "12px" }}>
                  {[{ label: "Profile", href: "/profile" }, { label: "My Bookings", href: "/bookings" }, { label: "Messages", href: "/messages" }].map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="profile-dropdown-item"
                      onClick={() => setDropOpen(false)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        width: "100%",
                        padding: "12px 14px",
                        fontSize: "14px",
                        fontWeight: 700,
                        color: "#1e3a8a",
                        textDecoration: "none",
                        borderRadius: "14px",
                        transition: "background 0.15s, transform 0.15s",
                        background: "#f8fbff",
                        border: "1px solid #e0ecff",
                        boxSizing: "border-box",
                        whiteSpace: "nowrap",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = "#eaf3ff";
                        e.currentTarget.style.transform = "translateY(-1px)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "#f8fbff";
                        e.currentTarget.style.transform = "translateY(0)";
                      }}
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>
                <button 
                  className="profile-dropdown-item logout-btn" 
                  onClick={() => { signOut(); setDropOpen(false); }} 
                  style={{
                    width: "calc(100% - 24px)",
                    margin: "0 12px 12px",
                    padding: "12px 14px",
                    background: "#fff5f5",
                    border: "1px solid #fecaca",
                    borderRadius: "14px",
                    textAlign: "left",
                    fontSize: "14px",
                    color: "#dc2626",
                    cursor: "pointer",
                    fontWeight: 700,
                  }}
                >Log out</button>
              </div>
            )}
          </>
        ) : (
          <button onClick={onAuthOpen} style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            width: "40px", height: "40px", borderRadius: "50%",
            background: "#eff6ff", border: "1.5px solid #dbeafe",
            cursor: "pointer", color: "#1A56DB", transition: "all 0.15s",
          }}
            onMouseEnter={e => (e.currentTarget.style.background = "#dbeafe")}
            onMouseLeave={e => (e.currentTarget.style.background = "#eff6ff")}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          </button>
        )}
      </div>
    </header>
  );
}

/* ═══════════════════════════════════════════════════════════════
   SECTION WRAPPER — full width content
═══════════════════════════════════════════════════════════════ */
function Section({ title, seeAllHref, dark = false, children }: {
  title: string; seeAllHref?: string; dark?: boolean; children: React.ReactNode;
}) {
  return (
    <section style={{ background: dark ? "#0d1b2a" : "#f7f9fc", padding: "36px clamp(16px, 4vw, 48px) 20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <h2 style={{
          fontSize: "clamp(16px, 2.5vw, 22px)", fontWeight: 700,
          color: dark ? "#fff" : "#0f172a", margin: 0, letterSpacing: "-0.3px",
          fontFamily: "'DM Sans', 'Segoe UI', sans-serif",
        }}>{title}</h2>
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
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════
   HOME CARD — bigger, full photo, hover scale
═══════════════════════════════════════════════════════════════ */
function HomeCard({ home, distance }: { home: HomeCardRecord; distance?: string }) {
  const [c1, c2] = pal(home.id);
  const price = minPrice(home);
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
        position: "relative", display: "flex", gap: "6px", flexWrap: "wrap" }}>
        {!home.rating && <Badge bg="rgba(255,255,255,0.2)" color="#fff">NEW</Badge>}
        {home.isAccepting && <Badge bg="rgba(52,211,153,0.28)" color="#6ee7b7">OPEN</Badge>}
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
        {home.rating && (
          <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            <span style={{ fontSize: "12px", color: "#fbbf24" }}>★</span>
            <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.75)", fontWeight: 600 }}>{home.rating.toFixed(1)}</span>
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
            <img
              src={coverImage}
              alt={storyAuthor}
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
export default function DiscoveryHomepage({ homes, mostInteractedHomes: mostInteractedHomesProp = [], companions, ads, stories, heroBanners }: Props) {
  const router = useRouter();
  const { user, profile } = useUser();
  const [showAuth, setShowAuth] = useState(false);
  const [pending, setPending] = useState<(() => void) | null>(null);
  const [query, setQuery] = useState("");
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [searchCoords, setSearchCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [searchingLocation, setSearchingLocation] = useState(false);
  const [locatingUser, setLocatingUser] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [bannerIdx, setBannerIdx] = useState(0);
  const banners = heroBanners?.length ? heroBanners : DEFAULT_BANNERS;
  const safeBannerIdx = banners.length > 0 ? bannerIdx % banners.length : 0;
  const hasRequestedInitialLocation = useRef(false);
  const isClient = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false
  );
  const recentViews = useMemo(() => {
    if (!isClient) return [];
    try {
      return readRecentViews(user?.id)
        .filter((rv: RecentViewItem) => rv.id && rv.title && rv.title !== "Famlo stay")
        .slice(0, 10);
    } catch {
      return [];
    }
  }, [isClient, user?.id]);

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
    if (hasRequestedInitialLocation.current) return;
    hasRequestedInitialLocation.current = true;
    const timeout = window.setTimeout(() => {
      requestCurrentLocation();
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [requestCurrentLocation]);

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
    return (b.rating ?? 0) - (a.rating ?? 0);
  }), [homes, userCoords]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sortedHomes;
    
    // Exact text matches (Village, City, State, Name)
    const exactMatches = sortedHomes.filter(h =>
      h.city?.toLowerCase().includes(q) || h.state?.toLowerCase().includes(q) ||
      h.name?.toLowerCase().includes(q) || h.village?.toLowerCase().includes(q)
    );

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

  const sortedCompanions = useMemo(() => [...companions].sort((a, b) => {
    if (userCoords && a.lat && a.lng && b.lat && b.lng)
      return haversine(userCoords.lat, userCoords.lng, a.lat, a.lng) - haversine(userCoords.lat, userCoords.lng, b.lat, b.lng);
    return b.rating - a.rating;
  }), [companions, userCoords]);
  const mostInteractedHomes = useMemo(() => {
    const base = (mostInteractedHomesProp.length > 0 ? mostInteractedHomesProp : homes).slice(0, 8);
    return base;
  }, [homes, mostInteractedHomesProp]);

  const visibleAds = useMemo(() => {
    return [...ads]
      .filter(isAdLive)
      .sort((left, right) => {
        const scoreDiff =
          scoreAdForViewer(right, profile?.city, profile?.state, query) -
          scoreAdForViewer(left, profile?.city, profile?.state, query);
        if (scoreDiff !== 0) return scoreDiff;
        return left.priority - right.priority;
      });
  }, [ads, profile?.city, profile?.state, query]);

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
            href: matchedHome.href || buildHomestayPath(matchedHome.name || rv.title, matchedHome.village, matchedHome.city, rv.id),
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
            ? buildHomestayPath(rv.title || "Famlo homestay", null, null, rv.id)
            : `/hommies/${rv.id}`
      };
    });
  }, [companions, homes, recentViews]);

  const guard = (fn: () => void) => {
    if (!user) { setPending(() => fn); setShowAuth(true); } else fn();
  };

  const submitSearch = useCallback(() => {
    const params = new URLSearchParams();
    const normalizedQuery = query.trim();

    if (normalizedQuery) {
      params.set("q", normalizedQuery);
    }

    if (userCoords) {
      params.set("lat", userCoords.lat.toFixed(6));
      params.set("lng", userCoords.lng.toFixed(6));
    }

    router.push(params.size > 0 ? `/homestays?${params.toString()}` : "/homestays");
  }, [query, router, userCoords]);

  // Two rows of homes
  const row1 = filtered.slice(0, 5);
  const row2 = filtered.slice(5, 10);

  return (
    <div style={{ background: "#f7f9fc", minHeight: "100vh", display: "flex", flexDirection: "column", fontFamily: "'DM Sans','Segoe UI',sans-serif" }}>
      {/* ══ HERO ══ */}
      <section className="discovery-hero" style={{ 
        position: "relative", 
        height: "60svh", 
        minHeight: "450px", 
        maxHeight: "550px", 
        marginTop: "0px", 
        overflow: "hidden", 
        background: "#0a1628" }}>
        {banners.map((b, i) => (
          <div key={i} style={{
            position: "absolute", inset: 0,
            backgroundImage: `url(${b.imageUrl})`, backgroundSize: "cover", backgroundPosition: "center",
            opacity: i === safeBannerIdx ? 1 : 0, transition: "opacity 1.2s ease",
          }} />
        ))}
        {/* dark overlay */}
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, rgba(10,22,40,0.44) 0%, rgba(10,22,40,0.65) 50%, rgba(10,22,40,0.92) 100%)" }} />

        {/* hero text + search */}
        <div style={{
          position: "absolute", inset: 0, display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          padding: "0 clamp(16px, 5vw, 80px)", gap: "16px",
        }}>
          <h1 style={{
            fontFamily: "'Playfair Display', Georgia, serif",
            fontSize: "clamp(36px, 7vw, 72px)", fontWeight: 700, color: "#fff",
            textAlign: "center", lineHeight: 1.1, margin: 0,
            textShadow: "0 4px 32px rgba(0,0,0,0.5)",
            animation: "fadeUp 0.9s ease both",
          }}>
            Where will you<br />belong next?
          </h1>
          <p style={{
            fontSize: "clamp(14px, 2vw, 18px)", color: "rgba(255,255,255,0.82)",
            textAlign: "center", margin: 0, lineHeight: 1.6,
            animation: "fadeUp 0.9s 0.15s ease both",
          }}>
            Book real homes, travel city with locals — all in one place.
          </p>

          {/* search */}
          <div style={{
            display: "flex", alignItems: "center", background: "#fff",
            borderRadius: "16px", padding: "8px 8px 8px 20px", gap: "12px",
            width: "100%", maxWidth: "600px",
            boxShadow: "0 16px 48px rgba(0,0,0,0.32)", marginTop: "8px",
            animation: "fadeUp 0.9s 0.3s ease both",
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2.5">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
            </svg>
            <input
              placeholder="Search your next destination or live like local..."
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={event => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  submitSearch();
                }
              }}
              style={{
                flex: 1, border: "none", outline: "none",
                fontSize: "clamp(13px, 1.5vw, 15px)", color: "#111",
                background: "transparent", minWidth: 0,
              }}
            />
            <button
              type="button"
              onClick={requestCurrentLocation}
              disabled={locatingUser}
              style={{
                background: userCoords ? "#eff6ff" : "#f8fafc",
                color: userCoords ? "#1A56DB" : "#475569",
                border: "1px solid #dbeafe",
                borderRadius: "12px",
                padding: "12px 14px",
                fontSize: "13px",
                fontWeight: 700,
                cursor: locatingUser ? "wait" : "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {locatingUser ? "Locating..." : userCoords ? "Location On" : "Use My Location"}
            </button>
            <button style={{
              background: "linear-gradient(135deg,#1A56DB,#3B82F6)", color: "#fff",
              border: "none", borderRadius: "12px",
              padding: "12px clamp(16px,3vw,28px)",
              fontSize: "14px", fontWeight: 600, cursor: "pointer",
              boxShadow: "0 4px 14px rgba(26,86,219,0.42)", transition: "transform 0.15s",
              whiteSpace: "nowrap",
            }}
              onClick={submitSearch}
              onMouseEnter={e => (e.currentTarget.style.transform = "scale(1.04)")}
              onMouseLeave={e => (e.currentTarget.style.transform = "scale(1)")}
            >Search</button>
          </div>

          {(locationError || userCoords) && (
            <div style={{
              marginTop: "6px",
              padding: "8px 12px",
              borderRadius: "10px",
              background: locationError ? "rgba(127,29,29,0.22)" : "rgba(15,118,110,0.22)",
              color: "#fff",
              fontSize: "12px",
              fontWeight: 600,
              animation: "fadeUp 0.9s 0.35s ease both",
            }}>
              {locationError
                ? locationError
                : "Showing homes and hommies nearest to your current location."}
            </div>
          )}

          {/* dots — placed below search */}
          <div style={{ display: "flex", gap: "8px", marginTop: "12px", animation: "fadeUp 0.9s 0.4s ease both" }}>
            {banners.map((_, i) => (
              <button key={i} onClick={() => setBannerIdx(i)} style={{
                width: i === safeBannerIdx ? "28px" : "8px", height: "8px",
                borderRadius: "4px",
                background: i === safeBannerIdx ? "#fff" : "rgba(255,255,255,0.36)",
                border: "none", cursor: "pointer", transition: "all 0.35s ease", padding: 0,
              }} />
            ))}
          </div>
        </div>
      </section>

      {/* ══ RECENT VIEW — only shown if user has actual recent views ══ */}
      {enrichedRecentViews.length > 0 && (
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
                      {rv.hostPhotoUrl ? (
                        <img
                          src={rv.hostPhotoUrl}
                          alt={`${rv.hostName || rv.title} host`}
                          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                        />
                      ) : (
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
                          {(rv.hostName || rv.title).slice(0, 1).toUpperCase()}
                        </div>
                          )}
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
                          letterSpacing: "-0.02em",
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

      {/* ══ MOST INTERACTED ══ */}
      {mostInteractedHomes.length > 0 && (
        <Section title="Most Interacted Hosts" seeAllHref="/homestays">
          <div style={{ display: "flex", gap: "14px", overflowX: "auto", paddingBottom: "10px" }} className="hide-scroll">
            {mostInteractedHomes.map((home) => (
              <HomePageCard key={`interacted-${home.id}`} home={home} distance={distLabel(home.lat, home.lng)} />
            ))}
          </div>
        </Section>
      )}

      {/* ══ HOMES ══ */}
      <Section title="Homes near you" seeAllHref="/homestays">
        {filtered.length === 0 ? (
          <p style={{ color: "#9ca3af", fontSize: "15px", padding: "24px 0" }}>
            {query.trim()
              ? `No results for "${query}". Try another city or locality.`
              : "We could not load nearby homes right now. Try searching another area or refresh in a moment."}
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "14px", overflowX: "auto" }} className="hide-scroll">
            <div style={{ display: "flex", gap: "14px" }}>
              {row1.map(h => <HomePageCard key={h.id} home={h} distance={distLabel(h.lat, h.lng)} />)}
            </div>
            {row2.length > 0 && (
              <div style={{ display: "flex", gap: "14px" }}>
                {row2.map(h => <HomePageCard key={h.id} home={h} distance={distLabel(h.lat, h.lng)} />)}
              </div>
            )}
          </div>
        )}
      </Section>

      {/* ══ HOMMIES ══ */}
      {sortedCompanions.length > 0 && (
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
      {visibleAds.length > 0 && (
        <Section title="Discover More">
          <div className="discover-more-rail">
            {visibleAds.map(ad => {
              const safe = ad.cta_url.startsWith("http") || ad.cta_url.startsWith("/") ? ad.cta_url : "#";
              return (
                <article key={ad.id} className="discover-more-card">
                  <div className="discover-more-media">
                    {ad.image_url
                      ? <img src={ad.image_url} alt={ad.title} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                      : <div style={{ width: "100%", height: "100%", minHeight: "100%", background: "linear-gradient(135deg,#1A56DB,#3B82F6)" }} />}
                  </div>
                  <div className="discover-more-copy">
                    <span style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#1A56DB" }}>{ad.label}</span>
                    <h3 style={{ fontSize: "clamp(18px,2.5vw,26px)", fontWeight: 700, color: "#0f172a", lineHeight: 1.22, margin: 0 }}>{ad.title}</h3>
                    {ad.description && <p style={{ fontSize: "clamp(13px,1.4vw,15px)", color: "#6b7280", lineHeight: 1.65, margin: 0 }}>{ad.description}</p>}
                    <a href={safe} target="_blank" rel="noopener noreferrer" style={{
                      alignSelf: "flex-start", marginTop: "4px",
                      background: "linear-gradient(135deg,#1A56DB,#3B82F6)", color: "#fff",
                      padding: "12px 26px", borderRadius: "12px",
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
      <Section title="Moments that stayed" dark>
        {stories.length > 0 ? (
          <div style={{ display: "flex", gap: "16px", overflowX: "auto", paddingBottom: "10px" }} className="hide-scroll">
            {stories.slice(0, 10).map((s, i) => (
              <StoryCard key={s.id} story={s} index={i} />
            ))}
          </div>
        ) : (
          <div style={{
            borderRadius: "22px",
            border: "1px solid rgba(255,255,255,0.12)",
            background: "rgba(255,255,255,0.04)",
            padding: "22px",
            color: "rgba(255,255,255,0.82)",
            lineHeight: 1.6,
            maxWidth: "560px"
          }}>
            Real guest stories will appear here after completed stays and published experiences start flowing through the new story pipeline.
          </div>
        )}
      </Section>

      {/* ══ FOOTER ══ */}
      <footer style={{ background: "#1A56DB", marginTop: "auto", flexShrink: 0 }}>
        <div style={{
          padding: "40px clamp(16px, 5vw, 60px) 30px",
          display: "flex", alignItems: "flex-start", justifyContent: "space-between",
          flexWrap: "wrap", gap: "20px",
        }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <Link href="/">
              <img 
                src="/logo-blue.png" 
                alt="Famlo" 
                style={{ 
                  height: "36px", 
                  width: "auto", 
                  filter: "brightness(0) invert(1)" 
                }} 
              />
            </Link>
            <div style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "12px 22px",
              alignItems: "center"
            }}>
              {[
                { label: "T&C", href: "/legal" },
                { label: "Privacy Policy", href: "/legal/privacy" },
                { label: "Contact", href: "/contact" },
                { label: "Support", href: "/help" },
              ].map((l) => (
                <Link
                  key={l.label}
                  href={l.href}
                  style={{
                    fontSize: "13px",
                    color: "rgba(255,255,255,0.78)",
                    textDecoration: "none",
                    fontWeight: 600,
                    transition: "color 0.15s"
                  }}
                  onMouseEnter={e => ((e.target as HTMLElement).style.color = "#fff")}
                  onMouseLeave={e => ((e.target as HTMLElement).style.color = "rgba(255,255,255,0.78)")}
                >
                  {l.label}
                </Link>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
            <Link href="/joinfamlo" style={{
              background: "#fff", color: "#1A56DB",
              padding: "12px clamp(18px,3vw,30px)", borderRadius: "12px",
              fontSize: "14px", fontWeight: 700, textDecoration: "none",
              boxShadow: "0 2px 10px rgba(0,0,0,0.12)", transition: "all 0.15s",
            }}
              onMouseEnter={e => (e.currentTarget.style.background = "#eff6ff")}
              onMouseLeave={e => (e.currentTarget.style.background = "#fff")}
            >Join Famlo</Link>
            <Link href="/partners/login" style={{
              background: "rgba(255,255,255,0.14)", color: "#fff",
              padding: "12px clamp(18px,3vw,30px)", borderRadius: "12px",
              fontSize: "14px", fontWeight: 600, textDecoration: "none",
              border: "1.5px solid rgba(255,255,255,0.32)", transition: "all 0.15s",
            }}
              onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.22)")}
              onMouseLeave={e => (e.currentTarget.style.background = "rgba(255,255,255,0.14)")}
            >Partner Login</Link>
          </div>
        </div>
      </footer>

      {showAuth && (
        <AuthModal isOpen={showAuth} onClose={() => {
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
        @media (max-width: 640px) {
          .hide-scroll { padding-bottom: 4px !important; }
        }
      `}</style>
    </div>
  );
}
