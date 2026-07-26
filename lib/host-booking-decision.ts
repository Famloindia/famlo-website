import type { SupabaseClient } from "@supabase/supabase-js";

import { syncBookingCalendarIndexBestEffort } from "@/lib/booking-calendar-index";
import { enqueueNotification } from "@/lib/booking-platform";
import {
  approveAndMaybeInitiateRefund,
  createRefundRequestDraft,
  resolveRefundPolicyInputFromRequest,
} from "@/lib/finance/refund-requests";
import { applyHostBookingStatusUpdate } from "@/lib/host-booking-status";
import { recordBookingInventoryTransition } from "@/lib/payment-booking-finalization";
import { asNumber, asString, type JsonRecord } from "@/lib/platform-utils";
import { getWhatsAppRuntimeConfig } from "@/lib/whatsapp-config";
import { resolveEligibleGuestWhatsApp } from "@/lib/whatsapp-eligibility";

export type HostBookingDecision = "approve" | "decline";
export type HostBookingDecisionSource = "dashboard" | "signed_link" | "whatsapp";

export type HostBookingDecisionInput = {
  bookingId: string;
  hostId: string;
  familyId?: string | null;
  decision: HostBookingDecision;
  source: HostBookingDecisionSource;
  actor: {
    userId?: string | null;
    role: "host" | "admin" | "system";
  };
  idempotencyKey: string;
};

export type HostBookingDecisionResult = {
  status: "applied" | "already_processed";
  decision: HostBookingDecision;
  bookingId: string;
  bookingStatus: "confirmed" | "rejected";
  refundRequestId: string | null;
};

export type HostBookingDecisionClaim = {
  outcome:
    | "claimed"
    | "claimed_recovery"
    | "already_processed"
    | "in_progress"
    | "conflict"
    | "invalid_state"
    | "not_found"
    | "host_mismatch"
    | "family_mismatch";
  decisionId: string | null;
  previousStatus: string | null;
  bookingStatus: string | null;
  refundRequestId: string | null;
};

export type HostBookingDecisionRuntime = {
  claim(input: HostBookingDecisionInput): Promise<HostBookingDecisionClaim>;
  reconcile(
    input: HostBookingDecisionInput,
    claim: HostBookingDecisionClaim
  ): Promise<{ refundRequestId: string | null }>;
  complete(decisionId: string, refundRequestId: string | null): Promise<void>;
  fail(decisionId: string, error: unknown): Promise<void>;
};

export class HostBookingDecisionError extends Error {
  constructor(
    public readonly code:
      | "BOOKING_NOT_FOUND"
      | "HOST_MISMATCH"
      | "FAMILY_MISMATCH"
      | "INVALID_STATE"
      | "CONFLICTING_DECISION"
      | "DECISION_IN_PROGRESS",
    message: string
  ) {
    super(message);
    this.name = "HostBookingDecisionError";
  }
}

function finalStatusForDecision(decision: HostBookingDecision): "confirmed" | "rejected" {
  return decision === "approve" ? "confirmed" : "rejected";
}

function errorForClaim(claim: HostBookingDecisionClaim): HostBookingDecisionError {
  switch (claim.outcome) {
    case "not_found":
      return new HostBookingDecisionError("BOOKING_NOT_FOUND", "Booking not found.");
    case "host_mismatch":
      return new HostBookingDecisionError("HOST_MISMATCH", "This booking does not belong to the selected host.");
    case "family_mismatch":
      return new HostBookingDecisionError("FAMILY_MISMATCH", "This booking does not belong to the selected property.");
    case "conflict":
      return new HostBookingDecisionError("CONFLICTING_DECISION", "This booking already has a different final host decision.");
    case "in_progress":
      return new HostBookingDecisionError("DECISION_IN_PROGRESS", "This booking decision is already being processed.");
    default:
      return new HostBookingDecisionError(
        "INVALID_STATE",
        `This booking cannot be decided from status ${claim.bookingStatus ?? "unknown"}.`
      );
  }
}

