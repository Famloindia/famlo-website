import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import AdminLayout from "@/components/admin/AdminLayout";
import { AdminFinanceHeader } from "@/components/finance/AdminFinanceFrame";
import FinanceActionButton from "@/components/finance/FinanceActionButton";
import { Banner, Card, DataTable, SectionHeader, StatusPill } from "@/components/finance/FinanceUi";
import { hasValidAdminSession } from "@/lib/admin-auth";
import { getAdminFinanceBlockedReasons, getAdminFinanceNav, loadAdminPageContext, loadAdminRefundDetail } from "@/lib/finance/admin-finance-ui";
import { asString } from "@/lib/finance/dashboard-view-utils";
import { createAdminSupabaseClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function AdminFinanceRefundDetailPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await hasValidAdminSession())) redirect("/admin");
  const { id } = await params;
  const supabase = createAdminSupabaseClient();
  const [detail, pageContext] = await Promise.all([loadAdminRefundDetail(supabase, String(id ?? "").trim()), loadAdminPageContext(supabase)]);
  if (!detail) notFound();
  const blocked = getAdminFinanceBlockedReasons(pageContext.settings.taxMode);

  return (
    <AdminLayout admin={{ id: "system-admin", name: "Famlo Admin", email: "admin@famlo.in" }} activeTab="finance" killSwitchActive={pageContext.killSwitchActive}>
      <AdminFinanceHeader title={`Refund ${String(id).slice(0, 8)}`} description="Inspect refund request detail, provider status, attempt history, and guarded admin actions." nav={getAdminFinanceNav("/admin/finance/refunds")} />
      {blocked.refundExecution ? <Banner tone="warning" title="Provider execution blocked" message={blocked.refundExecution} /> : null}
      <Card>
        <SectionHeader title="Refund summary" />
        <div style={{ display: "grid", gap: "16px", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
          <div><div style={{ fontSize: "11px", textTransform: "uppercase", color: "rgba(255,255,255,0.55)" }}>Booking</div><Link href={`/admin/finance/bookings/${asString((detail.booking as any)?.id) ?? ""}`} style={{ marginTop: "6px", display: "inline-block", color: "white", fontWeight: 800, textDecoration: "none" }}>{asString((detail.booking as any)?.id) ?? "Unavailable"}</Link></div>
          <div><div style={{ fontSize: "11px", textTransform: "uppercase", color: "rgba(255,255,255,0.55)" }}>Request status</div><div style={{ marginTop: "6px" }}><StatusPill value={asString((detail.request as any)?.status)} /></div></div>
          <div><div style={{ fontSize: "11px", textTransform: "uppercase", color: "rgba(255,255,255,0.55)" }}>Provider status</div><div style={{ marginTop: "6px" }}><StatusPill value={asString((detail.payment as any)?.refund_status)} /></div></div>
        </div>
      </Card>
      <Card style={{ marginTop: "18px" }}>
        <SectionHeader title="Admin actions" />
        <div style={{ display: "grid", gap: "10px", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
          <FinanceActionButton label="Approve request" endpoint="/api/admin/finance/refunds/approve" payload={{ refundRequestId: id }} kind="primary" />
          <FinanceActionButton label="Reject request" endpoint="/api/admin/finance/refunds/reject" payload={{ refundRequestId: id }} kind="danger" />
          <FinanceActionButton label="Execute approved refund" endpoint="/api/admin/finance/refunds/execute" payload={{ refundRequestId: id }} disabledReason={blocked.refundExecution || (asString((detail.request as any)?.status) !== "approved" ? "Only approved refund requests can be executed." : null)} />
        </div>
      </Card>
      <Card style={{ marginTop: "18px" }}>
        <SectionHeader title="Attempt history" />
        <DataTable
          headers={["Attempt", "Status", "Amount", "Provider refund id"]}
          rows={((detail.attempts as any[]) ?? []).map((attempt) => [
            asString(attempt.id) ?? "",
            <StatusPill key="status" value={asString(attempt.status)} />,
            new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(attempt.amount ?? 0)),
            asString(attempt.provider_refund_id) ?? "Not available",
          ])}
        />
      </Card>
    </AdminLayout>
  );
}
