import Link from "next/link";
import { redirect } from "next/navigation";

import { Banner, Card, DataTable, EmptyState, FinanceShell, SectionHeader, StatusPill } from "@/components/finance/FinanceUi";
import { describeHostEmptyState, getHostFinanceNav, getHostFinanceRolloutNotice, hostFullDate, loadHostInvoiceRows } from "@/lib/finance/host-finance-ui";
import { resolveFinanceHostAccess } from "@/lib/finance/host-finance-access";
import { createAdminSupabaseClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function HostFinanceInvoicesPage() {
  const supabase = createAdminSupabaseClient();
  const hostAccess = await resolveFinanceHostAccess(supabase);
  if (!hostAccess) redirect("/partners/login");

  const invoices = await loadHostInvoiceRows(supabase, hostAccess.hostId);
  const rolloutNotice = getHostFinanceRolloutNotice();

  return (
    <FinanceShell
      eyebrow="Famlo Pro Finance"
      title="Invoices and credit notes"
      description="Download only your own platform-fee invoices and any matching host-relevant credit notes."
      nav={getHostFinanceNav("/host/finance/invoices")}
    >
      {rolloutNotice ? <Banner tone="warning" title="Rollout guard active" message={rolloutNotice} /> : null}
      {invoices.length === 0 ? (
        <EmptyState {...describeHostEmptyState("invoices")} />
      ) : (
        <Card>
          <SectionHeader title="Issued documents" />
          <DataTable
            headers={["Document", "Booking", "Issued", "Amount", "Status", "Email", "PDF"]}
            rows={invoices.map((row) => [
              <div key="number" style={{ display: "grid", gap: "6px" }}>
                <div style={{ fontWeight: 800 }}>{row.number}</div>
                <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.6)" }}>{row.kind === "credit_note" ? "Credit note" : "Platform-fee invoice"}</div>
              </div>,
              row.bookingId,
              hostFullDate(row.issuedAt),
              new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(row.amount),
              <StatusPill key="status" value={row.status} />,
              row.emailStatus ? <StatusPill key="email" value={row.emailStatus} /> : "Not sent",
              <Link key="download" href={row.downloadHref} style={{ color: "#bfdbfe", fontWeight: 700, textDecoration: "none" }}>Download PDF</Link>,
            ])}
          />
        </Card>
      )}
    </FinanceShell>
  );
}
