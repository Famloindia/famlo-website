import { randomBytes } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import { applyHostBookingStatusUpdate } from "@/lib/host-booking-status";
import { enqueueNotificationRecord } from "@/lib/notifications/enqueue";
import { loadUserProfileCompatibility } from "@/lib/user-profile";
import { asNumber, asString, type JsonRecord } from "@/lib/platform-utils";

const ACTION_TTL_MINUTES = Number(process.env.FAMLO_HOST_BOOKING_ACTION_TTL_MINUTES ?? "60");

export type BookingWhatsAppReplyAction = "approve" | "reject";

type BookingWhatsAppActionRow = JsonRecord & {
  id?: string | null;
  booking_id?: string | null;
  host_phone?: string | null;
  family_id?: string | null;
  action_token?: string | null;
  status?: string | null;
  approve_payload?: string | null;
  reject_payload?: string | null;
  whatsapp_message_id?: string | null;
  responded_whatsapp_message_id?: string | null;
  expires_at?: string | null;
  responded_at?: string | null;
  created_at?: string | null;
};

type BookingActionJobRow = JsonRecord & {
  id?: string | null;
  booking_id?: string | null;
  booking_whatsapp_action_id?: string | null;
  action_token?: string | null;
  requested_action?: string | null;
  status?: string | null;
  inbound_message_id?: string | null;
  inbound_phone?: string | null;
  error_message?: string | null;
  payload?: JsonRecord | null;
};

function normalizeWhatsAppPhone(value: string | null | undefined): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  if (digits.length < 10) return null;
  if (digits.length === 10) return `91${digits}`;
  return digits;
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

function isUniqueConstraintError(message: string): boolean {
  return message.toLowerCase().includes("duplicate key") || message.includes("booking_action_jobs_inbound_message_id_key");
}

function formatDateLabel(startDate: string | null, endDate: string | null): string {
  if (!startDate) return "Dates pending";
  if (!endDate || endDate === startDate) return startDate;
  return `${startDate} - ${endDate}`;
}

function formatCurrency(value: number): string {
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `INR ${value}`;
  }
}

export function buildBookingWhatsAppReplyPayload(
  action: BookingWhatsAppReplyAction,
  actionToken: string
): string {
  return `${action === "approve" ? "APPROVE_BOOKING" : "REJECT_BOOKING"}:${actionToken}`;
}

export function parseBookingWhatsAppReplyPayload(
  value: string | null | undefined
): { action: BookingWhatsAppReplyAction; actionToken: string } | null {
  const payload = asString(value);
  if (!payload) return null;

  const approvePrefix = "APPROVE_BOOKING:";
  const rejectPrefix = "REJECT_BOOKING:";
  if (payload.startsWith(approvePrefix)) {
    const actionToken = payload.slice(approvePrefix.length).trim();
    return actionToken ? { action: "approve", actionToken } : null;
  }
  if (payload.startsWith(rejectPrefix)) {
    const actionToken = payload.slice(rejectPrefix.length).trim();
    return actionToken ? { action: "reject", actionToken } : null;
  }
  return null;
}

export function buildHostApprovalWhatsAppMessage(input: {
  guestName?: string | null;
  propertyName?: string | null;
  roomName?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  amountTotal?: number;
}): string {
  const roomLabel = asString(input.roomName) ?? asString(input.propertyName) ?? "Famlo stay";
  const propertyLabel = asString(input.propertyName) ?? roomLabel;
  const guestName = asString(input.guestName) ?? "Famlo guest";
  const amount = formatCurrency(asNumber(input.amountTotal, 0));

  return [
    "New Famlo booking request",
    "",
    `Guest: ${guestName}`,
    `Home: ${propertyLabel}`,
    `Room: ${roomLabel}`,
    `Dates: ${formatDateLabel(asString(input.startDate), asString(input.endDate) ?? asString(input.startDate))}`,
    `Amount: ${amount}`,
    "",
    "Please approve or reject this booking.",
  ].join("\n");
}

