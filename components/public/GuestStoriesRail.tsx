"use client";

import { useMemo, useState } from "react";

type StoryCard = {
  id: string;
  title: string;
  authorName: string;
  fromCity: string;
  storyText: string;
  imageUrls: string[];
  rating: number | null;
  createdAt: string;
};

function toPreviewUrl(url: string): string {
  return url.replace(/-full\.webp$/i, "-preview.webp");
}

export function GuestStoriesRail({
  hostName,
  stories,
}: Readonly<{
  hostName: string;
  stories: StoryCard[];
}>): React.JSX.Element {
  const [visibleCount, setVisibleCount] = useState(4);
  const [selectedImageUrl, setSelectedImageUrl] = useState<string | null>(null);
  const visibleStories = useMemo(() => stories.slice(0, visibleCount), [stories, visibleCount]);
  const canShowMore = visibleCount < stories.length;

  return (
    <>
      <section
        style={{
          background: "#fff",
          borderRadius: "24px",
          border: "1px solid #e2e8f0",
          padding: "22px",
          boxShadow: "0 10px 40px -10px rgba(0,0,0,0.06)",
          display: "grid",
          gap: "16px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px", flexWrap: "wrap" }}>
          <div>
            <h2 style={{ fontSize: "20px", fontWeight: 800, margin: 0, fontFamily: "'DM Sans', sans-serif" }}>Guest Stories</h2>
            <p style={{ margin: "6px 0 0", color: "#64748b", fontSize: "13px", fontWeight: 600 }}>
              Stories shared by guests who stayed with {hostName}.
            </p>
          </div>
          <span style={{ fontSize: "12px", fontWeight: 800, color: "#1d4ed8", background: "#eff6ff", border: "1px solid #bfdbfe", padding: "6px 10px", borderRadius: "999px" }}>
            {stories.length} stor{stories.length === 1 ? "y" : "ies"}
          </span>
        </div>

        <div
          style={{
            display: "grid",
            gridAutoFlow: "column",
            gridAutoColumns: "minmax(280px, 360px)",
            gap: "16px",
            overflowX: "auto",
            paddingBottom: "6px",
            scrollSnapType: "x proximity",
          }}
        >
          {visibleStories.map((story) => (
            <article
              key={story.id}
              style={{
                borderRadius: "18px",
                border: "1px solid #e2e8f0",
                background: "#f8fbff",
                padding: "18px",
                display: "grid",
                gap: "12px",
                scrollSnapAlign: "start",
                minHeight: "100%",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", alignItems: "flex-start" }}>
                <div style={{ display: "grid", gap: "4px" }}>
                  <div style={{ fontSize: "16px", fontWeight: 800, color: "#0f172a" }}>{story.title || "Guest story"}</div>
                  <div style={{ fontSize: "14px", fontWeight: 700, color: "#1e293b" }}>{story.authorName}</div>
                  <div style={{ fontSize: "12px", fontWeight: 700, color: "#64748b" }}>
                    {story.fromCity || "India"} {story.createdAt ? `· ${new Date(story.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}` : ""}
                  </div>
                </div>
                <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "13px", fontWeight: 800, color: "#92400E", background: "#FEF3C7", border: "1px solid #FDE68A", padding: "6px 10px", borderRadius: "999px" }}>
                  <span>{story.rating != null ? story.rating.toFixed(1) : "Guest story"}</span>
                  {story.rating != null ? <span style={{ color: "#F59E0B" }}>★</span> : null}
                </div>
              </div>

              {story.imageUrls.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setSelectedImageUrl(story.imageUrls[0] ?? null)}
                  style={{
                    width: "100%",
                    border: "none",
                    background: "transparent",
                    padding: 0,
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <div style={{ width: "100%", aspectRatio: "4 / 3", borderRadius: "16px", overflow: "hidden", background: "#e2e8f0" }}>
                    <img
                      src={toPreviewUrl(story.imageUrls[0] ?? "")}
                      alt={story.title || story.authorName}
                      loading="lazy"
                      decoding="async"
                      style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                    />
                  </div>
                </button>
              ) : null}

              <p style={{ margin: 0, color: "#334155", fontSize: "14px", lineHeight: 1.7, fontWeight: 500 }}>
                {story.storyText}
              </p>
            </article>
          ))}
        </div>

        {canShowMore ? (
          <div style={{ display: "flex", justifyContent: "center" }}>
            <button
              type="button"
              onClick={() => setVisibleCount((current) => Math.min(current + 4, stories.length))}
              style={{
                border: "1px solid #bfdbfe",
                background: "#eff6ff",
                color: "#1d4ed8",
                fontSize: "13px",
                fontWeight: 800,
                padding: "10px 16px",
                borderRadius: "999px",
                cursor: "pointer",
              }}
            >
              See more stories
            </button>
          </div>
        ) : null}
      </section>

      {selectedImageUrl ? (
        <button
          type="button"
          onClick={() => setSelectedImageUrl(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,23,42,0.82)",
            border: "none",
            padding: "24px",
            display: "grid",
            placeItems: "center",
            zIndex: 1200,
            cursor: "pointer",
          }}
        >
          <img
            src={selectedImageUrl}
            alt="Guest story"
            style={{ maxWidth: "min(92vw, 1100px)", maxHeight: "88vh", borderRadius: "20px", objectFit: "contain", boxShadow: "0 24px 80px rgba(0,0,0,0.35)" }}
          />
        </button>
      ) : null}
    </>
  );
}
