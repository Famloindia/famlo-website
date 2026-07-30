import type { SupabaseClient } from "@supabase/supabase-js";

import { isCheckoutSection95PricingEnabled } from "@/lib/finance/feature-flags";
import { isSection95TaxMode } from "@/lib/finance/finance-contracts";
import { calculateSection95FinanceContract } from "@/lib/finance/section-9-5-engine";
import { getFinanceSettings } from "@/lib/finance/settings";
import { upsertPaymentIntentAudit } from "@/lib/finance/payment-audit";
import { ensureBookingFinancialSnapshot } from "@/lib/finance/runtime";
import {
  createProviderPaymentOrder,
  fetchProviderPaymentOrder,
  getSelectedPaymentProvider,
  isProviderConfigured,
  type ProviderCheckoutPayload,
} from "@/lib/payments/provider";
import { getPublicSiteUrl } from "@/lib/site-url";
import { loadUserProfileCompatibility } from "@/lib/user-profile";

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

type ResolvedCheckoutPricing = {
  amountTotal: number;
  platformFee: number;
  taxAmount: number;
  partnerPayoutAmount: number;
  pricingSnapshot: JsonRecord;
};

export type PaymentIntentResult = {
  payment: PaymentIntentRow;
  order: ProviderCheckoutPayload | null;
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

type CheckoutPricingBreakdown = {
  roomBaseAmount: number;
  accommodationGstAmount: number;
  guestPayableAmount: number;
  calculationVersion: string | null;
  famloPlatformFeeInclGst: number;
  famloPlatformFeeTaxable: number;
  famloPlatformFeeGst: number;
  hostGrossPayout: number;
  gatewayFeeEstimate: number;
};

function normalizeSection95Nights(value: unknown): Array<{ roomId?: string | null; date?: string | null; listedValue?: number | null; actualValue: number }> {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const record = item as JsonRecord;
      const actualValue = Number(record.actualValue ?? record.actual_value ?? record.amount ?? 0);
      if (!Number.isFinite(actualValue)) return null;
      return {
        roomId: asString(record.roomId ?? record.room_id),
        date: asString(record.date),
        listedValue: Number(record.listedValue ?? record.listed_value ?? actualValue),
        actualValue,
      };
    })
    .filter(Boolean) as Array<{ roomId?: string | null; date?: string | null; listedValue?: number | null; actualValue: number }>;
}

export function extractCheckoutPricingBreakdown(pricingSnapshot: JsonRecord | null | undefined): CheckoutPricingBreakdown {
  const snapshot = pricingSnapshot ?? {};
  const section95Contract =
    snapshot.section_9_5_contract && typeof snapshot.section_9_5_contract === "object" && !Array.isArray(snapshot.section_9_5_contract)
      ? (snapshot.section_9_5_contract as JsonRecord)
      : null;

  return {
    roomBaseAmount: Number(snapshot.room_base_amount ?? section95Contract?.roomBaseAmount ?? 0),
    accommodationGstAmount: Number(snapshot.accommodation_gst_amount ?? section95Contract?.accommodationGstAmount ?? 0),
    guestPayableAmount: Number(snapshot.guest_payable_amount ?? section95Contract?.guestPayableAmount ?? 0),
    calculationVersion: asString(snapshot.calculation_version ?? section95Contract?.calculationVersion),
    famloPlatformFeeInclGst: Number(snapshot.famlo_platform_fee_incl_gst ?? section95Contract?.famloPlatformFeeInclGst ?? snapshot.platform_fee ?? 0),
    famloPlatformFeeTaxable: Number(snapshot.famlo_platform_fee_taxable ?? section95Contract?.famloPlatformFeeTaxable ?? 0),
    famloPlatformFeeGst: Number(snapshot.famlo_platform_fee_gst ?? section95Contract?.famloPlatformFeeGst ?? 0),
    hostGrossPayout: Number(snapshot.host_gross_payout ?? section95Contract?.hostGrossPayout ?? 0),
    gatewayFeeEstimate: Number(snapshot.gateway_fee_estimate ?? section95Contract?.gatewayFeeTotal ?? 0),
  };
}

