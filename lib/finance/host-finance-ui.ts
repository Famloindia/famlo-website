import type { SupabaseClient } from "@supabase/supabase-js";

import {
  asBoolean,
  asNumber,
  asRecord,
  asString,
  formatCompactDate,
  formatDate,
  formatDateRange,
  maskPan,
  startOfMonthIso,
  sumBy,
  type JsonRecord,
} from "@/lib/finance/dashboard-view-utils";
import {
  isHostFinanceUiEnabled,
  isHostSettlementReadEnabled,
  isPayoutAccountCreationEnabled,
  isPayoutAccountValidationEnabled,
  isRazorpayXEnabled,
} from "@/lib/finance/feature-flags";
import { type FinanceHostAccess } from "@/lib/finance/host-finance-access";
import { listHostPayouts } from "@/lib/finance/payout-admin";

export type HostFinanceSummary = {
  upcomingPayoutAmount: number;
  upcomingPayoutDate: string | null;
  paidThisMonthAmount: number;
  pendingSettlementsCount: number;
  refundAdjustmentsAmount: number;
  panStatus: string;
  payoutAccountStatus: string;
  actionRequired: string[];
};

export type HostSettlementListItem = {
  id: string;
  settlementCode: string;
  periodLabel: string;
  status: string;
  grossHostPayout: number;
  tdsAmount: number;
  adjustmentsAmount: number;
  netPayout: number;
  payoutStatus: string;
  payoutReference: string | null;
  createdAt: string | null;
};

export type HostSettlementDetailLine = {
  bookingId: string;
  reservationId: string | null;
  roomBase: number;
  platformFee: number;
  hostGrossPayout: number;
  refundAdjustment: number;
};

export type HostSettlementDetail = {
  settlement: HostSettlementListItem | null;
  lines: HostSettlementDetailLine[];
  payoutReference: string | null;
  statementHref: string | null;
};

export type HostPayoutAccountView = {
  legalName: string | null;
  panStatus: string;
  panMasked: string;
  validationStatus: string;
  payoutDestination: string;
  accountStatus: string;
  actionRequired: string[];
  flagsBlockedReason: string | null;
};

export type HostPayoutRow = {
  id: string;
  settlementId: string;
  settlementCode: string;
  amount: number;
  status: string;
  expectedOrProcessedDate: string | null;
  failureReason: string | null;
  destinationMasked: string;
};

export type HostInvoiceRow = {
  id: string;
  kind: "platform_fee_invoice" | "credit_note";
  number: string;
  bookingId: string;
  issuedAt: string | null;
  amount: number;
  status: string;
  emailStatus: string | null;
  downloadHref: string;
};

export type HostRefundAdjustmentRow = {
  id: string;
  bookingId: string;
  refundReason: string;
  refundAmount: number;
  adjustmentAmount: number;
  settlementImpact: string;
  status: string;
};

function payoutDestinationLabel(account: JsonRecord | null): string {
  if (!account) return "No active destination";
  const vpa = asString(account.vpa);
  if (vpa) return `UPI ${vpa}`;
  const masked = asString(account.account_number_masked);
  const ifsc = asString(account.ifsc);
  if (masked && ifsc) return `${masked} · ${ifsc}`;
  return masked ?? "No active destination";
}

function normalizePanStatus(record: JsonRecord | null): string {
  const status = asString(record?.verification_status)?.toLowerCase();
  if (asBoolean(record?.is_verified) || status === "verified" || status === "approved") return "Verified";
  if (status) return status.replace(/\b\w/g, (match) => match.toUpperCase());
  return "Action required";
}

function mapSettlementRow(row: JsonRecord, payoutStatus: string): HostSettlementListItem {
  return {
    id: asString(row.id) ?? "",
    settlementCode: asString(row.settlement_code) ?? asString(row.id) ?? "Settlement",
    periodLabel: formatDateRange(asString(row.period_start), asString(row.period_end)),
    status: asString(row.status) ?? "draft",
    grossHostPayout: asNumber(row.gross_booking_value) - asNumber(row.platform_fee_amount),
    tdsAmount: asNumber(row.withholding_amount),
    adjustmentsAmount: asNumber(row.refund_adjustment_amount),
    netPayout: asNumber(row.net_payable_amount),
    payoutStatus,
    payoutReference: asString(row.transfer_reference),
    createdAt: asString(row.created_at),
  };
}