export async function createOrReuseBookingWhatsAppAction(
  supabase: SupabaseClient,
  input: {
    bookingId: string;
    hostPhone: string;
    familyId?: string | null;
  }
): Promise<BookingWhatsAppActionRow | null> {
  const normalizedPhone = normalizeWhatsAppPhone(input.hostPhone);
  if (!normalizedPhone) {
    return null;
  }

  const now = new Date().toISOString();
  const existingLookup = await supabase
    .from("booking_whatsapp_actions")
    .select(
      "id,booking_id,host_phone,family_id,action_token,status,approve_payload,reject_payload,whatsapp_message_id,responded_whatsapp_message_id,expires_at,responded_at,created_at"
    )
    .eq("booking_id", input.bookingId)
    .eq("host_phone", normalizedPhone)
    .eq("status", "pending")
    .gte("expires_at", now)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!existingLookup.error && existingLookup.data) {
    return existingLookup.data as BookingWhatsAppActionRow;
  }

  if (existingLookup.error && !isSchemaCompatibilityError(existingLookup.error.message)) {
    throw existingLookup.error;
  }

  const actionToken = randomBytes(18).toString("hex");
  const approvePayload = buildBookingWhatsAppReplyPayload("approve", actionToken);
  const rejectPayload = buildBookingWhatsAppReplyPayload("reject", actionToken);
  const expiresAt = new Date(Date.now() + ACTION_TTL_MINUTES * 60_000).toISOString();

  const insertResult = await supabase
    .from("booking_whatsapp_actions")
    .insert({
      booking_id: input.bookingId,
      host_phone: normalizedPhone,
      family_id: input.familyId ?? null,
      action_token: actionToken,
      approve_payload: approvePayload,
      reject_payload: rejectPayload,
      expires_at: expiresAt,
    } as never)
    .select(
      "id,booking_id,host_phone,family_id,action_token,status,approve_payload,reject_payload,whatsapp_message_id,responded_whatsapp_message_id,expires_at,responded_at,created_at"
    )
    .maybeSingle();

  if (insertResult.error) {
    if (isSchemaCompatibilityError(insertResult.error.message)) {
      return null;
    }
    throw insertResult.error;
  }

  return (insertResult.data as BookingWhatsAppActionRow | null) ?? null;
}

export async function loadBookingWhatsAppActionByToken(
  supabase: SupabaseClient,
  actionToken: string
): Promise<BookingWhatsAppActionRow | null> {
  const { data, error } = await supabase
    .from("booking_whatsapp_actions")
    .select(
      "id,booking_id,host_phone,family_id,action_token,status,approve_payload,reject_payload,whatsapp_message_id,responded_whatsapp_message_id,expires_at,responded_at,created_at"
    )
    .eq("action_token", actionToken)
    .maybeSingle();

  if (error) {
    if (isSchemaCompatibilityError(error.message)) {
      return null;
    }
    throw error;
  }

  return (data as BookingWhatsAppActionRow | null) ?? null;
}

export async function attachBookingWhatsAppMessageId(
  supabase: SupabaseClient,
  input: {
    actionToken: string;
    providerMessageId: string;
  }
): Promise<void> {
  const { error } = await supabase
    .from("booking_whatsapp_actions")
    .update({
      whatsapp_message_id: input.providerMessageId,
    } as never)
    .eq("action_token", input.actionToken)
    .is("whatsapp_message_id", null);

  if (error && !isSchemaCompatibilityError(error.message)) {
    throw error;
  }
}

export async function queueBookingActionJob(
  supabase: SupabaseClient,
  input: {
    bookingId: string | null;
    bookingWhatsAppActionId: string | null;
    actionToken: string;
    requestedAction: BookingWhatsAppReplyAction;
    inboundMessageId: string;
    inboundPhone?: string | null;
    payload?: JsonRecord;
    status?: "pending" | "ignored";
    errorMessage?: string | null;
  }
): Promise<"queued" | "duplicate"> {
  const result = await supabase.from("booking_action_jobs").insert({
    booking_id: input.bookingId,
    booking_whatsapp_action_id: input.bookingWhatsAppActionId,
    action_token: input.actionToken,
    requested_action: input.requestedAction,
    status: input.status ?? "pending",
    inbound_message_id: input.inboundMessageId,
    inbound_phone: normalizeWhatsAppPhone(input.inboundPhone ?? null),
    error_message: input.errorMessage ?? null,
    payload: input.payload ?? {},
  } as never);

  if (!result.error) {
    return "queued";
  }

  if (isUniqueConstraintError(result.error.message)) {
    return "duplicate";
  }

  throw result.error;
}

