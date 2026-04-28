"use client";

import { useEffect, useMemo, useState } from "react";

type TestimonialStory = {
  id: string;
  authorName: string;
  city: string | null;
  title: string | null;
  body: string;
  rating: number | null;
  isPublished: boolean;
  reviewStatus: string;
  featuredRank: number | null;
  guestConsentToFeature: boolean;
  stayHighlight: string | null;
  experienceTags: string[];
  createdAt: string;
  hostName: string | null;
  hostCity: string | null;
  hostState: string | null;
  imageUrls: string[];
};

type TestimonialPayload = {
  counts: {
    pending: number;
    approved: number;
    featured: number;
    hidden: number;
  };
  stories: TestimonialStory[];
};

const FILTERS = ["all", "pending", "approved", "featured", "hidden"] as const;

export default function TestimonialsDesk(): React.JSX.Element {
  const [data, setData] = useState<TestimonialPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<(typeof FILTERS)[number]>("pending");
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load(): Promise<void> {
    setError(null);
    const response = await fetch("/api/admin/testimonials");
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error ?? "Failed to load testimonials desk.");
    setData(payload);
  }

  useEffect(() => {
    void load().catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Failed to load testimonials desk."));
  }, []);

  const stories = useMemo(() => {
    if (!data) return [];
    if (activeFilter === "all") return data.stories;
    if (activeFilter === "featured") return data.stories.filter((story) => story.featuredRank != null);
    return data.stories.filter((story) => story.reviewStatus === activeFilter);
  }, [activeFilter, data]);

  async function takeAction(storyId: string, action: string): Promise<void> {
    setBusyId(storyId);
    setError(null);
    try {
      const response = await fetch("/api/admin/testimonials", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storyId, action }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Failed to update testimonial.");
      await load();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Failed to update testimonial.");
    } finally {
      setBusyId(null);
    }
  }

  if (error && !data) {
    return <div style={{ color: "#fecaca" }}>{error}</div>;
  }

  if (!data) {
    return <div style={{ color: "rgba(255,255,255,0.55)" }}>Loading testimonials desk...</div>;
  }

  return (
    <div style={{ display: "grid", gap: "18px" }}>
      <div>
        <h1 style={{ margin: 0, fontSize: "28px", fontWeight: 900, color: "white" }}>Testimonials Desk</h1>
        <p style={{ marginTop: 8, color: "rgba(255,255,255,0.45)", lineHeight: 1.7 }}>
          Review guest stories, approve website-ready testimonials, and choose which ones get featured across Famlo.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: "14px" }}>
        {[
          ["Pending review", data.counts.pending],
          ["Approved", data.counts.approved],
          ["Featured", data.counts.featured],
          ["Hidden", data.counts.hidden],
        ].map(([label, value]) => (
          <section key={String(label)} style={{ background: "rgba(255,255,255,0.04)", borderRadius: "18px", padding: "18px", border: "1px solid rgba(255,255,255,0.08)" }}>
            <div style={{ fontSize: "11px", fontWeight: 800, color: "rgba(255,255,255,0.45)", textTransform: "uppercase" }}>{label}</div>
            <div style={{ marginTop: 8, color: "white", fontSize: "28px", fontWeight: 900 }}>{value}</div>
          </section>
        ))}
      </div>

      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
        {FILTERS.map((filter) => (
          <button
            key={filter}
            type="button"
            onClick={() => setActiveFilter(filter)}
            style={{
              padding: "10px 14px",
              borderRadius: "999px",
              border: activeFilter === filter ? "1px solid rgba(96,165,250,0.8)" : "1px solid rgba(255,255,255,0.12)",
              background: activeFilter === filter ? "rgba(59,130,246,0.14)" : "rgba(255,255,255,0.04)",
              color: "white",
              fontWeight: 800,
              textTransform: "capitalize",
              cursor: "pointer",
            }}
          >
            {filter}
          </button>
        ))}
      </div>

      {error ? <div style={{ color: "#fecaca", fontWeight: 700 }}>{error}</div> : null}

      <div style={{ display: "grid", gap: "14px" }}>
        {stories.map((story) => (
          <article key={story.id} style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.03))", borderRadius: "22px", padding: "20px", border: "1px solid rgba(255,255,255,0.08)", display: "grid", gap: "14px" }}>
            {story.imageUrls.length > 0 ? (
              <div style={{ display: "grid", gap: 10 }}>
                <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 4 }} className="hide-scroll">
                  {story.imageUrls.slice(0, 3).map((url) => (
                    <img
                      key={url}
                      src={url}
                      alt={story.title || story.authorName}
                      style={{
                        width: 140,
                        height: 96,
                        objectFit: "cover",
                        borderRadius: 14,
                        border: "1px solid rgba(255,255,255,0.08)",
                        flex: "0 0 auto",
                        background: "rgba(255,255,255,0.04)",
                      }}
                    />
                  ))}
                </div>
              </div>
            ) : null}
            <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
              <div style={{ display: "grid", gap: 6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                  <span style={{ color: "white", fontWeight: 900, fontSize: "18px" }}>{story.title || "Untitled story"}</span>
                  <span style={{ padding: "6px 10px", borderRadius: "999px", background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.8)", fontSize: "11px", fontWeight: 800, textTransform: "uppercase" }}>
                    {story.reviewStatus}
                  </span>
                  {story.featuredRank != null ? (
                    <span style={{ padding: "6px 10px", borderRadius: "999px", background: "rgba(245,158,11,0.14)", color: "#fde68a", fontSize: "11px", fontWeight: 800 }}>
                      Featured #{story.featuredRank}
                    </span>
                  ) : null}
                </div>
                <div style={{ color: "rgba(255,255,255,0.5)", fontSize: "13px" }}>
                  {story.authorName}
                  {story.city ? ` · ${story.city}` : ""}
                  {story.hostName ? ` · for ${story.hostName}` : ""}
                  {story.hostCity || story.hostState ? ` · ${[story.hostCity, story.hostState].filter(Boolean).join(", ")}` : ""}
                </div>
              </div>
              <div style={{ color: "rgba(255,255,255,0.5)", fontSize: "12px" }}>
                {new Date(story.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                {story.rating ? ` · ${story.rating}/5` : ""}
              </div>
            </div>

            {story.stayHighlight ? <div style={{ color: "#bfdbfe", fontWeight: 700 }}>{story.stayHighlight}</div> : null}
            <p style={{ margin: 0, color: "rgba(255,255,255,0.82)", lineHeight: 1.7 }}>{story.body}</p>

            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              {story.experienceTags.map((tag) => (
                <span key={tag} style={{ padding: "6px 10px", borderRadius: "999px", background: "rgba(16,185,129,0.12)", color: "#bbf7d0", fontSize: "11px", fontWeight: 800 }}>
                  {tag}
                </span>
              ))}
              <span style={{ padding: "6px 10px", borderRadius: "999px", background: story.guestConsentToFeature ? "rgba(59,130,246,0.14)" : "rgba(239,68,68,0.12)", color: story.guestConsentToFeature ? "#bfdbfe" : "#fecaca", fontSize: "11px", fontWeight: 800 }}>
                {story.guestConsentToFeature ? "Feature consented" : "No feature consent"}
              </span>
            </div>

            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <button className="button-like" disabled={busyId === story.id} type="button" onClick={() => void takeAction(story.id, "approve")}>
                {busyId === story.id ? "Saving..." : "Approve & publish"}
              </button>
              <button className="button-like" disabled={busyId === story.id} type="button" style={{ background: "#b45309" }} onClick={() => void takeAction(story.id, story.featuredRank != null ? "unfeature" : "feature")}>
                {story.featuredRank != null ? "Remove feature" : "Feature on site"}
              </button>
              <button className="button-like" disabled={busyId === story.id} type="button" style={{ background: "#475569" }} onClick={() => void takeAction(story.id, "hide")}>
                Hide
              </button>
              <button className="button-like" disabled={busyId === story.id} type="button" style={{ background: "#991b1b" }} onClick={() => void takeAction(story.id, "reject")}>
                Reject
              </button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
