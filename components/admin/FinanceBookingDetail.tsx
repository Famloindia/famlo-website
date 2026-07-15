"use client";

import type { ReactNode } from "react";

import type { SafeTaxDisplayState } from "@/lib/finance/tax-compliance-guard";

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
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDateTime(value: string | null): string {
  if (!value) return "N/A";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function Block({ title, children }: { title: string; children: ReactNode }) {
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

function MetaRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div style={{ color: "#cbd5e1", fontSize: "14px", lineHeight: 1.6 }}>
      <strong style={{ color: "white" }}>{label}:</strong> {value}
    </div>
  );
}

function renderBadge(label: string, tone: "neutral" | "good" | "warning" | "danger"): ReactNode {
  const palette =
    tone === "good"
      ? { background: "rgba(134,239,172,0.16)", color: "#bbf7d0" }
      : tone === "warning"
        ? { background: "rgba(251,191,36,0.16)", color: "#fde68a" }
        : tone === "danger"
          ? { background: "rgba(248,113,113,0.16)", color: "#fecaca" }
          : { background: "rgba(255,255,255,0.08)", color: "#e2e8f0" };

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        borderRadius: "999px",
        padding: "6px 10px",
        fontSize: "12px",
        fontWeight: 800,
        ...palette,
      }}
    >
      {label}
    </span>
  );
}