export async function executeHostBookingDecision(
  runtime: HostBookingDecisionRuntime,
  input: HostBookingDecisionInput
): Promise<HostBookingDecisionResult> {
  const claim = await runtime.claim(input);
  const bookingStatus = finalStatusForDecision(input.decision);

  if (claim.outcome === "already_processed") {
    return {
      status: "already_processed",
      decision: input.decision,
      bookingId: input.bookingId,
      bookingStatus,
      refundRequestId: claim.refundRequestId,
    };
  }

  if (claim.outcome !== "claimed" && claim.outcome !== "claimed_recovery") {
    throw errorForClaim(claim);
  }

  if (!claim.decisionId) {
    throw new Error("Host booking decision claim did not return an audit record.");
  }

  try {
    const outcome = await runtime.reconcile(input, claim);
    await runtime.complete(claim.decisionId, outcome.refundRequestId);
    return {
      status: claim.outcome === "claimed" ? "applied" : "already_processed",
      decision: input.decision,
      bookingId: input.bookingId,
      bookingStatus,
      refundRequestId: outcome.refundRequestId,
    };
  } catch (error) {
    await runtime.fail(claim.decisionId, error);
    throw error;
  }
}

function firstRecord(value: unknown): JsonRecord | null {
  if (Array.isArray(value)) {
    const first = value[0];
    return first && typeof first === "object" ? (first as JsonRecord) : null;
  }
  return value && typeof value === "object" ? (value as JsonRecord) : null;
}

async function loadDecisionBooking(supabase: SupabaseClient, bookingId: string): Promise<JsonRecord> {
  const { data, error } = await supabase
    .from("bookings_v2")
    .select(
      "id,status,payment_status,payment_id,legacy_booking_id,host_id,user_id,stay_unit_id,start_date,end_date,quarter_type,total_price,partner_payout_amount,pricing_snapshot,conversation_id,hosts(user_id,legacy_family_id,display_name)"
    )
    .eq("id", bookingId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new HostBookingDecisionError("BOOKING_NOT_FOUND", "Booking not found.");
  return data as JsonRecord;
}

async function mirrorLegacyBookingStatus(
  supabase: SupabaseClient,
  booking: JsonRecord,
  status: "confirmed" | "rejected"
): Promise<void> {
  const legacyBookingId = asString(booking.legacy_booking_id);
  if (!legacyBookingId) return;
  const { error } = await supabase
    .from("bookings")
    .update({ status, updated_at: new Date().toISOString() } as never)
    .eq("id", legacyBookingId);
  if (error) throw error;
}

async function ensureHostDeclineRefund(
  supabase: SupabaseClient,
  booking: JsonRecord,
  actorUserId: string | null
): Promise<string | null> {
  const bookingId = asString(booking.id);
  if (!bookingId) return null;

  const { data: payment, error: paymentError } = await supabase
    .from("payments_v2")
    .select("id,booking_id,amount_total,tax_amount,gateway,gateway_payment_id,refund_status,status")
    .eq("booking_id", bookingId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (paymentError) throw paymentError;
  if (!payment || !["paid", "captured"].includes(String(payment.status ?? "").toLowerCase())) {
    return null;
  }

  const terminalRefundStatuses = new Set(["processed", "refunded", "full"]);
  const { data: existingRequest, error: existingRequestError } = await supabase
    .from("refund_requests")
    .select("id,status")
    .eq("booking_id", bookingId)
    .eq("payment_id", payment.id)
    .eq("reason", "host_declined_booking")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existingRequestError) throw existingRequestError;

  let refundRequestId = asString(existingRequest?.id);
  if (!refundRequestId && !terminalRefundStatuses.has(String(payment.refund_status ?? "").toLowerCase())) {
    const draft = await createRefundRequestDraft(supabase, payment, {
      bookingId,
      paymentId: String(payment.id),
      reason: "host_declined_booking",
      actorUserId,
      policyInput: resolveRefundPolicyInputFromRequest({
        policyCase: "HOST_CANCELLATION",
        bookingAmount: asNumber(payment.amount_total),
        paymentTaxAmount: asNumber(payment.tax_amount),
      }),
    });
    refundRequestId = draft.refundRequestId;
    if (!draft.requiresAdminApproval) {
      await approveAndMaybeInitiateRefund(supabase, {
        refundRequestId,
        actorUserId,
      });
    }
  }

  if (!terminalRefundStatuses.has(String(payment.refund_status ?? "").toLowerCase())) {
    const { error: paymentUpdateError } = await supabase
      .from("payments_v2")
      .update({ refund_status: "pending" } as never)
      .eq("id", payment.id);
    if (paymentUpdateError) throw paymentUpdateError;

    const { error: bookingUpdateError } = await supabase
      .from("bookings_v2")
      .update({ payment_status: "refund_pending", updated_at: new Date().toISOString() } as never)
      .eq("id", bookingId);
    if (bookingUpdateError) throw bookingUpdateError;
  }

  return refundRequestId;
}

async function cancelPendingPayouts(supabase: SupabaseClient, bookingId: string): Promise<void> {
  const { error } = await supabase
    .from("payouts_v2")
    .update({ status: "cancelled", notes: "Cancelled because the host declined the booking." } as never)
    .eq("booking_id", bookingId)
    .in("status", ["pending", "scheduled"]);
  if (error) throw error;
}

async function releaseBookingCalendar(supabase: SupabaseClient, bookingId: string): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("calendar_events")
    .update({
      status: "released",
      is_blocking: false,
      payload: { reason: "host_declined", released_at: now },
      updated_at: now,
    } as never)
    .eq("booking_id", bookingId)
    .in("source_type", ["internal_booking", "booking_hold"]);
  if (error) throw error;
}

