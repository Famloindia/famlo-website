import type { SupabaseClient } from "@supabase/supabase-js";

import { assertBookingSlotStillAvailableForPayment } from "@/lib/booking-compat";
import { syncBookingCalendarIndexBestEffort } from "@/lib/booking-calendar-index";
import { enqueueBookingInventoryAriSyncJobs } from "@/lib/channex-ari-jobs";
import { createCalendarConflict } from "@/lib/calendar";
import { processFinanceEventContract } from "@/lib/finance/folio-line-writer";
import { appendLedgerEntryIfMissing, ensureScheduledPayout } from "@/lib/finance/runtime";
import { parseHostListingMeta } from "@/lib/host-listing-meta";
import { appendInventoryEvent, projectInventoryRange, type InventoryEventType } from "@/lib/inventory";
import { enumerateStayNights, getStayNightDateRange } from "@/lib/platform-utils";
import { syncReservationFromBooking } from "@/lib/reservations";

type JsonRecord = Record<string, unknown>;

type FinalizablePaymentRecord = {
  id: string;
  booking_id: string;
  status?: string | null;
  amount_total?: number | string | null;
  tax_amount?: number | string | null;
  currency?: string | null;
  gateway_order_id?: string | null;
  gateway_payment_id?: string | null;
  raw_response?: JsonRecord | null;
};

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function asNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export function resolveBookingInventoryImpactRange(input: {
  startDate?: string | null;
  endDate?: string | null;
}): { from: string; to: string; nights: string[] } | null {
  const startDate = asString(input.startDate);
  const endDate = asString(input.endDate) ?? startDate;
  if (!startDate || !endDate) return null;
  return getStayNightDateRange(startDate, endDate);
}

export type CapturedPaymentFinalizationDecision =
  | "finalize_now"
  | "skip_already_finalized"
  | "ignore_not_captured"
  | "reject_invalid_ids"
  | "reject_amount_mismatch";

export function isCapturedProviderPaymentStatus(status: string | null | undefined): boolean {
  const normalized = String(status ?? "").trim().toLowerCase();
  return normalized === "captured" || normalized === "paid";
}

export function doesGatewayAmountMatchInternalAmount(
  expectedAmountRupees: number,
  providerAmountPaise: number | null | undefined
): boolean {
  if (typeof providerAmountPaise !== "number" || !Number.isFinite(providerAmountPaise)) {
    return false;
  }
  return Math.max(0, Math.round(providerAmountPaise / 100)) === Math.max(0, Math.round(expectedAmountRupees));
}

export function resolveCapturedPaymentFinalizationDecision(input: {
  paymentStatus: string | null | undefined;
  bookingPaymentStatus: string | null | undefined;
  bookingStatus: string | null | undefined;
  providerPaymentStatus: string | null | undefined;
  gatewayOrderId: string | null | undefined;
  gatewayPaymentId: string | null | undefined;
  expectedAmountRupees: number;
  providerAmountPaise: number | null | undefined;
}): CapturedPaymentFinalizationDecision {
  if (!asString(input.gatewayOrderId) || !asString(input.gatewayPaymentId)) {
    return "reject_invalid_ids";
  }

  if (!isCapturedProviderPaymentStatus(input.providerPaymentStatus)) {
    return "ignore_not_captured";
  }

  if (!doesGatewayAmountMatchInternalAmount(input.expectedAmountRupees, input.providerAmountPaise)) {
    return "reject_amount_mismatch";
  }

  const normalizedPaymentStatus = String(input.paymentStatus ?? "").trim().toLowerCase();
  const normalizedBookingPaymentStatus = String(input.bookingPaymentStatus ?? "").trim().toLowerCase();
  const normalizedBookingStatus = String(input.bookingStatus ?? "").trim().toLowerCase();

  if (
    (normalizedPaymentStatus === "paid" ||
      normalizedPaymentStatus === "refunded" ||
      normalizedPaymentStatus === "partially_refunded") &&
    (normalizedBookingPaymentStatus === "paid" ||
      normalizedBookingPaymentStatus === "refund_pending" ||
      normalizedBookingPaymentStatus === "refunded" ||
      normalizedBookingPaymentStatus === "partially_refunded") &&
    (normalizedBookingStatus === "confirmed" ||
      normalizedBookingStatus === "pending_host_approval" ||
      normalizedBookingStatus === "checked_in" ||
      normalizedBookingStatus === "completed")
  ) {
    return "skip_already_finalized";
  }

  return "finalize_now";
}

