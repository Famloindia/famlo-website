"use client";

import { useState } from "react";
import { ShieldAlert, CheckCircle2, XCircle, Loader2, AlertTriangle } from "lucide-react";

interface FraudFlag {
  id: string;
  user_id_a: string;
  user_id_b: string;
  user_name_a: string;
  user_name_b: string;
  email_a: string;
  email_b: string;
  flag_reason: "shared_ip" | "shared_bank_account" | "shared_upi";
  status: "pending" | "cleared" | "confirmed_fraud";
  created_at: string;
}

interface FraudFlagsProps {
  flags: FraudFlag[];
  adminId: string;
}

const REASON_LABELS: Record<string, { label: string; description: string; color: string }> = {
  shared_ip: { label: "Shared IP Address", description: "Both accounts registered from the same IP during signup", color: "#f59e0b" },
  shared_bank_account: { label: "Shared Bank Account", description: "The same bank account is linked to both accounts", color: "#ef4444" },
  shared_upi: { label: "Shared UPI ID", description: "The same UPI ID is registered by both a Guest and a Host (fake-booking fraud signal)", color: "#ef4444" }
};

function FlagRow({ flag, adminId, onAction }: { flag: FraudFlag; adminId: string; onAction: (id: string, action: "cleared" | "confirmed_fraud") => void }) {
  const [acting, setActing] = useState(false);
  const reason = REASON_LABELS[flag.flag_reason];

  const handleAction = async (action: "cleared" | "confirmed_fraud") => {
    setActing(true);
    try {
      await fetch("/api/admin/fraud-flags/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flagId: flag.id, action, adminId })
      });
      onAction(flag.id, action);
    } finally {
      setActing(false);
    }
  };

  return (
    <div style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${flag.flag_reason === "shared_ip" ? "rgba(245,158,11,0.2)" : "rgba(239,68,68,0.2)"}`, borderRadius: "14px", padding: "20px", marginBottom: "12px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "16px", flexWrap: "wrap" }}>
        <div style={{ flex: 1 }}>
          {/* Flag type */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
            <AlertTriangle size={16} color={reason.color} />
            <span style={{ fontWeight: 900, fontSize: "13px", color: reason.color }}>{reason.label}</span>
            <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.3)", marginLeft: "4px" }}>{reason.description}</span>
          </div>

          {/* Linked accounts */}
          <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
            {[
              { name: flag.user_name_a, email: flag.email_a, id: flag.user_id_a },
              { name: flag.user_name_b, email: flag.email_b, id: flag.user_id_b }
            ].map((user, i) => (
              <div key={i} style={{ background: "rgba(255,255,255,0.04)", borderRadius: "10px", padding: "10px 14px", minWidth: "200px" }}>
                <div style={{ fontWeight: 900, fontSize: "13px", color: "white" }}>{user.name}</div>
                <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)" }}>{user.email}</div>
                <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.2)", marginTop: "2px", fontFamily: "monospace" }}>{user.id.slice(0, 12)}…</div>
              </div>
            ))}
          </div>

          <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.2)", marginTop: "10px" }}>
            Flagged: {new Date(flag.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
          </div>
        </div>

        {/* Actions */}
        {flag.status === "pending" && (
          <div style={{ display: "flex", gap: "8px", flexShrink: 0 }}>
            <button onClick={() => handleAction("cleared")} disabled={acting}
              style={{ display: "flex", alignItems: "center", gap: "6px", padding: "8px 16px", borderRadius: "8px", border: "1px solid rgba(34,197,94,0.3)", background: "rgba(34,197,94,0.08)", color: "#86efac", fontWeight: 800, fontSize: "12px", cursor: "pointer" }}>
              {acting ? <Loader2 className="animate-spin" size={14} /> : <CheckCircle2 size={14} />}
              Clear Flag
            </button>
            <button onClick={() => handleAction("confirmed_fraud")} disabled={acting}
              style={{ display: "flex", alignItems: "center", gap: "6px", padding: "8px 16px", borderRadius: "8px", border: "1px solid rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.1)", color: "#fca5a5", fontWeight: 800, fontSize: "12px", cursor: "pointer" }}>
              {acting ? <Loader2 className="animate-spin" size={14} /> : <XCircle size={14} />}
              Suspend Both
            </button>
          </div>
        )}

        {flag.status !== "pending" && (
          <span style={{ padding: "6px 14px", borderRadius: "8px", fontSize: "12px", fontWeight: 900, textTransform: "capitalize", background: flag.status === "cleared" ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)", color: flag.status === "cleared" ? "#86efac" : "#fca5a5" }}>
            {flag.status === "cleared" ? "✓ Cleared" : "⛔ Fraud Confirmed"}
          </span>
        )}
      </div>
    </div>
  );
}

export default function FraudFlags({ flags: initialFlags, adminId }: FraudFlagsProps) {
  const [flags, setFlags] = useState(initialFlags);
  const [filter, setFilter] = useState<"all" | "pending" | "cleared" | "confirmed_fraud">("pending");

  const handleAction = (id: string, action: "cleared" | "confirmed_fraud") => {
    setFlags((prev) => prev.map((f) => f.id === id ? { ...f, status: action } : f));
  };

  const displayed = filter === "all" ? flags : flags.filter((f) => f.status === filter);
  const pendingCount = flags.filter((f) => f.status === "pending").length;

  return (
    <div>
      <div style={{ marginBottom: "28px" }}>
        <h1 style={{ fontSize: "24px", fontWeight: 900, color: "white", margin: 0 }}>Fraud Detection</h1>
        <p style={{ color: "rgba(255,255,255,0.4)", fontSize: "13px", marginTop: "6px" }}>
          Automatically flagged accounts sharing an IP, bank account, or UPI ID.
          {pendingCount > 0 && <span style={{ color: "#ef4444", fontWeight: 800 }}> {pendingCount} pending review.</span>}
        </p>
      </div>

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "20px" }}>
        {(["pending", "all", "cleared", "confirmed_fraud"] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            style={{ padding: "8px 16px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.08)", background: filter === f ? "rgba(220,38,38,0.15)" : "transparent", color: filter === f ? "#fca5a5" : "rgba(255,255,255,0.4)", fontWeight: 800, fontSize: "12px", cursor: "pointer", textTransform: "capitalize" }}>
            {f === "confirmed_fraud" ? "Confirmed Fraud" : f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
            {f === "pending" && pendingCount > 0 && <span style={{ marginLeft: "6px", background: "#ef4444", color: "white", padding: "1px 6px", borderRadius: "999px", fontSize: "10px" }}>{pendingCount}</span>}
          </button>
        ))}
      </div>

      {displayed.length === 0 ? (
        <div style={{ textAlign: "center", padding: "80px", color: "rgba(255,255,255,0.2)" }}>
          <ShieldAlert size={40} style={{ marginBottom: "16px", opacity: 0.3 }} />
          <div style={{ fontSize: "14px" }}>No {filter !== "all" ? filter : ""} fraud flags found</div>
        </div>
      ) : (
        displayed.map((flag) => (
          <FlagRow key={flag.id} flag={flag} adminId={adminId} onAction={handleAction} />
        ))
      )}
    </div>
  );
}
