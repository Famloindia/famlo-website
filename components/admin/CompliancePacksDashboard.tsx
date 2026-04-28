"use client";

import type { CSSProperties } from "react";
import { useState } from "react";

export default function CompliancePacksDashboard() {
  const [hostUserId, setHostUserId] = useState("");
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function generate(): Promise<void> {
    setMessage(null);
    setError(null);
    try {
      const url = `/api/admin/compliance/packs?hostUserId=${encodeURIComponent(hostUserId)}&year=${encodeURIComponent(year)}`;
      const response = await fetch(url);
      const html = await response.text();
      if (!response.ok) throw new Error(html || "Failed to generate compliance pack.");
      const preview = window.open("", "_blank");
      preview?.document.write(html);
      preview?.document.close();
      setMessage("Compliance pack generated in a new tab.");
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : "Failed to generate compliance pack.");
    }
  }

  return (
    <div style={{ display: "grid", gap: "18px", maxWidth: "720px" }}>
      <div>
        <h1 style={{ margin: 0, fontSize: "28px", fontWeight: 900, color: "white" }}>Annual Compliance Packs</h1>
        <p style={{ marginTop: 8, color: "rgba(255,255,255,0.45)", lineHeight: 1.7 }}>
          Generate annual host compliance and tax document packs with booking, payout, and tax totals in one file.
        </p>
      </div>
      <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "18px", padding: "18px", display: "grid", gap: "12px" }}>
        <input value={hostUserId} onChange={(event) => setHostUserId(event.target.value)} placeholder="Host user ID" style={inputStyle} />
        <input value={year} onChange={(event) => setYear(event.target.value)} placeholder="Year" style={inputStyle} />
        <button onClick={() => void generate()} style={buttonStyle}>Generate Pack</button>
        {message ? <div style={{ color: "#86efac" }}>{message}</div> : null}
        {error ? <div style={{ color: "#fecaca" }}>{error}</div> : null}
      </div>
    </div>
  );
}

const inputStyle: CSSProperties = {
  borderRadius: "12px",
  border: "1px solid rgba(255,255,255,0.1)",
  background: "rgba(2,6,23,0.6)",
  color: "white",
  padding: "12px 14px",
};

const buttonStyle: CSSProperties = {
  borderRadius: "12px",
  border: "none",
  padding: "12px 14px",
  background: "#166534",
  color: "white",
  fontWeight: 800,
  cursor: "pointer",
};
