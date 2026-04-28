"use client";

import { useEffect, useState } from "react";

type OpsResponse = {
  syncMetrics: Record<string, number>;
  notificationMetrics: Record<string, number>;
  conflictMetrics: Record<string, number>;
  payoutMetrics: Record<string, number>;
  documentMetrics: { generated: number; latestTypes: string[] };
};

export default function PlatformOpsDashboard() {
  const [data, setData] = useState<OpsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/ops/reporting")
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? "Failed to load ops reporting.");
        if (!cancelled) setData(payload);
      })
      .catch((loadError) => {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Failed to load ops reporting.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return <div style={{ color: "#fecaca" }}>{error}</div>;
  }

  if (!data) {
    return <div style={{ color: "rgba(255,255,255,0.55)" }}>Loading platform ops dashboard...</div>;
  }

  const cards = [
    { label: "Sync Runs", value: data.syncMetrics.totalRuns },
    { label: "Sync Failures", value: data.syncMetrics.failedRuns },
    { label: "Queued Notifications", value: data.notificationMetrics.queued },
    { label: "Open Conflicts", value: data.conflictMetrics.open },
    { label: "Scheduled Payout INR", value: data.payoutMetrics.scheduledAmount },
    { label: "Documents Generated", value: data.documentMetrics.generated },
  ];

  return (
    <div style={{ display: "grid", gap: "18px" }}>
      <div>
        <h1 style={{ margin: 0, fontSize: "28px", fontWeight: 900, color: "white" }}>Platform Ops Dashboard</h1>
        <p style={{ marginTop: 8, color: "rgba(255,255,255,0.45)", lineHeight: 1.7 }}>
          Unified operations visibility for calendar sync, notifications, payout state, document generation, and conflict risk.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: "14px" }}>
        {cards.map((card) => (
          <div key={card.label} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "18px", padding: "18px" }}>
            <div style={{ fontSize: "11px", fontWeight: 800, color: "rgba(255,255,255,0.45)", textTransform: "uppercase" }}>{card.label}</div>
            <div style={{ marginTop: 8, color: "white", fontSize: "28px", fontWeight: 900 }}>{card.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gap: "14px", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))" }}>
        <section style={{ background: "rgba(255,255,255,0.04)", borderRadius: "18px", padding: "18px", border: "1px solid rgba(255,255,255,0.08)" }}>
          <h2 style={{ margin: 0, color: "white", fontSize: "18px" }}>Sync Health</h2>
          <p style={{ color: "rgba(255,255,255,0.5)" }}>Events seen: {data.syncMetrics.eventsSeen} · Applied: {data.syncMetrics.eventsApplied} · Conflicts: {data.syncMetrics.conflictsFound}</p>
        </section>
        <section style={{ background: "rgba(255,255,255,0.04)", borderRadius: "18px", padding: "18px", border: "1px solid rgba(255,255,255,0.08)" }}>
          <h2 style={{ margin: 0, color: "white", fontSize: "18px" }}>Document Types</h2>
          <p style={{ color: "rgba(255,255,255,0.5)" }}>{data.documentMetrics.latestTypes.join(", ") || "No documents yet."}</p>
        </section>
      </div>
    </div>
  );
}
