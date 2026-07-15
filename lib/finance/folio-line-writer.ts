import type { SupabaseClient } from "@supabase/supabase-js";

import {
  isExternalOtaGuestIdentityMode,
  resolveOtaPaymentCollectMode,
  type OtaPaymentCollectMode,
} from "@/lib/channel-booking-normalization";
import {
  isFinanceDirectBookingFolioWritesEnabled,
  isFinanceEventDryRunEnabled,
  isFinanceEventPipelineEnabled,
  isFinanceFolioLinePostingEnabled,
  isOtaFinanceEngineEnabled,
  isOtaFolioLineWritesEnabled,
  isOtaPaymentCollectModeEnforcementEnabled,
  isOtaUnknownCollectModeSettlementBlockEnabled,
} from "@/lib/finance/feature-flags";
import {
  buildFolioLineIdempotencyKey,
  planFinanceEventContract,
  type FinanceEventContractInput,
  type FinanceEventType,
  type FinanceLineCode,
  type PlannedFolioLine,
} from "@/lib/finance/folio-event-pipeline";
import { ensureBookingFinancialSnapshot } from "@/lib/finance/runtime";
import { ensureReservationForBooking } from "@/lib/reservations";

type JsonRecord = Record<string, unknown>;

type BookingFinanceRow = {
  id: string;
  user_id?: string | null;
  host_id?: string | null;
  product_id?: string | null;
  source_channel?: string | null;
  status?: string | null;
  payment_status?: string | null;
  payment_id?: string | null;
  total_price?: number | null;
  partner_payout_amount?: number | null;
  pricing_snapshot?: JsonRecord | null;
};

type RefundAllocationRow = {
  allocation_type?: string | null;
  amount?: number | null;
};

type HeaderTotals = {
  refundTotalAmount: number;
  payoutAdjustmentAmount: number;
};

type WriteMode = "direct" | "ota";

type OtaSettlementDiagnostics = {
  isSettlementEligible: boolean;
  settlementBlockedReason: string | null;
  paymentCollectMode: OtaPaymentCollectMode;
  externalGuestMode: boolean;
};

type WritePolicy = {
  mode: WriteMode;
  sourceChannel: string;
  sourceKind: "direct" | "ota";
  dryRun: boolean;
  skippedReason: string | null;
  paymentCollectMode: OtaPaymentCollectMode;
  externalGuestMode: boolean;
  settlementBlockedReason: string | null;
  isSettlementEligible: boolean;
  warnings: string[];
};

export type FinanceEventWriteResult = {
  pipelineEnabled: boolean;
  dryRun: boolean;
  skippedReason: string | null;
  insertedLineCount: number;
  duplicateLineCount: number;
  folioId: string | null;
  lineCodes: string[];
  warnings: string[];
  paymentCollectMode: OtaPaymentCollectMode | null;
  sourceChannel: string | null;
  isSettlementEligible: boolean;
};

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function asObject(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;
}

export function isDirectSourceChannel(value: string | null | undefined): boolean {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "" || normalized === "direct" || normalized === "famlo_direct" || normalized === "famlo";
}

function lineTypeForCode(lineCode: FinanceLineCode): string {
  switch (lineCode) {
    case "ROOM_CHARGE":
      return "room_charge";
    case "GUEST_PAYMENT":
      return "payment";
    case "PLATFORM_FEE":
    case "CANCELLATION_FEE":
      return "fee";
    case "REFUND":
      return "refund";
    case "HOST_PAYOUT_PENDING":
    case "ADJUSTMENT":
    case "REVERSAL":
      return "adjustment";
    default:
      return "adjustment";
  }
}

function referenceTypeForLine(input: { lineCode: FinanceLineCode; eventType: FinanceEventType }): string {
  switch (input.lineCode) {
    case "ROOM_CHARGE":
      return "booking_total";
    case "GUEST_PAYMENT":
      return "payment_capture";
    case "PLATFORM_FEE":
      return "platform_fee";
    case "REFUND":
      return "refund";
    case "HOST_PAYOUT_PENDING":
      return "host_payout_pending";
    case "ADJUSTMENT":
      return input.eventType === "REFUND_CREATED" ? "refund_payout_adjustment" : "adjustment";
    case "REVERSAL":
      return "reversal";
    case "CANCELLATION_FEE":
      return "cancellation_fee";
    default:
      return "finance_event";
  }
}

