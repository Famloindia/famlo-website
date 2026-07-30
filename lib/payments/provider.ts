import {
  createCashfreeOrder,
  fetchCashfreeOrder,
  fetchCashfreePaymentsForOrder,
  getCashfreeEnvironment,
  isCashfreeConfigured,
  type CashfreePaymentEntity,
} from "@/lib/cashfree";
import { createRazorpayOrder, fetchRazorpayPayment, isRazorpayConfigured } from "@/lib/razorpay";

export type PaymentProvider = "razorpay" | "cashfree";

export type ProviderCheckoutPayload =
  | {
      provider: "razorpay";
      keyId: string;
      orderId: string;
      amount: number;
      currency: string;
      bookingId: string;
      paymentRowId: string;
      checkoutBreakdown?: Record<string, unknown>;
    }
  | {
      provider: "cashfree";
      orderId: string;
      paymentSessionId: string;
      amount: number;
      currency: string;
      bookingId: string;
      paymentRowId: string;
      mode: "sandbox" | "production";
      checkoutBreakdown?: Record<string, unknown>;
    };

export type ProviderPaymentVerification = {
  provider: PaymentProvider;
  orderId: string;
  paymentId: string;
  status: string;
  amountMinor: number;
  raw: Record<string, unknown>;
};

export type ProviderPaymentOrderInput = {
  provider: PaymentProvider;
  bookingId: string;
  paymentId: string;
  amountMinor: number;
  currency?: string;
  hostId?: string | null;
  propertyId?: string | null;
  customer?: {
    id: string;
    name?: string | null;
    email?: string | null;
    phone?: string | null;
  };
  returnUrl?: string | null;
  notifyUrl?: string | null;
  checkoutBreakdown?: Record<string, unknown>;
};

export type ProviderPaymentOrderResult = {
  provider: PaymentProvider;
  externalOrderId: string;
  checkout: ProviderCheckoutPayload;
  raw: Record<string, unknown>;
};

export type ExistingProviderPaymentOrderInput = {
  provider: PaymentProvider;
  externalOrderId: string;
  bookingId: string;
  paymentId: string;
  amountMinor: number;
  currency?: string;
  checkoutBreakdown?: Record<string, unknown>;
};

function normalizeProvider(value: unknown): PaymentProvider | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "cashfree") return "cashfree";
  if (normalized === "razorpay") return "razorpay";
  return null;
}

function toRupees(amountMinor: number): number {
  return Math.max(0, Math.round(amountMinor)) / 100;
}

function amountToMinor(amount: unknown): number {
  if (typeof amount === "number" && Number.isFinite(amount)) return Math.max(0, Math.round(amount * 100));
  if (typeof amount === "string" && amount.trim().length > 0) {
    const parsed = Number(amount);
    return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed * 100)) : 0;
  }
  return 0;
}

function normalizePhone(value: string | null | undefined): string | null {
  if (!value) return null;
  const digits = value.replace(/[^\d]/g, "");
  if (digits.length === 10) return digits;
  if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
  if (digits.length > 10) return `+${digits}`;
  return null;
}

function buildCashfreeOrderId(paymentId: string): string {
  return `famlo_${paymentId}`.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 45);
}

export function getSelectedPaymentProvider(requested?: string | null): PaymentProvider {
  return normalizeProvider(requested) ?? normalizeProvider(process.env.FAMLO_PAYMENT_PROVIDER) ?? "razorpay";
}

export function isProviderConfigured(provider: PaymentProvider): boolean {
  return provider === "cashfree" ? isCashfreeConfigured() : isRazorpayConfigured();
}

export async function createProviderPaymentOrder(
  input: ProviderPaymentOrderInput
): Promise<ProviderPaymentOrderResult> {
  if (input.provider === "razorpay") {
    const order = await createRazorpayOrder({
      amountRupees: toRupees(input.amountMinor),
      receipt: input.paymentId,
      notes: {
        booking_id: input.bookingId,
        payment_intent_id: input.paymentId,
        ...(input.hostId ? { host_id: input.hostId } : {}),
        ...(input.propertyId ? { property_id: input.propertyId } : {}),
      },
    });

    return {
      provider: "razorpay",
      externalOrderId: order.id,
      raw: order as unknown as Record<string, unknown>,
      checkout: {
        provider: "razorpay",
        keyId: process.env.RAZORPAY_KEY_ID ?? "",
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        bookingId: input.bookingId,
        paymentRowId: input.paymentId,
        checkoutBreakdown: input.checkoutBreakdown,
      },
    };
  }

  const phone = normalizePhone(input.customer?.phone);
  if (!phone) {
    throw new Error("Verified guest phone is required for Cashfree checkout.");
  }

  const orderId = buildCashfreeOrderId(input.paymentId);
  const order = await createCashfreeOrder({
    orderId,
    amountMinor: input.amountMinor,
    currency: input.currency ?? "INR",
    customer: {
      customer_id: input.customer?.id ?? input.bookingId,
      customer_name: input.customer?.name ?? null,
      customer_email: input.customer?.email ?? null,
      customer_phone: phone,
    },
    returnUrl: input.returnUrl,
    notifyUrl: input.notifyUrl,
    orderNote: "Famlo booking payment",
    orderTags: {
      booking_id: input.bookingId,
      payment_id: input.paymentId,
      ...(input.hostId ? { host_id: input.hostId } : {}),
      ...(input.propertyId ? { property_id: input.propertyId } : {}),
    },
    idempotencyKey: `payment-order-${input.paymentId}`,
  });

  if (!order.payment_session_id) {
    throw new Error("Cashfree did not return a payment session id.");
  }

  return {
    provider: "cashfree",
    externalOrderId: order.order_id,
    raw: order as unknown as Record<string, unknown>,
    checkout: {
      provider: "cashfree",
      orderId: order.order_id,
      paymentSessionId: order.payment_session_id,
      amount: input.amountMinor,
      currency: order.order_currency ?? input.currency ?? "INR",
      bookingId: input.bookingId,
      paymentRowId: input.paymentId,
      mode: getCashfreeEnvironment(),
      checkoutBreakdown: input.checkoutBreakdown,
    },
  };
}

