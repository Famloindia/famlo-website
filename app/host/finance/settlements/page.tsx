import Link from "next/link";
import { redirect } from "next/navigation";

import { Banner, Card, DataTable, EmptyState, FinanceShell, SectionHeader, StatusPill } from "@/components/finance/FinanceUi";
import { describeHostEmptyState, getHostFinanceNav, getHostFinanceRolloutNotice, loadHostSettlementList } from "@/lib/finance/host-finance-ui";
import { resolveFinanceHostAccess } from "@/lib/finance/host-finance-access";
import { createAdminSupabaseClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function HostFinanceSettlementsPage() {
  const supabase = createAdminSupabaseClient();
  const hostAccess = await resolveFinanceHostAccess(supabase);
  if (!hostAccess) redirect("/partners/login");

  const settlements = await loadHostSettlementList(supabase, hostAccess.hostId);
  const rolloutNotice = getHostFinanceRolloutNotice();

  return (
    <FinanceShell
      eyebrow="Famlo Pro Finance"
      title="Settlements"
      description="Review settlement periods, deductions, and payout progress before money reaches your masked destination."
      nav={getHostFinanceNav("/host/finance/settlements")}
    >
      {rolloutNotice ? <Banner tone="warning" title="Rollout guard active" message={rolloutNotice} /> : null}
      {settlements.length === 0 ? (
        <EmptyState {...describeHostEmptyState("settlements")} />
      ) : (
        <Card>
          <SectionHeader title="Settlement timeline" description="Each row reflects the host-scoped settlement view only." />
          <DataTable
            headers={["Settlement", "Period", "Status", "Gross host payout", "TDS", "Adjustments", "Net payout", "Payout status"]}
            rows={settlements.map((row) => [
              <div key="settlement" style={{ display: "grid", gap: "6px" }}>
                <Link href={`/host/finance/settlements/${row.id}`} style={{ color: "white", fontWeight: 800, textDecoration: "none" }}>
                  {row.settlementCode}
                </Link>
                <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.6)" }}>{row.createdAt ? new Date(row.createdAt).toLocaleDateString("en-IN") : "No date"}</div>
              </div>,
              row.periodLabel,
              <StatusPill key="status" value={row.status} />,
              new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(row.grossHostPayout),
              new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(row.tdsAmount),
              new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(row.adjustmentsAmount),
              new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(row.netPayout),
              <StatusPill key="payoutStatus" value={row.payoutStatus} />,
            ])}
          />
        </Card>
      )}
    </FinanceShell>
  );
}
