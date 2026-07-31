import type { SupabaseClient } from "@supabase/supabase-js";

import { enqueueNotification } from "@/lib/booking-platform";
import { calculateFlexibleCancellationPolicy, type CancellationReason } from "@/lib/cancellations/policy";
import { recordBookingInventoryTransition } from "@/lib/payment-booking-finalization";
import { syncBookingCalendarIndexBestEffort } from "@/lib/booking-calendar-index";
import { syncReservationFromBooking } from "@/lib/reservations";

type JsonRecord = Record<string, unknown>;

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function loadCancellationContext(supabase: SupabaseClient, bookingId: string): Promise<{
  booking: JsonRecord;
  payment: JsonRecord | null;
}> {
  const { data: booking, error } = await supabase
    .from("bookings_v2")
    .select("id,user_id,host_id,status,payment_status,payment_id,total_price,start_date,end_date,legacy_booking_id,stay_unit_id,quarter_type,pricing_snapshot,created_at")
    .eq("id", bookingId)
    .maybeSingle();
  if (error) throw error;
  if (!booking) throw new Error("Booking not found.");
  const { data: payment, error: paymentError } = await supabase
    .from("payments_v2")
    .select("id,booking_id,amount_total,status,gateway,gateway_order_id,gateway_payment_id,currency,refund_status")
    .eq("booking_id", bookingId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (paymentError) throw paymentError;
  return { booking: booking as JsonRecord, payment: payment as JsonRecord | null };
}

export function buildCancellationPolicyForContext(context: Awaited<ReturnType<typeof loadCancellationContext>>, reason: CancellationReason) {
  const grossPaidAmountMinor = Math.max(0, Math.round(asNumber(context.payment?.amount_total ?? context.booking.total_price) * 100));
  return calculateFlexibleCancellationPolicy({
    grossPaidAmountMinor,
    bookingStatus: asString(context.booking.status),
    reason,
    checkInDate: asString(context.booking.start_date),
  });
}

export async function requestGuestCancellation(supabase: SupabaseClient, input: {
  bookingId: string;
  guestUserId: string;
  reason: CancellationReason;
  notes?: string | null;
  idempotencyKey: string;
}) {
  const context = await loadCancellationContext(supabase, input.bookingId);
  if (asString(context.booking.user_id) !== input.guestUserId) throw new Error("You can only request cancellation for your own booking.");
  const policy = buildCancellationPolicyForContext(context, input.reason);
  const { data, error } = await supabase.rpc("request_booking_cancellation_v1", {
    p_booking_id: input.bookingId,
    p_guest_user_id: input.guestUserId,
    p_reason: input.reason,
    p_guest_notes: input.notes ?? "",
    p_policy_code: policy.policyCode,
    p_policy_snapshot: policy,
    p_gross_paid_minor: policy.grossPaidAmountMinor,
    p_suggested_refund_minor: policy.suggestedRefundAmountMinor,
    p_idempotency_key: input.idempotencyKey,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  const requestId = asString((row as JsonRecord | null)?.request_id);
  if (!requestId) throw new Error("Cancellation request was not created.");
  if (Boolean((row as JsonRecord).created)) {
    await enqueueNotification(supabase, {
      eventType: "guest_cancellation_requested",
      channel: "email",
      bookingId: input.bookingId,
      dedupeKey: `guest_cancellation_requested:${requestId}:team`,
      subject: "Guest cancellation request needs review",
      recipientRole: "admin",
      payload: { message: "A guest cancellation request is ready for service review.", cancellation_request_id: requestId },
    });
  }
  return { requestId, status: asString((row as JsonRecord).request_status) ?? "requested", created: Boolean((row as JsonRecord).created), policy };
}

export async function requestHostDeclineCancellation(supabase: SupabaseClient, input: {
  bookingId: string;
  hostId: string;
  actorId?: string | null;
  idempotencyKey: string;
  reason?: "host_declined" | "host_unresponsive";
}): Promise<{ requestId: string; created: boolean }> {
  const context = await loadCancellationContext(supabase, input.bookingId);
  if (asString(context.booking.host_id) !== input.hostId) throw new Error("This booking does not belong to the selected host.");
  if (asString(context.booking.status) !== "pending_host_approval") throw new Error("This booking is no longer awaiting a host decision.");
  const reason = input.reason ?? "host_declined";
  const policy = buildCancellationPolicyForContext(context, reason);
  const existing = await supabase.from("cancellation_requests_v2").select("id")
    .eq("booking_id", input.bookingId).not("status", "in", "(rejected,withdrawn,completed)").maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data?.id) return { requestId: String(existing.data.id), created: false };
  const { data: cancellation, error } = await supabase.from("cancellation_requests_v2").insert({
    booking_id: input.bookingId,
    payment_id: asString(context.payment?.id),
    guest_user_id: asString(context.booking.user_id),
    host_id: input.hostId,
    requested_by: "host",
    request_reason: reason,
    policy_code: policy.policyCode,
    policy_snapshot: policy,
    gross_paid_amount_minor: policy.grossPaidAmountMinor,
    suggested_refund_amount_minor: policy.suggestedRefundAmountMinor,
    status: "recommended_approve",
    service_executive_recommendation: "approve",
    recommended_at: new Date().toISOString(),
    settlement_hold_created_at: new Date().toISOString(),
  }).select("id").single();
  if (error) {
    if (error.code === "23505") {
      const duplicate = await supabase.from("cancellation_requests_v2").select("id").eq("booking_id", input.bookingId)
        .not("status", "in", "(rejected,withdrawn,completed)").single();
      if (duplicate.error) throw duplicate.error;
      return { requestId: String(duplicate.data.id), created: false };
    }
    throw error;
  }
  const requestId = String(cancellation.id);
  await supabase.from("booking_settlement_holds_v2").insert({
    booking_id: input.bookingId,
    cancellation_request_id: requestId,
    reason: "host_declined_cancellation_review",
  });
  await supabase.from("cancellation_request_events_v2").insert({
    cancellation_request_id: requestId,
    booking_id: input.bookingId,
    actor_id: input.actorId ?? input.hostId,
    actor_role: "host",
    action: `${reason}_cancellation_created`,
    idempotency_key: input.idempotencyKey,
  });
  await enqueueNotification(supabase, {
    eventType: `${reason}_cancellation_review`,
    channel: "email",
    bookingId: input.bookingId,
    dedupeKey: `${reason}_cancellation_review:${requestId}:team`,
    subject: reason === "host_declined" ? "Host declined: full refund review required" : "Host unreachable: full refund review required",
    recipientRole: "admin",
    payload: { message: "The host declined a paid booking. A full refund is recommended and requires admin approval." },
  });
  return { requestId, created: true };
}

export async function finalizeApprovedCancellationSideEffects(supabase: SupabaseClient, input: {
  cancellationRequestId: string;
  bookingId: string;
  actorId: string;
}): Promise<void> {
  const context = await loadCancellationContext(supabase, input.bookingId);
  await recordBookingInventoryTransition(supabase, {
    booking: { ...context.booking, status: "cancelled" },
    eventType: "booking_cancelled",
    eventSource: "admin_cancellation_approval",
    actorRole: "admin",
    payload: { cancellation_request_id: input.cancellationRequestId },
  });
  await syncReservationFromBooking(supabase, {
    bookingId: input.bookingId,
    source: "admin_cancellation_approval",
    actorRole: "admin",
    eventType: "cancellation_applied",
    idempotencyKey: `cancellation-approved:${input.cancellationRequestId}`,
    payload: { cancellation_request_id: input.cancellationRequestId },
  });
  const now = new Date().toISOString();
  await supabase.from("calendar_events").update({ status: "released", is_blocking: false, updated_at: now } as never)
    .eq("booking_id", input.bookingId).in("source_type", ["internal_booking", "booking_hold"]);
  await syncBookingCalendarIndexBestEffort(supabase, input.bookingId, "admin_cancellation_approval");
  await enqueueNotification(supabase, {
    eventType: "cancellation_approved",
    channel: "email",
    userId: asString(context.booking.user_id),
    bookingId: input.bookingId,
    dedupeKey: `cancellation_approved:${input.cancellationRequestId}:guest`,
    subject: "Your Famlo cancellation was approved",
    recipientRole: "guest",
    payload: { message: "Your booking is cancelled. Any approved refund is now being processed." },
  });
}
