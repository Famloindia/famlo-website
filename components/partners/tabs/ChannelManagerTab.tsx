"use client";

import type { CSSProperties } from "react";
import { useEffect, useState } from "react";

type ChannelManagerTabProps = {
  ownerId: string;
  ownerType?: "host" | "stay_unit";
  title?: string;
  description?: string;
};

export default function ChannelManagerTab({
  ownerId,
  ownerType = "host",
  title,
  description,
}: Readonly<ChannelManagerTabProps>) {
  const [data, setData] = useState<any>(null);
  const [externalUrl, setExternalUrl] = useState("");
  const [provider, setProvider] = useState("airbnb");
  const [label, setLabel] = useState("Airbnb");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const panelTitle = title ?? (ownerType === "stay_unit" ? "Room Calendar & ICS" : "Multi-channel Reservations");
  const panelDescription =
    description ??
    (ownerType === "stay_unit"
      ? "Connect Google Calendar, Airbnb, or Booking.com feeds for this room. Imports and exports stay attached to the room only."
      : "Connect Airbnb, Booking.com, and Google ICS feeds here. Famlo will log every sync and flag overlaps for review.");

  async function load() {
    const response = await fetch(
      `/api/host/channel-manager?ownerType=${encodeURIComponent(ownerType)}&ownerId=${encodeURIComponent(ownerId)}`
    );
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error ?? "Failed to load channel manager.");
    setData(payload);
  }

  useEffect(() => {
    if (!ownerId) return;
    void load().catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Failed to load channel manager."));
  }, [ownerId, ownerType]);

  async function syncByUrl() {
    try {
      setMessage(null);
      setError(null);
      const response = await fetch("/api/host/channel-manager", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ownerType, ownerId, provider, sourceLabel: label, externalUrl }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Failed to sync channel.");
      setMessage(`Synced ${payload.applied} event(s), ${payload.conflicts} conflict(s).`);
      await load();
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : "Failed to sync channel.");
    }
  }

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <section style={panelStyle}>
        <h2 style={{ margin: 0, fontSize: 24, fontWeight: 900, color: "#0e2b57" }}>{panelTitle}</h2>
        <p style={{ margin: 0, color: "rgba(14,43,87,0.65)", lineHeight: 1.7 }}>
          {panelDescription}
        </p>
        <div style={{ display: "grid", gap: 10 }}>
          <input value={provider} onChange={(event) => setProvider(event.target.value)} placeholder="Provider" style={inputStyle} />
          <input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Source label" style={inputStyle} />
          <input value={externalUrl} onChange={(event) => setExternalUrl(event.target.value)} placeholder="External ICS URL" style={inputStyle} />
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button onClick={() => void syncByUrl()} style={buttonStyle}>Connect and Sync</button>
            {data?.exportUrl ? (
              <a href={data.exportUrl} target="_blank" rel="noreferrer" className={""} style={{ ...buttonStyle, background: "#165dcc", textDecoration: "none" }}>
                {ownerType === "stay_unit" ? "Export Room Calendar" : "Export Famlo Calendar"}
              </a>
            ) : null}
          </div>
        </div>
        {message ? <div style={{ color: "#15803d", fontWeight: 700 }}>{message}</div> : null}
        {error ? <div style={{ color: "#b91c1c", fontWeight: 700 }}>{error}</div> : null}
      </section>

      <section style={panelStyle}>
        <h3 style={sectionHeading}>Connections</h3>
        {(data?.connections ?? []).map((connection: any) => (
          <div key={connection.id} style={rowStyle}>
            <strong>{connection.source_label}</strong>
            <span>{connection.provider} · {connection.last_sync_status}</span>
          </div>
        ))}
      </section>

      <section style={panelStyle}>
        <h3 style={sectionHeading}>Conflicts</h3>
        {(data?.conflicts ?? []).map((conflict: any) => (
          <div key={conflict.id} style={rowStyle}>
            <strong>{conflict.status}</strong>
            <span>{conflict.summary}</span>
          </div>
        ))}
      </section>
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
const inputStyle: CSSProperties = {
  borderRadius: 12,
  border: "1px solid rgba(14,43,87,0.15)",
  padding: "12px 14px",
  background: "white",
};
const buttonStyle: CSSProperties = {
  borderRadius: 999,
  border: "none",
  padding: "12px 18px",
  background: "#0e2b57",
  color: "white",
  fontWeight: 800,
  cursor: "pointer",
};
const rowStyle: CSSProperties = {
  padding: "12px 14px",
  borderRadius: 16,
  background: "#f8fafc",
  display: "grid",
  gap: 4,
};
const sectionHeading: CSSProperties = { margin: 0, fontSize: 16, fontWeight: 900, color: "#0e2b57" };
