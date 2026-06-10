import Link from "next/link";
import { redirect } from "next/navigation";

import AdminLayout from "@/components/admin/AdminLayout";
import { AdminFinanceHeader } from "@/components/finance/AdminFinanceFrame";
import FinanceActionButton from "@/components/finance/FinanceActionButton";
import { Banner, Card, DataTable, EmptyState, StatusPill } from "@/components/finance/FinanceUi";
import { hasValidAdminSession } from "@/lib/admin-auth";
import { getAdminFinanceBlockedReasons, getAdminFinanceNav, loadAdminPageContext } from "@/lib/finance/admin-finance-ui";
import { listRefundRequestsForAdmin } from "@/lib/finance/refund-admin";
import { createAdminSupabaseClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function AdminFinanceRefundsPage() {
  if (!(await hasValidAdminSession())) redirect("/admin");
  const supabase = createAdminSupabaseClient();
  const [refunds, pageContext] = await Promise.all([listRefundRequestsForAdmin(supabase), loadAdminPageContext(supabase)]);
  const blocked = getAdminFinanceBlockedReasons(pageContext.settings.taxMode);

  return (
    <AdminLayout admin={{ id: "system-admin", name: "Famlo Admin", email: "admin@famlo.in" }} activeTab="refunds" killSwitchActive={pageContext.killSwitchActive}>
      <AdminFinanceHeader title="Refund operations" description="Review refund requests, provider status, approval state, execution readiness, and attempt history from the guarded refund workflow." nav={getAdminFinanceNav("/admin/finance/refunds")} />
      {blocked.refundExecution ? <Banner tone="warning" title="Provider execution blocked" message={blocked.refundExecution} /> : null}
      {refunds.length === 0 ? (
        <EmptyState title="No refund requests" message="Refund requests will appear here when ops or policy workflows create them." />
      ) : (
        <Card>
          <DataTable
            headers={["Request", "Booking", "Amount", "Booking state", "Payment state", "Refund workflow", "Provider", "Credit note", "Payout impact", "Attempts", "Actions"]}
            rows={refunds.map((row) => [
              <div key="request" style={{ display: "grid", gap: "6px" }}>
                <Link href={`/admin/finance/refunds/${row.id}`} style={{ color: "white", fontWeight: 800, textDecoration: "none" }}>{row.id.slice(0, 8)}</Link>
                <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.6)" }}>{row.reason}</div>
              </div>,
              <div key="booking" style={{ display: "grid", gap: "6px" }}>
                <div>{row.bookingId}</div>
                <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.6)" }}>{row.paymentId}</div>
              </div>,
              new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(row.refundAmount),
              <StatusPill key="booking-status" value={row.bookingStatus} />,
              <StatusPill key="payment" value={row.paymentStatus} />,
              <StatusPill key="status" value={row.status} />,
              <StatusPill key="provider" value={row.providerStatus} />,
              <StatusPill key="credit-note" value={row.creditNoteStatus} />,
              <StatusPill key="payout" value={row.payoutLinkStatus} />,
              `${row.attemptsCount} (${row.latestAttemptStatus || "none"})`,
              <div key="actions" style={{ display: "grid", gap: "8px", minWidth: "160px" }}>
                <FinanceActionButton label="Approve" endpoint="/api/admin/finance/refunds/approve" payload={{ refundRequestId: row.id }} kind="primary" />
                <FinanceActionButton label="Reject" endpoint="/api/admin/finance/refunds/reject" payload={{ refundRequestId: row.id }} kind="danger" />
                <FinanceActionButton label="Execute" endpoint="/api/admin/finance/refunds/execute" payload={{ refundRequestId: row.id }} disabledReason={blocked.refundExecution || (row.status !== "approved" ? "Only approved refunds can be executed." : null)} />
              </div>,
            ])}
          />
        </Card>
      )}
    </AdminLayout>
  );
}
