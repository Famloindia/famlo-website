import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  sendWhatsAppTemplateNotification,
} from "@/lib/notifications/providers/whatsapp";
import { notificationWorkerInternals } from "@/lib/notifications/notification-worker";
import {
  getBookingTemplateParameterOrder,
  getWhatsAppRuntimeConfig,
  normalizeMetaPhone,
} from "@/lib/whatsapp-config";
import {
  sanitizeMetaFailure,
  verifyMetaWebhookSignature,
  webhookPayloadDigest,
} from "@/lib/whatsapp-webhook";

const repo = process.cwd();
const originalFetch = global.fetch;
const originalEnv = { ...process.env };

function configureProvider(): void {
  process.env.APP_ENV = "local";
  process.env.FAMLO_ENABLE_WHATSAPP_NOTIFICATIONS = "true";
  process.env.WHATSAPP_ACCESS_TOKEN = "test-token";
  process.env.WHATSAPP_PHONE_NUMBER_ID = "phone-id";
  process.env.WHATSAPP_TEST_TEMPLATE = "famlo_test";
  process.env.WHATSAPP_TEMPLATE_LANGUAGE = "en_US";
}

test.afterEach(() => {
  global.fetch = originalFetch;
  process.env = { ...originalEnv };
});

test("provider refuses delivery while feature flag is false", async () => {
  configureProvider();
  process.env.FAMLO_ENABLE_WHATSAPP_NOTIFICATIONS = "false";
  const result = await sendWhatsAppTemplateNotification({
    phone: "+919876543210",
    templateKind: "test",
    templateName: "famlo_test",
  });
  assert.equal(result.status, "failed");
  assert.equal(result.retryable, false);
  assert.equal(result.providerMessageId, undefined);
});

test("provider refuses delivery without credentials", async () => {
  configureProvider();
  delete process.env.WHATSAPP_ACCESS_TOKEN;
  const result = await sendWhatsAppTemplateNotification({
    phone: "+919876543210",
    templateKind: "test",
    templateName: "famlo_test",
  });
  assert.equal(result.status, "failed");
  assert.equal(result.providerMessageId, undefined);
});

test("provider never returns a mock message ID", async () => {
  configureProvider();
  delete process.env.WHATSAPP_PHONE_NUMBER_ID;
  const result = await sendWhatsAppTemplateNotification({
    phone: "+919876543210",
    templateKind: "test",
    templateName: "famlo_test",
  });
  assert.doesNotMatch(JSON.stringify(result), /mock-whatsapp/);
});

