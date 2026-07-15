import crypto from "crypto";

import { getRazorpayConfig, verifyRazorpayWebhookSignature as verifyGenericRazorpayWebhookSignature } from "@/lib/razorpay";

type JsonRecord = Record<string, unknown>;

export type RazorpayPlanEntity = {
  id: string;
  entity: "plan";
  period: string;
  interval: number;
  item: {
    id?: string;
    name?: string;
    amount: number;
    currency: string;
    description?: string;
  };
  notes?: Record<string, string>;
};

export type RazorpaySubscriptionEntity = {
  id: string;
  entity: "subscription";
  plan_id: string;
  customer_id?: string | null;
  status: string;
  current_start?: number | null;
  current_end?: number | null;
  ended_at?: number | null;
  charge_at?: number | null;
  start_at?: number | null;
  total_count?: number | null;
  paid_count?: number | null;
  remaining_count?: number | null;
  auth_attempts?: number | null;
  notes?: Record<string, string>;
  short_url?: string | null;
};

type RazorpaySubscriptionWebhookPayload = {
  eventName: string;
  eventId: string | null;
  subscriptionId: string | null;
  paymentId: string | null;
  invoiceId: string | null;
  paymentStatus: string | null;
  subscriptionStatus: string | null;
  amountPaise: number | null;
  capturedAtIso: string | null;
  chargeAtIso: string | null;
  rawPayload: JsonRecord;
  notes: Record<string, string>;
  failureReason: string | null;
};

function requireSubscriptionConfig(): { keyId: string; keySecret: string; webhookSecret: string } {
  const { keyId, keySecret, webhookSecret } = getRazorpayConfig();
  if (!webhookSecret) {
    throw new Error("Missing required environment variable: RAZORPAY_WEBHOOK_SECRET");
  }
  return { keyId, keySecret, webhookSecret };
}

function buildAuthHeader(keyId: string, keySecret: string): string {
  return `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`;
}

async function callRazorpay<T>(path: string, init?: RequestInit): Promise<T> {
  const { keyId, keySecret } = requireSubscriptionConfig();
  const response = await fetch(`https://api.razorpay.com${path}`, {
    ...init,
    headers: {
      Authorization: buildAuthHeader(keyId, keySecret),
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  const payload = (await response.json()) as T & { error?: { description?: string } };
  if (!response.ok) {
    throw new Error(payload?.error?.description ?? `Razorpay request failed for ${path}.`);
  }
  return payload;
}

function toStringMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as JsonRecord)
      .map(([key, entry]) => [key, typeof entry === "string" ? entry : String(entry ?? "")])
      .filter(([key]) => key.trim().length > 0)
  );
}

