import { NextRequest, NextResponse } from "next/server";

import { createHostBookingActionLinks } from "@/lib/booking-action-tokens";
import {
  buildHostApprovalWhatsAppMessage,
  createOrReuseBookingWhatsAppAction,
} from "@/lib/booking-whatsapp-actions";
import { getErrorDiagnostics, getErrorMessage } from "@/lib/error-utils";
import { appendPaymentEventAudit } from "@/lib/finance/payment-audit";
import { buildBookingReceiptDocument, enqueueNotification } from "@/lib/booking-platform";
import {
  finalizeCapturedBookingPayment,
  loadBookingForPaymentFinalization,
  markBookingPaymentInventoryConflict,
} from "@/lib/payment-booking-finalization";
import { fetchRazorpayPayment, verifyRazorpayPaymentSignature } from "@/lib/razorpay";
import { syncReservationFromBooking } from "@/lib/reservations";
import { createAdminSupabaseClient } from "@/lib/supabase";
import { loadUserProfileCompatibility } from "@/lib/user-profile";

type VerifyBody = {
  bookingId?: string;
  paymentRowId?: string;
  razorpay_order_id?: string;
  razorpay_payment_id?: string;
  razorpay_signature?: string;
};

const HOST_APPROVAL_WHATSAPP_TEMPLATE_LANGUAGE =
  process.env.WHATSAPP_HOST_APPROVAL_TEMPLATE_LANGUAGE?.trim() || "en_US";

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function resolveStayUnitId(record: Record<string, unknown> | null | undefined): string | null {
  const direct = asString(record?.stay_unit_id);
  if (direct) {
    return direct;
  }

  const snapshot =
    record && typeof record === "object"
      ? ((record.pricing_snapshot as Record<string, unknown> | null) ?? null)
      : null;

  return asString(snapshot?.stay_unit_id);
}

function formatBookingDateRange(startDate: string | null, endDate: string | null): string {
  if (!startDate) return "the selected dates";
  if (!endDate || endDate === startDate) return startDate;
  return `${startDate} to ${endDate}`;
}

