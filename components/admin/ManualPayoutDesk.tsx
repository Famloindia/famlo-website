"use client";

import { useMemo, useState } from "react";

type PayoutRow = {
  payoutId: string;
  bookingId: string;
  partnerType: "host" | "hommie";
  partnerName: string;
  partnerEmail: string;
  payoutStatus: string;
  bookingStatus: string;
  amount: number;
  netTransferableAmount: number;
  grossBookingValue: number;
  platformFee: number;
  platformFeeTax: number;
  guestName: string;
  paymentStatus: string;
  createdAt: string | null;
  holdReason: string | null;
  payoutMethod: string | null;
  payoutDestination: string | null;
  notes: string | null;
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

function PayoutActionCell({
  row,
}: {
  row: PayoutRow;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [transferReference, setTransferReference] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function markPaid(): Promise<void> {
    if (submitting) return;
    setSubmitting(true);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch("/api/admin/finance/payouts/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payoutId: row.payoutId,
          action: "mark_paid",
          reason: "manual_bank_settlement",
          transferReference: transferReference.trim() || null,
          notes: `Manual payout marked paid by admin${transferReference.trim() ? ` (${transferReference.trim()})` : ""}`,
        }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Failed to mark payout as paid.");
      setMessage("Marked as paid.");
      window.location.reload();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to mark payout as paid.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: "8px", minWidth: "220px" }}>
      <input
        value={transferReference}
        onChange={(event) => setTransferReference(event.target.value)}
        placeholder="UTR / UPI ref / bank ref"
        disabled={row.payoutStatus === "paid" || submitting}
        style={{
          borderRadius: "10px",
          border: "1px solid rgba(255,255,255,0.1)",
          background: "rgba(2,6,23,0.6)",
          color: "white",
          padding: "10px 12px",
        }}
      />
      <button
        onClick={markPaid}
        disabled={row.payoutStatus === "paid" || submitting}
        style={{
          borderRadius: "10px",
          border: "none",
          background: row.payoutStatus === "paid" ? "rgba(255,255,255,0.08)" : "#166534",
          color: "white",
          fontWeight: 800,
          padding: "10px 12px",
          cursor: row.payoutStatus === "paid" ? "not-allowed" : "pointer",
        }}
      >
        {submitting ? "Saving..." : row.payoutStatus === "paid" ? "Already Paid" : "Mark Paid"}
      </button>
      {message ? <div style={{ fontSize: "12px", color: "#86efac" }}>{message}</div> : null}
      {error ? <div style={{ fontSize: "12px", color: "#fca5a5" }}>{error}</div> : null}
    </div>
  );
}

