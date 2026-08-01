import crypto from "crypto";

import { assertRuntimeSafety, isRuntimeSafetySatisfied } from "@/lib/app-env";

export type CashfreeEnvironment = "sandbox" | "production";

export interface CashfreeCustomerDetails {
  customer_id: string;
  customer_name?: string | null;
  customer_email?: string | null;
  customer_phone: string;
}

export interface CashfreeOrderInput {
  orderId: string;
  amountMinor: number;
  currency?: string;
  customer: CashfreeCustomerDetails;
  returnUrl?: string | null;
  notifyUrl?: string | null;
  orderNote?: string | null;
  orderTags?: Record<string, string>;
  idempotencyKey?: string | null;
}

export interface CashfreeOrder {
  cf_order_id?: string;
  entity?: string;
  order_id: string;
  order_amount: number;
  order_currency: string;
  order_status?: string;
  payment_session_id?: string;
  order_expiry_time?: string;
  order_meta?: Record<string, unknown>;
  order_tags?: Record<string, string> | null;
}

export interface CashfreePaymentEntity {
  cf_payment_id?: string;
  order_id?: string;
  entity?: string;
  payment_amount?: number;
  payment_currency?: string;
  payment_status?: string;
  payment_time?: string;
  payment_completion_time?: string;
  payment_message?: string;
  bank_reference?: string;
  auth_id?: string;
  payment_group?: string;
}

export interface CashfreeRefund {
  cf_payment_id?: string;
  cf_refund_id?: string;
  order_id?: string;
  refund_id: string;
  entity?: "refund";
  refund_amount: number;
  refund_status?: string;
  refund_note?: string;
  refund_arn?: string;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function safeCompare(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function toCashfreeAmount(amountMinor: number): number {
  return Number((Math.max(0, Math.round(amountMinor)) / 100).toFixed(2));
}

function getCashfreeBaseUrl(environment: CashfreeEnvironment): string {
  return environment === "production" ? "https://api.cashfree.com/pg" : "https://sandbox.cashfree.com/pg";
}

export function getCashfreeEnvironment(): CashfreeEnvironment {
  const value = String(process.env.CASHFREE_ENV ?? "sandbox").trim().toLowerCase();
  return value === "production" ? "production" : "sandbox";
}

export function getCashfreeConfig(): {
  clientId: string;
  clientSecret: string;
  environment: CashfreeEnvironment;
  apiVersion: string;
  baseUrl: string;
} {
  assertRuntimeSafety("cashfree");
  const environment = getCashfreeEnvironment();
  return {
    clientId: requireEnv("CASHFREE_CLIENT_ID"),
    clientSecret: requireEnv("CASHFREE_CLIENT_SECRET"),
    environment,
    apiVersion: process.env.CASHFREE_API_VERSION ?? "2026-01-01",
    baseUrl: getCashfreeBaseUrl(environment),
  };
}

export function isCashfreeConfigured(): boolean {
  return (
    Boolean(process.env.CASHFREE_CLIENT_ID && process.env.CASHFREE_CLIENT_SECRET) &&
    isRuntimeSafetySatisfied("cashfree")
  );
}

async function callCashfree<T>(
  path: string,
  init: RequestInit & { idempotencyKey?: string | null } = {}
): Promise<T> {
  const { clientId, clientSecret, apiVersion, baseUrl } = getCashfreeConfig();
  const timeoutMs = Math.max(3_000, Math.min(Number(process.env.CASHFREE_REQUEST_TIMEOUT_MS) || 8_000, 15_000));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "x-api-version": apiVersion,
        "x-client-id": clientId,
        "x-client-secret": clientSecret,
        ...(init.idempotencyKey ? { "x-idempotency-key": init.idempotencyKey } : {}),
        ...(init.headers ?? {}),
      },
      cache: "no-store",
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Cashfree did not respond in time. Please try again.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  const payload = (await response.json().catch(() => ({}))) as T & { message?: string; error?: string };
  if (!response.ok) {
    throw new Error(payload.message ?? payload.error ?? `Cashfree request failed for ${path}.`);
  }
  return payload;
}

export async function createCashfreeOrder(input: CashfreeOrderInput): Promise<CashfreeOrder> {
  const body = {
    order_id: input.orderId,
    order_amount: toCashfreeAmount(input.amountMinor),
    order_currency: input.currency ?? "INR",
    customer_details: {
      customer_id: input.customer.customer_id,
      customer_name: input.customer.customer_name ?? undefined,
      customer_email: input.customer.customer_email ?? undefined,
      customer_phone: input.customer.customer_phone,
    },
    order_meta: {
      return_url: input.returnUrl ?? undefined,
      notify_url: input.notifyUrl ?? undefined,
    },
    order_note: input.orderNote ?? undefined,
    order_tags: input.orderTags ?? undefined,
  };

  return callCashfree<CashfreeOrder>("/orders", {
    method: "POST",
    body: JSON.stringify(body),
    idempotencyKey: input.idempotencyKey,
  });
}

export async function fetchCashfreeOrder(orderId: string): Promise<CashfreeOrder> {
  return callCashfree<CashfreeOrder>(`/orders/${encodeURIComponent(orderId)}`, {
    method: "GET",
  });
}

export async function fetchCashfreePaymentsForOrder(orderId: string): Promise<CashfreePaymentEntity[]> {
  return callCashfree<CashfreePaymentEntity[]>(`/orders/${encodeURIComponent(orderId)}/payments`, {
    method: "GET",
  });
}

export async function createCashfreeRefund(params: {
  orderId: string;
  refundId: string;
  amountMinor: number;
  note?: string | null;
  idempotencyKey?: string | null;
}): Promise<CashfreeRefund> {
  return callCashfree<CashfreeRefund>(`/orders/${encodeURIComponent(params.orderId)}/refunds`, {
    method: "POST",
    body: JSON.stringify({
      refund_amount: toCashfreeAmount(params.amountMinor),
      refund_id: params.refundId,
      refund_note: params.note ?? undefined,
      refund_speed: "STANDARD",
    }),
    idempotencyKey: params.idempotencyKey,
  });
}

export async function fetchCashfreeRefund(orderId: string, refundId: string): Promise<CashfreeRefund> {
  return callCashfree<CashfreeRefund>(
    `/orders/${encodeURIComponent(orderId)}/refunds/${encodeURIComponent(refundId)}`,
    {
      method: "GET",
    }
  );
}

export function verifyCashfreeWebhookSignature(params: {
  rawBody: string;
  timestamp: string;
  signature: string;
}): boolean {
  const { clientSecret } = getCashfreeConfig();
  const digest = crypto
    .createHmac("sha256", clientSecret)
    .update(`${params.timestamp}${params.rawBody}`)
    .digest("base64");
  return safeCompare(digest, params.signature);
}

export function isCashfreeSuccessStatus(status: unknown): boolean {
  return String(status ?? "").trim().toUpperCase() === "SUCCESS";
}

export function isCashfreeFailureStatus(status: unknown): boolean {
  const normalized = String(status ?? "").trim().toUpperCase();
  return normalized === "FAILED" || normalized === "CANCELLED" || normalized === "VOID";
}

export function isCashfreeUserDroppedStatus(status: unknown): boolean {
  return String(status ?? "").trim().toUpperCase() === "USER_DROPPED";
}

export function cashfreeAmountToMinor(amount: unknown): number {
  if (typeof amount === "number" && Number.isFinite(amount)) return Math.max(0, Math.round(amount * 100));
  if (typeof amount === "string" && amount.trim().length > 0) {
    const parsed = Number(amount);
    return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed * 100)) : 0;
  }
  return 0;
}
