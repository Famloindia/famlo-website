"use client";

import FinanceRefundAction from "@/components/admin/FinanceRefundAction";
import FinanceOpsAction from "@/components/admin/FinanceOpsAction";
import FinancePayoutAction from "@/components/admin/FinancePayoutAction";

type JsonRecord = Record<string, unknown>;

function pretty(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function readNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

function SummaryCard({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: "14px",
        padding: "16px",
      }}
    >
      <div style={{ fontSize: "11px", fontWeight: 800, color: "rgba(255,255,255,0.45)", textTransform: "uppercase" }}>{label}</div>
      <div style={{ marginTop: "8px", fontSize: "24px", fontWeight: 900, color: accent }}>{value}</div>
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section
      style={{
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: "18px",
        padding: "22px",
      }}
    >
      <div style={{ fontSize: "15px", fontWeight: 900, color: "white", marginBottom: "14px" }}>{title}</div>
      {children}
    </section>
  );
}

type CancellationRecord = {
  bookingId: string;
  bookingStatus: string | null;
  paymentStatus: string | null;
  bookingAmount: number;
  guestName: string;
  cancelledAt: string;
  cancelledByName: string;
  cancelledByRole: string;
  cancellationReason: string | null;
  refundAmount: number;
  refundStatus: string | null;
  refundReasonCode: string | null;
  refundInitiatedByName: string | null;
  refundInitiatedByRole: string | null;
  refundInitiatedAt: string | null;
  refundProcessedAt: string | null;
};

