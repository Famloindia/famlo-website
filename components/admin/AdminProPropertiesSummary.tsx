import type { CSSProperties } from "react";
import Link from "next/link";

export type AdminProPropertySummaryRow = {
  familyId: string;
  familyName: string;
  locationLabel: string;
  famloPlusStatus: string;
  channexPropertyId: string | null;
  channelAttached: boolean;
  channelActive: boolean;
  activeChannelTitle: string | null;
  activeChannelId: string | null;
  providerAccountConfigured: boolean;
  ariHealthLabel: string;
  feedHealthLabel: string;
  unackedRevisionsCount: number;
  failedImportCount: number;
  pendingManualReviewCount: number;
  failedSyncJobsCount: number;
  pendingSyncJobsCount: number;
  latestSuccessfulSyncAt: string | null;
  recentWebhookIssuesCount: number;
  criticalConflictsCount: number;
  goLiveReadiness: "Ready" | "Needs attention" | "Not ready";
  readinessReason: string;
  roomMappingReady: boolean;
  rateMappingReady: boolean;
  bookingProofCompleted: boolean;
  cancellationProofCompleted: boolean;
  modificationWorkflowAvailable: boolean;
  possibleStagingIssue: boolean;
};

type AdminProSummaryCards = {
  connectedProperties: number;
  mappedRooms: number;
  otaConnectedProperties: number;
  failedSyncJobs: number;
  pendingSyncJobs: number;
  recentRevisionIssues: number;
  lastSuccessfulSyncAt: string | null;
  providerLabel: string;
};

function formatDateTime(value: string | null): string {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function toneColor(readiness: AdminProPropertySummaryRow["goLiveReadiness"]): string {
  if (readiness === "Ready") return "#16a34a";
  if (readiness === "Needs attention") return "#d97706";
  return "#dc2626";
}

function pillStyle(color: string, muted = false): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "5px 10px",
    borderRadius: 999,
    fontSize: "11px",
    fontWeight: 800,
    color,
    background: muted ? "rgba(255,255,255,0.04)" : `${color}18`,
    border: `1px solid ${muted ? "rgba(255,255,255,0.08)" : `${color}40`}`,
  };
}

