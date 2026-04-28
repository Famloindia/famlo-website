"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import type { FinanceOverviewMetrics } from "@/lib/finance/types";
import type { FinanceRecentBookingRow } from "@/lib/finance/types";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

function MetricCard({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: "18px",
        padding: "22px",
      }}
    >
      <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.45)", fontWeight: 700 }}>{label}</div>
      <div style={{ marginTop: "10px", fontSize: "28px", fontWeight: 900, color: accent }}>{value}</div>
    </div>
  );
}

function formatDate(value: string | null): string {
  if (!value) return "N/A";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default function FinanceOverview({
  metrics,
  recentBookings,
}: {
  metrics: FinanceOverviewMetrics;
  recentBookings: FinanceRecentBookingRow[];
}) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const filteredBookings = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return recentBookings.filter((row) => {
      const matchesStatus =
        statusFilter === "all" ||
        (row.paymentStatus ?? row.bookingStatus ?? "").toLowerCase() === statusFilter.toLowerCase();

      if (!matchesStatus) return false;
      if (!normalizedQuery) return true;

      return [
        row.bookingId,
        row.bookingType,
        row.guestName,
        row.partnerName,
        row.propertyName,
        row.propertyLocation,
        row.paymentStatus,
        row.bookingStatus,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalizedQuery));
    });
  }, [query, recentBookings, statusFilter]);

  return (
    <div>
      <div style={{ marginBottom: "28px" }}>
        <h1 style={{ fontSize: "26px", fontWeight: 900, color: "white", margin: 0 }}>Finance Control Tower</h1>
        <p style={{ marginTop: "8px", color: "rgba(255,255,255,0.45)", fontSize: "13px" }}>
          Live payment totals still come from <code>payments_v2</code>. Rules, ledger, reconciliation, refunds, and payout
          hardening are now scaffolded for scale.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "16px" }}>
        <MetricCard label="GMV Captured" value={formatCurrency(metrics.totalPaid)} accent="#ffffff" />
        <MetricCard label="Platform Fee" value={formatCurrency(metrics.totalPlatformFee)} accent="#86efac" />
        <MetricCard label="Tax Liability" value={formatCurrency(metrics.totalTaxLiability)} accent="#fbbf24" />
        <MetricCard label="Partner Payout Obligation" value={formatCurrency(metrics.totalPartnerPayout)} accent="#93c5fd" />
        <MetricCard label="Pending Payout" value={formatCurrency(metrics.pendingPayoutAmount)} accent="#fca5a5" />
        <MetricCard label="Pending Refund" value={formatCurrency(metrics.pendingRefundAmount)} accent="#fcd34d" />
        <MetricCard label="Paid Bookings" value={String(metrics.paidBookingCount)} accent="#c4b5fd" />
        <MetricCard label="Unreconciled Payments" value={String(metrics.unreconciledPaymentCount)} accent="#fda4af" />
      </div>

      <div
        style={{
          marginTop: "24px",
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: "18px",
          padding: "22px",
        }}
      >
        <div style={{ fontSize: "15px", fontWeight: 900, color: "white" }}>Active Finance Ruleset</div>
        <div style={{ marginTop: "8px", color: "rgba(255,255,255,0.7)", fontSize: "14px" }}>
          {metrics.activeRuleSetCode ?? "Not seeded yet. Run the finance foundation migration to create the default ruleset."}
        </div>
        <div style={{ marginTop: "18px", color: "rgba(255,255,255,0.45)", fontSize: "13px", lineHeight: 1.6 }}>
          This page is intentionally additive. It does not change the current booking confirmation logic; it gives the team a
          finance home for rule management, ledger visibility, and payout/refund hardening.
        </div>
      </div>

      <div
        style={{
          marginTop: "24px",
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: "18px",
          padding: "22px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", marginBottom: "16px" }}>
          <div>
            <div style={{ fontSize: "15px", fontWeight: 900, color: "white" }}>Recent Finance Bookings</div>
            <div style={{ marginTop: "6px", color: "rgba(255,255,255,0.45)", fontSize: "13px" }}>
              All recent host bookings with guest receipt, host receipt, and finance detail access.
            </div>
          </div>
          <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search booking, guest, property, partner"
              style={{
                borderRadius: "10px",
                border: "1px solid rgba(255,255,255,0.1)",
                background: "rgba(2,6,23,0.6)",
                color: "white",
                padding: "10px 12px",
                minWidth: "240px",
              }}
            />
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              style={{
                borderRadius: "10px",
                border: "1px solid rgba(255,255,255,0.1)",
                background: "rgba(2,6,23,0.6)",
                color: "white",
                padding: "10px 12px",
              }}
            >
              <option value="all">All statuses</option>
              <option value="paid">Paid</option>
              <option value="pending">Pending</option>
              <option value="refund_pending">Refund Pending</option>
              <option value="refunded">Refunded</option>
              <option value="partially_refunded">Partially Refunded</option>
            </select>
          </div>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "1180px" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                {["Booking", "Property", "Guest", "Partner", "Payment", "GMV", "Fee", "Payout", "Created", "Documents", "Action"].map((label) => (
                  <th key={label} style={{ padding: "12px 10px", fontSize: "11px", color: "rgba(255,255,255,0.45)", textTransform: "uppercase" }}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredBookings.map((row) => (
                <tr key={`${row.bookingId}:${row.paymentId ?? "no-payment"}`} style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  <td style={{ padding: "14px 10px", color: "white", fontSize: "13px", fontWeight: 700 }}>{row.bookingId.slice(0, 8)}</td>
                  <td style={{ padding: "14px 10px", color: "#cbd5e1", fontSize: "13px" }}>
                    <div style={{ fontWeight: 700, color: "white" }}>{row.propertyName ?? row.bookingType ?? "unknown"}</div>
                    <div style={{ marginTop: 4, color: "rgba(255,255,255,0.45)", fontSize: "12px" }}>{row.propertyLocation ?? "Location pending"}</div>
                  </td>
                  <td style={{ padding: "14px 10px", color: "#cbd5e1", fontSize: "13px" }}>{row.guestName ?? "Guest"}</td>
                  <td style={{ padding: "14px 10px", color: "#cbd5e1", fontSize: "13px" }}>{row.partnerName ?? "Partner"}</td>
                  <td style={{ padding: "14px 10px", color: "#cbd5e1", fontSize: "13px" }}>{row.paymentStatus ?? row.bookingStatus ?? "unknown"}</td>
                  <td style={{ padding: "14px 10px", color: "white", fontSize: "13px", fontWeight: 700 }}>{formatCurrency(row.amountTotal)}</td>
                  <td style={{ padding: "14px 10px", color: "#86efac", fontSize: "13px", fontWeight: 700 }}>{formatCurrency(row.platformFee)}</td>
                  <td style={{ padding: "14px 10px", color: "#93c5fd", fontSize: "13px", fontWeight: 700 }}>{formatCurrency(row.partnerPayoutAmount)}</td>
                  <td style={{ padding: "14px 10px", color: "#cbd5e1", fontSize: "13px" }}>{formatDate(row.createdAt)}</td>
                  <td style={{ padding: "14px 10px" }}>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <Link
                        href={`/api/bookings/receipt?bookingId=${row.bookingId}`}
                        target="_blank"
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          borderRadius: "999px",
                          background: "rgba(255,255,255,0.08)",
                          color: "white",
                          padding: "8px 12px",
                          fontSize: "12px",
                          fontWeight: 800,
                          textDecoration: "none",
                        }}
                      >
                        Guest receipt
                      </Link>
                      {row.payoutId ? (
                        <Link
                          href={`/api/host/payouts/statement?payoutId=${row.payoutId}`}
                          target="_blank"
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            borderRadius: "999px",
                            background: "rgba(134,239,172,0.16)",
                            color: "#bbf7d0",
                            padding: "8px 12px",
                            fontSize: "12px",
                            fontWeight: 800,
                            textDecoration: "none",
                          }}
                        >
                          Host receipt
                        </Link>
                      ) : null}
                    </div>
                  </td>
                  <td style={{ padding: "14px 10px" }}>
                    <Link
                      href={`/admin/finance/bookings/${row.bookingId}`}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        borderRadius: "999px",
                        background: "rgba(147,197,253,0.16)",
                        color: "#bfdbfe",
                        padding: "8px 12px",
                        fontSize: "12px",
                        fontWeight: 800,
                        textDecoration: "none",
                      }}
                    >
                      Open Detail
                    </Link>
                  </td>
                </tr>
              ))}
              {filteredBookings.length === 0 ? (
                <tr>
                  <td colSpan={11} style={{ padding: "18px 10px", color: "rgba(255,255,255,0.45)", fontSize: "13px" }}>
                    No finance bookings match the current filters.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
