"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import type { HomeCardRecord } from "@/lib/discovery";
import { recordHostInteractionEvent } from "@/lib/host-interactions";

function pal(id: string): [string, string] {
  const palettes: [string, string][] = [
    ["#1A56DB", "#3B82F6"],
    ["#1e40af", "#60a5fa"],
    ["#0e7490", "#22d3ee"],
    ["#065f46", "#34d399"],
    ["#7c3aed", "#a78bfa"],
    ["#b45309", "#fbbf24"],
    ["#be185d", "#f472b6"],
    ["#155e75", "#38bdf8"],
  ];

  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) & 0xffff;
  }

  return palettes[hash % palettes.length] ?? palettes[0]!;
}

function Badge({ bg, color, children }: { bg: string; color: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <span
      style={{
        fontSize: "9px",
        fontWeight: 800,
        textTransform: "uppercase",
        padding: "3px 8px",
        borderRadius: "6px",
        letterSpacing: "0.05em",
        background: bg,
        color,
      }}
    >
      {children}
    </span>
  );
}

function minPrice(home: HomeCardRecord): number {
  if (home.startingRoomPrice && home.startingRoomPrice > 0) return home.startingRoomPrice;
  return [home.priceMorning, home.priceAfternoon, home.priceEvening, home.priceFullday]
    .filter((price) => price > 0).sort((a, b) => a - b)[0] ?? 0;
}