function descriptionForLine(lineCode: FinanceLineCode, mode: WriteMode): string {
  const prefix = mode === "ota" ? "OTA" : "Direct booking";
  switch (lineCode) {
    case "ROOM_CHARGE":
      return `${prefix} room charge`;
    case "PLATFORM_FEE":
      return `${prefix} platform fee`;
    case "HOST_PAYOUT_PENDING":
      return `${prefix} pending host payout`;
    case "GUEST_PAYMENT":
      return `${prefix} guest payment`;
    case "REFUND":
      return `${prefix} refund`;
    case "ADJUSTMENT":
      return `${prefix} adjustment`;
    case "REVERSAL":
      return `${prefix} reversal`;
    case "CANCELLATION_FEE":
      return `${prefix} cancellation fee`;
    default:
      return `${prefix} finance proof line`;
  }
}

function resolvePricingSnapshot(booking: BookingFinanceRow): JsonRecord {
  return asObject(booking.pricing_snapshot) ?? {};
}

function resolveCurrency(booking: BookingFinanceRow): string {
  return asString(resolvePricingSnapshot(booking).currency) ?? "INR";
}

function resolvePlatformFeeAmount(booking: BookingFinanceRow, mode: WriteMode): number {
  const pricingSnapshot = resolvePricingSnapshot(booking);
  const snapshotFee = Math.max(0, asNumber(pricingSnapshot.platform_fee, 0));
  if (snapshotFee > 0) return snapshotFee;

  if (mode === "ota") {
    return Math.max(0, Math.round((Math.max(0, asNumber(booking.total_price, 0)) * 1600) / 10000));
  }

  return snapshotFee;
}

function resolveHostPayoutAmount(booking: BookingFinanceRow, mode: WriteMode): number {
  const stored = Math.max(0, asNumber(booking.partner_payout_amount, 0));
  if (stored > 0) return stored;

  if (mode === "ota") {
    const total = Math.max(0, asNumber(booking.total_price, 0));
    const platformFeeAmount = resolvePlatformFeeAmount(booking, mode);
    return Math.max(0, total - platformFeeAmount);
  }

  return stored;
}

function resolvePaymentCollectModeForBooking(
  booking: BookingFinanceRow,
  input: FinanceEventContractInput
): OtaPaymentCollectMode {
  const pricingSnapshot = resolvePricingSnapshot(booking);
  return resolveOtaPaymentCollectMode(
    asString(pricingSnapshot.payment_collect_mode) ??
      asString(pricingSnapshot.payment_collect) ??
      asString(input.paymentCollectMode)
  );
}

function resolveExternalGuestMode(booking: BookingFinanceRow): boolean {
  return isExternalOtaGuestIdentityMode(resolvePricingSnapshot(booking).channel_user_id_mode);
}

export function resolveOtaSettlementDiagnostics(booking: BookingFinanceRow): OtaSettlementDiagnostics {
  const paymentCollectMode = resolvePaymentCollectModeForBooking(booking, {
    bookingId: booking.id,
    eventType: "OTA_BOOKING_IMPORTED",
    sourceEventId: booking.id,
    calculationVersion: "v1",
  });
  const externalGuestMode = resolveExternalGuestMode(booking);

  if (isOtaUnknownCollectModeSettlementBlockEnabled() && paymentCollectMode === "UNKNOWN") {
    return {
      isSettlementEligible: false,
      settlementBlockedReason: "unknown_payment_collect_mode",
      paymentCollectMode,
      externalGuestMode,
    };
  }

  return {
    isSettlementEligible: false,
    settlementBlockedReason: "settlement_engine_not_enabled",
    paymentCollectMode,
    externalGuestMode,
  };
}

