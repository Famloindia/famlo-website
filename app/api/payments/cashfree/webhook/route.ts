import { NextRequest, NextResponse } from "next/server";

import { releasePaymentAttemptBookingHold } from "@/lib/booking-payment-holds";
import {
  cashfreeAmountToMinor,
  isCashfreeFailureStatus,
  isCashfreeSuccessStatus,
  isCashfreeUserDroppedStatus,
  verifyCashfreeWebhookSignature,
} from "@/lib/cashfree";
import { enqueuePostPaymentBookingNotifications } from "@/lib/booking-payment-notifications";
import { appendPaymentEventAudit } from "@/lib/finance/payment-audit";
import { recordCashfreeSplitReadiness } from "@/lib/finance/cashfree-marketplace";
import {
  deriveProviderEventId,
  safeParseProviderPayload,
  storePaymentProviderEvent,
  updatePaymentProviderEventStatus,
} from "@/lib/finance/provider-event-store";
import { buildBookingReceiptDocument, enqueueNotification } from "@/lib/booking-platform";
import {
  finalizeCapturedBookingPayment,
  loadBookingForPaymentFinalization,
  markBookingPaymentInventoryConflict,
} from "@/lib/payment-booking-finalization";
import {
  selectCashfreeOrderIdFromWebhook,
  selectCashfreePaymentFromWebhook,
} from "@/lib/payments/provider";
import { createAdminSupabaseClient } from "@/lib/supabase";

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function selectCashfreeRefundFromWebhook(payload: Record<string, unknown>): Record<string, unknown> | null {
  const data = payload.data;
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const refund = (data as Record<string, unknown>).refund;
  if (!refund || typeof refund !== "object" || Array.isArray(refund)) return null;
  return refund as Record<string, unknown>;
}

