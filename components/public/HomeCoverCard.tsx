"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { recordHostInteractionEvent } from "@/lib/host-interactions";
import type { HomeCardRecord } from "@/lib/discovery";
import { toSupabaseImageUrl } from "@/lib/supabase-image";

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

function ProgressiveImage({
  src,
  alt,
  priority = false,
  objectPosition = "center 34%",
  style,
}: Readonly<{
  src: string;
  alt: string;
  priority?: boolean;
  objectPosition?: string;
  style?: React.CSSProperties;
}>): React.JSX.Element {
  const [isLoaded, setIsLoaded] = useState(false);
  const highResSrc = toSupabaseImageUrl(src, { width: 1200, quality: 82 });

  useEffect(() => {
    setIsLoaded(false);
  }, [src]);

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        ...style,
      }}
    >
      <img
        alt={alt}
        src={highResSrc}
        loading={priority ? "eager" : "lazy"}
        decoding="async"
        fetchPriority={priority ? "high" : "low"}
        onLoad={() => setIsLoaded(true)}
        onError={() => setIsLoaded(true)}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          objectPosition,
          opacity: 1,
          transition: "opacity 320ms ease",
        }}
      />
    </div>
  );
}

export function HomeCoverCard({
  home,
  roomImageUrlsOverride = null,
  roomCountOverride = null,
  suppressHomeFallback = false,
}: Readonly<{
  home: HomeCardRecord;
  roomImageUrlsOverride?: string[] | null;
  roomCountOverride?: number | null;
  suppressHomeFallback?: boolean;
}>): React.JSX.Element {
  const [hov, setHov] = useState(false);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [pendingImageIndex, setPendingImageIndex] = useState<number | null>(null);
  const [isCrossfading, setIsCrossfading] = useState(false);
  const transitionTimeoutRef = useRef<number | null>(null);
  const touchStartX = useRef<number | null>(null);

  const [c1, c2] = pal(home.id);
  const isLive = home.isActive && home.isAccepting;
  const roomImagesSource = roomImageUrlsOverride ?? home.roomImageUrls;
  const roomImages = Array.isArray(roomImagesSource)
    ? roomImagesSource.filter((image): image is string => Boolean(image && image.trim().length > 0))
    : [];
  const fallbackImages = home.imageUrls.filter((image): image is string => Boolean(image && image.trim().length > 0));
  const displayImages = roomImages.length > 0 ? roomImages : (suppressHomeFallback ? [] : fallbackImages);
  const activeRoomImage = displayImages[activeImageIndex] || "";
  const incomingRoomImage = pendingImageIndex != null ? displayImages[pendingImageIndex] || "" : "";
  const hostPortrait = home.hostPhotoUrl || "";
  const roomCountToDisplay = roomCountOverride != null && roomCountOverride > 0
    ? roomCountOverride
    : home.roomCount != null && home.roomCount > 0
      ? home.roomCount
      : null;
  const roomLabel = roomCountToDisplay != null
    ? `${roomCountToDisplay} room${roomCountToDisplay > 1 ? "s" : ""}`
    : "Rooms available";
  const displayPrice = home.startingRoomPrice || [home.priceMorning, home.priceAfternoon, home.priceEvening, home.priceFullday].find((price) => price > 0) || 0;
  const priceLabel = displayPrice > 0 ? `₹${displayPrice.toLocaleString("en-IN")} / room` : "Price set by host";

  const moveImage = (direction: number) => {
    if (displayImages.length < 2) return;
    setActiveImageIndex((current) => {
      const nextIndex = current + direction;
      if (nextIndex < 0) return displayImages.length - 1;
      if (nextIndex >= displayImages.length) return 0;
      return nextIndex;
    });
  };

  useEffect(() => {
    if (!hov || displayImages.length < 2) return;

    const interval = window.setInterval(() => {
      setActiveImageIndex((current) => {
        const nextIndex = (current + 1) % displayImages.length;
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
    }, 1000);

    return () => window.clearInterval(interval);
  }, [displayImages.length, hov]);

  useEffect(() => {
    setActiveImageIndex(0);
    setPendingImageIndex(null);
    setIsCrossfading(false);
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
        flex: "0 0 min(100%, clamp(250px, 26vw, 340px))",
        width: "min(100%, clamp(250px, 26vw, 340px))",
        minWidth: "min(100%, clamp(250px, 26vw, 340px))",
        height: "clamp(185px, 20vw, 250px)",
        borderRadius: "22px",
        overflow: "hidden",
        textDecoration: "none",
        flexShrink: 0,
        position: "relative",
        padding: 0,
        transform: "none",
        boxShadow: hov
          ? isLive
            ? "0 18px 40px rgba(15,23,42,0.2)"
            : "0 18px 40px rgba(71,85,105,0.18)"
          : isLive
            ? "0 8px 24px rgba(15,23,42,0.08)"
            : "0 8px 24px rgba(100,116,139,0.1)",
        transition: "box-shadow 180ms ease",
        backgroundColor: isLive ? "#0b1020" : "#cbd5e1",
      }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
          }}
          onTouchStart={(event) => {
            touchStartX.current = event.touches[0]?.clientX ?? null;
          }}
          onTouchEnd={(event) => {
            const endX = event.changedTouches[0]?.clientX ?? null;
            if (touchStartX.current == null || endX == null) return;
            const delta = endX - touchStartX.current;
            if (Math.abs(delta) < 24) return;
            moveImage(delta < 0 ? 1 : -1);
            touchStartX.current = null;
          }}
        >
          {activeRoomImage ? (
            <ProgressiveImage
              src={activeRoomImage}
              alt={`${home.listingTitle || home.name} room`}
              priority={activeImageIndex === 0}
              style={{
                transition: "opacity 240ms ease",
                opacity: isCrossfading ? 0 : 1,
                filter: isLive ? "none" : "grayscale(1) saturate(0.35) brightness(0.9)",
                pointerEvents: "none",
              }}
            />
          ) : (
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: `linear-gradient(145deg, ${c1}, ${c2})`,
                pointerEvents: "none",
              }}
            />
          )}
          {pendingImageIndex != null && incomingRoomImage ? (
            <ProgressiveImage
              src={incomingRoomImage}
              alt={`${home.listingTitle || home.name} room`}
              style={{
                transition: "opacity 240ms ease",
                opacity: isCrossfading ? 1 : 0,
                filter: isLive ? "none" : "grayscale(1) saturate(0.35) brightness(0.9)",
                pointerEvents: "none",
              }}
            />
          ) : null}
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: isLive
                ? "linear-gradient(180deg, rgba(11,16,32,0) 0%, rgba(11,16,32,0.2) 40%, rgba(11,16,32,0.9) 100%)"
                : "linear-gradient(180deg, rgba(100,116,139,0) 0%, rgba(100,116,139,0.18) 40%, rgba(71,85,105,0.88) 100%)",
              pointerEvents: "none",
            }}
          />
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: isLive
                ? "linear-gradient(90deg, rgba(11,16,32,0.3) 0%, rgba(11,16,32,0) 40%)"
                : "linear-gradient(90deg, rgba(71,85,105,0.24) 0%, rgba(71,85,105,0) 40%)",
              pointerEvents: "none",
            }}
          />
        </div>

        <div
          style={{
            position: "absolute",
            inset: 0,
            padding: "14px 14px 16px",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            zIndex: 1,
          }}
        >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px" }}>
          <div
            style={{
              width: "clamp(38px, 3.5vw, 48px)",
              height: "clamp(38px, 3.5vw, 48px)",
              borderRadius: "14px",
              overflow: "hidden",
              border: "2px solid rgba(255,255,255,0.92)",
              boxShadow: "0 6px 16px rgba(0,0,0,0.18)",
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
            <Badge bg={isLive ? "rgba(255,255,255,0.18)" : "rgba(148,163,184,0.35)"} color="#fff">
              NEW
            </Badge>
            <Badge bg={isLive ? "rgba(16,185,129,0.92)" : "rgba(100,116,139,0.92)"} color="#fff">
              {isLive ? "OPEN" : "CLOSED"}
            </Badge>
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
            <div
              style={{
              fontSize: "clamp(18px, 2vw, 26px)",
              fontWeight: 900,
              lineHeight: 1.05,
              letterSpacing: "-0.02em",
              fontFamily: "'Inter', system-ui, sans-serif",
              opacity: isLive ? 1 : 0.92,
            }}
          >
            {home.listingTitle || home.name}
          </div>
            <div
              style={{
                fontSize: "clamp(11px, 0.95vw, 13px)",
                fontWeight: 600,
                color: "rgba(255,255,255,0.86)",
                letterSpacing: "0.01em",
              }}
            >
              {[home.village, home.city].filter(Boolean).join(", ") || home.state || "Location coming soon"}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "8px", flexWrap: "wrap" }}>
              <div
                style={{
                fontSize: "clamp(11px, 0.9vw, 12px)",
                fontWeight: 800,
                color: "#fff",
                background: "rgba(255,255,255,0.16)",
                backdropFilter: "blur(6px)",
                padding: "6px 10px",
                borderRadius: "10px",
                opacity: isLive ? 1 : 0.9,
              }}
              >
                {roomLabel}
              </div>
              <div
                style={{
                  fontSize: "clamp(16px, 1.55vw, 22px)",
                  fontWeight: 900,
                  color: "#fff",
                  lineHeight: 1.05,
                  opacity: isLive ? 1 : 0.92,
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