export function HomePageCard({ home, distance }: Readonly<{ home: HomeCardRecord; distance?: string }>): React.JSX.Element {
  const [c1, c2] = pal(home.id);
  const price = minPrice(home);
  const [hov, setHov] = useState(false);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [pendingImageIndex, setPendingImageIndex] = useState<number | null>(null);
  const [isCrossfading, setIsCrossfading] = useState(false);
  const transitionTimeoutRef = useRef<number | null>(null);

  const roomImages = Array.isArray(home.roomImageUrls) ? home.roomImageUrls : [];
  const activeRoomImage = roomImages[activeImageIndex] || "";
  const incomingRoomImage = pendingImageIndex != null ? roomImages[pendingImageIndex] || "" : "";
  const hostPortrait = home.hostPhotoUrl || "";
  const roomCountToDisplay = home.roomCount != null && home.roomCount > 0 ? home.roomCount : null;
  const roomLabel = roomCountToDisplay != null && roomCountToDisplay > 0
    ? `${roomCountToDisplay} room${roomCountToDisplay > 1 ? "s" : ""}`
    : "Rooms available";
  const displayPrice = home.startingRoomPrice || price;
  const priceLabel = displayPrice > 0 ? `₹${displayPrice.toLocaleString("en-IN")} / room` : "Price set by host";

  useEffect(() => {
    if (!hov || roomImages.length < 2) return;
    const interval = window.setInterval(() => {
      setActiveImageIndex((current) => {
        const nextIndex = (current + 1) % roomImages.length;
        setPendingImageIndex(nextIndex);
        setIsCrossfading(true);

        if (transitionTimeoutRef.current != null) {
          window.clearTimeout(transitionTimeoutRef.current);
        }

        transitionTimeoutRef.current = window.setTimeout(() => {
          setActiveImageIndex(nextIndex);
          setPendingImageIndex(null);
          setIsCrossfading(false);
          transitionTimeoutRef.current = null;
        }, 240);

        return current;
      });
    }, 2600);

    return () => window.clearInterval(interval);
  }, [hov, roomImages.length]);

  useEffect(() => {
    const resetHandle = window.setTimeout(() => {
      setActiveImageIndex(0);
      setPendingImageIndex(null);
      setIsCrossfading(false);
    }, 0);

    return () => window.clearTimeout(resetHandle);
  }, [home.id]);

  useEffect(() => {
    return () => {
      if (transitionTimeoutRef.current != null) {
        window.clearTimeout(transitionTimeoutRef.current);
      }
    };
  }, []);

  return (
    <Link
      href={home.href}
      onClick={() => {
        void recordHostInteractionEvent({
          eventType: "profile_click",
          hostId: home.hostId ?? null,
          legacyFamilyId: home.legacyFamilyId ?? null,
          pagePath: typeof window !== "undefined" ? window.location.pathname : null,
          metadata: {
            homeId: home.id,
            title: home.listingTitle || home.name,
          },
        });
      }}
      onMouseEnter={() => {
        setHov(true);
        setPendingImageIndex(null);
        setIsCrossfading(false);
      }}
      onMouseLeave={() => {
        setHov(false);
        setPendingImageIndex(null);
        setIsCrossfading(false);
      }}
      style={{
        flex: "0 0 clamp(300px, 30vw, 430px)",
        width: "clamp(300px, 30vw, 430px)",
        minWidth: "clamp(300px, 30vw, 430px)",
        height: "clamp(198px, 20vw, 276px)",
        borderRadius: "22px",
        overflow: "hidden",
        textDecoration: "none",
        flexShrink: 0,
        position: "relative",
        padding: 0,
        transform: hov ? "scale(1.02) translateY(-3px)" : "scale(1) translateY(0)",
        boxShadow: hov
          ? "0 22px 50px rgba(15,23,42,0.18), 0 8px 18px rgba(26,86,219,0.1)"
          : "0 12px 32px rgba(15,23,42,0.08), 0 4px 12px rgba(26,86,219,0.06)",
        transition: "all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)",
        backgroundColor: "#0b1020",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: activeRoomImage
            ? `url(${activeRoomImage}) center 34% / cover no-repeat`
            : `linear-gradient(145deg, ${c1}, ${c2})`,
          pointerEvents: "none",
          transition: "opacity 240ms ease",
          opacity: isCrossfading ? 0 : 1,
        }}
      />
      {pendingImageIndex != null && incomingRoomImage ? (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: `url(${incomingRoomImage}) center 34% / cover no-repeat`,
            pointerEvents: "none",
            transition: "opacity 240ms ease",
            opacity: isCrossfading ? 1 : 0,
          }}
        />
      ) : null}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "linear-gradient(180deg, rgba(11,16,32,0) 0%, rgba(11,16,32,0.2) 40%, rgba(11,16,32,0.9) 100%)",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "linear-gradient(90deg, rgba(11,16,32,0.3) 0%, rgba(11,16,32,0) 40%)",
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          position: "absolute",
          inset: 0,
          padding: "18px 18px 20px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          zIndex: 1,
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px" }}>
          <div
            style={{
              width: "clamp(44px, 4.5vw, 64px)",
              height: "clamp(44px, 4.5vw, 64px)",
              borderRadius: "14px",
              overflow: "hidden",
              border: "2px solid rgba(255,255,255,0.9)",
              boxShadow: "0 6px 12px rgba(0,0,0,0.12)",
              background: `linear-gradient(135deg, ${c1}, ${c2})`,
              flexShrink: 0,
            }}
          >
            {hostPortrait ? (
              <img
                src={hostPortrait}
                alt={`${home.name} host`}
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
                  fontSize: "18px",
                  fontWeight: 800,
                }}
              >
                {home.name?.charAt(0)?.toUpperCase() || "F"}
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
            <Badge bg="rgba(0,0,0,0.3)" color="#fff">NEW</Badge>
            <Badge bg="rgba(5,150,105,0.9)" color="#fff">OPEN</Badge>
          </div>
        </div>

        <div style={{ marginTop: "auto", maxWidth: "100%" }}>
          <div
            style={{
              display: "grid",
              gap: "2px",
              color: "#fff",
              textShadow: "0 2px 10px rgba(0,0,0,0.4)",
              maxWidth: "100%",
            }}
          >
            {distance && (
              <div style={{ fontSize: "11px", fontWeight: 700, color: "#bfdbfe", letterSpacing: "0.05em", marginBottom: "4px" }}>
                {distance}
              </div>
            )}
            <div
              style={{
                fontSize: "clamp(18px, 1.6vw, 24px)",
                fontWeight: 800,
                lineHeight: 1.1,
                letterSpacing: "-0.01em",
                fontFamily: "'Inter', system-ui, sans-serif",
              }}
            >
              {home.name || home.listingTitle}
            </div>
            <div
              style={{
                fontSize: "12px",
                fontWeight: 600,
                color: "rgba(255,255,255,0.85)",
                letterSpacing: "0.01em",
              }}
            >
              {[home.village, home.city].filter(Boolean).join(", ") || home.state || "Location coming soon"}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "4px" }}>
              <div
                style={{
                  fontSize: "11px",
                  fontWeight: 700,
                  color: "#fff",
                  background: "rgba(255,255,255,0.15)",
                  backdropFilter: "blur(4px)",
                  padding: "3px 8px",
                  borderRadius: "6px",
                }}
              >
                {roomLabel}
              </div>
              <div
                style={{
                  fontSize: "16px",
                  fontWeight: 800,
                  color: "#fff",
                }}
              >
                {priceLabel}
              </div>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}