function mapCashfreeRefundStatus(status: unknown): "pending" | "processed" | "failed" {
  const normalized = String(status ?? "").trim().toUpperCase();
  if (normalized === "SUCCESS") return "processed";
  if (normalized === "CANCELLED" || normalized === "FAILED") return "failed";
  return "pending";
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get("x-webhook-signature") ?? "";
    const timestamp = req.headers.get("x-webhook-timestamp") ?? "";
    const payload = safeParseProviderPayload(rawBody);
    const eventName = String(payload.type ?? "unknown");
    const refundEntity = selectCashfreeRefundFromWebhook(payload);
    const orderId = selectCashfreeOrderIdFromWebhook(payload) ?? asString(refundEntity?.order_id);
    const paymentEntity = selectCashfreePaymentFromWebhook(payload);
    const cfPaymentId = asString(paymentEntity?.cf_payment_id);
    const cfRefundId = asString(refundEntity?.cf_refund_id);
    const signatureValid =
      Boolean(signature && timestamp) &&
      verifyCashfreeWebhookSignature({
        rawBody,
        timestamp,
        signature,
      });
    const providerEventId = deriveProviderEventId(
      "CASHFREE",
      rawBody,
      signatureValid
        ? cfRefundId
          ? `${eventName}:${orderId ?? "order"}:${cfRefundId}`
          : cfPaymentId
            ? `${eventName}:${orderId ?? "order"}:${cfPaymentId}`
            : null
        : null
    );
    const supabase = createAdminSupabaseClient();

    const storedEvent = await storePaymentProviderEvent(supabase, {
      provider: "CASHFREE",
      eventId: providerEventId,
      eventType: eventName,
      entityType: cfRefundId ? "refund" : cfPaymentId ? "payment" : orderId ? "order" : null,
      entityId: cfRefundId ?? cfPaymentId ?? orderId,
      rawPayload: payload,
      signatureValid,
      processingStatus: signatureValid ? "received" : "invalid_signature",
      processedAt: signatureValid ? null : new Date().toISOString(),
      errorMessage: signatureValid
        ? null
        : !signature || !timestamp
          ? "Missing Cashfree webhook signature or timestamp."
          : "Invalid Cashfree webhook signature.",
    });

    if (!signatureValid) {
      return NextResponse.json(
        { error: !signature || !timestamp ? "Missing Cashfree webhook signature or timestamp." : "Invalid Cashfree webhook signature." },
        { status: 400 }
      );
    }

    if (storedEvent.isDuplicate && storedEvent.record.processingStatus !== "failed") {
      return NextResponse.json({
        received: true,
        ignored: true,
        duplicate: true,
        providerEventId,
        processingStatus: storedEvent.record.processingStatus,
      });
    }

    if (!orderId) {
      await updatePaymentProviderEventStatus(supabase, {
        provider: "CASHFREE",
        eventId: providerEventId,
        processingStatus: "ignored",
        processedAt: new Date().toISOString(),
        errorMessage: "missing_order_id",
      });
      return NextResponse.json({ received: true, ignored: true, reason: "missing_order_id" });
    }

    await updatePaymentProviderEventStatus(supabase, {
      provider: "CASHFREE",
      eventId: providerEventId,
      processingStatus: "processing",
    });

    const paymentLookup = await supabase
      .from("payments_v2")
      .select("id,booking_id,gateway,status,raw_response,amount_total,platform_fee,tax_amount,currency")
      .eq("gateway", "cashfree")
      .eq("gateway_order_id", orderId)
      .maybeSingle();

    if (paymentLookup.error) throw paymentLookup.error;
    if (!paymentLookup.data) {
      await updatePaymentProviderEventStatus(supabase, {
        provider: "CASHFREE",
        eventId: providerEventId,
        processingStatus: "ignored",
        processedAt: new Date().toISOString(),
        errorMessage: "payment_not_found",
      });
      return NextResponse.json({ received: true, ignored: true, reason: "payment_not_found" });
    }

    const payment = paymentLookup.data;
    const now = new Date().toISOString();

    if (refundEntity) {
      const providerRefundId = cfRefundId ?? asString(refundEntity.refund_id) ?? "";
      const refundAmount = Math.max(0, Math.round(asNumber(refundEntity.refund_amount)));
      const refundStatus = mapCashfreeRefundStatus(refundEntity.refund_status);
      const fullRefund = refundAmount >= asNumber(payment.amount_total);
      const bookingPaymentStatus = fullRefund
        ? refundStatus === "processed"
          ? "refunded"
          : refundStatus === "failed"
            ? "paid"
            : "refund_pending"
        : refundStatus === "processed"
          ? "partially_refunded"
          : refundStatus === "failed"
            ? "paid"
            : "refund_pending";

      const merchantRefundId = asString(refundEntity.refund_id);
      let { data: existingAttempt } = providerRefundId
        ? await supabase
            .from("refund_attempts")
            .select("id,refund_request_id,status")
            .eq("provider", "cashfree")
            .eq("provider_refund_id", providerRefundId)
            .maybeSingle()
        : { data: null };
      if (!existingAttempt && merchantRefundId) {
        const fallbackAttempt = await supabase.from("refund_attempts").select("id,refund_request_id,status")
          .eq("provider", "cashfree").eq("merchant_refund_id", merchantRefundId).maybeSingle();
        if (fallbackAttempt.error) throw fallbackAttempt.error;
        existingAttempt = fallbackAttempt.data;
      }

      const { data: refundRow, error: refundUpsertError } = await supabase
        .from("refunds_v2")
        .upsert(
          {
            booking_id: payment.booking_id,
            payment_id: payment.id,
            provider: "cashfree",
            provider_refund_id: providerRefundId || null,
            amount_total: refundAmount,
            reason_code: eventName,
            status: refundStatus,
            processed_at: refundStatus === "processed" ? now : null,
            metadata: {
              webhook_event: eventName,
              webhook_payload: payload,
              refund_request_id: existingAttempt?.refund_request_id ?? null,
            },
          },
          { onConflict: "provider,provider_refund_id" }
        )
        .select("id")
        .single();
      if (refundUpsertError) throw refundUpsertError;

      await supabase
        .from("payments_v2")
        .update({
          refund_status: fullRefund ? "full" : "partial",
          status: refundStatus === "processed" && fullRefund ? "refunded" : payment.status,
          raw_response: {
            ...((payment.raw_response as Record<string, unknown> | null) ?? {}),
            last_cashfree_refund_webhook: payload,
            last_webhook_received_at: now,
          },
        } as never)
        .eq("id", payment.id);

      await supabase
        .from("bookings_v2")
        .update({
          payment_status: bookingPaymentStatus,
          updated_at: now,
        } as never)
        .eq("id", payment.booking_id);

      if (existingAttempt?.id) {
        await supabase
          .from("refund_attempts")
          .update({
            status: refundStatus === "processed" ? "processed" : refundStatus === "failed" ? "failed" : "submitted",
            raw_response: payload,
            updated_at: now,
          } as never)
          .eq("id", existingAttempt.id);
      }

      if (existingAttempt?.refund_request_id) {
        await supabase
          .from("refund_requests")
          .update({
            status: refundStatus === "processed" ? "processed" : refundStatus === "failed" ? "failed" : "processing",
            successful_at: refundStatus === "processed" ? now : null,
            failed_at: refundStatus === "failed" ? now : null,
            last_error: refundStatus === "failed" ? "Cashfree reported refund failure." : null,
            updated_at: now,
          } as never)
          .eq("id", existingAttempt.refund_request_id);

        const { data: linkedRequest } = await supabase.from("refund_requests")
          .select("cancellation_request_id").eq("id", existingAttempt.refund_request_id).maybeSingle();
        if (linkedRequest?.cancellation_request_id) {
          const { data: linkedCancellation } = await supabase.from("cancellation_requests_v2")
            .select("guest_user_id").eq("id", linkedRequest.cancellation_request_id).maybeSingle();
          const cancellationStatus = refundStatus === "processed" ? "completed" : refundStatus === "failed" ? "refund_failed" : "refund_processing";
          await supabase.from("cancellation_requests_v2").update({
            status: cancellationStatus,
            completed_at: refundStatus === "processed" ? now : null,
            updated_at: now,
          } as never).eq("id", linkedRequest.cancellation_request_id);
          if (refundStatus === "processed") {
            await supabase.from("booking_settlement_holds_v2").update({
              is_active: false,
              released_at: now,
              released_by: "cashfree_refund_webhook",
              updated_at: now,
            } as never).eq("cancellation_request_id", linkedRequest.cancellation_request_id).eq("is_active", true);
          }
          await enqueueNotification(supabase, {
            eventType: refundStatus === "processed" ? "guest_refund_successful" : refundStatus === "failed" ? "refund_requires_attention" : "guest_refund_processing",
            channel: "email",
            userId: refundStatus === "failed" ? null : linkedCancellation?.guest_user_id ?? null,
            bookingId: payment.booking_id,
            dedupeKey: `cashfree_refund:${providerRefundId}:${refundStatus}:notification`,
            subject: refundStatus === "processed" ? "Your Famlo refund is complete" : refundStatus === "failed" ? "Cashfree refund requires attention" : "Your Famlo refund is processing",
            recipientRole: refundStatus === "failed" ? "admin" : "guest",
            payload: { message: refundStatus === "processed" ? "Your approved refund has been completed." : refundStatus === "failed" ? "An approved refund needs finance review." : "Your approved refund is processing." },
          });
        }
      }

      await appendPaymentEventAudit(supabase, {
        paymentId: payment.id,
        provider: "cashfree",
        eventName,
        providerEventId: providerRefundId || orderId,
        idempotencyKey: `cashfree_refund_webhook:${eventName}:${providerRefundId || orderId}`,
        payload,
        processingStatus: "processed",
      });

      await updatePaymentProviderEventStatus(supabase, {
        provider: "CASHFREE",
        eventId: providerEventId,
        processingStatus: refundStatus === "failed" ? "failed" : "processed",
        processedAt: now,
        errorMessage: refundStatus === "failed" ? "refund_failed_requires_review" : null,
      });

      return NextResponse.json({ received: true, paymentId: payment.id, bookingId: payment.booking_id, refundId: refundRow.id });
    }

    const paymentStatus = paymentEntity?.payment_status ?? eventName;
    const providerAmountPaise = cashfreeAmountToMinor(paymentEntity?.payment_amount ?? payment.amount_total);
    const nextRawResponse = {
      ...((payment.raw_response as Record<string, unknown> | null) ?? {}),
      last_webhook_event: eventName,
      last_webhook_received_at: now,
      cashfree_webhook_payload: payload,
    };

    if (isCashfreeSuccessStatus(paymentStatus)) {
      await supabase
        .from("payments_v2")
        .update({
          gateway: "cashfree",
          provider: "cashfree",
          gateway_order_id: orderId,
          external_order_id: orderId,
          ...(cfPaymentId ? { gateway_payment_id: cfPaymentId } : {}),
          ...(cfPaymentId ? { external_payment_id: cfPaymentId } : {}),
          provider_status: String(paymentStatus),
          raw_response: nextRawResponse,
        } as never)
        .eq("id", payment.id);

      const booking = await loadBookingForPaymentFinalization(supabase, payment.booking_id);
      let finalizationResult: Awaited<ReturnType<typeof finalizeCapturedBookingPayment>> | null = null;

      try {
        finalizationResult = await finalizeCapturedBookingPayment(supabase, {
          payment,
          booking,
          gatewayOrderId: orderId,
          gatewayPaymentId: cfPaymentId ?? orderId,
          providerPaymentStatus: "paid",
          providerAmountPaise,
          paidAt: now,
          source: "payments.cashfree.webhook",
          provider: "cashfree",
          providerEventName: eventName,
          rawResponsePatch: nextRawResponse,
        });
      } catch (error) {
        await markBookingPaymentInventoryConflict(supabase, {
          booking: booking as Record<string, unknown> | null | undefined,
          paymentId: payment.id,
          provider: "cashfree",
          reason: "inventory_conflict_after_payment",
          conflictSummary:
            error instanceof Error
              ? `${error.message} Cashfree payment succeeded after the slot was no longer available.`
              : null,
        });
        await updatePaymentProviderEventStatus(supabase, {
          provider: "CASHFREE",
          eventId: providerEventId,
          processingStatus: "failed",
          processedAt: now,
          errorMessage: error instanceof Error ? error.message : "inventory_conflict_after_payment",
        });
        return NextResponse.json({ received: true, paymentId: payment.id, bookingId: payment.booking_id, conflict: true });
      }

      if (finalizationResult.decision === "reject_amount_mismatch") {
        await updatePaymentProviderEventStatus(supabase, {
          provider: "CASHFREE",
          eventId: providerEventId,
          processingStatus: "failed",
          processedAt: now,
          errorMessage: "amount_mismatch",
        });
        return NextResponse.json({ error: "Captured Cashfree amount does not match internal guest payable amount." }, { status: 409 });
      }
      if (finalizationResult.decision === "reject_invalid_ids") {
        await updatePaymentProviderEventStatus(supabase, {
          provider: "CASHFREE",
          eventId: providerEventId,
          processingStatus: "failed",
          processedAt: now,
          errorMessage: "invalid_gateway_ids",
        });
        return NextResponse.json({ error: "Missing or malformed Cashfree payment identifiers." }, { status: 400 });
      }
      if (finalizationResult.decision === "ignore_not_captured") {
        await updatePaymentProviderEventStatus(supabase, {
          provider: "CASHFREE",
          eventId: providerEventId,
          processingStatus: "ignored",
          processedAt: now,
          errorMessage: "payment_not_successful",
        });
        return NextResponse.json({ received: true, ignored: true, reason: "payment_not_successful" });
      }

      if (finalizationResult.finalizedNow) {
        try {
          await recordCashfreeSplitReadiness(supabase, {
            bookingId: payment.booking_id,
            paymentId: payment.id,
            cashfreeOrderId: orderId,
            amountMinor: providerAmountPaise,
            rawResponse: {
              source: "cashfree_payment_success_webhook",
              eventName,
              cfPaymentId,
            },
          });
        } catch (splitError) {
          console.error("[payments.cashfree.webhook] easy split readiness failed:", splitError);
        }

        try {
          const receipt = await buildBookingReceiptDocument(supabase, payment.booking_id);
          await supabase.from("document_exports").insert({
            document_type: "guest_receipt",
            booking_id: payment.booking_id,
            owner_user_id: null,
            access_scope: "guest",
            payload: receipt.payload,
          });
        } catch (documentError) {
          console.error("[payments.cashfree.webhook] booking receipt generation failed:", documentError);
        }

        await enqueuePostPaymentBookingNotifications(supabase, {
          booking: finalizationResult.booking as Record<string, unknown>,
          payment: payment as Record<string, unknown>,
          approvalRequired: finalizationResult.approvalRequired,
          source: "payments_webhook",
        });
      }

      await appendPaymentEventAudit(supabase, {
        paymentId: payment.id,
        provider: "cashfree",
        eventName,
        providerEventId: cfPaymentId ?? orderId,
        idempotencyKey: `cashfree_webhook:${eventName}:${cfPaymentId ?? orderId}`,
        payload,
        processingStatus: "processed",
      });

      await updatePaymentProviderEventStatus(supabase, {
        provider: "CASHFREE",
        eventId: providerEventId,
        processingStatus:
          finalizationResult && !finalizationResult.finalizedNow ? "ignored_duplicate" : "processed",
        processedAt: now,
        errorMessage: null,
      });

      return NextResponse.json({ received: true, paymentId: payment.id, bookingId: payment.booking_id });
    }

    if (isCashfreeFailureStatus(paymentStatus) || isCashfreeUserDroppedStatus(paymentStatus)) {
      if (["paid", "captured", "refunded", "partially_refunded"].includes(String(payment.status ?? "").trim().toLowerCase())) {
        await updatePaymentProviderEventStatus(supabase, {
          provider: "CASHFREE",
          eventId: providerEventId,
          processingStatus: "ignored",
          processedAt: now,
          errorMessage: "out_of_order_failure_after_success",
        });
        return NextResponse.json({
          received: true,
          ignored: true,
          reason: "out_of_order_failure_after_success",
          paymentId: payment.id,
          bookingId: payment.booking_id,
        });
      }

      const bookingPaymentStatus = isCashfreeUserDroppedStatus(paymentStatus) ? "abandoned" : "failed";
      await supabase
        .from("payments_v2")
        .update({
          gateway: "cashfree",
          provider: "cashfree",
          gateway_order_id: orderId,
          external_order_id: orderId,
          ...(cfPaymentId ? { gateway_payment_id: cfPaymentId } : {}),
          ...(cfPaymentId ? { external_payment_id: cfPaymentId } : {}),
          provider_status: String(paymentStatus),
          status: bookingPaymentStatus,
          raw_response: nextRawResponse,
        } as never)
        .eq("id", payment.id);

      const holdRelease = await releasePaymentAttemptBookingHold(supabase, {
        bookingId: payment.booking_id,
        paymentId: payment.id,
        reason: isCashfreeUserDroppedStatus(paymentStatus) ? "user_dropped" : "payment_failed",
        paymentStatus: bookingPaymentStatus,
        source: "payments.cashfree.webhook",
      });

      await appendPaymentEventAudit(supabase, {
        paymentId: payment.id,
        provider: "cashfree",
        eventName,
        providerEventId: cfPaymentId ?? orderId,
        idempotencyKey: `cashfree_webhook:${eventName}:${cfPaymentId ?? orderId}`,
        payload,
        processingStatus: "processed",
      });

      await updatePaymentProviderEventStatus(supabase, {
        provider: "CASHFREE",
        eventId: providerEventId,
        processingStatus: "processed",
        processedAt: now,
        errorMessage: null,
      });

      return NextResponse.json({
        received: true,
        paymentId: payment.id,
        bookingId: payment.booking_id,
        holdReleased: holdRelease.released,
      });
    }

    await updatePaymentProviderEventStatus(supabase, {
      provider: "CASHFREE",
      eventId: providerEventId,
      processingStatus: "ignored",
      processedAt: now,
      errorMessage: "unsupported_or_pending_event",
    });
    return NextResponse.json({ received: true, ignored: true, reason: "unsupported_or_pending_event" });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to process Cashfree webhook." },
      { status: 500 }
    );
  }
}
