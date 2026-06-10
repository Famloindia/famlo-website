"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { CSSProperties } from "react";

import type { SafeTaxDisplayState } from "@/lib/finance/tax-compliance-guard";
import type { FinanceOverviewMetrics, FinanceRecentBookingRow } from "@/lib/finance/types";

type SettlementSummary = {
  totalFoliosCount: number;
  eligibleSettlementCandidatesCount: number;
  draftSettlementsCount: number;
  approvedSettlementsCount: number;
  cancelledSettlementsCount: number;
  totalNetPayableInDraftSettlements: number;
  warningSummary: {
    ambiguousOtaCollectMode: number;
    unknownOtaSource: number;
    refundUnresolved: number;
    missingFolioProofLines: number;
    alreadyInActiveSettlement: number;
  };
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
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
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

function WarningRow({ label, count }: { label: string; count: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
      <span style={{ color: "#cbd5e1", fontSize: "13px" }}>{label}</span>
      <span style={{ color: count > 0 ? "#fde68a" : "#86efac", fontWeight: 800, fontSize: "13px" }}>{count}</span>
    </div>
  );
}

export default function FinanceOverview({
  metrics,
  recentBookings,
  settlementSummary,
  financeUiEnabled,
  settlementActionsEnabled,
  settlementDraftGenerationEnabled,
  taxDisplay,
}: {
  metrics: FinanceOverviewMetrics;
  recentBookings: FinanceRecentBookingRow[];
  settlementSummary: SettlementSummary;
  financeUiEnabled: boolean;
  settlementActionsEnabled: boolean;
  settlementDraftGenerationEnabled: boolean;
  taxDisplay: SafeTaxDisplayState;
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
      <div style={{ marginBottom: "28px", display: "flex", justifyContent: "space-between", gap: "16px", flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: "26px", fontWeight: 900, color: "white", margin: 0 }}>Finance Control Tower</h1>
          <p style={{ marginTop: "8px", color: "rgba(255,255,255,0.45)", fontSize: "13px" }}>
            Folio proof lines and draft settlements are now visible here. Tax collection remains disabled and settlement payout execution is still off.
          </p>
        </div>
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <Link href="/admin/finance/settlements/candidates" style={pillStyle("#bfdbfe", "rgba(147,197,253,0.16)")}>
            Settlement Candidates
          </Link>
          <Link href="/admin/finance/settlements/candidates?includeOta=true" style={pillStyle("#fde68a", "rgba(251,191,36,0.16)")}>
            OTA Review
          </Link>
          <Link href="/admin/finance/tax-settings" style={pillStyle("#fef3c7", "rgba(251,191,36,0.14)")}>
            Tax Settings
          </Link>
        </div>
      </div>

      {!financeUiEnabled ? (
        <div style={noticeStyle("rgba(251,191,36,0.14)", "#fde68a")}>
          `ADMIN_FINANCE_FOLIO_UI_ENABLED` is off. This screen is still rendering internal finance readiness data for rollout verification.
        </div>
      ) : null}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "16px" }}>
        <MetricCard label="GMV Captured" value={formatCurrency(metrics.totalPaid)} accent="#ffffff" />
        <MetricCard label="Platform Fee" value={formatCurrency(metrics.totalPlatformFee)} accent="#86efac" />
        <MetricCard label="GST Collected" value={formatCurrency(metrics.totalTaxLiability)} accent="#fcd34d" />
        <MetricCard label="Pro Revenue" value={formatCurrency(metrics.proRevenue)} accent="#bfdbfe" />
        <MetricCard label="Pro GST" value={formatCurrency(metrics.proGst)} accent="#f9a8d4" />
        <MetricCard label="Pending Refund" value={formatCurrency(metrics.pendingRefundAmount)} accent="#fcd34d" />
        <MetricCard label="Draft Net Payable" value={formatCurrency(settlementSummary.totalNetPayableInDraftSettlements)} accent="#93c5fd" />
        <MetricCard label="Total Folios" value={String(settlementSummary.totalFoliosCount)} accent="#c4b5fd" />
        <MetricCard label="Eligible Candidates" value={String(settlementSummary.eligibleSettlementCandidatesCount)} accent="#34d399" />
        <MetricCard label="Draft Settlements" value={String(settlementSummary.draftSettlementsCount)} accent="#f9a8d4" />
        <MetricCard label="Cancelled Settlements" value={String(settlementSummary.cancelledSettlementsCount)} accent="#fca5a5" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.35fr) minmax(300px, 0.65fr)", gap: "18px", marginTop: "24px" }}>
        <section style={panelStyle}>
          <div style={{ fontSize: "15px", fontWeight: 900, color: "white" }}>Settlement Surface Status</div>
          <div style={{ marginTop: "12px", display: "grid", gap: "10px" }}>
            <div style={{ color: "#cbd5e1", fontSize: "14px" }}>
              Draft generation: <strong style={{ color: settlementDraftGenerationEnabled ? "#bbf7d0" : "#fde68a" }}>{settlementDraftGenerationEnabled ? "Enabled" : "Disabled"}</strong>
            </div>
            <div style={{ color: "#cbd5e1", fontSize: "14px" }}>
              Settlement actions: <strong style={{ color: settlementActionsEnabled ? "#bbf7d0" : "#fde68a" }}>{settlementActionsEnabled ? "Enabled" : "Disabled"}</strong>
            </div>
            <div style={{ color: "#cbd5e1", fontSize: "14px" }}>
              Approved settlements: <strong style={{ color: "white" }}>{settlementSummary.approvedSettlementsCount}</strong>
            </div>
            <div style={{ marginTop: "4px", color: "rgba(255,255,255,0.45)", fontSize: "13px", lineHeight: 1.7 }}>
              GST collection: {taxDisplay.gstCollectionLabel}. TCS: {taxDisplay.tcsLabel}. TDS: {taxDisplay.tdsLabel}. Tax mode remains <code>{taxDisplay.taxMode}</code>.
            </div>
          </div>
        </section>

        <section style={panelStyle}>
          <div style={{ fontSize: "15px", fontWeight: 900, color: "white" }}>Warning Counts</div>
          <div style={{ marginTop: "10px" }}>
            <WarningRow label="Ambiguous OTA collect mode" count={settlementSummary.warningSummary.ambiguousOtaCollectMode} />
            <WarningRow label="UNKNOWN_OTA source" count={settlementSummary.warningSummary.unknownOtaSource} />
            <WarningRow label="Refund unresolved" count={settlementSummary.warningSummary.refundUnresolved} />
            <WarningRow label="Missing folio proof lines" count={settlementSummary.warningSummary.missingFolioProofLines} />
            <WarningRow label="Already in active settlement" count={settlementSummary.warningSummary.alreadyInActiveSettlement} />
          </div>
        </section>
      </div>

      <section style={{ ...panelStyle, marginTop: "24px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", marginBottom: "16px" }}>
          <div>
            <div style={{ fontSize: "15px", fontWeight: 900, color: "white" }}>Recent Finance Bookings</div>
            <div style={{ marginTop: "6px", color: "rgba(255,255,255,0.45)", fontSize: "13px" }}>
              Read-only booking finance access. Use detail view for folio proof lines, settlement linkage, and tax-disabled status.
            </div>
          </div>
          <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search booking, guest, property, partner"
              style={inputStyle}
            />
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} style={inputStyle}>
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
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "1120px" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                {["Booking", "Property", "Guest", "Partner", "Payment", "GMV", "Fee", "Payout", "Created", "Action"].map((label) => (
                  <th key={label} style={tableHeadStyle}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredBookings.map((row) => (
                <tr key={`${row.bookingId}:${row.paymentId ?? "no-payment"}`} style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  <td style={tableBodyStyle}>{row.bookingId.slice(0, 8)}</td>
                  <td style={tableBodyStyle}>
                    <div style={{ fontWeight: 700, color: "white" }}>{row.propertyName ?? row.bookingType ?? "unknown"}</div>
                    <div style={{ marginTop: 4, color: "rgba(255,255,255,0.45)", fontSize: "12px" }}>{row.propertyLocation ?? "Location pending"}</div>
                  </td>
                  <td style={tableBodyStyle}>{row.guestName ?? "Guest"}</td>
                  <td style={tableBodyStyle}>{row.partnerName ?? "Partner"}</td>
                  <td style={tableBodyStyle}>{row.paymentStatus ?? row.bookingStatus ?? "unknown"}</td>
                  <td style={{ ...tableBodyStyle, color: "white", fontWeight: 700 }}>{formatCurrency(row.amountTotal)}</td>
                  <td style={{ ...tableBodyStyle, color: "#86efac", fontWeight: 700 }}>{formatCurrency(row.platformFee)}</td>
                  <td style={{ ...tableBodyStyle, color: "#93c5fd", fontWeight: 700 }}>{formatCurrency(row.partnerPayoutAmount)}</td>
                  <td style={tableBodyStyle}>{formatDate(row.createdAt)}</td>
                  <td style={tableBodyStyle}>
                    <Link href={`/admin/finance/bookings/${row.bookingId}`} style={pillStyle("#bfdbfe", "rgba(147,197,253,0.16)")}>
                      Open Detail
                    </Link>
                  </td>
                </tr>
              ))}
              {filteredBookings.length === 0 ? (
                <tr>
                  <td colSpan={10} style={{ padding: "18px 10px", color: "rgba(255,255,255,0.45)", fontSize: "13px" }}>
                    No finance bookings match the current filters.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

const panelStyle = {
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: "18px",
  padding: "22px",
} satisfies CSSProperties;

const inputStyle = {
  borderRadius: "10px",
  border: "1px solid rgba(255,255,255,0.1)",
  background: "rgba(2,6,23,0.6)",
  color: "white",
  padding: "10px 12px",
  minWidth: "220px",
} satisfies CSSProperties;

const tableHeadStyle = {
  padding: "12px 10px",
  fontSize: "11px",
  color: "rgba(255,255,255,0.45)",
  textTransform: "uppercase",
} satisfies CSSProperties;

const tableBodyStyle = {
  padding: "14px 10px",
  color: "#cbd5e1",
  fontSize: "13px",
} satisfies CSSProperties;

function pillStyle(color: string, background: string): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "999px",
    background,
    color,
    padding: "8px 12px",
    fontSize: "12px",
    fontWeight: 800,
    textDecoration: "none",
  };
}

function noticeStyle(background: string, color: string): CSSProperties {
  return {
    marginBottom: "18px",
    borderRadius: "16px",
    border: "1px solid rgba(255,255,255,0.08)",
    background,
    color,
    padding: "14px 16px",
    fontSize: "13px",
    lineHeight: 1.6,
  };
}
