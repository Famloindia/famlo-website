import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";

import {
  cashfreeAmountToMinor,
  createCashfreeOrder,
  isCashfreeFailureStatus,
  isCashfreeSuccessStatus,
  isCashfreeUserDroppedStatus,
  verifyCashfreeWebhookSignature,
} from "@/lib/cashfree";
import { evaluateRuntimeSafety } from "@/lib/app-env";
import {
  computeFamloMarketplaceSplitMinor,
  computePayoutEligibleAt,
  resolveIndiaCheckoutAt,
} from "@/lib/finance/cashfree-marketplace";
import { getSelectedPaymentProvider } from "@/lib/payments/provider";

function withEnv<T>(nextEnv: Record<string, string | undefined>, fn: () => T): T {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(nextEnv)) {
    previous.set(key, process.env[key]);
    if (typeof value === "undefined") delete process.env[key];
    else process.env[key] = value;
  }

  try {
    return fn();
  } finally {
    for (const [key, value] of previous.entries()) {
      if (typeof value === "undefined") delete process.env[key];
      else process.env[key] = value;
    }
  }
}

async function withEnvAsync<T>(
  nextEnv: Record<string, string | undefined>,
  fn: () => Promise<T>
): Promise<T> {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(nextEnv)) {
    previous.set(key, process.env[key]);
    if (typeof value === "undefined") delete process.env[key];
    else process.env[key] = value;
  }

  try {
    return await fn();
  } finally {
    for (const [key, value] of previous.entries()) {
      if (typeof value === "undefined") delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("Cashfree order creation uses sandbox, current API version, minor units, and idempotency", async () => {
  const originalFetch = globalThis.fetch;
  let requestUrl = "";
  let requestInit: RequestInit | undefined;
  globalThis.fetch = (async (input, init) => {
    requestUrl = String(input);
    requestInit = init;
    return new Response(
      JSON.stringify({
        order_id: "famlo_payment_1",
        order_amount: 123.45,
        order_currency: "INR",
        order_status: "ACTIVE",
        payment_session_id: "session_1",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }) as typeof fetch;

  try {
    await withEnvAsync(
      {
        APP_ENV: "staging",
        CASHFREE_ENV: "sandbox",
        CASHFREE_API_VERSION: undefined,
        CASHFREE_CLIENT_ID: "TEST_client_id",
        CASHFREE_CLIENT_SECRET: "test_secret",
      },
      async () => {
        const order = await createCashfreeOrder({
          orderId: "famlo_payment_1",
          amountMinor: 12345,
          currency: "INR",
          customer: {
            customer_id: "guest_1",
            customer_phone: "9999999999",
          },
          idempotencyKey: "payment-order-payment_1",
        });

        assert.equal(order.payment_session_id, "session_1");
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(requestUrl, "https://sandbox.cashfree.com/pg/orders");
  const headers = requestInit?.headers as Record<string, string>;
  assert.equal(headers["x-api-version"], "2026-01-01");
  assert.equal(headers["x-idempotency-key"], "payment-order-payment_1");
  const body = JSON.parse(String(requestInit?.body)) as { order_amount: number; order_currency: string };
  assert.equal(body.order_amount, 123.45);
  assert.equal(body.order_currency, "INR");
});

test("Cashfree webhook signature uses timestamp plus raw body with base64 HMAC SHA256", () => {
  withEnv(
    {
      APP_ENV: "staging",
      CASHFREE_ENV: "sandbox",
      CASHFREE_CLIENT_ID: "TEST_client_id",
      CASHFREE_CLIENT_SECRET: "test_secret",
    },
    () => {
      const rawBody = JSON.stringify({ type: "PAYMENT_SUCCESS_WEBHOOK", data: { order: { order_id: "order_1" } } });
      const timestamp = "1785400000000";
      const signature = crypto
        .createHmac("sha256", "test_secret")
        .update(`${timestamp}${rawBody}`)
        .digest("base64");

      assert.equal(verifyCashfreeWebhookSignature({ rawBody, timestamp, signature }), true);
      assert.equal(verifyCashfreeWebhookSignature({ rawBody, timestamp, signature: `${signature}bad` }), false);
    }
  );
});

test("Cashfree staging safety allows sandbox and blocks production mode", () => {
  const sandbox = evaluateRuntimeSafety("cashfree", {
    APP_ENV: "staging",
    CASHFREE_ENV: "sandbox",
    CASHFREE_CLIENT_ID: "TEST_client_id",
    CASHFREE_CLIENT_SECRET: "test_secret",
  } as unknown as NodeJS.ProcessEnv);
  const productionMode = evaluateRuntimeSafety("cashfree", {
    APP_ENV: "staging",
    CASHFREE_ENV: "production",
    CASHFREE_CLIENT_ID: "PROD_client_id",
    CASHFREE_CLIENT_SECRET: "live_secret",
  } as unknown as NodeJS.ProcessEnv);

  assert.equal(sandbox.ok, true);
  assert.equal(productionMode.ok, false);
  assert.equal(productionMode.code, "cashfree_production_not_allowed_outside_production");
});

test("production safety blocks Cashfree sandbox mode", () => {
  const result = evaluateRuntimeSafety("cashfree", {
    APP_ENV: "production",
    CASHFREE_ENV: "sandbox",
    CASHFREE_CLIENT_ID: "TEST_client_id",
    CASHFREE_CLIENT_SECRET: "test_secret",
  } as unknown as NodeJS.ProcessEnv);

  assert.equal(result.ok, false);
  assert.equal(result.code, "cashfree_sandbox_not_allowed_in_production");
});

test("payment provider selection uses request override before environment default", () => {
  withEnv({ FAMLO_PAYMENT_PROVIDER: "cashfree" }, () => {
    assert.equal(getSelectedPaymentProvider(), "cashfree");
    assert.equal(getSelectedPaymentProvider("razorpay"), "razorpay");
    assert.equal(getSelectedPaymentProvider("unknown"), "cashfree");
  });
});

test("Cashfree status helpers map payment terminal states", () => {
  assert.equal(isCashfreeSuccessStatus("SUCCESS"), true);
  assert.equal(isCashfreeFailureStatus("FAILED"), true);
  assert.equal(isCashfreeFailureStatus("CANCELLED"), true);
  assert.equal(isCashfreeUserDroppedStatus("USER_DROPPED"), true);
  assert.equal(cashfreeAmountToMinor(123.45), 12345);
});

test("marketplace split keeps 16 percent commission and exact 84 percent host share", () => {
  const split = computeFamloMarketplaceSplitMinor(100000);

  assert.equal(split.grossBookingAmountMinor, 100000);
  assert.equal(split.famloCommissionAmountMinor, 16000);
  assert.equal(split.hostGrossShareMinor, 84000);
  assert.equal(split.famloCommissionAmountMinor + split.hostGrossShareMinor, split.grossBookingAmountMinor);
});

test("marketplace split uses deterministic rounding and preserves total", () => {
  const split = computeFamloMarketplaceSplitMinor(999);

  assert.equal(split.famloCommissionAmountMinor, 160);
  assert.equal(split.hostGrossShareMinor, 839);
  assert.equal(split.famloCommissionAmountMinor + split.hostGrossShareMinor, 999);
});

test("payout eligibility is checkout plus 24 hours", () => {
  assert.equal(
    computePayoutEligibleAt("2026-07-30T10:00:00.000Z"),
    "2026-07-31T10:00:00.000Z"
  );
});

test("marketplace checkout uses the booking checkout date and India local time", () => {
  const checkoutAt = resolveIndiaCheckoutAt("2026-08-04", "11:00 AM");
  assert.equal(checkoutAt, "2026-08-04T05:30:00.000Z");
  assert.equal(computePayoutEligibleAt(checkoutAt), "2026-08-05T05:30:00.000Z");
  assert.equal(resolveIndiaCheckoutAt("2026-08-04", null), null);
});