export async function resolveCheckoutPricingForPaymentIntent(
  supabase: SupabaseClient,
  input: {
    totalPrice: number;
    partnerPayoutAmount: number;
    pricingSnapshot: JsonRecord | null;
  }
): Promise<ResolvedCheckoutPricing> {
  const snapshot = { ...(input.pricingSnapshot ?? {}) };
  const fallbackAmount = resolveInternalGuestPayableAmount(input.totalPrice, snapshot);
  const fallbackPlatformFee =
    typeof snapshot.platform_fee === "number" ? snapshot.platform_fee : Number(snapshot.platform_fee ?? 0);
  const fallbackTaxAmount =
    typeof snapshot.tax_amount === "number" ? snapshot.tax_amount : Number(snapshot.tax_amount ?? 0);
  const fallbackPartnerPayout = Number.isFinite(input.partnerPayoutAmount) ? input.partnerPayoutAmount : 0;

  if (!isCheckoutSection95PricingEnabled()) {
    return {
      amountTotal: fallbackAmount,
      platformFee: fallbackPlatformFee,
      taxAmount: fallbackTaxAmount,
      partnerPayoutAmount: fallbackPartnerPayout,
      pricingSnapshot: snapshot,
    };
  }

  const settings = await getFinanceSettings({}, supabase);
  if (!isSection95TaxMode(settings.taxMode)) {
    return {
      amountTotal: fallbackAmount,
      platformFee: fallbackPlatformFee,
      taxAmount: fallbackTaxAmount,
      partnerPayoutAmount: fallbackPartnerPayout,
      pricingSnapshot: snapshot,
    };
  }

  const section95Input = (snapshot.section_9_5_input as JsonRecord | null) ?? null;
  const nights = normalizeSection95Nights(
    snapshot.section_9_5_input_nights ?? section95Input?.nights ?? snapshot.room_nights
  );
  if (nights.length === 0) {
    return {
      amountTotal: fallbackAmount,
      platformFee: fallbackPlatformFee,
      taxAmount: fallbackTaxAmount,
      partnerPayoutAmount: fallbackPartnerPayout,
      pricingSnapshot: snapshot,
    };
  }

  const contract = calculateSection95FinanceContract({
    taxMode: settings.taxMode as any,
    nights,
  });

  const nextSnapshot: JsonRecord = {
    ...snapshot,
    guest_payable_amount: contract.guestPayableAmount,
    room_base_amount: contract.roomBaseAmount,
    accommodation_gst_amount: contract.accommodationGstAmount,
    calculation_version: contract.calculationVersion,
    famlo_platform_fee_incl_gst: contract.famloPlatformFeeInclGst,
    famlo_platform_fee_taxable: contract.famloPlatformFeeTaxable,
    famlo_platform_fee_gst: contract.famloPlatformFeeGst,
    host_gross_payout: contract.hostGrossPayout,
    platform_fee: contract.famloPlatformFeeInclGst,
    tax_amount: contract.accommodationGstAmount,
    partner_payout_amount: contract.hostNetPayout,
    gateway_fee_estimate: contract.gatewayFeeTotal,
    section_9_5_contract: {
      taxMode: contract.taxMode,
      calculationVersion: contract.calculationVersion,
      roomBaseAmount: contract.roomBaseAmount,
      accommodationGstAmount: contract.accommodationGstAmount,
      guestPayableAmount: contract.guestPayableAmount,
      famloPlatformFeeInclGst: contract.famloPlatformFeeInclGst,
      famloPlatformFeeTaxable: contract.famloPlatformFeeTaxable,
      famloPlatformFeeGst: contract.famloPlatformFeeGst,
      hostGrossPayout: contract.hostGrossPayout,
    },
    finance_snapshot: {
      ...((snapshot.finance_snapshot as JsonRecord | null) ?? {}),
      calculation_mode: "section_9_5",
      contract_v1: {
        booking_amount: contract.roomBaseAmount,
        amount_after_discount: contract.roomBaseAmount,
        platform_fee: contract.famloPlatformFeeInclGst,
        gst_on_platform_fee: contract.famloPlatformFeeGst,
        guest_total: contract.guestPayableAmount,
        host_payout: contract.hostNetPayout,
        stay_tax_amount: contract.accommodationGstAmount,
        tds_amount: contract.tdsAmount,
        tcs_amount: contract.tcsAmount,
        famlo_net_revenue: contract.famloPlatformFeeTaxable,
        commission_rate_bps: 1600,
        calculation_version: contract.calculationVersion,
      },
      tax_breakdown: {
        accommodation_gst_amount: contract.accommodationGstAmount,
        accommodation_gst_lines: contract.accommodationGstBreakdown,
      },
      payout_breakdown: {
        host_gross_payout: contract.hostGrossPayout,
        host_net_payout: contract.hostNetPayout,
        tds_amount: contract.tdsAmount,
      },
    },
  };

  return {
    amountTotal: contract.guestPayableAmount,
    platformFee: contract.famloPlatformFeeInclGst,
    taxAmount: contract.accommodationGstAmount,
    partnerPayoutAmount: contract.hostNetPayout,
    pricingSnapshot: nextSnapshot,
  };
}