async function updateActionRow(
  supabase: SupabaseClient,
  actionId: string,
  patch: Record<string, unknown>
): Promise<void> {
  const { error } = await supabase
    .from("booking_whatsapp_actions")
    .update(patch as never)
    .eq("id", actionId);

  if (error) {
    throw error;
  }
}

async function updateActionJobRow(
  supabase: SupabaseClient,
  jobId: string,
  patch: Record<string, unknown>
): Promise<void> {
  const { error } = await supabase
    .from("booking_action_jobs")
    .update(patch as never)
    .eq("id", jobId);

  if (error) {
    throw error;
  }
}

async function enqueueDirectNotification(
  supabase: SupabaseClient,
  input: {
    eventType: string;
    channel: "email" | "whatsapp";
    userId?: string | null;
    recipientPhone?: string | null;
    bookingId?: string | null;
    dedupeKey: string;
    subject: string;
    templateName?: string | null;
    recipientRole?: "host" | "guest" | "admin" | "system" | null;
    payload: JsonRecord;
  }
): Promise<void> {
  await enqueueNotificationRecord(supabase, {
    eventType: input.eventType,
    channel: input.channel,
    userId: input.userId ?? null,
    bookingId: input.bookingId ?? null,
    dedupeKey: input.dedupeKey,
    subject: input.subject,
    templateName: input.templateName ?? null,
    recipientRole: input.recipientRole ?? null,
    recipientPhone: input.recipientPhone ?? null,
    payload: input.payload,
  });
}