async function loadHostBookingsById(supabase: SupabaseClient, hostId: string): Promise<Map<string, JsonRecord>> {
  const { data, error } = await supabase
    .from("bookings_v2")
    .select("id,host_id,pricing_snapshot")
    .eq("host_id", hostId);
  if (error) throw error;
  return new Map(((data ?? []) as JsonRecord[]).map((row) => [asString(row.id) ?? "", row]));
}

export async function loadHostFinanceSummary(
  supabase: SupabaseClient,
  hostAccess: FinanceHostAccess
): Promise<HostFinanceSummary> {
  const [payouts, settlementRows, accountView, refundRows, hostTaxDetails] = await Promise.all([
    listHostPayouts(supabase, hostAccess.hostId),
    loadHostSettlementList(supabase, hostAccess.hostId),
    loadHostPayoutAccountView(supabase, hostAccess),
    loadHostRefundAdjustments(supabase, hostAccess.hostId),
    hostAccess.hostUserId
      ? supabase
          .from("host_tax_details")
          .select("verification_status,is_verified")
          .eq("user_id", hostAccess.hostUserId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  const monthStart = startOfMonthIso();
  const pendingPayout = payouts.find((row) => ["created", "processing", "pending"].includes((asString(row.status) ?? "").toLowerCase())) ?? null;

  return {
    upcomingPayoutAmount: pendingPayout ? asNumber(pendingPayout.amount) : 0,
    upcomingPayoutDate: asString(pendingPayout?.expectedOrProcessedDate),
    paidThisMonthAmount: sumBy(
      payouts.filter((row) => (asString(row.status) ?? "").toLowerCase() === "processed" && (asString(row.expectedOrProcessedDate) ?? "") >= monthStart),
      (row) => asNumber(row.amount)
    ),
    pendingSettlementsCount: settlementRows.filter((row) => ["draft", "approved", "payout_pending", "payout_processing"].includes(row.status)).length,
    refundAdjustmentsAmount: sumBy(refundRows, (row) => row.adjustmentAmount),
    panStatus: normalizePanStatus((hostTaxDetails.data as JsonRecord | null) ?? null),
    payoutAccountStatus: accountView.accountStatus,
    actionRequired: [...accountView.actionRequired],
  };
}

export async function loadHostPayoutAccountView(
  supabase: SupabaseClient,
  hostAccess: FinanceHostAccess
): Promise<HostPayoutAccountView> {
  const [{ data: account }, { data: hostTaxDetails }] = await Promise.all([
    supabase
      .from("host_payout_accounts")
      .select("account_holder_name,account_number_masked,ifsc,vpa,validation_status,is_active")
      .eq("host_id", hostAccess.hostId)
      .eq("provider", "RAZORPAYX")
      .order("updated_at", { ascending: false })
      .maybeSingle(),
    hostAccess.hostUserId
      ? supabase
          .from("host_tax_details")
          .select("pan_holder_name,verification_status,is_verified,pan_last_four")
          .eq("user_id", hostAccess.hostUserId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  const accountRow = (account as JsonRecord | null) ?? null;
  const taxRow = (hostTaxDetails as JsonRecord | null) ?? null;
  const actionRequired: string[] = [];
  const flagBlocks: string[] = [];

  if (!isRazorpayXEnabled()) flagBlocks.push("RazorpayX payout setup is disabled for this environment.");
  if (!isPayoutAccountCreationEnabled()) flagBlocks.push("Payout account onboarding is still rollout-gated.");
  if (!isPayoutAccountValidationEnabled()) actionRequired.push("Automatic payout account validation is off, so new destinations stay under manual review.");
  if (normalizePanStatus(taxRow) !== "Verified") actionRequired.push("PAN or KYC verification is still pending.");
  if (!accountRow || !asBoolean(accountRow.is_active)) actionRequired.push("No active payout destination is available yet.");

  return {
    legalName: asString(taxRow?.pan_holder_name) ?? asString(accountRow?.account_holder_name) ?? hostAccess.displayName,
    panStatus: normalizePanStatus(taxRow),
    panMasked: maskPan(asString(taxRow?.pan_last_four)),
    validationStatus: asString(accountRow?.validation_status) ?? "Not started",
    payoutDestination: payoutDestinationLabel(accountRow),
    accountStatus: accountRow && asBoolean(accountRow.is_active) ? "Active" : flagBlocks.length > 0 ? "Blocked by rollout flags" : "Action required",
    actionRequired,
    flagsBlockedReason: flagBlocks.length > 0 ? flagBlocks.join(" ") : null,
  };
}

export async function loadHostSettlementList(
  supabase: SupabaseClient,
  hostId: string
): Promise<HostSettlementListItem[]> {
  const [{ data: settlements, error: settlementError }, payouts] = await Promise.all([
    supabase
      .from("host_settlements_v2")
      .select("id,settlement_code,status,period_start,period_end,gross_booking_value,platform_fee_amount,refund_adjustment_amount,withholding_amount,net_payable_amount,transfer_reference,created_at")
      .eq("host_id", hostId)
      .order("created_at", { ascending: false }),
    listHostPayouts(supabase, hostId),
  ]);
  if (settlementError) throw settlementError;

  const payoutBySettlementId = new Map((payouts ?? []).map((row) => [asString(row.settlementId) ?? "", asString(row.status) ?? "not_started"]));
  return ((settlements ?? []) as JsonRecord[]).map((row) => mapSettlementRow(row, payoutBySettlementId.get(asString(row.id) ?? "") ?? "not_started"));
}

export async function loadHostSettlementDetail(
  supabase: SupabaseClient,
  hostId: string,
  settlementId: string
): Promise<HostSettlementDetail | null> {
  const { data: settlement, error: settlementError } = await supabase
    .from("host_settlements_v2")
    .select("*")
    .eq("id", settlementId)
    .eq("host_id", hostId)
    .maybeSingle();
  if (settlementError) throw settlementError;
  if (!settlement) return null;

  const { data: lineItems, error: lineError } = await supabase
    .from("settlement_line_items_v2")
    .select("*")
    .eq("settlement_id", settlementId)
    .order("created_at", { ascending: true });
  if (lineError) throw lineError;

  const bookingIds = Array.from(new Set(((lineItems ?? []) as JsonRecord[]).map((row) => asString(row.booking_id)).filter(Boolean))) as string[];
  const bookingMap = await loadHostBookingsById(supabase, hostId);
  const payouts = await listHostPayouts(supabase, hostId);
  const payoutBySettlementId = new Map((payouts ?? []).map((row) => [asString(row.settlementId) ?? "", row]));
  const settlementRow = settlement as JsonRecord;

  const lines = bookingIds.map((bookingId) => {
    const booking = bookingMap.get(bookingId) ?? {};
    const snapshot = asRecord(booking.pricing_snapshot);
    const contract = asRecord(snapshot.section_9_5_contract);
    const roomBase = asNumber(snapshot.room_base_amount ?? contract.roomBaseAmount);
    const platformFee = asNumber(snapshot.platform_fee_amount ?? contract.platformFeeAmount);
    const hostGrossPayout = asNumber(snapshot.host_gross_payout_amount ?? contract.hostGrossPayoutAmount);
    const matchingLine = ((lineItems ?? []) as JsonRecord[]).find((row) => asString(row.booking_id) === bookingId) ?? {};
    return {
      bookingId,
      reservationId: asString(matchingLine.reservation_id),
      roomBase,
      platformFee,
      hostGrossPayout,
      refundAdjustment: Math.abs(asNumber(asRecord(matchingLine.metadata).refund_adjustment_amount)),
    };
  });

  const payout = payoutBySettlementId.get(settlementId) as JsonRecord | undefined;

  return {
    settlement: mapSettlementRow(settlementRow, asString(payout?.status) ?? "not_started"),
    lines,
    payoutReference: asString(payout?.id) ?? asString(settlementRow.transfer_reference),
    statementHref: null,
  };
}

export async function loadHostPayoutRows(supabase: SupabaseClient, hostId: string): Promise<HostPayoutRow[]> {
  const rows = await listHostPayouts(supabase, hostId);
  return (rows ?? []).map((row) => ({
    id: asString(row.id) ?? "",
    settlementId: asString(row.settlementId) ?? "",
    settlementCode: asString(row.settlementCode) ?? "",
    amount: asNumber(row.amount),
    status: asString(row.status) ?? "",
    expectedOrProcessedDate: asString(row.expectedOrProcessedDate),
    failureReason: asString(row.failureReason),
    destinationMasked: asString(row.destinationMasked) ?? "",
  }));
}

export async function loadHostInvoiceRows(supabase: SupabaseClient, hostId: string): Promise<HostInvoiceRow[]> {
  const [{ data: platformInvoices, error: platformError }, bookingRows] = await Promise.all([
    supabase
      .from("platform_fee_invoices")
      .select("id,invoice_number,booking_id,host_id,status,total_amount,issued_at,created_at")
      .eq("host_id", hostId)
      .order("created_at", { ascending: false }),
    supabase.from("bookings_v2").select("id,host_id").eq("host_id", hostId),
  ]);
  if (platformError) throw platformError;

  const bookingIds = new Set(((bookingRows.data ?? []) as JsonRecord[]).map((row) => asString(row.id)).filter(Boolean) as string[]);
  const { data: creditNotes, error: creditNoteError } = await supabase
    .from("credit_notes")
    .select("id,credit_note_number,booking_id,status,total_reversal_amount,issued_at,created_at,original_invoice_type")
    .in("booking_id", Array.from(bookingIds))
    .eq("original_invoice_type", "platform_fee_invoice")
    .order("created_at", { ascending: false });
  if (creditNoteError) throw creditNoteError;

  const artifactIds = [
    ...((platformInvoices ?? []) as JsonRecord[]).map((row) => asString(row.id)).filter(Boolean),
    ...((creditNotes ?? []) as JsonRecord[]).map((row) => asString(row.id)).filter(Boolean),
  ] as string[];
  const { data: deliveries } =
    artifactIds.length > 0
      ? await supabase
          .from("finance_email_deliveries")
          .select("artifact_id,status,sent_at")
          .in("artifact_id", artifactIds)
          .order("sent_at", { ascending: false })
      : { data: [] as JsonRecord[] };
  const deliveryByArtifactId = new Map(((deliveries ?? []) as JsonRecord[]).map((row) => [asString(row.artifact_id) ?? "", asString(row.status) ?? "pending"]));

  return [
    ...((platformInvoices ?? []) as JsonRecord[]).map((row) => ({
      id: asString(row.id) ?? "",
      kind: "platform_fee_invoice" as const,
      number: asString(row.invoice_number) ?? "Platform fee invoice",
      bookingId: asString(row.booking_id) ?? "",
      issuedAt: asString(row.issued_at) ?? asString(row.created_at),
      amount: asNumber(row.total_amount),
      status: asString(row.status) ?? "",
      emailStatus: deliveryByArtifactId.get(asString(row.id) ?? "") ?? null,
      downloadHref: `/api/host/finance/invoices/${asString(row.id) ?? ""}/download`,
    })),
    ...((creditNotes ?? []) as JsonRecord[]).map((row) => ({
      id: asString(row.id) ?? "",
      kind: "credit_note" as const,
      number: asString(row.credit_note_number) ?? "Credit note",
      bookingId: asString(row.booking_id) ?? "",
      issuedAt: asString(row.issued_at) ?? asString(row.created_at),
      amount: asNumber(row.total_reversal_amount),
      status: asString(row.status) ?? "",
      emailStatus: deliveryByArtifactId.get(asString(row.id) ?? "") ?? null,
      downloadHref: `/api/host/finance/invoices/${asString(row.id) ?? ""}/download`,
    })),
  ].sort((left, right) => String(right.issuedAt ?? "").localeCompare(String(left.issuedAt ?? "")));
}

export async function loadHostRefundAdjustments(supabase: SupabaseClient, hostId: string): Promise<HostRefundAdjustmentRow[]> {
  const [bookings, refunds, folios, settlements, settlementLines] = await Promise.all([
    supabase.from("bookings_v2").select("id,host_id").eq("host_id", hostId),
    supabase.from("refund_requests").select("id,booking_id,reason,refund_amount,status").order("created_at", { ascending: false }),
    supabase.from("reservation_folios_v2").select("booking_id,refund_total_amount").eq("host_id", hostId),
    supabase.from("host_settlements_v2").select("id,host_id,settlement_code").eq("host_id", hostId),
    supabase.from("settlement_line_items_v2").select("booking_id,settlement_id"),
  ]);

  const bookingIds = new Set(((bookings.data ?? []) as JsonRecord[]).map((row) => asString(row.id)).filter(Boolean) as string[]);
  const folioByBookingId = new Map(((folios.data ?? []) as JsonRecord[]).map((row) => [asString(row.booking_id) ?? "", row]));
  const settlementById = new Map(((settlements.data ?? []) as JsonRecord[]).map((row) => [asString(row.id) ?? "", row]));
  const settlementLineByBookingId = new Map(
    ((settlementLines.data ?? []) as JsonRecord[])
      .filter((row) => bookingIds.has(asString(row.booking_id) ?? ""))
      .map((row) => [asString(row.booking_id) ?? "", row])
  );

  return ((refunds.data ?? []) as JsonRecord[])
    .filter((row) => bookingIds.has(asString(row.booking_id) ?? ""))
    .map((row) => {
      const bookingId = asString(row.booking_id) ?? "";
      const folio = folioByBookingId.get(bookingId) ?? null;
      const line = settlementLineByBookingId.get(bookingId) ?? null;
      const settlement = settlementById.get(asString(line?.settlement_id) ?? "") ?? null;
      return {
        id: asString(row.id) ?? "",
        bookingId,
        refundReason: asString(row.reason) ?? "refund_adjustment",
        refundAmount: asNumber(row.refund_amount),
        adjustmentAmount: Math.abs(asNumber(folio?.refund_total_amount) || asNumber(row.refund_amount)),
        settlementImpact: settlement ? `Adjusted in ${asString(settlement.settlement_code) ?? "settlement"}` : "Pending settlement adjustment",
        status: asString(row.status) ?? "",
      };
    });
}

export function getHostFinanceNav(pathname: string) {
  return [
    { href: "/host/finance", label: "Overview", active: pathname === "/host/finance" },
    { href: "/host/finance/payout-account", label: "Payout Account", active: pathname === "/host/finance/payout-account" },
    { href: "/host/finance/settlements", label: "Settlements", active: pathname.startsWith("/host/finance/settlements") },
    { href: "/host/finance/payouts", label: "Payouts", active: pathname === "/host/finance/payouts" },
    { href: "/host/finance/invoices", label: "Invoices", active: pathname === "/host/finance/invoices" },
    { href: "/host/finance/refund-adjustments", label: "Refund Adjustments", active: pathname === "/host/finance/refund-adjustments" },
  ];
}

export function getHostFinanceRolloutNotice(): string | null {
  if (!isHostFinanceUiEnabled()) {
    return "Host finance UI is rollout-gated. This page stays read-only until the host finance flag is enabled.";
  }
  if (!isHostSettlementReadEnabled()) {
    return "Settlement visibility is still disabled, so some finance sections may remain unavailable.";
  }
  return null;
}

export function describeHostEmptyState(kind: "settlements" | "payouts" | "invoices" | "refunds"): { title: string; message: string } {
  switch (kind) {
    case "settlements":
      return {
        title: "No settlements yet",
        message: "Settlements will appear here after completed bookings move through approval and payout review.",
      };
    case "payouts":
      return {
        title: "No payouts yet",
        message: "Your payout timeline will appear here once an approved settlement is sent for transfer.",
      };
    case "invoices":
      return {
        title: "No documents yet",
        message: "Platform-fee invoices and any matching credit notes will show up here once they are issued.",
      };
    default:
      return {
        title: "No refund adjustments yet",
        message: "Refund-related settlement adjustments will appear here when a booking refund affects your payout.",
      };
  }
}

export function describeHostActionRequired(summary: HostFinanceSummary): string | null {
  if (summary.actionRequired.length === 0) return null;
  return summary.actionRequired.join(" ");
}

export function settlementReferenceLabel(value: string | null | undefined): string {
  const raw = asString(value);
  if (!raw) return "Not available";
  return raw.length > 18 ? raw.slice(0, 18) : raw;
}

export function hostCompactDate(value: string | null | undefined): string {
  return formatCompactDate(value);
}

export function hostFullDate(value: string | null | undefined): string {
  return formatDate(value);
}