export default function FinanceBookingDetail({
  booking,
  payment,
  snapshots,
  events,
  ledger,
  payouts,
  refunds,
  cancellation,
  adminId,
}: {
  booking: JsonRecord | null;
  payment: JsonRecord | null;
  snapshots: JsonRecord[];
  events: JsonRecord[];
  ledger: JsonRecord[];
  payouts: JsonRecord[];
  refunds: JsonRecord[];
  cancellation: CancellationRecord | null;
  adminId: string;
}) {
  const paymentId = readString(payment?.id);
  const amountTotal = readNumber(payment?.amount_total);
  const platformFee = readNumber(payment?.platform_fee);
  const taxAmount = readNumber(payment?.tax_amount);
  const partnerPayoutAmount = readNumber(payment?.partner_payout_amount);
  const refundStatus = readString(payment?.refund_status);
  const latestSnapshot = snapshots[0] ?? null;
  const latestRefund = refunds[0] ?? null;
  const latestPayout = payouts[0] ?? null;
  const refundedAmount = latestRefund ? readNumber(latestRefund.amount_total) : 0;
  const maxRefundAmount = Math.max(0, amountTotal - refundedAmount);

  return (
    <div style={{ display: "grid", gap: "18px" }}>
      <div style={{ display: "grid", gap: "16px", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
        <SummaryCard label="Guest Total" value={formatCurrency(amountTotal)} accent="#ffffff" />
        <SummaryCard label="Platform Fee" value={formatCurrency(platformFee)} accent="#86efac" />
        <SummaryCard label="Tax Liability" value={formatCurrency(taxAmount)} accent="#fbbf24" />
        <SummaryCard label="Partner Payout" value={formatCurrency(partnerPayoutAmount)} accent="#93c5fd" />
      </div>

      <div style={{ display: "grid", gap: "18px", gridTemplateColumns: "minmax(0, 1.5fr) minmax(320px, 1fr)" }}>
        <Block title="Cancellation & Refund">
          {cancellation ? (
            <div style={{ display: "grid", gap: "12px" }}>
              <div style={{ color: "#cbd5e1", fontSize: "14px" }}>
                <strong style={{ color: "white" }}>Cancelled at:</strong> {new Date(cancellation.cancelledAt).toLocaleString("en-IN")}
              </div>
              <div style={{ color: "#cbd5e1", fontSize: "14px" }}>
                <strong style={{ color: "white" }}>Cancelled by:</strong> {cancellation.cancelledByName} ({cancellation.cancelledByRole})
              </div>
              <div style={{ color: "#cbd5e1", fontSize: "14px" }}>
                <strong style={{ color: "white" }}>Reason:</strong> {cancellation.cancellationReason ?? "No reason recorded"}
              </div>
              <div style={{ color: "#cbd5e1", fontSize: "14px" }}>
                <strong style={{ color: "white" }}>Refund amount:</strong> {formatCurrency(cancellation.refundAmount)}
              </div>
              <div style={{ color: "#cbd5e1", fontSize: "14px" }}>
                <strong style={{ color: "white" }}>Refund status:</strong> {cancellation.refundStatus ?? "none"}
              </div>
              {cancellation.refundReasonCode ? (
                <div style={{ color: "#cbd5e1", fontSize: "14px" }}>
                  <strong style={{ color: "white" }}>Refund reason code:</strong> {cancellation.refundReasonCode}
                </div>
              ) : null}
              <div style={{ color: "#cbd5e1", fontSize: "14px" }}>
                <strong style={{ color: "white" }}>Refund initiated by:</strong> {cancellation.refundInitiatedByName ?? "—"}
                {cancellation.refundInitiatedByRole ? ` (${cancellation.refundInitiatedByRole})` : ""}
              </div>
              <div style={{ color: "#cbd5e1", fontSize: "14px" }}>
                <strong style={{ color: "white" }}>Refund initiated at:</strong> {cancellation.refundInitiatedAt ? new Date(cancellation.refundInitiatedAt).toLocaleString("en-IN") : "—"}
              </div>
            </div>
          ) : (
            <div style={{ color: "#cbd5e1", fontSize: "14px", lineHeight: 1.6 }}>
              No cancellation record was found for this booking yet. If the booking was canceled through an older flow, only the payment and booking rows may be available.
            </div>
          )}
        </Block>

        <Block title="Operational Summary">
          <div style={{ display: "grid", gap: "12px" }}>
            <div style={{ color: "#cbd5e1", fontSize: "14px" }}>
              <strong style={{ color: "white" }}>Booking status:</strong> {readString(booking?.status) ?? "unknown"}
            </div>
            <div style={{ color: "#cbd5e1", fontSize: "14px" }}>
              <strong style={{ color: "white" }}>Payment status:</strong> {readString(booking?.payment_status) ?? readString(payment?.status) ?? "unknown"}
            </div>
            <div style={{ color: "#cbd5e1", fontSize: "14px" }}>
              <strong style={{ color: "white" }}>Calculation mode:</strong> {readString(payment?.calculation_mode) ?? readString(latestSnapshot?.calculation_mode) ?? "commission_gst_only"}
            </div>
            <div style={{ color: "#cbd5e1", fontSize: "14px" }}>
              <strong style={{ color: "white" }}>Latest refund status:</strong> {refundStatus ?? "none"}
            </div>
            <div style={{ color: "#cbd5e1", fontSize: "14px" }}>
              <strong style={{ color: "white" }}>Ledger entries:</strong> {ledger.length}
            </div>
            <div style={{ color: "#cbd5e1", fontSize: "14px" }}>
              <strong style={{ color: "white" }}>Payout rows:</strong> {payouts.length}
            </div>
            <div style={{ color: "#cbd5e1", fontSize: "14px" }}>
              <strong style={{ color: "white" }}>Payment events:</strong> {events.length}
            </div>
          </div>
        </Block>

        <FinanceRefundAction
          bookingId={readString(booking?.id) ?? ""}
          paymentId={paymentId}
          maxRefundAmount={maxRefundAmount}
          refundStatus={refundStatus}
          adminId={adminId}
        />
      </div>

      <FinancePayoutAction
        payoutId={readString(latestPayout?.id)}
        status={readString(latestPayout?.status)}
      />

      <FinanceOpsAction
        bookingId={readString(booking?.id)}
        refundId={readString(latestRefund?.id)}
      />

      <Block title="Booking">
        <pre style={{ margin: 0, whiteSpace: "pre-wrap", color: "#cbd5e1", fontSize: "12px" }}>{pretty(booking)}</pre>
      </Block>
      <Block title="Payment">
        <pre style={{ margin: 0, whiteSpace: "pre-wrap", color: "#cbd5e1", fontSize: "12px" }}>{pretty(payment)}</pre>
      </Block>
      <Block title="Financial Snapshots">
        <pre style={{ margin: 0, whiteSpace: "pre-wrap", color: "#cbd5e1", fontSize: "12px" }}>{pretty(snapshots)}</pre>
      </Block>
      <Block title="Payment Events">
        <pre style={{ margin: 0, whiteSpace: "pre-wrap", color: "#cbd5e1", fontSize: "12px" }}>{pretty(events)}</pre>
      </Block>
      <Block title="Ledger">
        <pre style={{ margin: 0, whiteSpace: "pre-wrap", color: "#cbd5e1", fontSize: "12px" }}>{pretty(ledger)}</pre>
      </Block>
      <Block title="Payouts">
        <pre style={{ margin: 0, whiteSpace: "pre-wrap", color: "#cbd5e1", fontSize: "12px" }}>{pretty(payouts)}</pre>
      </Block>
      <Block title="Refunds">
        <pre style={{ margin: 0, whiteSpace: "pre-wrap", color: "#cbd5e1", fontSize: "12px" }}>{pretty(refunds)}</pre>
      </Block>
    </div>
  );
}
