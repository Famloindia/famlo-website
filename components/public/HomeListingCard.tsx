// components/public/HomeListingCard.tsx

"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { recordHostInteractionEvent } from "@/lib/host-interactions";

export type PublicHomeCardData = {
  id: string;
  slug: string;
  hostId?: string | null;
  legacyFamilyId?: string | null;
  name: string;
  listingTitle: string;
  hostName: string;
  city: string;
  state: string;
  locality: string;
  guests: number | null;
  quarterPrice: number | null;
  roomCount?: number | null;
  startingRoomPrice?: number | null;
  likedCount: number | null;
  storyCount: number | null;
  isActive: boolean;
  isAccepting: boolean;
  imageUrl: string;
  imageUrls: string[];
  hostPhotoUrl: string;
};

function formatLocation(locality: string, city: string, state: string): string {
  const publicLine = [locality, city].filter(Boolean).join(", ");
  if (publicLine) return publicLine;
  if (state) return state;
  return "Location coming soon";
}

function formatPrice(price: number | null): string {
  if (price === null) return "Price set by host";
  return `From ₹${price.toLocaleString("en-IN")} / room`;
}

function formatLikeCount(likedCount: number | null): string {
  if (!likedCount || likedCount < 1) return "Liked by 0 guests";
  return `Liked by ${likedCount} guest${likedCount === 1 ? "" : "s"}`;
}