function resolveWritePolicy(booking: BookingFinanceRow, input: FinanceEventContractInput): WritePolicy {
  const sourceChannel = asString(booking.source_channel) ?? asString(input.sourceChannel) ?? "famlo_direct";
  const mode: WriteMode = isDirectSourceChannel(sourceChannel) ? "direct" : "ota";
  const paymentCollectMode = resolvePaymentCollectModeForBooking(booking, input);
  const externalGuestMode = resolveExternalGuestMode(booking);
  const warnings: string[] = [];
  const pipelineEnabled = isFinanceEventPipelineEnabled();

  if (!pipelineEnabled) {
    return {
      mode,
      sourceChannel,
      sourceKind: mode,
      dryRun: true,
      skippedReason: "pipeline_disabled",
      paymentCollectMode,
      externalGuestMode,
      settlementBlockedReason: mode === "ota" ? resolveOtaSettlementDiagnostics(booking).settlementBlockedReason : null,
      isSettlementEligible: false,
      warnings,
    };
  }

  if (mode === "ota") {
    const otaSettlement = resolveOtaSettlementDiagnostics(booking);
    if (!isOtaFinanceEngineEnabled()) {
      warnings.push("ota_finance_engine_disabled");
      return {
        mode,
        sourceChannel,
        sourceKind: "ota",
        dryRun: true,
        skippedReason: "ota_engine_disabled",
        paymentCollectMode,
        externalGuestMode,
        settlementBlockedReason: otaSettlement.settlementBlockedReason,
        isSettlementEligible: otaSettlement.isSettlementEligible,
        warnings,
      };
    }

    if (isOtaPaymentCollectModeEnforcementEnabled() && paymentCollectMode === "UNKNOWN") {
      warnings.push("ota_unknown_payment_collect_mode");
      return {
        mode,
        sourceChannel,
        sourceKind: "ota",
        dryRun: true,
        skippedReason: "ota_unknown_collect_mode",
        paymentCollectMode,
        externalGuestMode,
        settlementBlockedReason: otaSettlement.settlementBlockedReason,
        isSettlementEligible: otaSettlement.isSettlementEligible,
        warnings,
      };
    }

    if (isFinanceEventDryRunEnabled()) {
      return {
        mode,
        sourceChannel,
        sourceKind: "ota",
        dryRun: true,
        skippedReason: "dry_run_enabled",
        paymentCollectMode,
        externalGuestMode,
        settlementBlockedReason: otaSettlement.settlementBlockedReason,
        isSettlementEligible: otaSettlement.isSettlementEligible,
        warnings,
      };
    }

    if (!isFinanceFolioLinePostingEnabled() || !isOtaFolioLineWritesEnabled()) {
      return {
        mode,
        sourceChannel,
        sourceKind: "ota",
        dryRun: false,
        skippedReason: "ota_folio_writes_disabled",
        paymentCollectMode,
        externalGuestMode,
        settlementBlockedReason: otaSettlement.settlementBlockedReason,
        isSettlementEligible: otaSettlement.isSettlementEligible,
        warnings,
      };
    }

    return {
      mode,
      sourceChannel,
      sourceKind: "ota",
      dryRun: false,
      skippedReason: null,
      paymentCollectMode,
      externalGuestMode,
      settlementBlockedReason: otaSettlement.settlementBlockedReason,
      isSettlementEligible: otaSettlement.isSettlementEligible,
      warnings,
    };
  }

  if (isFinanceEventDryRunEnabled()) {
    return {
      mode,
      sourceChannel,
      sourceKind: "direct",
      dryRun: true,
      skippedReason: "dry_run_enabled",
      paymentCollectMode,
      externalGuestMode,
      settlementBlockedReason: null,
      isSettlementEligible: false,
      warnings,
    };
  }

  if (!isFinanceFolioLinePostingEnabled() || !isFinanceDirectBookingFolioWritesEnabled()) {
    return {
      mode,
      sourceChannel,
      sourceKind: "direct",
      dryRun: false,
      skippedReason: "folio_writes_disabled",
      paymentCollectMode,
      externalGuestMode,
      settlementBlockedReason: null,
      isSettlementEligible: false,
      warnings,
    };
  }

  return {
    mode,
    sourceChannel,
    sourceKind: "direct",
    dryRun: false,
    skippedReason: null,
    paymentCollectMode,
    externalGuestMode,
    settlementBlockedReason: null,
    isSettlementEligible: false,
    warnings,
  };
}

