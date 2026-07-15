import type { SupabaseClient } from "@supabase/supabase-js";

import { getFinanceSettings } from "@/lib/finance/settings";
import { reconcilePayments } from "@/lib/finance/reconciliation/payment-reconciliation";
import { reconcileProviderEventHealth } from "@/lib/finance/reconciliation/provider-event-health";
import {
  type FinanceReconciliationSnapshot,
  summarizeReconciliationIssues,
} from "@/lib/finance/reconciliation/reconciliation-contracts";
import { reconcilePayouts } from "@/lib/finance/reconciliation/payout-reconciliation";
import { reconcileRefunds } from "@/lib/finance/reconciliation/refund-reconciliation";

type JsonRecord = Record<string, unknown>;

function toRecordArray<T extends JsonRecord>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

export async function buildFinanceReconciliationSnapshot(supabase: SupabaseClient): Promise<FinanceReconciliationSnapshot> {
  const settings = await getFinanceSettings({}, supabase);

  const [
    paymentsRes,
    bookingsRes,
    intentsRes,
    providerEventsRes,
    folioLinesRes,
    refundRequestsRes,
    refundAttemptsRes,
    refundsRes,
    creditNotesRes,
    settlementsRes,
    payoutExecutionsRes,
    payoutAccountsRes,
    settlementLineItemsRes,
  ] = await Promise.all([
    supabase
      .from("payments_v2")
      .select("id,booking_id,gateway,status,amount_total,gateway_payment_id,gateway_order_id,raw_response,created_at"),
    supabase.from("bookings_v2").select("id,payment_id,payment_status,status,total_price,pricing_snapshot"),
    supabase.from("payment_intents").select("payment_id,booking_id,provider,provider_order_id"),
    supabase
      .from("payment_provider_events")
      .select("id,provider,event_id,event_type,entity_type,entity_id,signature_valid,processing_status,processed_at,error_message,created_at"),
    supabase.from("folio_line_items_v2").select("booking_id,line_code,source_event_type,source_event_id"),
    supabase
      .from("refund_requests")
      .select("id,booking_id,payment_id,refund_amount,refund_base_amount,refund_gst_amount,status,requires_admin_approval,created_at"),
    supabase.from("refund_attempts").select("id,refund_request_id,provider,provider_refund_id,amount,status,created_at"),
    supabase.from("refunds_v2").select("id,booking_id,payment_id,provider,provider_refund_id,amount_total,status,processed_at,metadata,created_at"),
    supabase.from("credit_notes_v2").select("refund_id"),
    supabase.from("host_settlements_v2").select("id,host_id,host_user_id,status,net_payable_amount,transfer_reference,created_at,updated_at"),
    supabase.from("host_payout_executions").select("id,settlement_id,host_id,provider,provider_payout_id,amount,status,reference_id,created_at"),
    supabase.from("host_payout_accounts").select("host_id,provider,is_active"),
    supabase.from("settlement_line_items_v2").select("settlement_id,booking_id"),
  ]);

  if (paymentsRes.error) throw paymentsRes.error;
  if (bookingsRes.error) throw bookingsRes.error;
  if (intentsRes.error) throw intentsRes.error;
  if (providerEventsRes.error) throw providerEventsRes.error;
  if (folioLinesRes.error) throw folioLinesRes.error;
  if (refundRequestsRes.error) throw refundRequestsRes.error;
  if (refundAttemptsRes.error) throw refundAttemptsRes.error;
  if (refundsRes.error) throw refundsRes.error;
  if (creditNotesRes.error) throw creditNotesRes.error;
  if (settlementsRes.error) throw settlementsRes.error;
  if (payoutExecutionsRes.error) throw payoutExecutionsRes.error;
  if (payoutAccountsRes.error) throw payoutAccountsRes.error;
  if (settlementLineItemsRes.error) throw settlementLineItemsRes.error;

  const providerEvents = toRecordArray(providerEventsRes.data);

  const paymentIssues = reconcilePayments({
    payments: toRecordArray(paymentsRes.data),
    bookings: toRecordArray(bookingsRes.data),
    paymentIntents: toRecordArray(intentsRes.data),
    providerEvents,
    folioLines: toRecordArray(folioLinesRes.data),
  });

  const refundIssues = reconcileRefunds({
    refundRequests: toRecordArray(refundRequestsRes.data),
    refundAttempts: toRecordArray(refundAttemptsRes.data),
    refunds: toRecordArray(refundsRes.data),
    folioLines: toRecordArray(folioLinesRes.data),
    creditNotes: toRecordArray(creditNotesRes.data),
    taxMode: settings.taxMode,
  });

  const payoutIssues = reconcilePayouts({
    settlements: toRecordArray(settlementsRes.data),
    payoutExecutions: toRecordArray(payoutExecutionsRes.data),
    payoutAccounts: toRecordArray(payoutAccountsRes.data),
    refundRequests: toRecordArray(refundRequestsRes.data),
    settlementLineItems: toRecordArray(settlementLineItemsRes.data),
    providerEvents,
  });

  const providerEventReport = reconcileProviderEventHealth({
    providerEvents,
  });

  const overall = summarizeReconciliationIssues([
    ...paymentIssues,
    ...refundIssues,
    ...payoutIssues,
    ...providerEventReport.issues,
  ]);

  return {
    generatedAt: new Date().toISOString(),
    taxMode: settings.taxMode,
    payments: {
      summary: summarizeReconciliationIssues(paymentIssues),
      issues: paymentIssues,
    },
    refunds: {
      summary: summarizeReconciliationIssues(refundIssues),
      issues: refundIssues,
    },
    payouts: {
      summary: summarizeReconciliationIssues(payoutIssues),
      issues: payoutIssues,
    },
    providerEvents: {
      summary: summarizeReconciliationIssues(providerEventReport.issues),
      issues: providerEventReport.issues,
      health: providerEventReport.health,
    },
    overall,
  };
}
