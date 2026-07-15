import { NextRequest, NextResponse } from "next/server";

import { appendPaymentEventAudit } from "@/lib/finance/payment-audit";
import { createHostBookingActionLinks } from "@/lib/booking-action-tokens";
import {
  buildHostApprovalWhatsAppMessage,
  createOrReuseBookingWhatsAppAction,
} from "@/lib/booking-whatsapp-actions";
import { buildBookingReceiptDocument, enqueueNotification } from "@/lib/booking-platform";
import { processFinanceEventContract } from "@/lib/finance/folio-line-writer";
import { appendLedgerEntryIfMissing } from "@/lib/finance/runtime";
import { computeRefundAllocationBreakdown } from "@/lib/finance/refunds";
import { resolveRefundWebhookTransition } from "@/lib/finance/refund-requests";
import {
  deriveProviderEventId,
  safeParseProviderPayload,
  storePaymentProviderEvent,
  updatePaymentProviderEventStatus,
} from "@/lib/finance/provider-event-store";
import {
  finalizeCapturedBookingPayment,
  loadBookingForPaymentFinalization,
  markBookingPaymentInventoryConflict,
} from "@/lib/payment-booking-finalization";
import { verifyRazorpayWebhookSignature } from "@/lib/razorpay";
import { createAdminSupabaseClient } from "@/lib/supabase";
import { loadUserProfileCompatibility } from "@/lib/user-profile";

