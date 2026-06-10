import { redirect } from "next/navigation";

import { Banner, Card, FinanceShell, SectionHeader, StatusPill } from "@/components/finance/FinanceUi";
import { getHostFinanceNav, getHostFinanceRolloutNotice, loadHostPayoutAccountView } from "@/lib/finance/host-finance-ui";
import { resolveFinanceHostAccess } from "@/lib/finance/host-finance-access";
import { createAdminSupabaseClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function HostFinancePayoutAccountPage() {
  const supabase = createAdminSupabaseClient();
  const hostAccess = await resolveFinanceHostAccess(supabase);
  if (!hostAccess) redirect("/partners/login");

  const view = await loadHostPayoutAccountView(supabase, hostAccess);
  const rolloutNotice = getHostFinanceRolloutNotice();

  return (
    <FinanceShell
      eyebrow="Famlo Pro Finance"
      title="Payout account"
      description="Review the masked payout destination, PAN/KYC state, and any action required before settlement payouts can move."
      nav={getHostFinanceNav("/host/finance/payout-account")}
    >
      {rolloutNotice ? <Banner tone="warning" title="Rollout guard active" message={rolloutNotice} /> : null}
      {view.flagsBlockedReason ? <Banner tone="warning" title="Setup is currently limited" message={view.flagsBlockedReason} /> : null}
      {view.actionRequired.length > 0 ? <Banner tone="warning" title="Action required before payout release" message={view.actionRequired.join(" ")} /> : null}

      <Card>
        <SectionHeader title="Payout readiness" description="Only safe host-facing fields are shown. Raw provider identifiers and full bank details stay hidden." />
        <div style={{ display: "grid", gap: "16px", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
          <div><div style={{ fontSize: "11px", color: "rgba(255,255,255,0.55)", textTransform: "uppercase" }}>Legal name</div><div style={{ marginTop: "6px", fontWeight: 800 }}>{view.legalName ?? "Not available"}</div></div>
          <div><div style={{ fontSize: "11px", color: "rgba(255,255,255,0.55)", textTransform: "uppercase" }}>PAN / KYC</div><div style={{ marginTop: "6px" }}><StatusPill value={view.panStatus} /></div></div>
          <div><div style={{ fontSize: "11px", color: "rgba(255,255,255,0.55)", textTransform: "uppercase" }}>Validation status</div><div style={{ marginTop: "6px" }}><StatusPill value={view.validationStatus} /></div></div>
          <div><div style={{ fontSize: "11px", color: "rgba(255,255,255,0.55)", textTransform: "uppercase" }}>Account status</div><div style={{ marginTop: "6px" }}><StatusPill value={view.accountStatus} /></div></div>
          <div><div style={{ fontSize: "11px", color: "rgba(255,255,255,0.55)", textTransform: "uppercase" }}>Masked destination</div><div style={{ marginTop: "6px", fontWeight: 800 }}>{view.payoutDestination}</div></div>
          <div><div style={{ fontSize: "11px", color: "rgba(255,255,255,0.55)", textTransform: "uppercase" }}>PAN reference</div><div style={{ marginTop: "6px", fontWeight: 800 }}>{view.panMasked}</div></div>
        </div>
      </Card>
    </FinanceShell>
  );
}
