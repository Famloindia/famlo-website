"use client";

import { useState } from "react";
import { UserX, Loader2, CheckCircle2, AlertTriangle, Search } from "lucide-react";

interface SuspendableUser {
  id: string;
  name: string;
  email: string;
  role: string;
  kyc_status: string;
}

interface AccountSuspendProps {
  users: SuspendableUser[];
  adminId: string;
}

export default function AccountSuspend({ users, adminId }: AccountSuspendProps) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<SuspendableUser | null>(null);
  const [action, setAction] = useState<"suspend" | "resume" | null>(null);
  const [confirmPassword, setConfirmPassword] = useState("");
  const [processing, setProcessing] = useState(false);
  const [done, setDone] = useState<{ userId: string; action: string } | null>(null);
  const [localStatuses, setLocalStatuses] = useState<Record<string, string>>({});

  const filtered = users.filter((u) =>
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  );

  const getStatus = (user: SuspendableUser) => localStatuses[user.id] ?? user.kyc_status;

  const handleExecute = async () => {
    if (!selected || !action) return;
    setProcessing(true);
    try {
      const res = await fetch("/api/admin/account-suspend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: selected.id, action, adminPassword: confirmPassword, adminId })
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error ?? "Action failed");
        return;
      }
      setLocalStatuses((prev) => ({ ...prev, [selected.id]: action === "suspend" ? "suspended" : "active" }));
      setDone({ userId: selected.id, action });
      setSelected(null);
      setAction(null);
      setConfirmPassword("");
      setTimeout(() => setDone(null), 4000);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div>
      <div style={{ marginBottom: "28px" }}>
        <h1 style={{ fontSize: "24px", fontWeight: 900, color: "white", margin: 0 }}>Account Suspend & Resume</h1>
        <p style={{ color: "rgba(255,255,255,0.4)", fontSize: "13px", marginTop: "6px" }}>
          Suspension instantly invalidates all JWT tokens and terminates live sessions. Resume re-enables access without requiring re-onboarding.
        </p>
      </div>

      {done && (
        <div style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)", borderRadius: "12px", padding: "14px 20px", marginBottom: "20px", display: "flex", alignItems: "center", gap: "10px" }}>
          <CheckCircle2 size={16} color="#22c55e" />
          <span style={{ fontSize: "13px", fontWeight: 700, color: "#86efac" }}>Account {done.action === "suspend" ? "suspended" : "resumed"} — all sessions invalidated and audit log written.</span>
        </div>
      )}

      {/* Search */}
      <div style={{ position: "relative", marginBottom: "20px" }}>
        <Search size={16} style={{ position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)", color: "rgba(255,255,255,0.3)" }} />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or email..."
          style={{ width: "100%", padding: "10px 16px 10px 40px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.05)", color: "white", fontSize: "13px", outline: "none", fontFamily: "inherit", boxSizing: "border-box" }} />
      </div>

      {/* Table */}
      <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "14px", overflow: "hidden", marginBottom: "24px" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              {["User", "Role", "Status", "Actions"].map((col) => (
                <th key={col} style={{ padding: "12px 18px", textAlign: "left", fontSize: "10px", fontWeight: 900, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((user) => {
              const status = getStatus(user);
              const isSuspended = status === "suspended";
              return (
                <tr key={user.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                  <td style={{ padding: "14px 18px" }}>
                    <div style={{ fontWeight: 800, fontSize: "13px", color: "white" }}>{user.name}</div>
                    <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.35)" }}>{user.email}</div>
                  </td>
                  <td style={{ padding: "14px 18px" }}>
                    <span style={{ padding: "3px 10px", borderRadius: "5px", fontSize: "11px", fontWeight: 900, textTransform: "capitalize", background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.5)" }}>{user.role}</span>
                  </td>
                  <td style={{ padding: "14px 18px" }}>
                    <span style={{ padding: "4px 10px", borderRadius: "6px", fontSize: "11px", fontWeight: 900, textTransform: "capitalize", background: isSuspended ? "rgba(239,68,68,0.12)" : "rgba(34,197,94,0.08)", color: isSuspended ? "#fca5a5" : "#86efac" }}>
                      {isSuspended ? "⛔ Suspended" : `✓ ${status}`}
                    </span>
                  </td>
                  <td style={{ padding: "14px 18px" }}>
                    <button onClick={() => { setSelected(user); setAction(isSuspended ? "resume" : "suspend"); }}
                      style={{ padding: "7px 16px", borderRadius: "8px", border: `1px solid ${isSuspended ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}`, background: isSuspended ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)", color: isSuspended ? "#86efac" : "#fca5a5", fontWeight: 800, fontSize: "12px", cursor: "pointer" }}>
                      {isSuspended ? "Resume Account" : "Suspend Account"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && <div style={{ padding: "40px", textAlign: "center", color: "rgba(255,255,255,0.2)", fontSize: "13px" }}>No users found</div>}
      </div>

      {/* Confirmation Modal */}
      {selected && action && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
          <div style={{ background: "#0d1425", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "24px", padding: "40px", maxWidth: "460px", width: "100%", margin: "20px" }}>
            <div style={{ display: "flex", gap: "16px", marginBottom: "24px" }}>
              <div style={{ width: "48px", height: "48px", borderRadius: "50%", background: action === "suspend" ? "rgba(239,68,68,0.15)" : "rgba(34,197,94,0.1)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                {action === "suspend" ? <UserX size={22} color="#ef4444" /> : <CheckCircle2 size={22} color="#22c55e" />}
              </div>
              <div>
                <div style={{ fontWeight: 900, fontSize: "17px", color: "white" }}>
                  {action === "suspend" ? "Suspend" : "Resume"} {selected.name}?
                </div>
                <div style={{ fontSize: "13px", color: "rgba(255,255,255,0.4)", marginTop: "4px", lineHeight: 1.5 }}>
                  {action === "suspend"
                    ? "All active JWT tokens will be immediately invalidated. The user will see 'Account Suspended' on their next login attempt."
                    : "The account will be re-enabled. The user can log in without going through onboarding again."}
                </div>
              </div>
            </div>

            <label style={{ display: "block", fontSize: "11px", fontWeight: 900, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "8px" }}>
              Re-confirm Admin Password
            </label>
            <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Enter admin password to confirm..."
              style={{ width: "100%", padding: "11px 15px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.05)", color: "white", fontSize: "13px", outline: "none", fontFamily: "inherit", marginBottom: "20px", boxSizing: "border-box" }} />

            <div style={{ display: "flex", gap: "10px" }}>
              <button onClick={() => { setSelected(null); setAction(null); setConfirmPassword(""); }}
                style={{ flex: 1, padding: "12px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.08)", background: "transparent", color: "rgba(255,255,255,0.4)", fontWeight: 800, fontSize: "14px", cursor: "pointer" }}>
                Cancel
              </button>
              <button onClick={handleExecute} disabled={!confirmPassword || processing}
                style={{ flex: 2, padding: "12px", borderRadius: "10px", border: "none", background: confirmPassword ? (action === "suspend" ? "#dc2626" : "#16a34a") : "rgba(255,255,255,0.06)", color: confirmPassword ? "white" : "rgba(255,255,255,0.2)", fontWeight: 900, fontSize: "14px", cursor: confirmPassword ? "pointer" : "not-allowed" }}>
                {processing ? <Loader2 className="animate-spin" size={16} /> : `Confirm ${action === "suspend" ? "Suspension" : "Resume"}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