async function resolveBookingContext(
  supabase: SupabaseClient,
  bookingId: string
): Promise<{
  booking: JsonRecord | null;
  hostUserId: string | null;
  hostId: string | null;
  familyId: string | null;
  guestUserId: string | null;
  guestPhone: string | null;
}> {
  const { data, error } = await supabase
    .from("bookings_v2")
    .select("id,status,payment_status,payment_id,legacy_booking_id,host_id,user_id,pricing_snapshot,partner_payout_amount,hosts(user_id,legacy_family_id,display_name)")
    .eq("id", bookingId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  const booking = (data as JsonRecord | null) ?? null;
  const hostRelation = Array.isArray(booking?.hosts) ? booking.hosts[0] : booking?.hosts;
  const hostUserId = asString((hostRelation as JsonRecord | null)?.user_id);
  const guestUserId = asString(booking?.user_id);
  const guestProfile = guestUserId ? await loadUserProfileCompatibility(supabase, guestUserId) : null;

  return {
    booking,
    hostUserId,
    hostId: asString(booking?.host_id),
    familyId: asString((hostRelation as JsonRecord | null)?.legacy_family_id),
    guestUserId,
    guestPhone: asString(guestProfile?.phone),
  };
}

async function markBookingRefundPending(
  supabase: SupabaseClient,
  booking: JsonRecord,
  now: string
): Promise<void> {
  const bookingId = asString(booking.id);
  const paymentId = asString(booking.payment_id);
  const legacyBookingId = asString(booking.legacy_booking_id);
  if (!bookingId) {
    return;
  }

  const { error: bookingError } = await supabase
    .from("bookings_v2")
    .update({
      payment_status: "refund_pending",
      updated_at: now,
    } as never)
    .eq("id", bookingId);

  if (bookingError) {
    throw bookingError;
  }

  if (legacyBookingId) {
    const { error: legacyBookingError } = await supabase
      .from("bookings")
      .update({
        status: "rejected",
        updated_at: now,
      } as never)
      .eq("id", legacyBookingId);

    if (legacyBookingError && !isSchemaCompatibilityError(legacyBookingError.message)) {
      throw legacyBookingError;
    }
  }

  if (!paymentId) {
    return;
  }

  const { error: paymentError } = await supabase
    .from("payments_v2")
    .update({
      refund_status: "pending",
    } as never)
    .eq("id", paymentId);

  if (paymentError) {
    throw paymentError;
  }

}

async function applyResolvedBookingStatus(
  supabase: SupabaseClient,
  input: {
    bookingId: string;
    familyId?: string | null;
    hostId?: string | null;
    nextStatus: "confirmed" | "rejected";
    skipGuestNotifications?: boolean;
  }
): Promise<JsonRecord | null> {
  return applyHostBookingStatusUpdate(supabase, {
    bookingId: input.bookingId,
    familyId: input.familyId ?? null,
    hostId: input.hostId ?? null,
    status: input.nextStatus,
    skipGuestNotifications: input.skipGuestNotifications ?? false,
  });
}

async function loadPendingBookingActionJobs(
  supabase: SupabaseClient
): Promise<BookingActionJobRow[]> {
  const { data, error } = await supabase
    .from("booking_action_jobs")
    .select("id,booking_id,booking_whatsapp_action_id,action_token,requested_action,status,inbound_message_id,inbound_phone,error_message,payload")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(50);

  if (error) {
    if (isSchemaCompatibilityError(error.message)) {
      return [];
    }
    throw error;
  }

  return (data as BookingActionJobRow[] | null) ?? [];
}

async function enqueueHostResolutionMessage(
  supabase: SupabaseClient,
  input: {
    bookingId: string;
    hostUserId: string | null;
    hostPhone: string | null;
    action: BookingWhatsAppReplyAction;
  }
): Promise<void> {
  const message =
    input.action === "approve"
      ? "Famlo update: this booking has been approved. The guest has been notified."
      : "Famlo update: this booking has been rejected. The guest has been notified and the refund is now pending review.";

  await enqueueDirectNotification(supabase, {
    eventType: "booking_host_action_resolved",
    channel: "whatsapp",
    userId: input.hostUserId,
    recipientPhone: input.hostPhone,
    bookingId: input.bookingId,
    dedupeKey: `booking_host_action_resolved:${input.bookingId}:${input.action}`,
    subject: "Famlo booking action processed",
    recipientRole: "host",
    payload: {
      message,
    },
  });
}

async function enqueueIgnoredHostMessage(
  supabase: SupabaseClient,
  input: {
    bookingId?: string | null;
    hostPhone: string | null;
    hostUserId?: string | null;
    reason: "expired" | "already_resolved" | "phone_mismatch";
    actionToken: string;
  }
): Promise<void> {
  const message =
    input.reason === "expired"
      ? "This Famlo booking approval request has expired, so no action was taken."
      : input.reason === "phone_mismatch"
        ? "This Famlo booking action could not be matched to the expected host account."
        : "This Famlo booking request was already handled earlier, so no further action was taken.";

  await enqueueDirectNotification(supabase, {
    eventType: "booking_host_action_ignored",
    channel: "whatsapp",
    userId: input.hostUserId ?? null,
    recipientPhone: input.hostPhone,
    bookingId: input.bookingId ?? null,
    dedupeKey: `booking_host_action_ignored:${input.actionToken}:${input.reason}`,
    subject: "Famlo booking action ignored",
    recipientRole: "host",
    payload: {
      message,
    },
  });
}

export async function processBookingActionJobBatch(
  supabase: SupabaseClient
): Promise<{ processed: number; failed: number; ignored: number }> {
  const jobs = await loadPendingBookingActionJobs(supabase);
  let processed = 0;
  let failed = 0;
  let ignored = 0;

  for (const job of jobs) {
    const jobId = asString(job.id);
    const actionToken = asString(job.action_token);
    const requestedAction = asString(job.requested_action) as BookingWhatsAppReplyAction | null;
    if (!jobId || !actionToken || !requestedAction) {
      continue;
    }

    try {
      const action = await loadBookingWhatsAppActionByToken(supabase, actionToken);
      if (!action) {
        await updateActionJobRow(supabase, jobId, {
          status: "failed",
          error_message: "Booking WhatsApp action not found.",
          processed_at: new Date().toISOString(),
        });
        failed += 1;
        continue;
      }

      const actionId = asString(action.id);
      const bookingId = asString(action.booking_id);
      const hostPhone = normalizeWhatsAppPhone(asString(action.host_phone));
      const inboundPhone = normalizeWhatsAppPhone(asString(job.inbound_phone));
      const actionStatus = asString(action.status) ?? "pending";
      const expiresAt = asString(action.expires_at) ?? "";
      const now = new Date().toISOString();

      if (!actionId || !bookingId) {
        await updateActionJobRow(supabase, jobId, {
          status: "failed",
          error_message: "Booking WhatsApp action is incomplete.",
          processed_at: now,
        });
        failed += 1;
        continue;
      }

      if (hostPhone && inboundPhone && hostPhone !== inboundPhone) {
        await updateActionJobRow(supabase, jobId, {
          status: "ignored",
          error_message: "Incoming phone does not match the expected host phone.",
          processed_at: now,
        });
        await enqueueIgnoredHostMessage(supabase, {
          bookingId,
          hostPhone,
          reason: "phone_mismatch",
          actionToken,
        });
        ignored += 1;
        continue;
      }

      if (actionStatus !== "pending") {
        await updateActionJobRow(supabase, jobId, {
          status: "ignored",
          error_message: "This booking action was already processed earlier.",
          processed_at: now,
        });
        await enqueueIgnoredHostMessage(supabase, {
          bookingId,
          hostPhone,
          reason: "already_resolved",
          actionToken,
        });
        ignored += 1;
        continue;
      }

      if (expiresAt < now) {
        await updateActionRow(supabase, actionId, {
          status: "expired",
        });
        await updateActionJobRow(supabase, jobId, {
          status: "ignored",
          error_message: "This booking action expired before it was processed.",
          processed_at: now,
        });
        await enqueueIgnoredHostMessage(supabase, {
          bookingId,
          hostPhone,
          reason: "expired",
          actionToken,
        });
        ignored += 1;
        continue;
      }

      const context = await resolveBookingContext(supabase, bookingId);
      if (!context.booking) {
        await updateActionJobRow(supabase, jobId, {
          status: "failed",
          error_message: "Booking not found while processing host action.",
          processed_at: now,
        });
        failed += 1;
        continue;
      }

      const currentStatus = asString(context.booking.status) ?? "pending";
      if (currentStatus !== "pending" && currentStatus !== "pending_host_approval") {
        await updateActionJobRow(supabase, jobId, {
          status: "ignored",
          error_message: `Booking is already in status ${currentStatus}.`,
          processed_at: now,
        });
        await enqueueIgnoredHostMessage(supabase, {
          bookingId,
          hostPhone,
          hostUserId: context.hostUserId,
          reason: "already_resolved",
          actionToken,
        });
        ignored += 1;
        continue;
      }

      await updateActionRow(supabase, actionId, {
        status: requestedAction === "approve" ? "approved" : "rejected",
        responded_at: now,
        responded_whatsapp_message_id: asString(job.inbound_message_id),
      });

      if (requestedAction === "approve") {
        await applyResolvedBookingStatus(supabase, {
          bookingId,
          familyId: asString(action.family_id) ?? context.familyId,
          hostId: context.hostId,
          nextStatus: "confirmed",
        });
      } else {
        await applyResolvedBookingStatus(supabase, {
          bookingId,
          familyId: asString(action.family_id) ?? context.familyId,
          hostId: context.hostId,
          nextStatus: "rejected",
          skipGuestNotifications: true,
        });
        await markBookingRefundPending(supabase, context.booking, now);

        await enqueueDirectNotification(supabase, {
          eventType: "booking_refund_pending",
          channel: "whatsapp",
          userId: context.guestUserId,
          recipientPhone: context.guestPhone,
          bookingId,
          dedupeKey: `booking_refund_pending:${bookingId}:guest:whatsapp`,
          subject: "Your Famlo booking could not be approved",
          templateName: "guest_booking_refund_pending",
          recipientRole: "guest",
          payload: {
            message:
              "Hi, your Famlo booking could not be approved by the host at this time.\n\nYour payment refund has been initiated and will be processed within 2–4 working days.\n\nThanks for being with Famlo.",
          },
        });
      }

      await enqueueHostResolutionMessage(supabase, {
        bookingId,
        hostUserId: context.hostUserId,
        hostPhone,
        action: requestedAction,
      });

      await updateActionJobRow(supabase, jobId, {
        status: "processed",
        error_message: null,
        processed_at: now,
      });
      processed += 1;
    } catch (error) {
      await updateActionJobRow(supabase, jobId, {
        status: "failed",
        error_message: error instanceof Error ? error.message : "Unknown booking action processing error.",
        processed_at: new Date().toISOString(),
      });
      failed += 1;
    }
  }

  return { processed, failed, ignored };
}
