"use client";

import { useState } from "react";
import { Download, Calendar, FileDown, Loader2 } from "lucide-react";

interface GSTExportProps {
  adminId: string;
}

export default function GSTExport({ adminId }: GSTExportProps) {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [generating, setGenerating] = useState(false);
  const [ready, setReady] = useState(false);
  const [preview, setPreview] = useState<Record<string, string>[]>([]);

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
      setReady(true);
    } finally {
      setGenerating(false);
    }
  };

  const downloadCSV = async () => {
    const res = await fetch(`/api/admin/gst-export/download?start=${startDate}&end=${endDate}`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `famlo-gst-${startDate}-${endDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const CSV_COLUMNS = [
    "Invoice Date", "HSN Code", "Taxable Value", "CGST (9%)", "SGST (9%)", "IGST (18%)", "Total"
  ];

  return (
    <div>
      <div style={{ marginBottom: "28px" }}>
        <h1 style={{ fontSize: "24px", fontWeight: 900, color: "white", margin: 0 }}>GST Export</h1>
        <p style={{ color: "rgba(255,255,255,0.4)", fontSize: "13px", marginTop: "6px" }}>
          Generate a GST-compatible CSV of all platform commissions for the selected period. Compatible with Indian GST filing format.
        </p>
      </div>

      <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "16px", padding: "28px", maxWidth: "700px" }}>
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

        {/* CSV Column Preview */}
        <div style={{ marginBottom: "20px" }}>
          <div style={{ fontSize: "11px", fontWeight: 900, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "10px" }}>CSV Columns (India GST Format)</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
            {CSV_COLUMNS.map((col) => (
              <span key={col} style={{ background: "rgba(22,93,204,0.15)", color: "#93c5fd", padding: "4px 10px", borderRadius: "6px", fontSize: "11px", fontWeight: 800, fontFamily: "monospace" }}>
                {col}
              </span>
            ))}
          </div>
        </div>

        <button onClick={generate} disabled={!startDate || !endDate || generating}
          style={{ display: "flex", alignItems: "center", gap: "8px", padding: "12px 24px", borderRadius: "10px", border: "none", background: startDate && endDate ? "#165dcc" : "rgba(255,255,255,0.06)", color: startDate && endDate ? "white" : "rgba(255,255,255,0.2)", fontWeight: 900, fontSize: "14px", cursor: startDate && endDate ? "pointer" : "not-allowed", marginBottom: "16px" }}>
          {generating ? <Loader2 className="animate-spin" size={16} /> : <FileDown size={16} />}
          Generate Report
        </button>

        {/* Preview Table */}
        {ready && preview.length > 0 && (
          <div>
            <div style={{ fontSize: "12px", fontWeight: 800, color: "rgba(255,255,255,0.4)", marginBottom: "10px" }}>Preview (first 5 rows)</div>
            <div style={{ overflowX: "auto", marginBottom: "16px" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px" }}>
                <thead>
                  <tr>
                    {CSV_COLUMNS.map((col) => (
                      <th key={col} style={{ padding: "8px 10px", textAlign: "left", borderBottom: "1px solid rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.3)", fontWeight: 900, whiteSpace: "nowrap" }}>{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.slice(0, 5).map((row, i) => (
                    <tr key={i}>
                      {CSV_COLUMNS.map((col) => (
                        <td key={col} style={{ padding: "8px 10px", borderBottom: "1px solid rgba(255,255,255,0.03)", color: "rgba(255,255,255,0.6)", whiteSpace: "nowrap" }}>{row[col] ?? "—"}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <button onClick={downloadCSV}
              style={{ display: "flex", alignItems: "center", gap: "8px", padding: "12px 24px", borderRadius: "10px", border: "none", background: "#16a34a", color: "white", fontWeight: 900, fontSize: "14px", cursor: "pointer" }}>
              <Download size={16} /> Download CSV
            </button>
          </div>
        )}

        {ready && preview.length === 0 && (
          <div style={{ textAlign: "center", padding: "20px", color: "rgba(255,255,255,0.2)", fontSize: "13px" }}>No commission data found for the selected period.</div>
        )}
      </div>
    </div>
  );
}
