import type { SupabaseClient } from "@supabase/supabase-js";

import {
  isFinanceSettlementEngineEnabled,
  isSettlementDraftGenerationEnabled,
  isSettlementIncludeOtaEnabled,
  isSettlementRequireCheckoutCompleted,
} from "@/lib/finance/feature-flags";
import { appendFinanceAuditLog } from "@/lib/finance/operations";
import { evaluateSettlementEligibility, type SettlementEligibilityResult } from "@/lib/finance/settlement-eligibility";
import { asNumber, asString, type JsonRecord } from "@/lib/platform-utils";

type FolioRow = {
  id: string;
  reservation_id: string;
  booking_id?: string | null;
  host_id?: string | null;
  property_id?: string | null;
  guest_user_id?: string | null;
  source_channel?: string | null;
  booking_status?: string | null;
  payment_status?: string | null;
  currency?: string | null;
  guest_total_amount?: number | null;
  platform_fee_amount?: number | null;
  platform_fee_tax_amount?: number | null;
  host_payout_amount?: number | null;
  refund_total_amount?: number | null;
  metadata?: JsonRecord | null;
};

type ReservationRow = {
  id: string;
  booking_id?: string | null;
  check_in_date?: string | null;
  check_out_date?: string | null;
  operational_status?: string | null;
  source_kind?: string | null;
  source_channel?: string | null;
};

type BookingRow = {
  id: string;
  status?: string | null;
  payment_status?: string | null;
  source_channel?: string | null;
  pricing_snapshot?: JsonRecord | null;
};

type FolioLineRow = {
  folio_id: string;
  line_code?: string | null;
  amount?: number | null;
  direction?: string | null;
  source_event_type?: string | null;
  source_event_id?: string | null;
};

type PayoutRow = {
  id: string;
  booking_id?: string | null;
  status?: string | null;
};

type HostRow = {
  id: string;
  user_id?: string | null;
};

type ActiveSettlementLineRow = {
  folio_id?: string | null;
  settlement_id?: string | null;
};

type ExistingDraftRow = {
  id: string;
  settlement_code: string;
  host_id: string;
  property_id?: string | null;
  currency?: string | null;
  period_start: string;
  period_end: string;
  status: string;
};

type CandidateTotals = {
  grossBookingValue: number;
  platformFeeAmount: number;
  platformFeeTaxAmount: number;
  refundAdjustmentAmount: number;
  withholdingAmount: number;
  netPayableAmount: number;
};

export type SettlementCandidate = {
  folioId: string;
  bookingId: string | null;
  reservationId: string;
  payoutId: string | null;
  sourceKind: "direct" | "ota";
  sourceChannel: string | null;
  paymentCollectMode: string;
  bookingStatus: string | null;
  paymentStatus: string | null;
  reservationCheckOutDate: string | null;
  guestTotalAmount: number;
  platformFeeAmount: number;
  platformFeeTaxAmount: number;
  refundAdjustmentAmount: number;
  hostPayoutAmount: number;
  existingActiveSettlementId: string | null;
  ambiguityWarnings: string[];
  reasons: string[];
  eligible: boolean;
  lineCodes: string[];
};

export type SettlementCandidateListResult = {
  hostId: string;
  propertyId: string | null;
  periodStart: string;
  periodEnd: string;
  currency: string;
  eligibleFolios: SettlementCandidate[];
  excludedFolios: SettlementCandidate[];
  totals: CandidateTotals;
  includeOta: boolean;
};

export type CreateDraftHostSettlementInput = {
  hostId: string;
  propertyId?: string | null;
  periodStart: string;
  periodEnd: string;
  includeOta?: boolean;
  dryRun?: boolean;
  forceNewDraft?: boolean;
  actorUserId?: string | null;
};

export type CreateDraftHostSettlementResult = {
  dryRun: boolean;
  settlementId: string | null;
  settlementCode: string | null;
  includedBookingCount: number;
  grossBookingValue: number;
  platformFeeAmount: number;
  refundAdjustmentAmount: number;
  netPayableAmount: number;
  currency: string;
  excludedCandidates: SettlementCandidate[];
  includedCandidates: SettlementCandidate[];
  reusedExistingDraft: boolean;
};

function normalizeDate(value: string): string {
  return value.trim();
}

function toObject(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;
}

function normalizeCurrency(value: string | null | undefined): string {
  const currency = asString(value) ?? "INR";
  return currency.toUpperCase();
}

