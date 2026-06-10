import { redirect } from "next/navigation";

import { Banner, Card, DataTable, EmptyState, FinanceShell, SectionHeader, StatusPill } from "@/components/finance/FinanceUi";
import { describeHostEmptyState, getHostFinanceNav, getHostFinanceRolloutNotice, hostFullDate, loadHostPayoutRows } from "@/lib/finance/host-finance-ui";
import { resolveFinanceHostAccess } from "@/lib/finance/host-finance-access";
import { createAdminSupabaseClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function HostFinancePayoutsPage() {
  const supabase = createAdminSupabaseClient();
  const hostAccess = await resolveFinanceHostAccess(supabase);
  if (!hostAccess) redirect("/partners/login");

  const payouts = await loadHostPayoutRows(supabase, hostAccess.hostId);
  const rolloutNotice = getHostFinanceRolloutNotice();

  return (
    <FinanceShell
      eyebrow="Famlo Pro Finance"
      title="Payouts"
      description="Track expected and processed payout dates, masked destinations, and failure reasons without exposing raw provider references."
      nav={getHostFinanceNav("/host/finance/payouts")}
    >
      {rolloutNotice ? <Banner tone="warning" title="Rollout guard active" message={rolloutNotice} /> : null}
      {payouts.length === 0 ? (
        <EmptyState {...describeHostEmptyState("payouts")} />
      ) : (
        <Card>
          <SectionHeader title="Payout timeline" />
          <DataTable
            headers={["Amount", "Settlement", "Status", "Expected / processed", "Destination", "Failure reason"]}
            rows={payouts.map((row) => [
              new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(row.amount),
              row.settlementCode || row.settlementId,
              <StatusPill key="status" value={row.status} />,
              hostFullDate(row.expectedOrProcessedDate),
              row.destinationMasked,
              row.failureReason ?? "None",
            ])}
          />
        </Card>
      )}
    </FinanceShell>
  );
}
