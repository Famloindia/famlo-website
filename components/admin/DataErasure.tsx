"use client";

import { useState } from "react";
import { Trash2, AlertTriangle, Loader2, CheckCircle2, Search } from "lucide-react";

interface ErasureTarget {
  id: string;
  name: string;
  email: string;
  role: string;
  created_at: string;
}

interface DataErasureProps {
  users: ErasureTarget[];
  adminId: string;
}

export default function DataErasure({ users, adminId }: DataErasureProps) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<ErasureTarget | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [processing, setProcessing] = useState(false);
  const [erased, setErased] = useState<Set<string>>(new Set());

  const filtered = users.filter((u) =>
    !erased.has(u.id) &&
    (u.name.toLowerCase().includes(search.toLowerCase()) ||
     u.email.toLowerCase().includes(search.toLowerCase()))
  );

  const handleErase = async () => {
    if (!selected || confirmText !== "ERASE" || !adminPassword) return;
    setProcessing(true);
    try {
      const res = await fetch("/api/admin/data-erasure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: selected.id, adminPassword, adminId })
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error ?? "Erasure failed");
        return;
      }
      setErased((prev) => new Set(prev).add(selected.id));
      setSelected(null);
      setConfirmText("");
      setAdminPassword("");
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div>
      <div style={{ marginBottom: "28px" }}>
        <h1 style={{ fontSize: "24px", fontWeight: 900, color: "white", margin: 0 }}>Data Erasure</h1>
        <p style={{ color: "rgba(255,255,255,0.4)", fontSize: "13px", marginTop: "6px" }}>
          DPDPA 2023 — Right to Erasure. Hard-deletes all PII and replaces with anonymised placeholders. The erasure event is logged but the erased data is never stored in the log.
        </p>
      </div>

      {/* Warning banner */}
      <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: "12px", padding: "14px 18px", marginBottom: "24px", display: "flex", gap: "12px", alignItems: "flex-start" }}>
        <AlertTriangle size={18} color="#ef4444" style={{ flexShrink: 0, marginTop: "1px" }} />
        <div>
          <div style={{ fontWeight: 900, fontSize: "13px", color: "#fca5a5", marginBottom: "4px" }}>Irreversible Action</div>
          <div style={{ fontSize: "12px", color: "rgba(239,68,68,0.7)", lineHeight: 1.6 }}>
            Erasing an account permanently deletes: profile data, chat logs, uploaded documents, and payment information. Fields are replaced with <code style={{ background: "rgba(255,255,255,0.06)", padding: "1px 5px", borderRadius: "3px" }}>[DELETED]</code> placeholders. This cannot be undone.
          </div>
        </div>
      </div>

      {/* Search */}
      <div style={{ position: "relative", marginBottom: "20px" }}>
        <Search size={16} style={{ position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)", color: "rgba(255,255,255,0.3)" }} />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search user to erase..."
          style={{ width: "100%", padding: "10px 16px 10px 40px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.05)", color: "white", fontSize: "13px", outline: "none", fontFamily: "inherit", boxSizing: "border-box" }} />
      </div>

      {/* Table */}
      <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "14px", overflow: "hidden", marginBottom: "24px" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              {["User", "Role", "Joined", "Action"].map((col) => (
                <th key={col} style={{ padding: "12px 18px", textAlign: "left", fontSize: "10px", fontWeight: 900, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((user) => (
              <tr key={user.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                <td style={{ padding: "14px 18px" }}>
                  <div style={{ fontWeight: 800, fontSize: "13px", color: "white" }}>{user.name}</div>
                  <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.35)", fontFamily: "monospace" }}>{user.email}</div>
                </td>
                <td style={{ padding: "14px 18px" }}>
                  <span style={{ padding: "3px 10px", borderRadius: "5px", fontSize: "11px", fontWeight: 900, textTransform: "capitalize", background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.5)" }}>{user.role}</span>
                </td>
                <td style={{ padding: "14px 18px", fontSize: "12px", color: "rgba(255,255,255,0.3)" }}>
                  {new Date(user.created_at).toLocaleDateString("en-IN")}
                </td>
                <td style={{ padding: "14px 18px" }}>
                  <button onClick={() => setSelected(user)}
                    style={{ display: "flex", alignItems: "center", gap: "6px", padding: "7px 14px", borderRadius: "8px", border: "1px solid rgba(239,68,68,0.25)", background: "rgba(239,68,68,0.06)", color: "#fca5a5", fontWeight: 800, fontSize: "12px", cursor: "pointer" }}>
                    <Trash2 size={13} /> Erase Account
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <div style={{ padding: "40px", textAlign: "center", color: "rgba(255,255,255,0.2)", fontSize: "13px" }}>No users found</div>}
      </div>

      {/* Confirmation Modal */}
      {selected && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
          <div style={{ background: "#0d1425", border: "2px solid rgba(239,68,68,0.3)", borderRadius: "24px", padding: "40px", maxWidth: "480px", width: "100%", margin: "20px" }}>
            <div style={{ display: "flex", gap: "14px", marginBottom: "24px" }}>
              <div style={{ width: "48px", height: "48px", borderRadius: "50%", background: "rgba(239,68,68,0.15)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Trash2 size={22} color="#ef4444" />
              </div>
              <div>
                <div style={{ fontWeight: 900, fontSize: "17px", color: "white" }}>Erase {selected.name}?</div>
                <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.4)", marginTop: "6px", lineHeight: 1.5 }}>
                  All PII data will be permanently deleted and replaced with <strong>[DELETED]</strong> placeholders. Booking and payment records are anonymised. This is irreversible.
                </div>
              </div>
            </div>

            <div style={{ marginBottom: "14px" }}>
              <label style={{ display: "block", fontSize: "11px", fontWeight: 900, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "6px" }}>
                Type <span style={{ color: "#ef4444" }}>ERASE</span> to confirm
              </label>
              <input value={confirmText} onChange={(e) => setConfirmText(e.target.value)}
                placeholder="ERASE"
                style={{ width: "100%", padding: "10px 14px", borderRadius: "8px", border: `1px solid ${confirmText === "ERASE" ? "rgba(239,68,68,0.4)" : "rgba(255,255,255,0.08)"}`, background: "rgba(255,255,255,0.04)", color: confirmText === "ERASE" ? "#fca5a5" : "white", fontSize: "14px", outline: "none", fontFamily: "monospace", boxSizing: "border-box" }} />
            </div>

            <div style={{ marginBottom: "20px" }}>
              <label style={{ display: "block", fontSize: "11px", fontWeight: 900, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "6px" }}>Admin Password</label>
              <input type="password" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)}
                style={{ width: "100%", padding: "10px 14px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.04)", color: "white", fontSize: "13px", outline: "none", fontFamily: "inherit", boxSizing: "border-box" }} />
            </div>

            <div style={{ display: "flex", gap: "10px" }}>
              <button onClick={() => { setSelected(null); setConfirmText(""); setAdminPassword(""); }}
                style={{ flex: 1, padding: "12px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.08)", background: "transparent", color: "rgba(255,255,255,0.4)", fontWeight: 800, fontSize: "14px", cursor: "pointer" }}>
                Cancel
              </button>
              <button onClick={handleErase} disabled={confirmText !== "ERASE" || !adminPassword || processing}
                style={{ flex: 2, padding: "12px", borderRadius: "10px", border: "none", background: confirmText === "ERASE" && adminPassword ? "#dc2626" : "rgba(255,255,255,0.06)", color: confirmText === "ERASE" && adminPassword ? "white" : "rgba(255,255,255,0.2)", fontWeight: 900, fontSize: "14px", cursor: confirmText === "ERASE" && adminPassword ? "pointer" : "not-allowed" }}>
                {processing ? <Loader2 className="animate-spin" size={16} /> : "Permanently Erase Account"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