export default function AdminProPropertiesSummary({
  rows,
  summary,
  diagnostics = [],
  executionDisabledReason = null,
}: {
  rows: AdminProPropertySummaryRow[];
  summary: AdminProSummaryCards;
  diagnostics?: string[];
  executionDisabledReason?: string | null;
}) {
  return (
    <div style={{ display: "grid", gap: "20px" }}>
      <section
        style={{
          background: "#ffffff",
          borderRadius: "24px",
          border: "1px solid #e2e8f0",
          padding: "24px",
          boxShadow: "0 18px 40px -24px rgba(15,23,42,0.2)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: "16px", alignItems: "flex-start", marginBottom: "18px" }}>
          <div>
            <h2 style={{ margin: 0, fontSize: "22px", fontWeight: 900, color: "#0f172a" }}>Pro Channel Health Summary</h2>
            <p style={{ margin: "8px 0 0", fontSize: "13px", color: "#64748b", lineHeight: 1.6 }}>
              Read-only operator view for all Famlo Pro properties using Channex metadata, mapping readiness, booking proof, and current health state.
            </p>
          </div>
          <span style={pillStyle("#1d4ed8")}>{rows.length} properties</span>
        </div>

        {executionDisabledReason ? (
          <div style={{ marginBottom: "16px", borderRadius: "16px", border: "1px solid rgba(251,191,36,0.35)", background: "#fff7ed", color: "#9a3412", padding: "14px 16px", fontSize: "13px", fontWeight: 700 }}>
            Sync execution disabled: {executionDisabledReason}
          </div>
        ) : null}

        {diagnostics.length > 0 ? (
          <div style={{ marginBottom: "16px", borderRadius: "16px", border: "1px solid rgba(59,130,246,0.18)", background: "#eff6ff", color: "#1d4ed8", padding: "14px 16px", fontSize: "13px", fontWeight: 700 }}>
            Partial channel diagnostics: {diagnostics.join(" · ")}
          </div>
        ) : null}

        <div style={{ display: "grid", gap: "12px", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", marginBottom: "18px" }}>
          {[
            { label: "Connected properties", value: String(summary.connectedProperties), detail: `${summary.providerLabel} attached and healthy` },
            { label: "Mapped rooms", value: String(summary.mappedRooms), detail: "Families with room mapping readiness" },
            { label: "OTA accounts", value: String(summary.otaConnectedProperties), detail: "Provider accounts marked connected" },
            { label: "Failed sync jobs", value: String(summary.failedSyncJobs), detail: "Recent failed job records" },
            { label: "Pending sync jobs", value: String(summary.pendingSyncJobs), detail: "Queued or processing sync jobs" },
            { label: "Revision issues", value: String(summary.recentRevisionIssues), detail: "Unacked/manual review/webhook issues" },
            { label: "Last successful sync", value: formatDateTime(summary.lastSuccessfulSyncAt), detail: "Best available property/log signal" },
          ].map((card) => (
            <div key={card.label} style={{ background: "#ffffff", borderRadius: "14px", padding: "12px 14px", border: "1px solid #e2e8f0" }}>
              <div style={{ fontSize: "10px", fontWeight: 900, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em" }}>{card.label}</div>
              <div style={{ fontSize: "16px", fontWeight: 900, color: "#0f172a", marginTop: "8px" }}>{card.value}</div>
              <div style={{ fontSize: "12px", color: "#64748b", marginTop: "4px" }}>{card.detail}</div>
            </div>
          ))}
        </div>

        <div style={{ display: "grid", gap: "16px" }}>
          {rows.map((row) => {
            const readinessColor = toneColor(row.goLiveReadiness);
            const proBase = `/partnerslogin/home/pro/dashboard?family=${row.familyId}`;

            return (
              <article
                key={row.familyId}
                style={{
                  border: "1px solid #e2e8f0",
                  borderRadius: "20px",
                  padding: "18px",
                  background: "#f8fafc",
                  display: "grid",
                  gap: "14px",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: "16px", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontSize: "18px", fontWeight: 900, color: "#0f172a" }}>{row.familyName}</div>
                    <div style={{ fontSize: "12px", color: "#64748b", marginTop: "4px" }}>
                      {row.locationLabel} · family_id {row.familyId}
                    </div>
                    <div style={{ fontSize: "12px", color: "#475569", marginTop: "6px" }}>
                      Channex property: {row.channexPropertyId ?? "Missing"} · Famlo+ {row.famloPlusStatus}
                    </div>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", justifyContent: "flex-end" }}>
                    <span style={pillStyle(readinessColor)}>{row.goLiveReadiness}</span>
                    <span style={pillStyle(row.channelAttached && row.channelActive ? "#16a34a" : "#dc2626")}>
                      {row.channelAttached && row.channelActive ? "Channel healthy" : "Channel disconnected"}
                    </span>
                    <span style={pillStyle(row.providerAccountConfigured ? "#16a34a" : "#d97706")}>
                      {row.providerAccountConfigured ? "Provider account connected" : "Provider account missing"}
                    </span>
                    <span style={pillStyle(row.criticalConflictsCount === 0 ? "#16a34a" : "#dc2626")}>
                      Critical conflicts: {row.criticalConflictsCount}
                    </span>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px" }}>
                  <div style={{ background: "#ffffff", borderRadius: "14px", padding: "12px 14px", border: "1px solid #e2e8f0" }}>
                    <div style={{ fontSize: "10px", fontWeight: 900, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em" }}>Channel</div>
                    <div style={{ fontSize: "13px", fontWeight: 800, color: "#0f172a", marginTop: "6px" }}>{row.activeChannelTitle ?? "Not visible"}</div>
                    <div style={{ fontSize: "12px", color: "#64748b", marginTop: "4px" }}>id {row.activeChannelId ?? "Missing"}</div>
                  </div>
                  <div style={{ background: "#ffffff", borderRadius: "14px", padding: "12px 14px", border: "1px solid #e2e8f0" }}>
                    <div style={{ fontSize: "10px", fontWeight: 900, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em" }}>ARI health</div>
                    <div style={{ fontSize: "13px", fontWeight: 800, color: "#0f172a", marginTop: "6px" }}>{row.ariHealthLabel}</div>
                    <div style={{ fontSize: "12px", color: "#64748b", marginTop: "4px" }}>
                      {row.channelAttached && row.channelActive ? "Rolling 365-day sync ready" : "Safe skip on detached channel"}
                    </div>
                  </div>
                  <div style={{ background: "#ffffff", borderRadius: "14px", padding: "12px 14px", border: "1px solid #e2e8f0" }}>
                    <div style={{ fontSize: "10px", fontWeight: 900, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em" }}>Feed health</div>
                    <div style={{ fontSize: "13px", fontWeight: 800, color: "#0f172a", marginTop: "6px" }}>{row.feedHealthLabel}</div>
                    <div style={{ fontSize: "12px", color: "#64748b", marginTop: "4px" }}>
                      Unacked {row.unackedRevisionsCount} · Failed imports {row.failedImportCount}
                    </div>
                  </div>
                  <div style={{ background: "#ffffff", borderRadius: "14px", padding: "12px 14px", border: "1px solid #e2e8f0" }}>
                    <div style={{ fontSize: "10px", fontWeight: 900, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em" }}>Manual review</div>
                    <div style={{ fontSize: "13px", fontWeight: 800, color: "#0f172a", marginTop: "6px" }}>{row.pendingManualReviewCount}</div>
                    <div style={{ fontSize: "12px", color: "#64748b", marginTop: "4px" }}>
                      {row.modificationWorkflowAvailable ? "Modification workflow available" : "No proved modification workflow yet"}
                    </div>
                  </div>
                  <div style={{ background: "#ffffff", borderRadius: "14px", padding: "12px 14px", border: "1px solid #e2e8f0" }}>
                    <div style={{ fontSize: "10px", fontWeight: 900, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em" }}>Sync jobs</div>
                    <div style={{ fontSize: "13px", fontWeight: 800, color: "#0f172a", marginTop: "6px" }}>
                      Failed {row.failedSyncJobsCount} · Pending {row.pendingSyncJobsCount}
                    </div>
                    <div style={{ fontSize: "12px", color: "#64748b", marginTop: "4px" }}>
                      Last success {formatDateTime(row.latestSuccessfulSyncAt)}
                    </div>
                  </div>
                  <div style={{ background: "#ffffff", borderRadius: "14px", padding: "12px 14px", border: "1px solid #e2e8f0" }}>
                    <div style={{ fontSize: "10px", fontWeight: 900, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em" }}>Revision issues</div>
                    <div style={{ fontSize: "13px", fontWeight: 800, color: "#0f172a", marginTop: "6px" }}>{row.recentWebhookIssuesCount}</div>
                    <div style={{ fontSize: "12px", color: "#64748b", marginTop: "4px" }}>
                      Recent webhook or booking revision failures
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                  <span style={pillStyle(row.roomMappingReady ? "#16a34a" : "#d97706")}>Room mapping {row.roomMappingReady ? "ready" : "missing"}</span>
                  <span style={pillStyle(row.rateMappingReady ? "#16a34a" : "#d97706")}>Rate mapping {row.rateMappingReady ? "ready" : "missing"}</span>
                  <span style={pillStyle(row.bookingProofCompleted ? "#16a34a" : "#d97706")}>Booking proof {row.bookingProofCompleted ? "done" : "pending"}</span>
                  <span style={pillStyle(row.cancellationProofCompleted ? "#16a34a" : "#d97706")}>Cancellation proof {row.cancellationProofCompleted ? "done" : "pending"}</span>
                  <span style={pillStyle(row.modificationWorkflowAvailable ? "#16a34a" : "#d97706")}>Modification workflow {row.modificationWorkflowAvailable ? "available" : "pending"}</span>
                </div>

                <div style={{ fontSize: "13px", color: "#334155", lineHeight: 1.6 }}>
                  {row.readinessReason}
                  {row.possibleStagingIssue ? " This can happen with shared Booking.com staging test ids, so keep Famlo blocked until the channel is healthy again." : ""}
                </div>

                <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
                  <Link href={proBase} style={{ ...pillStyle("#1d4ed8"), textDecoration: "none" }}>Open Pro dashboard</Link>
                  <Link href={`${proBase}&section=connected-channels`} style={{ ...pillStyle("#1d4ed8", true), textDecoration: "none" }}>Connected Channels</Link>
                  <Link href={`${proBase}&section=conflicts`} style={{ ...pillStyle("#1d4ed8", true), textDecoration: "none" }}>Conflict Center</Link>
                  <Link href={`${proBase}&section=bookings`} style={{ ...pillStyle("#1d4ed8", true), textDecoration: "none" }}>Bookings</Link>
                  <Link href={`${proBase}&section=sync-logs`} style={{ ...pillStyle("#1d4ed8", true), textDecoration: "none" }}>Sync Logs</Link>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
