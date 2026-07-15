"use client";

import { useState } from "react";
import { ScrollText, Filter, RefreshCw } from "lucide-react";

interface AuditEntry {
  id: number;
  actor_id: string;
  actor_role: "admin" | "team";
  action_type: string;
  target_user_id: string | null;
  resource_type: string | null;
  reason: string | null;
  ip_address: string | null;
  created_at: string;
  actor_name?: string;
  target_name?: string;
}

interface AuditTrailProps {
  entries: AuditEntry[];
}

const ACTION_COLORS: Record<string, string> = {
  approve: "#16a34a", reject: "#dc2626", suspend: "#dc2626",
  resume: "#16a34a", commission_change: "#7c3aed", payout_freeze: "#b45309",
  payout_release: "#16a34a", force_refund: "#b45309", document_review: "#0284c7",
  document_approve: "#16a34a", document_reject: "#dc2626", shadow_start: "#7c3aed",
  shadow_end: "#7c3aed", whatsapp_nudge: "#16a34a", renewal_request: "#0284c7",
  data_erasure: "#dc2626", kill_switch_on: "#dc2626", kill_switch_off: "#16a34a",
  login: "#64748b", logout: "#64748b", bulk_email_sent: "#0284c7"
};

function actionBg(action: string): string {
  const color = ACTION_COLORS[action] ?? "#64748b";
  return color;
}

export default function AuditTrail({ entries }: AuditTrailProps) {
  const [filter, setFilter] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | "admin" | "team">("all");

  const filtered = entries.filter((e) => {
    const matchRole = roleFilter === "all" || e.actor_role === roleFilter;
    const matchSearch = filter === "" ||
      e.action_type.includes(filter.toLowerCase()) ||
      (e.actor_name ?? "").toLowerCase().includes(filter.toLowerCase()) ||
      (e.target_name ?? "").toLowerCase().includes(filter.toLowerCase());
    return matchRole && matchSearch;
  });

  return (
    <div>
      <div style={{ marginBottom: "32px" }}>
        <h1 style={{ fontSize: "26px", fontWeight: 900, color: "#0e2b57", margin: 0 }}>Audit Trail</h1>
        <p style={{ color: "#64748b", fontSize: "14px", marginTop: "8px" }}>
          Append-only log of all team and admin actions. This log cannot be edited or deleted.
        </p>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: "12px", marginBottom: "24px" }}>
        <div style={{ position: "relative", flex: 1 }}>
          <Filter size={16} style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "#94a3b8" }} />
          <input value={filter} onChange={(e) => setFilter(e.target.value)}
            placeholder="Search actions, actors, targets..."
            style={{ width: "100%", padding: "10px 16px 10px 36px", borderRadius: "10px", border: "1px solid #e2e8f0", fontSize: "13px", outline: "none", fontFamily: "inherit", boxSizing: "border-box" }} />
        </div>
        {(["all", "admin", "team"] as const).map((role) => (
          <button key={role} onClick={() => setRoleFilter(role)}
            style={{ padding: "10px 18px", borderRadius: "10px", border: "1px solid #e2e8f0", background: roleFilter === role ? "#0e2b57" : "white", color: roleFilter === role ? "white" : "#64748b", fontWeight: 800, fontSize: "13px", cursor: "pointer", textTransform: "capitalize" }}>
            {role}
          </button>
        ))}
      </div>

      <div style={{ background: "white", borderRadius: "16px", border: "1px solid #e2e8f0", overflow: "hidden" }}>
        <div style={{ padding: "16px 24px", borderBottom: "1px solid #f1f5f9", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: "13px", fontWeight: 800, color: "#64748b" }}>{filtered.length} entries</span>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", fontWeight: 800, color: "#94a3b8" }}>
            <ScrollText size={14} /> APPEND-ONLY — This log is immutable
          </div>
        </div>

        {filtered.length === 0 ? (
          <div style={{ padding: "60px", textAlign: "center", color: "#94a3b8" }}>
            <RefreshCw size={32} style={{ marginBottom: "12px" }} />
            <div>No log entries found</div>
          </div>
        ) : (
          <div style={{ maxHeight: "600px", overflowY: "auto" }}>
            {filtered.map((entry) => (
              <div key={entry.id} style={{ display: "grid", gridTemplateColumns: "160px 1fr auto", gap: "16px", alignItems: "start", padding: "16px 24px", borderBottom: "1px solid #f8fafc", transition: "background 0.1s" }}>
                {/* Timestamp */}
                <div style={{ fontSize: "11px", color: "#94a3b8", fontWeight: 700, lineHeight: 1.4 }}>
                  <div>{new Date(entry.created_at).toLocaleDateString("en-IN")}</div>
                  <div>{new Date(entry.created_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</div>
                  {entry.ip_address && <div style={{ marginTop: "4px", fontSize: "10px", color: "#cbd5e1" }}>{entry.ip_address}</div>}
                </div>

                {/* Main */}
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px", flexWrap: "wrap" }}>
                    <span style={{ background: actionBg(entry.action_type), color: "white", padding: "3px 10px", borderRadius: "6px", fontSize: "11px", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                      {entry.action_type.replace(/_/g, " ")}
                    </span>
                    <span style={{ background: entry.actor_role === "admin" ? "#fef2f2" : "#f4f8ff", color: entry.actor_role === "admin" ? "#dc2626" : "#165dcc", padding: "3px 8px", borderRadius: "5px", fontSize: "10px", fontWeight: 900, textTransform: "uppercase" }}>
                      {entry.actor_role}
                    </span>
                  </div>
                  <div style={{ fontSize: "13px", color: "#334155", fontWeight: 600 }}>
                    <span style={{ fontWeight: 900 }}>{entry.actor_name ?? entry.actor_id.slice(0, 8)}</span>
                    {entry.target_name && <> → <span style={{ fontWeight: 900 }}>{entry.target_name}</span></>}
                    {entry.resource_type && <span style={{ color: "#94a3b8" }}> ({entry.resource_type})</span>}
                  </div>
                  {entry.reason && (
                    <div style={{ marginTop: "4px", fontSize: "12px", color: "#64748b", fontStyle: "italic" }}>
                      &ldquo;{entry.reason}&rdquo;
                    </div>
                  )}
                </div>

                {/* ID */}
                <div style={{ fontSize: "10px", color: "#e2e8f0", fontWeight: 700, fontFamily: "monospace" }}>#{entry.id}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
