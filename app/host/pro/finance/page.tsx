import Link from "next/link";
import { redirect } from "next/navigation";
import type { CSSProperties, ReactNode } from "react";

import {
  isFinanceExportsEnabled,
  isHostFinanceStatementsV2Enabled,
  isHostFinanceUiEnabled,
  isHostSettlementReadEnabled,
} from "@/lib/finance/feature-flags";
import { resolveFinanceHostAccess } from "@/lib/finance/host-finance-access";
import { getFinanceSettings } from "@/lib/finance/settings";
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

export default async function HostFinancePage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = createAdminSupabaseClient();
  const hostAccess = await resolveFinanceHostAccess(supabase);
  if (!hostAccess) {
    redirect("/partners/login");
  }
  const taxDisplay = getSafeTaxDisplayState(await getFinanceSettings({ scopeType: "GLOBAL", scopeId: null }, supabase));

  const params = (await searchParams) ?? {};
  const activeTab = Array.isArray(params.tab) ? String(params.tab[0] ?? "overview") : String(params.tab ?? "overview");

  const [{ data: folios }, { data: settlements }] = await Promise.all([
    supabase
      .from("reservation_folios_v2")
      .select("id,booking_id,source_channel,booking_status,payment_status,guest_total_amount,platform_fee_amount,refund_total_amount,host_payout_amount,metadata,created_at")
      .eq("host_id", hostAccess.hostId)
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("host_settlements_v2")
      .select("*")
      .eq("host_id", hostAccess.hostId)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  const settlementByFolioId = new Map<string, { id: string; code: string | null; status: string | null; period: string }>();
  const settlementIds = (settlements ?? []).map((settlement) => settlement.id).filter(Boolean);
  const { data: settlementLines } =
    settlementIds.length > 0
      ? await supabase.from("settlement_line_items_v2").select("settlement_id,folio_id").in("settlement_id", settlementIds).eq("is_active", true)
      : { data: [] as any[] };
  const settlementMap = new Map((settlements ?? []).map((settlement) => [settlement.id, settlement]));
  for (const line of settlementLines ?? []) {
    const settlement = settlementMap.get(line.settlement_id);
    if (line.folio_id && settlement) {
      settlementByFolioId.set(line.folio_id, {
        id: settlement.id,
        code: readString(settlement.settlement_code),
        status: readString(settlement.status),
        period: `${String(settlement.period_start ?? "N/A")} -> ${String(settlement.period_end ?? "N/A")}`,
      });
    }
  }

  const overview = {
    bookingCount: (folios ?? []).length,
    gross: (folios ?? []).reduce((sum, folio) => sum + readNumber(folio.guest_total_amount), 0),
    fee: (folios ?? []).reduce((sum, folio) => sum + readNumber(folio.platform_fee_amount), 0),
    refund: (folios ?? []).reduce((sum, folio) => sum + readNumber(folio.refund_total_amount), 0),
    payout: (folios ?? []).reduce((sum, folio) => sum + readNumber(folio.host_payout_amount), 0),
  };

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(180deg, #07111f 0%, #0f172a 100%)", color: "white", padding: "32px 20px 48px" }}>
      <div style={{ maxWidth: "1220px", margin: "0 auto", display: "grid", gap: "18px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "16px", alignItems: "flex-start", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: "12px", color: "#93c5fd", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" }}>
              Host Finance
            </div>
            <h1 style={{ margin: "10px 0 0", fontSize: "30px", fontWeight: 900 }}>{hostAccess.displayName ?? "Finance"}</h1>
            <p style={{ marginTop: "8px", color: "rgba(255,255,255,0.55)", fontSize: "14px", maxWidth: "760px" }}>
              Booking proof, settlements, and statements are read-only here. {taxDisplay.hostTaxMessage} No payout execution happens from this surface.
            </p>
          </div>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            {["overview", "bookings", "settlements", "statements", "tax"].map((tab) => (
              <Link key={tab} href={`/host/pro/finance?tab=${tab}`} style={pillStyle(activeTab === tab)}>
                {tab === "tax" ? "Tax Info" : tab.charAt(0).toUpperCase() + tab.slice(1)}
              </Link>
            ))}
          </div>
        </div>

        {!isHostFinanceUiEnabled() ? (
          <section style={panelStyle}>
            <div style={{ color: "#fde68a", fontSize: "13px", lineHeight: 1.6 }}>
              `HOST_FINANCE_UI_ENABLED` is off. This read-only preview is available for rollout verification, but host finance surfaces remain feature-flagged.
            </div>
          </section>
        ) : null}

        {activeTab === "overview" ? (
          <section style={panelStyle}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "12px" }}>
              <MetricCard label="Bookings" value={String(overview.bookingCount)} accent="#ffffff" />
              <MetricCard label="Booking amount" value={formatCurrency(overview.gross)} accent="#86efac" />
              <MetricCard label="Platform fee" value={formatCurrency(overview.fee)} accent="#bbf7d0" />
              <MetricCard label="Refund / adjustment" value={formatCurrency(overview.refund)} accent="#fcd34d" />
              <MetricCard label="Net payout" value={formatCurrency(overview.payout)} accent="#93c5fd" />
            </div>
          </section>
        ) : null}

        {activeTab === "bookings" ? (
          <section style={panelStyle}>
            <div style={sectionTitleStyle}>Bookings</div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "980px" }}>
                <thead>
                  <tr style={{ textAlign: "left", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                    {["Booking", "Source", "Booking Status", "Payment Status", "Booking Amount", "Platform Fee", "Refund", "Net Payout", "Settlement"].map((label) => (
                      <th key={label} style={tableHeadStyle}>
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(folios ?? []).map((folio) => {
                    const settlement = settlementByFolioId.get(folio.id);
                    return (
                      <tr key={folio.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                        <td style={tableBodyStyle}>{readString(folio.booking_id)?.slice(0, 8) ?? "N/A"}</td>
                        <td style={tableBodyStyle}>{readString(folio.source_channel) ?? "famlo_direct"}</td>
                        <td style={tableBodyStyle}>{readString(folio.booking_status) ?? "N/A"}</td>
                        <td style={tableBodyStyle}>{readString(folio.payment_status) ?? "N/A"}</td>
                        <td style={{ ...tableBodyStyle, color: "white" }}>{formatCurrency(readNumber(folio.guest_total_amount))}</td>
                        <td style={{ ...tableBodyStyle, color: "#86efac" }}>{formatCurrency(readNumber(folio.platform_fee_amount))}</td>
                        <td style={{ ...tableBodyStyle, color: "#fcd34d" }}>{formatCurrency(readNumber(folio.refund_total_amount))}</td>
                        <td style={{ ...tableBodyStyle, color: "#93c5fd" }}>{formatCurrency(readNumber(folio.host_payout_amount))}</td>
                        <td style={tableBodyStyle}>{settlement ? `${settlement.status ?? "draft"} · ${settlement.period}` : "Not settled"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        {activeTab === "settlements" ? (
          <section style={panelStyle}>
            <div style={sectionTitleStyle}>Payouts / Settlements</div>
            <div style={{ color: "rgba(255,255,255,0.45)", fontSize: "13px", marginBottom: "12px" }}>
              Host settlement read access: {isHostSettlementReadEnabled() ? "Enabled" : "Disabled"}
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "920px" }}>
                <thead>
                  <tr style={{ textAlign: "left", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                    {["Settlement", "Status", "Period", "Gross", "Platform Fee", "Refund Adjustment", "Net Payable", "Transfer Reference"].map((label) => (
                      <th key={label} style={tableHeadStyle}>
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(settlements ?? []).map((settlement) => (
                    <tr key={settlement.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                      <td style={tableBodyStyle}>{readString(settlement.settlement_code) ?? settlement.id.slice(0, 8)}</td>
                      <td style={tableBodyStyle}>{readString(settlement.status) ?? "draft"}</td>
                      <td style={tableBodyStyle}>{`${String(settlement.period_start ?? "N/A")} -> ${String(settlement.period_end ?? "N/A")}`}</td>
                      <td style={{ ...tableBodyStyle, color: "white" }}>{formatCurrency(readNumber(settlement.gross_booking_value))}</td>
                      <td style={{ ...tableBodyStyle, color: "#86efac" }}>{formatCurrency(readNumber(settlement.platform_fee_amount))}</td>
                      <td style={{ ...tableBodyStyle, color: "#fcd34d" }}>{formatCurrency(readNumber(settlement.refund_adjustment_amount))}</td>
                      <td style={{ ...tableBodyStyle, color: "#93c5fd" }}>{formatCurrency(readNumber(settlement.net_payable_amount))}</td>
                      <td style={tableBodyStyle}>{readString(settlement.transfer_reference) ?? "Manual / not set"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        {activeTab === "statements" ? (
          <section style={panelStyle}>
            <div style={sectionTitleStyle}>Statements</div>
            <div style={{ color: "#cbd5e1", fontSize: "14px", lineHeight: 1.7 }}>
              Statement read model: {isHostFinanceStatementsV2Enabled() ? "Enabled" : "Disabled"}.
              CSV exports: {isFinanceExportsEnabled() ? "Enabled" : "Disabled"}.
              PDF generation is not part of this batch.
            </div>
          </section>
        ) : null}

        {activeTab === "tax" ? (
          <section style={panelStyle}>
            <div style={sectionTitleStyle}>Tax Info</div>
            <div style={{ display: "grid", gap: "10px" }}>
              <MetaRow label="Tax mode" value={taxDisplay.taxMode} />
              <MetaRow label="GST collection" value={taxDisplay.gstCollectionLabel} />
              <MetaRow label="TCS" value={taxDisplay.tcsLabel} />
              <MetaRow label="TDS" value={taxDisplay.tdsLabel} />
              <MetaRow label="GST invoice" value={taxDisplay.gstInvoiceLabel} />
              <MetaRow label="Tax labels" value={taxDisplay.hostTaxMessage} />
            </div>
          </section>
        ) : null}
      </div>
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

function MetaRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div style={{ color: "#cbd5e1", fontSize: "14px", lineHeight: 1.6 }}>
      <strong style={{ color: "white" }}>{label}:</strong> {value}
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

const sectionTitleStyle = {
  fontSize: "15px",
  fontWeight: 900,
  color: "white",
  marginBottom: "14px",
} satisfies React.CSSProperties;

function pillStyle(active: boolean): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "999px",
    background: active ? "rgba(147,197,253,0.18)" : "rgba(255,255,255,0.08)",
    color: active ? "#bfdbfe" : "#e2e8f0",
    padding: "8px 12px",
    fontSize: "12px",
    fontWeight: 800,
    textDecoration: "none",
  };
}
