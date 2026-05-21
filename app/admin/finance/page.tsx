import { redirect } from "next/navigation";

import AdminLayout from "@/components/admin/AdminLayout";
import { AdminFinanceHeader } from "@/components/finance/AdminFinanceFrame";
import { Banner, Card, MetricCard, MetricGrid } from "@/components/finance/FinanceUi";
import { hasValidAdminSession } from "@/lib/admin-auth";
import { getAdminFinanceNav, loadAdminDashboardCards, loadAdminPageContext } from "@/lib/finance/admin-finance-ui";
import { createAdminSupabaseClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function AdminFinancePage() {
  if (!(await hasValidAdminSession())) redirect("/admin");

  const supabase = createAdminSupabaseClient();
  const [cards, pageContext] = await Promise.all([
    loadAdminDashboardCards(supabase),
    loadAdminPageContext(supabase),
  ]);

  return (
    <AdminLayout admin={{ id: "system-admin", name: "Famlo Admin", email: "admin@famlo.in" }} activeTab="finance" killSwitchActive={pageContext.killSwitchActive}>
      <AdminFinanceHeader
        title="Finance control center"
        description="Monitor finance rollout readiness, collections, invoices, refunds, settlements, payouts, reconciliation, and report exports without bypassing existing compliance or execution guards."
        nav={getAdminFinanceNav("/admin/finance")}
      />
      {pageContext.rolloutDisabledReason ? <Banner tone="warning" title="Ops UI rollout guard active" message={pageContext.rolloutDisabledReason} /> : null}
      <MetricGrid>
        {cards.map((card) => (
          <MetricCard key={card.label} label={card.label} value={card.value} detail={card.detail} />
        ))}
      </MetricGrid>
      <Card style={{ marginTop: "18px" }}>
        <div style={{ display: "grid", gap: "8px" }}>
          <div style={{ color: "white", fontWeight: 800, fontSize: "18px" }}>Production posture</div>
          <div style={{ color: "rgba(255,255,255,0.68)", lineHeight: 1.7, fontSize: "14px" }}>
            Tax mode: <strong>{pageContext.settings.taxMode}</strong>. GST exports: <strong>{pageContext.settings.gstExportEnabled ? "DB enabled" : "DB disabled"}</strong>. Payout release policy: <strong>{pageContext.settings.payoutReleasePolicy}</strong>.
          </div>
        </div>
      </Card>
    </AdminLayout>
  );
}