test("provider records a real Meta message ID only from a successful response", async () => {
  configureProvider();
  global.fetch = async () =>
    new Response(JSON.stringify({ messages: [{ id: "wamid.real" }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  const result = await sendWhatsAppTemplateNotification({
    phone: "+919876543210",
    templateKind: "test",
    templateName: "famlo_test",
  });
  assert.equal(result.providerMessageId, "wamid.real");
  assert.equal(result.providerStatus, "submitted");
});

test("retryable Meta errors are classified for retry", async () => {
  configureProvider();
  global.fetch = async () =>
    new Response(JSON.stringify({ error: { code: 613, type: "OAuthException", message: "Rate limited" } }), {
      status: 429,
    });
  const result = await sendWhatsAppTemplateNotification({
    phone: "+919876543210",
    templateKind: "test",
    templateName: "famlo_test",
  });
  assert.equal(result.status, "failed");
  assert.equal(result.retryable, true);
  assert.equal(result.errorCode, "613");
});

test("permanent Meta errors do not retry", async () => {
  configureProvider();
  global.fetch = async () =>
    new Response(JSON.stringify({ error: { code: 100, type: "OAuthException", message: "Invalid template" } }), {
      status: 400,
    });
  const result = await sendWhatsAppTemplateNotification({
    phone: "+919876543210",
    templateKind: "test",
    templateName: "famlo_test",
  });
  assert.equal(result.retryable, false);
});

test("invalid phone is a permanent provider failure", async () => {
  configureProvider();
  const result = await sendWhatsAppTemplateNotification({
    phone: "123",
    templateKind: "test",
    templateName: "famlo_test",
  });
  assert.equal(result.errorCode, "invalid_recipient");
  assert.equal(result.retryable, false);
});

test("phone normalization emits Meta digits without plus", () => {
  assert.equal(normalizeMetaPhone("+91 98765 43210"), "919876543210");
  assert.equal(normalizeMetaPhone("9876543210"), "919876543210");
});

test("invalid webhook signature is rejected", () => {
  assert.equal(
    verifyMetaWebhookSignature({ rawBody: "{}", signatureHeader: "sha256=deadbeef", appSecret: "secret" }),
    false
  );
});

test("valid webhook signature is accepted", () => {
  const rawBody = '{"object":"whatsapp_business_account"}';
  const signature = createHmac("sha256", "secret").update(rawBody).digest("hex");
  assert.equal(
    verifyMetaWebhookSignature({ rawBody, signatureHeader: `sha256=${signature}`, appSecret: "secret" }),
    true
  );
});

test("raw body signature validation is byte exact", () => {
  const first = '{"a":1}';
  const second = '{ "a": 1 }';
  const signature = createHmac("sha256", "secret").update(first).digest("hex");
  assert.equal(
    verifyMetaWebhookSignature({ rawBody: second, signatureHeader: `sha256=${signature}`, appSecret: "secret" }),
    false
  );
});

test("payload digest is deterministic and stores no payload", () => {
  const digest = webhookPayloadDigest('{"phone":"+919876543210"}');
  assert.match(digest, /^[a-f0-9]{64}$/);
  assert.doesNotMatch(digest, /9876543210/);
});

test("failure reason sanitizes full phone numbers", () => {
  const failure = sanitizeMetaFailure({ code: 131000, message: "Failed for +91 98765 43210" });
  assert.equal(failure.reason?.includes("98765"), false);
});

test("queue migration uses atomic skip-locked claiming", () => {
  const sql = readFileSync(
    `${repo}/supabase/migrations/20260724160000_whatsapp_delivery_phase3.sql`,
    "utf8"
  );
  assert.match(sql, /for update skip locked/i);
  assert.match(sql, /claim_notification_queue_batch/);
});

test("queue migration recovers stale processing leases", () => {
  const sql = readFileSync(
    `${repo}/supabase/migrations/20260724160000_whatsapp_delivery_phase3.sql`,
    "utf8"
  );
  assert.match(sql, /status = 'processing'/);
  assert.match(sql, /lease_expires_at <= v_now/);
});

test("queue migration includes bounded retry fields", () => {
  const sql = readFileSync(
    `${repo}/supabase/migrations/20260724160000_whatsapp_delivery_phase3.sql`,
    "utf8"
  );
  for (const column of ["next_attempt_at", "last_error", "completed_at", "provider_message_id"]) {
    assert.match(sql, new RegExp(column));
  }
});

test("retry schedule uses bounded exponential backoff", () => {
  assert.equal(notificationWorkerInternals.retryDelaySeconds(1), 30);
  assert.equal(notificationWorkerInternals.retryDelaySeconds(3), 120);
  assert.equal(notificationWorkerInternals.retryDelaySeconds(20), 3600);
});

test("worker has approved mappings for the three Phase 3 templates", () => {
  assert.equal(notificationWorkerInternals.templateKindForEvent("booking_host_action_required"), "bookingApproval");
  assert.equal(notificationWorkerInternals.templateKindForEvent("host_whatsapp_test"), "test");
  assert.equal(notificationWorkerInternals.templateKindForEvent("guest_message_sent"), "guestMessage");
});

test("booking template parameter order is configurable", () => {
  process.env.WHATSAPP_BOOKING_APPROVAL_PARAMETER_ORDER = "booking_reference,property_name";
  assert.deepEqual(getBookingTemplateParameterOrder(), ["booking_reference", "property_name"]);
});

test("booking template defaults contain all required values", () => {
  delete process.env.WHATSAPP_BOOKING_APPROVAL_PARAMETER_ORDER;
  assert.deepEqual(getBookingTemplateParameterOrder(), [
    "property_name",
    "booking_reference",
    "check_in",
    "check_out",
    "nights",
    "days",
    "guest_count",
    "booking_amount",
    "decision_deadline",
  ]);
});

test("test message route queues rather than calling Meta", () => {
  const source = readFileSync(`${repo}/app/api/host/whatsapp-settings/test/route.ts`, "utf8");
  assert.match(source, /enqueueNotificationRecord/);
  assert.doesNotMatch(source, /sendWhatsApp/);
  assert.match(source, /status: "queued"/);
  assert.match(source, /code === "unauthorized" \? 401/);
});

test("test message requires the canonical eligibility check", () => {
  const source = readFileSync(`${repo}/app/api/host/whatsapp-settings/test/route.ts`, "utf8");
  assert.match(source, /resolveEligibleHostWhatsApp/);
  assert.match(source, /whatsappDeliveryEnabled/);
});

test("guest message alert is deduplicated by message and host", () => {
  const source = readFileSync(`${repo}/lib/guest-message-whatsapp.ts`, "utf8");
  assert.match(source, /guest_message_sent:\$\{input\.messageId\}:\$\{input\.hostUserId\}:whatsapp/);
});

test("guest message alert does not include message text or guest phone", () => {
  const source = readFileSync(`${repo}/lib/guest-message-whatsapp.ts`, "utf8");
  assert.doesNotMatch(source, /messageText|guestPhone|guest_phone/);
});

test("guest message route preserves email and adds WhatsApp", () => {
  const source = readFileSync(`${repo}/app/api/user/messages/route.ts`, "utf8");
  assert.match(source, /channel: "email"/);
  assert.match(source, /enqueueGuestMessageWhatsAppAlert/);
});

test("webhook never writes inbound WhatsApp text into Famlo messages", () => {
  const source = readFileSync(`${repo}/app/api/webhooks/whatsapp/route.ts`, "utf8");
  assert.doesNotMatch(source, /\.from\("messages"\)/);
  assert.match(source, /eventType: "unsupported"/);
});

test("callback payloads contain opaque action tokens rather than booking IDs", () => {
  const source = readFileSync(`${repo}/lib/booking-whatsapp-actions.ts`, "utf8");
  assert.match(source, /APPROVE_BOOKING.*actionToken/);
  assert.doesNotMatch(source, /APPROVE_BOOKING:\$\{.*bookingId/);
});

test("WhatsApp failure cannot mutate booking state in the worker", () => {
  const source = readFileSync(`${repo}/lib/notifications/notification-worker.ts`, "utf8");
  assert.doesNotMatch(source, /applyHostBookingDecision|bookings_v2.*update/);
});

test("webhook processing is protected by exact raw-body signature verification", () => {
  const source = readFileSync(`${repo}/app/api/webhooks/whatsapp/route.ts`, "utf8");
  assert.match(source, /const rawBody = await request\.text\(\)/);
  assert.match(source, /verifyMetaWebhookSignature/);
  assert.ok(source.indexOf("verifyMetaWebhookSignature") < source.indexOf("JSON.parse(rawBody)"));
});

test("staging provider requires an explicit tester allowlist", async () => {
  configureProvider();
  process.env.APP_ENV = "staging";
  process.env.FAMLO_ALLOW_STAGING_WHATSAPP_DELIVERY = "true";
  process.env.WHATSAPP_STAGING_TESTER_PHONE = "+919999999999";
  const result = await sendWhatsAppTemplateNotification({
    phone: "+919876543210",
    templateKind: "test",
    templateName: "famlo_test",
  });
  assert.equal(result.errorCode, "staging_recipient_blocked");
});

test("environment config uses canonical Meta variable names", () => {
  process.env.WHATSAPP_API_KEY = "canonical";
  process.env.WHATSAPP_ACCESS_TOKEN = "legacy";
  assert.equal(getWhatsAppRuntimeConfig().accessToken, "canonical");
});

test("staging delivery accepts exactly one canonical tester allowlist entry", () => {
  process.env.WHATSAPP_STAGING_TESTER_ALLOWLIST = "+919999999999";
  process.env.WHATSAPP_ALLOW_STAGING_DELIVERY = "true";
  assert.equal(getWhatsAppRuntimeConfig().stagingTesterPhone, "919999999999");
  process.env.WHATSAPP_STAGING_TESTER_ALLOWLIST = "+919999999999,+918888888888";
  assert.equal(getWhatsAppRuntimeConfig().stagingTesterPhone, null);
  delete process.env.WHATSAPP_STAGING_TESTER_ALLOWLIST;
  delete process.env.WHATSAPP_ALLOW_STAGING_DELIVERY;
});

test("staging worker scheduler uses Vault, pg_cron and authenticated POST", () => {
  const migration = readFileSync(
    `${repo}/supabase/migrations/20260724173000_notification_worker_scheduler.sql`,
    "utf8"
  );
  const route = readFileSync(`${repo}/app/api/internal/cron/notifications/route.ts`, "utf8");
  assert.match(migration, /create extension if not exists pg_cron/);
  assert.match(migration, /create extension if not exists pg_net/);
  assert.match(migration, /vault\.decrypted_secrets/);
  assert.match(migration, /X-Famlo-Worker-Source/);
  assert.doesNotMatch(migration, /Bearer [A-Za-z0-9_-]{16,}/);
  assert.match(route, /export async function POST/);
  assert.match(route, /notification_worker_runs/);
});
