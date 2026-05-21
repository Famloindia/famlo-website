import type { SupabaseClient } from "@supabase/supabase-js";

import { upsertPaymentIntentAudit } from "@/lib/finance/payment-audit";
import { ensureBookingFinancialSnapshot } from "@/lib/finance/runtime";
import { createRazorpayOrder, isRazorpayConfigured } from "@/lib/razorpay";

type PaymentIntentRow = {
  id: string;
  booking_id: string;
  gateway: string;
  amount_total: number;
  platform_fee: number;
  tax_amount: number;
  partner_payout_amount: number;
  status: string;
  created_at: string;
  gateway_order_id: string | null;
  raw_response: Record<string, unknown> | null;
};

type JsonRecord = Record<string, unknown>;

export type PaymentIntentResult = {
  payment: PaymentIntentRow;
  order: Record<string, unknown> | null;
  integrationStatus: string;
  nextStep: string;
};

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

export function resolveInternalGuestPayableAmount(
  totalPrice: unknown,
  pricingSnapshot: JsonRecord | null
): number {
  const snapshotGuestPayable =
    typeof pricingSnapshot?.guest_payable_amount === "number"
      ? pricingSnapshot.guest_payable_amount
      : typeof pricingSnapshot?.guest_total === "number"
        ? pricingSnapshot.guest_total
        : null;
  const bookingTotal = typeof totalPrice === "number" ? totalPrice : Number(totalPrice ?? 0);
  return typeof snapshotGuestPayable === "number" && Number.isFinite(snapshotGuestPayable)
    ? snapshotGuestPayable
    : bookingTotal;
}

export function buildRazorpayOrderNotes(input: {
  bookingId: string;
  hostId?: string | null;
  propertyId?: string | null;
  paymentIntentId: string;
}): Record<string, string> {
  const notes: Record<string, string> = {
    booking_id: input.bookingId,
    payment_intent_id: input.paymentIntentId,
  };
  const hostId = asString(input.hostId);
  const propertyId = asString(input.propertyId);
  if (hostId) notes.host_id = hostId;
  if (propertyId) notes.property_id = propertyId;
  return notes;
}

