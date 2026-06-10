import { redirect } from "next/navigation";

import { Banner, Card, DataTable, EmptyState, FinanceShell, SectionHeader, StatusPill } from "@/components/finance/FinanceUi";
import { describeHostEmptyState, getHostFinanceNav, getHostFinanceRolloutNotice, loadHostRefundAdjustments } from "@/lib/finance/host-finance-ui";
import { resolveFinanceHostAccess } from "@/lib/finance/host-finance-access";
import { createAdminSupabaseClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function HostFinanceRefundAdjustmentsPage() {
  const supabase = createAdminSupabaseClient();
  const hostAccess = await resolveFinanceHostAccess(supabase);
  if (!hostAccess) redirect("/partners/login");

  const rows = await loadHostRefundAdjustments(supabase, hostAccess.hostId);
  const rolloutNotice = getHostFinanceRolloutNotice();

  return (
    <FinanceShell
      eyebrow="Famlo Pro Finance"
      title="Refund adjustments"
      description="See how refund requests affect your settlement position without exposing raw refund provider data."
      nav={getHostFinanceNav("/host/finance/refund-adjustments")}
    >
      {rolloutNotice ? <Banner tone="warning" title="Rollout guard active" message={rolloutNotice} /> : null}
      {rows.length === 0 ? (
        <EmptyState {...describeHostEmptyState("refunds")} />
      ) : (
        <Card>
          <SectionHeader title="Adjustment history" />
          <DataTable
            headers={["Booking", "Refund reason", "Refund amount", "Adjustment amount", "Settlement impact", "Status"]}
            rows={rows.map((row) => [
              row.bookingId,
              row.refundReason,
              new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(row.refundAmount),
              new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(row.adjustmentAmount),
              row.settlementImpact,
              <StatusPill key="status" value={row.status} />,
            ])}
          />
        </Card>
      )}
    </FinanceShell>
  );
}
