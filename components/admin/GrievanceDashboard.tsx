"use client";

import { useState } from "react";
import { FileText, Clock, AlertTriangle, CheckCircle2, Loader2, User } from "lucide-react";

interface Grievance {
  id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  complaint_type: string;
  description: string;
  status: "filed" | "acknowledged" | "in_progress" | "resolved";
  acknowledged_at: string | null;
  sla_deadline: string | null;
  resolved_at: string | null;
  assigned_to: string | null;
  created_at: string;
  hours_to_sla?: number;
}

interface GrievanceDashboardProps {
  grievances: Grievance[];
  adminId: string;
}

function slaStatus(g: Grievance) {
  if (!g.sla_deadline) return { label: "No SLA", color: "#64748b" };
  const now = Date.now();
  const deadline = new Date(g.sla_deadline).getTime();
  const hoursLeft = (deadline - now) / 3600000;

  if (g.status === "resolved") return { label: "Resolved", color: "#22c55e" };
  if (hoursLeft < 0) return { label: "SLA BREACHED", color: "#ef4444", urgent: true };
  if (hoursLeft < 24) return { label: `${Math.round(hoursLeft)}h left`, color: "#f59e0b", urgent: true };
  const daysLeft = Math.round(hoursLeft / 24);
  return { label: `${daysLeft}d left`, color: "#86efac" };
}

const STATUS_LABELS: Record<string, string> = {
  filed: "Filed", acknowledged: "Acknowledged", in_progress: "In Progress", resolved: "Resolved"
};

const COMPLAINT_TYPES = [
  "Payment Issue", "Booking Dispute", "Host Misconduct", "Hommie Misconduct",
  "Data Privacy", "Account Issue", "Content Violation", "Other"
];

