import { redirect } from "next/navigation";

import AdminLayout from "@/components/admin/AdminLayout";
import { AdminFinanceHeader } from "@/components/finance/AdminFinanceFrame";
import { Banner, Card, DataTable, SectionHeader, StatusPill } from "@/components/finance/FinanceUi";
import { hasValidAdminSession } from "@/lib/admin-auth";
import { describeAdminDisabledState, getAdminFinanceNav, loadAdminPageContext, loadAdminReconciliationView } from "@/lib/finance/admin-finance-ui";
import { createAdminSupabaseClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function AdminFinanceReconciliationPage() {
  if (!(await hasValidAdminSession())) redirect("/admin");
  const supabase = createAdminSupabaseClient();
  const [snapshot, pageContext] = await Promise.all([loadAdminReconciliationView(supabase), loadAdminPageContext(supabase)]);
  const disabledReason = describeAdminDisabledState("reconciliation");
  const issues = [...snapshot.payments.issues, ...snapshot.refunds.issues, ...snapshot.payouts.issues, ...snapshot.providerEvents.issues];

  return (
    <AdminLayout admin={{ id: "system-admin", name: "Famlo Admin", email: "admin@famlo.in" }} activeTab="finance" killSwitchActive={pageContext.killSwitchActive}>
      <AdminFinanceHeader title="Reconciliation" description="Review critical, warning, and info issues across payment, refund, payout, and provider event sections." nav={getAdminFinanceNav("/admin/finance/reconciliation")} />
      {disabledReason ? <Banner tone="warning" title="Reconciliation rollout guard active" message={disabledReason} /> : null}
      <Card>
        <SectionHeader title="Issue summary" />
        <div style={{ display: "grid", gap: "14px", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
          <div><div style={{ fontSize: "11px", textTransform: "uppercase", color: "rgba(255,255,255,0.55)" }}>Critical</div><div style={{ marginTop: "6px", fontSize: "24px", fontWeight: 900 }}>{snapshot.overall.critical}</div></div>
          <div><div style={{ fontSize: "11px", textTransform: "uppercase", color: "rgba(255,255,255,0.55)" }}>Warning</div><div style={{ marginTop: "6px", fontSize: "24px", fontWeight: 900 }}>{snapshot.overall.warning}</div></div>
          <div><div style={{ fontSize: "11px", textTransform: "uppercase", color: "rgba(255,255,255,0.55)" }}>Info</div><div style={{ marginTop: "6px", fontSize: "24px", fontWeight: 900 }}>{snapshot.overall.info}</div></div>
        </div>
      </Card>
      <Card style={{ marginTop: "18px" }}>
        <SectionHeader title="Issue list" />
        <DataTable
          headers={["Severity", "Type", "Reason", "Reference"]}
          rows={issues.map((issue: any) => [
            <StatusPill key="severity" value={issue.severity} />,
            issue.type,
            issue.reasonCode,
            issue.entityId,
          ])}
        />
      </Card>
    </AdminLayout>
  );
}
