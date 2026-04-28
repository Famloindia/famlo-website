"use client";

import { useState } from "react";
import { Search, Filter, ChevronDown, Star } from "lucide-react";

interface Entity {
  id: string;
  name: string;
  type: "host" | "hommie" | "guest";
  city: string;
  status: string;
  revenue: number;
  rating: number | null;
  joined: string;
  email: string;
  upi?: string;
}

interface MasterEntityTableProps {
  entities: Entity[];
}

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  active: { bg: "#f0fdf4", color: "#16a34a" },
  pending: { bg: "#fef3c7", color: "#b45309" },
  suspended: { bg: "#fef2f2", color: "#dc2626" },
  paused: { bg: "#fff7ed", color: "#ea580c" },
  rejected: { bg: "#fef2f2", color: "#dc2626" },
};

export default function MasterEntityTable({ entities }: MasterEntityTableProps) {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "host" | "hommie" | "guest">("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState<"joined" | "revenue" | "rating">("joined");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const filtered = entities
    .filter((e) => {
      const matchType = typeFilter === "all" || e.type === typeFilter;
      const matchStatus = statusFilter === "all" || e.status === statusFilter;
      const matchSearch = search === "" ||
        e.name.toLowerCase().includes(search.toLowerCase()) ||
        e.city.toLowerCase().includes(search.toLowerCase()) ||
        e.email.toLowerCase().includes(search.toLowerCase());
      return matchType && matchStatus && matchSearch;
    })
    .sort((a, b) => {
      let va: number, vb: number;
      if (sortBy === "revenue") { va = a.revenue; vb = b.revenue; }
      else if (sortBy === "rating") { va = a.rating ?? 0; vb = b.rating ?? 0; }
      else { va = new Date(a.joined).getTime(); vb = new Date(b.joined).getTime(); }
      return sortDir === "desc" ? vb - va : va - vb;
    });

  const toggleSort = (col: typeof sortBy) => {
    if (sortBy === col) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortBy(col); setSortDir("desc"); }
  };

  return (
    <div>
      <div style={{ marginBottom: "28px" }}>
        <h1 style={{ fontSize: "24px", fontWeight: 900, color: "white", margin: 0 }}>All Entities</h1>
        <p style={{ color: "rgba(255,255,255,0.4)", fontSize: "13px", marginTop: "6px" }}>
          {filtered.length} of {entities.length} entities. Full access — all data unmasked.
        </p>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: "10px", marginBottom: "20px", flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: 1, minWidth: "200px" }}>
          <Search size={14} style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "rgba(255,255,255,0.3)" }} />
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, city, email..."
            style={{ width: "100%", padding: "9px 16px 9px 34px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.05)", color: "white", fontSize: "13px", outline: "none", fontFamily: "inherit", boxSizing: "border-box" }} />
        </div>
        {(["all", "host", "hommie", "guest"] as const).map((t) => (
          <button key={t} onClick={() => setTypeFilter(t)}
            style={{ padding: "9px 16px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.1)", background: typeFilter === t ? "rgba(220,38,38,0.2)" : "rgba(255,255,255,0.04)", color: typeFilter === t ? "#fca5a5" : "rgba(255,255,255,0.5)", fontWeight: 800, fontSize: "12px", cursor: "pointer", textTransform: "capitalize" }}>
            {t}
          </button>
        ))}
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          style={{ padding: "9px 16px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.7)", fontSize: "12px", fontWeight: 800, cursor: "pointer" }}>
          {["all", "active", "pending", "suspended", "paused", "rejected"].map((s) => (
            <option key={s} value={s} style={{ background: "#0d1425" }}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "16px", overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              {[
                { label: "Name", key: null },
                { label: "Type", key: null },
                { label: "City", key: null },
                { label: "Status", key: null },
                { label: "Revenue", key: "revenue" as const },
                { label: "Rating", key: "rating" as const },
                { label: "Joined", key: "joined" as const },
                { label: "Actions", key: null },
              ].map(({ label, key }) => (
                <th key={label} onClick={() => key && toggleSort(key)}
                  style={{ padding: "12px 16px", textAlign: "left", fontSize: "10px", fontWeight: 900, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.06em", cursor: key ? "pointer" : "default", whiteSpace: "nowrap" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                    {label}
                    {key && sortBy === key && <ChevronDown size={12} style={{ transform: sortDir === "asc" ? "rotate(180deg)" : undefined }} />}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((e) => {
              const statusStyle = STATUS_COLORS[e.status] ?? { bg: "#f8fafc", color: "#64748b" };
              return (
                <tr key={e.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                  <td style={{ padding: "14px 16px" }}>
                    <div style={{ fontWeight: 800, fontSize: "13px", color: "white" }}>{e.name}</div>
                    <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.3)" }}>{e.email}</div>
                    {e.upi && <div style={{ fontSize: "10px", color: "#93c5fd", fontWeight: 700, marginTop: "2px" }}>UPI: {e.upi}</div>}
                  </td>
                  <td style={{ padding: "14px 16px" }}>
                    <span style={{ padding: "3px 10px", borderRadius: "5px", fontSize: "11px", fontWeight: 900, textTransform: "uppercase", background: e.type === "host" ? "rgba(22,93,204,0.2)" : e.type === "hommie" ? "rgba(124,58,237,0.2)" : "rgba(255,255,255,0.06)", color: e.type === "host" ? "#93c5fd" : e.type === "hommie" ? "#c4b5fd" : "rgba(255,255,255,0.5)" }}>
                      {e.type}
                    </span>
                  </td>
                  <td style={{ padding: "14px 16px", fontSize: "13px", color: "rgba(255,255,255,0.5)" }}>{e.city}</td>
                  <td style={{ padding: "14px 16px" }}>
                    <span style={{ padding: "3px 10px", borderRadius: "5px", fontSize: "11px", fontWeight: 900, textTransform: "capitalize", background: statusStyle.bg + "15", color: statusStyle.color }}>
                      {e.status}
                    </span>
                  </td>
                  <td style={{ padding: "14px 16px", fontSize: "13px", fontWeight: 800, color: "rgba(255,255,255,0.7)" }}>
                    ₹{e.revenue.toLocaleString("en-IN")}
                  </td>
                  <td style={{ padding: "14px 16px" }}>
                    {e.rating !== null ? (
                      <span style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "13px", fontWeight: 800, color: "#fbbf24" }}>
                        <Star size={12} fill="#fbbf24" /> {e.rating.toFixed(1)}
                      </span>
                    ) : (
                      <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.2)" }}>—</span>
                    )}
                  </td>
                  <td style={{ padding: "14px 16px", fontSize: "12px", color: "rgba(255,255,255,0.3)" }}>
                    {new Date(e.joined).toLocaleDateString("en-IN")}
                  </td>
                  <td style={{ padding: "14px 16px" }}>
                    <div style={{ display: "flex", gap: "6px" }}>
                      <a href={`/admin?tab=commission&userId=${e.id}`}
                        style={{ padding: "5px 10px", borderRadius: "6px", fontSize: "11px", fontWeight: 800, background: "rgba(124,58,237,0.15)", color: "#c4b5fd", textDecoration: "none" }}>
                        Commission
                      </a>
                      <a href={`/admin?tab=suspend&userId=${e.id}`}
                        style={{ padding: "5px 10px", borderRadius: "6px", fontSize: "11px", fontWeight: 800, background: "rgba(220,38,38,0.1)", color: "#fca5a5", textDecoration: "none" }}>
                        Suspend
                      </a>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div style={{ padding: "60px", textAlign: "center", color: "rgba(255,255,255,0.2)", fontSize: "14px" }}>No entities match your filters.</div>
        )}
      </div>
    </div>
  );
}
