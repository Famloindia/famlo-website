import { NextRequest, NextResponse } from "next/server";

import { getErrorDiagnostics, getErrorMessage } from "@/lib/error-utils";
import { appendPaymentEventAudit } from "@/lib/finance/payment-audit";
import { appendLedgerEntryIfMissing, ensureScheduledPayout } from "@/lib/finance/runtime";
import { buildBookingReceiptDocument, enqueueNotification } from "@/lib/booking-platform";
import {
  assertBookingCanFinalizePayment,
  loadBookingForPaymentFinalization,
  markBookingPaymentInventoryConflict,
  resolveBookingApprovalRequirement,
} from "@/lib/payment-booking-finalization";
import { verifyRazorpayPaymentSignature } from "@/lib/razorpay";
import { createAdminSupabaseClient } from "@/lib/supabase";

type VerifyBody = {
  bookingId?: string;
  paymentRowId?: string;
  razorpay_order_id?: string;
  razorpay_payment_id?: string;
  razorpay_signature?: string;
};

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
          .select("id,booking_id,status,raw_response")
          .eq("id", paymentRowId)
          .maybeSingle()
      : await supabase
          .from("payments_v2")
          .select("id,booking_id,status,raw_response")
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
    const { error: paymentUpdateError } = await supabase
      .from("payments_v2")
      .update({
        gateway: "razorpay",
        gateway_order_id: orderId,
        gateway_payment_id: gatewayPaymentId,
        status: "paid",
        paid_at: now,
        raw_response: {
          ...((payment.raw_response as Record<string, unknown> | null) ?? {}),
          razorpay_signature: signature,
          verification_source: "client_callback",
          verified_at: now,
        },
      } as never)
      .eq("id", payment.id);

    if (paymentUpdateError) {
      throw paymentUpdateError;
    }

    const booking = await loadBookingForPaymentFinalization(supabase, payment.booking_id);

    const bookingStatus = String(booking?.status ?? "").trim().toLowerCase();
    const bookingPaymentStatus = String(booking?.payment_status ?? "").trim().toLowerCase();
    if (bookingStatus === "rejected" && bookingPaymentStatus === "refund_pending") {
      return NextResponse.json(
        { error: "Payment was captured, but this slot is no longer available. Booking moved to refund pending." },
        { status: 409 }
      );
    }

    try {
      await assertBookingCanFinalizePayment(supabase, {
        bookingId: payment.booking_id,
        paymentId: payment.id,
        paidAt: now,
        booking: booking as Record<string, unknown> | null | undefined,
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

    const approvalRequired = await resolveBookingApprovalRequirement(supabase, booking as Record<string, unknown> | null | undefined);
    const nextStatus = approvalRequired ? "pending" : "confirmed";
    const { error: bookingUpdateError } = await supabase
      .from("bookings_v2")
      .update({
        payment_status: "paid",
        payment_id: payment.id,
        status: nextStatus,
        hold_expires_at: null,
        updated_at: now,
      } as never)
      .eq("id", payment.booking_id);

    if (bookingUpdateError) {
      throw bookingUpdateError;
    }

    const legacyBookingId =
      typeof booking?.legacy_booking_id === "string" && booking.legacy_booking_id.trim().length > 0
        ? booking.legacy_booking_id
        : null;

    if (legacyBookingId) {
      const { error: legacyBookingUpdateError } = await supabase
        .from("bookings")
        .update({
          status: nextStatus,
          updated_at: now,
        } as never)
        .eq("id", legacyBookingId);

      if (legacyBookingUpdateError) {
        console.error("[payments.verify] legacy booking status update failed:", legacyBookingUpdateError);
      }
    }

    await supabase.from("booking_status_history_v2").insert({
      booking_id: payment.booking_id,
      old_status: booking?.status ?? null,
      new_status: nextStatus,
      changed_by_user_id: null,
      reason: "payment_verified",
      created_at: now,
    } as never);

    await appendLedgerEntryIfMissing(supabase, {
      bookingId: payment.booking_id,
      paymentId: payment.id,
      entryType: "payment_captured",
      accountCode: "cash_gateway_clearing",
      direction: "debit",
      amount:
        typeof (payment as { amount_total?: number }).amount_total === "number"
          ? (payment as { amount_total?: number }).amount_total ?? 0
          : 0,
      referenceType: "payment_verify",
      referenceId: `${orderId}:${gatewayPaymentId}`,
      metadata: {
        provider: "razorpay",
      },
    });

    await appendLedgerEntryIfMissing(supabase, {
      bookingId: payment.booking_id,
      paymentId: payment.id,
      entryType: "tax_liability",
      accountCode: "tax_output_payable",
      direction: "credit",
      amount:
        typeof (payment as { tax_amount?: number }).tax_amount === "number"
          ? (payment as { tax_amount?: number }).tax_amount ?? 0
          : 0,
      referenceType: "payment_verify",
      referenceId: `tax:${orderId}:${gatewayPaymentId}`,
      metadata: {
        provider: "razorpay",
      },
    });

    const hommieRelation = Array.isArray(booking?.hommie_profiles_v2)
      ? booking.hommie_profiles_v2[0]
      : booking?.hommie_profiles_v2;
    const hostProfile = Array.isArray(booking?.hosts) ? booking.hosts[0] : booking?.hosts;

    let payoutId: string | null = null;
    if (!approvalRequired) {
      payoutId =
        booking?.recipient_type === "host" && booking.host_id && hostProfile?.user_id
          ? await ensureScheduledPayout(supabase, {
              bookingId: payment.booking_id,
              paymentId: payment.id,
              partnerType: "host",
              partnerUserId: String(hostProfile.user_id),
              partnerProfileId: String(booking.host_id),
              amount:
                typeof booking.partner_payout_amount === "number"
                  ? booking.partner_payout_amount
                  : Number(booking.partner_payout_amount ?? 0),
              pricingSnapshot: (booking.pricing_snapshot as Record<string, unknown> | null) ?? {},
              paymentTaxAmount:
                typeof (payment as { tax_amount?: number }).tax_amount === "number"
                  ? (payment as { tax_amount?: number }).tax_amount ?? 0
                  : 0,
            })
          : booking?.recipient_type === "hommie" && booking.hommie_id && hommieRelation?.user_id
            ? await ensureScheduledPayout(supabase, {
                bookingId: payment.booking_id,
                paymentId: payment.id,
                partnerType: "hommie",
                partnerUserId: String(hommieRelation.user_id),
                partnerProfileId: String(booking.hommie_id),
                amount:
                  typeof booking.partner_payout_amount === "number"
                    ? booking.partner_payout_amount
                    : Number(booking.partner_payout_amount ?? 0),
                pricingSnapshot: (booking.pricing_snapshot as Record<string, unknown> | null) ?? {},
                paymentTaxAmount:
                  typeof (payment as { tax_amount?: number }).tax_amount === "number"
                    ? (payment as { tax_amount?: number }).tax_amount ?? 0
                    : 0,
              })
            : null;

      if (payoutId) {
        await appendLedgerEntryIfMissing(supabase, {
          bookingId: payment.booking_id,
          paymentId: payment.id,
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
          },
        });
      }
    }

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

    const conversationId = typeof booking?.conversation_id === "string" ? booking.conversation_id : null;
    const guestUserId = typeof booking?.user_id === "string" ? booking.user_id : null;

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
    if (conversationId) {
      const hostProfile = Array.isArray(booking?.hosts) ? booking.hosts[0] : booking?.hosts;
      const hostLegacyFamilyId =
        typeof hostProfile?.legacy_family_id === "string" && hostProfile.legacy_family_id.trim().length > 0
          ? hostProfile.legacy_family_id
          : null;

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
            : typeof hostProfile?.display_name === "string" && hostProfile.display_name.trim().length > 0
              ? hostProfile.display_name
              : "your Famlo stay");

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

      const { data: existingSystemMessages, error: existingMessagesError } = await supabase
        .from("messages")
        .select("id,text")
        .eq("conversation_id", conversationId)
        .eq("sender_type", "system")
        .in("text", [confirmationMessage, hostLocationMessage]);

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
