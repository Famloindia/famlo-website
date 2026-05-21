import type { SupabaseClient } from "@supabase/supabase-js";

import {
  asNumber,
  asRecord,
  asString,
  formatDateRange,
  sumBy,
  type JsonRecord,
} from "@/lib/finance/dashboard-view-utils";
import {
  isAdminFinanceOpsUiEnabled,
  isAdminReconciliationUiEnabled,
  isAdminSettlementActionsEnabled,
  isCreditNoteGenerationEnabled,
  isGstExportEnabledFlag,
  isGstInvoiceGenerationEnabled,
  isInvoiceEmailDeliveryEnabled,
  isPlatformFeeInvoiceGenerationEnabled,
  isRefundProviderExecutionEnabled,
  isRazorpayRefundsEnabled,
  isSettlementApprovalFlowEnabled,
  isSettlementPayoutExecutionEnabled,
} from "@/lib/finance/feature-flags";
import { getFinanceRuntimeConfig } from "@/lib/finance/finance-runtime-config";
import { resolveFinanceDocumentById } from "@/lib/finance/invoices/pdf/document-service";
import { listAdminPayouts, getAdminPayoutDetail } from "@/lib/finance/payout-admin";
import { buildProductionFinanceReadinessReport } from "@/lib/finance/production-readiness";
import { buildFinanceReconciliationSnapshot } from "@/lib/finance/reconciliation";
import { listRefundRequestsForAdmin, getRefundRequestDetailForAdmin } from "@/lib/finance/refund-admin";
import { loadCreditNoteReport } from "@/lib/finance/reports/credit-note-report";
import { loadGatewayItcReport } from "@/lib/finance/reports/gateway-itc-report";
import { loadGstAccommodationReport } from "@/lib/finance/reports/gst-accommodation-report";
import { loadPlatformFeeGstReport } from "@/lib/finance/reports/platform-fee-gst-report";
import { loadRevenueReport } from "@/lib/finance/reports/revenue-report";
import { loadTdsReport } from "@/lib/finance/reports/tds-report";
import { getFinanceSettings } from "@/lib/finance/settings";

export type AdminDashboardCard = {
  label: string;
  value: string;
  detail: string;
};

export type AdminSettlementRow = {
  id: string;
  settlementCode: string;
  status: string;
  periodLabel: string;
  netAmount: number;
  payoutStatus: string;
  holdReasons: string[];
  includedBookingCount: number;
};

export type AdminInvoiceRow = {
  id: string;
  kind: "guest_tax_invoice" | "platform_fee_invoice" | "credit_note";
  number: string;
  bookingId: string;
  status: string;
  amount: number;
  issuedAt: string | null;
  downloadHref: string;
  emailStatus: string | null;
};

export type AdminReportsView = {
  startDate: string;
  endDate: string;
  links: Array<{ label: string; href: string }>;
};

export async function loadAdminDashboardCards(supabase: SupabaseClient): Promise<AdminDashboardCard[]> {
  const [overview, refunds, settlements, payouts, reconciliation, readiness, gstRows, tdsRows] = await Promise.all([
    loadAdminOverviewSnapshot(supabase),
    listRefundRequestsForAdmin(supabase),
    loadAdminSettlementRows(supabase),
    listAdminPayouts(supabase),
    buildFinanceReconciliationSnapshot(supabase),
    buildProductionFinanceReadinessReport(supabase),
    loadGstAccommodationReport(supabase, {
      startDate: new Date(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1).toISOString().slice(0, 10),
      endDate: new Date().toISOString().slice(0, 10),
    }),
    loadTdsReport(supabase, {
      startDate: new Date(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1).toISOString().slice(0, 10),
      endDate: new Date().toISOString().slice(0, 10),
    }),
  ]);

  return [
    { label: "Guest collections", value: overview.guestCollections, detail: "Captured guest money in scope" },
    {
      label: "Refunds pending approval",
      value: String(refunds.filter((row) => row.status === "requested").length),
      detail: "Requests still awaiting ops review",
    },
    {
      label: "Settlements pending approval",
      value: String(settlements.filter((row) => row.status === "draft").length),
      detail: "Draft settlements not yet approved",
    },
    {
      label: "Payouts pending trigger",
      value: String(settlements.filter((row) => row.status === "approved").length),
      detail: "Approved settlements ready for payout check",
    },
    {
      label: "Failed payouts",
      value: String(payouts.filter((row) => (asString(row.status) ?? "") === "failed").length),
      detail: "Needs retry or finance review",
    },
    {
      label: "Reconciliation critical issues",
      value: String(reconciliation.overall.critical),
      detail: "Must be cleared before automation",
    },
    {
      label: "GST invoice status",
      value: `${gstRows.length} issued`,
      detail: "Issued guest GST invoices in selected window",
    },
    {
      label: "GST payable estimate",
      value: new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(sumBy(gstRows, (row) => asNumber((row as JsonRecord).total_gst))),
      detail: "Issued invoice basis only",
    },
    {
      label: "TDS payable estimate",
      value: new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(sumBy(tdsRows, (row) => asNumber((row as JsonRecord).tds_amount))),
      detail: "Host payout withholding records only",
    },
    {
      label: "Production readiness",
      value: readiness.tax.state.toUpperCase(),
      detail: "Grouped rollout readiness summary",
    },
  ];
}