export default function ManualPayoutDesk({ rows }: { rows: PayoutRow[] }) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const filteredRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((row) => {
      const matchesStatus = statusFilter === "all" || row.payoutStatus === statusFilter;
      if (!matchesStatus) return false;
      if (!needle) return true;
      return [
        row.partnerName,
        row.partnerEmail,
        row.guestName,
        row.partnerType,
        row.bookingId,
        row.payoutDestination,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle));
    });
  }, [query, rows, statusFilter]);

  const totalOutstanding = filteredRows
    .filter((row) => row.payoutStatus !== "paid")
    .reduce((sum, row) => sum + row.netTransferableAmount, 0);

  const hostOutstanding = filteredRows
    .filter((row) => row.partnerType === "host" && row.payoutStatus !== "paid")
    .reduce((sum, row) => sum + row.netTransferableAmount, 0);

  const hommieOutstanding = filteredRows
    .filter((row) => row.partnerType === "hommie" && row.payoutStatus !== "paid")
    .reduce((sum, row) => sum + row.netTransferableAmount, 0);

  return (
    <div style={{ display: "grid", gap: "18px" }}>
      <div>
        <h1 style={{ margin: 0, fontSize: "28px", fontWeight: 900, color: "white" }}>Manual Settlement Desk</h1>
        <p style={{ marginTop: "8px", color: "rgba(255,255,255,0.45)", fontSize: "13px", lineHeight: 1.6 }}>
          This is your payout operations screen. It shows what Famlo owes hosts and hommies after platform fee and GST math are
          already applied. After you pay manually by UPI or bank, mark the payout as paid here so finance stays in sync.
        </p>
      </div>

      <div style={{ display: "grid", gap: "16px", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
        {[
          { label: "Total Outstanding", value: totalOutstanding, accent: "#ffffff" },
          { label: "Hosts Outstanding", value: hostOutstanding, accent: "#93c5fd" },
          { label: "Hommies Outstanding", value: hommieOutstanding, accent: "#fbbf24" },
          { label: "Visible Payout Rows", value: filteredRows.length, accent: "#86efac", numeric: true },
        ].map((card) => (
          <div
            key={card.label}
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: "16px",
              padding: "18px",
            }}
          >
            <div style={{ fontSize: "11px", fontWeight: 800, color: "rgba(255,255,255,0.45)", textTransform: "uppercase" }}>{card.label}</div>
            <div style={{ marginTop: "10px", fontSize: "26px", fontWeight: 900, color: card.accent }}>
              {"numeric" in card && card.numeric ? String(card.value) : formatCurrency(card.value)}
            </div>
          </div>
        ))}
      </div>

      <div
        style={{
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: "16px",
          padding: "18px",
          display: "flex",
          gap: "12px",
          flexWrap: "wrap",
        }}
      >
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search partner, guest, booking, UPI"
          style={{
            borderRadius: "10px",
            border: "1px solid rgba(255,255,255,0.1)",
            background: "rgba(2,6,23,0.6)",
            color: "white",
            padding: "10px 12px",
            minWidth: "260px",
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
          <option value="scheduled">Scheduled</option>
          <option value="on_hold">On hold</option>
          <option value="processing">Processing</option>
          <option value="paid">Paid</option>
          <option value="failed">Failed</option>
        </select>
      </div>

      <div
        style={{
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: "16px",
          overflow: "hidden",
        }}
      >
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "1480px" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                {["Partner", "Type", "Guest", "Booking", "Booking Status", "Payout Status", "Gross", "Fee", "GST", "Net Owed", "Destination", "Created", "Action"].map((label) => (
                  <th key={label} style={{ padding: "12px 10px", fontSize: "11px", color: "rgba(255,255,255,0.45)", textTransform: "uppercase" }}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => (
                <tr key={row.payoutId} style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  <td style={{ padding: "14px 10px", color: "white", fontSize: "13px", fontWeight: 700 }}>
                    <div>{row.partnerName}</div>
                    <div style={{ color: "rgba(255,255,255,0.45)", fontSize: "12px", marginTop: "4px" }}>{row.partnerEmail || "No email"}</div>
                  </td>
                  <td style={{ padding: "14px 10px", color: "#cbd5e1", fontSize: "13px" }}>{row.partnerType}</td>
                  <td style={{ padding: "14px 10px", color: "#cbd5e1", fontSize: "13px" }}>{row.guestName || "Guest"}</td>
                  <td style={{ padding: "14px 10px", color: "white", fontSize: "13px", fontWeight: 700 }}>{row.bookingId.slice(0, 8)}</td>
                  <td style={{ padding: "14px 10px", color: "#cbd5e1", fontSize: "13px" }}>{row.bookingStatus}</td>
                  <td style={{ padding: "14px 10px", color: row.payoutStatus === "paid" ? "#86efac" : "#fbbf24", fontSize: "13px", fontWeight: 700 }}>{row.payoutStatus}</td>
                  <td style={{ padding: "14px 10px", color: "white", fontSize: "13px" }}>{formatCurrency(row.grossBookingValue)}</td>
                  <td style={{ padding: "14px 10px", color: "#86efac", fontSize: "13px" }}>{formatCurrency(row.platformFee)}</td>
                  <td style={{ padding: "14px 10px", color: "#fbbf24", fontSize: "13px" }}>{formatCurrency(row.platformFeeTax)}</td>
                  <td style={{ padding: "14px 10px", color: "#93c5fd", fontSize: "13px", fontWeight: 800 }}>{formatCurrency(row.netTransferableAmount)}</td>
                  <td style={{ padding: "14px 10px", color: "#cbd5e1", fontSize: "12px", lineHeight: 1.5 }}>
                    <div>{row.payoutMethod || "manual"}</div>
                    <div style={{ color: "rgba(255,255,255,0.45)", marginTop: "4px" }}>{row.payoutDestination || "No payout destination on record"}</div>
                  </td>
                  <td style={{ padding: "14px 10px", color: "#cbd5e1", fontSize: "13px" }}>{formatDate(row.createdAt)}</td>
                  <td style={{ padding: "14px 10px" }}>
                    <PayoutActionCell row={row} />
                  </td>
                </tr>
              ))}
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={13} style={{ padding: "18px 10px", color: "rgba(255,255,255,0.45)", fontSize: "13px" }}>
                    No payouts match the current filters.
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