type PaymentConflictBooking = {
  id?: string | null;
  legacy_booking_id?: string | null;
  host_id?: string | null;
  stay_unit_id?: string | null;
  pricing_snapshot?: Record<string, unknown> | null;
  start_date?: string | null;
  end_date?: string | null;
  quarter_type?: string | null;
  status?: string | null;
  payment_status?: string | null;
  payment_id?: string | null;
  created_at?: string | null;
};

function isMissingColumnError(error: unknown, columnName: string): boolean {
  if (!error || typeof error !== "object") return false;
  const record = error as { code?: unknown; message?: unknown };
  const code = typeof record.code === "string" ? record.code : "";
  const message = typeof record.message === "string" ? record.message : "";
  return (
    (code === "42703" && message.includes(columnName)) ||
    (message.includes(columnName) && (message.includes("schema cache") || message.includes("does not exist"))) ||
    (columnName === "stay_unit_id" && message === "")
  );
}

function isSchemaCompatibilityError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("column") ||
    lower.includes("schema cache") ||
    lower.includes("does not exist") ||
    lower.includes("relation")
  );
}

function resolveStayUnitId(record: PaymentConflictBooking | JsonRecord | null | undefined): string | null {
  const direct = asString(record?.stay_unit_id);
  if (direct) {
    return direct;
  }

  const snapshot =
    record && typeof record === "object" && "pricing_snapshot" in record
      ? ((record.pricing_snapshot as Record<string, unknown> | null) ?? null)
      : null;

  return asString(snapshot?.stay_unit_id);
}

async function resolveBookingFamilyId(
  supabase: SupabaseClient,
  record: PaymentConflictBooking | JsonRecord | null | undefined
): Promise<string | null> {
  const relation = (record as JsonRecord | null | undefined)?.hosts;
  const hostRelation = Array.isArray(relation) ? relation[0] : relation;
  const hostRecord =
    hostRelation && typeof hostRelation === "object" && !Array.isArray(hostRelation)
      ? (hostRelation as JsonRecord)
      : null;
  const embeddedFamilyId = asString(hostRecord?.legacy_family_id);
  if (embeddedFamilyId) return embeddedFamilyId;

  const hostId = asString((record as JsonRecord | null | undefined)?.host_id);
  if (!hostId) return null;

  const { data, error } = await supabase
    .from("hosts")
    .select("legacy_family_id")
    .eq("id", hostId)
    .maybeSingle();
  if (error) throw error;
  return asString((data as JsonRecord | null)?.legacy_family_id);
}

