"use client";

import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useEffect, useState } from "react";

type HostGalleryViewerProps = {
  title: string;
  images: string[];
};

export function HostGalleryViewer({ title, images }: Readonly<HostGalleryViewerProps>): React.JSX.Element | null {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [touchEndX, setTouchEndX] = useState<number | null>(null);

  const safeImages = images.filter((image) => typeof image === "string" && image.trim().length > 0);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
      if (event.key === "ArrowLeft") setIndex((current) => (safeImages.length > 0 ? (current - 1 + safeImages.length) % safeImages.length : current));
      if (event.key === "ArrowRight") setIndex((current) => (safeImages.length > 0 ? (current + 1) % safeImages.length : current));
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, safeImages.length]);

  useEffect(() => {
    if (index >= safeImages.length) setIndex(0);
  }, [index, safeImages.length]);

  if (safeImages.length === 0) return null;

  const goPrev = () => setIndex((current) => (current - 1 + safeImages.length) % safeImages.length);
  const goNext = () => setIndex((current) => (current + 1) % safeImages.length);

  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px" }}>
        {safeImages.map((url, i) => (
          <button
            key={`${url}-${i}`}
            type="button"
            onClick={() => {
              setIndex(i);
              setOpen(true);
            }}
            style={{
              width: "100%",
              aspectRatio: "1 / 1",
              padding: 0,
              borderRadius: "16px",
              overflow: "hidden",
              border: "1px solid #e5e7eb",
              background: "#f8fafc",
              cursor: "pointer",
              display: "block",
            }}
            aria-label={`Open ${title} gallery image ${i + 1}`}
          >
            <img src={url} alt={`${title} gallery ${i + 1}`} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          </button>
        ))}
      </div>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${title} gallery`}
          onClick={() => setOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            background: "rgba(15, 23, 42, 0.82)",
            display: "grid",
            placeItems: "center",
            padding: "20px",
          }}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            onTouchStart={(event) => {
              setTouchStartX(event.touches[0]?.clientX ?? null);
              setTouchEndX(null);
            }}
            onTouchMove={(event) => setTouchEndX(event.touches[0]?.clientX ?? null)}
            onTouchEnd={() => {
              if (touchStartX == null || touchEndX == null) return;
              const diff = touchStartX - touchEndX;
              if (Math.abs(diff) > 40) {
                if (diff > 0) goNext();
                else goPrev();
              }
              setTouchStartX(null);
              setTouchEndX(null);
            }}
            style={{
              width: "min(96vw, 980px)",
              maxHeight: "88vh",
              display: "grid",
              gridTemplateColumns: "1fr",
              gap: "14px",
              alignItems: "center",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", color: "#fff" }}>
              <div style={{ fontSize: "14px", fontWeight: 800 }}>{title} Gallery</div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                style={{
                  width: "40px",
                  height: "40px",
                  borderRadius: "999px",
                  border: "none",
                  background: "rgba(255,255,255,0.14)",
                  color: "#fff",
                  cursor: "pointer",
                }}
                aria-label="Close gallery"
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ position: "relative", borderRadius: "24px", overflow: "hidden", background: "#0f172a", boxShadow: "0 24px 80px rgba(0, 0, 0, 0.35)" }}>
              <img
                src={safeImages[index] || safeImages[0] || ""}
                alt={`${title} gallery ${index + 1}`}
                style={{ width: "100%", height: "min(72vh, 720px)", objectFit: "cover", display: "block" }}
              />
              {safeImages.length > 1 ? (
                <>
                  <button
                    type="button"
                    onClick={goPrev}
                    style={{
                      position: "absolute",
                      left: "14px",
                      top: "50%",
                      transform: "translateY(-50%)",
                      width: "44px",
                      height: "44px",
                      borderRadius: "999px",
                      border: "none",
                      background: "rgba(255,255,255,0.16)",
                      color: "#fff",
                      cursor: "pointer",
                    }}
                    aria-label="Previous image"
                  >
                    <ChevronLeft size={22} />
                  </button>
                  <button
                    type="button"
                    onClick={goNext}
                    style={{
                      position: "absolute",
                      right: "14px",
                      top: "50%",
                      transform: "translateY(-50%)",
                      width: "44px",
                      height: "44px",
                      borderRadius: "999px",
                      border: "none",
                      background: "rgba(255,255,255,0.16)",
                      color: "#fff",
                      cursor: "pointer",
                    }}
                    aria-label="Next image"
                  >
                    <ChevronRight size={22} />
                  </button>
                </>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
