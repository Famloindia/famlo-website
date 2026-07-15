"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Filter, ReceiptIndianRupee, RotateCcw, Search } from "lucide-react";

import type { CancellationHistoryEntry } from "@/lib/cancellation-history";

type RefundsReviewDashboardProps = {
  entries: CancellationHistoryEntry[];
  variant?: "dark" | "light";
  showBookingLinks?: boolean;
};

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(value: string | null): string {
  if (!value) return "N/A";
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

function normalizeStatus(value: string | null): string {
  return (value ?? "pending").toLowerCase();
}

function isRefundSettled(status: string | null): boolean {
  return ["processed", "full", "refunded"].includes(normalizeStatus(status));
}

function explainReason(reason: string | null): string {
  switch (reason) {
    case "user_cancelled":
      return "Guest cancelled";
    case "hold_expired":
      return "Hold expired";
    case "inventory_conflict_after_payment":
      return "Inventory conflict after payment";
    case "manual_admin_cancel":
      return "Admin cancellation";
    case "manual_team_cancel":
      return "Team cancellation";
    case "host_declined":
      return "Host declined";
    default:
      return reason ? reason.replaceAll("_", " ") : "No reason recorded";
  }
}

function MetricCard({
  label,
  value,
  accent,
  variant,
}: {
  label: string;
  value: string;
  accent: string;
  variant: "dark" | "light";
}) {
  const isDark = variant === "dark";
  return (
    <div
      style={{
        background: isDark ? "rgba(255,255,255,0.04)" : "white",
        border: `1px solid ${isDark ? "rgba(255,255,255,0.08)" : "#e2e8f0"}`,
        borderRadius: "14px",
        padding: "18px",
        boxShadow: isDark ? "none" : "0 10px 24px rgba(15,23,42,0.05)",
      }}
    >
      <div style={{ fontSize: "12px", color: isDark ? "rgba(255,255,255,0.48)" : "#64748b", fontWeight: 800 }}>{label}</div>
      <div style={{ marginTop: "8px", fontSize: "26px", fontWeight: 950, color: accent }}>{value}</div>
    </div>
  );
}

export default function RefundsReviewDashboard({
  entries,
  variant = "dark",
  showBookingLinks = true,
}: RefundsReviewDashboardProps) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const isDark = variant === "dark";

  const filteredEntries = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return entries.filter((entry) => {
      const status = normalizeStatus(entry.refundStatus);
      const settled = isRefundSettled(entry.refundStatus);
      const matchesStatus =
        statusFilter === "all" ||
        status === statusFilter ||
        (statusFilter === "payable" && entry.refundAmount > 0 && !settled) ||
        (statusFilter === "settled" && settled);

      if (!matchesStatus) return false;
      if (!needle) return true;

      return [
        entry.bookingId,
        entry.guestName,
        entry.bookingStatus,
        entry.paymentStatus,
        entry.cancelledByName,
        entry.cancelledByRole,
        entry.cancellationReason,
        entry.refundStatus,
        entry.refundReasonCode,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle));
    });
  }, [entries, query, statusFilter]);

  const metrics = useMemo(() => {
    return entries.reduce(
      (totals, entry) => {
        const settled = isRefundSettled(entry.refundStatus);
        totals.cancelledAmount += entry.bookingAmount;
        totals.refundPayable += entry.refundAmount;
        if (entry.refundAmount > 0 && !settled) totals.pendingToPay += entry.refundAmount;
        if (settled) totals.settledAmount += entry.refundAmount;
        return totals;
      },
      {
        cancelledAmount: 0,
        refundPayable: 0,
        pendingToPay: 0,
        settledAmount: 0,
      }
    );
  }, [entries]);

  const textColor = isDark ? "white" : "#0f172a";
  const mutedColor = isDark ? "rgba(255,255,255,0.48)" : "#64748b";
  const panelBg = isDark ? "rgba(255,255,255,0.04)" : "white";
  const borderColor = isDark ? "rgba(255,255,255,0.08)" : "#e2e8f0";
  const inputBg = isDark ? "rgba(2,6,23,0.6)" : "#f8fafc";

  return (
    <div>
      <div style={{ marginBottom: "24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", color: textColor }}>
          <ReceiptIndianRupee size={24} />
          <h1 style={{ margin: 0, fontSize: "26px", fontWeight: 950 }}>Refunds Review</h1>
        </div>
        <p style={{ margin: "8px 0 0", color: mutedColor, fontSize: "13px", lineHeight: 1.6 }}>
          Cancelled bookings with the refund amount payable to the guest.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: "14px", marginBottom: "20px" }}>
        <MetricCard label="Cancelled Bookings" value={String(entries.length)} accent={isDark ? "#ffffff" : "#0f172a"} variant={variant} />
        <MetricCard label="Cancelled GMV" value={formatCurrency(metrics.cancelledAmount)} accent="#93c5fd" variant={variant} />
        <MetricCard label="Refund Payable" value={formatCurrency(metrics.refundPayable)} accent="#fcd34d" variant={variant} />
        <MetricCard label="Pending To Pay" value={formatCurrency(metrics.pendingToPay)} accent="#fca5a5" variant={variant} />
        <MetricCard label="Settled Refunds" value={formatCurrency(metrics.settledAmount)} accent="#86efac" variant={variant} />
      </div>

      <section
        style={{
          background: panelBg,
          border: `1px solid ${borderColor}`,
          borderRadius: "18px",
          padding: "22px",
          boxShadow: isDark ? "none" : "0 16px 30px rgba(15,23,42,0.06)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "14px", flexWrap: "wrap", marginBottom: "16px" }}>
          <div>
            <div style={{ fontSize: "15px", fontWeight: 900, color: textColor }}>Cancelled Booking Refunds</div>
            <div style={{ marginTop: "6px", color: mutedColor, fontSize: "13px" }}>
              Payable amount uses the existing cancellation policy estimate unless a refund record is already present.
            </div>
          </div>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <div style={{ position: "relative" }}>
              <Search size={15} style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: mutedColor }} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search booking, guest, reason"
                style={{
                  minWidth: "250px",
                  borderRadius: "10px",
                  border: `1px solid ${borderColor}`,
                  background: inputBg,
                  color: textColor,
                  padding: "10px 12px 10px 36px",
                  outline: "none",
                }}
              />
            </div>
            <div style={{ position: "relative" }}>
              <Filter size={15} style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: mutedColor }} />
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                style={{
                  borderRadius: "10px",
                  border: `1px solid ${borderColor}`,
                  background: inputBg,
                  color: textColor,
                  padding: "10px 12px 10px 34px",
                  outline: "none",
                }}
              >
                <option value="all">All refunds</option>
                <option value="payable">Payable</option>
                <option value="pending">Pending</option>
                <option value="settled">Settled</option>
                <option value="processed">Processed</option>
                <option value="none">None</option>
              </select>
            </div>
          </div>
        </div>

        {filteredEntries.length === 0 ? (
          <div style={{ padding: "46px", textAlign: "center", color: mutedColor }}>
            <RotateCcw size={30} style={{ marginBottom: "12px" }} />
            <div style={{ fontWeight: 800 }}>No cancelled booking refunds found</div>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", minWidth: "1120px", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: `1px solid ${borderColor}` }}>
                  {["Booking", "Guest", "Cancelled", "Reason", "Booking Amount", "Refund Payable", "Pending To Pay", "Refund State", "Action"].map((label) => (
                    <th key={label} style={{ padding: "12px 10px", fontSize: "11px", color: mutedColor, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredEntries.map((entry) => {
                  const settled = isRefundSettled(entry.refundStatus);
                  const pendingToPay = entry.refundAmount > 0 && !settled ? entry.refundAmount : 0;

                  return (
                    <tr key={entry.id} style={{ borderBottom: `1px solid ${borderColor}` }}>
                      <td style={{ padding: "14px 10px", color: textColor, fontSize: "13px", fontWeight: 850 }}>{entry.bookingId.slice(0, 8)}</td>
                      <td style={{ padding: "14px 10px", color: textColor, fontSize: "13px" }}>{entry.guestName}</td>
                      <td style={{ padding: "14px 10px", color: mutedColor, fontSize: "13px" }}>
                        <div>{formatDate(entry.cancelledAt)}</div>
                        <div style={{ marginTop: "4px", fontSize: "11px" }}>{entry.cancelledByName}</div>
                      </td>
                      <td style={{ padding: "14px 10px", color: textColor, fontSize: "13px" }}>
                        <div style={{ fontWeight: 750 }}>{explainReason(entry.cancellationReason)}</div>
                        <div style={{ marginTop: "4px", color: mutedColor, fontSize: "11px" }}>{entry.bookingStatus ?? "cancelled"}</div>
                      </td>
                      <td style={{ padding: "14px 10px", color: textColor, fontSize: "13px", fontWeight: 800 }}>{formatCurrency(entry.bookingAmount)}</td>
                      <td style={{ padding: "14px 10px", color: "#fcd34d", fontSize: "13px", fontWeight: 900 }}>{formatCurrency(entry.refundAmount)}</td>
                      <td style={{ padding: "14px 10px", color: pendingToPay > 0 ? "#fca5a5" : "#86efac", fontSize: "13px", fontWeight: 900 }}>
                        {formatCurrency(pendingToPay)}
                      </td>
                      <td style={{ padding: "14px 10px", color: textColor, fontSize: "13px" }}>
                        <span
                          style={{
                            display: "inline-flex",
                            borderRadius: "999px",
                            padding: "7px 10px",
                            background: settled ? "rgba(34,197,94,0.15)" : "rgba(250,204,21,0.14)",
                            color: settled ? "#86efac" : "#fcd34d",
                            fontSize: "12px",
                            fontWeight: 850,
                          }}
                        >
                          {entry.refundStatus ?? "pending"}
                        </span>
                      </td>
                      <td style={{ padding: "14px 10px" }}>
                        {showBookingLinks ? (
                          <Link
                            href={`/admin/finance/bookings/${entry.bookingId}`}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              borderRadius: "999px",
                              background: isDark ? "rgba(255,255,255,0.08)" : "#e0f2fe",
                              color: isDark ? "white" : "#075985",
                              padding: "8px 12px",
                              fontSize: "12px",
                              fontWeight: 850,
                              textDecoration: "none",
                            }}
                          >
                            Open booking
                          </Link>
                        ) : (
                          <span style={{ color: mutedColor, fontSize: "12px" }}>Review only</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