export async function loadBookingForPaymentFinalization(
  supabase: SupabaseClient,
  bookingId: string
): Promise<JsonRecord | null> {
  try {
    const { data, error } = await supabase
      .from("bookings_v2")
      .select("id,status,payment_status,payment_id,legacy_booking_id,conversation_id,user_id,recipient_type,host_id,hommie_id,stay_unit_id,source_channel,start_date,end_date,quarter_type,created_at,pricing_snapshot,partner_payout_amount,hosts(user_id,legacy_family_id,display_name),hommie_profiles_v2(user_id)")
      .eq("id", bookingId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return (data as JsonRecord | null) ?? null;
  } catch (error) {
    if (!isMissingColumnError(error, "stay_unit_id")) {
      throw error;
    }

    const { data, error: fallbackError } = await supabase
      .from("bookings_v2")
      .select("id,status,payment_status,payment_id,legacy_booking_id,conversation_id,user_id,recipient_type,host_id,hommie_id,source_channel,start_date,end_date,quarter_type,created_at,pricing_snapshot,partner_payout_amount,hosts(user_id,legacy_family_id,display_name),hommie_profiles_v2(user_id)")
      .eq("id", bookingId)
      .maybeSingle();

    if (fallbackError) {
      throw fallbackError;
    }

    return (data as JsonRecord | null) ?? null;
  }
}

export async function resolveBookingApprovalRequirement(
  supabase: SupabaseClient,
  booking: JsonRecord | null | undefined
): Promise<boolean> {
  const embeddedHostProfile = Array.isArray(booking?.hosts) ? booking.hosts[0] : booking?.hosts;
  const hostProfile = embeddedHostProfile && typeof embeddedHostProfile === "object" ? (embeddedHostProfile as JsonRecord) : null;

  const hostId = asString(booking?.host_id);
  let legacyFamilyId = asString(hostProfile?.legacy_family_id);
  let hostRequiresApproval =
    typeof hostProfile?.booking_requires_host_approval === "boolean"
      ? hostProfile.booking_requires_host_approval
      : null;

  if (hostId && (hostRequiresApproval === null || !legacyFamilyId)) {
    const hostLookup = await supabase
      .from("hosts")
      .select("legacy_family_id,booking_requires_host_approval")
      .eq("id", hostId)
      .maybeSingle();

    if (hostLookup.error) {
      if (!isSchemaCompatibilityError(hostLookup.error.message)) {
        throw hostLookup.error;
      }
    } else {
      legacyFamilyId = asString((hostLookup.data as JsonRecord | null)?.legacy_family_id);
      if (typeof (hostLookup.data as JsonRecord | null)?.booking_requires_host_approval === "boolean") {
        hostRequiresApproval = Boolean((hostLookup.data as JsonRecord | null)?.booking_requires_host_approval);
      }
    }
  }

  if (typeof hostRequiresApproval === "boolean") {
    return hostRequiresApproval;
  }

  if (!legacyFamilyId) {
    return false;
  }

  const familyLookup = await supabase
    .from("families")
    .select("booking_requires_host_approval,admin_notes")
    .eq("id", legacyFamilyId)
    .maybeSingle();

  if (familyLookup.error && !isSchemaCompatibilityError(familyLookup.error.message)) {
    throw familyLookup.error;
  }

  const familyData = (familyLookup.data as JsonRecord | null) ?? null;
  if (typeof familyData?.booking_requires_host_approval === "boolean") {
    return familyData.booking_requires_host_approval;
  }

  const familyMeta = parseHostListingMeta(asString(familyData?.admin_notes));
  if (typeof familyMeta.bookingRequiresHostApproval === "boolean") {
    return familyMeta.bookingRequiresHostApproval;
  }

  const draftLookup = await supabase
    .from("host_onboarding_drafts")
    .select("payload")
    .eq("family_id", legacyFamilyId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (draftLookup.error) {
    if (isSchemaCompatibilityError(draftLookup.error.message)) {
      return false;
    }
    throw draftLookup.error;
  }

  const draftPayload =
    draftLookup.data?.payload && typeof draftLookup.data.payload === "object" && !Array.isArray(draftLookup.data.payload)
      ? (draftLookup.data.payload as JsonRecord)
      : null;

  if (typeof draftPayload?.bookingRequiresHostApproval === "boolean") {
    return draftPayload.bookingRequiresHostApproval;
  }

  return false;
}

export async function assertBookingCanFinalizePayment(
  supabase: SupabaseClient,
  input: {
    bookingId: string;
    paymentId: string;
    paidAt?: string | null;
    booking?: PaymentConflictBooking | null;
  }
): Promise<void> {
  await assertBookingSlotStillAvailableForPayment(supabase, input.bookingId);

  const currentBooking = input.booking;
  const currentBookingId = asString(currentBooking?.id) ?? input.bookingId;
  const hostId = asString(currentBooking?.host_id);
  const stayUnitId = resolveStayUnitId(currentBooking);
  const startDate = asString(currentBooking?.start_date);
  const endDate = asString(currentBooking?.end_date) ?? startDate;
  const slotKey = asString(currentBooking?.quarter_type);

  if (!currentBookingId || !hostId || !startDate || !endDate) {
    return;
  }

  let overlapResult:
    | {
        data: JsonRecord[] | null;
        error: unknown;
      }
    | undefined;

  if (stayUnitId) {
    try {
      overlapResult = await supabase
        .from("bookings_v2")
        .select("id,host_id,stay_unit_id,start_date,end_date,quarter_type,status,payment_status,payment_id,created_at,pricing_snapshot")
        .eq("stay_unit_id", stayUnitId);
    } catch (error) {
      if (!isMissingColumnError(error, "stay_unit_id")) {
        throw error;
      }
      overlapResult = undefined;
    }
  }

  if (!overlapResult || overlapResult.error) {
    overlapResult = await supabase
      .from("bookings_v2")
      .select("id,host_id,start_date,end_date,quarter_type,status,payment_status,payment_id,created_at,pricing_snapshot")
      .eq("host_id", hostId);
  }

  if (overlapResult.error) {
    throw overlapResult.error;
  }

  const overlappingRows = ((overlapResult.data ?? []) as JsonRecord[]).filter((row) => {
    const rowBookingId = asString(row.id);
    const rowStartDate = asString(row.start_date);
    const rowEndDate = asString(row.end_date) ?? rowStartDate;
    const rowSlotKey = asString(row.quarter_type);
    const rowStayUnitId = resolveStayUnitId(row);

    if (!rowBookingId || rowBookingId === currentBookingId || !rowStartDate || !rowEndDate) {
      return false;
    }

    if (stayUnitId && rowStayUnitId && rowStayUnitId !== stayUnitId) {
      return false;
    }

    const rowStayNightRange = getStayNightDateRange(rowStartDate, rowEndDate);
    const dateOverlap = enumerateDates(startDate, endDate).some(
      (date) => rowStayNightRange && date >= rowStayNightRange.from && date <= rowStayNightRange.to
    );
    if (!dateOverlap) {
      return false;
    }
    return true;
  });

  if (overlappingRows.length === 0) {
    return;
  }

  const paymentIds = [
    input.paymentId,
    ...overlappingRows
      .map((row) => asString(row.payment_id))
      .filter((value): value is string => Boolean(value)),
  ];
  const { data: paymentRows, error: paymentRowsError } = paymentIds.length
    ? await supabase
        .from("payments_v2")
        .select("id,booking_id,status,paid_at")
        .in("id", paymentIds)
    : { data: [], error: null };

  if (paymentRowsError) {
    throw paymentRowsError;
  }

  const paymentByBookingId = new Map<string, JsonRecord>();
  for (const row of (paymentRows ?? []) as JsonRecord[]) {
    const bookingId = asString(row.booking_id);
    if (bookingId) {
      paymentByBookingId.set(bookingId, row);
    }
  }

  const contenders = [
    {
      bookingId: currentBookingId,
      status: asString(currentBooking?.status),
      paymentStatus: asString(currentBooking?.payment_status) ?? "pending",
      paymentRowStatus: "paid",
      paidAt: input.paidAt ?? asString(paymentByBookingId.get(currentBookingId)?.paid_at),
      createdAt: asString(currentBooking?.created_at),
    },
    ...overlappingRows.map((row) => {
      const bookingId = asString(row.id) ?? "";
      const payment = paymentByBookingId.get(bookingId);
      return {
        bookingId,
        status: asString(row.status),
        paymentStatus: asString(row.payment_status),
        paymentRowStatus: asString(payment?.status),
        paidAt: asString(payment?.paid_at),
        createdAt: asString(row.created_at),
      };
    }),
  ].filter((row) => isPaymentWinnerCandidate(row.status, row.paymentStatus, row.paymentRowStatus));

  if (contenders.length <= 1) {
    return;
  }

  contenders.sort((left, right) => {
    const leftPaidAt = left.paidAt ?? left.createdAt ?? "";
    const rightPaidAt = right.paidAt ?? right.createdAt ?? "";
    if (leftPaidAt !== rightPaidAt) {
      return leftPaidAt.localeCompare(rightPaidAt);
    }
    return left.bookingId.localeCompare(right.bookingId);
  });

  if (contenders[0]?.bookingId !== currentBookingId) {
    throw new Error("Another guest completed payment for this slot moments earlier.");
  }
}

export async function recordBookingInventoryTransition(
  supabase: SupabaseClient,
  input: {
    booking: PaymentConflictBooking | JsonRecord | null | undefined;
    eventType: Extract<InventoryEventType, "booking_confirmed" | "booking_cancelled" | "booking_modified">;
    eventSource: string;
    actorUserId?: string | null;
    actorRole?: string | null;
    payload?: JsonRecord;
  }
): Promise<string[]> {
  const bookingId = asString(input.booking?.id);
  const familyId = await resolveBookingFamilyId(supabase, input.booking);
  const stayUnitId = resolveStayUnitId(input.booking);
  const inventoryRange = resolveBookingInventoryImpactRange({
    startDate: asString(input.booking?.start_date),
    endDate: asString(input.booking?.end_date),
  });

  if (!bookingId || !familyId || !stayUnitId || !inventoryRange) {
    return [];
  }

  await appendInventoryEvent(supabase, {
    familyId,
    stayUnitId,
    eventType: input.eventType,
    eventSource: input.eventSource,
    sourceReference: bookingId,
    effectiveDateStart: inventoryRange.from,
    effectiveDateEnd: inventoryRange.to,
    slotKey: asString(input.booking?.quarter_type),
    payload: {
      booking_id: bookingId,
      status: asString(input.booking?.status),
      payment_status: asString(input.booking?.payment_status),
      ...(input.payload ?? {}),
    },
    actorUserId: input.actorUserId ?? null,
    actorRole: input.actorRole ?? null,
  });

  await projectInventoryRange(supabase, {
    familyId,
    stayUnitId,
    from: inventoryRange.from,
    to: inventoryRange.to,
  });

  return enqueueBookingInventoryAriSyncJobs(supabase, {
    familyId,
    stayUnitIds: [stayUnitId],
    dateFrom: inventoryRange.from,
    dateTo: inventoryRange.to,
    certificationScenario: input.eventType,
    sourceUiAction: `Famlo PMS booking inventory transition (${input.eventType})`,
    sourceRoute: input.eventSource,
    actorUserId: input.actorUserId ?? null,
    actorRole: input.actorRole ?? null,
  });
}

export async function markBookingPaymentInventoryConflict(
  supabase: SupabaseClient,
  input: {
    booking: PaymentConflictBooking | null | undefined;
    paymentId: string;
    provider: string;
    reason: string;
    conflictSummary?: string | null;
  }
): Promise<void> {
  const bookingId = asString(input.booking?.id);
  if (!bookingId) {
    return;
  }

  const now = new Date().toISOString();
  const reason = input.reason.trim() || "inventory_conflict_after_payment";
  const bookingStatus = "rejected";
  const bookingPaymentStatus = "refund_pending";
  const legacyBookingId = asString(input.booking?.legacy_booking_id);
  const hostId = asString(input.booking?.host_id);
  const stayUnitId = resolveStayUnitId(input.booking as JsonRecord | null | undefined);
  const startDate = asString(input.booking?.start_date) ?? now.slice(0, 10);
  const endDate = asString(input.booking?.end_date) ?? startDate;
  const slotKey = asString(input.booking?.quarter_type);
  const oldStatus = asString(input.booking?.status);

  await supabase
    .from("bookings_v2")
    .update({
      status: bookingStatus,
      payment_status: bookingPaymentStatus,
      hold_expires_at: null,
      cancellation_reason: reason,
      updated_at: now,
    } as never)
    .eq("id", bookingId);

  await recordBookingInventoryTransition(supabase, {
    booking: input.booking,
    eventType: "booking_cancelled",
    eventSource: input.provider,
    payload: {
      reason,
      conflict_payment_id: input.paymentId,
      conflict_summary: input.conflictSummary ?? null,
    },
  });

  await syncReservationFromBooking(supabase, {
    bookingId,
    source: input.provider,
    eventType: "cancellation_applied",
    payload: {
      reason,
      conflict_payment_id: input.paymentId,
      conflict_summary: input.conflictSummary ?? null,
    },
  });

  if (legacyBookingId) {
    await supabase
      .from("bookings")
      .update({
        status: bookingStatus,
        updated_at: now,
      } as never)
      .eq("id", legacyBookingId);
  }

  const { data: payment } = await supabase
    .from("payments_v2")
    .select("raw_response")
    .eq("id", input.paymentId)
    .maybeSingle();

  await supabase
    .from("payments_v2")
    .update({
      refund_status: "pending",
      raw_response: {
        ...(((payment?.raw_response as JsonRecord | null) ?? {})),
        booking_conflict: {
          reason,
          detected_at: now,
        },
      },
    } as never)
    .eq("id", input.paymentId);

  await supabase.from("booking_status_history_v2").insert({
    booking_id: bookingId,
    old_status: oldStatus,
    new_status: bookingStatus,
    changed_by_user_id: null,
    reason,
    created_at: now,
  } as never);

  await syncBookingCalendarIndexBestEffort(supabase, bookingId, "mark_booking_payment_inventory_conflict");

  const summary =
    input.conflictSummary?.trim() ||
    "Payment was captured after this slot was already taken. Booking moved to refund pending review.";

  if (hostId) {
    await createCalendarConflict(supabase, {
      ownerType: "host",
      ownerId: hostId,
      bookingId,
      conflictType: "payment_finalization_overlap",
      summary,
      details: {
        booking_id: bookingId,
        payment_id: input.paymentId,
        provider: input.provider,
        start_date: startDate,
        end_date: endDate,
        slot_key: slotKey,
        reason,
      },
    });
  }

  if (stayUnitId) {
    await createCalendarConflict(supabase, {
      ownerType: "stay_unit",
      ownerId: stayUnitId,
      bookingId,
      conflictType: "payment_finalization_overlap",
      summary,
      details: {
        booking_id: bookingId,
        payment_id: input.paymentId,
        provider: input.provider,
        start_date: startDate,
        end_date: endDate,
        slot_key: slotKey,
        reason,
      },
    });
  }
}

export async function finalizeCapturedBookingPayment(
  supabase: SupabaseClient,
  input: {
    payment: FinalizablePaymentRecord;
    booking?: JsonRecord | null;
    gatewayOrderId: string;
    gatewayPaymentId: string;
    providerPaymentStatus: string;
    providerAmountPaise: number;
    paidAt: string;
    source: "payments.verify" | "payments.webhook";
    providerEventName: string;
    rawResponsePatch?: JsonRecord;
  }
): Promise<{
    decision: CapturedPaymentFinalizationDecision;
    finalizedNow: boolean;
    booking: JsonRecord | null;
    approvalRequired: boolean;
    nextStatus: string | null;
    payoutId: string | null;
  }> {
  const booking = input.booking ?? (await loadBookingForPaymentFinalization(supabase, input.payment.booking_id));
  const decision = resolveCapturedPaymentFinalizationDecision({
    paymentStatus: input.payment.status,
    bookingPaymentStatus: asString(booking?.payment_status),
    bookingStatus: asString(booking?.status),
    providerPaymentStatus: input.providerPaymentStatus,
    gatewayOrderId: input.gatewayOrderId,
    gatewayPaymentId: input.gatewayPaymentId,
    expectedAmountRupees: asNumber(input.payment.amount_total),
    providerAmountPaise: input.providerAmountPaise,
  });

  if (decision !== "finalize_now") {
    return {
      decision,
      finalizedNow: false,
      booking,
      approvalRequired: false,
      nextStatus: null,
      payoutId: null,
    };
  }

  await assertBookingCanFinalizePayment(supabase, {
    bookingId: input.payment.booking_id,
    paymentId: input.payment.id,
    paidAt: input.paidAt,
    booking: booking as Record<string, unknown> | null | undefined,
  });

  const approvalRequired = await resolveBookingApprovalRequirement(supabase, booking);
  const nextStatus = approvalRequired ? "pending_host_approval" : "confirmed";
  const currentRawResponse = (input.payment.raw_response as JsonRecord | null) ?? {};

  const { error: paymentUpdateError } = await supabase
    .from("payments_v2")
    .update({
      gateway: "razorpay",
      gateway_order_id: input.gatewayOrderId,
      gateway_payment_id: input.gatewayPaymentId,
      status: "paid",
      paid_at: input.paidAt,
      raw_response: {
        ...currentRawResponse,
        ...((input.rawResponsePatch as JsonRecord | null) ?? {}),
      },
    } as never)
    .eq("id", input.payment.id);

  if (paymentUpdateError) throw paymentUpdateError;

  const { error: bookingUpdateError } = await supabase
    .from("bookings_v2")
    .update({
      payment_status: "paid",
      payment_id: input.payment.id,
      status: nextStatus,
      hold_expires_at: null,
      updated_at: input.paidAt,
    } as never)
    .eq("id", input.payment.booking_id);
  if (bookingUpdateError) throw bookingUpdateError;

  const finalBooking = {
    ...(booking ?? {}),
    status: nextStatus,
    payment_status: "paid",
    payment_id: input.payment.id,
  };

  await recordBookingInventoryTransition(supabase, {
    booking: finalBooking,
    eventType: "booking_confirmed",
    eventSource: input.source,
    payload: {
      payment_id: input.payment.id,
      approval_required: approvalRequired,
      provider_event: input.providerEventName,
    },
  });

  const legacyBookingId =
    typeof booking?.legacy_booking_id === "string" && booking.legacy_booking_id.trim().length > 0
      ? booking.legacy_booking_id
      : null;

  if (legacyBookingId) {
    await supabase
      .from("bookings")
      .update({
        status: nextStatus,
        updated_at: input.paidAt,
      } as never)
      .eq("id", legacyBookingId);
  }

  await supabase.from("booking_status_history_v2").insert({
    booking_id: input.payment.booking_id,
    old_status: booking?.status ?? null,
    new_status: nextStatus,
    changed_by_user_id: null,
    reason: input.source === "payments.verify" ? "payment_verified" : `payment_webhook:${input.providerEventName}`,
    created_at: input.paidAt,
  } as never);

  await syncReservationFromBooking(supabase, {
    bookingId: input.payment.booking_id,
    source: input.source,
    eventType: "status_synced",
    payload: {
      payment_id: input.payment.id,
      approval_required: approvalRequired,
      next_status: nextStatus,
      provider_event: input.providerEventName,
    },
  });

  await appendLedgerEntryIfMissing(supabase, {
    bookingId: input.payment.booking_id,
    paymentId: input.payment.id,
    entryType: "payment_captured",
    accountCode: "cash_gateway_clearing",
    direction: "debit",
    amount: asNumber(input.payment.amount_total),
    referenceType: input.source === "payments.verify" ? "payment_verify" : "payment_webhook",
    referenceId: `${input.providerEventName}:${input.gatewayPaymentId}`,
    metadata: {
      provider: "razorpay",
      source: input.source,
    },
  });

  await appendLedgerEntryIfMissing(supabase, {
    bookingId: input.payment.booking_id,
    paymentId: input.payment.id,
    entryType: "tax_liability",
    accountCode: "tax_output_payable",
    direction: "credit",
    amount: asNumber(input.payment.tax_amount),
    referenceType: input.source === "payments.verify" ? "payment_verify_tax" : "payment_webhook_tax",
    referenceId: `tax:${input.providerEventName}:${input.gatewayPaymentId}`,
    metadata: {
      provider: "razorpay",
      source: input.source,
    },
  });

  const hommieRelation = Array.isArray(booking?.hommie_profiles_v2)
    ? booking.hommie_profiles_v2[0]
    : booking?.hommie_profiles_v2;
  const hostProfileForFlow = Array.isArray(booking?.hosts) ? booking.hosts[0] : booking?.hosts;

  let payoutId: string | null = null;
  if (!approvalRequired) {
    payoutId =
      booking?.recipient_type === "host" && booking.host_id && hostProfileForFlow?.user_id
        ? await ensureScheduledPayout(supabase, {
            bookingId: input.payment.booking_id,
            paymentId: input.payment.id,
            partnerType: "host",
            partnerUserId: String(hostProfileForFlow.user_id),
            partnerProfileId: String(booking.host_id),
            amount:
              typeof booking.partner_payout_amount === "number"
                ? booking.partner_payout_amount
                : Number(booking.partner_payout_amount ?? 0),
            pricingSnapshot: (booking.pricing_snapshot as Record<string, unknown> | null) ?? {},
            paymentTaxAmount: asNumber(input.payment.tax_amount),
          })
        : booking?.recipient_type === "hommie" && booking.hommie_id && hommieRelation?.user_id
          ? await ensureScheduledPayout(supabase, {
              bookingId: input.payment.booking_id,
              paymentId: input.payment.id,
              partnerType: "hommie",
              partnerUserId: String(hommieRelation.user_id),
              partnerProfileId: String(booking.hommie_id),
              amount:
                typeof booking.partner_payout_amount === "number"
                  ? booking.partner_payout_amount
                  : Number(booking.partner_payout_amount ?? 0),
              pricingSnapshot: (booking.pricing_snapshot as Record<string, unknown> | null) ?? {},
              paymentTaxAmount: asNumber(input.payment.tax_amount),
            })
          : null;

    if (payoutId) {
      await appendLedgerEntryIfMissing(supabase, {
        bookingId: input.payment.booking_id,
        paymentId: input.payment.id,
        payoutId,
        entryType: "payout_scheduled",
        accountCode: "partner_payable",
        direction: "credit",
        amount:
          typeof booking?.partner_payout_amount === "number"
            ? booking.partner_payout_amount
            : Number(booking?.partner_payout_amount ?? 0),
        referenceType: "payout_schedule",
        referenceId: payoutId,
        metadata: {
          provider: "razorpay",
          source: input.source,
        },
      });
    }
  }

  await processFinanceEventContract(supabase, {
    bookingId: input.payment.booking_id,
    eventType: "PAYMENT_CAPTURED",
    sourceEventId: input.gatewayPaymentId,
    calculationVersion: "batch2-direct-folio-v1",
    currency: typeof input.payment.currency === "string" ? input.payment.currency : "INR",
    guestPaidAmount: asNumber(input.payment.amount_total),
    sourceChannel: typeof booking?.source_channel === "string" ? booking.source_channel : "famlo_direct",
    metadata: {
      source: input.source,
      payment_id: input.payment.id,
      provider_event: input.providerEventName,
      payout_id: payoutId,
    },
  });

  await syncBookingCalendarIndexBestEffort(supabase, input.payment.booking_id, "finalize_captured_booking_payment");

  return {
    decision,
    finalizedNow: true,
    booking: finalBooking,
    approvalRequired,
    nextStatus,
    payoutId,
  };
}

function enumerateDates(from: string, to: string): string[] {
  return enumerateStayNights(from, to);
}

function isPaymentWinnerCandidate(
  status: string | null,
  paymentStatus: string | null,
  paymentRowStatus: string | null
): boolean {
  const normalizedStatus = (status ?? "").trim().toLowerCase();
  const normalizedPaymentStatus = (paymentStatus ?? "").trim().toLowerCase();
  const normalizedPaymentRowStatus = (paymentRowStatus ?? "").trim().toLowerCase();

  if (
    normalizedStatus === "rejected" ||
    normalizedStatus === "cancelled" ||
    normalizedStatus === "cancelled_by_user" ||
    normalizedStatus === "cancelled_by_partner" ||
    normalizedPaymentStatus === "refund_pending" ||
    normalizedPaymentStatus === "refunded" ||
    normalizedPaymentStatus === "partially_refunded"
  ) {
    return false;
  }

  return (
    normalizedPaymentStatus === "paid" ||
    normalizedPaymentRowStatus === "paid" ||
    normalizedStatus === "confirmed" ||
    normalizedStatus === "accepted" ||
    normalizedStatus === "checked_in" ||
    normalizedStatus === "completed" ||
    normalizedStatus === "pending" ||
    normalizedStatus === "pending_host_approval"
  );
}
