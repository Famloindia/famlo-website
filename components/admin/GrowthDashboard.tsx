"use client";

import { useEffect, useState } from "react";

import type { GrowthOverview } from "@/lib/growth-reporting";

function formatINR(value: number): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value);
}

function formatCompactINR(value: number): string {
  return new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

type Card = {
  label: string;
  value: string;
  tone?: string;
  hint?: string;
};

export default function GrowthDashboard(): React.JSX.Element {
  const [data, setData] = useState<GrowthOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/growth/overview")
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? "Failed to load growth dashboard.");
        if (!cancelled) setData(payload);
      })
      .catch((loadError) => {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Failed to load growth dashboard.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return <div style={{ color: "#fecaca" }}>{error}</div>;
  }

  if (!data) {
    return <div style={{ color: "rgba(255,255,255,0.55)" }}>Loading growth dashboard...</div>;
  }

  const cards: Card[] = [
    { label: "Paid bookings", value: String(data.headline.paidBookings), hint: `${data.headline.totalBookings} total created` },
    { label: "Monthly GMV", value: formatCompactINR(data.headline.currentMonthGMV), hint: `${data.headline.monthOnMonthGMVPct >= 0 ? "+" : ""}${data.headline.monthOnMonthGMVPct}% vs last month` },
    { label: "Total GMV", value: formatCompactINR(data.headline.totalGMV) },
    { label: "Repeat guest rate", value: `${data.headline.repeatGuestRate}%`, hint: `${data.headline.repeatGuests}/${data.headline.activeGuests} guests` },
    { label: "Live host rate", value: `${data.headline.liveHostRate}%`, hint: `${data.headline.liveHosts}/${data.headline.totalHosts} hosts live` },
    { label: "Published stories", value: String(data.headline.publishedStories), hint: `${data.headline.pendingStories} pending review` },
  ];

  const maxTrendValue = Math.max(1, ...data.monthlyTrend.map((entry) => entry.gmv));

  return (
    <div style={{ display: "grid", gap: "18px" }}>
      <div>
        <h1 style={{ margin: 0, fontSize: "28px", fontWeight: 900, color: "white" }}>Growth Dashboard</h1>
        <p style={{ marginTop: 8, color: "rgba(255,255,255,0.45)", lineHeight: 1.7 }}>
          Roadmap-facing visibility for bookings, monthly GMV, repeat guests, host activation, and social proof.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: "14px" }}>
        {cards.map((card) => (
          <section
            key={card.label}
            style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.03))", borderRadius: "18px", padding: "18px", border: "1px solid rgba(255,255,255,0.08)" }}
          >
            <div style={{ fontSize: "11px", fontWeight: 800, color: "rgba(255,255,255,0.45)", textTransform: "uppercase" }}>{card.label}</div>
            <div style={{ marginTop: 8, color: "white", fontSize: "30px", fontWeight: 900 }}>{card.value}</div>
            {card.hint ? <div style={{ marginTop: 8, color: "rgba(255,255,255,0.45)", fontSize: "12px" }}>{card.hint}</div> : null}
          </section>
        ))}
      </div>

      <div style={{ display: "grid", gap: "14px", gridTemplateColumns: "1.4fr 1fr" }}>
        <section style={{ background: "rgba(255,255,255,0.04)", borderRadius: "18px", padding: "20px", border: "1px solid rgba(255,255,255,0.08)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "baseline", marginBottom: "14px" }}>
            <h2 style={{ margin: 0, color: "white", fontSize: "18px" }}>GMV trend</h2>
            <span style={{ color: "rgba(255,255,255,0.45)", fontSize: "12px" }}>Last 6 months</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(6,minmax(0,1fr))", gap: "10px", alignItems: "end", minHeight: "240px" }}>
            {data.monthlyTrend.map((entry) => (
              <div key={entry.key} style={{ display: "grid", gap: "10px", alignItems: "end" }}>
                <div title={`${entry.label}: ${formatINR(entry.gmv)}`} style={{ height: `${Math.max(18, (entry.gmv / maxTrendValue) * 180)}px`, borderRadius: "14px 14px 8px 8px", background: "linear-gradient(180deg, #60a5fa, #1d4ed8)" }} />
                <div style={{ color: "white", fontSize: "12px", fontWeight: 700 }}>{entry.label}</div>
                <div style={{ color: "rgba(255,255,255,0.45)", fontSize: "11px" }}>{formatCompactINR(entry.gmv)}</div>
              </div>
            ))}
          </div>
        </section>

        <section style={{ background: "rgba(255,255,255,0.04)", borderRadius: "18px", padding: "20px", border: "1px solid rgba(255,255,255,0.08)", display: "grid", gap: "14px" }}>
          <div>
            <h2 style={{ margin: 0, color: "white", fontSize: "18px" }}>Roadmap progress</h2>
            <p style={{ marginTop: 8, color: "rgba(255,255,255,0.45)", lineHeight: 1.6 }}>Live progress against the nearest commercial milestones in the roadmap PDF.</p>
          </div>
          {data.roadmapProgress.map((item) => (
            <div key={item.label} style={{ display: "grid", gap: "6px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", color: "white", fontSize: "13px", fontWeight: 700 }}>
                <span>{item.label}</span>
                <span>{item.unit === "INR" ? formatCompactINR(item.current) : `${item.current} ${item.unit}`}</span>
              </div>
              <div style={{ height: "10px", borderRadius: "999px", background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
                <div style={{ width: `${item.percent}%`, height: "100%", borderRadius: "inherit", background: "linear-gradient(90deg, #f59e0b, #f97316)" }} />
              </div>
              <div style={{ color: "rgba(255,255,255,0.4)", fontSize: "11px" }}>Target: {item.unit === "INR" ? formatINR(item.target) : `${item.target} ${item.unit}`}</div>
            </div>
          ))}
        </section>
      </div>

      <div style={{ display: "grid", gap: "14px", gridTemplateColumns: "1.05fr 1fr 1fr" }}>
        <section style={{ background: "rgba(255,255,255,0.04)", borderRadius: "18px", padding: "20px", border: "1px solid rgba(255,255,255,0.08)" }}>
          <h2 style={{ margin: 0, color: "white", fontSize: "18px" }}>Top cities</h2>
          <div style={{ display: "grid", gap: "10px", marginTop: "14px" }}>
            {data.cityPerformance.map((city) => (
              <div key={city.city} style={{ display: "grid", gridTemplateColumns: "1.2fr .8fr .8fr", gap: "10px", alignItems: "center", color: "white" }}>
                <div>
                  <div style={{ fontWeight: 800 }}>{city.city}</div>
                  <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.45)" }}>{city.bookings} bookings</div>
                </div>
                <div style={{ fontWeight: 700 }}>{formatCompactINR(city.gmv)}</div>
                <div style={{ color: "rgba(255,255,255,0.55)", fontSize: "12px" }}>{city.guests} guests</div>
              </div>
            ))}
          </div>
        </section>

        <section style={{ background: "rgba(255,255,255,0.04)", borderRadius: "18px", padding: "20px", border: "1px solid rgba(255,255,255,0.08)" }}>
          <h2 style={{ margin: 0, color: "white", fontSize: "18px" }}>Booking mix</h2>
          <div style={{ display: "grid", gap: "12px", marginTop: "14px" }}>
            <div style={{ padding: "14px", borderRadius: "16px", background: "rgba(59,130,246,0.12)", border: "1px solid rgba(96,165,250,0.22)" }}>
              <div style={{ color: "#bfdbfe", fontSize: "11px", fontWeight: 800, textTransform: "uppercase" }}>Host stays</div>
              <div style={{ marginTop: 6, color: "white", fontWeight: 900, fontSize: "26px" }}>{data.bookingMix.hostStay}</div>
            </div>
            <div style={{ padding: "14px", borderRadius: "16px", background: "rgba(16,185,129,0.12)", border: "1px solid rgba(52,211,153,0.22)" }}>
              <div style={{ color: "#a7f3d0", fontSize: "11px", fontWeight: 800, textTransform: "uppercase" }}>Hommie sessions</div>
              <div style={{ marginTop: 6, color: "white", fontWeight: 900, fontSize: "26px" }}>{data.bookingMix.hommieSession}</div>
            </div>
          </div>
        </section>

        <section style={{ background: "rgba(255,255,255,0.04)", borderRadius: "18px", padding: "20px", border: "1px solid rgba(255,255,255,0.08)" }}>
          <h2 style={{ margin: 0, color: "white", fontSize: "18px" }}>Funnel health</h2>
          <div style={{ display: "grid", gap: "10px", marginTop: "14px" }}>
            {[
              ["Awaiting payment", data.funnel.awaitingPayment],
              ["Confirmed", data.funnel.confirmed],
              ["Active stays", data.funnel.active],
              ["Completed", data.funnel.completed],
              ["Lost / cancelled", data.funnel.lost],
            ].map(([label, value]) => (
              <div key={String(label)} style={{ display: "flex", justifyContent: "space-between", gap: "12px", color: "white", padding: "12px 14px", borderRadius: "14px", background: "rgba(255,255,255,0.03)" }}>
                <span style={{ color: "rgba(255,255,255,0.72)" }}>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
