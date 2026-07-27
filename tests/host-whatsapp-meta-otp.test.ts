import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  sendHostWhatsappOtp,
  verifyHostWhatsappOtp,
} from "@/lib/host-whatsapp-otp-provider";
import { WHATSAPP_TEMPLATE_ENV } from "@/lib/whatsapp-config";

const originalEnv = { ...process.env };
const originalFetch = global.fetch;

function configureMetaOtp(): void {
  (process.env as Record<string, string | undefined>).NODE_ENV = "production";
  process.env.APP_ENV = "staging";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://nsanahmopvwrlwvmxdmf.supabase.co";
  process.env.FAMLO_ENABLE_WHATSAPP_NOTIFICATIONS = "false";
  process.env.WHATSAPP_ALLOW_STAGING_DELIVERY = "true";
  process.env.WHATSAPP_STAGING_TESTER_ALLOWLIST = "+919876543210";
  process.env.WHATSAPP_API_KEY = "test-access-token";
  process.env.WHATSAPP_PHONE_NUMBER_ID = "staging-phone-id";
  process.env.WHATSAPP_VERIFICATION_CODE_TEMPLATE_NAME = "famlo_whatsapp_verification_code";
  process.env.WHATSAPP_VERIFICATION_CODE_TEMPLATE_LANGUAGE = "exact_meta_language";
  process.env.HOST_WHATSAPP_OTP_HASH_SECRET = "test-hash-secret-that-is-long-enough";
  process.env.FAMLO_ENABLE_STAGING_TEST_OTP = "false";
}

test.afterEach(() => {
  process.env = { ...originalEnv };
  global.fetch = originalFetch;
});

test("Meta OTP send uses the Authentication Copy Code component contract", async () => {
  configureMetaOtp();
  let body: any = null;
  global.fetch = async (_url, init) => {
    body = JSON.parse(String(init?.body)) as Record<string, any>;
    return new Response(JSON.stringify({ messages: [{ id: "wamid.meta-otp-real" }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  const sent = await sendHostWhatsappOtp({
    challengeId: "challenge-1",
    phoneE164: "+919876543210",
  });
  assert.equal(sent.provider, "meta_whatsapp");
  assert.equal(sent.providerSessionId, "wamid.meta-otp-real");
  assert.ok(sent.codeHash);
  assert.equal(body?.template?.name, "famlo_whatsapp_verification_code");
  assert.equal(body?.template?.language?.code, "exact_meta_language");
  const [bodyComponent, buttonComponent] = body?.template?.components ?? [];
  const generatedCode = bodyComponent?.parameters?.[0]?.text;
  assert.match(generatedCode, /^\d{6}$/);
  assert.equal(buttonComponent?.type, "button");
  assert.equal(buttonComponent?.sub_type, "url");
  assert.equal(buttonComponent?.index, "0");
  assert.equal(buttonComponent?.parameters?.[0]?.type, "text");
  assert.equal(buttonComponent?.parameters?.[0]?.text, generatedCode);
  assert.equal(
    await verifyHostWhatsappOtp({
      challengeId: "challenge-1",
      phoneE164: "+919876543210",
      code: generatedCode,
      provider: "meta_whatsapp",
      providerSessionId: sent.providerSessionId,
      codeHash: sent.codeHash,
    }),
    true
  );
  assert.equal(
    await verifyHostWhatsappOtp({
      challengeId: "challenge-1",
      phoneE164: "+919876543210",
      code: "000000",
      provider: "meta_whatsapp",
      providerSessionId: sent.providerSessionId,
      codeHash: sent.codeHash,
    }),
    false
  );
});

test("Meta rejection does not create a successful OTP send result", async () => {
  configureMetaOtp();
  global.fetch = async () =>
    new Response(
      JSON.stringify({
        error: { code: 132001, type: "OAuthException", message: "Template is unavailable." },
      }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  await assert.rejects(
    sendHostWhatsappOtp({ challengeId: "challenge-rejected", phoneE164: "+919876543210" }),
    (error: any) => error.code === "132001" && !JSON.stringify(error).includes("test-access-token")
  );
});

test("Meta OTP delivery fails closed when staging delivery is disabled", async () => {
  configureMetaOtp();
  process.env.WHATSAPP_ALLOW_STAGING_DELIVERY = "false";
  await assert.rejects(
    sendHostWhatsappOtp({ challengeId: "challenge-disabled", phoneE164: "+919876543210" }),
    /verification delivery is disabled/i
  );
});

test("Meta OTP delivery rejects a recipient outside the staging tester allowlist", async () => {
  configureMetaOtp();
  await assert.rejects(
    sendHostWhatsappOtp({ challengeId: "challenge-blocked", phoneE164: "+919999999999" }),
    (error: any) => error.code === "staging_recipient_blocked"
  );
});

test("verification template has dedicated environment variables and no guessed language fallback", () => {
  assert.deepEqual(WHATSAPP_TEMPLATE_ENV.verificationCode, {
    name: "WHATSAPP_VERIFICATION_CODE_TEMPLATE_NAME",
    language: "WHATSAPP_VERIFICATION_CODE_TEMPLATE_LANGUAGE",
  });
  const config = readFileSync("lib/whatsapp-config.ts", "utf8");
  assert.match(config, /kind === "verificationCode"/);
  assert.match(config, /return value\(WHATSAPP_TEMPLATE_ENV\[kind\]\.language\) \?\? ""/);
});

test("frontend only shows sent after the server returns a challenge ID", () => {
  const component = readFileSync("components/partners/HostWhatsAppSettingsCard.tsx", "utf8");
  const rejectionCheck = component.indexOf("!response.ok || !payload.challengeId");
  const successMessage = component.indexOf('setMessage("Verification code sent.")');
  assert.ok(rejectionCheck >= 0);
  assert.ok(successMessage > rejectionCheck);

  const settings = readFileSync("lib/host-whatsapp-settings.ts", "utf8");
  const providerSend = settings.indexOf("await sendHostWhatsappOtp");
  const challengeInsert = settings.indexOf('.from("host_whatsapp_otp_challenges").insert');
  assert.ok(providerSend >= 0);
  assert.ok(challengeInsert > providerSend);
});

test("legacy staging test OTP cannot run in a deployed staging production runtime", async () => {
  configureMetaOtp();
  process.env.FAMLO_ENABLE_STAGING_TEST_OTP = "true";
  global.fetch = async () =>
    new Response(JSON.stringify({ messages: [{ id: "wamid.real-not-test" }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  const sent = await sendHostWhatsappOtp({
    challengeId: "challenge-production",
    phoneE164: "+919876543210",
  });
  assert.equal(sent.provider, "meta_whatsapp");
  assert.equal(sent.providerSessionId, "wamid.real-not-test");
});
