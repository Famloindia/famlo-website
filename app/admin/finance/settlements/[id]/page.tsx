import { notFound, redirect } from "next/navigation";

import AdminLayout from "@/components/admin/AdminLayout";
import { AdminFinanceHeader } from "@/components/finance/AdminFinanceFrame";
import FinanceActionButton from "@/components/finance/FinanceActionButton";
import { Banner, Card, DataTable, SectionHeader, StatusPill } from "@/components/finance/FinanceUi";
import { hasValidAdminSession } from "@/lib/admin-auth";
import { asNumber, asRecord, asString } from "@/lib/finance/dashboard-view-utils";
import { getAdminFinanceBlockedReasons, getAdminFinanceNav, loadAdminPageContext, loadAdminSettlementDetail } from "@/lib/finance/admin-finance-ui";
import { createAdminSupabaseClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function AdminFinanceSettlementDetailPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await hasValidAdminSession())) redirect("/admin");
  const { id } = await params;
  const supabase = createAdminSupabaseClient();
  const [detail, pageContext] = await Promise.all([loadAdminSettlementDetail(supabase, String(id ?? "").trim()), loadAdminPageContext(supabase)]);
  if (!detail.settlement) notFound();
  const blocked = getAdminFinanceBlockedReasons(pageContext.settings.taxMode);

  return (
    <AdminLayout admin={{ id: "system-admin", name: "Famlo Admin", email: "admin@famlo.in" }} activeTab="finance" killSwitchActive={pageContext.killSwitchActive}>
      <AdminFinanceHeader title={asString(detail.settlement.settlement_code) ?? "Settlement detail"} description="Inspect included bookings, hold reasons, and guarded auto payout actions." nav={getAdminFinanceNav("/admin/finance/settlements")} />
      {(blocked.settlementApproval || blocked.payoutTrigger) ? <Banner tone="warning" title="Some actions are blocked" message={[blocked.settlementApproval, blocked.payoutTrigger].filter(Boolean).join(" ")} /> : null}
      <Card>
        <SectionHeader title="Settlement summary" />
        <div style={{ display: "grid", gap: "16px", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
          <div><div style={{ fontSize: "11px", color: "rgba(255,255,255,0.55)", textTransform: "uppercase" }}>Status</div><div style={{ marginTop: "6px" }}><StatusPill value={asString(detail.settlement.status)} /></div></div>
          <div><div style={{ fontSize: "11px", color: "rgba(255,255,255,0.55)", textTransform: "uppercase" }}>Net amount</div><div style={{ marginTop: "6px", fontWeight: 800 }}>{new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(asNumber(detail.settlement.net_payable_amount))}</div></div>
          <div><div style={{ fontSize: "11px", color: "rgba(255,255,255,0.55)", textTransform: "uppercase" }}>Transfer reference</div><div style={{ marginTop: "6px", fontWeight: 800 }}>{asString(detail.settlement.transfer_reference) ?? "Not available"}</div></div>
        </div>
      </Card>
      <Card style={{ marginTop: "18px" }}>
        <SectionHeader title="Settlement actions" />
        <div style={{ display: "grid", gap: "10px", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
          <FinanceActionButton label="Approve draft" endpoint="/api/admin/finance/settlements/approve" payload={{ settlementId: id }} kind="primary" disabledReason={blocked.settlementApproval || (asString(detail.settlement.status) !== "draft" ? "Only draft settlements can be approved." : null)} />
          <FinanceActionButton label="Cancel draft" endpoint="/api/admin/finance/settlements/cancel" payload={{ settlementId: id }} kind="danger" disabledReason={asString(detail.settlement.status) !== "draft" ? "Only draft settlements can be cancelled." : null} />
          <FinanceActionButton label="Trigger payout" endpoint="/api/admin/finance/settlements/payout" payload={{ settlementId: id }} disabledReason={blocked.payoutTrigger || (!["approved", "payout_failed"].includes(asString(detail.settlement.status) ?? "") ? "Only approved or payout-failed settlements can trigger payout." : null)} />
          <FinanceActionButton
            label={(asString(detail.settlement.payout_hold_status) ?? "active") === "active" ? "Hold payout" : "Release hold"}
            endpoint={(asString(detail.settlement.payout_hold_status) ?? "active") === "active" ? "/api/admin/finance/payouts/hold" : "/api/admin/finance/payouts/release"}
            payload={
              (asString(detail.settlement.payout_hold_status) ?? "active") === "active"
                ? {
                    targetType: "settlement",
                    targetId: id,
                    reason: "Finance ops hold",
                    isHostActionable: false,
                  }
                : {
                    targetType: "settlement",
                    targetId: id,
                    reason: "Finance ops release",
                  }
            }
          />
        </div>
      </Card>
      <Card style={{ marginTop: "18px" }}>
        <SectionHeader title="Included bookings" />
        <DataTable
          headers={["Booking", "Reservation", "Amount", "Line type", "Hold metadata"]}
          rows={detail.lineItems.map((line) => [
            asString(line.booking_id) ?? "",
            asString(line.reservation_id) ?? "Not available",
            new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(asNumber(line.amount)),
            asString(line.line_type) ?? "",
            JSON.stringify(asRecord(line.metadata)),
          ])}
        />
      </Card>
    </AdminLayout>
  );
}