export async function loadAdminOverviewSnapshot(supabase: SupabaseClient): Promise<{ guestCollections: string }> {
  const { data, error } = await supabase.from("payments_v2").select("amount_total,status").eq("status", "paid");
  if (error) throw error;
  return {
    guestCollections: new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(
      sumBy((data ?? []) as JsonRecord[], (row) => asNumber(row.amount_total))
    ),
  };
}

export async function loadAdminSettlementRows(supabase: SupabaseClient): Promise<AdminSettlementRow[]> {
  const [{ data: settlements, error }, payouts] = await Promise.all([
    supabase
      .from("host_settlements_v2")
      .select("id,settlement_code,status,period_start,period_end,net_payable_amount,metadata,included_booking_count")
      .order("created_at", { ascending: false }),
    listAdminPayouts(supabase),
  ]);
  if (error) throw error;

  const payoutBySettlementId = new Map((payouts ?? []).map((row) => [asString(row.settlementId) ?? "", row]));
  return ((settlements ?? []) as JsonRecord[]).map((row) => {
    const metadata = asRecord(row.metadata);
    const reasons = [];
    if ((asString(row.status) ?? "") === "draft" && !isSettlementApprovalFlowEnabled()) reasons.push("Approval flow flag is disabled.");
    if ((asString(row.status) ?? "") === "approved" && !isSettlementPayoutExecutionEnabled()) reasons.push("Payout execution flag is disabled.");
    if (asNumber(metadata.excluded_candidate_count) > 0) reasons.push(`${asNumber(metadata.excluded_candidate_count)} excluded candidate(s) remained outside this draft.`);
    return {
      id: asString(row.id) ?? "",
      settlementCode: asString(row.settlement_code) ?? asString(row.id) ?? "Settlement",
      status: asString(row.status) ?? "",
      periodLabel: formatDateRange(asString(row.period_start), asString(row.period_end)),
      netAmount: asNumber(row.net_payable_amount),
      payoutStatus: asString((payoutBySettlementId.get(asString(row.id) ?? "") as JsonRecord | undefined)?.status) ?? "not_started",
      holdReasons: reasons,
      includedBookingCount: asNumber(row.included_booking_count),
    };
  });
}

export async function loadAdminSettlementDetail(
  supabase: SupabaseClient,
  settlementId: string
): Promise<{
  settlement: JsonRecord | null;
  lineItems: JsonRecord[];
}> {
  const [{ data: settlement, error: settlementError }, { data: lineItems, error: lineItemsError }] = await Promise.all([
    supabase.from("host_settlements_v2").select("*").eq("id", settlementId).maybeSingle(),
    supabase.from("settlement_line_items_v2").select("*").eq("settlement_id", settlementId).order("created_at", { ascending: true }),
  ]);
  if (settlementError) throw settlementError;
  if (lineItemsError) throw lineItemsError;
  return {
    settlement: (settlement as JsonRecord | null) ?? null,
    lineItems: (lineItems ?? []) as JsonRecord[],
  };
}

