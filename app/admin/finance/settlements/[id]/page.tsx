import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { CSSProperties, ReactNode } from "react";

import AdminLayout from "@/components/admin/AdminLayout";
import SettlementStatusActions from "@/components/admin/SettlementStatusActions";
import { getAdminCookieName, verifyAdminSessionToken } from "@/lib/admin-auth";
import {
  isAdminSettlementActionsEnabled,
  isAdminSettlementCancelEnabled,
  isFinanceExportsEnabled,
  isSettlementApprovalFlowEnabled,
} from "@/lib/finance/feature-flags";
import { getFinanceSettings } from "@/lib/finance/settings";
import { getSettlementById } from "@/lib/finance/settlement-engine";
import { getSafeTaxDisplayState } from "@/lib/finance/tax-compliance-guard";
import { createAdminSupabaseClient } from "@/lib/supabase";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
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

export default async function AdminSettlementDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const cookieStore = await cookies();
  const isAuthenticated = verifyAdminSessionToken(cookieStore.get(getAdminCookieName())?.value);
  if (!isAuthenticated) redirect("/admin");

  const { id } = await params;
  const supabase = createAdminSupabaseClient();
  const { data: killSwitchData } = await supabase
    .from("platform_settings")
    .select("value")
    .eq("key", "kill_switch_active")
    .single();
  const killSwitchActive = killSwitchData?.value === "true";

  const detail = await getSettlementById(supabase, id);
  const taxDisplay = getSafeTaxDisplayState(await getFinanceSettings({ scopeType: "GLOBAL", scopeId: null }, supabase));
  if (!detail.settlement) {
    redirect("/admin/finance/settlements/candidates");
  }

  const bookingIds = detail.lineItems.map((item) => readString(item.booking_id)).filter(Boolean) as string[];
  const folioIds = detail.lineItems.map((item) => readString(item.folio_id)).filter(Boolean) as string[];
  const [{ data: bookings }, { data: folios }] = await Promise.all([
    bookingIds.length > 0 ? supabase.from("bookings_v2").select("id,source_channel,status,payment_status").in("id", bookingIds) : { data: [] as any[] },
    folioIds.length > 0 ? supabase.from("reservation_folios_v2").select("id,booking_id,source_channel,host_payout_amount,metadata").in("id", folioIds) : { data: [] as any[] },
  ]);

  const bookingMap = new Map((bookings ?? []).map((booking) => [booking.id, booking]));
  const folioMap = new Map((folios ?? []).map((folio) => [folio.id, folio]));

  return (
    <AdminLayout
      admin={{ id: "system-admin", name: "Famlo Admin", email: "admin@famlo.in" }}
      activeTab="finance"
      killSwitchActive={killSwitchActive}
    >
      <div style={{ maxWidth: "1180px", margin: "0 auto", display: "grid", gap: "18px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "16px", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: "12px", color: "#93c5fd", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" }}>
              Settlement Detail
            </div>
            <h1 style={{ margin: "10px 0 0", fontSize: "30px", fontWeight: 900, color: "white" }}>
              {readString(detail.settlement.settlement_code) ?? id}
            </h1>
          </div>
          <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
            <Link href="/admin/finance/settlements/candidates" style={pillStyle("#e2e8f0", "rgba(255,255,255,0.08)")}>
              Back to Candidates
            </Link>
            <SettlementStatusActions
              settlementId={id}
              currentStatus={readString(detail.settlement.status)}
              canApprove={isAdminSettlementActionsEnabled() && isSettlementApprovalFlowEnabled()}
              canCancel={isAdminSettlementActionsEnabled() && isAdminSettlementCancelEnabled()}
            />
          </div>
        </div>

        <section style={panelStyle}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "12px" }}>
            <MetricCard label="Status" value={String(detail.settlement.status ?? "draft")} accent="#ffffff" />
            <MetricCard label="Gross booking value" value={formatCurrency(readNumber(detail.settlement.gross_booking_value))} accent="#86efac" />
            <MetricCard label="Platform fee" value={formatCurrency(readNumber(detail.settlement.platform_fee_amount))} accent="#bbf7d0" />
            <MetricCard label="Net payable" value={formatCurrency(readNumber(detail.settlement.net_payable_amount))} accent="#93c5fd" />
          </div>
          <div style={{ display: "grid", gap: "10px", marginTop: "16px" }}>
            <MetaRow label="Host id" value={readString(detail.settlement.host_id) ?? "N/A"} />
            <MetaRow label="Property id" value={readString(detail.settlement.property_id) ?? "N/A"} />
            <MetaRow label="Currency" value={readString(detail.settlement.currency) ?? "INR"} />
            <MetaRow label="Period" value={`${String(detail.settlement.period_start ?? "N/A")} -> ${String(detail.settlement.period_end ?? "N/A")}`} />
            <MetaRow label="Platform fee tax" value={formatCurrency(0)} />
            <MetaRow label="Refund adjustment" value={formatCurrency(readNumber(detail.settlement.refund_adjustment_amount))} />
            <MetaRow label="Withholding" value={formatCurrency(0)} />
            <MetaRow label="Included booking count" value={String(detail.settlement.included_booking_count ?? detail.lineItems.length)} />
            <MetaRow label="Transfer reference" value={readString(detail.settlement.transfer_reference) ?? "Manual / not set"} />
            <MetaRow label="Tax mode" value={taxDisplay.taxMode} />
            <MetaRow label="GST collection" value={taxDisplay.gstCollectionLabel} />
            <MetaRow label="TCS" value={taxDisplay.tcsLabel} />
            <MetaRow label="TDS" value={taxDisplay.tdsLabel} />
            <MetaRow label="Exports" value={isFinanceExportsEnabled() ? "Enabled (not implemented in this batch)" : "Disabled"} />
          </div>
        </section>

        <section style={panelStyle}>
          <div style={{ fontSize: "15px", fontWeight: 900, color: "white", marginBottom: "14px" }}>Frozen Settlement Line Items</div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "1100px" }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                  {["Booking", "Folio", "Amount", "Source", "Booking Status", "Payment Status", "Collect Mode", "Reference"].map((label) => (
                    <th key={label} style={tableHeadStyle}>
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {detail.lineItems.map((lineItem) => {
                  const bookingId = readString(lineItem.booking_id);
                  const folioId = readString(lineItem.folio_id);
                  const booking = bookingId ? bookingMap.get(bookingId) : null;
                  const folio = folioId ? folioMap.get(folioId) : null;
                  const meta = folio?.metadata && typeof folio.metadata === "object" ? (folio.metadata as Record<string, unknown>) : {};
                  return (
                    <tr key={String(lineItem.id)} style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                      <td style={tableBodyStyle}>
                        {bookingId ? <Link href={`/admin/finance/bookings/${bookingId}`} style={linkStyle}>{bookingId.slice(0, 8)}</Link> : "N/A"}
                      </td>
                      <td style={tableBodyStyle}>{folioId ? folioId.slice(0, 8) : "N/A"}</td>
                      <td style={{ ...tableBodyStyle, color: "#93c5fd" }}>{formatCurrency(readNumber(lineItem.amount))}</td>
                      <td style={tableBodyStyle}>{readString(booking?.source_channel) ?? readString(folio?.source_channel) ?? "N/A"}</td>
                      <td style={tableBodyStyle}>{readString(booking?.status) ?? "N/A"}</td>
                      <td style={tableBodyStyle}>{readString(booking?.payment_status) ?? "N/A"}</td>
                      <td style={tableBodyStyle}>{readString(meta.payment_collect_mode) ?? "N/A"}</td>
                      <td style={tableBodyStyle}>{readString(lineItem.reference_id) ?? "N/A"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </AdminLayout>
  );
}

function MetaRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div style={{ color: "#cbd5e1", fontSize: "14px", lineHeight: 1.6 }}>
      <strong style={{ color: "white" }}>{label}:</strong> {value}
    </div>
  );
}

function MetricCard({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "14px", padding: "16px" }}>
      <div style={{ fontSize: "11px", fontWeight: 800, color: "rgba(255,255,255,0.45)", textTransform: "uppercase" }}>{label}</div>
      <div style={{ marginTop: "8px", fontSize: "24px", fontWeight: 900, color: accent }}>{value}</div>
    </div>
  );
}

const panelStyle = {
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: "18px",
  padding: "22px",
} satisfies CSSProperties;

const tableHeadStyle = {
  padding: "12px 10px",
  fontSize: "11px",
  color: "rgba(255,255,255,0.45)",
  textTransform: "uppercase",
} satisfies CSSProperties;

const tableBodyStyle = {
  padding: "12px 10px",
  color: "#cbd5e1",
  fontSize: "13px",
} satisfies CSSProperties;

const linkStyle = {
  color: "#bfdbfe",
  textDecoration: "none",
  fontWeight: 700,
} satisfies React.CSSProperties;

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
