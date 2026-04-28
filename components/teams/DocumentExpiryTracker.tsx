"use client";

import { useState } from "react";
import { FileWarning, Bell, Loader2, CheckCheck, AlertTriangle } from "lucide-react";

interface ExpiringDocument {
  id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  user_type: "host" | "hommie";
  doc_type: string;
  expiry_date: string;
  days_until_expiry: number;
  status: string;
}

interface DocumentExpiryTrackerProps {
  documents: ExpiringDocument[];
  actorId: string;
}

const DOC_TYPE_LABELS: Record<string, string> = {
  police_clearance: "Police Clearance Certificate",
  aadhar: "Aadhaar Card",
  pan: "PAN Card",
  insurance: "Property Insurance",
  other: "Supporting Document",
};

function urgencyColor(days: number) {
  if (days <= 7) return { bg: "#fef2f2", border: "#fecaca", text: "#dc2626", badge: "#ef4444" };
  if (days <= 15) return { bg: "#fff7ed", border: "#fed7aa", text: "#c2410c", badge: "#f59e0b" };
  return { bg: "#f0fdf4", border: "#bbf7d0", text: "#15803d", badge: "#22c55e" };
}

export default function DocumentExpiryTracker({ documents, actorId }: DocumentExpiryTrackerProps) {
  const [notified, setNotified] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState<Set<string>>(new Set());

  const sendRenewalRequest = async (doc: ExpiringDocument) => {
    setSending((prev) => new Set(prev).add(doc.id));
    try {
      await fetch("/api/teams/document-renewal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId: doc.id, userId: doc.user_id, docType: doc.doc_type, actorId })
      });
      setNotified((prev) => new Set(prev).add(doc.id));
    } finally {
      setSending((prev) => { const s = new Set(prev); s.delete(doc.id); return s; });
    }
  };

  const urgent = documents.filter((d) => d.days_until_expiry <= 7);
  const soon = documents.filter((d) => d.days_until_expiry > 7 && d.days_until_expiry <= 15);
  const upcoming = documents.filter((d) => d.days_until_expiry > 15);

  if (documents.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "80px 32px" }}>
        <FileWarning size={48} color="#22c55e" style={{ marginBottom: "16px" }} />
        <div style={{ fontSize: "20px", fontWeight: 900, color: "#0e2b57" }}>All documents are up to date</div>
        <div style={{ fontSize: "14px", color: "#64748b", marginTop: "8px" }}>No documents expiring within the next 30 days.</div>
      </div>
    );
  }

  const DocRow = ({ doc }: { doc: ExpiringDocument }) => {
    const colors = urgencyColor(doc.days_until_expiry);
    return (
      <tr style={{ borderBottom: "1px solid #f1f5f9", background: colors.bg }}>
        <td style={{ padding: "16px 20px" }}>
          <div style={{ fontWeight: 800, fontSize: "14px", color: "#0e2b57" }}>{doc.user_name}</div>
          <div style={{ fontSize: "12px", color: "#64748b" }}>{doc.user_email}</div>
        </td>
        <td style={{ padding: "16px 20px" }}>
          <span style={{ background: doc.user_type === "host" ? "#f4f8ff" : "#faf4ff", color: doc.user_type === "host" ? "#165dcc" : "#7c3aed", padding: "4px 10px", borderRadius: "6px", fontSize: "11px", fontWeight: 900, textTransform: "uppercase" }}>
            {doc.user_type}
          </span>
        </td>
        <td style={{ padding: "16px 20px", fontSize: "13px", fontWeight: 700, color: "#334155" }}>
          {DOC_TYPE_LABELS[doc.doc_type] ?? doc.doc_type}
        </td>
        <td style={{ padding: "16px 20px", fontSize: "13px", color: "#64748b" }}>{doc.expiry_date}</td>
        <td style={{ padding: "16px 20px" }}>
          <span style={{ background: colors.badge, color: "white", padding: "4px 10px", borderRadius: "6px", fontSize: "12px", fontWeight: 900 }}>
            {doc.days_until_expiry}d left
          </span>
        </td>
        <td style={{ padding: "16px 20px" }}>
          {notified.has(doc.id) ? (
            <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "#16a34a", fontSize: "12px", fontWeight: 800 }}>
              <CheckCheck size={14} /> Notified
            </div>
          ) : (
            <button onClick={() => sendRenewalRequest(doc)} disabled={sending.has(doc.id)}
              style={{ display: "flex", alignItems: "center", gap: "6px", background: "white", color: colors.text, border: `1px solid ${colors.border}`, padding: "8px 14px", borderRadius: "8px", fontWeight: 800, fontSize: "12px", cursor: "pointer" }}>
              {sending.has(doc.id) ? <Loader2 className="animate-spin" size={14} /> : <Bell size={14} />}
              Request Renewal
            </button>
          )}
        </td>
      </tr>
    );
  };

  const renderSection = (title: string, docs: ExpiringDocument[], icon: React.ReactNode) => {
    if (docs.length === 0) return null;
    return (
      <div style={{ marginBottom: "32px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
          {icon}
          <h2 style={{ margin: 0, fontSize: "16px", fontWeight: 900, color: "#0e2b57" }}>{title}</h2>
          <span style={{ background: "#f1f5f9", color: "#64748b", padding: "2px 10px", borderRadius: "999px", fontSize: "12px", fontWeight: 800 }}>{docs.length}</span>
        </div>
        <div style={{ background: "white", borderRadius: "16px", border: "1px solid #e2e8f0", overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                {["User", "Type", "Document", "Expiry Date", "Time Left", "Action"].map((col) => (
                  <th key={col} style={{ padding: "12px 20px", textAlign: "left", fontSize: "11px", fontWeight: 900, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {docs.map((doc) => <DocRow key={doc.id} doc={doc} />)}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div>
      <div style={{ marginBottom: "32px" }}>
        <h1 style={{ fontSize: "26px", fontWeight: 900, color: "#0e2b57", margin: 0 }}>Document Expiry Tracker</h1>
        <p style={{ color: "#64748b", fontSize: "14px", marginTop: "8px" }}>
          {documents.length} document{documents.length === 1 ? "" : "s"} expiring within 30 days. Sorted by urgency.
        </p>
      </div>

      {renderSection("🔴 Urgent — Expiring in 7 Days", urgent, <AlertTriangle size={18} color="#ef4444" />)}
      {renderSection("🟡 Soon — Expiring in 8–15 Days", soon, <FileWarning size={18} color="#f59e0b" />)}
      {renderSection("🟢 Upcoming — Expiring in 16–30 Days", upcoming, <FileWarning size={18} color="#22c55e" />)}
    </div>
  );
}