async function reconcileDecision(
  supabase: SupabaseClient,
  input: HostBookingDecisionInput,
  claim: HostBookingDecisionClaim
): Promise<{ refundRequestId: string | null }> {
  const booking = await loadDecisionBooking(supabase, input.bookingId);
  const hostRelation = firstRecord(booking.hosts);
  const familyId = input.familyId ?? asString(hostRelation?.legacy_family_id);
  const finalStatus = finalStatusForDecision(input.decision);
  let refundRequestId: string | null = claim.refundRequestId;

  await mirrorLegacyBookingStatus(supabase, booking, finalStatus);

  if (input.decision === "decline") {
    await cancelPendingPayouts(supabase, input.bookingId);
    refundRequestId = await ensureHostDeclineRefund(supabase, booking, input.actor.userId ?? null);
    await recordBookingInventoryTransition(supabase, {
      booking: { ...booking, status: "rejected", payment_status: "refund_pending" },
      eventType: "booking_cancelled",
      eventSource: `host_booking_decision:${input.source}`,
      actorUserId: input.actor.userId ?? null,
      actorRole: input.actor.role,
      payload: {
        decision: input.decision,
        source: input.source,
        idempotency_key: input.idempotencyKey,
      },
    });
    await releaseBookingCalendar(supabase, input.bookingId);
  }

  const updated = await applyHostBookingStatusUpdate(supabase, {
    bookingId: input.bookingId,
    familyId,
    hostId: input.hostId,
    status: finalStatus,
    previousStatus: claim.previousStatus,
    actorUserId: input.actor.userId ?? null,
    actorRole: input.actor.role,
    source: `host_booking_decision:${input.source}`,
    idempotencyKey: input.idempotencyKey,
  });
  if (!updated) throw new Error("Booking outcome reconciliation did not return the booking.");

  if (input.decision === "decline" && refundRequestId) {
    const guestUserId = asString(booking.user_id);
    const whatsappConfig = getWhatsAppRuntimeConfig();
    const eligibleGuestWhatsApp = guestUserId
      ? await resolveEligibleGuestWhatsApp(supabase, guestUserId)
      : null;
    if (guestUserId && eligibleGuestWhatsApp && whatsappConfig.templates.guestRefundInitiated) {
      await enqueueNotification(supabase, {
        eventType: "guest_refund_initiated",
        channel: "whatsapp",
        userId: guestUserId,
        bookingId: input.bookingId,
        dedupeKey: `guest_refund_initiated:${refundRequestId}:whatsapp`,
        subject: "Your Famlo refund has been initiated",
        recipientRole: "guest",
        recipientPhone: eligibleGuestWhatsApp.phoneE164,
        templateName: whatsappConfig.templates.guestRefundInitiated,
        payload: {
          message: "Your refund workflow has started. Famlo will keep you updated through your booking.",
        },
      });
    }
  }

  await enqueueNotification(supabase, {
    eventType: "booking_host_decision_recorded",
    channel: "email",
    userId: asString(hostRelation?.user_id),
    bookingId: input.bookingId,
    dedupeKey: `booking_host_decision_recorded:${input.bookingId}:${input.decision}:email`,
    subject: input.decision === "approve" ? "Famlo booking approved" : "Famlo booking declined",
    recipientRole: "host",
    payload: {
      message:
        input.decision === "approve"
          ? "Your booking approval was recorded and the guest was notified."
          : "Your booking decline was recorded and the guest refund workflow was started.",
    },
  });

  await syncBookingCalendarIndexBestEffort(
    supabase,
    input.bookingId,
    `host_booking_decision:${input.source}:${input.decision}`
  );

  return { refundRequestId };
}