function isGuesPaymentAllowedForOta(input: {
  paymentCollectMode: OtaPaymentCollectMode;
  paymentReferenceId?: string | null;
  guestPaidAmount?: number | null;
}): boolean {
  return (
    input.paymentCollectMode === "FAMLO_COLLECT" &&
    Boolean(asString(input.paymentReferenceId)) &&
    Math.max(0, asNumber(input.guestPaidAmount, 0)) > 0
  );
}

async function loadBookingFinanceRow(
  supabase: SupabaseClient,
  bookingId: string
): Promise<BookingFinanceRow | null> {
  const { data, error } = await supabase
    .from("bookings_v2")
    .select("id,user_id,host_id,product_id,source_channel,status,payment_status,payment_id,total_price,partner_payout_amount,pricing_snapshot")
    .eq("id", bookingId)
    .maybeSingle();

  if (error) throw error;
  return (data as BookingFinanceRow | null) ?? null;
}

async function loadHeaderTotals(
  supabase: SupabaseClient,
  sourceEventId: string
): Promise<HeaderTotals> {
  const { data, error } = await supabase
    .from("refund_allocations_v2")
    .select("allocation_type,amount")
    .eq("refund_id", sourceEventId);

  if (error) throw error;

  const rows = (Array.isArray(data) ? data : []) as RefundAllocationRow[];
  let refundTotalAmount = 0;
  let payoutAdjustmentAmount = 0;

  for (const row of rows) {
    const allocationType = String(row.allocation_type ?? "").trim().toLowerCase();
    const amount = Math.max(0, asNumber(row.amount, 0));
    if (allocationType === "guest_principal") {
      payoutAdjustmentAmount += amount;
      refundTotalAmount += amount;
    } else if (allocationType === "platform_fee_reversal" || allocationType === "platform_tax_reversal") {
      refundTotalAmount += amount;
    }
  }

  return { refundTotalAmount, payoutAdjustmentAmount };
}

async function ensureFinanceSnapshotForBooking(
  supabase: SupabaseClient,
  booking: BookingFinanceRow,
  mode: WriteMode
): Promise<string | null> {
  const pricingSnapshot = resolvePricingSnapshot(booking);
  const enrichedSnapshot: JsonRecord = {
    ...pricingSnapshot,
    platform_fee: resolvePlatformFeeAmount(booking, mode),
    partner_payout_amount: resolveHostPayoutAmount(booking, mode),
  };

  return ensureBookingFinancialSnapshot(supabase, {
    bookingId: booking.id,
    paymentId: asString(booking.payment_id),
    currency: resolveCurrency(booking),
    bookingType: "host_stay",
    pricingSnapshot: enrichedSnapshot,
    totalPrice: asNumber(booking.total_price, 0),
    partnerPayoutAmount: resolveHostPayoutAmount(booking, mode),
  });
}

