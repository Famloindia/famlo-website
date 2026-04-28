"use client";

import { useMemo, useRef, useState } from "react";
import { recordHostInteractionEvent } from "@/lib/host-interactions";

interface HomeDetailGalleryProps {
  hostId?: string | null;
  legacyFamilyId?: string | null;
  imageUrls: string[];
  title: string;
  cityLabel: string;
  statusLabel: string;
}

export function HomeDetailGallery({
  hostId = null,
  legacyFamilyId = null,
  imageUrls,
  title,
  cityLabel,
  statusLabel: _statusLabel,
}: Readonly<HomeDetailGalleryProps>): React.JSX.Element {
  const images = useMemo(() => imageUrls.filter(Boolean), [imageUrls]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const touchStartX = useRef<number | null>(null);

  const openLightbox = (index: number) => {
    setLightboxIndex(index);
    void recordHostInteractionEvent({
      eventType: "gallery_open",
      hostId,
      legacyFamilyId,
      pagePath: typeof window !== "undefined" ? window.location.pathname : null,
      metadata: {
        imageIndex: index,
        title,
      },
    });
  };

  const moveImage = (direction: number) => {
    if (images.length < 2) return;
    setActiveIndex((current) => {
      const nextIndex = current + direction;
      if (nextIndex < 0) return images.length - 1;
      if (nextIndex >= images.length) return 0;
      return nextIndex;
    });
  };

  return (
    <div className="famlo-booking-hero home-detail-hero-grid">
      {images.length > 1 ? (
        <>
          <button
            aria-label="Previous image"
            onClick={() => moveImage(-1)}
            type="button"
            style={{
              position: "absolute",
              left: 18,
              top: 20,
              zIndex: 2,
              width: 42,
              height: 42,
              borderRadius: "50%",
              border: "none",
              background: "rgba(15,23,42,0.38)",
              color: "white",
              fontSize: 24,
              cursor: "pointer",
            }}
          >
            ‹
          </button>
          <button
            aria-label="Next image"
            onClick={() => moveImage(1)}
            type="button"
            style={{
              position: "absolute",
              right: 18,
              top: 20,
              zIndex: 2,
              width: 42,
              height: 42,
              borderRadius: "50%",
              border: "none",
              background: "rgba(15,23,42,0.38)",
              color: "white",
              fontSize: 24,
              cursor: "pointer",
            }}
          >
            ›
          </button>
        </>
      ) : null}

      <div
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
        style={{ position: "absolute", inset: 0 }}
      />

      <div className="famlo-hero-main">
        {images[activeIndex] ? <img onClick={() => openLightbox(activeIndex)} src={images[activeIndex]} alt={title} /> : null}
        <div className="famlo-hero-overlay famlo-hero-overlay-clean">
          <button onClick={() => openLightbox(activeIndex)} type="button">View all photos</button>
        </div>
      </div>

      <div className="home-detail-hero-floating">
        <span className="home-detail-kicker">Famlo homestay</span>
      </div>

      {images.length > 0 ? (
        null
      ) : null}

      {lightboxIndex != null && images[lightboxIndex] ? (
        <div className="home-detail-lightbox" onClick={() => setLightboxIndex(null)} role="presentation">
          <button className="home-detail-lightbox-close" onClick={() => setLightboxIndex(null)} type="button">×</button>
          <img
            src={images[lightboxIndex]}
            alt={`${title} full view`}
            onClick={(event) => event.stopPropagation()}
          />
          <div className="home-detail-lightbox-controls" onClick={(event) => event.stopPropagation()} role="presentation">
            <button onClick={() => setLightboxIndex((current) => current == null ? 0 : (current - 1 + images.length) % images.length)} type="button">Prev</button>
            <span>{lightboxIndex + 1}/{images.length}</span>
            <button onClick={() => setLightboxIndex((current) => current == null ? 0 : (current + 1) % images.length)} type="button">Next</button>
          </div>
        </div>
      ) : null}
      {images.length > 1 ? (
        <div className="home-detail-hero-count">
          <span>{activeIndex + 1}/{images.length}</span>
        </div>
      ) : null}
    </div>
  );
}