type RazorpayWebhookPayload = {
  event?: string;
  payload?: {
    payment?: {
      entity?: {
        id?: string;
        order_id?: string;
        amount?: number;
        status?: string;
      };
    };
    refund?: {
      entity?: {
        id?: string;
        payment_id?: string;
        amount?: number;
        status?: string;
      };
    };
    order?: {
      entity?: {
        id?: string;
        amount?: number;
        status?: string;
      };
    };
  };
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

function resolvePaymentUpdate(eventName: string): { paymentStatus: string; bookingPaymentStatus: string } | null {
  switch (eventName) {
    case "payment.captured":
    case "order.paid":
      return { paymentStatus: "paid", bookingPaymentStatus: "paid" };
    case "payment.failed":
      return { paymentStatus: "failed", bookingPaymentStatus: "failed" };
    default:
      return null;
  }
}

function asNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get("x-razorpay-signature") ?? "";
    const headerEventId = req.headers.get("x-razorpay-event-id");
    const payload = safeParseProviderPayload(rawBody) as RazorpayWebhookPayload;
    const eventName = String(payload.event ?? "");
    const paymentEntity = payload.payload?.payment?.entity;
    const orderEntity = payload.payload?.order?.entity;
    const refundEntity = payload.payload?.refund?.entity;
    const gatewayOrderId = String(paymentEntity?.order_id ?? orderEntity?.id ?? "").trim();
    const gatewayPaymentId = String(paymentEntity?.id ?? refundEntity?.payment_id ?? "").trim();
    const providerEventId = deriveProviderEventId("RAZORPAY", rawBody, headerEventId);
    const signatureValid = Boolean(signature) && verifyRazorpayWebhookSignature(rawBody, signature);

    const supabase = createAdminSupabaseClient();
    const storedEvent = await storePaymentProviderEvent(supabase, {
      provider: "RAZORPAY",
      eventId: providerEventId,
      eventType: eventName || "unknown",
      entityType: refundEntity?.id ? "refund" : paymentEntity?.id ? "payment" : orderEntity?.id ? "order" : null,
      entityId: String(refundEntity?.id ?? paymentEntity?.id ?? orderEntity?.id ?? "").trim() || null,
      rawPayload: payload as Record<string, unknown>,
      signatureValid,
      processingStatus: signatureValid ? "received" : "invalid_signature",
      processedAt: signatureValid ? null : new Date().toISOString(),
      errorMessage: signatureValid ? null : !signature ? "Missing Razorpay webhook signature." : "Invalid Razorpay webhook signature.",
    });

    if (storedEvent.isDuplicate) {
      return NextResponse.json({
        received: true,
        ignored: true,
        duplicate: true,
        providerEventId,
        processingStatus: storedEvent.record.processingStatus,
      });
    }

    if (!signatureValid) {
      return NextResponse.json(
        { error: !signature ? "Missing Razorpay webhook signature." : "Invalid Razorpay webhook signature." },
        { status: 400 }
      );
    }

    const isRefundEvent =
      eventName === "refund.created" || eventName === "refund.processed" || eventName === "refund.failed";
    const update = resolvePaymentUpdate(eventName);
    if (!update && !isRefundEvent) {
      await updatePaymentProviderEventStatus(supabase, {
        provider: "RAZORPAY",
        eventId: providerEventId,
        processingStatus: "ignored",
        processedAt: new Date().toISOString(),
        errorMessage: "unsupported_event",
      });
      return NextResponse.json({ received: true, ignored: true });
    }

    await updatePaymentProviderEventStatus(supabase, {
      provider: "RAZORPAY",
      eventId: providerEventId,
      processingStatus: "processing",
    });

    const paymentLookup = gatewayPaymentId
      ? await supabase
          .from("payments_v2")
          .select("id,booking_id,status,raw_response,amount_total,platform_fee,tax_amount,currency")
          .eq("gateway_payment_id", gatewayPaymentId)
          .maybeSingle()
      : gatewayOrderId
        ? await supabase
            .from("payments_v2")
            .select("id,booking_id,status,raw_response,amount_total,platform_fee,tax_amount,currency")
            .eq("gateway_order_id", gatewayOrderId)
            .maybeSingle()
        : { data: null, error: null };

    if (paymentLookup.error) {
      throw paymentLookup.error;
    }

    if (!paymentLookup.data) {
      await updatePaymentProviderEventStatus(supabase, {
        provider: "RAZORPAY",
        eventId: providerEventId,
        processingStatus: "ignored",
        processedAt: new Date().toISOString(),
        errorMessage: "payment_not_found",
      });
      return NextResponse.json({ received: true, ignored: true, reason: "payment_not_found" });
    }

    const payment = paymentLookup.data;
    const now = new Date().toISOString();

    if (isRefundEvent) {
      const refundAmountPaise = asNumber(refundEntity?.amount);
      const refundAmount = Math.max(0, Math.round(refundAmountPaise / 100));
      const fullRefund = refundAmount >= asNumber(payment.amount_total);
      const refundTransition = resolveRefundWebhookTransition(eventName);
      const refundStatus = refundTransition.refundStatus;
      const bookingPaymentStatus = fullRefund
        ? refundStatus === "processed"
          ? "refunded"
          : refundStatus === "failed"
            ? String(payment.status ?? "").trim().toLowerCase() === "paid"
              ? "paid"
              : "refund_pending"
          : "refund_pending"
        : refundStatus === "processed"
          ? "partially_refunded"
          : refundStatus === "failed"
            ? String(payment.status ?? "").trim().toLowerCase() === "paid"
              ? "paid"
              : "refund_pending"
          : "refund_pending";

      const providerRefundId = String(refundEntity?.id ?? "");
      const { data: existingAttempt } = providerRefundId
        ? await supabase
            .from("refund_attempts")
            .select("id,refund_request_id,status")
            .eq("provider", "razorpay")
            .eq("provider_refund_id", providerRefundId)
            .maybeSingle()
        : { data: null };

      const { data: requestForAttempt } = existingAttempt?.refund_request_id
        ? await supabase
            .from("refund_requests")
            .select("id,status")
            .eq("id", existingAttempt.refund_request_id)
            .maybeSingle()
        : { data: null };

      const { data: refundRow, error: refundUpsertError } = await supabase
        .from("refunds_v2")
        .upsert(
          {
            booking_id: payment.booking_id,
            payment_id: payment.id,
            provider: "razorpay",
            provider_refund_id: providerRefundId,
            amount_total: refundAmount,
            reason_code: eventName,
            status: refundStatus === "failed" ? "failed" : refundStatus,
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

      if (refundUpsertError) {
        throw refundUpsertError;
      }

      const [{ data: snapshot }, { data: existingAllocations }] = await Promise.all([
        supabase
          .from("booking_financial_snapshots")
          .select("guest_total,taxable_base_for_service_fee,platform_fee,platform_fee_tax,stay_tax")
          .eq("booking_id", payment.booking_id)
          .eq("snapshot_kind", "checkout")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("refund_allocations_v2")
          .select("allocation_type,amount")
          .eq("refund_id", refundRow.id),
      ]);

      const guestTotal =
        typeof (snapshot as any)?.guest_total === "number"
          ? (snapshot as any).guest_total
          : typeof payment.amount_total === "number"
            ? payment.amount_total
            : Number(payment.amount_total ?? 0);
      const amountAfterDiscount =
        typeof (snapshot as any)?.taxable_base_for_service_fee === "number"
          ? (snapshot as any).taxable_base_for_service_fee
          : Math.max(0, Math.round(guestTotal - (typeof payment.tax_amount === "number" ? payment.tax_amount : Number(payment.tax_amount ?? 0))));
      const platformFee =
        typeof (snapshot as any)?.platform_fee === "number"
          ? (snapshot as any).platform_fee
          : (payment as any).platform_fee
            ? Number((payment as any).platform_fee)
            : 0;
      const platformFeeTax =
        typeof (snapshot as any)?.platform_fee_tax === "number"
          ? (snapshot as any).platform_fee_tax
          : typeof payment.tax_amount === "number"
            ? payment.tax_amount
            : Number(payment.tax_amount ?? 0);
      const stayTaxAmount = typeof (snapshot as any)?.stay_tax === "number" ? (snapshot as any).stay_tax : 0;

      const breakdown = computeRefundAllocationBreakdown({
        refundAmount,
        guestTotal,
        amountAfterDiscount,
        platformFee,
        platformFeeTax,
        stayTaxAmount,
      });

      const existingTypes = new Set(
        Array.isArray(existingAllocations) ? existingAllocations.map((row: any) => String(row.allocation_type)) : []
      );

      const allocationRows = [
        { allocation_type: "guest_principal", amount: breakdown.guest_principal },
        { allocation_type: "platform_fee_reversal", amount: breakdown.platform_fee_reversal },
        { allocation_type: "platform_tax_reversal", amount: breakdown.platform_tax_reversal },
      ]
        .filter((row) => row.amount > 0)
        .filter((row) => !existingTypes.has(row.allocation_type))
        .map((row) => ({
          refund_id: refundRow.id,
          allocation_type: row.allocation_type,
          amount: row.amount,
          metadata: {
            source: "razorpay_webhook",
            payment_id: payment.id,
            breakdown: breakdown.metadata,
          },
        }));

      if (allocationRows.length > 0) {
        await supabase.from("refund_allocations_v2").insert(allocationRows);
      }

      const paymentRefundStatus = fullRefund ? "full" : "partial";
      const paymentPatch: Record<string, unknown> = {
        refund_status: paymentRefundStatus,
        status: refundStatus === "processed" && fullRefund ? "refunded" : payment.status,
        last_webhook_event: eventName,
        last_webhook_received_at: now,
        webhook_payload: payload,
      };

      if (gatewayPaymentId) {
        paymentPatch.gateway_payment_id = gatewayPaymentId;
      }

      await supabase.from("payments_v2").update(paymentPatch as never).eq("id", payment.id);

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
            status: refundTransition.attemptStatus,
            raw_response: payload,
            updated_at: now,
          } as never)
          .eq("id", existingAttempt.id);
      }

      if (requestForAttempt?.id) {
        await supabase
          .from("refund_requests")
          .update({
            status: refundTransition.requestStatus,
          } as never)
          .eq("id", requestForAttempt.id);
      }

      if (eventName === "refund.created") {
        await appendLedgerEntryIfMissing(supabase, {
          bookingId: payment.booking_id,
          paymentId: payment.id,
          refundId: refundRow.id,
          entryType: "refund_initiated",
          accountCode: "guest_refunds_payable",
          direction: "credit",
          amount: refundAmount,
          referenceType: "payment_webhook_refund",
          referenceId: `initiated:${refundEntity?.id ?? payment.id}`,
          metadata: {
            provider: "razorpay",
            fullRefund,
          },
        });
      }

      if (refundStatus === "processed") {
        await appendLedgerEntryIfMissing(supabase, {
          bookingId: payment.booking_id,
          paymentId: payment.id,
          refundId: refundRow.id,
          entryType: "refund_completed",
          accountCode: "guest_refunds_payable",
          direction: "debit",
          amount: refundAmount,
          referenceType: "payment_webhook_refund",
          referenceId: `${eventName}:${refundEntity?.id ?? payment.id}`,
          metadata: {
            provider: "razorpay",
            fullRefund,
          },
        });

        // Reverse tax liability (GST on platform fee + stay tax if any).
        if (breakdown.platform_tax_reversal > 0) {
          await appendLedgerEntryIfMissing(supabase, {
            bookingId: payment.booking_id,
            paymentId: payment.id,
            refundId: refundRow.id,
            entryType: "refund_completed",
            accountCode: "tax_output_payable",
            direction: "debit",
            amount: breakdown.platform_tax_reversal,
            referenceType: "payment_webhook_refund",
            referenceId: `tax:${eventName}:${refundEntity?.id ?? payment.id}`,
            metadata: {
              provider: "razorpay",
            },
          });
        }

        // Reverse platform fee revenue portion.
        if (breakdown.platform_fee_reversal > 0) {
          await appendLedgerEntryIfMissing(supabase, {
            bookingId: payment.booking_id,
            paymentId: payment.id,
            refundId: refundRow.id,
            entryType: "refund_completed",
            accountCode: "platform_fee_revenue",
            direction: "debit",
            amount: breakdown.platform_fee_reversal,
            referenceType: "payment_webhook_refund",
            referenceId: `fee:${eventName}:${refundEntity?.id ?? payment.id}`,
            metadata: {
              provider: "razorpay",
            },
          });
        }

        // Cash reversal in gateway clearing account.
        await appendLedgerEntryIfMissing(supabase, {
          bookingId: payment.booking_id,
          paymentId: payment.id,
          refundId: refundRow.id,
          entryType: "refund_completed",
          accountCode: "cash_gateway_clearing",
          direction: "credit",
          amount: refundAmount,
          referenceType: "payment_webhook_refund",
          referenceId: `cash:${eventName}:${refundEntity?.id ?? payment.id}`,
          metadata: {
            provider: "razorpay",
          },
        });
      }

      if (refundTransition.shouldFinalizeFolio) {
        await processFinanceEventContract(supabase, {
          bookingId: payment.booking_id,
          eventType: "REFUND_CREATED",
          sourceEventId: refundRow.id,
          calculationVersion: "batch2-direct-folio-v1",
          currency: typeof payment.currency === "string" ? payment.currency : "INR",
          refundAmount,
          metadata: {
            source: "payments.webhook",
            refund_status: refundStatus,
            provider_event: eventName,
            refund_request_id: existingAttempt?.refund_request_id ?? null,
          },
        });
      }

      await appendPaymentEventAudit(supabase, {
        paymentId: payment.id,
        provider: "razorpay",
        eventName,
        providerEventId: String(refundEntity?.id ?? gatewayPaymentId ?? payment.id),
        idempotencyKey: `payment_webhook:${eventName}:${String(refundEntity?.id ?? gatewayPaymentId ?? payment.id)}`,
        payload,
        processingStatus: "processed",
      });

      await updatePaymentProviderEventStatus(supabase, {
        provider: "RAZORPAY",
        eventId: providerEventId,
        processingStatus: refundStatus === "failed" ? "failed" : "processed",
        processedAt: now,
        errorMessage: refundStatus === "failed" ? "refund_failed_requires_review" : null,
      });

      return NextResponse.json({ received: true, paymentId: payment.id, bookingId: payment.booking_id, refundId: refundRow.id });
    }

    if (!update) {
      return NextResponse.json({ received: true, ignored: true, reason: "unhandled_event" });
    }

    const nextRawResponse = {
      ...((payment.raw_response as Record<string, unknown> | null) ?? {}),
      last_webhook_event: eventName,
      last_webhook_received_at: now,
      webhook_payload: payload,
    };

    const paymentPatch: Record<string, unknown> = {
      status: update.paymentStatus,
      raw_response: nextRawResponse,
    };

    if (gatewayOrderId) {
      paymentPatch.gateway_order_id = gatewayOrderId;
    }

    if (gatewayPaymentId) {
      paymentPatch.gateway_payment_id = gatewayPaymentId;
    }

    if (update.paymentStatus === "paid") {
      paymentPatch.paid_at = now;
    }

    const { error: paymentUpdateError } = await supabase
      .from("payments_v2")
      .update(paymentPatch as never)
      .eq("id", payment.id);

    if (paymentUpdateError) {
      throw paymentUpdateError;
    }

    const booking = await loadBookingForPaymentFinalization(supabase, payment.booking_id);

    const bookingStatusNormalized = String(booking?.status ?? "").trim().toLowerCase();
    const bookingPaymentStatusNormalized = String(booking?.payment_status ?? "").trim().toLowerCase();
    if (bookingStatusNormalized === "rejected" && bookingPaymentStatusNormalized === "refund_pending") {
      return NextResponse.json({ received: true, paymentId: payment.id, bookingId: payment.booking_id, conflict: true });
    }

    let finalizationResult:
      | Awaited<ReturnType<typeof finalizeCapturedBookingPayment>>
      | null = null;
    if (update.paymentStatus === "paid") {
      try {
        finalizationResult = await finalizeCapturedBookingPayment(supabase, {
          payment,
          booking: booking as Record<string, unknown> | null | undefined,
          gatewayOrderId,
          gatewayPaymentId,
          providerPaymentStatus: String(paymentEntity?.status ?? orderEntity?.status ?? update.paymentStatus),
          providerAmountPaise: asNumber(paymentEntity?.amount ?? orderEntity?.amount),
          paidAt: now,
          source: "payments.webhook",
          providerEventName: eventName,
          rawResponsePatch: {
            last_webhook_event: eventName,
            last_webhook_received_at: now,
            webhook_payload: payload,
          },
        });
      } catch (error) {
        await markBookingPaymentInventoryConflict(supabase, {
          booking: booking as Record<string, unknown> | null | undefined,
          paymentId: payment.id,
          provider: "razorpay",
          reason: "inventory_conflict_after_payment",
          conflictSummary:
            error instanceof Error
              ? `${error.message} Payment captured after the slot was no longer available.`
              : null,
        });
        await updatePaymentProviderEventStatus(supabase, {
          provider: "RAZORPAY",
          eventId: providerEventId,
          processingStatus: "failed",
          processedAt: now,
          errorMessage: error instanceof Error ? error.message : "inventory_conflict_after_payment",
        });
        return NextResponse.json({ received: true, paymentId: payment.id, bookingId: payment.booking_id, conflict: true });
      }

      if (finalizationResult.decision === "reject_amount_mismatch") {
        await updatePaymentProviderEventStatus(supabase, {
          provider: "RAZORPAY",
          eventId: providerEventId,
          processingStatus: "failed",
          processedAt: now,
          errorMessage: "amount_mismatch",
        });
        return NextResponse.json({ error: "Captured Razorpay amount does not match internal guest payable amount." }, { status: 409 });
      }
      if (finalizationResult.decision === "reject_invalid_ids") {
        await updatePaymentProviderEventStatus(supabase, {
          provider: "RAZORPAY",
          eventId: providerEventId,
          processingStatus: "failed",
          processedAt: now,
          errorMessage: "invalid_gateway_ids",
        });
        return NextResponse.json({ error: "Missing or malformed Razorpay payment identifiers." }, { status: 400 });
      }
      if (finalizationResult.decision === "ignore_not_captured") {
        await updatePaymentProviderEventStatus(supabase, {
          provider: "RAZORPAY",
          eventId: providerEventId,
          processingStatus: "ignored",
          processedAt: now,
          errorMessage: "payment_not_captured",
        });
        return NextResponse.json({ received: true, ignored: true, reason: "payment_not_captured" });
      }
    } else {
      await supabase
        .from("bookings_v2")
        .update({
          payment_status: update.bookingPaymentStatus,
          updated_at: now,
        } as never)
        .eq("id", payment.booking_id);
    }

    const approvalRequired = finalizationResult?.approvalRequired ?? false;
    const bookingForNotifications = (finalizationResult?.booking ?? booking) as Record<string, unknown> | null | undefined;
    const bookingStatus = finalizationResult?.nextStatus ?? (bookingForNotifications?.status as string | null) ?? "pending";
    const hostRelationForLog = Array.isArray(bookingForNotifications?.hosts) ? bookingForNotifications.hosts[0] : bookingForNotifications?.hosts;
    const hostLegacyFamilyIdForLog =
      typeof hostRelationForLog?.legacy_family_id === "string" && hostRelationForLog.legacy_family_id.trim().length > 0
        ? hostRelationForLog.legacy_family_id
        : null;
    console.info("[payment-finalization]", {
      source: "payments.webhook",
      approvalRequired,
      bookingId: payment.booking_id,
      hostId: typeof bookingForNotifications?.host_id === "string" ? bookingForNotifications.host_id : null,
      legacyFamilyId: hostLegacyFamilyIdForLog,
      nextStatus: bookingStatus,
      decision: finalizationResult?.decision ?? "non_paid_update",
    });

    if (update.paymentStatus === "paid" && finalizationResult?.finalizedNow) {
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
        console.error("[payments.webhook] booking receipt generation failed:", documentError);
      }

      await enqueueNotification(supabase, {
        eventType: approvalRequired ? "booking_request" : "booking_confirmed",
        channel: "email",
        userId: typeof booking?.user_id === "string" ? booking.user_id : null,
        bookingId: payment.booking_id,
        dedupeKey: `${approvalRequired ? "booking_request" : "booking_confirmed"}:${payment.booking_id}`,
        subject: approvalRequired ? "Your Famlo booking is awaiting host approval" : "Your Famlo booking is confirmed",
        payload: {
          message: approvalRequired
            ? "Your payment was received and your Famlo booking is pending host approval."
            : "Your Famlo booking has been confirmed from the payment webhook.",
        },
      });
      await enqueueNotification(supabase, {
        eventType: approvalRequired ? "booking_request" : "booking_confirmed",
        channel: "whatsapp",
        userId: typeof booking?.user_id === "string" ? booking.user_id : null,
        bookingId: payment.booking_id,
        dedupeKey: `${approvalRequired ? "booking_request" : "booking_confirmed"}:${payment.booking_id}:whatsapp`,
        subject: approvalRequired ? "Your Famlo booking is awaiting host approval" : "Your Famlo booking is confirmed",
        templateName: approvalRequired ? "guest_booking_request_received" : "guest_booking_confirmed",
        recipientRole: "guest",
        payload: {
          message: approvalRequired
            ? "Your payment was received and your Famlo booking is pending host approval."
            : "Your Famlo booking has been confirmed from the payment webhook.",
        },
      });
      const hostRelation = Array.isArray(booking?.hosts) ? booking.hosts[0] : booking?.hosts;
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
                console.error("[payments.webhook] stay unit lookup failed:", stayUnitLookup.error);
                return null;
              }
              return asString(stayUnitLookup.data?.name);
            })()
          : null;
      const bookingDateLabel = formatBookingDateRange(
        asString(booking?.start_date),
        asString(booking?.end_date) ?? asString(booking?.start_date)
      );
      const hostUserId = typeof hostRelation?.user_id === "string" ? hostRelation.user_id : null;
      const guestProfile =
        typeof booking?.user_id === "string" ? await loadUserProfileCompatibility(supabase, booking.user_id) : null;
      const hostProfileContact = hostUserId ? await loadUserProfileCompatibility(supabase, hostUserId) : null;
      const hostPhone = hostProfileContact?.phone ?? null;
      const ownerName =
        typeof hostProfileContact?.name === "string" && hostProfileContact.name.trim().length > 0
          ? hostProfileContact.name.trim()
          : null;
      const hostPropertyLabel =
        typeof hostRelation?.display_name === "string" && hostRelation.display_name.trim().length > 0
          ? hostRelation.display_name.trim()
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
        typeof hostRelation?.legacy_family_id === "string" && hostRelation.legacy_family_id.trim().length > 0
          ? hostRelation.legacy_family_id
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
          hostId: typeof booking?.host_id === "string" ? booking.host_id : null,
          hostUserId,
          metadata: {
            source: "payments_webhook",
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
          dedupeKey: `booking_confirmed:host:${payment.booking_id}:email:webhook`,
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
          dedupeKey: `booking_confirmed:host:${payment.booking_id}:whatsapp:webhook`,
          subject: "Your room is booked on Famlo",
          recipientRole: "host",
          payload: {
            title: "Room booked",
            message: `Congratulations. ${hostListingLabel} is booked for ${bookingDateLabel}.`,
            view_url: fallbackHostDashboardUrl,
          },
        });
      }

    }

    await appendPaymentEventAudit(supabase, {
      paymentId: payment.id,
      provider: "razorpay",
      eventName,
      providerEventId: gatewayPaymentId || gatewayOrderId || `${eventName}:${payment.id}`,
      idempotencyKey: `payment_webhook:${eventName}:${gatewayPaymentId || gatewayOrderId || payment.id}`,
      payload,
      processingStatus: "processed",
    });

    await updatePaymentProviderEventStatus(supabase, {
      provider: "RAZORPAY",
      eventId: providerEventId,
      processingStatus:
        update.paymentStatus === "paid" && finalizationResult && !finalizationResult.finalizedNow
          ? "ignored_duplicate"
          : "processed",
      processedAt: now,
      errorMessage: null,
    });

    return NextResponse.json({ received: true, paymentId: payment.id, bookingId: payment.booking_id });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to process payment webhook." },
      { status: 500 }
    );
  }
}
