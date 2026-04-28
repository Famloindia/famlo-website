import { NextRequest, NextResponse } from "next/server";

import { appendPaymentEventAudit } from "@/lib/finance/payment-audit";
import { buildBookingReceiptDocument, enqueueNotification } from "@/lib/booking-platform";
import { appendLedgerEntryIfMissing, ensureScheduledPayout } from "@/lib/finance/runtime";
import { computeRefundAllocationBreakdown } from "@/lib/finance/refunds";
import {
  assertBookingCanFinalizePayment,
  loadBookingForPaymentFinalization,
  markBookingPaymentInventoryConflict,
  resolveBookingApprovalRequirement,
} from "@/lib/payment-booking-finalization";
import { verifyRazorpayWebhookSignature } from "@/lib/razorpay";
import { createAdminSupabaseClient } from "@/lib/supabase";

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

    if (!signature) {
      return NextResponse.json({ error: "Missing Razorpay webhook signature." }, { status: 400 });
    }

    if (!verifyRazorpayWebhookSignature(rawBody, signature)) {
      return NextResponse.json({ error: "Invalid Razorpay webhook signature." }, { status: 400 });
    }

    const payload = JSON.parse(rawBody) as RazorpayWebhookPayload;
    const eventName = String(payload.event ?? "");
    const isRefundEvent = eventName === "refund.created" || eventName === "refund.processed";
    const update = resolvePaymentUpdate(eventName);
    if (!update && !isRefundEvent) {
      return NextResponse.json({ received: true, ignored: true });
    }

    const paymentEntity = payload.payload?.payment?.entity;
    const orderEntity = payload.payload?.order?.entity;
    const refundEntity = payload.payload?.refund?.entity;
    const gatewayOrderId = String(paymentEntity?.order_id ?? orderEntity?.id ?? "").trim();
    const gatewayPaymentId = String(paymentEntity?.id ?? refundEntity?.payment_id ?? "").trim();

    const supabase = createAdminSupabaseClient();
    const paymentLookup = gatewayPaymentId
      ? await supabase
          .from("payments_v2")
          .select("id,booking_id,status,raw_response,amount_total,platform_fee,tax_amount")
          .eq("gateway_payment_id", gatewayPaymentId)
          .maybeSingle()
      : gatewayOrderId
        ? await supabase
            .from("payments_v2")
            .select("id,booking_id,status,raw_response,amount_total,platform_fee,tax_amount")
            .eq("gateway_order_id", gatewayOrderId)
            .maybeSingle()
        : { data: null, error: null };

    if (paymentLookup.error) {
      throw paymentLookup.error;
    }

    if (!paymentLookup.data) {
      return NextResponse.json({ received: true, ignored: true, reason: "payment_not_found" });
    }

    const payment = paymentLookup.data;
    const now = new Date().toISOString();

    if (isRefundEvent) {
      const refundAmountPaise = asNumber(refundEntity?.amount);
      const refundAmount = Math.max(0, Math.round(refundAmountPaise / 100));
      const fullRefund = refundAmount >= asNumber(payment.amount_total);
      const refundStatus = eventName === "refund.processed" ? "processed" : "pending";
      const bookingPaymentStatus = fullRefund
        ? refundStatus === "processed"
          ? "refunded"
          : "refund_pending"
        : refundStatus === "processed"
          ? "partially_refunded"
          : "refund_pending";

      const { data: refundRow, error: refundUpsertError } = await supabase
        .from("refunds_v2")
        .upsert(
          {
            booking_id: payment.booking_id,
            payment_id: payment.id,
            provider: "razorpay",
            provider_refund_id: String(refundEntity?.id ?? ""),
            amount_total: refundAmount,
            reason_code: eventName,
            status: refundStatus,
            processed_at: refundStatus === "processed" ? now : null,
            metadata: {
              webhook_event: eventName,
              webhook_payload: payload,
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

      await appendPaymentEventAudit(supabase, {
        paymentId: payment.id,
        provider: "razorpay",
        eventName,
        providerEventId: String(refundEntity?.id ?? gatewayPaymentId ?? payment.id),
        idempotencyKey: `payment_webhook:${eventName}:${String(refundEntity?.id ?? gatewayPaymentId ?? payment.id)}`,
        payload,
        processingStatus: "processed",
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
        conflictSummary:
          error instanceof Error
            ? `${error.message} Payment captured after the slot was no longer available.`
            : null,
      });
      return NextResponse.json({ received: true, paymentId: payment.id, bookingId: payment.booking_id, conflict: true });
    }

    const approvalRequired = await resolveBookingApprovalRequirement(supabase, booking as Record<string, unknown> | null | undefined);
    const bookingStatus =
      update.bookingPaymentStatus === "paid" ? (approvalRequired ? "pending" : "confirmed") : booking?.status ?? "pending";

    await supabase
      .from("bookings_v2")
      .update({
        payment_status: update.bookingPaymentStatus,
        status: bookingStatus,
        hold_expires_at: update.bookingPaymentStatus === "paid" ? null : undefined,
        updated_at: now,
      } as never)
      .eq("id", payment.booking_id);

    await supabase.from("booking_status_history_v2").insert({
      booking_id: payment.booking_id,
      old_status: booking?.status ?? null,
      new_status: bookingStatus,
      changed_by_user_id: null,
      reason: `payment_webhook:${eventName}`,
      created_at: now,
    } as never);

    if (update.paymentStatus === "paid") {
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
        bookingId: payment.booking_id,
        dedupeKey: `${approvalRequired ? "booking_request" : "booking_confirmed"}:${payment.booking_id}`,
        subject: approvalRequired ? "Your Famlo booking is awaiting host approval" : "Your Famlo booking is confirmed",
        payload: {
          message: approvalRequired
            ? "Your payment was received and your Famlo booking is pending host approval."
            : "Your Famlo booking has been confirmed from the payment webhook.",
        },
      });

      await appendLedgerEntryIfMissing(supabase, {
        bookingId: payment.booking_id,
        paymentId: payment.id,
        entryType: "payment_captured",
        accountCode: "cash_gateway_clearing",
        direction: "debit",
        amount:
          typeof payment.amount_total === "number" ? payment.amount_total : Number(payment.amount_total ?? 0),
        referenceType: "payment_webhook",
        referenceId: `${eventName}:${gatewayPaymentId || gatewayOrderId || payment.id}`,
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
        amount: typeof payment.tax_amount === "number" ? payment.tax_amount : Number(payment.tax_amount ?? 0),
        referenceType: "payment_webhook_tax",
        referenceId: `${eventName}:${gatewayPaymentId || gatewayOrderId || payment.id}`,
        metadata: {
          provider: "razorpay",
        },
      });

      const hostRelation = Array.isArray(booking?.hosts) ? booking.hosts[0] : booking?.hosts;
      const hommieRelation = Array.isArray(booking?.hommie_profiles_v2)
        ? booking.hommie_profiles_v2[0]
        : booking?.hommie_profiles_v2;

      const payoutId =
        booking?.recipient_type === "host" && booking.host_id && hostRelation?.user_id
          ? await ensureScheduledPayout(supabase, {
              bookingId: payment.booking_id,
              paymentId: payment.id,
              partnerType: "host",
              partnerUserId: String(hostRelation.user_id),
              partnerProfileId: String(booking.host_id),
              amount:
                typeof booking.partner_payout_amount === "number"
                  ? booking.partner_payout_amount
                  : Number(booking.partner_payout_amount ?? 0),
                pricingSnapshot: (booking.pricing_snapshot as Record<string, unknown> | null) ?? {},
                paymentTaxAmount: typeof payment.tax_amount === "number" ? payment.tax_amount : Number(payment.tax_amount ?? 0),
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
                paymentTaxAmount: typeof payment.tax_amount === "number" ? payment.tax_amount : Number(payment.tax_amount ?? 0),
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
      eventName,
      providerEventId: gatewayPaymentId || gatewayOrderId || `${eventName}:${payment.id}`,
      idempotencyKey: `payment_webhook:${eventName}:${gatewayPaymentId || gatewayOrderId || payment.id}`,
      payload,
      processingStatus: "processed",
    });

    return NextResponse.json({ received: true, paymentId: payment.id, bookingId: payment.booking_id });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to process payment webhook." },
      { status: 500 }
    );
  }
}