export default function GrievanceDashboard({ grievances, adminId }: GrievanceDashboardProps) {
  const [activeId, setActiveId] = useState<string | null>(grievances[0]?.id ?? null);
  const [updating, setUpdating] = useState<string | null>(null);

  const active = grievances.find((g) => g.id === activeId);
  const breached = grievances.filter((g) => g.sla_deadline && new Date(g.sla_deadline) < new Date() && g.status !== "resolved");
  const open = grievances.filter((g) => g.status !== "resolved");

  const updateStatus = async (grievanceId: string, status: string) => {
    setUpdating(grievanceId);
    try {
      await fetch("/api/admin/grievances/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grievanceId, status, adminId })
      });
    } finally {
      setUpdating(null);
    }
  };

  return (
    <div>
      <div style={{ marginBottom: "28px" }}>
        <h1 style={{ fontSize: "24px", fontWeight: 900, color: "white", margin: 0 }}>Grievance Dashboard</h1>
        <p style={{ color: "rgba(255,255,255,0.4)", fontSize: "13px", marginTop: "6px" }}>
          IT Rules 2021 compliance. {open.length} open {open.length === 1 ? "grievance" : "grievances"}.{" "}
          {breached.length > 0 && <span style={{ color: "#ef4444", fontWeight: 800 }}>⚠️ {breached.length} SLA breached.</span>}
        </p>
      </div>

      {/* SLA Rules */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "20px" }}>
        {[
          { label: "Acknowledgement SLA", value: "Within 72 hours of filing", icon: "⚡" },
          { label: "Resolution SLA", value: "Within 15 days of filing", icon: "🏁" }
        ].map((rule) => (
          <div key={rule.label} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "12px", padding: "14px 16px", display: "flex", gap: "12px", alignItems: "center" }}>
            <span style={{ fontSize: "20px" }}>{rule.icon}</span>
            <div>
              <div style={{ fontSize: "11px", fontWeight: 900, color: "rgba(255,255,255,0.3)", textTransform: "uppercase" }}>{rule.label}</div>
              <div style={{ fontSize: "13px", fontWeight: 700, color: "rgba(255,255,255,0.7)" }}>{rule.value}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: "16px", height: "540px" }}>
        {/* Sidebar */}
        <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "12px", overflowY: "auto" }}>
          {grievances.map((g) => {
            const sla = slaStatus(g);
            return (
              <button key={g.id} onClick={() => setActiveId(g.id)}
                style={{ width: "100%", padding: "14px 16px", background: activeId === g.id ? "rgba(22,93,204,0.15)" : sla.urgent ? "rgba(239,68,68,0.06)" : "transparent", border: "none", borderBottom: "1px solid rgba(255,255,255,0.04)", cursor: "pointer", textAlign: "left" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "4px" }}>
                  <span style={{ fontWeight: 800, fontSize: "12px", color: "white" }}>{g.user_name}</span>
                  <span style={{ fontSize: "10px", fontWeight: 900, color: sla.color }}>{sla.label}</span>
                </div>
                <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.35)", marginBottom: "4px" }}>{g.complaint_type}</div>
                <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.2)" }}>{new Date(g.created_at).toLocaleDateString("en-IN")}</div>
              </button>
            );
          })}
          {grievances.length === 0 && (
            <div style={{ padding: "40px 16px", textAlign: "center", color: "rgba(255,255,255,0.2)", fontSize: "13px" }}>No grievances</div>
          )}
        </div>

        {/* Detail */}
        {active ? (
          <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "12px", padding: "24px", overflowY: "auto" }}>
            {(() => { const sla = slaStatus(active); return sla.urgent && (
              <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: "10px", padding: "10px 14px", marginBottom: "20px", display: "flex", gap: "8px", alignItems: "center" }}>
                <AlertTriangle size={14} color="#ef4444" />
                <span style={{ fontSize: "12px", color: "#fca5a5", fontWeight: 800 }}>SLA {sla.label} — Immediate action required</span>
              </div>
            ); })()}

            <div style={{ display: "flex", gap: "16px", alignItems: "flex-start", marginBottom: "24px" }}>
              <div style={{ width: "44px", height: "44px", borderRadius: "50%", background: "rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <User size={20} color="rgba(255,255,255,0.4)" />
              </div>
              <div>
                <div style={{ fontWeight: 900, fontSize: "16px", color: "white" }}>{active.user_name}</div>
                <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.35)" }}>{active.user_email}</div>
              </div>
              <span style={{ marginLeft: "auto", padding: "5px 14px", borderRadius: "8px", fontSize: "11px", fontWeight: 900, background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.5)", textTransform: "uppercase" }}>
                {STATUS_LABELS[active.status]}
              </span>
            </div>

            <div style={{ marginBottom: "16px" }}>
              <div style={{ fontSize: "11px", fontWeight: 900, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "6px" }}>Complaint Type</div>
              <div style={{ fontSize: "14px", fontWeight: 700, color: "rgba(255,255,255,0.7)" }}>{active.complaint_type}</div>
            </div>

            <div style={{ marginBottom: "20px" }}>
              <div style={{ fontSize: "11px", fontWeight: 900, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "6px" }}>Description</div>
              <div style={{ fontSize: "13px", color: "rgba(255,255,255,0.6)", lineHeight: 1.7, background: "rgba(255,255,255,0.03)", padding: "14px", borderRadius: "10px" }}>{active.description}</div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px", marginBottom: "20px" }}>
              {[
                { label: "Filed", value: new Date(active.created_at).toLocaleString("en-IN") },
                { label: "Acknowledged", value: active.acknowledged_at ? new Date(active.acknowledged_at).toLocaleString("en-IN") : "Pending" },
                { label: "SLA Deadline", value: active.sla_deadline ? new Date(active.sla_deadline).toLocaleString("en-IN") : "—" }
              ].map((item) => (
                <div key={item.label} style={{ background: "rgba(255,255,255,0.03)", borderRadius: "8px", padding: "10px 12px" }}>
                  <div style={{ fontSize: "10px", fontWeight: 900, color: "rgba(255,255,255,0.25)", textTransform: "uppercase", marginBottom: "4px" }}>{item.label}</div>
                  <div style={{ fontSize: "12px", fontWeight: 700, color: "rgba(255,255,255,0.6)" }}>{item.value}</div>
                </div>
              ))}
            </div>

            {/* Status Update */}
            {active.status !== "resolved" && (
              <div style={{ display: "flex", gap: "8px", borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: "16px" }}>
                {(["acknowledged", "in_progress", "resolved"] as const).filter((s) => s !== active.status).map((s) => (
                  <button key={s} onClick={() => updateStatus(active.id, s)} disabled={updating === active.id}
                    style={{ padding: "10px 18px", borderRadius: "10px", border: "none", background: s === "resolved" ? "rgba(34,197,94,0.2)" : "rgba(255,255,255,0.06)", color: s === "resolved" ? "#86efac" : "rgba(255,255,255,0.5)", fontWeight: 800, fontSize: "12px", cursor: "pointer", textTransform: "capitalize" }}>
                    {updating === active.id ? <Loader2 className="animate-spin" size={14} /> : `Mark ${STATUS_LABELS[s]}`}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "12px", display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.2)", flexDirection: "column", gap: "12px" }}>
            <FileText size={32} />
            <div style={{ fontSize: "13px" }}>Select a grievance</div>
          </div>
        )}
      </div>
    </div>
  );
}
