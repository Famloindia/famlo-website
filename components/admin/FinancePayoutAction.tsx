"use client";

import { useState } from "react";

function ActionButton({
  label,
  disabled,
  onClick,
  tone,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  tone: "neutral" | "danger" | "success";
}) {
  const background =
    tone === "danger" ? "#7f1d1d" : tone === "success" ? "#166534" : "rgba(255,255,255,0.12)";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        borderRadius: "10px",
        border: "none",
        background: disabled ? "rgba(255,255,255,0.08)" : background,
        color: "white",
        fontWeight: 800,
        padding: "11px 14px",
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      {label}
    </button>
  );
}

export default function FinancePayoutAction({
  payoutId,
  status,
}: {
  payoutId: string | null;
  status: string | null;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(action: "hold" | "release" | "mark_paid"): Promise<void> {
    if (!payoutId || submitting) return;
    setSubmitting(true);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch("/api/admin/finance/payouts/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payoutId,
          action,
          reason: `admin_${action}`,
        }),
      });
      const payload = (await response.json()) as { error?: string; status?: string };
      if (!response.ok) throw new Error(payload.error ?? "Failed to update payout.");
      setMessage(`Payout updated to ${payload.status ?? action}.`);
      window.location.reload();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to update payout.");
    } finally {
      setSubmitting(false);
    }
  }

  async function executeTransfer(): Promise<void> {
    if (!payoutId || submitting) return;
    setSubmitting(true);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch("/api/admin/finance/payouts/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payoutId }),
      });
      const payload = (await response.json()) as { error?: string; providerStatus?: string; errorMessage?: string };
      if (!response.ok) throw new Error(payload.error ?? payload.errorMessage ?? "Failed to execute payout.");
      setMessage(
        payload.errorMessage
          ? payload.errorMessage
          : `Payout execution attempted. Provider status: ${payload.providerStatus ?? "unknown"}.`
      );
      window.location.reload();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to execute payout.");
    } finally {
      setSubmitting(false);
    }
  }

  const canHold = Boolean(payoutId) && status !== "paid" && status !== "on_hold";
  const canRelease = Boolean(payoutId) && status === "on_hold";
  const canMarkPaid = Boolean(payoutId) && status !== "paid";

  return (
    <div
      style={{
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: "14px",
        padding: "18px",
      }}
    >
      <div style={{ fontSize: "14px", fontWeight: 900, color: "white" }}>Payout Controls</div>
      <div style={{ marginTop: "6px", fontSize: "12px", color: "rgba(255,255,255,0.55)" }}>
        Current payout status: {status ?? "none"}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "10px", marginTop: "14px" }}>
        <ActionButton label={submitting ? "Working..." : "Hold"} disabled={!canHold || submitting} onClick={() => submit("hold")} tone="danger" />
        <ActionButton label={submitting ? "Working..." : "Release"} disabled={!canRelease || submitting} onClick={() => submit("release")} tone="neutral" />
        <ActionButton label={submitting ? "Working..." : "Mark Paid"} disabled={!canMarkPaid || submitting} onClick={() => submit("mark_paid")} tone="success" />
      </div>
      <button
        onClick={executeTransfer}
        disabled={!payoutId || submitting || status === "paid"}
        style={{
          marginTop: "12px",
          width: "100%",
          borderRadius: "10px",
          border: "none",
          background: !payoutId || status === "paid" ? "rgba(255,255,255,0.08)" : "#165dcc",
          color: "white",
          fontWeight: 800,
          padding: "11px 14px",
          cursor: !payoutId || status === "paid" ? "not-allowed" : "pointer",
        }}
      >
        {submitting ? "Working..." : "Execute Transfer"}
      </button>

      {message ? <div style={{ marginTop: "10px", fontSize: "12px", color: "#86efac" }}>{message}</div> : null}
      {error ? <div style={{ marginTop: "10px", fontSize: "12px", color: "#fca5a5" }}>{error}</div> : null}
    </div>
  );
}