export async function loadAdminInvoiceRows(supabase: SupabaseClient): Promise<AdminInvoiceRow[]> {
  const [{ data: guestInvoices, error: guestError }, { data: platformInvoices, error: platformError }, { data: creditNotes, error: creditError }] =
    await Promise.all([
      supabase.from("guest_tax_invoices").select("id,invoice_number,booking_id,status,total_amount,issued_at,created_at"),
      supabase.from("platform_fee_invoices").select("id,invoice_number,booking_id,status,total_amount,issued_at,created_at"),
      supabase.from("credit_notes").select("id,credit_note_number,booking_id,status,total_reversal_amount,issued_at,created_at"),
    ]);
  if (guestError) throw guestError;
  if (platformError) throw platformError;
  if (creditError) throw creditError;

  const artifactIds = [
    ...((guestInvoices ?? []) as JsonRecord[]).map((row) => asString(row.id)).filter(Boolean),
    ...((platformInvoices ?? []) as JsonRecord[]).map((row) => asString(row.id)).filter(Boolean),
    ...((creditNotes ?? []) as JsonRecord[]).map((row) => asString(row.id)).filter(Boolean),
  ] as string[];
  const { data: deliveries } =
    artifactIds.length > 0
      ? await supabase.from("finance_email_deliveries").select("artifact_id,status").in("artifact_id", artifactIds)
      : { data: [] as JsonRecord[] };
  const deliveryByArtifactId = new Map(((deliveries ?? []) as JsonRecord[]).map((row) => [asString(row.artifact_id) ?? "", asString(row.status) ?? "pending"]));

  return [
    ...((guestInvoices ?? []) as JsonRecord[]).map((row) => ({
      id: asString(row.id) ?? "",
      kind: "guest_tax_invoice" as const,
      number: asString(row.invoice_number) ?? "",
      bookingId: asString(row.booking_id) ?? "",
      status: asString(row.status) ?? "",
      amount: asNumber(row.total_amount),
      issuedAt: asString(row.issued_at) ?? asString(row.created_at),
      downloadHref: `/api/admin/finance/invoices/${asString(row.id) ?? ""}/download`,
      emailStatus: deliveryByArtifactId.get(asString(row.id) ?? "") ?? null,
    })),
    ...((platformInvoices ?? []) as JsonRecord[]).map((row) => ({
      id: asString(row.id) ?? "",
      kind: "platform_fee_invoice" as const,
      number: asString(row.invoice_number) ?? "",
      bookingId: asString(row.booking_id) ?? "",
      status: asString(row.status) ?? "",
      amount: asNumber(row.total_amount),
      issuedAt: asString(row.issued_at) ?? asString(row.created_at),
      downloadHref: `/api/admin/finance/invoices/${asString(row.id) ?? ""}/download`,
      emailStatus: deliveryByArtifactId.get(asString(row.id) ?? "") ?? null,
    })),
    ...((creditNotes ?? []) as JsonRecord[]).map((row) => ({
      id: asString(row.id) ?? "",
      kind: "credit_note" as const,
      number: asString(row.credit_note_number) ?? "",
      bookingId: asString(row.booking_id) ?? "",
      status: asString(row.status) ?? "",
      amount: asNumber(row.total_reversal_amount),
      issuedAt: asString(row.issued_at) ?? asString(row.created_at),
      downloadHref: `/api/admin/finance/invoices/${asString(row.id) ?? ""}/download`,
      emailStatus: deliveryByArtifactId.get(asString(row.id) ?? "") ?? null,
    })),
  ].sort((left, right) => String(right.issuedAt ?? "").localeCompare(String(left.issuedAt ?? "")));
}

export async function loadAdminInvoiceDetail(supabase: SupabaseClient, invoiceId: string) {
  return resolveFinanceDocumentById(supabase, invoiceId);
}

export async function loadAdminRefundDetail(supabase: SupabaseClient, refundId: string) {
  return getRefundRequestDetailForAdmin(supabase, refundId);
}

export async function loadAdminPayoutDetailView(supabase: SupabaseClient, payoutId: string) {
  return getAdminPayoutDetail(supabase, payoutId);
}

export async function loadAdminReadinessView(supabase: SupabaseClient) {
  return buildProductionFinanceReadinessReport(supabase);
}

export async function loadAdminReconciliationView(supabase: SupabaseClient) {
  return buildFinanceReconciliationSnapshot(supabase);
}

