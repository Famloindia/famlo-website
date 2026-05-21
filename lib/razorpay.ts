import crypto from "crypto";

export interface RazorpayOrderInput {
  amountRupees: number;
  receipt: string;
  notes?: Record<string, string>;
}

export interface RazorpayOrder {
  id: string;
  entity: string;
  amount: number;
  amount_paid: number;
  amount_due: number;
  currency: string;
  receipt: string;
  status: string;
  attempts: number;
  created_at: number;
  notes?: Record<string, string>;
}

export interface RazorpayRefund {
  id: string;
  entity: string;
  amount: number;
  currency: string;
  payment_id: string;
  notes?: Record<string, string>;
  status?: string;
}

export interface RazorpayPaymentEntity {
  id: string;
  entity: string;
  amount: number;
  currency: string;
  status: string;
  order_id?: string;
  method?: string;
  amount_refunded?: number;
  notes?: Record<string, string>;
}

export interface RazorpayPayout {
  id: string;
  entity: string;
  amount: number;
  currency: string;
  status: string;
  fund_account_id?: string;
  reference_id?: string;
  mode?: string;
  purpose?: string;
  narration?: string;
}

export interface RazorpayXContact {
  id: string;
  entity: string;
  name: string;
  type?: string;
  email?: string;
  contact?: string;
  reference_id?: string;
  active?: boolean;
}

export interface RazorpayXFundAccount {
  id: string;
  entity: string;
  contact_id: string;
  account_type: "bank_account" | "vpa";
  active?: boolean;
  bank_account?: {
    name?: string;
    ifsc?: string;
    bank_name?: string;
    account_number?: string;
  };
  vpa?: {
    address?: string;
  };
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

export function getRazorpayConfig(): { keyId: string; keySecret: string; webhookSecret?: string } {
  return {
    keyId: requireEnv("RAZORPAY_KEY_ID"),
    keySecret: requireEnv("RAZORPAY_KEY_SECRET"),
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET,
  };
}

export function isRazorpayConfigured(): boolean {
  return Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
}

function getRazorpayXConfig(): { keyId: string; keySecret: string; accountNumber: string } {
  return {
    keyId: requireEnv("RAZORPAYX_KEY_ID"),
    keySecret: requireEnv("RAZORPAYX_KEY_SECRET"),
    accountNumber: requireEnv("RAZORPAYX_ACCOUNT_NUMBER"),
  };
}

export function isRazorpayXConfigured(): boolean {
  return Boolean(process.env.RAZORPAYX_KEY_ID && process.env.RAZORPAYX_KEY_SECRET && process.env.RAZORPAYX_ACCOUNT_NUMBER);
}

export async function createRazorpayOrder(input: RazorpayOrderInput): Promise<RazorpayOrder> {
  const { keyId, keySecret } = getRazorpayConfig();
  const amountPaise = Math.max(0, Math.round(input.amountRupees * 100));

  const response = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount: amountPaise,
      currency: "INR",
      receipt: input.receipt,
      notes: input.notes ?? {},
    }),
    cache: "no-store",
  });

  const payload = (await response.json()) as RazorpayOrder & { error?: { description?: string } };
  if (!response.ok) {
    throw new Error(payload?.error?.description ?? "Failed to create Razorpay order.");
  }

  return payload;
}

export async function createRazorpayRefund(params: {
  paymentId: string;
  amountRupees?: number;
  notes?: Record<string, string>;
}): Promise<RazorpayRefund> {
  const { keyId, keySecret } = getRazorpayConfig();
  const response = await fetch(`https://api.razorpay.com/v1/payments/${params.paymentId}/refund`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ...(typeof params.amountRupees === "number" ? { amount: Math.max(0, Math.round(params.amountRupees * 100)) } : {}),
      notes: params.notes ?? {},
    }),
    cache: "no-store",
  });

  const payload = (await response.json()) as RazorpayRefund & { error?: { description?: string } };
  if (!response.ok) {
    throw new Error(payload?.error?.description ?? "Failed to create Razorpay refund.");
  }

  return payload;
}