function createSupabaseRuntime(supabase: SupabaseClient): HostBookingDecisionRuntime {
  return {
    async claim(input) {
      const { data, error } = await supabase.rpc("claim_host_booking_decision", {
        p_booking_id: input.bookingId,
        p_host_id: input.hostId,
        p_family_id: input.familyId ?? null,
        p_decision: input.decision,
        p_source: input.source,
        p_actor_user_id: input.actor.userId ?? null,
        p_actor_role: input.actor.role,
        p_idempotency_key: input.idempotencyKey,
      });
      if (error) throw error;
      const row = firstRecord(data);
      if (!row) throw new Error("Host booking decision claim returned no result.");
      return {
        outcome: String(row.outcome ?? "invalid_state") as HostBookingDecisionClaim["outcome"],
        decisionId: asString(row.decision_id),
        previousStatus: asString(row.previous_status),
        bookingStatus: asString(row.booking_status),
        refundRequestId: asString(row.refund_request_id),
      };
    },
    reconcile(input, claim) {
      return reconcileDecision(supabase, input, claim);
    },
    async complete(decisionId, refundRequestId) {
      const now = new Date().toISOString();
      const { error } = await supabase
        .from("host_booking_decisions")
        .update({
          status: "completed",
          refund_request_id: refundRequestId,
          completed_at: now,
          lease_expires_at: null,
          last_error: null,
          updated_at: now,
        } as never)
        .eq("id", decisionId)
        .eq("status", "processing");
      if (error) throw error;
    },
    async fail(decisionId, error) {
      const now = new Date().toISOString();
      const { error: updateError } = await supabase
        .from("host_booking_decisions")
        .update({
          status: "failed",
          lease_expires_at: null,
          last_error: error instanceof Error ? error.message : "Unknown booking decision error.",
          updated_at: now,
        } as never)
        .eq("id", decisionId)
        .eq("status", "processing");
      if (updateError) console.error("[host-booking-decision] failed to store retry state", updateError);
    },
  };
}

export async function applyHostBookingDecision(
  supabase: SupabaseClient,
  input: HostBookingDecisionInput
): Promise<HostBookingDecisionResult> {
  return executeHostBookingDecision(createSupabaseRuntime(supabase), input);
}
