import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  isPublicHostStayBookingBlocking,
  isReusableGuestBookingHold,
} from "@/lib/booking-compat";
import { shouldReusePaymentAttempt } from "@/lib/payment-intent";

const future = new Date("2026-08-01T12:00:00.000Z");

test("active hold for the same guest is reusable", () => {
  assert.equal(
    isReusableGuestBookingHold(
      {
        id: "booking-1",
        status: "awaiting_payment",
        payment_status: "pending",
        hold_expires_at: future.toISOString(),
        cancellation_reason: null,
      }
    ),
    true
  );
});

test("expired unpaid hold is reclaimed instead of creating a duplicate booking", () => {
  assert.equal(
    isReusableGuestBookingHold(
      {
        id: "booking-1",
        status: "awaiting_payment",
        payment_status: "pending",
        hold_expires_at: "2026-07-31T11:59:00.000Z",
        cancellation_reason: null,
      }
    ),
    true
  );
});

test("failed and user-dropped bookings can be retried without a duplicate booking", () => {
  assert.equal(
    isReusableGuestBookingHold({
      id: "booking-1",
      status: "payment_failed",
      payment_status: "failed",
      hold_expires_at: null,
      cancellation_reason: "payment_failed",
    }),
    true
  );
  assert.equal(
    isReusableGuestBookingHold({
      id: "booking-1",
      status: "cancelled",
      payment_status: "abandoned",
      hold_expires_at: null,
      cancellation_reason: "user_dropped",
    }),
    true
  );
});

test("paid booking can never be reclaimed as an unpaid hold", () => {
  assert.equal(
    isReusableGuestBookingHold({
      id: "booking-1",
      status: "confirmed",
      payment_status: "paid",
      hold_expires_at: null,
      cancellation_reason: null,
    }),
    false
  );
});

test("public occupancy excludes payment attempts and includes paid host-approval bookings", () => {
  assert.equal(
    isPublicHostStayBookingBlocking({ status: "awaiting_payment", paymentStatus: "pending" }),
    false
  );
  assert.equal(
    isPublicHostStayBookingBlocking({ status: "payment_failed", paymentStatus: "failed" }),
    false
  );
  assert.equal(
    isPublicHostStayBookingBlocking({ status: "pending_host_approval", paymentStatus: "paid" }),
    true
  );
  assert.equal(
    isPublicHostStayBookingBlocking({ status: "confirmed", paymentStatus: "paid" }),
    true
  );
});

test("pending gateway placeholder is upgraded instead of creating attempt two", () => {
  assert.equal(
    shouldReusePaymentAttempt({
      existingGateway: "pending_gateway",
      selectedGateway: "cashfree",
      existingStatus: "created",
    }),
    true
  );
});

test("active Cashfree order is reused for a duplicate request", () => {
  assert.equal(
    shouldReusePaymentAttempt({
      existingGateway: "cashfree",
      selectedGateway: "cashfree",
      existingStatus: "created",
    }),
    true
  );
});

test("failed, dropped, and expired payments require a fresh provider attempt", () => {
  for (const status of ["failed", "abandoned", "expired"]) {
    assert.equal(
      shouldReusePaymentAttempt({
        existingGateway: "cashfree",
        selectedGateway: "cashfree",
        existingStatus: status,
      }),
      false
    );
  }
});

test("database hold acquisition serializes room nights and reuses only the same guest", async () => {
  const migration = await readFile(
    "supabase/migrations/20260731213000_guest_booking_hold_atomicity.sql",
    "utf8"
  );
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /b\.user_id = p_user_id/);
  assert.match(migration, /daterange\(b\.start_date/);
  assert.match(migration, /This room is temporarily unavailable/);
  assert.match(migration, /grant execute[\s\S]*to service_role/);
  assert.match(migration, /revoke all[\s\S]*from public, anon, authenticated/);
});

test("failed attempt release is conditional on the booking winner payment id", async () => {
  const source = await readFile("lib/booking-payment-holds.ts", "utf8");
  assert.match(source, /\.eq\("payment_id", input\.paymentId\)/);
  assert.match(source, /\.eq\("status", "awaiting_payment"\)/);
  assert.match(source, /hold_expires_at: null/);
  assert.match(source, /recordBookingInventoryTransition/);
});

test("Cashfree failure and user-drop webhooks release the matching hold", async () => {
  const source = await readFile("app/api/payments/cashfree/webhook/route.ts", "utf8");
  assert.match(source, /releasePaymentAttemptBookingHold/);
  assert.match(source, /reason: isCashfreeUserDroppedStatus\(paymentStatus\)/);
  assert.match(source, /out_of_order_failure_after_success/);
});

test("order setup failure records failure and releases inventory", async () => {
  const source = await readFile("lib/payment-intent.ts", "utf8");
  assert.match(source, /ORDER_SETUP_FAILED/);
  assert.match(source, /reason: "payment_setup_failed"/);
  assert.match(source, /releasePaymentAttemptBookingHold/);
});

test("hold expiry is enforced at read time and the archival worker fits Vercel Hobby", async () => {
  const [platform, inventory, vercel] = await Promise.all([
    readFile("lib/booking-platform.ts", "utf8"),
    readFile("lib/inventory.ts", "utf8"),
    readFile("vercel.json", "utf8"),
  ]);
  assert.match(platform, /provider_status: "ORDER_EXPIRED"/);
  assert.match(platform, /eventType: "booking_hold_released"/);
  assert.match(inventory, /Date\.parse\(holdExpiresAt\) > now\.getTime\(\)/);
  assert.equal(JSON.parse(vercel).crons[0].schedule, "0 4 * * *");
});

test("guest booking surfaces do not eagerly load Razorpay", async () => {
  const files = await Promise.all([
    readFile("components/public/HomeBookingFlow.tsx", "utf8"),
    readFile("components/public/HomeBookingPreview.tsx", "utf8"),
    readFile("components/public/RoomBookingPanel.tsx", "utf8"),
  ]);
  for (const source of files) {
    assert.doesNotMatch(source, /warmRazorpayCheckout|warmCheckoutIntent/);
  }
  assert.match(files[2] ?? "", /We’re securely preparing payment for this room/);
  assert.doesNotMatch(files[2] ?? "", /setting up Razorpay/i);
});

test("guest surfaces present payment setup failure as one error state", async () => {
  const files = await Promise.all([
    readFile("components/public/HomeBookingFlow.tsx", "utf8"),
    readFile("components/public/HomeBookingPreview.tsx", "utf8"),
    readFile("components/public/RoomBookingPanel.tsx", "utf8"),
  ]);
  for (const source of files) {
    assert.match(source, /We couldn’t prepare checkout/);
    assert.doesNotMatch(source, /Payment setup is pending on the server/);
  }
});

test("Cashfree browser verification remains advisory and webhook-canonical", async () => {
  const source = await readFile("app/api/payments/verify/route.ts", "utf8");
  const cashfreeStart = source.indexOf('if (provider === "cashfree")');
  const cashfreeBranch = source.slice(
    cashfreeStart,
    source.indexOf("if (!bookingId || !orderId || !gatewayPaymentId || !signature)", cashfreeStart)
  );
  assert.match(cashfreeBranch, /canonicalConfirmation: "webhook"/);
  assert.doesNotMatch(cashfreeBranch, /finalizeCapturedBookingPayment/);
});
