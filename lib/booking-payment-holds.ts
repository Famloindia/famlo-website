import type { SupabaseClient } from "@supabase/supabase-js";

import { syncBookingCalendarIndexBestEffort } from "@/lib/booking-calendar-index";
import { recordBookingInventoryTransition } from "@/lib/payment-booking-finalization";
import { syncReservationFromBooking } from "@/lib/reservations";

type JsonRecord = Record<string, unknown>;

export type UnpaidHoldReleaseReason =
  | "payment_failed"
  | "user_dropped"
  | "payment_setup_failed"
  | "order_expired";

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

export async function releasePaymentAttemptBookingHold(
  supabase: SupabaseClient,
  input: {
    bookingId: string;
    paymentId: string;
    reason: UnpaidHoldReleaseReason;
    paymentStatus: "failed" | "abandoned" | "expired";
    source: string;
  }
): Promise<{ released: boolean }> {
  const now = new Date().toISOString();
  const result = await supabase
    .from("bookings_v2")
    .update({
      status: "payment_failed",
      payment_status: input.paymentStatus,
      hold_expires_at: null,
      cancellation_reason: input.reason,
      updated_at: now,
    } as never)
    .eq("id", input.bookingId)
    .eq("payment_id", input.paymentId)
    .eq("status", "awaiting_payment")
    .in("payment_status", ["pending", "failed", "abandoned", "expired"])
    .select("id,legacy_booking_id,host_id,stay_unit_id,start_date,end_date,quarter_type,status,payment_status,pricing_snapshot")
    .maybeSingle();
  if (result.error) throw result.error;
  if (!result.data?.id) return { released: false };

  const booking = result.data as JsonRecord;
  const legacyBookingId = asString(booking.legacy_booking_id);
  if (legacyBookingId) {
    const legacyUpdate = await supabase
      .from("bookings")
      .update({ status: "payment_failed" } as never)
      .eq("id", legacyBookingId);
    if (legacyUpdate.error) throw legacyUpdate.error;
  }

  await supabase.from("booking_status_history_v2").insert({
    booking_id: input.bookingId,
    old_status: "awaiting_payment",
    new_status: "payment_failed",
    changed_by_user_id: null,
    reason: input.reason,
    created_at: now,
  } as never);

  await syncReservationFromBooking(supabase, {
    bookingId: input.bookingId,
    source: input.source,
    eventType: "cancellation_applied",
    idempotencyKey: `payment_hold_release:${input.paymentId}:${input.reason}`,
    payload: {
      payment_id: input.paymentId,
      reason: input.reason,
    },
  });

  await recordBookingInventoryTransition(supabase, {
    booking,
    eventType: "booking_cancelled",
    eventSource: input.source,
    payload: {
      payment_id: input.paymentId,
      release_reason: input.reason,
    },
  });
  await syncBookingCalendarIndexBestEffort(supabase, input.bookingId, "release_payment_attempt_hold");

  return { released: true };
}