export function HomeListingCard({
  home
}: Readonly<{ home: PublicHomeCardData }>): React.JSX.Element {
  const liveBadge = home.isActive && home.isAccepting;
  const imageUrls = home.imageUrls.length > 0 ? home.imageUrls : (home.imageUrl ? [home.imageUrl] : []);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const touchStartX = useRef<number | null>(null);
  const activeImageUrl = imageUrls[activeImageIndex] ?? "";
  const roomCountLabel = home.roomCount && home.roomCount > 0 ? home.roomCount : null;
  const startingPrice = home.startingRoomPrice ?? home.quarterPrice;

  const moveImage = (direction: number) => {
    if (imageUrls.length < 2) return;
    setActiveImageIndex((current) => {
      const nextIndex = current + direction;
      if (nextIndex < 0) return imageUrls.length - 1;
      if (nextIndex >= imageUrls.length) return 0;
      return nextIndex;
    });
  };

  const cardBody = (
    <article
      className={`panel detail-box home-listing-card ${liveBadge ? "is-live" : "is-closed"}`}
      style={{
        padding: "12px",
        overflow: "hidden",
        border: liveBadge ? "1px solid #1890ff" : "1px solid #cbd5e1",
        background: liveBadge ? "#1890ff" : "#e2e8f0",
        opacity: 1,
        transition: "transform 180ms ease, box-shadow 180ms ease",
        minHeight: "100%",
        borderRadius: "18px",
        boxShadow: liveBadge ? "0 18px 40px rgba(24, 144, 255, 0.2)" : "0 16px 32px rgba(15, 23, 42, 0.08)"
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(250px, 0.8fr) minmax(0, 1.8fr)",
          gap: "14px",
          alignItems: "stretch"
        }}
      >
        <div
          style={{
            background: "#1890ff",
            borderRadius: "14px",
            padding: "18px",
            display: "grid",
            gap: "18px",
            alignContent: "start",
            color: "white",
            minHeight: "100%"
          }}
        >
          <div
            style={{
              background: "rgba(255, 255, 255, 0.94)",
              borderRadius: "10px",
              padding: "14px",
              display: "grid",
              placeItems: "center",
              minHeight: "260px",
              overflow: "hidden"
            }}
          >
            {home.hostPhotoUrl ? (
              <img
                alt={`${home.name} host`}
                src={home.hostPhotoUrl}
                style={{
                  width: "100%",
                  height: "100%",
                  maxHeight: "250px",
                  objectFit: "cover",
                  borderRadius: "8px"
                }}
              />
            ) : (
              <div
                style={{
                  width: "100%",
                  height: "100%",
                  display: "grid",
                  placeItems: "center",
                  color: "#1890ff",
                  background: "linear-gradient(180deg, #ffffff, #f4f9ff)"
                }}
              >
                <div
                  style={{
                    width: "170px",
                    height: "170px",
                    borderRadius: "50%",
                    background: "linear-gradient(180deg, #1890ff, #1877d6)",
                    boxShadow: "inset 0 -18px 0 rgba(255,255,255,0.14)"
                  }}
                />
              </div>
            )}
          </div>

          <div style={{ display: "grid", gap: "8px", paddingInline: "10px 6px" }}>
            <div style={{ fontSize: "28px", fontWeight: 900, lineHeight: 1.04 }}>{home.hostName || home.name}</div>
            <div style={{ fontSize: "16px", fontWeight: 700, lineHeight: 1.2, opacity: 0.95 }}>{formatLocation(home.locality, home.city, home.state)}</div>
            <div style={{ fontSize: "16px", fontWeight: 700, lineHeight: 1.2 }}>
              Rooms count: {roomCountLabel ?? "Rooms available"}
            </div>
            <div style={{ fontSize: "16px", fontWeight: 800, lineHeight: 1.2 }}>Starting Price: {formatPrice(startingPrice)}</div>
          </div>
        </div>

        <div
          style={{
            background: "white",
            borderRadius: "14px",
            padding: "18px",
            display: "grid",
            gap: "16px",
            alignContent: "start",
            minHeight: "100%",
            position: "relative",
            overflow: "hidden"
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "12px",
              flexWrap: "wrap"
            }}
          >
            <div style={{ display: "grid", gap: "6px" }}>
              <div
                style={{
                  fontSize: "11px",
                  fontWeight: 900,
                  textTransform: "uppercase",
                  letterSpacing: "0.12em",
                  color: "#1890ff"
                }}
              >
                Property image
              </div>
              <h2 className="home-listing-title" style={{ margin: 0, fontSize: 24, color: "#1890ff" }}>
                {home.listingTitle || home.name}
              </h2>
            </div>

            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                background: liveBadge ? "rgba(236, 253, 245, 0.96)" : "rgba(254, 242, 242, 0.96)",
                color: liveBadge ? "#166534" : "#b91c1c",
                border: liveBadge ? "1px solid #86efac" : "1px solid #fecaca",
                padding: "8px 12px",
                borderRadius: 999,
                fontSize: 11,
                fontWeight: 900,
                letterSpacing: "0.06em",
                textTransform: "uppercase"
              }}
            >
              <span
                style={{
                  width: 9,
                  height: 9,
                  borderRadius: "50%",
                  background: liveBadge ? "#22c55e" : "#ef4444"
                }}
              />
              {liveBadge ? "Professional Active" : "Inactive"}
            </div>
          </div>

          <div
            style={{
              borderRadius: "12px",
              overflow: "hidden",
              background: "#f8fbff",
              minHeight: "330px",
              border: "1px solid rgba(24, 144, 255, 0.12)",
              display: "grid",
              placeItems: "center",
              position: "relative"
            }}
          >
            {activeImageUrl ? (
              <img
                alt={home.name}
                src={activeImageUrl}
                className="home-listing-card-image"
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
                style={{
                  width: "100%",
                  height: "100%",
                  minHeight: "330px",
                  objectFit: "cover",
                  display: "block"
                }}
              />
            ) : (
              <div
                style={{
                  width: "100%",
                  height: "100%",
                  minHeight: "330px",
                  display: "grid",
                  placeItems: "center",
                  color: "#1890ff",
                  fontSize: "56px",
                  fontWeight: 900
                }}
              >
                Property Image
              </div>
            )}

            {!liveBadge ? (
              <div
                className="home-listing-closed-overlay"
                style={{
                  position: "absolute",
                  inset: 0,
                  background: "linear-gradient(180deg, rgba(148, 163, 184, 0.18), rgba(15, 23, 42, 0.36))",
                  pointerEvents: "none"
                }}
              />
            ) : null}

            {imageUrls.length > 1 ? (
              <>
                <button
                  aria-label="Previous image"
                  className="home-listing-image-arrow home-listing-image-arrow-left"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    moveImage(-1);
                  }}
                  type="button"
                >
                  ‹
                </button>
                <button
                  aria-label="Next image"
                  className="home-listing-image-arrow home-listing-image-arrow-right"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    moveImage(1);
                  }}
                  type="button"
                >
                  ›
                </button>
                <div
                  className="home-listing-image-counter"
                  style={{
                    position: "absolute",
                    right: 14,
                    top: 14,
                    borderRadius: 999,
                    background: "rgba(24, 144, 255, 0.92)",
                    color: "white",
                    padding: "7px 11px",
                    fontSize: 12,
                    fontWeight: 800
                  }}
                >
                  {activeImageIndex + 1}/{imageUrls.length}
                </div>
                <div
                  style={{
                    position: "absolute",
                    left: 14,
                    bottom: 14,
                    borderRadius: 999,
                    background: "rgba(24, 144, 255, 0.92)",
                    color: "white",
                    padding: "6px 10px",
                    fontSize: 11,
                    fontWeight: 800
                  }}
                >
                  Swipe for more photos
                </div>
              </>
            ) : null}
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
              gap: "12px"
            }}
          >
            <div style={{ padding: "14px 16px", borderRadius: 16, background: "#f5faff", border: "1px solid #d9ecff" }}>
              <div className="eyebrow" style={{ color: "#1890ff", marginBottom: 8 }}>Guests</div>
              <p style={{ margin: 0, fontWeight: 800, color: "#0f172a" }}>{home.guests ? `${home.guests}` : "Flexible stay"}</p>
            </div>
            <div style={{ padding: "14px 16px", borderRadius: 16, background: "#f5faff", border: "1px solid #d9ecff" }}>
              <div className="eyebrow" style={{ color: "#1890ff", marginBottom: 8 }}>Stories</div>
              <p style={{ margin: 0, fontWeight: 800, color: "#0f172a" }}>{home.storyCount ?? 0} shared</p>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "end",
              gap: 12,
              flexWrap: "wrap"
            }}
          >
            <div className="home-listing-price-wrap">
              <div className="home-listing-liked" style={{ fontSize: 13, color: "#64748b", fontWeight: 700 }}>{formatLikeCount(home.likedCount)}</div>
              <div className="home-listing-price" style={{ marginTop: 4, fontSize: 18, fontWeight: 900, color: "#1890ff" }}>{formatPrice(startingPrice)}</div>
            </div>

            <span
              className="home-listing-cta"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "12px 16px",
                borderRadius: 14,
                background: liveBadge ? "#1890ff" : "#cbd5e1",
                color: liveBadge ? "white" : "#334155",
                fontWeight: 900,
                fontSize: 13
              }}
            >
              {liveBadge ? "View Home" : "Inactive"}
            </span>
          </div>
        </div>
      </div>
      </article>
  );

  if (!liveBadge) {
    return (
      <div
        aria-disabled="true"
        className="home-listing-link home-listing-link-disabled"
        style={{ textDecoration: "none", color: "inherit", cursor: "default" }}
      >
        {cardBody}
      </div>
    );
  }

  return (
    <Link
      href={`/host/${home.slug}`}
      className="home-listing-link"
      style={{ textDecoration: "none", color: "inherit" }}
      onClick={() => {
        void recordHostInteractionEvent({
          eventType: "profile_click",
          hostId: home.hostId ?? null,
          legacyFamilyId: home.legacyFamilyId ?? null,
          pagePath: typeof window !== "undefined" ? window.location.pathname : null,
          metadata: {
            slug: home.slug,
            title: home.listingTitle || home.name,
          },
        });
      }}
    >
      {cardBody}
    </Link>
  );
}
