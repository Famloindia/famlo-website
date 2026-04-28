"use client";

import { useState } from "react";
import { Loader2, Snowflake, CheckCircle2, RefreshCw, Split, Scale } from "lucide-react";

interface Dispute {
  id: string;
  booking_id: string;
  raised_by_name: string;
  raised_by_type: "guest" | "host" | "hommie";
  status: "open" | "frozen" | "resolved";
  payout_frozen: boolean;
  guest_message?: string;
  host_message?: string;
  booking_amount: number;
  booking_date: string;
  resolution: string | null;
  created_at: string;
}

interface DisputeCenterProps {
  disputes: Dispute[];
  adminId: string;
}

type DisputeAction = "freeze" | "release_host" | "refund_guest" | "custom_split";

function DisputeCard({ dispute, adminId }: { dispute: Dispute; adminId: string }) {
  const [action, setAction] = useState<DisputeAction | null>(null);
  const [splitPct, setSplitPct] = useState(50);
  const [submitting, setSubmitting] = useState(false);
  const [resolved, setResolved] = useState(false);
  const [note, setNote] = useState("");

  const executeAction = async () => {
    if (!action) return;
    setSubmitting(true);
    try {
      await fetch("/api/admin/disputes/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ disputeId: dispute.id, action, splitPct: action === "custom_split" ? splitPct : null, note, adminId })
      });
      setResolved(true);
    } finally {
      setSubmitting(false);
    }
  };

  if (resolved) {
    return (
      <div style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)", borderRadius: "16px", padding: "24px", display: "flex", gap: "16px", alignItems: "center" }}>
        <CheckCircle2 size={28} color="#22c55e" />
        <div style={{ fontWeight: 800, color: "#86efac" }}>Dispute #{dispute.id.slice(-6)} resolved — action logged.</div>
      </div>
    );
  }

  const isFrozen = dispute.payout_frozen;

  return (
    <div style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${isFrozen ? "rgba(239,68,68,0.3)" : "rgba(255,255,255,0.08)"}`, borderRadius: "16px", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ padding: "16px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontWeight: 900, fontSize: "14px", color: "white" }}>Dispute #{dispute.id.slice(-6)}</div>
          <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.3)", marginTop: "2px" }}>
            Raised by <strong style={{ color: "rgba(255,255,255,0.6)" }}>{dispute.raised_by_name}</strong> ({dispute.raised_by_type}) · Booking ₹{dispute.booking_amount.toLocaleString("en-IN")} · {new Date(dispute.booking_date).toLocaleDateString("en-IN")}
          </div>
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          {isFrozen && (
            <span style={{ display: "flex", alignItems: "center", gap: "6px", background: "rgba(239,68,68,0.15)", color: "#fca5a5", padding: "5px 12px", borderRadius: "6px", fontSize: "11px", fontWeight: 900 }}>
              <Snowflake size={12} /> PAYOUT FROZEN
            </span>
          )}
          <span style={{ padding: "5px 12px", borderRadius: "6px", fontSize: "11px", fontWeight: 900, textTransform: "uppercase", background: dispute.status === "open" ? "rgba(245,158,11,0.15)" : "rgba(255,255,255,0.06)", color: dispute.status === "open" ? "#fbbf24" : "rgba(255,255,255,0.4)" }}>
            {dispute.status}
          </span>
        </div>
      </div>

      {/* 3-Way Split */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0" }}>
        {/* Guest Side */}
        <div style={{ padding: "20px", borderRight: "1px solid rgba(255,255,255,0.06)" }}>
          <div style={{ fontSize: "10px", fontWeight: 900, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "8px" }}>GUEST SIDE</div>
          <div style={{ fontSize: "13px", color: "rgba(255,255,255,0.6)", lineHeight: 1.6 }}>{dispute.guest_message ?? "No message provided"}</div>
        </div>

        {/* Center — Booking Details */}
        <div style={{ padding: "20px", borderRight: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)" }}>
          <div style={{ fontSize: "10px", fontWeight: 900, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "12px" }}>BOOKING DETAILS</div>
          <div style={{ fontSize: "22px", fontWeight: 900, color: "white", marginBottom: "4px" }}>₹{dispute.booking_amount.toLocaleString("en-IN")}</div>
          <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.4)", marginBottom: "16px" }}>Escrow status: <span style={{ color: isFrozen ? "#fca5a5" : "#86efac", fontWeight: 800 }}>{isFrozen ? "FROZEN" : "Pending release"}</span></div>
          <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.2)" }}>Booking ID: {dispute.booking_id.slice(-8)}</div>
        </div>

        {/* Host Side */}
        <div style={{ padding: "20px" }}>
          <div style={{ fontSize: "10px", fontWeight: 900, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "8px" }}>HOST/HOMMIE SIDE</div>
          <div style={{ fontSize: "13px", color: "rgba(255,255,255,0.6)", lineHeight: 1.6 }}>{dispute.host_message ?? "No message provided"}</div>
        </div>
      </div>

      {/* Action Panel */}
      {dispute.status !== "resolved" && (
        <div style={{ padding: "20px", borderTop: "1px solid rgba(255,255,255,0.06)", background: "rgba(0,0,0,0.2)" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "8px", marginBottom: "12px" }}>
            {([
              { id: "freeze", label: "Freeze Payout", description: "Pauses escrow release", color: "#ef4444" },
              { id: "release_host", label: "Release to Host", description: "Send funds to host", color: "#22c55e" },
              { id: "refund_guest", label: "Refund to Guest", description: "Return to guest", color: "#3b82f6" },
              { id: "custom_split", label: "Custom Split", description: "Set % split", color: "#a855f7" }
            ] as const).map((opt) => (
              <button key={opt.id} onClick={() => setAction(opt.id as DisputeAction)}
                style={{ padding: "12px", borderRadius: "10px", border: `1px solid ${action === opt.id ? opt.color : "rgba(255,255,255,0.08)"}`, background: action === opt.id ? opt.color + "20" : "transparent", cursor: "pointer", textAlign: "left", transition: "all 0.15s" }}>
                <div style={{ fontSize: "12px", fontWeight: 900, color: action === opt.id ? opt.color : "rgba(255,255,255,0.5)", marginBottom: "2px" }}>{opt.label}</div>
                <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.2)" }}>{opt.description}</div>
              </button>
            ))}
          </div>

          {action === "custom_split" && (
            <div style={{ marginBottom: "12px", padding: "12px", background: "rgba(168,85,247,0.1)", borderRadius: "10px" }}>
              <div style={{ fontSize: "12px", color: "#d8b4fe", marginBottom: "8px", fontWeight: 700 }}>
                Host receives: {splitPct}% · Guest receives: {100 - splitPct}%
              </div>
              <input type="range" min={0} max={100} value={splitPct} onChange={(e) => setSplitPct(Number(e.target.value))}
                style={{ width: "100%", accentColor: "#a855f7" }} />
            </div>
          )}

          <div style={{ display: "flex", gap: "8px" }}>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Resolution note (required for audit log)..."
              style={{ flex: 1, padding: "10px 14px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)", color: "white", fontSize: "12px", fontFamily: "inherit", resize: "none", minHeight: "60px", outline: "none" }} />
            <button onClick={executeAction} disabled={!action || submitting}
              style={{ padding: "10px 20px", borderRadius: "10px", border: "none", background: action ? "#165dcc" : "rgba(255,255,255,0.06)", color: action ? "white" : "rgba(255,255,255,0.2)", fontWeight: 900, fontSize: "13px", cursor: action ? "pointer" : "not-allowed" }}>
              {submitting ? <Loader2 className="animate-spin" size={16} /> : "Execute"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function DisputeCenter({ disputes, adminId }: DisputeCenterProps) {
  const open = disputes.filter((d) => d.status !== "resolved");

  return (
    <div>
      <div style={{ marginBottom: "28px" }}>
        <h1 style={{ fontSize: "24px", fontWeight: 900, color: "white", margin: 0 }}>Dispute Resolution Center</h1>
        <p style={{ color: "rgba(255,255,255,0.4)", fontSize: "13px", marginTop: "6px" }}>
          {open.length} open dispute{open.length !== 1 ? "s" : ""}. Payout actions will connect to Razorpay Route in Phase 2.
        </p>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
        {disputes.map((d) => <DisputeCard key={d.id} dispute={d} adminId={adminId} />)}
        {disputes.length === 0 && (
          <div style={{ padding: "80px", textAlign: "center", color: "rgba(255,255,255,0.2)", fontSize: "14px" }}>
            <Scale size={40} style={{ marginBottom: "16px", opacity: 0.3 }} />
            <div>No disputes. Good news!</div>
          </div>
        )}
      </div>
    </div>
  );
}
