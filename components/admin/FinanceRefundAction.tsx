"use client";

import { useState } from "react";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

export default function FinanceRefundAction({
  bookingId,
  paymentId,
  maxRefundAmount,
  refundStatus,
  adminId,
}: {
  bookingId: string;
  paymentId: string | null;
  maxRefundAmount: number;
  refundStatus: string | null;
  adminId: string;
}) {
  const [amount, setAmount] = useState<string>(String(Math.max(0, Math.round(maxRefundAmount))));
  const [reason, setReason] = useState("manual_admin_refund");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canRefund = Boolean(paymentId) && maxRefundAmount > 0 && refundStatus !== "full";

  async function handleSubmit(): Promise<void> {
    if (!paymentId || submitting) return;

    setSubmitting(true);
    setMessage(null);
    setError(null);

    try {
      const numericAmount = Math.max(0, Math.round(Number(amount) || 0));
      const response = await fetch("/api/admin/finance/refunds/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          bookingId,
          paymentId,
          amount: numericAmount > 0 ? numericAmount : undefined,
          reason,
          adminId,
        }),
      });

      const payload = (await response.json()) as { error?: string; note?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to create refund.");
      }

      setMessage(payload.note ?? "Refund recorded.");
      window.location.reload();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to create refund.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      style={{
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: "14px",
        padding: "18px",
      }}
    >
      <div style={{ fontSize: "14px", fontWeight: 900, color: "white" }}>Create Refund</div>
      <div style={{ marginTop: "6px", fontSize: "12px", color: "rgba(255,255,255,0.55)" }}>
        Max refundable now: {formatCurrency(maxRefundAmount)}
      </div>

      <div style={{ display: "grid", gap: "12px", marginTop: "14px" }}>
        <label style={{ display: "grid", gap: "6px" }}>
          <span style={{ fontSize: "12px", fontWeight: 700, color: "rgba(255,255,255,0.7)" }}>Amount</span>
          <input
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            inputMode="numeric"
            disabled={!canRefund || submitting}
            style={{
              borderRadius: "10px",
              border: "1px solid rgba(255,255,255,0.1)",
              background: "rgba(2,6,23,0.6)",
              color: "white",
              padding: "10px 12px",
            }}
          />
        </label>

        <label style={{ display: "grid", gap: "6px" }}>
          <span style={{ fontSize: "12px", fontWeight: 700, color: "rgba(255,255,255,0.7)" }}>Reason</span>
          <input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            disabled={!canRefund || submitting}
            style={{
              borderRadius: "10px",
              border: "1px solid rgba(255,255,255,0.1)",
              background: "rgba(2,6,23,0.6)",
              color: "white",
              padding: "10px 12px",
            }}
          />
        </label>

        <button
          onClick={handleSubmit}
          disabled={!canRefund || submitting}
          style={{
            borderRadius: "10px",
            border: "none",
            background: canRefund ? "#dc2626" : "rgba(255,255,255,0.1)",
            color: "white",
            fontWeight: 800,
            padding: "11px 14px",
            cursor: canRefund ? "pointer" : "not-allowed",
          }}
        >
          {submitting ? "Creating Refund..." : "Create Refund"}
        </button>
      </div>

      {!canRefund ? (
        <div style={{ marginTop: "10px", fontSize: "12px", color: "rgba(255,255,255,0.45)" }}>
          Refund action is unavailable when payment is missing, fully refunded, or amount is zero.
        </div>
      ) : null}

      {message ? <div style={{ marginTop: "10px", fontSize: "12px", color: "#86efac" }}>{message}</div> : null}
      {error ? <div style={{ marginTop: "10px", fontSize: "12px", color: "#fca5a5" }}>{error}</div> : null}
    </div>
  );
}