export async function createPaymentIntentForBooking(
  supabase: SupabaseClient,
  input: { bookingId: string; gateway?: string | null }
): Promise<PaymentIntentResult> {
  const bookingId = String(input.bookingId ?? "").trim();
  const gateway = getSelectedPaymentProvider(input.gateway);

  if (!bookingId) {
    throw new Error("bookingId is required.");
  }

  const { data: booking, error: bookingError } = await supabase
    .from("bookings_v2")
    .select("id,booking_type,total_price,partner_payout_amount,pricing_snapshot,payment_id,host_id,stay_unit_id,user_id")
    .eq("id", bookingId)
    .maybeSingle();

  if (bookingError) throw bookingError;
  if (!booking) {
    throw new Error("Booking not found.");
  }

  const basePricingSnapshot = (booking.pricing_snapshot as Record<string, unknown> | null) ?? {};
  const resolvedPricing = await resolveCheckoutPricingForPaymentIntent(supabase, {
    totalPrice: Number(booking.total_price ?? 0),
    partnerPayoutAmount:
      typeof booking.partner_payout_amount === "number"
        ? booking.partner_payout_amount
        : Number(booking.partner_payout_amount ?? 0),
    pricingSnapshot: basePricingSnapshot,
  });
  const pricingSnapshot = resolvedPricing.pricingSnapshot;
  const amountTotal = resolvedPricing.amountTotal;
  const platformFee = resolvedPricing.platformFee;
  const taxAmount = resolvedPricing.taxAmount;

  const existingPaymentResult = booking.payment_id
    ? await supabase
        .from("payments_v2")
        .select("id,booking_id,gateway,gateway_order_id,raw_response,amount_total,platform_fee,tax_amount,partner_payout_amount,status,created_at,payment_attempt_number")
        .eq("id", booking.payment_id)
        .maybeSingle()
    : await supabase
        .from("payments_v2")
        .select("id,booking_id,gateway,gateway_order_id,raw_response,amount_total,platform_fee,tax_amount,partner_payout_amount,status,created_at,payment_attempt_number")
        .eq("booking_id", bookingId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

  if (existingPaymentResult.error) {
    throw existingPaymentResult.error;
  }

  const existingPayment = existingPaymentResult.data;
  const existingStatus = String(existingPayment?.status ?? "").trim().toLowerCase();
  if (existingPayment && ["paid", "captured", "refunded", "partially_refunded"].includes(existingStatus)) {
    return {
      payment: existingPayment as PaymentIntentRow,
      order: null,
      integrationStatus: "already_paid",
      nextStep: "Use the existing canonical payment and booking state.",
    };
  }

  const manualFallback = !isProviderConfigured(gateway);
  const existingGateway = String(existingPayment?.gateway ?? "").trim().toLowerCase();
  const reuseExistingPayment = Boolean(existingPayment && existingGateway === gateway);
  const paymentAttemptNumber = reuseExistingPayment
    ? Number(existingPayment?.payment_attempt_number ?? 1)
    : Math.max(1, Number(existingPayment?.payment_attempt_number ?? 0) + 1);
  const paymentIdempotencyKey = `booking-payment:${bookingId}:${gateway}:${paymentAttemptNumber}`;

  const { data: payment, error: paymentError } = await supabase
    .from("payments_v2")
    .upsert(
      {
        id: reuseExistingPayment ? existingPayment?.id : undefined,
        booking_id: bookingId,
        gateway,
        provider: gateway,
        amount_total: amountTotal,
        amount_minor: amountTotal * 100,
        platform_fee: platformFee,
        tax_amount: taxAmount,
        partner_payout_amount:
          resolvedPricing.partnerPayoutAmount,
        payment_attempt_number: paymentAttemptNumber,
        idempotency_key: paymentIdempotencyKey,
        status: "created",
        raw_response: {
          ...((reuseExistingPayment ? existingPayment?.raw_response : null) as Record<string, unknown> | null),
          intent_type: manualFallback ? "manual_integration_pending" : `${gateway}_order_pending`,
          internal_guest_payable_amount: amountTotal,
        },
      },
      { onConflict: "id" }
    )
    .select("id,booking_id,gateway,amount_total,platform_fee,tax_amount,partner_payout_amount,status,created_at,gateway_order_id,raw_response")
    .single();

  if (paymentError) throw paymentError;

  let orderPayload: ProviderCheckoutPayload | null = null;
  let integrationStatus = "ready_for_gateway";
  let nextStep =
    "Create your provider order from this pricing payload, then write the gateway IDs back into payments_v2 on capture.";

  if (!manualFallback) {
    const checkoutBreakdown = extractCheckoutPricingBreakdown(pricingSnapshot);
    const propertyId =
      asString(pricingSnapshot.property_id) ??
      asString(pricingSnapshot.propertyId) ??
      asString(booking.stay_unit_id);
    const customerProfile =
      typeof booking.user_id === "string" && booking.user_id.trim().length > 0
        ? await loadUserProfileCompatibility(supabase, booking.user_id)
        : null;
    const baseUrl = getPublicSiteUrl();
    const returnUrl = `${baseUrl}/api/payments/cashfree/return?bookingId=${encodeURIComponent(
      bookingId
    )}&paymentRowId=${encodeURIComponent(payment.id)}&order_id={order_id}`;
    const notifyUrl = new URL("/api/payments/cashfree/webhook", baseUrl);
    const orderResult =
      typeof payment.gateway_order_id === "string" && payment.gateway_order_id.length > 0
        ? await fetchProviderPaymentOrder({
            provider: gateway,
            externalOrderId: payment.gateway_order_id,
            bookingId,
            paymentId: payment.id,
            amountMinor: amountTotal * 100,
            currency: "INR",
            checkoutBreakdown,
          })
        : await createProviderPaymentOrder({
            provider: gateway,
            bookingId,
            paymentId: payment.id,
            amountMinor: amountTotal * 100,
            currency: "INR",
            hostId: asString(booking.host_id),
            propertyId,
            customer: {
              id: asString(booking.user_id) ?? bookingId,
              name: customerProfile?.name ?? null,
              email: customerProfile?.email ?? null,
              phone: customerProfile?.phone ?? null,
            },
            returnUrl: gateway === "cashfree" ? returnUrl : null,
            notifyUrl: gateway === "cashfree" ? notifyUrl.toString() : null,
            checkoutBreakdown,
          });
    const externalOrderId = orderResult?.externalOrderId ?? payment.gateway_order_id;
    if (!externalOrderId) {
      throw new Error("Payment provider order id was not created.");
    }

    const { error: orderUpdateError } = await supabase
      .from("payments_v2")
      .update({
        gateway,
        provider: gateway,
        gateway_order_id: externalOrderId,
        external_order_id: externalOrderId,
        amount_minor: amountTotal * 100,
        idempotency_key: paymentIdempotencyKey,
        provider_status: "ACTIVE",
        order_expires_at:
          typeof orderResult?.raw.order_expiry_time === "string"
            ? orderResult.raw.order_expiry_time
            : null,
        raw_response: {
          ...((payment.raw_response as Record<string, unknown> | null) ?? {}),
          provider_order: orderResult?.raw ?? {},
        },
      } as never)
      .eq("id", payment.id);

    if (orderUpdateError) {
      throw orderUpdateError;
    }

    orderPayload = orderResult.checkout;
    integrationStatus = `${gateway}_ready`;
    nextStep =
      gateway === "cashfree"
        ? "Open Cashfree Hosted Checkout with the payment session id. Treat return callbacks as advisory and wait for the verified webhook."
        : "Open Razorpay Checkout with this order payload, then call /api/payments/verify on success.";
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
        resolvedPricing.partnerPayoutAmount,
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
