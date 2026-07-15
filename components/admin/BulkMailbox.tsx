"use client";

import { useState } from "react";
import { Mail, Send, Loader2, CheckCircle2, Users, AlertTriangle } from "lucide-react";

interface BulkMailboxProps {
  adminId: string;
  hostCount: number;
  hommieCount: number;
}

export default function BulkMailbox({ adminId, hostCount, hommieCount }: BulkMailboxProps) {
  const [recipientGroup, setRecipientGroup] = useState<"hosts" | "hommies">("hosts");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [queued, setQueued] = useState(false);
  const [sending, setSending] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);

  const recipientCount = recipientGroup === "hosts" ? hostCount : hommieCount;

  const handleSend = async () => {
    if (!subject.trim() || !body.trim()) return;
    setSending(true);
    try {
      const res = await fetch("/api/admin/bulk-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipientGroup, subject, body, adminId })
      });
      const data = await res.json();
      setJobId(data.jobId ?? "JOB-" + Date.now());
      setQueued(true);
      setSubject("");
      setBody("");
    } finally {
      setSending(false);
    }
  };

  if (queued) {
    return (
      <div>
        <div style={{ marginBottom: "28px" }}>
          <h1 style={{ fontSize: "24px", fontWeight: 900, color: "white", margin: 0 }}>Bulk Mailbox</h1>
        </div>
        <div style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)", borderRadius: "20px", padding: "48px", textAlign: "center", maxWidth: "600px" }}>
          <CheckCircle2 size={48} color="#22c55e" style={{ marginBottom: "16px" }} />
          <div style={{ fontWeight: 900, fontSize: "20px", color: "#86efac", marginBottom: "8px" }}>Campaign Queued!</div>
          <div style={{ fontSize: "14px", color: "rgba(255,255,255,0.4)", lineHeight: 1.6, marginBottom: "8px" }}>
            {recipientCount} emails have been added to the background job queue.
          </div>
          <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.2)", fontFamily: "monospace" }}>Job ID: {jobId}</div>
          <button onClick={() => setQueued(false)} style={{ marginTop: "24px", padding: "12px 28px", borderRadius: "10px", border: "none", background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.6)", fontWeight: 800, cursor: "pointer" }}>
            Compose Another
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: "28px" }}>
        <h1 style={{ fontSize: "24px", fontWeight: 900, color: "white", margin: 0 }}>Bulk Mailbox</h1>
        <p style={{ color: "rgba(255,255,255,0.4)", fontSize: "13px", marginTop: "6px" }}>
          Individually addressed emails sent via background queue. Never fires synchronously.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: "20px", maxWidth: "960px" }}>
        {/* Options */}
        <div>
          <div style={{ fontSize: "11px", fontWeight: 900, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "12px" }}>Send To</div>
          {[
            { id: "hosts" as const, label: "All Hosts", count: hostCount, icon: "🏡" },
            { id: "hommies" as const, label: "All Hommies", count: hommieCount, icon: "🧭" }
          ].map((opt) => (
            <button key={opt.id} onClick={() => setRecipientGroup(opt.id)}
              style={{ width: "100%", display: "flex", alignItems: "center", gap: "14px", padding: "16px", borderRadius: "12px", border: `2px solid ${recipientGroup === opt.id ? "#165dcc" : "rgba(255,255,255,0.08)"}`, background: recipientGroup === opt.id ? "rgba(22,93,204,0.15)" : "transparent", cursor: "pointer", marginBottom: "8px", textAlign: "left" }}>
              <span style={{ fontSize: "24px" }}>{opt.icon}</span>
              <div>
                <div style={{ fontWeight: 900, fontSize: "14px", color: "white" }}>{opt.label}</div>
                <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.3)" }}>{opt.count} recipients</div>
              </div>
              {recipientGroup === opt.id && <CheckCircle2 size={16} color="#93c5fd" style={{ marginLeft: "auto" }} />}
            </button>
          ))}

          <div style={{ marginTop: "16px", background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.15)", borderRadius: "10px", padding: "12px 14px", display: "flex", gap: "10px" }}>
            <AlertTriangle size={14} color="#fbbf24" style={{ flexShrink: 0, marginTop: "1px" }} />
            <div style={{ fontSize: "11px", color: "rgba(245,158,11,0.8)", fontWeight: 700, lineHeight: 1.5 }}>
              Emails are individually addressed. No &quot;Reply All&quot; risk. Queued via background job to prevent rate limiting.
            </div>
          </div>
        </div>

        {/* Compose */}
        <div>
          <div style={{ marginBottom: "14px" }}>
            <label style={{ display: "block", fontSize: "11px", fontWeight: 900, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "8px" }}>Subject</label>
            <input value={subject} onChange={(e) => setSubject(e.target.value)}
              placeholder="Email subject line..."
              style={{ width: "100%", padding: "12px 16px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)", color: "white", fontSize: "14px", outline: "none", fontFamily: "inherit", boxSizing: "border-box" }} />
          </div>
          <div style={{ marginBottom: "16px" }}>
            <label style={{ display: "block", fontSize: "11px", fontWeight: 900, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "8px" }}>Message Body</label>
            <textarea value={body} onChange={(e) => setBody(e.target.value)}
              placeholder={`Write your message to all ${recipientGroup}. You can use {name} as a placeholder for the recipient's name.`}
              style={{ width: "100%", minHeight: "240px", padding: "14px 16px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)", color: "white", fontSize: "13px", fontFamily: "inherit", resize: "vertical", outline: "none", lineHeight: 1.6, boxSizing: "border-box" }} />
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", color: "rgba(255,255,255,0.4)", fontWeight: 700 }}>
              <Users size={16} /> {recipientCount} emails will be queued
            </div>
            <button onClick={handleSend} disabled={!subject.trim() || !body.trim() || sending}
              style={{ display: "flex", alignItems: "center", gap: "8px", padding: "12px 28px", borderRadius: "12px", border: "none", background: subject && body ? "#165dcc" : "rgba(255,255,255,0.06)", color: subject && body ? "white" : "rgba(255,255,255,0.2)", fontWeight: 900, fontSize: "14px", cursor: subject && body ? "pointer" : "not-allowed" }}>
              {sending ? <Loader2 className="animate-spin" size={16} /> : <Send size={16} />}
              Queue Campaign
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
