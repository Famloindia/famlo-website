import Link from "next/link";

import { getHomepageData } from "@/lib/discovery";

export const dynamic = "force-dynamic";

export default async function HommiesPage(): Promise<React.JSX.Element> {
  const data = await getHomepageData();
  const companions = data.companions;

  return (
    <main className="shell" style={{ paddingTop: "40px", paddingBottom: "60px" }}>
      <section className="panel" style={{ padding: "clamp(24px, 4vw, 48px)", display: "grid", gap: "24px" }}>
        <div style={{ display: "grid", gap: "10px" }}>
          <span style={{ fontSize: "11px", fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: "#1A56DB" }}>
            Hommies
          </span>
          <h1 style={{ margin: 0 }}>Explore Hommies</h1>
          <p style={{ margin: 0, color: "#5A6A85", fontSize: "16px", maxWidth: "70ch" }}>
            Browse active local companions and city guides without landing on a missing route.
          </p>
        </div>

        {companions.length === 0 ? (
          <div className="panel" style={{ padding: "24px", borderRadius: "16px" }}>
            <p style={{ margin: 0, color: "#475569" }}>No active hommies are available right now.</p>
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: "18px",
            }}
          >
            {companions.map((companion) => (
              <Link
                key={companion.id}
                href={companion.href}
                style={{
                  textDecoration: "none",
                  color: "inherit",
                  background: "#fff",
                  border: "1px solid #E0E8F5",
                  borderRadius: "18px",
                  padding: "18px",
                  display: "grid",
                  gap: "10px",
                  boxShadow: "0 2px 20px rgba(26, 86, 219, 0.06)",
                }}
              >
                <div
                  style={{
                    width: "56px",
                    height: "56px",
                    borderRadius: "16px",
                    overflow: "hidden",
                    background: "#EFF6FF",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#1A56DB",
                    fontWeight: 800,
                    fontSize: "20px",
                  }}
                >
                  {companion.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={companion.imageUrl} alt={companion.title} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : (
                    companion.title.charAt(0)
                  )}
                </div>
                <div>
                  <h2 style={{ margin: 0, fontSize: "20px" }}>{companion.title}</h2>
                  <p style={{ margin: "4px 0 0", color: "#64748B" }}>
                    {[companion.city, companion.state].filter(Boolean).join(", ") || "India"}
                  </p>
                </div>
                <div style={{ fontSize: "14px", color: "#334155" }}>
                  {companion.description || "Local connection and hosted experiences on Famlo."}
                </div>
                <div style={{ fontSize: "13px", fontWeight: 700, color: "#1A56DB" }}>
                  Open profile →
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