function makeSettlementCode(input: { hostId: string; propertyId?: string | null; periodStart: string; periodEnd: string }): string {
  const hostToken = input.hostId.replace(/-/g, "").slice(0, 6).toUpperCase();
  const propertyToken = (input.propertyId ?? "HOST").replace(/-/g, "").slice(0, 4).toUpperCase();
  const from = input.periodStart.replace(/-/g, "");
  const to = input.periodEnd.replace(/-/g, "");
  return `SET-${from}-${to}-${hostToken}-${propertyToken}`;
}

function sumCandidateTotals(candidates: SettlementCandidate[]): CandidateTotals {
  return candidates.reduce<CandidateTotals>(
    (totals, candidate) => {
      totals.grossBookingValue += candidate.guestTotalAmount;
      totals.platformFeeAmount += candidate.platformFeeAmount;
      totals.platformFeeTaxAmount += candidate.platformFeeTaxAmount;
      totals.refundAdjustmentAmount += candidate.refundAdjustmentAmount;
      totals.withholdingAmount += 0;
      totals.netPayableAmount += candidate.hostPayoutAmount;
      return totals;
    },
    {
      grossBookingValue: 0,
      platformFeeAmount: 0,
      platformFeeTaxAmount: 0,
      refundAdjustmentAmount: 0,
      withholdingAmount: 0,
      netPayableAmount: 0,
    }
  );
}

function sameCandidateSet(left: SettlementCandidate[], rightFolioIds: string[]): boolean {
  const leftIds = left.map((candidate) => candidate.folioId).sort();
  const rightIds = [...rightFolioIds].sort();
  if (leftIds.length !== rightIds.length) return false;
  return leftIds.every((value, index) => value === rightIds[index]);
}

async function loadHostUserId(supabase: SupabaseClient, hostId: string): Promise<string | null> {
  const { data, error } = await supabase.from("hosts").select("id,user_id").eq("id", hostId).maybeSingle();
  if (error) throw error;
  return asString((data as HostRow | null)?.user_id);
}