export default function FinanceBookingDetail({
  financeUiEnabled,
  booking,
  payment,
  reservation,
  folio,
  folioLineItems,
  activeSettlement,
  activeSettlementLine,
  snapshots,
  events,
  ledger,
  payouts,
  refunds,
  cancellation,
  taxDisplay,
}: {
  financeUiEnabled: boolean;
  booking: JsonRecord | null;
  payment: JsonRecord | null;
  reservation: JsonRecord | null;
  folio: JsonRecord | null;
  folioLineItems: JsonRecord[];
  activeSettlement: JsonRecord | null;
  activeSettlementLine: JsonRecord | null;
  snapshots: JsonRecord[];
  events: JsonRecord[];
  ledger: JsonRecord[];
  payouts: JsonRecord[];
  refunds: JsonRecord[];
  cancellation: JsonRecord | null;
  taxDisplay: SafeTaxDisplayState;
}) {
  const sourceChannel = readString(folio?.source_channel) ?? readString(reservation?.source_channel) ?? readString(booking?.source_channel) ?? "famlo_direct";
  const isDirect = sourceChannel === "famlo_direct" || sourceChannel === "direct" || sourceChannel === "famlo";
  const paymentCollectMode = readString((folio?.metadata as JsonRecord | null)?.payment_collect_mode) ?? "N/A";
  const ambiguityWarnings = Array.isArray((folio?.metadata as JsonRecord | null)?.ambiguity_warnings)
    ? ((folio?.metadata as JsonRecord | null)?.ambiguity_warnings as unknown[]).map((value) => String(value))
    : [];
  const settlementBlockedReason = readString((folio?.metadata as JsonRecord | null)?.settlement_blocked_reason);
  const taxMode = readString(folio?.tax_mode) ?? "PENDING_COMPLIANCE";
  const guestTotalAmount = readNumber(folio?.guest_total_amount ?? payment?.amount_total ?? booking?.total_price);
  const platformFeeAmount = readNumber(folio?.platform_fee_amount ?? payment?.platform_fee);
  const refundTotalAmount = readNumber(folio?.refund_total_amount);
  const hostPayoutAmount = readNumber(folio?.host_payout_amount ?? payment?.partner_payout_amount ?? booking?.partner_payout_amount);
  const calculationSnapshotId = readString(folio?.calculation_snapshot_id) ?? readString(snapshots[0]?.id);

  return (
    <div style={{ display: "grid", gap: "18px" }}>
      <div style={{ display: "grid", gap: "16px", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
        <SummaryCard label="Guest Total" value={formatCurrency(guestTotalAmount)} accent="#ffffff" />
        <SummaryCard label="Platform Fee" value={formatCurrency(platformFeeAmount)} accent="#86efac" />
        <SummaryCard label="Refund Total" value={formatCurrency(refundTotalAmount)} accent="#fbbf24" />
        <SummaryCard label="Host Payout" value={formatCurrency(hostPayoutAmount)} accent="#93c5fd" />
      </div>

      {!financeUiEnabled ? (
        <Block title="Finance UI Disabled">
          <div style={{ color: "#cbd5e1", fontSize: "14px", lineHeight: 1.7 }}>
            `ADMIN_FINANCE_FOLIO_UI_ENABLED` is off. This page is still rendering the raw finance proof payload for internal review, but richer admin settlement actions and folio read surfaces remain feature-flagged.
          </div>
        </Block>
      ) : null}

      <div style={{ display: "grid", gap: "18px", gridTemplateColumns: "minmax(0, 1.2fr) minmax(320px, 0.8fr)" }}>
        <Block title="Booking Finance Truth">
          <div style={{ display: "grid", gap: "10px" }}>
            <MetaRow label="Booking id" value={readString(booking?.id) ?? "N/A"} />
            <MetaRow label="Source channel" value={sourceChannel} />
            <MetaRow label="Source type" value={isDirect ? renderBadge("Direct", "good") : renderBadge("OTA", "warning")} />
            <MetaRow label="Payment collect mode" value={paymentCollectMode} />
            <MetaRow
              label="External OTA guest"
              value={Boolean((folio?.metadata as JsonRecord | null)?.finance_guest_identity_mode === "external_ota_guest") ? "Yes" : "No"}
            />
            <MetaRow label="Booking status" value={readString(folio?.booking_status) ?? readString(booking?.status) ?? "unknown"} />
            <MetaRow label="Payment status" value={readString(folio?.payment_status) ?? readString(payment?.status) ?? "unknown"} />
            <MetaRow label="Guest total amount" value={formatCurrency(guestTotalAmount)} />
            <MetaRow label="Platform fee" value={formatCurrency(platformFeeAmount)} />
            <MetaRow label="Platform fee tax" value={formatCurrency(0)} />
            <MetaRow label="Refund total" value={formatCurrency(refundTotalAmount)} />
            <MetaRow label="Host payout amount" value={formatCurrency(hostPayoutAmount)} />
            <MetaRow label="Calculation snapshot/version" value={calculationSnapshotId ?? "N/A"} />
            <MetaRow label="Tax mode" value={taxDisplay.taxMode ?? taxMode} />
            <MetaRow label="GST collection" value={taxDisplay.gstCollectionLabel} />
            <MetaRow label="TCS" value={taxDisplay.tcsLabel} />
            <MetaRow label="TDS" value={taxDisplay.tdsLabel} />
          </div>
        </Block>

        <Block title="Settlement & Warnings">
          <div style={{ display: "grid", gap: "10px" }}>
            <MetaRow
              label="Active settlement inclusion"
              value={
                activeSettlement?.id
                  ? renderBadge(`Included in ${String(activeSettlement.status ?? "draft")}`, "good")
                  : renderBadge("Not included", "neutral")
              }
            />
            <MetaRow label="Settlement id" value={readString(activeSettlement?.id) ?? "N/A"} />
            <MetaRow label="Settlement code" value={readString(activeSettlement?.settlement_code) ?? "N/A"} />
            <MetaRow label="Settlement period" value={activeSettlement ? `${String(activeSettlement.period_start ?? "N/A")} -> ${String(activeSettlement.period_end ?? "N/A")}` : "N/A"} />
            <MetaRow label="Line inclusion id" value={readString(activeSettlementLine?.id) ?? "N/A"} />
            <MetaRow label="Settlement blocked reason" value={settlementBlockedReason ?? "None"} />
            <MetaRow label="Tax compliance status" value={taxDisplay.complianceStatus} />
            <MetaRow
              label="Ambiguity warnings"
              value={
                ambiguityWarnings.length > 0 ? (
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    {ambiguityWarnings.map((warning) => (
                      <span key={warning}>{renderBadge(warning, "warning")}</span>
                    ))}
                  </div>
                ) : (
                  "None"
                )
              }
            />
            <MetaRow label="Cancellation record" value={cancellation ? formatDateTime(readString(cancellation.cancelledAt)) : "None"} />
            <MetaRow label="Tax safety note" value={taxDisplay.adminTaxMessage} />
          </div>
        </Block>
      </div>

      <Block title="Folio Header">
        <pre style={{ margin: 0, whiteSpace: "pre-wrap", color: "#cbd5e1", fontSize: "12px" }}>{pretty(folio)}</pre>
      </Block>

      <Block title="Folio Proof Lines">
        {folioLineItems.length > 0 ? (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "980px" }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                  {["Occurred", "Line", "Type", "Direction", "Amount", "Event", "Event ID", "Idempotency"].map((label) => (
                    <th key={label} style={{ padding: "12px 10px", fontSize: "11px", color: "rgba(255,255,255,0.45)", textTransform: "uppercase" }}>
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {folioLineItems.map((line, index) => (
                  <tr
                    key={String(line.id ?? `${readString(line.source_event_id) ?? "line"}:${readString(line.line_code) ?? "unknown"}:${index}`)}
                    style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
                  >
                    <td style={{ padding: "12px 10px", color: "#cbd5e1", fontSize: "12px" }}>{formatDateTime(readString(line.occurred_at))}</td>
                    <td style={{ padding: "12px 10px", color: "white", fontSize: "12px", fontWeight: 700 }}>{readString(line.line_code) ?? readString(line.line_type) ?? "N/A"}</td>
                    <td style={{ padding: "12px 10px", color: "#cbd5e1", fontSize: "12px" }}>{readString(line.line_type) ?? "N/A"}</td>
                    <td style={{ padding: "12px 10px", color: "#cbd5e1", fontSize: "12px" }}>{readString(line.direction) ?? "N/A"}</td>
                    <td style={{ padding: "12px 10px", color: "white", fontSize: "12px" }}>{formatCurrency(readNumber(line.amount))}</td>
                    <td style={{ padding: "12px 10px", color: "#cbd5e1", fontSize: "12px" }}>{readString(line.source_event_type) ?? "N/A"}</td>
                    <td style={{ padding: "12px 10px", color: "#cbd5e1", fontSize: "12px" }}>{readString(line.source_event_id) ?? "N/A"}</td>
                    <td style={{ padding: "12px 10px", color: "#94a3b8", fontSize: "11px", wordBreak: "break-all" }}>{readString(line.idempotency_key) ?? "N/A"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ color: "#cbd5e1", fontSize: "14px" }}>No folio proof lines found for this booking yet.</div>
        )}
      </Block>

      <Block title="Reservation">
        <pre style={{ margin: 0, whiteSpace: "pre-wrap", color: "#cbd5e1", fontSize: "12px" }}>{pretty(reservation)}</pre>
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
      <Block title="Cancellation">
        <pre style={{ margin: 0, whiteSpace: "pre-wrap", color: "#cbd5e1", fontSize: "12px" }}>{pretty(cancellation)}</pre>
      </Block>
    </div>
  );
}
