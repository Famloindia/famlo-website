"use client";

import { useState } from "react";
import { Power, AlertTriangle, Loader2, CheckCircle2 } from "lucide-react";

interface KillSwitchProps {
  isActive: boolean;
  adminId: string;
}

export default function KillSwitch({ isActive: initialActive, adminId }: KillSwitchProps) {
  const [isActive, setIsActive] = useState(initialActive);
  const [showConfirm, setShowConfirm] = useState(false);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const toggle = async () => {
    if (!reason.trim() || reason.trim().length < 10) return;
    setLoading(true);
    try {
      await fetch("/api/admin/kill-switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activate: !isActive, reason: reason.trim(), adminId })
      });
      setIsActive(!isActive);
      setDone(true);
      setShowConfirm(false);
      setReason("");
      setTimeout(() => setDone(false), 4000);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div style={{ marginBottom: "28px" }}>
        <h1 style={{ fontSize: "24px", fontWeight: 900, color: "white", margin: 0 }}>Kill Switch</h1>
        <p style={{ color: "rgba(255,255,255,0.4)", fontSize: "13px", marginTop: "6px" }}>
          Globally pause or resume the Famlo platform. Existing confirmed bookings are unaffected.
        </p>
      </div>

      {/* Status Card */}
      <div style={{ background: isActive ? "rgba(220,38,38,0.12)" : "rgba(34,197,94,0.08)", border: `2px solid ${isActive ? "rgba(220,38,38,0.3)" : "rgba(34,197,94,0.2)"}`, borderRadius: "24px", padding: "40px", textAlign: "center", marginBottom: "28px", maxWidth: "600px", margin: "0 auto 28px" }}>
        <div style={{ width: "80px", height: "80px", borderRadius: "50%", background: isActive ? "rgba(220,38,38,0.15)" : "rgba(34,197,94,0.1)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
          <Power size={36} color={isActive ? "#ef4444" : "#22c55e"} />
        </div>

        <div style={{ fontSize: "28px", fontWeight: 900, color: isActive ? "#ef4444" : "#22c55e", marginBottom: "8px" }}>
          Platform is currently {isActive ? "PAUSED" : "LIVE"}
        </div>
        <div style={{ fontSize: "14px", color: "rgba(255,255,255,0.4)", lineHeight: 1.6, marginBottom: "28px" }}>
          {isActive
            ? "No new bookings can be initiated platform-wide. Existing confirmed bookings are unaffected. A maintenance banner is active for all users."
            : "All systems operational. Bookings and sessions are running normally."}
        </div>

        {done && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", color: "#86efac", fontWeight: 800, marginBottom: "20px" }}>
            <CheckCircle2 size={18} /> Platform state updated and logged.
          </div>
        )}

        <button onClick={() => setShowConfirm(true)}
          style={{ padding: "16px 40px", borderRadius: "14px", border: "none", background: isActive ? "#22c55e" : "#dc2626", color: "white", fontWeight: 900, fontSize: "16px", cursor: "pointer", transition: "all 0.2s" }}>
          {isActive ? "Resume Platform" : "Pause Platform (Kill Switch)"}
        </button>
      </div>

      {/* Confirmation Modal */}
      {showConfirm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
          <div style={{ background: "#0d1425", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "24px", padding: "40px", maxWidth: "480px", width: "100%", margin: "20px" }}>
            <div style={{ display: "flex", gap: "16px", marginBottom: "24px" }}>
              <div style={{ width: "48px", height: "48px", borderRadius: "50%", background: "rgba(220,38,38,0.15)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <AlertTriangle size={24} color="#ef4444" />
              </div>
              <div>
                <div style={{ fontWeight: 900, fontSize: "17px", color: "white", marginBottom: "6px" }}>
                  Confirm: {isActive ? "Resume" : "Pause"} Platform?
                </div>
                <div style={{ fontSize: "13px", color: "rgba(255,255,255,0.4)", lineHeight: 1.5 }}>
                  {isActive
                    ? "This will re-enable all new bookings and remove the maintenance banner."
                    : "This will immediately block all new booking attempts platform-wide. Existing bookings are safe."}
                </div>
              </div>
            </div>

            <div style={{ marginBottom: "20px" }}>
              <label style={{ display: "block", fontSize: "11px", fontWeight: 900, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "8px" }}>
                Mandatory Reason (min. 10 characters)
              </label>
              <textarea value={reason} onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Emergency maintenance — database migration in progress..."
                style={{ width: "100%", minHeight: "100px", padding: "12px 16px", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.05)", color: "white", fontSize: "13px", fontFamily: "inherit", resize: "vertical", outline: "none", boxSizing: "border-box" }} />
              <div style={{ fontSize: "11px", color: reason.length < 10 ? "#ef4444" : "#86efac", marginTop: "4px", fontWeight: 700 }}>
                {reason.length}/min.10 characters
              </div>
            </div>

            <div style={{ display: "flex", gap: "10px" }}>
              <button onClick={() => { setShowConfirm(false); setReason(""); }}
                style={{ flex: 1, padding: "12px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "rgba(255,255,255,0.5)", fontWeight: 800, fontSize: "14px", cursor: "pointer" }}>
                Cancel
              </button>
              <button onClick={toggle} disabled={reason.trim().length < 10 || loading}
                style={{ flex: 2, padding: "12px", borderRadius: "10px", border: "none", background: reason.trim().length >= 10 ? (isActive ? "#22c55e" : "#dc2626") : "rgba(255,255,255,0.06)", color: reason.trim().length >= 10 ? "white" : "rgba(255,255,255,0.2)", fontWeight: 900, fontSize: "14px", cursor: reason.trim().length >= 10 ? "pointer" : "not-allowed" }}>
                {loading ? <Loader2 className="animate-spin" size={16} /> : `Confirm ${isActive ? "Resume" : "Pause"}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
