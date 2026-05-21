import Link from "next/link";
import { redirect } from "next/navigation";

import AdminLayout from "@/components/admin/AdminLayout";
import { AdminFinanceHeader } from "@/components/finance/AdminFinanceFrame";
import FinanceActionButton from "@/components/finance/FinanceActionButton";
import { Banner, Card, DataTable, EmptyState, StatusPill } from "@/components/finance/FinanceUi";
import { hasValidAdminSession } from "@/lib/admin-auth";
import { getAdminFinanceBlockedReasons, getAdminFinanceNav, loadAdminInvoiceRows, loadAdminPageContext } from "@/lib/finance/admin-finance-ui";
import { createAdminSupabaseClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function AdminFinanceInvoicesPage() {
  if (!(await hasValidAdminSession())) redirect("/admin");
  const supabase = createAdminSupabaseClient();
  const [rows, pageContext] = await Promise.all([loadAdminInvoiceRows(supabase), loadAdminPageContext(supabase)]);
  const blocked = getAdminFinanceBlockedReasons(pageContext.settings.taxMode);

  return (
    <AdminLayout admin={{ id: "system-admin", name: "Famlo Admin", email: "admin@famlo.in" }} activeTab="finance" killSwitchActive={pageContext.killSwitchActive}>
      <AdminFinanceHeader title="Invoices and credit notes" description="Generate, download, and email guest invoices, platform-fee invoices, and credit notes through guarded routes only." nav={getAdminFinanceNav("/admin/finance/invoices")} />
      {(blocked.guestInvoice || blocked.platformFeeInvoice || blocked.creditNote || blocked.email) ? <Banner tone="warning" title="Some document actions are blocked" message={[blocked.guestInvoice, blocked.platformFeeInvoice, blocked.creditNote, blocked.email].filter(Boolean).join(" ")} /> : null}
      {rows.length === 0 ? (
        <EmptyState title="No invoice artifacts yet" message="Issued finance documents will appear here once generated." />
      ) : (
        <Card>
          <DataTable
            headers={["Document", "Booking", "Status", "Amount", "Email", "Downloads", "Actions"]}
            rows={rows.map((row) => [
              <div key="number" style={{ display: "grid", gap: "6px" }}>
                <div style={{ fontWeight: 800 }}>{row.number}</div>
                <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.6)" }}>{row.kind}</div>
              </div>,
              row.bookingId,
              <StatusPill key="status" value={row.status} />,
              new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(row.amount),
              row.emailStatus ? <StatusPill key="email" value={row.emailStatus} /> : "Not sent",
              <Link key="download" href={row.downloadHref} style={{ color: "#bfdbfe", textDecoration: "none", fontWeight: 700 }}>Download PDF</Link>,
              <div key="actions" style={{ display: "grid", gap: "8px", minWidth: "180px" }}>
                <FinanceActionButton label="Generate guest invoice" endpoint="/api/admin/finance/invoices/generate-guest-tax-invoice" payload={{ bookingId: row.bookingId }} kind="primary" disabledReason={blocked.guestInvoice} />
                <FinanceActionButton label="Generate platform invoice" endpoint="/api/admin/finance/invoices/generate-platform-fee-invoice" payload={{ bookingId: row.bookingId }} disabledReason={blocked.platformFeeInvoice} />
                <FinanceActionButton label="Generate credit note" endpoint="/api/admin/finance/credit-notes/generate" payload={{ bookingId: row.bookingId }} disabledReason="Use the existing refund-linked credit-note flow for accurate credit note amounts." />
                <FinanceActionButton label="Send email" endpoint={row.kind === "credit_note" ? "/api/admin/finance/credit-notes/send-email" : "/api/admin/finance/invoices/send-email"} payload={row.kind === "credit_note" ? { creditNoteId: row.id } : { invoiceId: row.id }} disabledReason={blocked.email} />
              </div>,
            ])}
          />
        </Card>
      )}
    </AdminLayout>
  );
}
