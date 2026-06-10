import assert from "node:assert/strict";
import test from "node:test";

import {
  createHostProAddonCheckoutRouteHandlers,
  createHostProAddonVerifyRouteHandlers,
} from "@/lib/pro-billing/addon-route-handlers";

function buildJsonRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost/api/test", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

test("add-on checkout creates a room add-on order for an authorized host", async () => {
  let receivedInput: Record<string, unknown> | null = null;

  const route = createHostProAddonCheckoutRouteHandlers({
    createAdminSupabaseClient: (() => ({ from: () => ({ insert: () => ({}) }) })) as never,
    createHostProAddonCheckout: (async (_supabase: unknown, input: { addonType: string; familyId: string; hostUserId: string }) => {
      receivedInput = input as unknown as Record<string, unknown>;
      return {
        billingOrderId: "addon-order-1",
        quote: {
          addonType: "room" as const,
          durationMonths: 1 as const,
          totalPlanDays: 30,
          remainingDays: 30,
          baseMonthlyAmount: 100,
          payableSubtotalAmount: 100,
          payableGstAmount: 18,
          payableTotalAmount: 118,
          gstPct: 18,
        },
        order: {
          id: "order_1",
          entity: "order",
          amount: 11800,
          amount_paid: 0,
          amount_due: 11800,
          currency: "INR",
          receipt: "addon-order-1",
          status: "created",
          attempts: 0,
          created_at: 1717459200,
        },
        keyId: "rzp_test_key",
      };
    }) as never,
    resolveAuthorizedHostResource: (async () =>
      ({
        familyId: "family-1",
        hostId: "host-1",
        hostSession: null,
        hostUserId: "host-user-1",
        isAdmin: false,
        stayUnitId: null,
      })) as never,
    resolveAuthorizedHostSession: (async () =>
      ({
        familyId: "family-1",
        hostUserId: "host-user-1",
        authUserId: "auth-user-1",
      })) as never,
  });

  const response = await route.POST(
    buildJsonRequest({
      familyId: "family-1",
      addonType: "room",
    }) as never
  );
  const payload = (await response.json()) as { billingOrderId?: string; keyId?: string };

  assert.equal(response.status, 200);
  assert.deepEqual(receivedInput, {
    hostUserId: "host-user-1",
    familyId: "family-1",
    addonType: "room",
  });
  assert.equal(payload.billingOrderId, "addon-order-1");
  assert.equal(payload.keyId, "rzp_test_key");
});

test("add-on checkout rejects unauthorized family access", async () => {
  const route = createHostProAddonCheckoutRouteHandlers({
    createAdminSupabaseClient: (() => ({ from: () => ({ insert: () => ({}) }) })) as never,
    createHostProAddonCheckout: (async () => {
      throw new Error("should not be called");
    }) as never,
    resolveAuthorizedHostResource: (async () => null) as never,
    resolveAuthorizedHostSession: (async () =>
      ({
        familyId: "family-1",
        hostUserId: "host-user-1",
        authUserId: "auth-user-1",
      })) as never,
  });

  const response = await route.POST(
    buildJsonRequest({
      familyId: "family-2",
      addonType: "room",
    }) as never
  );
  const payload = (await response.json()) as { error?: string };

  assert.equal(response.status, 403);
  assert.equal(payload.error, "Unauthorized");
});

test("add-on checkout validates required familyId and addonType fields", async () => {
  const route = createHostProAddonCheckoutRouteHandlers({
    createAdminSupabaseClient: (() => ({ from: () => ({ insert: () => ({}) }) })) as never,
    resolveAuthorizedHostSession: (async () =>
      ({
        familyId: "family-1",
        hostUserId: "host-user-1",
        authUserId: "auth-user-1",
      })) as never,
  });

  const response = await route.POST(buildJsonRequest({ familyId: "family-1" }) as never);
  const payload = (await response.json()) as { error?: string };

  assert.equal(response.status, 400);
  assert.equal(payload.error, "familyId and addonType are required.");
});

test("add-on verify finalizes a captured payment for an authorized host", async () => {
  let verifyInput: Record<string, unknown> | null = null;

  const route = createHostProAddonVerifyRouteHandlers({
    createAdminSupabaseClient: (() => ({ from: () => ({ insert: () => ({}) }) })) as never,
    resolveAuthorizedHostSession: (async () =>
      ({
        familyId: "family-1",
        hostUserId: "host-user-1",
        authUserId: "auth-user-1",
      })) as never,
    verifyAndFinalizeHostProAddonOrder: (async (_supabase: unknown, input: Record<string, unknown>) => {
      verifyInput = input;
      return { alreadyFinalized: false };
    }) as never,
    verifyRazorpayPaymentSignature: (() => true) as never,
  });

  const response = await route.POST(
    buildJsonRequest({
      billingOrderId: "addon-order-1",
      razorpay_order_id: "order_1",
      razorpay_payment_id: "pay_1",
      razorpay_signature: "sig_1",
    }) as never
  );
  const payload = (await response.json()) as { success?: boolean; alreadyFinalized?: boolean };

  assert.equal(response.status, 200);
  assert.deepEqual(verifyInput, {
    billingOrderId: "addon-order-1",
    gatewayOrderId: "order_1",
    gatewayPaymentId: "pay_1",
    paymentSignature: "sig_1",
  });
  assert.equal(payload.success, true);
  assert.equal(payload.alreadyFinalized, false);
});

test("add-on verify rejects invalid Razorpay signatures", async () => {
  const route = createHostProAddonVerifyRouteHandlers({
    createAdminSupabaseClient: (() => ({ from: () => ({ insert: () => ({}) }) })) as never,
    resolveAuthorizedHostSession: (async () =>
      ({
        familyId: "family-1",
        hostUserId: "host-user-1",
        authUserId: "auth-user-1",
      })) as never,
    verifyRazorpayPaymentSignature: (() => false) as never,
  });

  const response = await route.POST(
    buildJsonRequest({
      billingOrderId: "addon-order-1",
      razorpay_order_id: "order_1",
      razorpay_payment_id: "pay_1",
      razorpay_signature: "sig_1",
    }) as never
  );
  const payload = (await response.json()) as { error?: string };

  assert.equal(response.status, 400);
  assert.equal(payload.error, "Invalid Razorpay payment signature.");
});
