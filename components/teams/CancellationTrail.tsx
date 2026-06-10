"use client";

import { useMemo, useState } from "react";
import { Clock3, Filter, RotateCcw } from "lucide-react";

import type { CancellationHistoryEntry } from "@/lib/cancellation-history";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function explainReason(reason: string | null): string {
  switch (reason) {
    case "user_cancelled":
      return "Guest canceled the booking.";
    case "hold_expired":
      return "Booking hold expired before confirmation.";
    case "inventory_conflict_after_payment":
      return "A slot conflict was discovered after payment.";
    case "manual_admin_cancel":
      return "Canceled manually by the admin team.";
    case "manual_team_cancel":
      return "Canceled manually by the operations team.";
    case "host_declined":
      return "The host declined the booking.";
    default:
      return reason ? reason.replaceAll("_", " ") : "No reason recorded.";
  }
}

export default function CancellationTrail({ entries }: { entries: CancellationHistoryEntry[] }) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();

    return entries.filter((entry) => {
      const matchesStatus =
        statusFilter === "all" ||
        (entry.refundStatus ?? "none").toLowerCase() === statusFilter.toLowerCase();
      if (!matchesStatus) return false;
      if (!needle) return true;

      return [
        entry.bookingId,
        entry.guestName,
        entry.cancelledByName,
        entry.cancelledByRole,
        entry.cancellationReason,
        entry.refundReasonCode,
        entry.refundStatus,
        entry.refundInitiatedByName,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle));
    });
  }, [entries, query, statusFilter]);

  return (
    <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "18px", padding: "22px" }}>
      <div style={{ marginBottom: "18px" }}>
        <div style={{ fontSize: "15px", fontWeight: 900, color: "white" }}>Cancellation Trail</div>
        <div style={{ marginTop: "6px", color: "rgba(255,255,255,0.45)", fontSize: "13px", lineHeight: 1.6 }}>
          Who canceled, when it happened, why it happened, and what refund was recorded.
        </div>
      </div>

      <div style={{ display: "flex", gap: "12px", marginBottom: "18px", flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: "1 1 280px" }}>
          <Filter size={16} style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "#94a3b8" }} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search booking, guest, reason, refund..."
            style={{ width: "100%", padding: "10px 16px 10px 36px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.1)", background: "rgba(2,6,23,0.6)", color: "white", boxSizing: "border-box" }}
          />
        </div>
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          style={{ borderRadius: "10px", border: "1px solid rgba(255,255,255,0.1)", background: "rgba(2,6,23,0.6)", color: "white", padding: "10px 12px" }}
        >
          <option value="all">All refund states</option>
          <option value="pending">Pending</option>
          <option value="processed">Processed</option>
          <option value="full">Full</option>
          <option value="partial">Partial</option>
          <option value="none">None</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <div style={{ padding: "40px", textAlign: "center", color: "rgba(255,255,255,0.45)" }}>
          <RotateCcw size={28} style={{ marginBottom: "12px" }} />
          <div>No cancellation records found</div>
        </div>
      ) : (
        <div style={{ display: "grid", gap: "12px" }}>
          {filtered.map((entry) => (
            <div key={entry.id} style={{ borderRadius: "14px", border: "1px solid rgba(255,255,255,0.08)", background: "rgba(2,6,23,0.35)", padding: "16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", marginBottom: "10px" }}>
                <div>
                  <div style={{ fontSize: "12px", fontWeight: 900, color: "#93c5fd", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    Booking {entry.bookingId.slice(0, 8)}
                  </div>
                  <div style={{ marginTop: "4px", fontSize: "14px", fontWeight: 800, color: "white" }}>
                    {entry.guestName}
                  </div>
                </div>
                <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.55)" }}>
                  <Clock3 size={13} style={{ display: "inline", marginRight: "6px", verticalAlign: "-2px" }} />
                  {formatDate(entry.cancelledAt)}
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px" }}>
                <div>
                  <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.45)", textTransform: "uppercase" }}>Cancelled by</div>
                  <div style={{ marginTop: "4px", color: "white", fontWeight: 700 }}>
                    {entry.cancelledByName}
                  </div>
                  <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.35)", textTransform: "uppercase" }}>
                    {entry.cancelledByRole}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.45)", textTransform: "uppercase" }}>Cancellation reason</div>
                  <div style={{ marginTop: "4px", color: "white", fontWeight: 700 }}>{explainReason(entry.cancellationReason)}</div>
                  {entry.cancellationReason ? (
                    <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.35)" }}>{entry.cancellationReason}</div>
                  ) : null}
                  {entry.refundReasonCode ? (
                    <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.35)" }}>Refund code: {entry.refundReasonCode}</div>
                  ) : null}
                </div>
                <div>
                  <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.45)", textTransform: "uppercase" }}>Booking amount</div>
                  <div style={{ marginTop: "4px", color: "white", fontWeight: 700 }}>{formatCurrency(entry.bookingAmount)}</div>
                </div>
                <div>
                  <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.45)", textTransform: "uppercase" }}>Refund due / recorded</div>
                  <div style={{ marginTop: "4px", color: "#86efac", fontWeight: 700 }}>{formatCurrency(entry.refundAmount)}</div>
                  <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.35)" }}>{entry.refundStatus ?? "none"}</div>
                </div>
                <div>
                  <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.45)", textTransform: "uppercase" }}>Refund initiated by</div>
                  <div style={{ marginTop: "4px", color: "white", fontWeight: 700 }}>{entry.refundInitiatedByName ?? "—"}</div>
                  {entry.refundInitiatedByRole ? (
                    <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.35)", textTransform: "uppercase" }}>
                      {entry.refundInitiatedByRole}
                    </div>
                  ) : null}
                  {entry.refundInitiatedAt ? (
                    <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.35)" }}>{formatDate(entry.refundInitiatedAt)}</div>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
