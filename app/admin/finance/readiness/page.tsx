import { redirect } from "next/navigation";

import AdminLayout from "@/components/admin/AdminLayout";
import { AdminFinanceHeader } from "@/components/finance/AdminFinanceFrame";
import { Card, DataTable, StatusPill } from "@/components/finance/FinanceUi";
import { hasValidAdminSession } from "@/lib/admin-auth";
import { getAdminFinanceNav, loadAdminPageContext, loadAdminReadinessView } from "@/lib/finance/admin-finance-ui";
import { createAdminSupabaseClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function AdminFinanceReadinessPage() {
  if (!(await hasValidAdminSession())) redirect("/admin");
  const supabase = createAdminSupabaseClient();
  const [report, pageContext] = await Promise.all([loadAdminReadinessView(supabase), loadAdminPageContext(supabase)]);

  return (
    <AdminLayout admin={{ id: "system-admin", name: "Famlo Admin", email: "admin@famlo.in" }} activeTab="finance" killSwitchActive={pageContext.killSwitchActive}>
      <AdminFinanceHeader title="Production readiness" description="Review grouped readiness across tax, payments, refunds, payouts, invoices, email, and reconciliation before each rollout stage." nav={getAdminFinanceNav("/admin/finance/readiness")} />
      {(["tax", "payments", "refunds", "payouts", "invoices", "email", "reconciliation"] as const).map((groupKey) => {
        const group = report[groupKey];
        return (
          <Card key={groupKey} style={{ marginBottom: "18px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center", marginBottom: "12px" }}>
              <div style={{ color: "white", fontWeight: 800, fontSize: "18px", textTransform: "capitalize" }}>{groupKey}</div>
              <StatusPill value={group.state} />
            </div>
            <DataTable
              headers={["Check", "State", "Message"]}
              rows={group.checks.map((check) => [
                check.label,
                <StatusPill key="state" value={check.state} />,
                check.message,
              ])}
            />
          </Card>
        );
      })}
    </AdminLayout>
  );
}
