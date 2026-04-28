"use client";

import { useState } from "react";
import { MessageCircle, Clock, Loader2, Send, CheckCheck } from "lucide-react";

interface StalledUser {
  id: string;
  full_name: string;
  email: string;
  phone?: string;
  type: "home" | "hommie" | "guest";
  stuck_at_step: number;
  days_stalled: number;
  last_activity: string;
}

interface StalledOnboardingsProps {
  users: StalledUser[];
  actorId: string;
}

const WHATSAPP_TEMPLATE = (name: string) =>
  `Hi ${name} 👋, this is the Famlo team! We noticed your partner registration is still pending. It only takes a few minutes to complete — click here to continue: https://famlo.in/partners/onboarding. We're here to help if you need any support! 🏡`;

export default function StalledOnboardings({ users, actorId }: StalledOnboardingsProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [nudged, setNudged] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState<Set<string>>(new Set());
  const [batchSending, setBatchSending] = useState(false);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selected.size === users.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(users.map((u) => u.id)));
    }
  };

  const sendNudge = async (user: StalledUser) => {
    setSending((prev) => new Set(prev).add(user.id));
    try {
      await fetch("/api/teams/nudge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, phone: user.phone, message: WHATSAPP_TEMPLATE(user.full_name), actorId })
      });
      setNudged((prev) => new Set(prev).add(user.id));
    } finally {
      setSending((prev) => { const s = new Set(prev); s.delete(user.id); return s; });
    }
  };

  const sendBatchNudge = async () => {
    setBatchSending(true);
    const targets = users.filter((u) => selected.has(u.id));
    await Promise.all(targets.map(sendNudge));
    setBatchSending(false);
    setSelected(new Set());
  };

  if (users.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "80px 32px" }}>
        <Clock size={48} color="#22c55e" style={{ marginBottom: "16px" }} />
        <div style={{ fontSize: "20px", fontWeight: 900, color: "#0e2b57" }}>No stalled onboardings!</div>
        <div style={{ fontSize: "14px", color: "#64748b", marginTop: "8px" }}>All users in review have been active in the last 3 days.</div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: "32px" }}>
        <h1 style={{ fontSize: "26px", fontWeight: 900, color: "#0e2b57", margin: 0 }}>Stalled Onboardings</h1>
        <p style={{ color: "#64748b", fontSize: "14px", marginTop: "8px" }}>
          {users.length} user{users.length === 1 ? "" : "s"} have been in PENDING_REVIEW for 3+ days without activity.
        </p>
      </div>

      {/* Batch Action Bar */}
      {selected.size > 0 && (
        <div style={{ background: "#165dcc", color: "white", padding: "16px 24px", borderRadius: "14px", marginBottom: "24px", display: "flex", alignItems: "center", gap: "16px" }}>
          <span style={{ fontWeight: 800, fontSize: "14px" }}>{selected.size} users selected</span>
          <button onClick={sendBatchNudge} disabled={batchSending}
            style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "8px", background: "white", color: "#165dcc", border: "none", padding: "10px 20px", borderRadius: "10px", fontWeight: 900, fontSize: "13px", cursor: "pointer" }}>
            {batchSending ? <Loader2 className="animate-spin" size={16} /> : <Send size={16} />}
            Send WhatsApp Nudge to All
          </button>
          <button onClick={() => setSelected(new Set())} style={{ background: "rgba(255,255,255,0.15)", border: "none", color: "white", padding: "10px 16px", borderRadius: "10px", fontWeight: 800, cursor: "pointer", fontSize: "13px" }}>
            Clear
          </button>
        </div>
      )}

      {/* Table */}
      <div style={{ background: "white", borderRadius: "16px", border: "1px solid #e2e8f0", overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
              <th style={{ padding: "14px 20px", textAlign: "left" }}>
                <input type="checkbox" checked={selected.size === users.length} onChange={selectAll} />
              </th>
              {["Name", "Type", "Stuck at Step", "Days Stalled", "Last Activity", "Action"].map((col) => (
                <th key={col} style={{ padding: "14px 20px", textAlign: "left", fontSize: "11px", fontWeight: 900, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} style={{ borderBottom: "1px solid #f1f5f9", background: selected.has(user.id) ? "#f4f8ff" : "white" }}>
                <td style={{ padding: "16px 20px" }}>
                  <input type="checkbox" checked={selected.has(user.id)} onChange={() => toggleSelect(user.id)} />
                </td>
                <td style={{ padding: "16px 20px" }}>
                  <div style={{ fontWeight: 800, fontSize: "14px", color: "#0e2b57" }}>{user.full_name}</div>
                  <div style={{ fontSize: "12px", color: "#64748b" }}>{user.email}</div>
                </td>
                <td style={{ padding: "16px 20px" }}>
                  <span style={{ background: "#f4f8ff", color: "#165dcc", padding: "4px 10px", borderRadius: "6px", fontSize: "12px", fontWeight: 800, textTransform: "capitalize" }}>{user.type}</span>
                </td>
                <td style={{ padding: "16px 20px" }}>
                  <span style={{ fontSize: "13px", fontWeight: 700, color: "#334155" }}>Step {user.stuck_at_step}</span>
                </td>
                <td style={{ padding: "16px 20px" }}>
                  <span style={{ fontWeight: 900, color: user.days_stalled >= 7 ? "#ef4444" : user.days_stalled >= 5 ? "#f59e0b" : "#334155", fontSize: "14px" }}>
                    {user.days_stalled}d
                  </span>
                </td>
                <td style={{ padding: "16px 20px", fontSize: "12px", color: "#94a3b8" }}>
                  {user.last_activity}
                </td>
                <td style={{ padding: "16px 20px" }}>
                  {nudged.has(user.id) ? (
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "#16a34a", fontSize: "12px", fontWeight: 800 }}>
                      <CheckCheck size={14} /> Nudged
                    </div>
                  ) : (
                    <button onClick={() => sendNudge(user)} disabled={sending.has(user.id)}
                      style={{ display: "flex", alignItems: "center", gap: "6px", background: "#f0fdf4", color: "#16a34a", border: "1px solid #86efac", padding: "8px 14px", borderRadius: "8px", fontWeight: 800, fontSize: "12px", cursor: "pointer" }}>
                      {sending.has(user.id) ? <Loader2 className="animate-spin" size={14} /> : <MessageCircle size={14} />}
                      WhatsApp Nudge
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
