import Link from "next/link";
import { redirect } from "next/navigation";

import AdminLayout from "@/components/admin/AdminLayout";
import { AdminFinanceHeader } from "@/components/finance/AdminFinanceFrame";
import FinanceActionButton from "@/components/finance/FinanceActionButton";
import { Banner, Card, DataTable, EmptyState, StatusPill } from "@/components/finance/FinanceUi";
import { hasValidAdminSession } from "@/lib/admin-auth";
import { getAdminFinanceBlockedReasons, getAdminFinanceNav, loadAdminPageContext } from "@/lib/finance/admin-finance-ui";
import { listAdminPayouts } from "@/lib/finance/payout-admin";
import { createAdminSupabaseClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function AdminFinancePayoutsPage() {
  if (!(await hasValidAdminSession())) redirect("/admin");
  const supabase = createAdminSupabaseClient();
  const [rows, pageContext] = await Promise.all([listAdminPayouts(supabase), loadAdminPageContext(supabase)]);
  const blocked = getAdminFinanceBlockedReasons(pageContext.settings.taxMode);

  return (
    <AdminLayout admin={{ id: "system-admin", name: "Famlo Admin", email: "admin@famlo.in" }} activeTab="finance" killSwitchActive={pageContext.killSwitchActive}>
      <AdminFinanceHeader title="Payout executions" description="Track processing, paid, failed, reversed, and needs-review payout states with masked destinations only." nav={getAdminFinanceNav("/admin/finance/payouts")} />
      {blocked.payoutTrigger ? <Banner tone="warning" title="Payout execution blocked" message={blocked.payoutTrigger} /> : null}
      {rows.length === 0 ? (
        <EmptyState title="No payout executions" message="Approved settlements that have been triggered for payout will appear here." />
      ) : (
        <Card>
          <DataTable
            headers={["Payout", "Settlement", "Status", "Amount", "Destination", "Failure reason", "Actions"]}
            rows={rows.map((row) => [
              <Link key="payout" href={`/admin/finance/payouts/${String(row.id)}`} style={{ color: "white", fontWeight: 800, textDecoration: "none" }}>{String(row.id).slice(0, 8)}</Link>,
              String(row.settlementCode || row.settlementId || ""),
              <StatusPill key="status" value={String(row.status || "")} />,
              new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(row.amount ?? 0)),
              String(row.destinationMasked || ""),
              String(row.failureReason || "None"),
              <div key="actions" style={{ display: "grid", gap: "8px", minWidth: "170px" }}>
                <FinanceActionButton label="Retry failed payout" endpoint="/api/admin/finance/payouts/retry" payload={{ payoutExecutionId: row.id }} disabledReason={String(row.status || "") !== "failed" ? "Only failed payouts can be retried." : null} />
                <FinanceActionButton label="Mark needs review" endpoint="/api/admin/finance/payouts/mark-needs-review" payload={{ payoutExecutionId: row.id }} kind="danger" />
              </div>,
            ])}
          />
        </Card>
      )}
    </AdminLayout>
  );
}
