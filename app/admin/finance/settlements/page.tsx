import Link from "next/link";
import { redirect } from "next/navigation";

import AdminLayout from "@/components/admin/AdminLayout";
import { AdminFinanceHeader } from "@/components/finance/AdminFinanceFrame";
import FinanceActionButton from "@/components/finance/FinanceActionButton";
import { Banner, Card, DataTable, EmptyState, StatusPill } from "@/components/finance/FinanceUi";
import { hasValidAdminSession } from "@/lib/admin-auth";
import { getAdminFinanceBlockedReasons, getAdminFinanceNav, loadAdminPageContext, loadAdminSettlementRows } from "@/lib/finance/admin-finance-ui";
import { createAdminSupabaseClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function AdminFinanceSettlementsPage() {
  if (!(await hasValidAdminSession())) redirect("/admin");
  const supabase = createAdminSupabaseClient();
  const [rows, pageContext] = await Promise.all([loadAdminSettlementRows(supabase), loadAdminPageContext(supabase)]);
  const blocked = getAdminFinanceBlockedReasons(pageContext.settings.taxMode);

  return (
    <AdminLayout admin={{ id: "system-admin", name: "Famlo Admin", email: "admin@famlo.in" }} activeTab="finance" killSwitchActive={pageContext.killSwitchActive}>
      <AdminFinanceHeader title="Settlement operations" description="Approve, cancel, or trigger payouts from the existing guarded settlement flow." nav={getAdminFinanceNav("/admin/finance/settlements")} />
      {(blocked.settlementApproval || blocked.payoutTrigger) ? <Banner tone="warning" title="Some actions are blocked" message={[blocked.settlementApproval, blocked.payoutTrigger].filter(Boolean).join(" ")} /> : null}
      {rows.length === 0 ? (
        <EmptyState title="No settlements yet" message="Settlement drafts and approved batches will appear here once the settlement engine creates them." />
      ) : (
        <Card>
          <DataTable
            headers={["Settlement", "Period", "Status", "Net amount", "Payout status", "Hold reasons", "Actions"]}
            rows={rows.map((row) => [
              <div key="settlement" style={{ display: "grid", gap: "6px" }}>
                <Link href={`/admin/finance/settlements/${row.id}`} style={{ color: "white", fontWeight: 800, textDecoration: "none" }}>{row.settlementCode}</Link>
                <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.6)" }}>{row.includedBookingCount} booking(s)</div>
              </div>,
              row.periodLabel,
              <StatusPill key="status" value={row.status} />,
              new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(row.netAmount),
              <StatusPill key="payoutStatus" value={row.payoutStatus} />,
              row.holdReasons.length > 0 ? row.holdReasons.join(" ") : "None",
              <div key="actions" style={{ display: "grid", gap: "8px", minWidth: "170px" }}>
                <FinanceActionButton label="Approve" endpoint="/api/admin/finance/settlements/approve" payload={{ settlementId: row.id }} kind="primary" disabledReason={blocked.settlementApproval || (row.status !== "draft" ? "Only draft settlements can be approved." : null)} />
                <FinanceActionButton label="Cancel" endpoint="/api/admin/finance/settlements/cancel" payload={{ settlementId: row.id }} kind="danger" disabledReason={row.status !== "draft" ? "Only draft settlements can be cancelled." : null} />
                <FinanceActionButton label="Trigger payout" endpoint="/api/admin/finance/settlements/payout" payload={{ settlementId: row.id }} disabledReason={blocked.payoutTrigger || (row.status !== "approved" ? "Only approved settlements can trigger payout." : null)} />
              </div>,
            ])}
          />
        </Card>
      )}
    </AdminLayout>
  );
}
