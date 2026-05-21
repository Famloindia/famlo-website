import Link from "next/link";
import { redirect } from "next/navigation";

import AdminLayout from "@/components/admin/AdminLayout";
import { AdminFinanceHeader } from "@/components/finance/AdminFinanceFrame";
import { Banner, Card, DataTable, SectionHeader } from "@/components/finance/FinanceUi";
import { hasValidAdminSession } from "@/lib/admin-auth";
import { getAdminFinanceBlockedReasons, getAdminFinanceNav, loadAdminPageContext, loadAdminReportsView } from "@/lib/finance/admin-finance-ui";
import { createAdminSupabaseClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function AdminFinanceReportsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!(await hasValidAdminSession())) redirect("/admin");
  const params = (await searchParams) ?? {};
  const startDate = typeof params.startDate === "string" ? params.startDate : new Date(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1).toISOString().slice(0, 10);
  const endDate = typeof params.endDate === "string" ? params.endDate : new Date().toISOString().slice(0, 10);

  const supabase = createAdminSupabaseClient();
  const [view, pageContext] = await Promise.all([loadAdminReportsView(supabase, { startDate, endDate }), loadAdminPageContext(supabase)]);
  const blocked = getAdminFinanceBlockedReasons(pageContext.settings.taxMode);

  return (
    <AdminLayout admin={{ id: "system-admin", name: "Famlo Admin", email: "admin@famlo.in" }} activeTab="finance" killSwitchActive={pageContext.killSwitchActive}>
      <AdminFinanceHeader title="Finance reports" description="Export GST, TDS, revenue, gateway ITC, platform-fee GST, and credit-note reports through the existing CSV endpoints." nav={getAdminFinanceNav("/admin/finance/reports")} />
      {blocked.reports ? <Banner tone="warning" title="GST report guard active" message={blocked.reports} /> : null}
      <Card>
        <SectionHeader title="Selected date range" description={`${view.startDate} to ${view.endDate}`} />
        <DataTable
          headers={["Report", "Download"]}
          rows={view.links.map((link) => [
            link.label,
            <Link key={link.href} href={link.href} style={{ color: "#bfdbfe", textDecoration: "none", fontWeight: 700 }}>Download CSV</Link>,
          ])}
        />
      </Card>
    </AdminLayout>
  );
}