async function insertOrReuseRoomChargeLine(
  supabase: SupabaseClient,
  input: {
    folioId: string;
    reservationId: string;
    booking: BookingFinanceRow;
    idempotencyKey: string;
    calculationSnapshotId: string | null;
    sourceEventType: FinanceEventType;
    sourceEventId: string;
    amount: number;
    currency: string;
    mode: WriteMode;
  }
): Promise<"inserted" | "duplicate"> {
  const { data: existing, error } = await supabase
    .from("folio_line_items_v2")
    .select("id,metadata,idempotency_key")
    .eq("folio_id", input.folioId)
    .eq("line_type", "room_charge")
    .eq("reference_type", "booking_total")
    .eq("reference_id", input.booking.id)
    .maybeSingle();

  if (error) throw error;

  const nextMetadata = {
    finance_line_code: "ROOM_CHARGE",
    finance_source: input.mode === "ota" ? "ota_folio_writer" : "direct_booking_folio_writer",
  };

  if (existing?.id) {
    const existingKey = asString((existing as JsonRecord).idempotency_key);
    if (existingKey === input.idempotencyKey) return "duplicate";

    const { error: updateError } = await supabase
      .from("folio_line_items_v2")
      .update({
        booking_id: input.booking.id,
        amount: input.amount,
        currency: input.currency,
        line_code: "ROOM_CHARGE",
        line_subtype: input.sourceEventType,
        quantity: 1,
        unit_amount: input.amount,
        source_event_type: input.sourceEventType,
        source_event_id: input.sourceEventId,
        source_system: "famlo",
        idempotency_key: input.idempotencyKey,
        calculation_snapshot_id: input.calculationSnapshotId,
        tax_mode: "PENDING_COMPLIANCE",
        sort_order: 10,
        description: descriptionForLine("ROOM_CHARGE", input.mode),
        metadata: {
          ...(((existing as JsonRecord).metadata as JsonRecord | null) ?? {}),
          ...nextMetadata,
        },
      } as never)
      .eq("id", existing.id);

    if (updateError) throw updateError;
    return "inserted";
  }

  const { error: insertError } = await supabase.from("folio_line_items_v2").insert({
    folio_id: input.folioId,
    reservation_id: input.reservationId,
    booking_id: input.booking.id,
    line_type: "room_charge",
    direction: "debit",
    amount: input.amount,
    currency: input.currency,
    reference_type: "booking_total",
    reference_id: input.booking.id,
    description: descriptionForLine("ROOM_CHARGE", input.mode),
    line_code: "ROOM_CHARGE",
    line_subtype: input.sourceEventType,
    quantity: 1,
    unit_amount: input.amount,
    source_event_type: input.sourceEventType,
    source_event_id: input.sourceEventId,
    source_system: "famlo",
    idempotency_key: input.idempotencyKey,
    calculation_snapshot_id: input.calculationSnapshotId,
    tax_mode: "PENDING_COMPLIANCE",
    sort_order: 10,
    metadata: nextMetadata,
  } as never);

  if (insertError) {
    const code = String((insertError as { code?: string }).code ?? "");
    if (code === "23505") return "duplicate";
    throw insertError;
  }

  return "inserted";
}

async function insertFolioLine(
  supabase: SupabaseClient,
  input: {
    folioId: string;
    reservationId: string;
    booking: BookingFinanceRow;
    lineCode: FinanceLineCode;
    amount: number;
    currency: string;
    direction: "debit" | "credit";
    idempotencyKey: string;
    calculationSnapshotId: string | null;
    sourceEventType: FinanceEventType;
    sourceEventId: string;
    sortOrder: number;
    mode: WriteMode;
  }
): Promise<"inserted" | "duplicate"> {
  const { error } = await supabase.from("folio_line_items_v2").insert({
    folio_id: input.folioId,
    reservation_id: input.reservationId,
    booking_id: input.booking.id,
    line_type: lineTypeForCode(input.lineCode),
    direction: input.direction,
    amount: Math.max(0, Math.round(input.amount)),
    currency: input.currency,
    reference_type: referenceTypeForLine({ lineCode: input.lineCode, eventType: input.sourceEventType }),
    reference_id: input.sourceEventId,
    description: descriptionForLine(input.lineCode, input.mode),
    line_code: input.lineCode,
    line_subtype: input.sourceEventType,
    quantity: 1,
    unit_amount: Math.max(0, Math.round(input.amount)),
    source_event_type: input.sourceEventType,
    source_event_id: input.sourceEventId,
    source_system: "famlo",
    idempotency_key: input.idempotencyKey,
    calculation_snapshot_id: input.calculationSnapshotId,
    tax_mode: "PENDING_COMPLIANCE",
    sort_order: input.sortOrder,
    metadata: {
      finance_line_code: input.lineCode,
      finance_source: input.mode === "ota" ? "ota_folio_writer" : "direct_booking_folio_writer",
    },
  } as never);

  if (error) {
    const code = String((error as { code?: string }).code ?? "");
    if (code === "23505") return "duplicate";
    throw error;
  }

  return "inserted";
}

