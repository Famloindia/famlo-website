"use client";

import type { CSSProperties } from "react";
import { useEffect, useState } from "react";

type Connection = { id: string; provider: string; source_label: string; last_sync_status: string; last_synced_at: string | null };
type SyncLog = { id: string; provider: string; status: string; events_seen: number; events_applied: number; conflicts_found: number; started_at: string };
type Conflict = { id: string; summary: string; status: string; created_at: string };

export default function ChannelManagerConsole() {
  const [ownerId, setOwnerId] = useState("");
  const [sourceLabel, setSourceLabel] = useState("Airbnb");
  const [provider, setProvider] = useState("airbnb");
  const [externalUrl, setExternalUrl] = useState("");
  const [icsContent, setIcsContent] = useState("");
  const [data, setData] = useState<{ connections: Connection[]; syncLogs: SyncLog[]; conflicts: Conflict[]; exportUrl: string } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load(): Promise<void> {
    if (!ownerId) return;
    setError(null);
    const response = await fetch(`/api/host/channel-manager?ownerId=${encodeURIComponent(ownerId)}`);
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error ?? "Failed to load channel manager.");
    setData(payload);
  }

  async function sync(): Promise<void> {
    setMessage(null);
    setError(null);
    try {
      const response = await fetch("/api/host/channel-manager", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ownerId, provider, sourceLabel, externalUrl: externalUrl || null, icsContent: icsContent || null }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Failed to sync channel.");
      setMessage(`Sync completed: ${payload.applied} events applied, ${payload.conflicts} conflicts found.`);
      await load();
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : "Failed to sync channel.");
    }
  }

  useEffect(() => {
    if (!ownerId) return;
    void load();
  }, [ownerId]);

  return (
    <div style={{ display: "grid", gap: "18px" }}>
      <div>
        <h1 style={{ margin: 0, fontSize: "28px", fontWeight: 900, color: "white" }}>Channel Manager Console</h1>
        <p style={{ marginTop: 8, color: "rgba(255,255,255,0.45)", lineHeight: 1.7 }}>
          Manage imported Airbnb, Booking.com, or Google ICS feeds, watch sync logs, and review conflicts.
        </p>
      </div>

      <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "18px", padding: "18px", display: "grid", gap: "12px" }}>
        <input value={ownerId} onChange={(event) => setOwnerId(event.target.value)} placeholder="Host ID" style={inputStyle} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
          <input value={provider} onChange={(event) => setProvider(event.target.value)} placeholder="Provider" style={inputStyle} />
          <input value={sourceLabel} onChange={(event) => setSourceLabel(event.target.value)} placeholder="Source Label" style={inputStyle} />
        </div>
        <input value={externalUrl} onChange={(event) => setExternalUrl(event.target.value)} placeholder="External ICS URL" style={inputStyle} />
        <textarea value={icsContent} onChange={(event) => setIcsContent(event.target.value)} placeholder="Or paste ICS content here" style={{ ...inputStyle, minHeight: 120 }} />
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <button onClick={() => void sync()} style={buttonStyle}>Sync Channel</button>
          {data?.exportUrl ? <a href={data.exportUrl} target="_blank" rel="noreferrer" style={{ ...buttonStyle, textDecoration: "none", background: "#1d4ed8" }}>Export Famlo ICS</a> : null}
        </div>
        {message ? <div style={{ color: "#86efac" }}>{message}</div> : null}
        {error ? <div style={{ color: "#fecaca" }}>{error}</div> : null}
      </div>

      <section style={panelStyle}>
        <h2 style={headingStyle}>Connections</h2>
        {(data?.connections ?? []).map((connection) => (
          <div key={connection.id} style={rowStyle}>
            <strong>{connection.source_label}</strong>
            <span>{connection.provider} · {connection.last_sync_status}</span>
          </div>
        ))}
      </section>

      <section style={panelStyle}>
        <h2 style={headingStyle}>Recent Sync Logs</h2>
        {(data?.syncLogs ?? []).map((log) => (
          <div key={log.id} style={rowStyle}>
            <strong>{log.provider}</strong>
            <span>{log.status} · seen {log.events_seen} · applied {log.events_applied} · conflicts {log.conflicts_found}</span>
          </div>
        ))}
      </section>

      <section style={panelStyle}>
        <h2 style={headingStyle}>Conflicts</h2>
        {(data?.conflicts ?? []).map((conflict) => (
          <div key={conflict.id} style={rowStyle}>
            <strong>{conflict.status}</strong>
            <span>{conflict.summary}</span>
          </div>
        ))}
      </section>
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
  background: "#0f766e",
  color: "white",
  fontWeight: 800,
  cursor: "pointer",
};
const panelStyle: CSSProperties = {
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: "18px",
  padding: "18px",
  display: "grid",
  gap: "10px",
};
const rowStyle: CSSProperties = {
  display: "grid",
  gap: "4px",
  color: "rgba(255,255,255,0.7)",
  padding: "12px 14px",
  background: "rgba(2,6,23,0.35)",
  borderRadius: "14px",
};
const headingStyle: CSSProperties = { margin: 0, color: "white", fontSize: "18px" };