export async function fetchProviderPaymentOrder(
  input: ExistingProviderPaymentOrderInput
): Promise<ProviderPaymentOrderResult> {
  if (input.provider === "razorpay") {
    return {
      provider: "razorpay",
      externalOrderId: input.externalOrderId,
      raw: {},
      checkout: {
        provider: "razorpay",
        keyId: process.env.RAZORPAY_KEY_ID ?? "",
        orderId: input.externalOrderId,
        amount: input.amountMinor,
        currency: input.currency ?? "INR",
        bookingId: input.bookingId,
        paymentRowId: input.paymentId,
        checkoutBreakdown: input.checkoutBreakdown,
      },
    };
  }

  const order = await fetchCashfreeOrder(input.externalOrderId);
  if (!order.payment_session_id) {
    throw new Error("Cashfree order is missing its payment session id.");
  }

  return {
    provider: "cashfree",
    externalOrderId: order.order_id,
    raw: order as unknown as Record<string, unknown>,
    checkout: {
      provider: "cashfree",
      orderId: order.order_id,
      paymentSessionId: order.payment_session_id,
      amount: amountToMinor(order.order_amount),
      currency: order.order_currency ?? input.currency ?? "INR",
      bookingId: input.bookingId,
      paymentRowId: input.paymentId,
      mode: getCashfreeEnvironment(),
      checkoutBreakdown: input.checkoutBreakdown,
    },
  };
}

export async function verifyProviderPayment(input: {
  provider: PaymentProvider;
  orderId: string;
  paymentId?: string | null;
}): Promise<ProviderPaymentVerification | null> {
  if (input.provider === "razorpay") {
    if (!input.paymentId) return null;
    const payment = await fetchRazorpayPayment(input.paymentId);
    return {
      provider: "razorpay",
      orderId: payment.order_id ?? input.orderId,
      paymentId: payment.id,
      status: payment.status,
      amountMinor: Number(payment.amount ?? 0),
      raw: payment as unknown as Record<string, unknown>,
    };
  }

  const [order, payments] = await Promise.all([
    fetchCashfreeOrder(input.orderId),
    fetchCashfreePaymentsForOrder(input.orderId),
  ]);
  const successfulPayment =
    payments.find((payment) => String(payment.payment_status ?? "").toUpperCase() === "SUCCESS") ??
    payments.find((payment) => String(payment.cf_payment_id ?? "") === String(input.paymentId ?? ""));
  const payment = successfulPayment ?? payments[0] ?? null;
  if (!payment) {
    return {
      provider: "cashfree",
      orderId: order.order_id,
      paymentId: "",
      status: order.order_status ?? "ACTIVE",
      amountMinor: amountToMinor(order.order_amount),
      raw: order as unknown as Record<string, unknown>,
    };
  }

  return {
    provider: "cashfree",
    orderId: payment.order_id ?? order.order_id,
    paymentId: String(payment.cf_payment_id ?? ""),
    status: String(payment.payment_status ?? order.order_status ?? ""),
    amountMinor: amountToMinor(payment.payment_amount ?? order.order_amount),
    raw: payment as unknown as Record<string, unknown>,
  };
}

export function selectCashfreePaymentFromWebhook(payload: Record<string, unknown>): CashfreePaymentEntity | null {
  const data = payload.data;
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const payment = (data as Record<string, unknown>).payment;
  if (!payment || typeof payment !== "object" || Array.isArray(payment)) return null;
  return payment as CashfreePaymentEntity;
}

export function selectCashfreeOrderIdFromWebhook(payload: Record<string, unknown>): string | null {
  const data = payload.data;
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const order = (data as Record<string, unknown>).order;
  if (!order || typeof order !== "object" || Array.isArray(order)) return null;
  const orderId = (order as Record<string, unknown>).order_id;
  return typeof orderId === "string" && orderId.trim().length > 0 ? orderId.trim() : null;
}
