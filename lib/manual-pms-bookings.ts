import type { SupabaseClient } from "@supabase/supabase-js";

import { syncBookingCalendarIndexBestEffort } from "@/lib/booking-calendar-index";
import { recordBookingInventoryTransition } from "@/lib/payment-booking-finalization";
import { ensureReservationForBooking } from "@/lib/reservations";
import { getStayNightDateRange, type JsonRecord } from "@/lib/platform-utils";

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

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

export type ManualPmsBookingAccess = {
  dashboardEnabled: boolean;
  isAdmin: boolean;
  famloProAllowed: boolean;
};

export function canCreateManualPmsBooking(access: ManualPmsBookingAccess): { ok: boolean; reason: string | null } {
  if (!access.dashboardEnabled) return { ok: false, reason: "Famlo Pro is disabled." };
  if (!access.isAdmin) return { ok: false, reason: "Only admin/operator users can create manual PMS bookings." };
  if (!access.famloProAllowed) return { ok: false, reason: "Famlo Pro is not active for this property." };
  return { ok: true, reason: null };
}

export type ManualPmsBookingInput = {
  actorUserId: string;
  actorRole?: string | null;
  familyId: string;
  hostId: string;
  stayUnitId: string;
  guestName: string;
  guestEmail?: string | null;
  guestPhone?: string | null;
  checkInDate: string;
  checkOutDate: string;
  notes?: string | null;
};

export function buildManualPmsBookingPayload(input: ManualPmsBookingInput): JsonRecord {
  const pricingSnapshot: JsonRecord = {
    currency: "INR",
    stay_unit_id: input.stayUnitId,
    guest_name: input.guestName,
    guest_email: asString(input.guestEmail),
    guest_phone: asString(input.guestPhone),
    booking_origin: "pms_manual",
    inventory_model: "stay_nights_checkout_exclusive",
  };

  return {
    user_id: input.actorUserId,
    booking_type: "host_stay",
    recipient_type: "host",
    recipient_id: input.hostId,
    product_type: "host_listing",
    product_id: input.hostId,
    host_id: input.hostId,
    stay_unit_id: input.stayUnitId,
    status: "confirmed",
    start_date: input.checkInDate,
    end_date: input.checkOutDate,
    guests_count: 1,
    notes: asString(input.notes),
    pricing_snapshot: pricingSnapshot,
    total_price: 0,
    partner_payout_amount: 0,
    payment_status: "not_required",
    cancellation_policy_code: "famlo_flexible_24h",
    source_channel: "pms_manual",
  };
}

type CreatedBookingRecord = {
  id: string;
  status: string;
  payment_status: string;
  host_id: string;
  stay_unit_id: string;
  start_date: string;
  end_date: string;
  quarter_type: null;
  pricing_snapshot: JsonRecord;
};

export async function createManualPmsBooking(
  supabase: SupabaseClient,
  input: ManualPmsBookingInput,
  dependencies?: {
    ensureReservationForBookingFn?: typeof ensureReservationForBooking;
    recordBookingInventoryTransitionFn?: typeof recordBookingInventoryTransition;
  }
): Promise<{
  bookingId: string;
  reservationId: string | null;
  queuedJobIds: string[];
  warnings: string[];
}> {
  if (!input.checkInDate || !input.checkOutDate) {
    throw new Error("Check-in and checkout dates are required.");
  }
  if (input.checkOutDate <= input.checkInDate) {
    throw new Error("Checkout date must be after check-in date.");
  }
  const stayNightRange = getStayNightDateRange(input.checkInDate, input.checkOutDate);
  if (!stayNightRange) {
    throw new Error("Valid stay dates are required.");
  }

  const bookingPayload = buildManualPmsBookingPayload(input);

  let insertResult;
  try {
    insertResult = await supabase.from("bookings_v2").insert(bookingPayload).select("id").single();
  } catch (error) {
    if (!isMissingColumnError(error, "stay_unit_id")) throw error;
    const { stay_unit_id: _ignored, ...fallbackPayload } = bookingPayload;
    insertResult = await supabase.from("bookings_v2").insert(fallbackPayload).select("id").single();
  }
  if (insertResult.error && isMissingColumnError(insertResult.error, "stay_unit_id") && "stay_unit_id" in bookingPayload) {
    const { stay_unit_id: _ignored, ...fallbackPayload } = bookingPayload;
    insertResult = await supabase.from("bookings_v2").insert(fallbackPayload).select("id").single();
  }

  const bookingId = asString((insertResult.data as JsonRecord | null)?.id);
  if (insertResult.error || !bookingId) {
    throw insertResult.error ?? new Error("Unable to create the manual PMS booking.");
  }

  await supabase.from("booking_status_history_v2").insert({
    booking_id: bookingId,
    old_status: null,
    new_status: "confirmed",
    changed_by_user_id: input.actorUserId,
    reason: "manual_pms_booking_create",
    created_at: new Date().toISOString(),
  } as never);

  const ensureReservationForBookingFn = dependencies?.ensureReservationForBookingFn ?? ensureReservationForBooking;
  const recordBookingInventoryTransitionFn =
    dependencies?.recordBookingInventoryTransitionFn ?? recordBookingInventoryTransition;

  const reservationState = await ensureReservationForBookingFn(supabase, {
    bookingId,
    source: "manual_pms_booking_create",
    sourceKind: "manual",
  });

  const queuedJobIds = await recordBookingInventoryTransitionFn(supabase, {
    booking: {
      id: bookingId,
      status: "confirmed",
      payment_status: "not_required",
      host_id: input.hostId,
      stay_unit_id: input.stayUnitId,
      start_date: input.checkInDate,
      end_date: input.checkOutDate,
      quarter_type: null,
      pricing_snapshot: bookingPayload.pricing_snapshot as JsonRecord,
    } satisfies CreatedBookingRecord,
    eventType: "booking_confirmed",
    eventSource: "/api/host/pro/bookings/manual",
    actorUserId: input.actorUserId,
    actorRole: input.actorRole ?? "admin",
    payload: {
      booking_origin: "pms_manual",
      guest_name: input.guestName,
      guest_email: asString(input.guestEmail),
      guest_phone: asString(input.guestPhone),
      inventory_date_from: stayNightRange.from,
      inventory_date_to: stayNightRange.to,
    },
  });

  const warnings =
    queuedJobIds.length > 0
      ? []
      : ["Booking created, but no Channex availability job was queued. Check Channex property, room, and rate mappings."];

  await syncBookingCalendarIndexBestEffort(supabase, bookingId, "manual_pms_booking_create");

  return {
    bookingId,
    reservationId: reservationState.reservationId,
    queuedJobIds,
    warnings,
  };
}
