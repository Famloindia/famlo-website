"use client";

import { useState } from "react";

function ActionCard({
  title,
  description,
  buttonLabel,
  onRun,
  disabled,
}: {
  title: string;
  description: string;
  buttonLabel: string;
  onRun: () => Promise<void>;
  disabled?: boolean;
}) {
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleRun(): Promise<void> {
    if (running || disabled) return;
    setRunning(true);
    setMessage(null);
    setError(null);
    try {
      await onRun();
      setMessage("Done.");
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : "Operation failed.");
    } finally {
      setRunning(false);
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
      <div style={{ fontSize: "14px", fontWeight: 900, color: "white" }}>{title}</div>
      <div style={{ marginTop: "6px", fontSize: "12px", color: "rgba(255,255,255,0.55)", lineHeight: 1.5 }}>{description}</div>
      <button
        onClick={handleRun}
        disabled={running || disabled}
        style={{
          marginTop: "14px",
          borderRadius: "10px",
          border: "none",
          background: disabled ? "rgba(255,255,255,0.08)" : "#165dcc",
          color: "white",
          fontWeight: 800,
          padding: "11px 14px",
          cursor: disabled ? "not-allowed" : "pointer",
        }}
      >
        {running ? "Working..." : buttonLabel}
      </button>
      {message ? <div style={{ marginTop: "10px", fontSize: "12px", color: "#86efac" }}>{message}</div> : null}
      {error ? <div style={{ marginTop: "10px", fontSize: "12px", color: "#fca5a5" }}>{error}</div> : null}
    </div>
  );
}

export default function FinanceOpsAction({
  bookingId,
  refundId,
}: {
  bookingId: string | null;
  refundId: string | null;
}) {
  async function post(url: string, body: Record<string, unknown>): Promise<void> {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) throw new Error(payload.error ?? "Operation failed.");
    window.location.reload();
  }

  return (
    <div style={{ display: "grid", gap: "18px", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
      <ActionCard
        title="Generate Invoice"
        description="Create an invoice row for this booking from the current payment snapshot."
        buttonLabel="Create Invoice"
        disabled={!bookingId}
        onRun={() => post("/api/admin/finance/invoices/create", { bookingId })}
      />
      <ActionCard
        title="Generate Credit Note"
        description="Create a credit note row from the latest refund for tax and reporting operations."
        buttonLabel="Create Credit Note"
        disabled={!refundId}
        onRun={() => post("/api/admin/finance/credit-notes/create", { refundId })}
      />
      <ActionCard
        title="Run Reconciliation"
        description="Compare internal payments against Razorpay payment status and write a reconciliation run."
        buttonLabel="Run Reconciliation"
        onRun={() => post("/api/admin/finance/reconciliation/run", {})}
      />
    </div>
  );
}