async function updateFolioHeaderReadModel(
  supabase: SupabaseClient,
  input: {
    folioId: string;
    booking: BookingFinanceRow;
    calculationSnapshotId: string | null;
    insertedLineCount: number;
    headerTotals: HeaderTotals;
    policy: WritePolicy;
    warnings: string[];
    lastWriteResult: Pick<FinanceEventWriteResult, "dryRun" | "skippedReason" | "insertedLineCount" | "duplicateLineCount" | "lineCodes">;
  }
): Promise<void> {
  const { data: existing, error: existingError } = await supabase
    .from("reservation_folios_v2")
    .select("version,metadata")
    .eq("id", input.folioId)
    .maybeSingle();

  if (existingError) throw existingError;

  const version = Math.max(1, asNumber(existing?.version, 1) + (input.insertedLineCount > 0 ? 1 : 0));
  const platformFeeAmount = resolvePlatformFeeAmount(input.booking, input.policy.mode);
  const hostPayoutBase = resolveHostPayoutAmount(input.booking, input.policy.mode);
  const hostPayoutAmount = Math.max(0, hostPayoutBase - input.headerTotals.payoutAdjustmentAmount);
  const pricingSnapshot = resolvePricingSnapshot(input.booking);
  const existingMetadata = asObject(existing?.metadata) ?? {};

  const metadata: JsonRecord = {
    ...existingMetadata,
    finance_guest_identity_mode: input.policy.externalGuestMode ? "external_ota_guest" : "platform_user",
    payment_collect_mode: input.policy.paymentCollectMode,
    is_settlement_eligible: input.policy.isSettlementEligible,
    settlement_blocked_reason: input.policy.settlementBlockedReason,
    ambiguity_warnings: input.warnings,
    last_finance_write_result: input.lastWriteResult,
    ota_channel_source_event_id:
      asString(pricingSnapshot.channel_external_revision_id) ?? asString(pricingSnapshot.channel_booking_revision_id),
  };

  const { error } = await supabase
    .from("reservation_folios_v2")
    .update({
      booking_id: input.booking.id,
      property_id: asString(input.booking.product_id),
      host_id: asString(input.booking.host_id),
      guest_user_id: input.policy.externalGuestMode ? null : asString(input.booking.user_id),
      source_channel: asString(input.booking.source_channel) ?? (input.policy.mode === "ota" ? "UNKNOWN_OTA" : "famlo_direct"),
      booking_status: asString(input.booking.status),
      payment_status: asString(input.booking.payment_status),
      guest_total_amount: Math.max(0, asNumber(input.booking.total_price, 0)),
      platform_fee_amount: platformFeeAmount,
      platform_fee_tax_amount: 0,
      host_payout_amount: hostPayoutAmount,
      refund_total_amount: Math.max(0, input.headerTotals.refundTotalAmount),
      calculation_snapshot_id: input.calculationSnapshotId,
      tax_mode: "PENDING_COMPLIANCE",
      gst_collection_enabled: false,
      tcs_enabled: false,
      tds_enabled: false,
      version,
      metadata,
      updated_at: new Date().toISOString(),
    } as never)
    .eq("id", input.folioId);

  if (error) throw error;
}

function buildOtaGuestPaymentLine(input: {
  contractInput: FinanceEventContractInput;
  paymentReferenceId: string;
}): PlannedFolioLine | null {
  const amount = Math.max(0, asNumber(input.contractInput.guestPaidAmount, 0));
  if (amount <= 0) return null;

  return {
    lineCode: "GUEST_PAYMENT",
    direction: "credit",
    amount,
    currency: asString(input.contractInput.currency) ?? "INR",
    description: "Planned OTA guest payment line",
    sourceEventId: input.paymentReferenceId,
    idempotencyKey: buildFolioLineIdempotencyKey({
      bookingId: input.contractInput.bookingId,
      eventType: "PAYMENT_CAPTURED",
      sourceEventId: input.paymentReferenceId,
      lineCode: "GUEST_PAYMENT",
      calculationVersion: input.contractInput.calculationVersion,
    }),
  };
}

