"use client";

import { useState } from "react";
import { Eye, EyeOff, Loader2, AlertTriangle, Monitor } from "lucide-react";

interface ShadowTarget {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
}

interface ShadowSupportProps {
  users: ShadowTarget[];
  actorId: string;
  actorName: string;
}

export default function ShadowSupport({ users, actorId, actorName }: ShadowSupportProps) {
  const [search, setSearch] = useState("");
  const [activeShadow, setActiveShadow] = useState<ShadowTarget | null>(null);
  const [starting, setStarting] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);

  const filtered = users.filter((u) =>
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  );

  const startShadow = async (target: ShadowTarget) => {
    setStarting(true);
    try {
      const res = await fetch("/api/teams/shadow/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actorId, targetUserId: target.id })
      });
      const data = await res.json();
      setSessionId(data.sessionId);
      setActiveShadow(target);
    } finally {
      setStarting(false);
    }
  };

  const endShadow = async () => {
    if (!activeShadow || !sessionId) return;
    await fetch("/api/teams/shadow/end", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actorId, targetUserId: activeShadow.id, sessionId })
    });
    setActiveShadow(null);
    setSessionId(null);
  };

  return (
    <div>
      <div style={{ marginBottom: "32px" }}>
        <h1 style={{ fontSize: "26px", fontWeight: 900, color: "#0e2b57", margin: 0 }}>Shadow Support</h1>
        <p style={{ color: "#64748b", fontSize: "14px", marginTop: "8px" }}>
          View any host or hommie dashboard exactly as they see it to resolve support issues. All shadow sessions are logged.
        </p>
      </div>

      {/* Active Shadow Banner */}
      {activeShadow && (
        <div style={{ background: "#fef3c7", border: "2px solid #fde68a", borderRadius: "16px", padding: "20px 24px", marginBottom: "24px", display: "flex", alignItems: "center", gap: "16px" }}>
          <Monitor size={24} color="#b45309" />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 900, fontSize: "15px", color: "#92400e" }}>Shadow Session Active</div>
            <div style={{ fontSize: "13px", color: "#b45309", marginTop: "2px" }}>
              You ({actorName}) are viewing <strong>{activeShadow.name}</strong>&apos;s dashboard in READ-ONLY mode. Session ID: {sessionId}
            </div>
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <a href={`/app/partner-view?shadow=${activeShadow.id}`} target="_blank" rel="noopener noreferrer"
              style={{ display: "flex", alignItems: "center", gap: "6px", background: "#165dcc", color: "white", padding: "10px 18px", borderRadius: "10px", fontWeight: 800, fontSize: "13px", textDecoration: "none" }}>
              <Eye size={14} /> Open Dashboard
            </a>
            <button onClick={endShadow} style={{ display: "flex", alignItems: "center", gap: "6px", background: "white", color: "#dc2626", border: "2px solid #fca5a5", padding: "10px 18px", borderRadius: "10px", fontWeight: 800, fontSize: "13px", cursor: "pointer" }}>
              <EyeOff size={14} /> End Session
            </button>
          </div>
        </div>
      )}

      {/* Search */}
      <div style={{ background: "white", borderRadius: "16px", border: "1px solid #e2e8f0", overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #f1f5f9" }}>
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or email..."
            style={{ width: "100%", padding: "10px 16px", borderRadius: "10px", border: "1px solid #e2e8f0", fontSize: "14px", outline: "none", fontFamily: "inherit", boxSizing: "border-box" }} />
        </div>

        {/* Warning */}
        <div style={{ background: "#fef2f2", padding: "12px 20px", borderBottom: "1px solid #fecaca", display: "flex", gap: "10px", alignItems: "center" }}>
          <AlertTriangle size={16} color="#ef4444" />
          <span style={{ fontSize: "12px", fontWeight: 700, color: "#dc2626" }}>
            READ-ONLY mode enforced. You cannot take actions on behalf of users. Every session is logged with your team member ID and timestamp.
          </span>
        </div>

        {/* User List */}
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
              {["User", "Role", "Account Status", "Action"].map((col) => (
                <th key={col} style={{ padding: "12px 20px", textAlign: "left", fontSize: "11px", fontWeight: 900, color: "#64748b", textTransform: "uppercase" }}>{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((user) => (
              <tr key={user.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                <td style={{ padding: "16px 20px" }}>
                  <div style={{ fontWeight: 800, fontSize: "14px", color: "#0e2b57" }}>{user.name}</div>
                  <div style={{ fontSize: "12px", color: "#64748b" }}>{user.email}</div>
                </td>
                <td style={{ padding: "16px 20px" }}>
                  <span style={{ background: "#f4f8ff", color: "#165dcc", padding: "4px 10px", borderRadius: "6px", fontSize: "11px", fontWeight: 900, textTransform: "capitalize" }}>{user.role}</span>
                </td>
                <td style={{ padding: "16px 20px" }}>
                  <span style={{ fontWeight: 800, fontSize: "13px", color: user.status === "active" ? "#16a34a" : user.status === "pending" ? "#d97706" : "#dc2626", textTransform: "capitalize" }}>{user.status}</span>
                </td>
                <td style={{ padding: "16px 20px" }}>
                  <button onClick={() => startShadow(user)} disabled={!!activeShadow || starting}
                    style={{ display: "flex", alignItems: "center", gap: "6px", background: activeShadow ? "#f1f5f9" : "#f4f8ff", color: activeShadow ? "#94a3b8" : "#165dcc", border: `1px solid ${activeShadow ? "#e2e8f0" : "#bfdbfe"}`, padding: "8px 14px", borderRadius: "8px", fontWeight: 800, fontSize: "12px", cursor: activeShadow ? "not-allowed" : "pointer" }}>
                    {starting ? <Loader2 className="animate-spin" size={14} /> : <Eye size={14} />}
                    Shadow User
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {filtered.length === 0 && (
          <div style={{ padding: "40px", textAlign: "center", color: "#94a3b8", fontSize: "14px" }}>No users match your search.</div>
        )}
      </div>
    </div>
  );
}
