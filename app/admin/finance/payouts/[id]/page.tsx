import { notFound, redirect } from "next/navigation";

import AdminLayout from "@/components/admin/AdminLayout";
import { AdminFinanceHeader } from "@/components/finance/AdminFinanceFrame";
import FinanceActionButton from "@/components/finance/FinanceActionButton";
import { Card, DataTable, SectionHeader, StatusPill } from "@/components/finance/FinanceUi";
import { hasValidAdminSession } from "@/lib/admin-auth";
import { asString } from "@/lib/finance/dashboard-view-utils";
import { getAdminFinanceNav, loadAdminPageContext, loadAdminPayoutDetailView } from "@/lib/finance/admin-finance-ui";
import { createAdminSupabaseClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function AdminFinancePayoutDetailPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await hasValidAdminSession())) redirect("/admin");
  const { id } = await params;
  const supabase = createAdminSupabaseClient();
  const [detail, pageContext] = await Promise.all([loadAdminPayoutDetailView(supabase, String(id ?? "").trim()), loadAdminPageContext(supabase)]);
  if (!detail) notFound();

  return (
    <AdminLayout admin={{ id: "system-admin", name: "Famlo Admin", email: "admin@famlo.in" }} activeTab="finance" killSwitchActive={pageContext.killSwitchActive}>
      <AdminFinanceHeader title={`Payout ${String(id).slice(0, 8)}`} description="Inspect provider events, settlement linkage, masked destination, and guarded hold or retry actions." nav={getAdminFinanceNav("/admin/finance/payouts")} />
      <Card>
        <SectionHeader title="Payout summary" />
        <div style={{ display: "grid", gap: "16px", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
          <div><div style={{ fontSize: "11px", textTransform: "uppercase", color: "rgba(255,255,255,0.55)" }}>Status</div><div style={{ marginTop: "6px" }}><StatusPill value={asString((detail.execution as any)?.status)} /></div></div>
          <div><div style={{ fontSize: "11px", textTransform: "uppercase", color: "rgba(255,255,255,0.55)" }}>Settlement</div><div style={{ marginTop: "6px", fontWeight: 800 }}>{asString((detail.settlement as any)?.settlement_code) ?? asString((detail.execution as any)?.settlement_id) ?? "Not available"}</div></div>
          <div><div style={{ fontSize: "11px", textTransform: "uppercase", color: "rgba(255,255,255,0.55)" }}>Destination</div><div style={{ marginTop: "6px", fontWeight: 800 }}>{asString((detail as any).destinationMasked) ?? "Not available"}</div></div>
        </div>
      </Card>
      <Card style={{ marginTop: "18px" }}>
        <SectionHeader title="Actions" />
        <div style={{ display: "grid", gap: "10px", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
          <FinanceActionButton label="Retry failed payout" endpoint="/api/admin/finance/payouts/retry" payload={{ payoutExecutionId: id }} disabledReason={asString((detail.execution as any)?.status) !== "failed" ? "Only failed payouts can be retried." : null} />
          <FinanceActionButton label="Mark needs review" endpoint="/api/admin/finance/payouts/mark-needs-review" payload={{ payoutExecutionId: id }} kind="danger" />
          <FinanceActionButton
            label={asString((detail.execution as any)?.payout_hold_status) === "on_hold" || asString((detail.execution as any)?.payout_hold_status) === "paused" ? "Release hold" : "Hold payout"}
            endpoint={asString((detail.execution as any)?.payout_hold_status) === "on_hold" || asString((detail.execution as any)?.payout_hold_status) === "paused" ? "/api/admin/finance/payouts/release" : "/api/admin/finance/payouts/hold"}
            payload={
              asString((detail.execution as any)?.payout_hold_status) === "on_hold" || asString((detail.execution as any)?.payout_hold_status) === "paused"
                ? { targetType: "payout_execution", targetId: id, reason: "Finance ops release" }
                : { targetType: "payout_execution", targetId: id, reason: "Finance ops hold", isHostActionable: false }
            }
          />
        </div>
      </Card>
      <Card style={{ marginTop: "18px" }}>
        <SectionHeader title="Webhook and provider events" />
        <DataTable
          headers={["Event", "Status", "Created", "Error"]}
          rows={((detail.providerEvents as any[]) ?? []).map((event) => [
            asString(event.event_type) ?? "",
            <StatusPill key="status" value={asString(event.processing_status)} />,
            asString(event.created_at) ?? "",
            asString(event.error_message) ?? "None",
          ])}
        />
      </Card>
    </AdminLayout>
  );
}
