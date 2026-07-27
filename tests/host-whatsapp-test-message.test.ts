import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  canSendHostWhatsAppTestMessage,
  createSingleFlightGuard,
  queueHostWhatsAppTestMessage,
} from "@/lib/host-whatsapp-test-message-client";
import { sendWhatsAppTemplateNotification } from "@/lib/notifications/providers/whatsapp";

const originalEnv = { ...process.env };
const originalFetch = global.fetch;

test.afterEach(() => {
  process.env = { ...originalEnv };
  global.fetch = originalFetch;
});

test("verified and opted-in host can use staging setup test delivery", () => {
  assert.equal(
    canSendHostWhatsAppTestMessage({
      testMessageAvailable: true,
      verified: true,
      enabled: true,
      optedIn: true,
    }),
    true
  );
});

test("unverified or disabled host cannot send a setup test", () => {
  for (const settings of [
    { testMessageAvailable: true, verified: false, enabled: true, optedIn: true },
    { testMessageAvailable: true, verified: true, enabled: false, optedIn: true },
    { testMessageAvailable: true, verified: true, enabled: true, optedIn: false },
    { testMessageAvailable: false, verified: true, enabled: true, optedIn: true },
  ]) {
    assert.equal(canSendHostWhatsAppTestMessage(settings), false);
  }
});

test("test-message client creates exactly one POST and returns queued state", async () => {
  let calls = 0;
  const message = await queueHostWhatsAppTestMessage(async (url, init) => {
    calls += 1;
    assert.equal(url, "/api/host/whatsapp-settings/test");
    assert.equal(init?.method, "POST");
    return new Response(JSON.stringify({ status: "queued" }), {
      status: 202,
      headers: { "Content-Type": "application/json" },
    });
  });
  assert.equal(calls, 1);
  assert.equal(message, "Test message queued.");
});

test("single-flight guard blocks duplicate clicks and resets after success", async () => {
  const guard = createSingleFlightGuard();
  let calls = 0;
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const first = guard.run(async () => {
    calls += 1;
    await pending;
    return "queued";
  });
  const duplicate = await guard.run(async () => {
    calls += 1;
    return "duplicate";
  });
  assert.deepEqual(duplicate, { started: false });
  assert.equal(guard.isActive(), true);
  release();
  assert.deepEqual(await first, { started: true, value: "queued" });
  assert.equal(guard.isActive(), false);
  assert.equal(calls, 1);
});

test("single-flight guard resets and API error remains useful after failure", async () => {
  const guard = createSingleFlightGuard();
  await assert.rejects(
    guard.run(() =>
      queueHostWhatsAppTestMessage(async () =>
        new Response(JSON.stringify({ message: "Meta rejected the setup template." }), {
          status: 503,
          headers: { "Content-Type": "application/json" },
        })
      )
    ),
    /Meta rejected the setup template/
  );
  assert.equal(guard.isActive(), false);
});

test("setup test API queues the configured event without calling Meta directly", () => {
  const source = readFileSync("app/api/host/whatsapp-settings/test/route.ts", "utf8");
  assert.match(source, /eventType: "host_whatsapp_test"/);
  assert.match(source, /templateName: config\.templates\.setupConfirmation/);
  assert.match(source, /enqueueNotificationRecord/);
  assert.doesNotMatch(source, /sendWhatsAppTemplateNotification|graph\.facebook/);
});

test("worker sends the Vercel-configured setup template and language under staging override", async () => {
  (process.env as Record<string, string | undefined>).NODE_ENV = "production";
  process.env.APP_ENV = "staging";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://nsanahmopvwrlwvmxdmf.supabase.co";
  process.env.FAMLO_ENABLE_WHATSAPP_NOTIFICATIONS = "false";
  process.env.WHATSAPP_ALLOW_STAGING_DELIVERY = "true";
  process.env.WHATSAPP_STAGING_TESTER_ALLOWLIST = "+919876543210";
  process.env.WHATSAPP_API_KEY = "test-token";
  process.env.WHATSAPP_PHONE_NUMBER_ID = "staging-phone-id";
  process.env.WHATSAPP_SETUP_CONFIRMATION_TEMPLATE_NAME = "configured_setup_template";
  process.env.WHATSAPP_SETUP_CONFIRMATION_TEMPLATE_LANGUAGE = "configured_language";

  let requestBody: any = null;
  global.fetch = async (_url, init) => {
    requestBody = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ messages: [{ id: "wamid.setup-real" }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  const result = await sendWhatsAppTemplateNotification({
    phone: "+919876543210",
    templateKind: "setupConfirmation",
    templateName: "configured_setup_template",
    languageCode: "configured_language",
    bodyVariables: ["Famlo host"],
    stagingExplicitDelivery: true,
  });
  assert.equal(result.providerMessageId, "wamid.setup-real");
  assert.equal(requestBody?.template?.name, "configured_setup_template");
  assert.equal(requestBody?.template?.language?.code, "configured_language");

  const worker = readFileSync("lib/notifications/notification-worker.ts", "utf8");
  assert.match(worker, /eventType === "host_whatsapp_test"/);
  assert.match(worker, /stagingExplicitDelivery/);
});
