"use client";

import { useState } from "react";

type CancellationCase = {
  id: string;
  booking_id: string;
  requested_by: string;
  request_reason: string;
  status: string;
  gross_paid_amount_minor: number;
  suggested_refund_amount_minor: number;
  approved_refund_amount_minor: number | null;
  service_executive_notes: string | null;
  service_executive_recommendation: string | null;
  contact_status: string | null;
  requested_at: string;
  bookings_v2?: { status?: string; start_date?: string; end_date?: string; host_response_status?: string } | null;
  payments_v2?: { gateway?: string; status?: string; refund_status?: string } | null;
};

function money(minor: number): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(minor / 100);
}

export default function CancellationOperationsQueue({ initialCases, mode }: { initialCases: CancellationCase[]; mode: "team" | "admin" }) {
  const [cases, setCases] = useState(initialCases);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function teamAction(item: CancellationCase, action: string): Promise<void> {
    const notes = window.prompt("Internal notes (optional)", item.service_executive_notes ?? "") ?? "";
    setBusy(item.id); setError(null);
    try {
      const response = await fetch("/api/teams/cancellations", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestId: item.id, action, notes }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Update failed.");
      setCases((current) => current.map((row) => row.id === item.id ? { ...row, ...payload.cancellationRequest, service_executive_notes: notes } : row));
    } catch (nextError) { setError(nextError instanceof Error ? nextError.message : "Update failed."); }
    finally { setBusy(null); }
  }

  async function adminAction(item: CancellationCase, decision: "approve" | "reject"): Promise<void> {
    const defaultAmount = item.suggested_refund_amount_minor;
    const amountRupees = decision === "approve" ? window.prompt("Approved refund amount in INR", String(defaultAmount / 100)) : "0";
    if (amountRupees === null) return;
    const approvedRefundAmountMinor = Math.round(Number(amountRupees) * 100);
    const override = approvedRefundAmountMinor !== defaultAmount;
    const overrideReason = override ? window.prompt("Mandatory reason for changing the suggested refund") : "";
    if (override && !overrideReason?.trim()) { setError("An override reason is required."); return; }
    const notes = window.prompt("Admin notes (optional)") ?? "";
    setBusy(item.id); setError(null);
    try {
      const response = await fetch("/api/admin/finance/cancellations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestId: item.id, decision, approvedRefundAmountMinor, overrideReason, notes }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Decision failed.");
      setCases((current) => current.map((row) => row.id === item.id ? { ...row, status: String(payload.cancellationRequest?.request_status ?? (decision === "approve" ? "refund_pending" : "rejected")), approved_refund_amount_minor: approvedRefundAmountMinor } : row));
    } catch (nextError) { setError(nextError instanceof Error ? nextError.message : "Decision failed."); }
    finally { setBusy(null); }
  }

  return (
    <section style={{ display: "grid", gap: 16 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 24 }}>Cancellation requests</h1>
        <p style={{ color: "#64748b" }}>Booking state changes only after admin approval. Refund amounts shown here are server-calculated estimates.</p>
      </div>
      {error ? <div style={{ padding: 12, background: "#fee2e2", color: "#991b1b" }}>{error}</div> : null}
      {cases.length === 0 ? <div style={{ padding: 24, background: "white", border: "1px solid #e2e8f0" }}>No cancellation requests.</div> : cases.map((item) => (
        <article key={item.id} style={{ background: "white", color: "#0f172a", border: "1px solid #e2e8f0", padding: 18, display: "grid", gap: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <strong>Booking {item.booking_id.slice(0, 8)}</strong><span>{item.status.replaceAll("_", " ")}</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10, fontSize: 13 }}>
            <span>Requested by: {item.requested_by}</span><span>Reason: {item.request_reason.replaceAll("_", " ")}</span>
            <span>Paid: {money(item.gross_paid_amount_minor)}</span><span>Suggested: {money(item.suggested_refund_amount_minor)}</span>
            <span>Booking: {item.bookings_v2?.status ?? "unknown"}</span><span>Provider: {item.payments_v2?.gateway ?? "unknown"}</span>
          </div>
          {item.service_executive_notes ? <div style={{ fontSize: 13, color: "#475569" }}>Internal notes: {item.service_executive_notes}</div> : null}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {mode === "team" ? <>
              <button disabled={busy === item.id} onClick={() => void teamAction(item, "assign")}>Assign to me</button>
              <button disabled={busy === item.id} onClick={() => void teamAction(item, "guest_contacted")}>Guest contacted</button>
              <button disabled={busy === item.id} onClick={() => void teamAction(item, "guest_unreachable")}>Guest unreachable</button>
              <button disabled={busy === item.id} onClick={() => void teamAction(item, "recommend_approve")}>Recommend approve</button>
              <button disabled={busy === item.id} onClick={() => void teamAction(item, "recommend_reject")}>Recommend reject</button>
            </> : <>
              <button disabled={busy === item.id} onClick={() => void adminAction(item, "approve")}>Approve cancellation</button>
              <button disabled={busy === item.id} onClick={() => void adminAction(item, "reject")}>Reject cancellation</button>
            </>}
          </div>
        </article>
      ))}
    </section>
  );
}
