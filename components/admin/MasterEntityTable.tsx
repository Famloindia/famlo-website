"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { ChevronDown, Filter, Loader2, Search, Star } from "lucide-react";

type EntityType = "property" | "host" | "guest" | "booking" | "room";

interface Entity {
  id: string;
  name: string;
  type: EntityType;
  city: string;
  status: string;
  revenue: number;
  rating: number | null;
  joined: string;
  email: string;
  upi?: string;
}

interface Diagnostic {
  source: string;
  message: string;
}

interface EntityApiResponse {
  rows?: Entity[];
  diagnostics?: Diagnostic[];
  total?: number;
  offset?: number;
  limit?: number;
  hasMore?: boolean;
  error?: string;
}

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  active: { bg: "#f0fdf4", color: "#16a34a" },
  pending: { bg: "#fef3c7", color: "#b45309" },
  suspended: { bg: "#fef2f2", color: "#dc2626" },
  paused: { bg: "#fff7ed", color: "#ea580c" },
  rejected: { bg: "#fef2f2", color: "#dc2626" },
  inactive: { bg: "#e2e8f0", color: "#475569" },
  unknown: { bg: "#e2e8f0", color: "#64748b" },
};

const TYPE_FILTERS = ["all", "property", "host", "guest", "booking", "room"] as const;
const PAGE_SIZE = 50;