function maybeAugmentPlannedLinesForOta(
  input: FinanceEventContractInput,
  booking: BookingFinanceRow,
  policy: WritePolicy,
  plannedLines: PlannedFolioLine[]
): { plannedLines: PlannedFolioLine[]; warnings: string[] } {
  const warnings = [...policy.warnings];
  let next = [...plannedLines];

  if (policy.mode === "ota") {
    if (input.eventType === "PAYMENT_CAPTURED") {
      if (!isGuesPaymentAllowedForOta({
        paymentCollectMode: policy.paymentCollectMode,
        paymentReferenceId: input.paymentReferenceId ?? input.sourceEventId,
        guestPaidAmount: input.guestPaidAmount,
      })) {
        next = next.filter((line) => line.lineCode !== "GUEST_PAYMENT");
        warnings.push("ota_payment_capture_ignored_without_famlo_collect_reference");
      }
    }

    if (input.eventType === "OTA_BOOKING_IMPORTED" && !isGuesPaymentAllowedForOta({
      paymentCollectMode: policy.paymentCollectMode,
      paymentReferenceId: input.paymentReferenceId,
      guestPaidAmount: input.guestPaidAmount,
    })) {
      warnings.push("ota_guest_payment_not_written");
    }

    if (input.eventType === "OTA_BOOKING_IMPORTED" && isGuesPaymentAllowedForOta({
      paymentCollectMode: policy.paymentCollectMode,
      paymentReferenceId: input.paymentReferenceId,
      guestPaidAmount: input.guestPaidAmount,
    })) {
      const paymentLine = buildOtaGuestPaymentLine({
        contractInput: input,
        paymentReferenceId: asString(input.paymentReferenceId) ?? "",
      });
      if (paymentLine) next.push(paymentLine);
    }

    if ((input.eventType === "OTA_BOOKING_CANCELLED" || input.eventType === "REFUND_CREATED") && policy.paymentCollectMode !== "FAMLO_COLLECT") {
      const hadRefundLine = next.some((line) => line.lineCode === "REFUND");
      next = next.filter((line) => line.lineCode !== "REFUND");
      if (hadRefundLine) {
        warnings.push("ota_refund_line_blocked_without_famlo_collect");
      }
    }

    if (input.eventType === "OTA_BOOKING_MODIFIED" && next.length === 0) {
      warnings.push("ota_modification_delta_ambiguous");
    }

    if (input.eventType === "OTA_BOOKING_CANCELLED" && next.length === 0) {
      warnings.push("ota_cancellation_economics_ambiguous");
    }
  }

  if (policy.mode === "direct" && !isDirectSourceChannel(asString(booking.source_channel))) {
    warnings.push("direct_regression_source_mismatch");
  }

  return { plannedLines: next, warnings };
}