export async function createPaymentIntentForBooking(
  supabase: SupabaseClient,
  input: { bookingId: string; gateway?: string | null }
): Promise<PaymentIntentResult> {
  const bookingId = String(input.bookingId ?? "").trim();
  const gateway = String(input.gateway ?? "razorpay").trim() || "razorpay";

  if (!bookingId) {
    throw new Error("bookingId is required.");
  }

  const { data: booking, error: bookingError } = await supabase
    .from("bookings_v2")
    .select("id,booking_type,total_price,partner_payout_amount,pricing_snapshot,payment_id,host_id,stay_unit_id")
    .eq("id", bookingId)
    .maybeSingle();

  if (bookingError) throw bookingError;
  if (!booking) {
    throw new Error("Booking not found.");
  }

  const pricingSnapshot = (booking.pricing_snapshot as Record<string, unknown> | null) ?? {};
  const amountTotal = resolveInternalGuestPayableAmount(booking.total_price, pricingSnapshot);
  const platformFee =
    typeof pricingSnapshot.platform_fee === "number"
      ? pricingSnapshot.platform_fee
      : Number(pricingSnapshot.platform_fee ?? 0);
  const taxAmount =
    typeof pricingSnapshot.tax_amount === "number"
      ? pricingSnapshot.tax_amount
      : Number(pricingSnapshot.tax_amount ?? 0);

  const existingPaymentResult = booking.payment_id
    ? await supabase
        .from("payments_v2")
        .select("id,gateway_order_id,raw_response")
        .eq("id", booking.payment_id)
        .maybeSingle()
    : await supabase
        .from("payments_v2")
        .select("id,gateway_order_id,raw_response")
        .eq("booking_id", bookingId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

  if (existingPaymentResult.error) {
    throw existingPaymentResult.error;
  }

  const existingPayment = existingPaymentResult.data;
  const manualFallback = !isRazorpayConfigured() || gateway !== "razorpay";

  const { data: payment, error: paymentError } = await supabase
    .from("payments_v2")
    .upsert(
      {
        id: existingPayment?.id ?? booking.payment_id ?? undefined,
        booking_id: bookingId,
        gateway,
        amount_total: amountTotal,
        platform_fee: platformFee,
        tax_amount: taxAmount,
        partner_payout_amount:
          typeof booking.partner_payout_amount === "number"
            ? booking.partner_payout_amount
            : Number(booking.partner_payout_amount ?? 0),
        status: "created",
        raw_response: {
          ...((existingPayment?.raw_response as Record<string, unknown> | null) ?? {}),
          intent_type: manualFallback ? "manual_integration_pending" : "razorpay_order_pending",
          internal_guest_payable_amount: amountTotal,
        },
      },
      { onConflict: "id" }
    )
    .select("id,booking_id,gateway,amount_total,platform_fee,tax_amount,partner_payout_amount,status,created_at,gateway_order_id,raw_response")
    .single();

  if (paymentError) throw paymentError;

  let orderPayload: Record<string, unknown> | null = null;
  let integrationStatus = "ready_for_gateway";
  let nextStep =
    "Create your Razorpay or Stripe order from this pricing payload, then write the gateway IDs back into payments_v2 on capture.";

  if (!manualFallback) {
    const propertyId =
      asString(pricingSnapshot.property_id) ??
      asString(pricingSnapshot.propertyId) ??
      asString(booking.stay_unit_id);
    const order =
      typeof payment.gateway_order_id === "string" && payment.gateway_order_id.length > 0
        ? {
            id: payment.gateway_order_id,
            amount: amountTotal * 100,
            currency: "INR",
          }
        : await createRazorpayOrder({
            amountRupees: amountTotal,
            receipt: payment.id,
            notes: buildRazorpayOrderNotes({
              bookingId,
              hostId: asString(booking.host_id),
              propertyId,
              paymentIntentId: payment.id,
            }),
          });

    const { error: orderUpdateError } = await supabase
      .from("payments_v2")
      .update({
        gateway: "razorpay",
        gateway_order_id: order.id,
        raw_response: {
          ...((payment.raw_response as Record<string, unknown> | null) ?? {}),
          razorpay_order: order,
        },
      } as never)
      .eq("id", payment.id);

    if (orderUpdateError) {
      throw orderUpdateError;
    }

    orderPayload = {
      provider: "razorpay",
      keyId: process.env.RAZORPAY_KEY_ID ?? "",
      orderId: order.id,
      amount: order.amount,
      currency: "INR",
      bookingId,
      paymentRowId: payment.id,
    };
    integrationStatus = "razorpay_ready";
    nextStep = "Open Razorpay Checkout with this order payload, then call /api/payments/verify on success.";
  }

  await Promise.all([
    ensureBookingFinancialSnapshot(supabase, {
      bookingId,
      paymentId: payment.id,
      currency: "INR",
      bookingType: typeof booking.booking_type === "string" ? booking.booking_type : null,
      pricingSnapshot,
      totalPrice: amountTotal,
      partnerPayoutAmount:
        typeof booking.partner_payout_amount === "number"
          ? booking.partner_payout_amount
          : Number(booking.partner_payout_amount ?? 0),
    }),
    upsertPaymentIntentAudit(supabase, {
      bookingId,
      paymentId: payment.id,
      provider: gateway,
      amountTotal,
      currency: "INR",
      providerOrderId:
        typeof orderPayload?.orderId === "string" ? orderPayload.orderId : payment.gateway_order_id ?? null,
      idempotencyKey: `payment_intent:${bookingId}:${gateway}`,
      status: "created",
      metadata: {
        integrationStatus,
        nextStep,
      },
    }),
    supabase
      .from("bookings_v2")
      .update({ payment_id: payment.id, payment_status: "pending" } as never)
      .eq("id", bookingId)
      .then(({ error }) => {
        if (error) throw error;
      }),
  ]);

  return {
    payment,
    order: orderPayload,
    integrationStatus,
    nextStep,
  };
}
