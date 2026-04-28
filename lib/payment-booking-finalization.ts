import type { SupabaseClient } from "@supabase/supabase-js";

import { assertBookingSlotStillAvailableForPayment } from "@/lib/booking-compat";
import { createCalendarConflict } from "@/lib/calendar";

type JsonRecord = Record<string, unknown>;

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
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

export async function loadBookingForPaymentFinalization(
  supabase: SupabaseClient,
  bookingId: string
): Promise<JsonRecord | null> {
  try {
    const { data, error } = await supabase
      .from("bookings_v2")
      .select("id,status,payment_status,payment_id,legacy_booking_id,conversation_id,user_id,recipient_type,host_id,hommie_id,stay_unit_id,start_date,end_date,quarter_type,created_at,pricing_snapshot,partner_payout_amount,hosts(user_id,legacy_family_id,display_name),hommie_profiles_v2(user_id)")
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
      .select("id,status,payment_status,payment_id,legacy_booking_id,conversation_id,user_id,recipient_type,host_id,hommie_id,start_date,end_date,quarter_type,created_at,pricing_snapshot,partner_payout_amount,hosts(user_id,legacy_family_id,display_name),hommie_profiles_v2(user_id)")
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

  if (typeof hostProfile?.booking_requires_host_approval === "boolean") {
    return hostProfile.booking_requires_host_approval;
  }

  const hostId = asString(booking?.host_id);
  let legacyFamilyId = asString(hostProfile?.legacy_family_id);

  if (!legacyFamilyId && hostId) {
    const hostLookup = await supabase
      .from("hosts")
      .select("legacy_family_id")
      .eq("id", hostId)
      .maybeSingle();

    if (hostLookup.error) {
      if (!isSchemaCompatibilityError(hostLookup.error.message)) {
        throw hostLookup.error;
      }
    } else {
      legacyFamilyId = asString((hostLookup.data as JsonRecord | null)?.legacy_family_id);
    }
  }

  if (!legacyFamilyId) {
    return false;
  }

  const familyLookup = await supabase
    .from("families")
    .select("booking_requires_host_approval")
    .eq("id", legacyFamilyId)
    .maybeSingle();

  if (familyLookup.error) {
    if (isSchemaCompatibilityError(familyLookup.error.message)) {
      return false;
    }
    throw familyLookup.error;
  }

  return Boolean((familyLookup.data as JsonRecord | null)?.booking_requires_host_approval);
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

    const dateOverlap = enumerateDates(startDate, endDate).some((date) => date >= rowStartDate && date <= rowEndDate);
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

function enumerateDates(from: string, to: string): string[] {
  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  const output: string[] = [];

  while (start <= end) {
    output.push(start.toISOString().split("T")[0] ?? from);
    start.setUTCDate(start.getUTCDate() + 1);
  }

  return output;
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
    normalizedStatus === "pending"
  );
}