export async function processFinanceEventContract(
  supabase: SupabaseClient,
  input: FinanceEventContractInput
): Promise<FinanceEventWriteResult> {
  const plan = planFinanceEventContract(input);
  const booking = await loadBookingFinanceRow(supabase, input.bookingId);
  const baseLineCodes = plan.plannedLines.map((line) => line.lineCode);

  if (!booking?.id) {
    return {
      pipelineEnabled: isFinanceEventPipelineEnabled(),
      dryRun: true,
      skippedReason: "booking_not_found",
      insertedLineCount: 0,
      duplicateLineCount: 0,
      folioId: null,
      lineCodes: baseLineCodes,
      warnings: [],
      paymentCollectMode: null,
      sourceChannel: null,
      isSettlementEligible: false,
    };
  }

  const policy = resolveWritePolicy(booking, input);
  const reservationState = await ensureReservationForBooking(supabase, {
    bookingId: input.bookingId,
    source: "finance_folio_writer",
    sourceKind: policy.sourceKind,
  });
  const reservationId = asString(reservationState.reservationId);
  const folioId = asString(reservationState.folioId);

  const { plannedLines, warnings } = maybeAugmentPlannedLinesForOta(input, booking, policy, [...plan.plannedLines]);
  const lineCodes = plannedLines.map((line) => line.lineCode);

  if (!reservationId || !folioId) {
    return {
      pipelineEnabled: isFinanceEventPipelineEnabled(),
      dryRun: true,
      skippedReason: "folio_unavailable",
      insertedLineCount: 0,
      duplicateLineCount: 0,
      folioId: null,
      lineCodes,
      warnings,
      paymentCollectMode: policy.paymentCollectMode,
      sourceChannel: policy.sourceChannel,
      isSettlementEligible: policy.isSettlementEligible,
    };
  }

  if (policy.skippedReason) {
    await updateFolioHeaderReadModel(supabase, {
      folioId,
      booking,
      calculationSnapshotId: null,
      insertedLineCount: 0,
      headerTotals: { refundTotalAmount: 0, payoutAdjustmentAmount: 0 },
      policy,
      warnings,
      lastWriteResult: {
        dryRun: policy.dryRun,
        skippedReason: policy.skippedReason,
        insertedLineCount: 0,
        duplicateLineCount: 0,
        lineCodes,
      },
    });

    console.info("[finance.event.skipped]", {
      bookingId: input.bookingId,
      eventType: input.eventType,
      sourceChannel: policy.sourceChannel,
      skippedReason: policy.skippedReason,
      warnings,
    });

    return {
      pipelineEnabled: isFinanceEventPipelineEnabled(),
      dryRun: policy.dryRun,
      skippedReason: policy.skippedReason,
      insertedLineCount: 0,
      duplicateLineCount: 0,
      folioId,
      lineCodes,
      warnings,
      paymentCollectMode: policy.paymentCollectMode,
      sourceChannel: policy.sourceChannel,
      isSettlementEligible: policy.isSettlementEligible,
    };
  }

  const calculationSnapshotId = await ensureFinanceSnapshotForBooking(supabase, booking, policy.mode);
  const currency = resolveCurrency(booking);
  let headerTotals: HeaderTotals = { refundTotalAmount: 0, payoutAdjustmentAmount: 0 };

  if (input.eventType === "REFUND_CREATED") {
    headerTotals = await loadHeaderTotals(supabase, input.sourceEventId);
    if (headerTotals.payoutAdjustmentAmount > 0) {
      plannedLines.push({
        lineCode: "ADJUSTMENT",
        direction: "debit",
        amount: headerTotals.payoutAdjustmentAmount,
        currency,
        description: descriptionForLine("ADJUSTMENT", policy.mode),
        sourceEventId: input.sourceEventId,
        idempotencyKey: buildFolioLineIdempotencyKey({
          bookingId: input.bookingId,
          eventType: input.eventType,
          sourceEventId: input.sourceEventId,
          lineCode: "ADJUSTMENT",
          calculationVersion: input.calculationVersion,
        }),
      });
    } else {
      warnings.push("refund_guest_principal_allocation_missing_or_zero");
    }
  }

  let insertedLineCount = 0;
  let duplicateLineCount = 0;

  for (const [index, line] of plannedLines.entries()) {
    if (line.lineCode === "ROOM_CHARGE") {
      const status = await insertOrReuseRoomChargeLine(supabase, {
        folioId,
        reservationId,
        booking,
        idempotencyKey: line.idempotencyKey,
        calculationSnapshotId,
        sourceEventType: input.eventType,
        sourceEventId: line.sourceEventId,
        amount: line.amount,
        currency: line.currency,
        mode: policy.mode,
      });
      if (status === "inserted") insertedLineCount += 1;
      if (status === "duplicate") duplicateLineCount += 1;
      continue;
    }

    const status = await insertFolioLine(supabase, {
      folioId,
      reservationId,
      booking,
      lineCode: line.lineCode,
      amount: line.amount,
      currency: line.currency,
      direction: line.direction,
      idempotencyKey: line.idempotencyKey,
      calculationSnapshotId,
      sourceEventType: input.eventType,
      sourceEventId: line.sourceEventId,
      sortOrder: 20 + index,
      mode: policy.mode,
    });
    if (status === "inserted") insertedLineCount += 1;
    if (status === "duplicate") duplicateLineCount += 1;
  }

  await updateFolioHeaderReadModel(supabase, {
    folioId,
    booking,
    calculationSnapshotId,
    insertedLineCount,
    headerTotals,
    policy,
    warnings,
    lastWriteResult: {
      dryRun: false,
      skippedReason: null,
      insertedLineCount,
      duplicateLineCount,
      lineCodes: plannedLines.map((line) => line.lineCode),
    },
  });

  return {
    pipelineEnabled: true,
    dryRun: false,
    skippedReason: null,
    insertedLineCount,
    duplicateLineCount,
    folioId,
    lineCodes: plannedLines.map((line) => line.lineCode),
    warnings,
    paymentCollectMode: policy.paymentCollectMode,
    sourceChannel: policy.sourceChannel,
    isSettlementEligible: policy.isSettlementEligible,
  };
}
