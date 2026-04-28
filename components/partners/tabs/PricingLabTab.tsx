"use client";

import type { CSSProperties } from "react";
import { useEffect, useState } from "react";

export default function PricingLabTab({ hostId }: { hostId: string }) {
  const [suggestions, setSuggestions] = useState<Array<{ slotKey: string; currentPrice: number; suggestedPrice: number; confidence: string; reason: string }>>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!hostId) return;
    fetch(`/api/host/pricing/suggestions?hostId=${encodeURIComponent(hostId)}`)
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? "Failed to load pricing suggestions.");
        if (!cancelled) setSuggestions(payload.suggestions ?? []);
      })
      .catch((loadError) => {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Failed to load pricing suggestions.");
      });
    return () => {
      cancelled = true;
    };
  }, [hostId]);

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <section style={panelStyle}>
        <h2 style={{ margin: 0, fontSize: 24, fontWeight: 900, color: "#0e2b57" }}>Smart Pricing Suggestions</h2>
        <p style={{ margin: 0, color: "rgba(14,43,87,0.65)", lineHeight: 1.7 }}>
          Famlo looks at recent bookings and slot demand to suggest cleaner price moves you can review before changing rates.
        </p>
      </section>
      {error ? <div style={{ color: "#b91c1c" }}>{error}</div> : null}
      {(suggestions ?? []).map((suggestion) => (
        <section key={suggestion.slotKey} style={panelStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
            <strong style={{ fontSize: 18, color: "#0e2b57", textTransform: "capitalize" }}>{suggestion.slotKey}</strong>
            <span style={{ fontSize: 12, fontWeight: 800, color: "#165dcc", textTransform: "uppercase" }}>{suggestion.confidence} confidence</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12 }}>
            <div style={metricStyle}><div>Current</div><strong>INR {suggestion.currentPrice}</strong></div>
            <div style={metricStyle}><div>Suggested</div><strong>INR {suggestion.suggestedPrice}</strong></div>
          </div>
          <p style={{ margin: 0, color: "#475569" }}>{suggestion.reason}</p>
        </section>
      ))}
    </div>
  );
}

const panelStyle: CSSProperties = {
  background: "rgba(255,255,255,0.84)",
  borderRadius: 24,
  padding: 24,
  border: "1px solid rgba(14,43,87,0.08)",
  display: "grid",
  gap: 14,
};
const metricStyle: CSSProperties = {
  padding: "14px 16px",
  borderRadius: 16,
  background: "#f8fafc",
  display: "grid",
  gap: 6,
  color: "#475569",
};
