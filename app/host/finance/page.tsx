import { redirect } from "next/navigation";

import { Banner, Card, EmptyState, FinanceShell, MetricCard, MetricGrid, SectionHeader, StatusPill } from "@/components/finance/FinanceUi";
import {
  describeHostActionRequired,
  getHostFinanceNav,
  getHostFinanceRolloutNotice,
  hostFullDate,
  loadHostFinanceSummary,
  loadHostPayoutRows,
} from "@/lib/finance/host-finance-ui";
import { resolveFinanceHostAccess } from "@/lib/finance/host-finance-access";
import { createAdminSupabaseClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function HostFinanceOverviewPage() {
  const supabase = createAdminSupabaseClient();
  const hostAccess = await resolveFinanceHostAccess(supabase);
  if (!hostAccess) redirect("/partners/login");

  const [summary, payouts] = await Promise.all([
    loadHostFinanceSummary(supabase, hostAccess),
    loadHostPayoutRows(supabase, hostAccess.hostId),
  ]);
  const rolloutNotice = getHostFinanceRolloutNotice();
  const actionRequired = describeHostActionRequired(summary);
  const latestPayout = payouts[0] ?? null;

  return (
    <FinanceShell
      eyebrow="Famlo Pro Finance"
      title={hostAccess.displayName ?? "Host Finance"}
      description="Track payouts, settlements, tax-ready documents, and refund impacts without exposing raw provider data or admin-only diagnostics."
      nav={getHostFinanceNav("/host/finance")}
    >
      {rolloutNotice ? <Banner tone="warning" title="Rollout guard active" message={rolloutNotice} /> : null}
      {actionRequired ? <Banner tone="warning" title="Action required" message={actionRequired} /> : null}

      <MetricGrid>
        <MetricCard label="Upcoming payout" value={summary.upcomingPayoutAmount > 0 ? new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(summary.upcomingPayoutAmount) : "No payout"} detail={summary.upcomingPayoutDate ? `Expected ${hostFullDate(summary.upcomingPayoutDate)}` : "Nothing pending right now"} />
        <MetricCard label="Paid this month" value={new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(summary.paidThisMonthAmount)} detail="Processed payouts this month" />
        <MetricCard label="Pending settlements" value={String(summary.pendingSettlementsCount)} detail="Awaiting approval or payout progression" />
        <MetricCard label="Refund adjustments" value={new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(summary.refundAdjustmentsAmount)} detail="Adjustments affecting your payout" />
        <MetricCard label="KYC / PAN status" value={summary.panStatus} detail="Payout release depends on verified tax details" />
        <MetricCard label="Payout account" value={summary.payoutAccountStatus} detail="Only masked destination data is shown here" />
      </MetricGrid>

      <Card>
        <SectionHeader title="Latest payout movement" description="This stays read-only and reflects the last host-scoped payout execution." />
        {latestPayout ? (
          <div style={{ display: "grid", gap: "12px", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
            <div>
              <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.55)", textTransform: "uppercase" }}>Settlement</div>
              <div style={{ marginTop: "6px", fontWeight: 800 }}>{latestPayout.settlementCode || latestPayout.settlementId}</div>
            </div>
            <div>
              <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.55)", textTransform: "uppercase" }}>Amount</div>
              <div style={{ marginTop: "6px", fontWeight: 800 }}>{new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(latestPayout.amount)}</div>
            </div>
            <div>
              <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.55)", textTransform: "uppercase" }}>Status</div>
              <div style={{ marginTop: "6px" }}><StatusPill value={latestPayout.status} /></div>
            </div>
            <div>
              <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.55)", textTransform: "uppercase" }}>Date</div>
              <div style={{ marginTop: "6px", fontWeight: 700 }}>{hostFullDate(latestPayout.expectedOrProcessedDate)}</div>
            </div>
          </div>
        ) : (
          <EmptyState title="No payout activity yet" message="Once a settlement is approved and reaches payout processing, the latest movement will appear here." />
        )}
      </Card>
    </FinanceShell>
  );
}
