"use client";

import type { CSSProperties } from "react";
import { useCallback, useEffect, useState } from "react";

type Connection = { id: string; provider: string; source_label: string; last_sync_status: string; last_synced_at: string | null };
type SyncLog = { id: string; provider: string; status: string; events_seen: number; events_applied: number; conflicts_found: number; started_at: string };
type Conflict = { id: string; summary: string; status: string; created_at: string };
type OpsReadiness = {
  generatedAt: string;
  severity: "healthy" | "warning" | "critical";
  readinessPercent: number;
  metrics: Record<string, number | null>;
  alerts: Array<{
    id: string;
    severity: "warning" | "critical";
    title: string;
    detail: string;
    metric: string;
    value: number;
    threshold: number;
  }>;
  recentDeadLetters: Array<{
    id: string;
    familyId: string | null;
    providerCode: string | null;
    jobType: string | null;
    lastError: string | null;
    updatedAt: string | null;
  }>;
  runbook: string[];
};

export default function ChannelManagerConsole() {
  const [ownerId, setOwnerId] = useState("");
  const [sourceLabel, setSourceLabel] = useState("Airbnb");
  const [provider, setProvider] = useState("airbnb");
  const [externalUrl, setExternalUrl] = useState("");
  const [icsContent, setIcsContent] = useState("");
  const [data, setData] = useState<{ connections: Connection[]; syncLogs: SyncLog[]; conflicts: Conflict[]; exportUrl: string } | null>(null);
  const [opsFamilyId, setOpsFamilyId] = useState("");
  const [opsReadiness, setOpsReadiness] = useState<OpsReadiness | null>(null);
  const [opsError, setOpsError] = useState<string | null>(null);
  const [opsLoading, setOpsLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    if (!ownerId) return;
    setError(null);
    const response = await fetch(`/api/host/channel-manager?ownerId=${encodeURIComponent(ownerId)}`);
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error ?? "Failed to load channel manager.");
    setData(payload);
  }, [ownerId]);

  const sync = useCallback(async (): Promise<void> => {
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
  }, [externalUrl, icsContent, load, ownerId, provider, sourceLabel]);

  useEffect(() => {
    if (!ownerId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- This effect intentionally refreshes remote channel-manager data when the selected owner changes.
    void load();
  }, [ownerId, load]);

  const loadOpsReadiness = useCallback(async (): Promise<void> => {
    setOpsLoading(true);
    setOpsError(null);
    try {
      const params = new URLSearchParams();
      params.set("lookbackHours", "24");
      if (opsFamilyId.trim()) params.set("familyId", opsFamilyId.trim());
      const response = await fetch(`/api/admin/channels/ops?${params.toString()}`, { cache: "no-store" });
      const payload = (await response.json()) as { ok?: boolean; readiness?: OpsReadiness; error?: string };
      if (!response.ok || !payload.readiness) {
        throw new Error(payload.error ?? "Failed to load Famlo Pro channel ops readiness.");
      }
      setOpsReadiness(payload.readiness);
    } catch (loadError) {
      setOpsError(loadError instanceof Error ? loadError.message : "Failed to load Famlo Pro channel ops readiness.");
    } finally {
      setOpsLoading(false);
    }
  }, [opsFamilyId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- This effect intentionally loads remote production ops health when the console opens.
    void loadOpsReadiness();
  }, [loadOpsReadiness]);

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
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div>
            <h2 style={headingStyle}>Famlo Pro Production Ops</h2>
            <p style={{ margin: "8px 0 0", color: "rgba(255,255,255,0.55)", lineHeight: 1.6 }}>
              Queue wait, dead letters, unacknowledged OTA revisions, webhook failures, dashboard load, and stale connected property signals.
            </p>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <input
              value={opsFamilyId}
              onChange={(event) => setOpsFamilyId(event.target.value)}
              placeholder="Optional Famlo Pro family ID"
              style={{ ...inputStyle, minWidth: 240 }}
            />
            <button type="button" onClick={() => void loadOpsReadiness()} style={buttonStyle} disabled={opsLoading}>
              {opsLoading ? "Loading..." : "Refresh Ops"}
            </button>
          </div>
        </div>

        {opsError ? <div style={{ color: "#fecaca" }}>{opsError}</div> : null}
        {opsReadiness ? (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 10 }}>
              {[
                ["Readiness", `${opsReadiness.readinessPercent}%`],
                ["Severity", opsReadiness.severity.toUpperCase()],
                ["Queue", String(opsReadiness.metrics.queueDepth ?? 0)],
                ["Due queue", String(opsReadiness.metrics.dueQueueDepth ?? 0)],
                ["Queue p95", formatDuration(opsReadiness.metrics.queueWaitP95Ms)],
                ["Dead letters", String(opsReadiness.metrics.deadLetteredJobs ?? 0)],
                ["Unacked OTA", String(opsReadiness.metrics.unackedAppliedRevisions ?? 0)],
                ["Dashboard p95", formatDuration(opsReadiness.metrics.dashboardClientP95Ms)],
              ].map(([label, value]) => (
                <div key={label} style={metricCardStyle}>
                  <span style={metricLabelStyle}>{label}</span>
                  <strong style={metricValueStyle}>{value}</strong>
                </div>
              ))}
            </div>

            {opsReadiness.alerts.length > 0 ? (
              <div style={{ display: "grid", gap: 10 }}>
                {opsReadiness.alerts.map((alert) => (
                  <div
                    key={alert.id}
                    style={{
                      ...rowStyle,
                      border: `1px solid ${alert.severity === "critical" ? "rgba(248,113,113,0.45)" : "rgba(251,191,36,0.45)"}`,
                    }}
                  >
                    <strong>{alert.severity.toUpperCase()} · {alert.title}</strong>
                    <span>{alert.detail}</span>
                    <span>{alert.metric}: {formatMetricValue(alert.value)} / threshold {formatMetricValue(alert.threshold)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div style={rowStyle}>
                <strong>Healthy</strong>
                <span>No production ops alerts in the selected lookback window.</span>
              </div>
            )}

            {opsReadiness.recentDeadLetters.length > 0 ? (
              <div style={{ display: "grid", gap: 10 }}>
                <h3 style={{ ...headingStyle, fontSize: 15 }}>Dead-letter Repair Queue</h3>
                {opsReadiness.recentDeadLetters.map((job) => (
                  <div key={job.id} style={rowStyle}>
                    <strong>{job.providerCode ?? "provider"} · {job.jobType ?? "job"}</strong>
                    <span>{job.familyId ?? "unknown family"} · {job.updatedAt ?? "unknown time"}</span>
                    <span>{job.lastError ?? "No last_error stored."}</span>
                  </div>
                ))}
              </div>
            ) : null}

            <div style={rowStyle}>
              <strong>Runbook</strong>
              <span>{opsReadiness.runbook.join(" → ")}</span>
            </div>
          </>
        ) : (
          <div style={{ color: "rgba(255,255,255,0.55)" }}>Loading Famlo Pro production ops readiness...</div>
        )}
      </section>

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
const metricCardStyle: CSSProperties = {
  background: "rgba(2,6,23,0.4)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: "14px",
  padding: "12px",
  display: "grid",
  gap: "6px",
};
const metricLabelStyle: CSSProperties = {
  color: "rgba(255,255,255,0.45)",
  fontSize: "11px",
  fontWeight: 800,
  textTransform: "uppercase",
};
const metricValueStyle: CSSProperties = {
  color: "white",
  fontSize: "22px",
  fontWeight: 900,
};

function formatDuration(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "n/a";
  if (value < 1000) return `${Math.round(value)}ms`;
  if (value < 60_000) return `${(value / 1000).toFixed(1)}s`;
  return `${Math.round(value / 60_000)}m`;
}

function formatMetricValue(value: number): string {
  if (!Number.isFinite(value)) return "n/a";
  if (value > 1000) return formatDuration(value);
  if (value > 0 && value < 1) return `${Math.round(value * 100)}%`;
  return String(Math.round(value));
}