export default function MasterEntityTable() {
  const [rows, setRows] = useState<Entity[]>([]);
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<(typeof TYPE_FILTERS)[number]>("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState<"joined" | "revenue" | "rating">("joined");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  const deferredSearch = useDeferredValue(search);

  useEffect(() => {
    const controller = new AbortController();

    async function loadEntities() {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams({
        type: typeFilter,
        status: statusFilter,
        q: deferredSearch,
        offset: String(offset),
        limit: String(PAGE_SIZE),
      });

      try {
        const response = await fetch(`/api/admin/entities?${params.toString()}`, {
          cache: "no-store",
          credentials: "same-origin",
          signal: controller.signal,
        });
        const payload = (await response.json()) as EntityApiResponse;
        if (!response.ok) {
          throw new Error(payload.error ?? "Unable to load admin entities.");
        }
        setRows(Array.isArray(payload.rows) ? payload.rows : []);
        setDiagnostics(Array.isArray(payload.diagnostics) ? payload.diagnostics : []);
        setTotal(typeof payload.total === "number" ? payload.total : 0);
        setHasMore(Boolean(payload.hasMore));
      } catch (fetchError) {
        if (controller.signal.aborted) return;
        setRows([]);
        setDiagnostics([]);
        setTotal(0);
        setHasMore(false);
        setError(fetchError instanceof Error ? fetchError.message : "Unable to load admin entities.");
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void loadEntities();

    return () => controller.abort();
  }, [deferredSearch, offset, statusFilter, typeFilter]);

  const visibleRows = useMemo(() => {
    return [...rows].sort((a, b) => {
      let left: number;
      let right: number;

      if (sortBy === "revenue") {
        left = a.revenue;
        right = b.revenue;
      } else if (sortBy === "rating") {
        left = a.rating ?? 0;
        right = b.rating ?? 0;
      } else {
        left = new Date(a.joined).getTime();
        right = new Date(b.joined).getTime();
      }

      return sortDir === "desc" ? right - left : left - right;
    });
  }, [rows, sortBy, sortDir]);

  const toggleSort = (column: "joined" | "revenue" | "rating") => {
    if (sortBy === column) {
      setSortDir((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortBy(column);
    setSortDir("desc");
  };

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setOffset(0);
  };

  const handleTypeFilterChange = (value: (typeof TYPE_FILTERS)[number]) => {
    setTypeFilter(value);
    setOffset(0);
  };

  const handleStatusFilterChange = (value: string) => {
    setStatusFilter(value);
    setOffset(0);
  };

  return (
    <div>
      <div style={{ marginBottom: "28px" }}>
        <h1 style={{ fontSize: "24px", fontWeight: 900, color: "white", margin: 0 }}>All Entities</h1>
        <p style={{ color: "rgba(255,255,255,0.4)", fontSize: "13px", marginTop: "6px" }}>
          {loading ? "Loading entity index..." : `${rows.length} rows on this page, ${total} total matches.`}
        </p>
      </div>

      {error ? (
        <div
          style={{
            marginBottom: "20px",
            padding: "14px 16px",
            borderRadius: "12px",
            border: "1px solid rgba(248,113,113,0.35)",
            background: "rgba(127,29,29,0.2)",
            color: "#fecaca",
            fontSize: "13px",
            fontWeight: 700,
          }}
        >
          {error}
        </div>
      ) : null}

      {diagnostics.length > 0 ? (
        <div
          style={{
            marginBottom: "20px",
            padding: "14px 16px",
            borderRadius: "12px",
            border: "1px solid rgba(251,191,36,0.25)",
            background: "rgba(120,53,15,0.2)",
            color: "#fde68a",
            fontSize: "13px",
            fontWeight: 700,
          }}
        >
          Partial sources unavailable: {diagnostics.map((entry) => `${entry.source}: ${entry.message}`).join(" | ")}
        </div>
      ) : null}

      <div style={{ display: "flex", gap: "10px", marginBottom: "20px", flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: 1, minWidth: "220px" }}>
          <Search size={14} style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "rgba(255,255,255,0.3)" }} />
          <input
            value={search}
            onChange={(event) => handleSearchChange(event.target.value)}
            placeholder="Search id, name, city, email..."
            style={{ width: "100%", padding: "9px 16px 9px 34px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.05)", color: "white", fontSize: "13px", outline: "none", fontFamily: "inherit", boxSizing: "border-box" }}
          />
        </div>
        {TYPE_FILTERS.map((type) => (
          <button
            key={type}
            onClick={() => handleTypeFilterChange(type)}
            style={{ padding: "9px 16px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.1)", background: typeFilter === type ? "rgba(220,38,38,0.2)" : "rgba(255,255,255,0.04)", color: typeFilter === type ? "#fca5a5" : "rgba(255,255,255,0.5)", fontWeight: 800, fontSize: "12px", cursor: "pointer", textTransform: "capitalize" }}
          >
            {type}
          </button>
        ))}
        <div style={{ position: "relative" }}>
          <Filter size={13} style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "rgba(255,255,255,0.4)" }} />
          <select
            value={statusFilter}
            onChange={(event) => handleStatusFilterChange(event.target.value)}
            style={{ padding: "9px 16px 9px 34px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.7)", fontSize: "12px", fontWeight: 800, cursor: "pointer" }}
          >
            {["all", "active", "pending", "suspended", "paused", "rejected", "inactive", "unknown", "confirmed", "cancelled"].map((status) => (
              <option key={status} value={status} style={{ background: "#0d1425" }}>
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "16px", overflow: "hidden" }}>
        {loading ? (
          <div style={{ padding: "60px", textAlign: "center", color: "rgba(255,255,255,0.65)", fontSize: "14px", display: "flex", justifyContent: "center", alignItems: "center", gap: "10px" }}>
            <Loader2 className="animate-spin" size={18} />
            Loading entities...
          </div>
        ) : visibleRows.length === 0 ? (
          <div style={{ padding: "60px", textAlign: "center", color: "rgba(255,255,255,0.35)", fontSize: "14px" }}>No entities match your current filters.</div>
        ) : (
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
                  <th
                    key={label}
                    onClick={() => key && toggleSort(key)}
                    style={{ padding: "12px 16px", textAlign: "left", fontSize: "10px", fontWeight: 900, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.06em", cursor: key ? "pointer" : "default", whiteSpace: "nowrap" }}
                  >
                    <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                      {label}
                      {key && sortBy === key ? <ChevronDown size={12} style={{ transform: sortDir === "asc" ? "rotate(180deg)" : undefined }} /> : null}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((entity) => {
                const statusStyle = STATUS_COLORS[entity.status] ?? STATUS_COLORS.unknown;
                return (
                  <tr key={`${entity.type}:${entity.id}`} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                    <td style={{ padding: "14px 16px" }}>
                      <div style={{ fontWeight: 800, fontSize: "13px", color: "white" }}>{entity.name}</div>
                      <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.3)" }}>{entity.email || "—"}</div>
                      {entity.upi ? <div style={{ fontSize: "10px", color: "#93c5fd", fontWeight: 700, marginTop: "2px" }}>UPI: {entity.upi}</div> : null}
                    </td>
                    <td style={{ padding: "14px 16px" }}>
                      <span
                        style={{
                          padding: "3px 10px",
                          borderRadius: "5px",
                          fontSize: "11px",
                          fontWeight: 900,
                          textTransform: "uppercase",
                          background:
                            entity.type === "property"
                              ? "rgba(22,93,204,0.2)"
                              : entity.type === "room"
                                ? "rgba(14,165,233,0.2)"
                                : entity.type === "booking"
                                  ? "rgba(249,115,22,0.2)"
                                  : entity.type === "host"
                                    ? "rgba(124,58,237,0.2)"
                                    : "rgba(255,255,255,0.06)",
                          color:
                            entity.type === "property"
                              ? "#93c5fd"
                              : entity.type === "room"
                                ? "#7dd3fc"
                                : entity.type === "booking"
                                  ? "#fdba74"
                                  : entity.type === "host"
                                    ? "#c4b5fd"
                                    : "rgba(255,255,255,0.7)",
                        }}
                      >
                        {entity.type}
                      </span>
                    </td>
                    <td style={{ padding: "14px 16px", fontSize: "13px", color: "rgba(255,255,255,0.5)" }}>{entity.city}</td>
                    <td style={{ padding: "14px 16px" }}>
                      <span style={{ padding: "3px 10px", borderRadius: "5px", fontSize: "11px", fontWeight: 900, textTransform: "capitalize", background: `${statusStyle.bg}15`, color: statusStyle.color }}>
                        {entity.status}
                      </span>
                    </td>
                    <td style={{ padding: "14px 16px", fontSize: "13px", fontWeight: 800, color: "rgba(255,255,255,0.7)" }}>₹{entity.revenue.toLocaleString("en-IN")}</td>
                    <td style={{ padding: "14px 16px" }}>
                      {entity.rating !== null ? (
                        <span style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "13px", fontWeight: 800, color: "#fbbf24" }}>
                          <Star size={12} fill="#fbbf24" /> {entity.rating.toFixed(1)}
                        </span>
                      ) : (
                        <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.2)" }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: "14px 16px", fontSize: "12px", color: "rgba(255,255,255,0.3)" }}>{new Date(entity.joined).toLocaleDateString("en-IN")}</td>
                    <td style={{ padding: "14px 16px" }}>
                      <div style={{ display: "flex", gap: "6px" }}>
                        <a
                          href={`/admin?tab=commission&userId=${entity.id}`}
                          style={{ padding: "5px 10px", borderRadius: "6px", fontSize: "11px", fontWeight: 800, background: "rgba(124,58,237,0.15)", color: "#c4b5fd", textDecoration: "none" }}
                        >
                          Commission
                        </a>
                        <a
                          href={`/admin?tab=suspend&userId=${entity.id}`}
                          style={{ padding: "5px 10px", borderRadius: "6px", fontSize: "11px", fontWeight: 800, background: "rgba(220,38,38,0.1)", color: "#fca5a5", textDecoration: "none" }}
                        >
                          Suspend
                        </a>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div style={{ marginTop: "16px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
        <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.45)" }}>
          Page {Math.floor(offset / PAGE_SIZE) + 1} · Showing {rows.length} rows
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <button
            type="button"
            onClick={() => setOffset((current) => Math.max(0, current - PAGE_SIZE))}
            disabled={loading || offset === 0}
            style={{ padding: "9px 14px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.1)", background: offset === 0 ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.06)", color: offset === 0 ? "rgba(255,255,255,0.25)" : "white", fontWeight: 800, fontSize: "12px", cursor: offset === 0 ? "not-allowed" : "pointer" }}
          >
            Previous
          </button>
          <button
            type="button"
            onClick={() => setOffset((current) => current + PAGE_SIZE)}
            disabled={loading || !hasMore}
            style={{ padding: "9px 14px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.1)", background: !hasMore ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.06)", color: !hasMore ? "rgba(255,255,255,0.25)" : "white", fontWeight: 800, fontSize: "12px", cursor: !hasMore ? "not-allowed" : "pointer" }}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
