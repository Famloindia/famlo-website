import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { bucketHostBookings, classifyHostBooking, getDateInTimeZone } from "@/lib/host-booking-dashboard";
import { enqueuePaidBookingOperationalNotifications } from "@/lib/operational-notifications";

const now = new Date("2026-08-01T10:00:00.000Z");

test("paid pending booking is a new request", () => {
  assert.equal(classifyHostBooking({ status: "pending_host_approval", payment_status: "paid" }, { now }), "new_requests");
});

test("approved future booking is upcoming", () => {
  assert.equal(classifyHostBooking({ status: "confirmed", payment_status: "paid", date_from: "2026-08-03" }, { now }), "upcoming");
});

test("approved India-today booking is an arrival", () => {
  assert.equal(getDateInTimeZone(now, "Asia/Kolkata"), "2026-08-01");
  assert.equal(classifyHostBooking({ status: "confirmed", date_from: "2026-08-01" }, { now }), "arrivals_today");
});

test("duplicate realtime booking rows are deduplicated", () => {
  const buckets = bucketHostBookings([
    { id: "booking-1", status: "pending_host_approval", payment_status: "paid" },
    { id: "booking-1", status: "pending_host_approval", payment_status: "paid" },
  ], { now });
  assert.equal(buckets.new_requests.length, 1);
});

test("new requests are newest first", () => {
  const buckets = bucketHostBookings([
    { id: "older", status: "pending_host_approval", payment_status: "paid", created_at: "2026-08-01T08:00:00Z" },
    { id: "newer", status: "pending_host_approval", payment_status: "paid", created_at: "2026-08-01T09:00:00Z" },
  ], { now });
  assert.equal(buckets.new_requests[0]?.id, "newer");
});

test("operational notification enqueue creates host admin and service records once", async () => {
  let rows: Array<Record<string, unknown>> = [];
  const supabase = {
    from: () => ({
      upsert: async (input: Array<Record<string, unknown>>) => { rows = input; return { error: null }; },
    }),
  };
  await enqueuePaidBookingOperationalNotifications(supabase as never, {
    bookingId: "00000000-0000-0000-0000-000000000001",
    hostUserId: "00000000-0000-0000-0000-000000000002",
    familyId: "00000000-0000-0000-0000-000000000003",
    dashboardUrl: "/partnerslogin/home/dashboard?tab=bookings",
    message: "A paid booking needs review.",
  });
  assert.deepEqual(rows.map((row) => row.recipient_role), ["host", "admin", "service"]);
  assert.equal(new Set(rows.map((row) => row.dedupe_key)).size, 3);
});

test("operational notification schema is private, indexed, and backfills pending paid bookings", async () => {
  const schema = await readFile("supabase/migrations/20260801093000_host_operational_notifications_staging.sql", "utf8");
  const backfill = await readFile("supabase/migrations/20260801100000_backfill_pending_booking_notifications_staging.sql", "utf8");
  assert.match(schema, /enable row level security/i);
  assert.match(schema, /revoke all on public\.operational_notifications from anon, authenticated/i);
  assert.match(schema, /grant select, insert, update, delete.*service_role/i);
  assert.match(backfill, /pending_host_approval/);
  assert.match(backfill, /payment_status = 'paid'/);
  assert.match(backfill, /on conflict \(dedupe_key\) do nothing/);
});

test("canonical host decision resolves operational badges", async () => {
  const decision = await readFile("lib/host-booking-decision.ts", "utf8");
  assert.match(decision, /operational_notifications/);
  assert.match(decision, /resolved_at/);
  assert.match(decision, /booking_host_action_required/);
});

test("duplicate signup has an actionable server contract", async () => {
  const route = await readFile("app/api/auth/signup/email/route.ts", "utf8");
  assert.match(route, /ACCOUNT_EXISTS/);
  assert.match(route, /Sign in or reset your password/);
  assert.match(route, /findAuthUserByEmail/);
});

test("duplicate signup UI offers sign in and password reset", async () => {
  const modal = await readFile("components/auth/AuthModal.tsx", "utf8");
  assert.match(modal, />Sign in</);
  assert.match(modal, />Reset password</);
});

test("auth callback checks profile completion and preserves safe destination", async () => {
  const callback = await readFile("app/auth/callback/page.tsx", "utf8");
  assert.match(callback, /profilePayload\.profileComplete/);
  assert.match(callback, /getSafeReturnPath/);
  assert.match(callback, /profileUrl\.searchParams\.set\("complete", "1"\)/);
});

test("profile placeholders are generic and saved values remain values", async () => {
  const form = await readFile("components/account/ProfileCompletionForm.tsx", "utf8");
  for (const placeholder of ["Choose a username", "Enter your full name", "Enter your city", "Enter your state"]) {
    assert.match(form, new RegExp(placeholder));
  }
  assert.doesNotMatch(form, /placeholder="(?:aryan_krishan|Aryan Krishan|Hisar|Haryana)"/);
  assert.match(form, /value=\{resolvedForm\.name\}/);
});

test("booking profile gate exposes CTA and preserves draft", async () => {
  const panel = await readFile("components/public/RoomBookingPanel.tsx", "utf8");
  assert.match(panel, /Complete Profile/);
  assert.match(panel, /famlo:booking-draft/);
  assert.match(panel, /sessionStorage/);
});

test("review-required account linking remains actionable", async () => {
  const form = await readFile("components/account/ProfileCompletionForm.tsx", "utf8");
  assert.match(form, /Continue with phone account/);
  assert.match(form, /Use another number/);
  assert.match(form, /Contact Famlo Support/);
  assert.match(form, /account_switch/);
});

test("host dashboard has booking message and notification badges", async () => {
  const editor = await readFile("components/partners/HostDashboardEditor.tsx", "utf8");
  assert.match(editor, /pendingBookingCount/);
  assert.match(editor, /unreadMessageCount/);
  assert.match(editor, /unreadNotificationCount/);
});

test("host dashboard has realtime plus polling and focus fallback", async () => {
  const editor = await readFile("components/partners/HostDashboardEditor.tsx", "utf8");
  assert.match(editor, /postgres_changes/);
  assert.match(editor, /15_000/);
  assert.match(editor, /visibilitychange/);
  assert.match(editor, /window\.addEventListener\("focus"/);
});

test("Cashfree checkout is intent-preloaded and provider calls time out", async () => {
  const panel = await readFile("components/public/RoomBookingPanel.tsx", "utf8");
  const cashfree = await readFile("lib/cashfree.ts", "utf8");
  assert.match(panel, /ensureCashfreeCheckout/);
  assert.match(panel, /Server-Timing/);
  assert.match(cashfree, /AbortController/);
  assert.match(cashfree, /CASHFREE_REQUEST_TIMEOUT_MS/);
});

test("Cashfree webhook remains canonical and Famlo Pro stays Razorpay-backed", async () => {
  const webhook = await readFile("app/api/payments/cashfree/webhook/route.ts", "utf8");
  const pro = await readFile("lib/pro-billing/razorpay-subscriptions.ts", "utf8");
  assert.match(webhook, /verifyCashfreeWebhookSignature/);
  assert.match(webhook, /rawBody/);
  assert.match(pro, /razorpay/i);
});
