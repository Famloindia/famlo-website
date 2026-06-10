import { notFound, redirect } from "next/navigation";

import { Banner, Card, DataTable, FinanceShell, SectionHeader, StatusPill } from "@/components/finance/FinanceUi";
import { getHostFinanceNav, getHostFinanceRolloutNotice, loadHostSettlementDetail, settlementReferenceLabel } from "@/lib/finance/host-finance-ui";
import { resolveFinanceHostAccess } from "@/lib/finance/host-finance-access";
import { createAdminSupabaseClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function HostFinanceSettlementDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const supabase = createAdminSupabaseClient();
  const hostAccess = await resolveFinanceHostAccess(supabase);
  if (!hostAccess) redirect("/partners/login");

  const { id } = await params;
  const detail = await loadHostSettlementDetail(supabase, hostAccess.hostId, String(id ?? "").trim());
  if (!detail?.settlement) notFound();

  const rolloutNotice = getHostFinanceRolloutNotice();

  return (
    <FinanceShell
      eyebrow="Famlo Pro Finance"
      title={detail.settlement.settlementCode}
      description="Settlement detail stays scoped to your own bookings, masked payout references, and payout-safe finance lines."
      nav={getHostFinanceNav("/host/finance/settlements")}
    >
      {rolloutNotice ? <Banner tone="warning" title="Rollout guard active" message={rolloutNotice} /> : null}

      <Card>
        <SectionHeader title="Settlement summary" />
        <div style={{ display: "grid", gap: "16px", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
          <div><div style={{ fontSize: "11px", color: "rgba(255,255,255,0.55)", textTransform: "uppercase" }}>Status</div><div style={{ marginTop: "6px" }}><StatusPill value={detail.settlement.status} /></div></div>
          <div><div style={{ fontSize: "11px", color: "rgba(255,255,255,0.55)", textTransform: "uppercase" }}>Period</div><div style={{ marginTop: "6px", fontWeight: 800 }}>{detail.settlement.periodLabel}</div></div>
          <div><div style={{ fontSize: "11px", color: "rgba(255,255,255,0.55)", textTransform: "uppercase" }}>Net payout</div><div style={{ marginTop: "6px", fontWeight: 800 }}>{new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(detail.settlement.netPayout)}</div></div>
          <div><div style={{ fontSize: "11px", color: "rgba(255,255,255,0.55)", textTransform: "uppercase" }}>Payout status</div><div style={{ marginTop: "6px" }}><StatusPill value={detail.settlement.payoutStatus} /></div></div>
          <div><div style={{ fontSize: "11px", color: "rgba(255,255,255,0.55)", textTransform: "uppercase" }}>Payout reference</div><div style={{ marginTop: "6px", fontWeight: 800 }}>{settlementReferenceLabel(detail.payoutReference)}</div></div>
        </div>
      </Card>

      <Card>
        <SectionHeader title="Included booking lines" description="Room base, platform fee, host gross payout, TDS, refunds, and final payout remain aligned to the Section 9(5) finance snapshot." />
        <DataTable
          headers={["Booking", "Reservation", "Room base", "Famlo platform fee 16%", "Host gross payout 84%", "Refund / adjustment"]}
          rows={detail.lines.map((line) => [
            line.bookingId,
            line.reservationId ?? "Not available",
            new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(line.roomBase),
            new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(line.platformFee),
            new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(line.hostGrossPayout),
            new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(line.refundAdjustment),
          ])}
        />
      </Card>
    </FinanceShell>
  );
}