function toIsoFromUnixSeconds(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  return new Date(value * 1000).toISOString();
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export async function createOrReuseProPlan(input: {
  amountPaise: number;
  subtotalPaise: number;
  gstPaise: number;
  propertyCount: number;
  roomCount: number;
  pricingVersion: string;
}): Promise<RazorpayPlanEntity> {
  const notes = {
    famlo_product: "famlo_pro",
    subtotal_paise: String(input.subtotalPaise),
    gst_paise: String(input.gstPaise),
    property_count: String(input.propertyCount),
    room_count: String(input.roomCount),
    pricing_version: input.pricingVersion,
  };

  return callRazorpay<RazorpayPlanEntity>("/v1/plans", {
    method: "POST",
    body: JSON.stringify({
      period: "monthly",
      interval: 1,
      item: {
        name: `Famlo Pro Monthly ₹${Math.round(input.amountPaise / 100)}`,
        amount: input.amountPaise,
        currency: "INR",
        description: "Famlo Pro monthly auto-renewal",
      },
      notes,
    }),
  });
}

export async function createProSubscription(input: {
  planId: string;
  totalCount: number;
  customerNotify?: boolean;
  notes?: Record<string, string>;
}): Promise<RazorpaySubscriptionEntity> {
  return callRazorpay<RazorpaySubscriptionEntity>("/v1/subscriptions", {
    method: "POST",
    body: JSON.stringify({
      plan_id: input.planId,
      total_count: input.totalCount,
      customer_notify: input.customerNotify ?? 1,
      notes: input.notes ?? {},
    }),
  });
}

export async function fetchProSubscription(subscriptionId: string): Promise<RazorpaySubscriptionEntity> {
  return callRazorpay<RazorpaySubscriptionEntity>(`/v1/subscriptions/${encodeURIComponent(subscriptionId)}`, {
    method: "GET",
  });
}

export async function cancelProSubscription(
  subscriptionId: string,
  options?: { cancelAtCycleEnd?: boolean }
): Promise<RazorpaySubscriptionEntity> {
  const query = options?.cancelAtCycleEnd === false ? "?cancel_at_cycle_end=0" : "?cancel_at_cycle_end=1";
  return callRazorpay<RazorpaySubscriptionEntity>(
    `/v1/subscriptions/${encodeURIComponent(subscriptionId)}/cancel${query}`,
    {
      method: "POST",
      body: JSON.stringify({}),
    }
  );
}

export function verifyRazorpaySubscriptionPaymentSignature(input: {
  paymentId: string;
  subscriptionId: string;
  signature: string;
}): boolean {
  const { keySecret } = requireSubscriptionConfig();
  const digest = crypto
    .createHmac("sha256", keySecret)
    .update(`${input.paymentId}|${input.subscriptionId}`)
    .digest("hex");
  return digest === input.signature;
}

export function verifyRazorpayWebhookSignature(body: string, signature: string, secret?: string): boolean {
  if (secret && secret !== process.env.RAZORPAY_WEBHOOK_SECRET) {
    const previous = process.env.RAZORPAY_WEBHOOK_SECRET;
    process.env.RAZORPAY_WEBHOOK_SECRET = secret;
    try {
      return verifyGenericRazorpayWebhookSignature(body, signature);
    } finally {
      process.env.RAZORPAY_WEBHOOK_SECRET = previous;
    }
  }
  requireSubscriptionConfig();
  return verifyGenericRazorpayWebhookSignature(body, signature);
}

export function parseRazorpaySubscriptionWebhook(event: JsonRecord): RazorpaySubscriptionWebhookPayload {
  const payload = (event.payload as JsonRecord | null) ?? {};
  const paymentEntity = ((payload.payment as JsonRecord | null)?.entity as JsonRecord | null) ?? {};
  const subscriptionEntity = ((payload.subscription as JsonRecord | null)?.entity as JsonRecord | null) ?? {};
  const invoiceEntity = ((payload.invoice as JsonRecord | null)?.entity as JsonRecord | null) ?? {};
  const eventName = asString(event.event) ?? "unknown";
  const notes = {
    ...toStringMap(subscriptionEntity.notes),
    ...toStringMap(paymentEntity.notes),
    ...toStringMap(invoiceEntity.notes),
  };

  return {
    eventName,
    eventId: asString((event["x-razorpay-event-id"] as unknown) ?? null) ?? null,
    subscriptionId:
      asString(subscriptionEntity.id) ??
      asString(paymentEntity.subscription_id) ??
      asString(invoiceEntity.subscription_id),
    paymentId: asString(paymentEntity.id),
    invoiceId: asString(invoiceEntity.id),
    paymentStatus: asString(paymentEntity.status) ?? asString(invoiceEntity.status),
    subscriptionStatus: asString(subscriptionEntity.status),
    amountPaise: asNumber(paymentEntity.amount) ?? asNumber(invoiceEntity.amount) ?? null,
    capturedAtIso: toIsoFromUnixSeconds(paymentEntity.captured_at) ?? toIsoFromUnixSeconds(invoiceEntity.paid_at),
    chargeAtIso: toIsoFromUnixSeconds(subscriptionEntity.charge_at) ?? toIsoFromUnixSeconds(invoiceEntity.expire_by),
    rawPayload: event,
    notes,
    failureReason:
      asString(paymentEntity.error_reason) ??
      asString(paymentEntity.error_description) ??
      asString(invoiceEntity.error_description) ??
      asString(subscriptionEntity.auth_attempts) ??
      null,
  };
}