async function loadSettlementCandidates(
  supabase: SupabaseClient,
  input: {
    hostId: string;
    propertyId: string | null;
    periodStart: string;
    periodEnd: string;
  }
): Promise<{
  folios: FolioRow[];
  reservationsById: Map<string, ReservationRow>;
  bookingsById: Map<string, BookingRow>;
  lineCodesByFolioId: Map<string, Set<string>>;
  payoutByBookingId: Map<string, string>;
  activeSettlementByFolioId: Map<string, string>;
  activeCancellationHoldBookingIds: Set<string>;
}> {
  let folioQuery = supabase
    .from("reservation_folios_v2")
    .select("*")
    .eq("host_id", input.hostId)
    .not("booking_id", "is", null);

  if (input.propertyId) {
    folioQuery = folioQuery.eq("property_id", input.propertyId);
  }

  const { data: foliosData, error: foliosError } = await folioQuery;
  if (foliosError) throw foliosError;
  const folios = ((foliosData ?? []) as FolioRow[]).filter((folio) => Boolean(folio.id) && Boolean(folio.reservation_id));
  const reservationIds = Array.from(new Set(folios.map((folio) => folio.reservation_id)));
  const bookingIds = Array.from(new Set(folios.map((folio) => asString(folio.booking_id)).filter(Boolean))) as string[];
  const folioIds = folios.map((folio) => folio.id);

  const [reservationsRes, bookingsRes, linesRes, payoutsRes, activeRes, holdsRes] = await Promise.all([
    reservationIds.length > 0
      ? supabase
          .from("reservations_v2")
          .select("id,booking_id,check_in_date,check_out_date,operational_status,source_kind,source_channel")
          .in("id", reservationIds)
      : Promise.resolve({ data: [], error: null }),
    bookingIds.length > 0
      ? supabase.from("bookings_v2").select("id,status,payment_status,source_channel,pricing_snapshot").in("id", bookingIds)
      : Promise.resolve({ data: [], error: null }),
    folioIds.length > 0
      ? supabase
          .from("folio_line_items_v2")
          .select("folio_id,line_code,amount,direction,source_event_type,source_event_id")
          .in("folio_id", folioIds)
      : Promise.resolve({ data: [], error: null }),
    bookingIds.length > 0
      ? supabase.from("payouts_v2").select("id,booking_id,status").in("booking_id", bookingIds)
      : Promise.resolve({ data: [], error: null }),
    folioIds.length > 0
      ? supabase
          .from("settlement_line_items_v2")
          .select("folio_id,settlement_id")
          .eq("is_active", true)
          .in("folio_id", folioIds)
      : Promise.resolve({ data: [], error: null }),
    bookingIds.length > 0
      ? supabase.from("booking_settlement_holds_v2").select("booking_id").eq("is_active", true).in("booking_id", bookingIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (reservationsRes.error) throw reservationsRes.error;
  if (bookingsRes.error) throw bookingsRes.error;
  if (linesRes.error) throw linesRes.error;
  if (payoutsRes.error) throw payoutsRes.error;
  if (activeRes.error) throw activeRes.error;
  if (holdsRes.error) throw holdsRes.error;

  const reservationsById = new Map<string, ReservationRow>();
  for (const row of (reservationsRes.data ?? []) as ReservationRow[]) {
    const checkOut = asString(row.check_out_date);
    if (!checkOut || checkOut < input.periodStart || checkOut > input.periodEnd) continue;
    reservationsById.set(row.id, row);
  }

  const filteredFolios = folios.filter((folio) => reservationsById.has(folio.reservation_id));

  const bookingsById = new Map<string, BookingRow>();
  for (const row of (bookingsRes.data ?? []) as BookingRow[]) {
    bookingsById.set(row.id, row);
  }

  const lineCodesByFolioId = new Map<string, Set<string>>();
  for (const row of (linesRes.data ?? []) as FolioLineRow[]) {
    const folioId = asString(row.folio_id);
    if (!folioId) continue;
    const lineCode = asString(row.line_code);
    if (!lineCodesByFolioId.has(folioId)) lineCodesByFolioId.set(folioId, new Set<string>());
    if (lineCode) lineCodesByFolioId.get(folioId)?.add(lineCode);
  }

  const payoutByBookingId = new Map<string, string>();
  for (const row of (payoutsRes.data ?? []) as PayoutRow[]) {
    const bookingId = asString(row.booking_id);
    const payoutId = asString(row.id);
    if (bookingId && payoutId && !payoutByBookingId.has(bookingId)) {
      payoutByBookingId.set(bookingId, payoutId);
    }
  }

  const activeSettlementByFolioId = new Map<string, string>();
  for (const row of (activeRes.data ?? []) as ActiveSettlementLineRow[]) {
    const folioId = asString(row.folio_id);
    const settlementId = asString(row.settlement_id);
    if (folioId && settlementId) activeSettlementByFolioId.set(folioId, settlementId);
  }
  const activeCancellationHoldBookingIds = new Set<string>((holdsRes.data ?? []).map((row) => String(row.booking_id)));

  return {
    folios: filteredFolios,
    reservationsById,
    bookingsById,
    lineCodesByFolioId,
    payoutByBookingId,
    activeSettlementByFolioId,
    activeCancellationHoldBookingIds,
  };
}

export async function listSettlementCandidates(
  supabase: SupabaseClient,
  input: {
    hostId: string;
    propertyId?: string | null;
    periodStart: string;
    periodEnd: string;
    includeOta?: boolean;
  }
): Promise<SettlementCandidateListResult> {
  const propertyId = asString(input.propertyId);
  const periodStart = normalizeDate(input.periodStart);
  const periodEnd = normalizeDate(input.periodEnd);
  const includeOta = Boolean(input.includeOta) && isSettlementIncludeOtaEnabled();
  const requireCheckoutCompleted = isSettlementRequireCheckoutCompleted();

  const loaded = await loadSettlementCandidates(supabase, {
    hostId: input.hostId,
    propertyId,
    periodStart,
    periodEnd,
  });

  const eligibleFolios: SettlementCandidate[] = [];
  const excludedFolios: SettlementCandidate[] = [];
  let currency = "INR";

  for (const folio of loaded.folios) {
    const reservation = loaded.reservationsById.get(folio.reservation_id);
    if (!reservation) continue;
    const booking = asString(folio.booking_id) ? loaded.bookingsById.get(String(folio.booking_id)) : null;
    const sourceChannel =
      asString(folio.source_channel) ?? asString(reservation.source_channel) ?? asString(booking?.source_channel) ?? null;
    const lineCodes = loaded.lineCodesByFolioId.get(folio.id) ?? new Set<string>();
    const evaluation = evaluateSettlementEligibility({
      folioId: folio.id,
      bookingId: asString(folio.booking_id),
      reservationId: folio.reservation_id,
      sourceChannel,
      bookingStatus: asString(folio.booking_status) ?? asString(booking?.status) ?? asString(reservation.operational_status),
      paymentStatus: asString(folio.payment_status) ?? asString(booking?.payment_status),
      guestTotalAmount: asNumber(folio.guest_total_amount, 0),
      hostPayoutAmount: asNumber(folio.host_payout_amount, 0),
      refundTotalAmount: asNumber(folio.refund_total_amount, 0),
      folioMetadata: toObject(folio.metadata),
      reservationCheckOutDate: asString(reservation.check_out_date),
      requiredLineCodes: lineCodes,
      existingActiveSettlementId: loaded.activeSettlementByFolioId.get(folio.id) ?? null,
      activeCancellationHold: Boolean(folio.booking_id && loaded.activeCancellationHoldBookingIds.has(String(folio.booking_id))),
      otaIncluded: includeOta,
      requireCheckoutCompleted,
    });

    currency = normalizeCurrency(folio.currency);
    const candidate: SettlementCandidate = {
      folioId: folio.id,
      bookingId: asString(folio.booking_id),
      reservationId: folio.reservation_id,
      payoutId: asString(folio.booking_id) ? loaded.payoutByBookingId.get(String(folio.booking_id)) ?? null : null,
      sourceKind: evaluation.sourceKind,
      sourceChannel,
      paymentCollectMode: evaluation.paymentCollectMode,
      bookingStatus: asString(folio.booking_status) ?? asString(booking?.status) ?? asString(reservation.operational_status),
      paymentStatus: asString(folio.payment_status) ?? asString(booking?.payment_status),
      reservationCheckOutDate: asString(reservation.check_out_date),
      guestTotalAmount: asNumber(folio.guest_total_amount, 0),
      platformFeeAmount: asNumber(folio.platform_fee_amount, 0),
      platformFeeTaxAmount: 0,
      refundAdjustmentAmount: asNumber(folio.refund_total_amount, 0),
      hostPayoutAmount: asNumber(folio.host_payout_amount, 0),
      existingActiveSettlementId: loaded.activeSettlementByFolioId.get(folio.id) ?? null,
      ambiguityWarnings: evaluation.ambiguityWarnings,
      reasons: evaluation.reasons,
      eligible: evaluation.eligible,
      lineCodes: Array.from(lineCodes).sort(),
    };

    if (candidate.eligible) {
      eligibleFolios.push(candidate);
    } else {
      excludedFolios.push(candidate);
    }
  }

  return {
    hostId: input.hostId,
    propertyId,
    periodStart,
    periodEnd,
    currency,
    eligibleFolios,
    excludedFolios,
    totals: sumCandidateTotals(eligibleFolios),
    includeOta,
  };
}

async function loadExistingDraftForPeriod(
  supabase: SupabaseClient,
  input: { hostId: string; propertyId: string | null; periodStart: string; periodEnd: string }
): Promise<ExistingDraftRow | null> {
  let query = supabase
    .from("host_settlements_v2")
    .select("id,settlement_code,host_id,property_id,currency,period_start,period_end,status")
    .eq("host_id", input.hostId)
    .eq("status", "draft")
    .eq("period_start", input.periodStart)
    .eq("period_end", input.periodEnd);

  query = input.propertyId ? query.eq("property_id", input.propertyId) : query.is("property_id", null);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return (data as ExistingDraftRow | null) ?? null;
}

async function loadExistingDraftFolioIds(supabase: SupabaseClient, settlementId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("settlement_line_items_v2")
    .select("folio_id")
    .eq("settlement_id", settlementId)
    .eq("is_active", true);
  if (error) throw error;
  return ((data ?? []) as Array<{ folio_id?: string | null }>)
    .map((row) => asString(row.folio_id))
    .filter(Boolean) as string[];
}

export async function createDraftHostSettlement(
  supabase: SupabaseClient,
  input: CreateDraftHostSettlementInput
): Promise<CreateDraftHostSettlementResult> {
  const propertyId = asString(input.propertyId);
  const periodStart = normalizeDate(input.periodStart);
  const periodEnd = normalizeDate(input.periodEnd);
  const includeOta = Boolean(input.includeOta) && isSettlementIncludeOtaEnabled();
  const dryRun = Boolean(input.dryRun);

  const candidates = await listSettlementCandidates(supabase, {
    hostId: input.hostId,
    propertyId,
    periodStart,
    periodEnd,
    includeOta,
  });

  if (dryRun || !isFinanceSettlementEngineEnabled() || !isSettlementDraftGenerationEnabled()) {
    return {
      dryRun: true,
      settlementId: null,
      settlementCode: null,
      includedBookingCount: candidates.eligibleFolios.length,
      grossBookingValue: candidates.totals.grossBookingValue,
      platformFeeAmount: candidates.totals.platformFeeAmount,
      refundAdjustmentAmount: candidates.totals.refundAdjustmentAmount,
      netPayableAmount: candidates.totals.netPayableAmount,
      currency: candidates.currency,
      excludedCandidates: candidates.excludedFolios,
      includedCandidates: candidates.eligibleFolios,
      reusedExistingDraft: false,
    };
  }

  if (candidates.eligibleFolios.length === 0) {
    throw new Error("No settlement-eligible folios were found for the requested window.");
  }

  const existingDraft = await loadExistingDraftForPeriod(supabase, {
    hostId: input.hostId,
    propertyId,
    periodStart,
    periodEnd,
  });

  if (existingDraft?.id) {
    const existingFolioIds = await loadExistingDraftFolioIds(supabase, existingDraft.id);
    if (sameCandidateSet(candidates.eligibleFolios, existingFolioIds)) {
      return {
        dryRun: false,
        settlementId: existingDraft.id,
        settlementCode: existingDraft.settlement_code,
        includedBookingCount: candidates.eligibleFolios.length,
        grossBookingValue: candidates.totals.grossBookingValue,
        platformFeeAmount: candidates.totals.platformFeeAmount,
        refundAdjustmentAmount: candidates.totals.refundAdjustmentAmount,
        netPayableAmount: candidates.totals.netPayableAmount,
        currency: candidates.currency,
        excludedCandidates: candidates.excludedFolios,
        includedCandidates: candidates.eligibleFolios,
        reusedExistingDraft: true,
      };
    }

    throw new Error("A draft settlement already exists for this host/property/period with a different candidate set.");
  }

  const hostUserId = await loadHostUserId(supabase, input.hostId);
  const settlementCode = makeSettlementCode({
    hostId: input.hostId,
    propertyId,
    periodStart,
    periodEnd,
  });

  const { data: settlementRow, error: settlementError } = await supabase
    .from("host_settlements_v2")
    .insert({
      settlement_code: settlementCode,
      host_id: input.hostId,
      host_user_id: hostUserId,
      property_id: propertyId,
      currency: candidates.currency,
      status: "draft",
      period_start: periodStart,
      period_end: periodEnd,
      gross_booking_value: candidates.totals.grossBookingValue,
      platform_fee_amount: candidates.totals.platformFeeAmount,
      platform_fee_tax_amount: 0,
      refund_adjustment_amount: candidates.totals.refundAdjustmentAmount,
      withholding_amount: 0,
      net_payable_amount: candidates.totals.netPayableAmount,
      included_booking_count: candidates.eligibleFolios.length,
      metadata: {
        include_ota: includeOta,
        generated_from: "folio_proof_lines",
        excluded_candidate_count: candidates.excludedFolios.length,
      },
    } as never)
    .select("id,settlement_code")
    .single();

  if (settlementError) throw settlementError;

  const settlementId = String((settlementRow as { id: string }).id);
  const linePayload = candidates.eligibleFolios.map((candidate) => ({
    settlement_id: settlementId,
    booking_id: candidate.bookingId,
    reservation_id: candidate.reservationId,
    folio_id: candidate.folioId,
    payout_id: candidate.payoutId,
    line_type: "host_payout_pending",
    amount: candidate.hostPayoutAmount,
    currency: candidates.currency,
    reference_type: "folio",
    reference_id: candidate.folioId,
    is_active: true,
    metadata: {
      source_kind: candidate.sourceKind,
      source_channel: candidate.sourceChannel,
      payment_collect_mode: candidate.paymentCollectMode,
      refund_adjustment_amount: candidate.refundAdjustmentAmount,
      line_codes: candidate.lineCodes,
    },
  }));

  const { error: linesError } = await supabase.from("settlement_line_items_v2").insert(linePayload as never);
  if (linesError) throw linesError;

  await appendFinanceAuditLog(supabase, {
    actorUserId: input.actorUserId ?? null,
    actionType: "settlement_draft_created",
    resourceType: "host_settlement",
    resourceId: settlementId,
    afterValue: {
      settlement_code: settlementCode,
      host_id: input.hostId,
      property_id: propertyId,
      period_start: periodStart,
      period_end: periodEnd,
      included_folio_ids: candidates.eligibleFolios.map((candidate) => candidate.folioId),
    },
    reason: "host_settlement_draft_generation",
  });

  return {
    dryRun: false,
    settlementId,
    settlementCode: settlementCode,
    includedBookingCount: candidates.eligibleFolios.length,
    grossBookingValue: candidates.totals.grossBookingValue,
    platformFeeAmount: candidates.totals.platformFeeAmount,
    refundAdjustmentAmount: candidates.totals.refundAdjustmentAmount,
    netPayableAmount: candidates.totals.netPayableAmount,
    currency: candidates.currency,
    excludedCandidates: candidates.excludedFolios,
    includedCandidates: candidates.eligibleFolios,
    reusedExistingDraft: false,
  };
}

export async function getSettlementById(
  supabase: SupabaseClient,
  settlementId: string
): Promise<{
  settlement: JsonRecord | null;
  lineItems: JsonRecord[];
}> {
  const [{ data: settlement, error: settlementError }, { data: lineItems, error: lineItemsError }] = await Promise.all([
    supabase.from("host_settlements_v2").select("*").eq("id", settlementId).maybeSingle(),
    supabase
      .from("settlement_line_items_v2")
      .select("*")
      .eq("settlement_id", settlementId)
      .order("created_at", { ascending: true }),
  ]);

  if (settlementError) throw settlementError;
  if (lineItemsError) throw lineItemsError;

  return {
    settlement: (settlement as JsonRecord | null) ?? null,
    lineItems: ((lineItems ?? []) as JsonRecord[]),
  };
}

export async function approveSettlementDraft(
  supabase: SupabaseClient,
  input: { settlementId: string; actorUserId?: string | null }
): Promise<JsonRecord> {
  const { data: existing, error: existingError } = await supabase
    .from("host_settlements_v2")
    .select("*")
    .eq("id", input.settlementId)
    .maybeSingle();
  if (existingError) throw existingError;
  if (!existing) throw new Error("Settlement not found.");

  const status = asString((existing as JsonRecord).status);
  if (status !== "draft") {
    throw new Error("Only draft settlements can be approved.");
  }

  const approvedAt = new Date().toISOString();
  const { data, error } = await supabase
    .from("host_settlements_v2")
    .update({
      status: "approved",
      approved_by: input.actorUserId ?? null,
      approved_at: approvedAt,
      updated_at: approvedAt,
    } as never)
    .eq("id", input.settlementId)
    .select("*")
    .single();
  if (error) throw error;

  await appendFinanceAuditLog(supabase, {
    actorUserId: input.actorUserId ?? null,
    actionType: "settlement_draft_approved",
    resourceType: "host_settlement",
    resourceId: input.settlementId,
    beforeValue: existing as JsonRecord,
    afterValue: data as JsonRecord,
    reason: "manual_settlement_approval",
  });

  return (data as JsonRecord) ?? {};
}

export async function cancelSettlementDraft(
  supabase: SupabaseClient,
  input: { settlementId: string; actorUserId?: string | null }
): Promise<JsonRecord> {
  const { data: existing, error: existingError } = await supabase
    .from("host_settlements_v2")
    .select("*")
    .eq("id", input.settlementId)
    .maybeSingle();
  if (existingError) throw existingError;
  if (!existing) throw new Error("Settlement not found.");

  const status = asString((existing as JsonRecord).status);
  if (status !== "draft") {
    throw new Error("Only draft settlements can be cancelled in this batch.");
  }

  const cancelledAt = new Date().toISOString();
  const { data, error } = await supabase
    .from("host_settlements_v2")
    .update({
      status: "cancelled",
      cancelled_at: cancelledAt,
      updated_at: cancelledAt,
    } as never)
    .eq("id", input.settlementId)
    .select("*")
    .single();
  if (error) throw error;

  const { error: lineError } = await supabase
    .from("settlement_line_items_v2")
    .update({
      is_active: false,
    } as never)
    .eq("settlement_id", input.settlementId);
  if (lineError) throw lineError;

  await appendFinanceAuditLog(supabase, {
    actorUserId: input.actorUserId ?? null,
    actionType: "settlement_draft_cancelled",
    resourceType: "host_settlement",
    resourceId: input.settlementId,
    beforeValue: existing as JsonRecord,
    afterValue: data as JsonRecord,
    reason: "manual_settlement_cancellation",
  });

  return (data as JsonRecord) ?? {};
}
