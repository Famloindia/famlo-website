import type { SupabaseClient } from "@supabase/supabase-js";

import { asNumber, asRecord, asString } from "@/lib/finance/reports/report-exporter";

type JsonRecord = Record<string, unknown>;

function maskDestination(account: JsonRecord | null): string {
  if (!account) return "";
  const vpa = asString(account.vpa);
  if (vpa) return `UPI ${vpa}`;
  const accountNumberMasked = asString(account.account_number_masked);
  const ifsc = asString(account.ifsc);
  if (accountNumberMasked && ifsc) return `${accountNumberMasked} · ${ifsc}`;
  return accountNumberMasked ?? "";
}

export async function listAdminPayouts(supabase: SupabaseClient): Promise<Record<string, unknown>[]> {
  const [{ data: executions, error: executionsError }, { data: settlements, error: settlementsError }, { data: accounts, error: accountsError }] = await Promise.all([
    supabase.from("host_payout_executions").select("*").order("created_at", { ascending: false }),
    supabase.from("host_settlements_v2").select("id,settlement_code,host_id,status,net_payable_amount,paid_at,failed_at,transfer_reference,updated_at,payout_hold_status,payout_hold_reason"),
    supabase.from("host_payout_accounts").select("host_id,is_active,account_number_masked,ifsc,vpa").eq("is_active", true),
  ]);

  if (executionsError) throw executionsError;
  if (settlementsError) throw settlementsError;
  if (accountsError) throw accountsError;

  const settlementById = new Map(((settlements ?? []) as JsonRecord[]).map((row) => [asString(row.id) ?? "", row]));
  const activeAccountByHostId = new Map(((accounts ?? []) as JsonRecord[]).map((row) => [asString(row.host_id) ?? "", row]));

  return ((executions ?? []) as JsonRecord[]).map((execution) => {
    const settlement = settlementById.get(asString(execution.settlement_id) ?? "") ?? null;
    const account = activeAccountByHostId.get(asString(execution.host_id) ?? "") ?? null;
    return {
      id: asString(execution.id) ?? "",
      settlementId: asString(execution.settlement_id) ?? "",
      settlementCode: asString(settlement?.settlement_code) ?? "",
      hostId: asString(execution.host_id) ?? "",
      status: asString(execution.status) ?? "",
      settlementStatus: asString(settlement?.status) ?? "",
      amount: asNumber(execution.amount),
      provider: asString(execution.provider) ?? "",
      providerPayoutId: asString(execution.provider_payout_id) ?? "",
      referenceId: asString(execution.reference_id) ?? "",
      expectedOrProcessedDate: asString(execution.processed_at) ?? asString(settlement?.paid_at) ?? asString(execution.created_at) ?? "",
      failureReason: asString(execution.failure_reason) ?? "",
      destinationMasked: maskDestination(account),
      payoutHoldStatus: asString(execution.payout_hold_status) ?? asString(settlement?.payout_hold_status) ?? "active",
      payoutHoldReason: asString(execution.payout_hold_reason) ?? asString(settlement?.payout_hold_reason) ?? "",
    };
  });
}

export async function getAdminPayoutDetail(supabase: SupabaseClient, payoutExecutionId: string): Promise<Record<string, unknown> | null> {
  const { data: execution, error } = await supabase.from("host_payout_executions").select("*").eq("id", payoutExecutionId).maybeSingle();
  if (error) throw error;
  if (!execution) return null;

  const executionRecord = execution as JsonRecord;
  const settlementId = asString(executionRecord.settlement_id);
  const hostId = asString(executionRecord.host_id);
  const [{ data: settlement, error: settlementError }, { data: account, error: accountError }, { data: lineItems, error: lineItemsError }, { data: providerEvents, error: providerEventsError }] =
    await Promise.all([
      settlementId ? supabase.from("host_settlements_v2").select("*").eq("id", settlementId).maybeSingle() : Promise.resolve({ data: null, error: null }),
      hostId ? supabase.from("host_payout_accounts").select("*").eq("host_id", hostId).eq("is_active", true).order("updated_at", { ascending: false }).maybeSingle() : Promise.resolve({ data: null, error: null }),
      settlementId ? supabase.from("settlement_line_items_v2").select("*").eq("settlement_id", settlementId).order("created_at", { ascending: true }) : Promise.resolve({ data: [], error: null }),
      supabase
        .from("payment_provider_events")
        .select("id,event_type,processing_status,created_at,error_message,entity_id,raw_payload")
        .eq("provider", "RAZORPAYX")
        .order("created_at", { ascending: false }),
    ]);

  if (settlementError) throw settlementError;
  if (accountError) throw accountError;
  if (lineItemsError) throw lineItemsError;
  if (providerEventsError) throw providerEventsError;

  const providerPayoutId = asString(executionRecord.provider_payout_id);
  const referenceId = asString(executionRecord.reference_id);

  return {
    execution,
    settlement,
    lineItems: lineItems ?? [],
    destinationMasked: maskDestination((account as JsonRecord | null) ?? null),
    providerEvents: ((providerEvents ?? []) as JsonRecord[]).filter((event) => {
      const rawPayload = asRecord(event.raw_payload);
      const entityId = asString(event.entity_id);
      const payloadReferenceId =
        asString(rawPayload.reference_id) ??
        asString(asRecord(rawPayload.payload).reference_id) ??
        asString(asRecord(asRecord(rawPayload.payload).payout).reference_id);
      return Boolean(
        (providerPayoutId && entityId === providerPayoutId) ||
          (referenceId && payloadReferenceId === referenceId)
      );
    }),
  };
}

export async function listHostPayouts(supabase: SupabaseClient, hostId: string): Promise<Record<string, unknown>[]> {
  const [{ data: executions, error: executionsError }, { data: settlements, error: settlementsError }, { data: account, error: accountError }] = await Promise.all([
    supabase.from("host_payout_executions").select("*").eq("host_id", hostId).order("created_at", { ascending: false }),
    supabase.from("host_settlements_v2").select("id,settlement_code,status,paid_at,failed_at").eq("host_id", hostId),
    supabase.from("host_payout_accounts").select("account_number_masked,ifsc,vpa").eq("host_id", hostId).eq("is_active", true).order("updated_at", { ascending: false }).maybeSingle(),
  ]);

  if (executionsError) throw executionsError;
  if (settlementsError) throw settlementsError;
  if (accountError) throw accountError;

  const settlementById = new Map(((settlements ?? []) as JsonRecord[]).map((row) => [asString(row.id) ?? "", row]));
  const destinationMasked = maskDestination((account as JsonRecord | null) ?? null);

  return ((executions ?? []) as JsonRecord[]).map((execution) => {
    const settlement = settlementById.get(asString(execution.settlement_id) ?? "") ?? null;
    return {
      id: asString(execution.id) ?? "",
      settlementId: asString(execution.settlement_id) ?? "",
      settlementCode: asString(settlement?.settlement_code) ?? "",
      amount: asNumber(execution.amount),
      status: asString(execution.status) ?? "",
      expectedOrProcessedDate: asString(execution.processed_at) ?? asString(execution.created_at) ?? "",
      failureReason: asString(execution.failure_reason) ?? "",
      destinationMasked,
    };
  });
}