export async function fetchRazorpayPayment(paymentId: string): Promise<RazorpayPaymentEntity> {
  const { keyId, keySecret } = getRazorpayConfig();
  const response = await fetch(`https://api.razorpay.com/v1/payments/${paymentId}`, {
    method: "GET",
    headers: {
      Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  const payload = (await response.json()) as RazorpayPaymentEntity & { error?: { description?: string } };
  if (!response.ok) {
    throw new Error(payload?.error?.description ?? "Failed to fetch Razorpay payment.");
  }

  return payload;
}

export async function createRazorpayXPayout(params: {
  fundAccountId: string;
  amountRupees: number;
  referenceId: string;
  narration?: string;
  purpose?: string;
  notes?: Record<string, string>;
}): Promise<RazorpayPayout> {
  const { keyId, keySecret, accountNumber } = getRazorpayXConfig();
  const response = await fetch("https://api.razorpay.com/v1/payouts", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      account_number: accountNumber,
      fund_account_id: params.fundAccountId,
      amount: Math.max(0, Math.round(params.amountRupees * 100)),
      currency: "INR",
      mode: "UPI",
      purpose: params.purpose ?? "payout",
      queue_if_low_balance: true,
      reference_id: params.referenceId,
      narration: params.narration ?? "Famlo payout",
      notes: params.notes ?? {},
    }),
    cache: "no-store",
  });

  const payload = (await response.json()) as RazorpayPayout & { error?: { description?: string } };
  if (!response.ok) {
    throw new Error(payload?.error?.description ?? "Failed to create RazorpayX payout.");
  }

  return payload;
}

export async function createRazorpayXContact(params: {
  name: string;
  type?: "vendor" | "customer" | "employee" | "self";
  email?: string;
  contact?: string;
  referenceId?: string;
}): Promise<RazorpayXContact> {
  const { keyId, keySecret } = getRazorpayXConfig();
  const response = await fetch("https://api.razorpay.com/v1/contacts", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: params.name,
      type: params.type ?? "vendor",
      ...(params.email ? { email: params.email } : {}),
      ...(params.contact ? { contact: params.contact } : {}),
      ...(params.referenceId ? { reference_id: params.referenceId } : {}),
    }),
    cache: "no-store",
  });

  const payload = (await response.json()) as RazorpayXContact & { error?: { description?: string } };
  if (!response.ok) {
    throw new Error(payload?.error?.description ?? "Failed to create RazorpayX contact.");
  }

  return payload;
}

export async function createRazorpayXFundAccount(params: {
  contactId: string;
  accountHolderName: string;
  accountNumber?: string;
  ifsc?: string;
  vpa?: string;
}): Promise<RazorpayXFundAccount> {
  const { keyId, keySecret } = getRazorpayXConfig();
  const isVpa = typeof params.vpa === "string" && params.vpa.trim().length > 0;

  const body = isVpa
    ? {
        contact_id: params.contactId,
        account_type: "vpa",
        vpa: {
          address: params.vpa?.trim(),
        },
      }
    : {
        contact_id: params.contactId,
        account_type: "bank_account",
        bank_account: {
          name: params.accountHolderName,
          account_number: params.accountNumber?.trim(),
          ifsc: params.ifsc?.trim().toUpperCase(),
        },
      };

  const response = await fetch("https://api.razorpay.com/v1/fund_accounts", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  const payload = (await response.json()) as RazorpayXFundAccount & { error?: { description?: string } };
  if (!response.ok) {
    throw new Error(payload?.error?.description ?? "Failed to create RazorpayX fund account.");
  }

  return payload;
}

export function verifyRazorpayPaymentSignature(params: {
  orderId: string;
  paymentId: string;
  signature: string;
}): boolean {
  const { keySecret } = getRazorpayConfig();
  const digest = crypto
    .createHmac("sha256", keySecret)
    .update(`${params.orderId}|${params.paymentId}`)
    .digest("hex");

  return safeCompare(digest, params.signature);
}

export function verifyRazorpayWebhookSignature(payload: string, signature: string): boolean {
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!webhookSecret) {
    throw new Error("Missing required environment variable: RAZORPAY_WEBHOOK_SECRET");
  }

  const digest = crypto.createHmac("sha256", webhookSecret).update(payload).digest("hex");
  return safeCompare(digest, signature);
}

export function verifyRazorpayXWebhookSignature(payload: string, signature: string): boolean {
  const webhookSecret = process.env.RAZORPAYX_WEBHOOK_SECRET;
  if (!webhookSecret) {
    throw new Error("Missing required environment variable: RAZORPAYX_WEBHOOK_SECRET");
  }

  const digest = crypto.createHmac("sha256", webhookSecret).update(payload).digest("hex");
  return safeCompare(digest, signature);
}
