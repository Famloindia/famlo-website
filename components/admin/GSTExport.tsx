"use client";

import { useState } from "react";
import { FileDown, Loader2, ShieldAlert } from "lucide-react";

interface GSTExportProps {
  adminId: string;
}

export default function GSTExport({ adminId }: GSTExportProps) {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [generating, setGenerating] = useState(false);
  const [ready, setReady] = useState(false);
  const [preview, setPreview] = useState<Record<string, string>[]>([]);
  const [statusMessage, setStatusMessage] = useState<string>("GST export is disabled until compliance is explicitly approved.");
  const [downloadEnabled, setDownloadEnabled] = useState(false);
  const [counts, setCounts] = useState<Record<string, number> | null>(null);

  const generate = async () => {
    if (!startDate || !endDate) return;
    setGenerating(true);
    try {
      const res = await fetch("/api/admin/gst-export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startDate, endDate, adminId })
      });
      const data = await res.json();
      setPreview(data.preview ?? []);
      setCounts(typeof data?.counts === "object" && data?.counts ? data.counts : null);
      setDownloadEnabled(Boolean(data?.success) && !Boolean(data?.disabled));
      setStatusMessage(
        typeof data?.error === "string"
          ? data.error
          : typeof data?.message === "string"
            ? data.message
            : "GST export remains disabled until compliance is explicitly approved."
      );
      setReady(true);
    } finally {
      setGenerating(false);
    }
  };

  const downloadCSV = async () => {
    const res = await fetch(`/api/admin/gst-export/download?start=${startDate}&end=${endDate}`);
    if (res.ok) {
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `gst-export-${startDate}-${endDate}.csv`;
      anchor.click();
      window.URL.revokeObjectURL(url);
      setStatusMessage(`GST export downloaded for ${startDate} to ${endDate}.`);
      setReady(true);
      return;
    }

    const data = await res.json().catch(() => null);
    setStatusMessage(typeof data?.error === "string" ? data.error : "GST export download failed.");
    setReady(true);
  };

  return (
    <div>
      <div style={{ marginBottom: "28px" }}>
        <h1 style={{ fontSize: "24px", fontWeight: 900, color: "white", margin: 0 }}>GST Export</h1>
        <p style={{ color: "rgba(255,255,255,0.4)", fontSize: "13px", marginTop: "6px" }}>
          Tax reporting is locked in <code>PENDING_COMPLIANCE</code>. GST collection, GST export, TCS, TDS, and GST invoice generation are disabled by default.
        </p>
      </div>

      <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "16px", padding: "28px", maxWidth: "700px" }}>
        <div
          style={{
            display: "flex",
            gap: "12px",
            alignItems: "flex-start",
            background: "rgba(251,191,36,0.14)",
            border: "1px solid rgba(251,191,36,0.2)",
            borderRadius: "14px",
            padding: "16px",
            marginBottom: "22px",
          }}
        >
          <ShieldAlert size={18} style={{ color: "#fde68a", marginTop: "1px", flexShrink: 0 }} />
          <div style={{ color: "#fef3c7", fontSize: "13px", lineHeight: 1.6 }}>
            This screen respects compliance guardrails. It previews the GST export bundle only when the required flags and approval state allow it.
          </div>
        </div>

        {/* Date Range */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "20px" }}>
          {[
            { label: "Start Date", value: startDate, setter: setStartDate },
            { label: "End Date", value: endDate, setter: setEndDate }
          ].map(({ label, value, setter }) => (
            <div key={label}>
              <label style={{ display: "block", fontSize: "11px", fontWeight: 900, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "8px" }}>{label}</label>
              <input type="date" value={value} onChange={(e) => setter(e.target.value)}
                style={{ width: "100%", padding: "10px 14px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.05)", color: "white", fontSize: "13px", outline: "none", fontFamily: "inherit", boxSizing: "border-box" }} />
            </div>
          ))}
        </div>

        <div style={{ marginBottom: "20px" }}>
          <div style={{ fontSize: "11px", fontWeight: 900, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "10px" }}>
            Current Tax Status
          </div>
          <div style={{ display: "grid", gap: "8px", color: "#cbd5e1", fontSize: "13px" }}>
            <div><strong style={{ color: "white" }}>Tax mode:</strong> PENDING_COMPLIANCE</div>
            <div><strong style={{ color: "white" }}>GST collection:</strong> Disabled</div>
            <div><strong style={{ color: "white" }}>TCS:</strong> Disabled</div>
            <div><strong style={{ color: "white" }}>TDS:</strong> Disabled</div>
            <div><strong style={{ color: "white" }}>GST invoice generation:</strong> Disabled</div>
          </div>
        </div>

        <button onClick={generate} disabled={!startDate || !endDate || generating}
          style={{ display: "flex", alignItems: "center", gap: "8px", padding: "12px 24px", borderRadius: "10px", border: "none", background: startDate && endDate ? "#165dcc" : "rgba(255,255,255,0.06)", color: startDate && endDate ? "white" : "rgba(255,255,255,0.2)", fontWeight: 900, fontSize: "14px", cursor: startDate && endDate ? "pointer" : "not-allowed", marginBottom: "16px" }}>
          {generating ? <Loader2 className="animate-spin" size={16} /> : <FileDown size={16} />}
          Preview GST Export
        </button>

        {ready ? (
          <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "12px", padding: "14px", marginBottom: "14px" }}>
            <div style={{ color: "#e2e8f0", fontSize: "13px", lineHeight: 1.6 }}>{statusMessage}</div>
            {counts ? (
              <div style={{ marginTop: "10px", color: "#cbd5e1", fontSize: "12px", lineHeight: 1.7 }}>
                Accommodation invoices: {counts.accommodation ?? 0} · Platform-fee invoices: {counts.platformFee ?? 0} · Credit notes: {counts.creditNotes ?? 0}
              </div>
            ) : null}
            {preview.length > 0 ? (
              <div style={{ marginTop: "10px", color: "#cbd5e1", fontSize: "12px", lineHeight: 1.7 }}>
                Preview rows returned: {preview.length}. {downloadEnabled ? "Download is enabled for this range." : "Download stays blocked until compliance is explicitly approved."}
              </div>
            ) : null}
          </div>
        ) : null}

        <button
          onClick={downloadCSV}
          disabled={!downloadEnabled || !startDate || !endDate}
          style={{ display: "flex", alignItems: "center", gap: "8px", padding: "12px 24px", borderRadius: "10px", border: "none", background: downloadEnabled && startDate && endDate ? "#0f766e" : "rgba(255,255,255,0.06)", color: downloadEnabled && startDate && endDate ? "white" : "rgba(255,255,255,0.2)", fontWeight: 900, fontSize: "14px", cursor: downloadEnabled && startDate && endDate ? "pointer" : "not-allowed" }}
        >
          {downloadEnabled ? "Download GST Export CSV" : "Export Download Disabled"}
        </button>
      </div>
    </div>
  );
}