function formatTemplateAmount(value: number): string {
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

function isSchemaCompatibilityError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("column") ||
    lower.includes("schema cache") ||
    lower.includes("does not exist") ||
    lower.includes("relation")
  );
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = (await req.json()) as VerifyBody;
    const bookingId = String(body.bookingId ?? "").trim();
    const paymentRowId = String(body.paymentRowId ?? "").trim();
    const orderId = String(body.razorpay_order_id ?? "").trim();
    const gatewayPaymentId = String(body.razorpay_payment_id ?? "").trim();
    const signature = String(body.razorpay_signature ?? "").trim();

    if (!bookingId || !orderId || !gatewayPaymentId || !signature) {
      return NextResponse.json({ error: "Missing required Razorpay verification fields." }, { status: 400 });
    }

    const isValid = verifyRazorpayPaymentSignature({
      orderId,
      paymentId: gatewayPaymentId,
      signature,
    });

    if (!isValid) {
      return NextResponse.json({ error: "Invalid Razorpay payment signature." }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();
    console.info("[payments.verify] start", {
      bookingId,
      paymentRowId: paymentRowId || null,
      orderId,
      gatewayPaymentId,
    });

    const paymentLookup = paymentRowId
      ? await supabase
          .from("payments_v2")
          .select("id,booking_id,status,raw_response,amount_total,tax_amount,currency")
          .eq("id", paymentRowId)
          .maybeSingle()
      : await supabase
          .from("payments_v2")
          .select("id,booking_id,status,raw_response,amount_total,tax_amount,currency")
          .eq("booking_id", bookingId)
          .eq("gateway_order_id", orderId)
          .maybeSingle();

    if (paymentLookup.error) {
      throw paymentLookup.error;
    }

    const payment = paymentLookup.data;
    if (!payment) {
      return NextResponse.json({ error: "Payment record not found." }, { status: 404 });
    }

    const now = new Date().toISOString();
    const providerPayment = await fetchRazorpayPayment(gatewayPaymentId);
    if (providerPayment.order_id && providerPayment.order_id !== orderId) {
      return NextResponse.json({ error: "Razorpay order mismatch for this payment." }, { status: 409 });
    }

    const booking = await loadBookingForPaymentFinalization(supabase, payment.booking_id);
    const stayUnitId = resolveStayUnitId(booking as Record<string, unknown> | null | undefined);
    const stayUnitName =
      stayUnitId
        ? await (async () => {
            const stayUnitLookup = await supabase
              .from("stay_units_v2")
              .select("name")
              .eq("id", stayUnitId)
              .maybeSingle();
            if (stayUnitLookup.error) {
              console.error("[payments.verify] stay unit lookup failed:", stayUnitLookup.error);
              return null;
            }
            return asString(stayUnitLookup.data?.name);
          })()
        : null;
    const bookingDateLabel = formatBookingDateRange(
      asString(booking?.start_date),
      asString(booking?.end_date) ?? asString(booking?.start_date)
    );

    const bookingStatus = String(booking?.status ?? "").trim().toLowerCase();
    const bookingPaymentStatus = String(booking?.payment_status ?? "").trim().toLowerCase();
    if (bookingStatus === "rejected" && bookingPaymentStatus === "refund_pending") {
      return NextResponse.json(
        { error: "Payment was captured, but this slot is no longer available. Booking moved to refund pending." },
        { status: 409 }
      );
    }

    let finalizationResult;
    try {
      finalizationResult = await finalizeCapturedBookingPayment(supabase, {
        payment,
        booking: booking as Record<string, unknown> | null | undefined,
        gatewayOrderId: orderId,
        gatewayPaymentId,
        providerPaymentStatus: providerPayment.status,
        providerAmountPaise: providerPayment.amount,
        paidAt: now,
        source: "payments.verify",
        providerEventName: "client.verify.paid",
        rawResponsePatch: {
          razorpay_signature: signature,
          verification_source: "client_callback",
          verified_at: now,
          provider_payment_status: providerPayment.status,
          provider_payment_amount_paise: providerPayment.amount,
          provider_order_id: providerPayment.order_id ?? null,
        },
      });
    } catch (error) {
      await markBookingPaymentInventoryConflict(supabase, {
        booking: booking as Record<string, unknown> | null | undefined,
        paymentId: payment.id,
        provider: "razorpay",
        reason: "inventory_conflict_after_payment",
      });
      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? `${error.message} Payment was captured, so this booking is now in refund pending review.`
              : "Payment was captured, but this slot is no longer available. Booking moved to refund pending.",
        },
        { status: 409 }
      );
    }

    if (finalizationResult.decision === "reject_amount_mismatch") {
      return NextResponse.json({ error: "Captured Razorpay amount does not match internal guest payable amount." }, { status: 409 });
    }
    if (finalizationResult.decision === "ignore_not_captured") {
      return NextResponse.json({ error: "Razorpay payment is not captured yet." }, { status: 409 });
    }
    if (finalizationResult.decision === "reject_invalid_ids") {
      return NextResponse.json({ error: "Missing or malformed Razorpay payment identifiers." }, { status: 400 });
    }

    const approvalRequired = finalizationResult.approvalRequired;
    const nextStatus = finalizationResult.nextStatus;
    const payoutId = finalizationResult.payoutId;
    const finalizedBooking = (finalizationResult.booking ?? booking) as Record<string, unknown> | null | undefined;
    const hostProfileForFlow = Array.isArray(finalizedBooking?.hosts) ? finalizedBooking.hosts[0] : finalizedBooking?.hosts;
    const hostProfile = hostProfileForFlow;
    const hostLegacyFamilyIdForLog =
      typeof hostProfile?.legacy_family_id === "string" && hostProfile.legacy_family_id.trim().length > 0
        ? hostProfile.legacy_family_id
        : null;
    console.info("[payment-finalization]", {
      source: "payments.verify",
      approvalRequired,
      bookingId: payment.booking_id,
      hostId: typeof finalizedBooking?.host_id === "string" ? finalizedBooking.host_id : null,
      legacyFamilyId: hostLegacyFamilyIdForLog,
      nextStatus,
      decision: finalizationResult.decision,
    });

    await appendPaymentEventAudit(supabase, {
      paymentId: payment.id,
      provider: "razorpay",
      eventName: "client.verify.paid",
      providerEventId: gatewayPaymentId,
      idempotencyKey: `payment_verify:${orderId}:${gatewayPaymentId}`,
      payload: {
        bookingId,
        paymentRowId: payment.id,
        orderId,
        gatewayPaymentId,
      },
      processingStatus: "processed",
    });

    if (!finalizationResult.finalizedNow) {
      return NextResponse.json({
        success: true,
        bookingId: payment.booking_id,
        paymentId: payment.id,
        idempotentReplay: true,
      });
    }

    const conversationId = typeof finalizedBooking?.conversation_id === "string" ? finalizedBooking.conversation_id : null;
    const guestUserId = typeof finalizedBooking?.user_id === "string" ? finalizedBooking.user_id : null;
    const legacyBookingId =
      typeof finalizedBooking?.legacy_booking_id === "string" && finalizedBooking.legacy_booking_id.trim().length > 0
        ? finalizedBooking.legacy_booking_id
        : null;

    try {
      const receipt = await buildBookingReceiptDocument(supabase, payment.booking_id);
      await supabase.from("document_exports").insert({
        document_type: "guest_receipt",
        booking_id: payment.booking_id,
        owner_user_id: guestUserId,
        access_scope: "guest",
        payload: receipt.payload,
      });
    } catch (documentError) {
      console.error("[payments.verify] booking receipt generation failed:", documentError);
    }

    await enqueueNotification(supabase, {
      eventType: approvalRequired ? "booking_request" : "booking_confirmed",
      channel: "email",
      userId: guestUserId,
      bookingId: payment.booking_id,
      dedupeKey: `${approvalRequired ? "booking_request" : "booking_confirmed"}:${payment.booking_id}`,
      subject: approvalRequired ? "Your Famlo booking is awaiting host approval" : "Your Famlo booking is confirmed",
      payload: {
        to: guestUserId ? undefined : undefined,
        message: approvalRequired
          ? "Your payment was received and your Famlo booking is pending host approval."
          : "Your payment was received and your Famlo booking is now confirmed.",
      },
    });
    await enqueueNotification(supabase, {
      eventType: approvalRequired ? "booking_request" : "booking_confirmed",
      channel: "whatsapp",
      userId: guestUserId,
      bookingId: payment.booking_id,
      dedupeKey: `${approvalRequired ? "booking_request" : "booking_confirmed"}:${payment.booking_id}:whatsapp`,
      subject: approvalRequired ? "Your Famlo booking is awaiting host approval" : "Your Famlo booking is confirmed",
      templateName: approvalRequired ? "guest_booking_request_received" : "guest_booking_confirmed",
      recipientRole: "guest",
      payload: {
        message: approvalRequired
          ? "Your payment was received and your Famlo booking is pending host approval."
          : "Your payment was received and your Famlo booking is now confirmed.",
      },
    });
    const hostUserId = typeof hostProfileForFlow?.user_id === "string" ? hostProfileForFlow.user_id : null;
    const guestProfile = guestUserId ? await loadUserProfileCompatibility(supabase, guestUserId) : null;
    const hostProfileContact = hostUserId ? await loadUserProfileCompatibility(supabase, hostUserId) : null;
    const hostPhone = hostProfileContact?.phone ?? null;
    const ownerName =
      typeof hostProfileContact?.name === "string" && hostProfileContact.name.trim().length > 0
        ? hostProfileContact.name.trim()
        : null;
    const hostPropertyLabel =
      typeof hostProfileForFlow?.display_name === "string" && hostProfileForFlow.display_name.trim().length > 0
        ? hostProfileForFlow.display_name.trim()
        : "your Famlo stay";
    const hostListingLabel =
      stayUnitName ??
      hostPropertyLabel;
    const approvalAmountLabel = formatTemplateAmount(
      typeof (payment as { amount_total?: number }).amount_total === "number"
        ? (payment as { amount_total?: number }).amount_total ?? 0
        : 0
    );
    const hostLegacyFamilyId =
      typeof hostProfileForFlow?.legacy_family_id === "string" && hostProfileForFlow.legacy_family_id.trim().length > 0
        ? hostProfileForFlow.legacy_family_id
        : null;
    const fallbackHostDashboardUrl = hostLegacyFamilyId
      ? `/partnerslogin/home/dashboard?family=${encodeURIComponent(hostLegacyFamilyId)}&tab=bookings`
      : "/partnerslogin/home/dashboard?tab=bookings";

    if (approvalRequired && hostUserId) {
      const whatsappAction = hostPhone
        ? await createOrReuseBookingWhatsAppAction(supabase, {
            bookingId: payment.booking_id,
            hostPhone,
            familyId: hostLegacyFamilyId,
          })
        : null;
      const actionLinks = await createHostBookingActionLinks(supabase, {
        bookingId: payment.booking_id,
        familyId: hostLegacyFamilyId,
          hostId: typeof finalizedBooking?.host_id === "string" ? finalizedBooking.host_id : null,
          hostUserId,
          metadata: {
            source: "payments_verify",
        },
      });

      await enqueueNotification(supabase, {
        eventType: "booking_host_action_required",
        channel: "email",
        userId: hostUserId,
        bookingId: payment.booking_id,
        dedupeKey: `booking_host_action_required:${payment.booking_id}:email`,
        subject: "New Famlo booking request needs your approval",
        templateName: "host_booking_approval_request",
        recipientRole: "host",
        payload: {
          title: "New Booking Request",
          message: `${hostListingLabel} has a paid booking request for ${bookingDateLabel}. Review it and accept or reject it soon.`,
          cta_label: "Review booking request",
          cta_url: actionLinks?.dashboardUrl ?? fallbackHostDashboardUrl,
          view_url: actionLinks?.dashboardUrl ?? fallbackHostDashboardUrl,
          accept_url: actionLinks?.acceptUrl,
          reject_url: actionLinks?.rejectUrl,
        },
      });

      await enqueueNotification(supabase, {
        eventType: "booking_host_action_required",
        channel: "whatsapp",
        userId: hostUserId,
        bookingId: payment.booking_id,
        dedupeKey: `booking_host_action_required:${payment.booking_id}:whatsapp`,
        subject: "New Famlo booking request needs your approval",
        templateName: "host_booking_approval_request",
        recipientRole: "host",
        recipientPhone: hostPhone,
        payload: {
          title: "New Booking Request",
          body_text:
            whatsappAction && hostPhone
              ? buildHostApprovalWhatsAppMessage({
                  guestName: guestProfile?.name ?? null,
                  propertyName: hostPropertyLabel,
                  roomName: stayUnitName ?? hostListingLabel,
                  startDate: asString(booking?.start_date),
                  endDate: asString(booking?.end_date) ?? asString(booking?.start_date),
                  amountTotal:
                    typeof (payment as { amount_total?: number }).amount_total === "number"
                      ? (payment as { amount_total?: number }).amount_total ?? 0
                      : 0,
                })
              : `${hostListingLabel} has a paid booking request for ${bookingDateLabel}. Review it and accept or reject it soon.`,
          message: `${hostListingLabel} has a paid booking request for ${bookingDateLabel}. Review it and accept or reject it soon.`,
          view_url: actionLinks?.dashboardUrl ?? fallbackHostDashboardUrl,
          accept_url: actionLinks?.acceptUrl,
          reject_url: actionLinks?.rejectUrl,
          action_token: whatsappAction?.action_token ?? null,
          template_language: HOST_APPROVAL_WHATSAPP_TEMPLATE_LANGUAGE,
          template_variables: [
            ownerName ?? hostPropertyLabel,
            guestProfile?.name ?? "Famlo guest",
            hostPropertyLabel,
            stayUnitName ?? hostListingLabel,
            bookingDateLabel,
            approvalAmountLabel,
          ],
          buttons:
            whatsappAction
              ? [
                  { id: whatsappAction.approve_payload, title: "Approve" },
                  { id: whatsappAction.reject_payload, title: "Reject" },
                ]
              : [],
        },
      });
    } else if (hostUserId) {
      await enqueueNotification(supabase, {
        eventType: "booking_confirmed",
        channel: "email",
        userId: hostUserId,
        bookingId: payment.booking_id,
        dedupeKey: `booking_confirmed:host:${payment.booking_id}:email`,
        subject: "Your room is booked on Famlo",
        payload: {
          title: "Room booked",
          message: `Congratulations. ${hostListingLabel} is booked for ${bookingDateLabel}.`,
          cta_label: "View booking",
          cta_url: fallbackHostDashboardUrl,
          view_url: fallbackHostDashboardUrl,
        },
      });

      await enqueueNotification(supabase, {
        eventType: "booking_confirmed",
        channel: "whatsapp",
        userId: hostUserId,
        bookingId: payment.booking_id,
        dedupeKey: `booking_confirmed:host:${payment.booking_id}:whatsapp`,
        subject: "Your room is booked on Famlo",
        recipientRole: "host",
        payload: {
          title: "Room booked",
          message: `Congratulations. ${hostListingLabel} is booked for ${bookingDateLabel}.`,
          view_url: fallbackHostDashboardUrl,
        },
      });
    }
    if (conversationId) {
      const familyLookup = hostLegacyFamilyId
        ? await (async () => {
            const fullResult = await supabase
              .from("families")
              .select("id,property_name,name,city,state,village,google_maps_link")
              .eq("id", hostLegacyFamilyId)
              .maybeSingle();

            if (!fullResult.error) return fullResult;
            if (!isSchemaCompatibilityError(fullResult.error.message)) return fullResult;

            return supabase
              .from("families")
              .select("id,name,city,state,village")
              .eq("id", hostLegacyFamilyId)
              .maybeSingle();
          })()
        : { data: null, error: null };

      if (familyLookup.error) {
        console.error("[payments.verify] family lookup failed:", familyLookup.error);
      }

      const family = (familyLookup.data as Record<string, unknown> | null) ?? null;

      const propertyName =
        (typeof family?.property_name === "string" && family.property_name.trim().length > 0
          ? family.property_name
          : typeof family?.name === "string" && family.name.trim().length > 0
            ? family.name
          : typeof hostProfileForFlow?.display_name === "string" && hostProfileForFlow.display_name.trim().length > 0
              ? hostProfileForFlow.display_name
              : "your Famlo stay");
      const roomLabel = stayUnitName ?? propertyName;

      const hostLocationLabel = [family?.village, family?.city, family?.state].filter(Boolean).join(", ");
      const hostMapsLink =
        typeof family?.google_maps_link === "string" && family.google_maps_link.trim().length > 0
          ? family.google_maps_link.trim()
          : null;

      const confirmationMessage = approvalRequired
        ? "Payment received. Your booking is waiting for host approval in Famlo."
        : "Payment received. This booking is now confirmed in Famlo.";
      const hostLocationMessage = approvalRequired
        ? "The host will review your booking and Famlo will share the next step here once it is approved."
        : hostMapsLink
          ? `Host location for ${propertyName}: ${hostLocationLabel || "Shared in maps"}.\nMap: ${hostMapsLink}\nEmergency: if you need urgent help during the stay, open Emergency Assistance from your booking card and Famlo will share your live location with the support team.`
          : `Your booking for ${propertyName} is confirmed. The host location will be shared here once it is available. If you need urgent help during the stay, use Emergency Assistance from your booking card.`;
      const hostBookingMessage = approvalRequired
        ? `${roomLabel} has a paid booking request for ${bookingDateLabel}. Review it in your Famlo dashboard and accept or reject it soon.`
        : `Congratulations. ${roomLabel} is booked for ${bookingDateLabel}.`;

      const { data: existingSystemMessages, error: existingMessagesError } = await supabase
        .from("messages")
        .select("id,text")
        .eq("conversation_id", conversationId)
        .eq("sender_type", "system")
        .in("text", [confirmationMessage, hostLocationMessage, hostBookingMessage]);

      if (existingMessagesError) {
        console.error("[payments.verify] existing system message lookup failed:", existingMessagesError);
      }

      const existingContents = new Set(
        ((existingSystemMessages ?? []) as Array<{ text?: string | null }>)
          .map((row) => (typeof row.text === "string" ? row.text : null))
          .filter(Boolean)
      );

      const pendingMessages = [
        {
          conversation_id: conversationId,
          booking_id: legacyBookingId ?? payment.booking_id,
          sender_id: null,
          receiver_id: guestUserId,
          sender_type: "system",
          text: confirmationMessage,
          created_at: now,
        },
        {
          conversation_id: conversationId,
          booking_id: legacyBookingId ?? payment.booking_id,
          sender_id: null,
          receiver_id: guestUserId,
          sender_type: "system",
          text: hostLocationMessage,
          created_at: now,
        },
        {
          conversation_id: conversationId,
          booking_id: legacyBookingId ?? payment.booking_id,
          sender_id: null,
          receiver_id: hostUserId,
          sender_type: "system",
          text: hostBookingMessage,
          created_at: now,
        },
      ].filter((message) => !existingContents.has(message.text));

      const { error: messageInsertError } =
        pendingMessages.length > 0 ? await supabase.from("messages").insert(pendingMessages as never) : { error: null };

      if (!messageInsertError) {
        console.info("[payments.verify] messages:inserted", {
          bookingId: payment.booking_id,
          legacyBookingId,
          conversationId,
          insertedCount: pendingMessages.length,
        });
        await supabase
          .from("conversations")
          .update({
            last_message: hostLocationMessage,
            last_message_at: now,
            guest_unread: 1,
            host_unread: 0,
          } as never)
          .eq("id", conversationId);
      }
    }

    console.info("[payments.verify] success", {
      bookingId: payment.booking_id,
      paymentId: payment.id,
      conversationId,
      guestUserId,
    });

    return NextResponse.json({
      success: true,
      paymentId: payment.id,
      bookingId: payment.booking_id,
      paymentStatus: "paid",
      bookingStatus: nextStatus,
    });
  } catch (error) {
    console.error("[api/payments/verify] failed", getErrorDiagnostics(error));
    return NextResponse.json(
      { error: getErrorMessage(error, "Failed to verify payment.") },
      { status: 500 }
    );
  }
}