export function getAdminFinanceBlockedReasons(settingsTaxMode: string) {
  const runtime = getFinanceRuntimeConfig();
  const pendingComplianceReason = "Blocked while tax mode remains PENDING_COMPLIANCE.";
  return {
    guestInvoice: settingsTaxMode === "PENDING_COMPLIANCE"
      ? pendingComplianceReason
      : !isGstInvoiceGenerationEnabled()
        ? "GST invoice generation flag is disabled."
        : null,
    platformFeeInvoice: settingsTaxMode === "PENDING_COMPLIANCE"
      ? pendingComplianceReason
      : !isPlatformFeeInvoiceGenerationEnabled()
        ? "Platform-fee invoice generation flag is disabled."
        : null,
    creditNote: settingsTaxMode === "PENDING_COMPLIANCE"
      ? pendingComplianceReason
      : !isCreditNoteGenerationEnabled()
        ? "Credit-note generation flag is disabled."
        : null,
    refundExecution: !isRefundProviderExecutionEnabled() || !isRazorpayRefundsEnabled()
      ? "Provider refund execution is disabled by rollout flags."
      : null,
    payoutTrigger: !isSettlementPayoutExecutionEnabled()
      ? "Settlement payout execution is disabled by rollout flags."
      : null,
    settlementApproval: !isAdminSettlementActionsEnabled() || !isSettlementApprovalFlowEnabled()
      ? "Settlement approval flow is disabled."
      : null,
    reports: settingsTaxMode === "PENDING_COMPLIANCE"
      ? "GST exports stay blocked while tax mode remains PENDING_COMPLIANCE."
      : !isGstExportEnabledFlag()
        ? "GST exports are disabled by default until GST_EXPORT_ENABLED is set."
        : null,
    email: !isInvoiceEmailDeliveryEnabled() ? "Finance email delivery is disabled." : null,
  };
}

export async function loadAdminReportsView(
  supabase: SupabaseClient,
  input: { startDate: string; endDate: string }
): Promise<AdminReportsView> {
  await Promise.all([
    loadGstAccommodationReport(supabase, input),
    loadPlatformFeeGstReport(supabase, input),
    loadCreditNoteReport(supabase, input),
    loadTdsReport(supabase, input),
    loadRevenueReport(supabase, input),
    loadGatewayItcReport(supabase, input),
  ]);
  const query = `startDate=${encodeURIComponent(input.startDate)}&endDate=${encodeURIComponent(input.endDate)}&format=csv`;
  return {
    startDate: input.startDate,
    endDate: input.endDate,
    links: [
      { label: "GST accommodation report", href: `/api/admin/finance/reports/gst?type=accommodation&${query}` },
      { label: "Platform-fee GST report", href: `/api/admin/finance/reports/gst?type=platform-fee&${query}` },
      { label: "Credit-note report", href: `/api/admin/finance/reports/gst?type=credit-notes&${query}` },
      { label: "TDS report", href: `/api/admin/finance/reports/tds?${query}` },
      { label: "Revenue report", href: `/api/admin/finance/reports/revenue?${query}` },
      { label: "Gateway ITC report", href: `/api/admin/finance/reports/gateway-itc?${query}` },
    ],
  };
}

export async function loadAdminPageContext(supabase: SupabaseClient) {
  const [{ data: killSwitchData }, settings, readiness] = await Promise.all([
    supabase.from("platform_settings").select("value").eq("key", "kill_switch_active").maybeSingle(),
    getFinanceSettings({}, supabase),
    buildProductionFinanceReadinessReport(supabase),
  ]);
  return {
    settings,
    readiness,
    runtime: getFinanceRuntimeConfig(),
    killSwitchActive: killSwitchData?.value === "true",
    rolloutDisabledReason: !isAdminFinanceOpsUiEnabled()
      ? "Admin finance ops UI is rollout-gated. The surface stays available for review, but no new unsafe defaults were enabled."
      : null,
  };
}

export function getAdminFinanceNav(pathname: string) {
  return [
    { href: "/admin/finance", label: "Overview", active: pathname === "/admin/finance" },
    { href: "/admin/finance/refunds", label: "Refunds", active: pathname.startsWith("/admin/finance/refunds") },
    { href: "/admin/finance/settlements", label: "Settlements", active: pathname.startsWith("/admin/finance/settlements") },
    { href: "/admin/finance/payouts", label: "Payouts", active: pathname.startsWith("/admin/finance/payouts") },
    { href: "/admin/finance/reconciliation", label: "Reconciliation", active: pathname === "/admin/finance/reconciliation" },
    { href: "/admin/finance/invoices", label: "Invoices", active: pathname === "/admin/finance/invoices" },
    { href: "/admin/finance/reports", label: "Reports", active: pathname === "/admin/finance/reports" },
    { href: "/admin/finance/readiness", label: "Readiness", active: pathname === "/admin/finance/readiness" },
  ];
}

export function describeAdminDisabledState(kind: "reconciliation" | "reports"): string | null {
  if (kind === "reconciliation" && !isAdminReconciliationUiEnabled()) {
    return "Reconciliation UI is disabled by flag. Data stays blocked until the reconciliation rollout is enabled.";
  }
  return null;
}
