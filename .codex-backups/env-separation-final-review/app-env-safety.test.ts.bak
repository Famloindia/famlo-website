import assert from "node:assert/strict";
import test from "node:test";

import {
  AppEnvSafetyError,
  assertRuntimeSafety,
  evaluateRuntimeSafety,
  getTempUnsafeLocalProductionSupabaseWarning,
} from "@/lib/app-env";
import {
  isChannexSyncExecutionEnabled,
  isRefundProviderExecutionEnabled,
  isSettlementPayoutExecutionEnabled,
} from "@/lib/finance/feature-flags";

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

test("local with live Razorpay key fails", () => {
  const result = evaluateRuntimeSafety("razorpay", {
    APP_ENV: "local",
    RAZORPAY_KEY_ID: "rzp_live_123",
  } as unknown as NodeJS.ProcessEnv);

  assert.equal(result.ok, false);
  assert.equal(result.code, "live_key_not_allowed_outside_production");
});

test("production with test Razorpay key fails", () => {
  const result = evaluateRuntimeSafety("razorpay", {
    APP_ENV: "production",
    RAZORPAY_KEY_ID: "rzp_test_123",
  } as unknown as NodeJS.ProcessEnv);

  assert.equal(result.ok, false);
  assert.equal(result.code, "test_key_not_allowed_in_production");
});

test("local with Channex production URL fails", () => {
  assert.throws(
    () =>
      assertRuntimeSafety("channex", {
        APP_ENV: "local",
        CHANNEX_ENVIRONMENT: "production",
        CHANNEX_PRODUCTION_BASE_URL: "https://app.channex.io",
      } as unknown as NodeJS.ProcessEnv),
    (error: unknown) =>
      error instanceof AppEnvSafetyError && error.code === "production_channex_not_allowed_outside_production"
  );
});

test("local with production Supabase URL fails", () => {
  assert.throws(
    () =>
      assertRuntimeSafety("supabase", {
        APP_ENV: "local",
        NEXT_PUBLIC_SUPABASE_URL: "https://famlo-prod.supabase.co",
      } as unknown as NodeJS.ProcessEnv),
    (error: unknown) =>
      error instanceof AppEnvSafetyError && error.code === "production_supabase_url_not_allowed_outside_production"
  );
});

test("local with production Supabase URL and temporary override is allowed", () => {
  const result = evaluateRuntimeSafety("supabase", {
    APP_ENV: "local",
    NEXT_PUBLIC_SUPABASE_URL: "https://famlo-prod.supabase.co",
    FAMLO_TEMP_ALLOW_LOCAL_PRODUCTION_SUPABASE: "true",
  } as unknown as NodeJS.ProcessEnv);

  assert.equal(result.ok, true);
  assert.equal(
    getTempUnsafeLocalProductionSupabaseWarning({
      APP_ENV: "local",
      NEXT_PUBLIC_SUPABASE_URL: "https://famlo-prod.supabase.co",
      FAMLO_TEMP_ALLOW_LOCAL_PRODUCTION_SUPABASE: "true",
    } as unknown as NodeJS.ProcessEnv),
    "TEMPORARY UNSAFE LOCAL MODE: local is connected to production Supabase. Do not run payments, payouts, refunds, Channex sync, destructive scripts, or test data mutations."
  );
});

test("staging with production Supabase URL stays blocked even with temporary override", () => {
  assert.throws(
    () =>
      assertRuntimeSafety("supabase", {
        APP_ENV: "staging",
        NEXT_PUBLIC_SUPABASE_URL: "https://famlo-prod.supabase.co",
        FAMLO_TEMP_ALLOW_LOCAL_PRODUCTION_SUPABASE: "true",
      } as unknown as NodeJS.ProcessEnv),
    (error: unknown) =>
      error instanceof AppEnvSafetyError && error.code === "production_supabase_url_not_allowed_outside_production"
  );
});

test("production ignores temporary override and still requires production Supabase", () => {
  assert.throws(
    () =>
      assertRuntimeSafety("supabase", {
        APP_ENV: "production",
        NEXT_PUBLIC_SUPABASE_URL: "https://staging-famlo.supabase.co",
        SUPABASE_ENVIRONMENT: "staging",
        FAMLO_TEMP_ALLOW_LOCAL_PRODUCTION_SUPABASE: "true",
      } as unknown as NodeJS.ProcessEnv),
    (error: unknown) =>
      error instanceof AppEnvSafetyError && error.code === "non_production_supabase_url_not_allowed_in_production"
  );
});

test("local with temporary override still blocks live Razorpay keys", () => {
  const result = evaluateRuntimeSafety("razorpay", {
    APP_ENV: "local",
    NEXT_PUBLIC_SUPABASE_URL: "https://famlo-prod.supabase.co",
    FAMLO_TEMP_ALLOW_LOCAL_PRODUCTION_SUPABASE: "true",
    RAZORPAY_KEY_ID: "rzp_live_123",
  } as unknown as NodeJS.ProcessEnv);

  assert.equal(result.ok, false);
  assert.equal(result.code, "live_key_not_allowed_outside_production");
});

test("local temporary override does not enable payout, refund, Channex, or email execution", () => {
  withEnv(
    {
      APP_ENV: "local",
      NEXT_PUBLIC_SUPABASE_URL: "https://famlo-prod.supabase.co",
      FAMLO_TEMP_ALLOW_LOCAL_PRODUCTION_SUPABASE: "true",
      REFUND_PROVIDER_EXECUTION_ENABLED: "true",
      SETTLEMENT_PAYOUT_EXECUTION_ENABLED: "true",
      CHANNEX_SYNC_EXECUTION_ENABLED: "true",
      EMAIL_EXECUTION_ENABLED: "true",
      EMAIL_PROVIDER: "resend",
      RAZORPAY_KEY_ID: "rzp_test_ok",
      RAZORPAY_KEY_SECRET: "secret",
      RAZORPAYX_KEY_ID: "rzp_test_ok",
      RAZORPAYX_KEY_SECRET: "secret",
      RAZORPAYX_ACCOUNT_NUMBER: "1000000000",
      CHANNEX_ENVIRONMENT: "production",
      CHANNEX_PRODUCTION_BASE_URL: "https://app.channex.io",
      FAMLO_CHANNEX_ALLOW_PRODUCTION_MUTATIONS: "true",
    },
    () => {
      assert.equal(isRefundProviderExecutionEnabled(), false);
      assert.equal(isSettlementPayoutExecutionEnabled(), false);
      assert.equal(isChannexSyncExecutionEnabled(), false);

      const emailExecution = evaluateRuntimeSafety("email_execution", process.env);
      assert.equal(emailExecution.ok, false);
      assert.equal(emailExecution.code, "unsafe_email_provider_outside_production");

      const whatsappExecution = evaluateRuntimeSafety("whatsapp_execution", process.env);
      assert.equal(whatsappExecution.ok, false);
      assert.equal(whatsappExecution.code, "unsafe_whatsapp_execution_outside_production");
    }
  );
});

test("payout, refund, and Channex execution stay blocked unless the correct env and flag are present", () => {
  withEnv(
    {
      APP_ENV: "local",
      REFUND_PROVIDER_EXECUTION_ENABLED: "true",
      SETTLEMENT_PAYOUT_EXECUTION_ENABLED: "true",
      CHANNEX_SYNC_EXECUTION_ENABLED: "true",
      RAZORPAY_KEY_ID: "rzp_live_blocked",
      RAZORPAY_KEY_SECRET: "secret",
      RAZORPAYX_KEY_ID: "rzp_live_blocked",
      RAZORPAYX_KEY_SECRET: "secret",
      RAZORPAYX_ACCOUNT_NUMBER: "1000000000",
      CHANNEX_ENVIRONMENT: "production",
      CHANNEX_PRODUCTION_BASE_URL: "https://app.channex.io",
      FAMLO_CHANNEX_ALLOW_PRODUCTION_MUTATIONS: "true",
    },
    () => {
      assert.equal(isRefundProviderExecutionEnabled(), false);
      assert.equal(isSettlementPayoutExecutionEnabled(), false);
      assert.equal(isChannexSyncExecutionEnabled(), false);
    }
  );

  withEnv(
    {
      APP_ENV: "staging",
      REFUND_PROVIDER_EXECUTION_ENABLED: "true",
      SETTLEMENT_PAYOUT_EXECUTION_ENABLED: "true",
      CHANNEX_SYNC_EXECUTION_ENABLED: "true",
      RAZORPAY_KEY_ID: "rzp_test_ok",
      RAZORPAY_KEY_SECRET: "secret",
      RAZORPAYX_ENABLED: "true",
      RAZORPAYX_KEY_ID: "rzp_test_ok",
      RAZORPAYX_KEY_SECRET: "secret",
      RAZORPAYX_ACCOUNT_NUMBER: "1000000000",
      CHANNEX_ENVIRONMENT: "staging",
      CHANNEX_STAGING_BASE_URL: "https://staging.channex.io",
      FAMLO_CHANNEX_ALLOW_PRODUCTION_MUTATIONS: "false",
    },
    () => {
      assert.equal(isRefundProviderExecutionEnabled(), false);
      assert.equal(isSettlementPayoutExecutionEnabled(), false);
      assert.equal(isChannexSyncExecutionEnabled(), true);
    }
  );
});

test("local rejects production Cloudflare R2 bucket name", () => {
  const result = evaluateRuntimeSafety("cloud_storage", {
    APP_ENV: "local",
    R2_BUCKET_NAME: "famlo-images",
  } as unknown as NodeJS.ProcessEnv);

  assert.equal(result.ok, false);
  assert.equal(result.code, "production_bucket_not_allowed_outside_production");
});

test("staging rejects production Cloudflare R2 bucket name", () => {
  const result = evaluateRuntimeSafety("cloud_storage", {
    APP_ENV: "staging",
    R2_BUCKET_NAME: "famlo-images",
  } as unknown as NodeJS.ProcessEnv);

  assert.equal(result.ok, false);
  assert.equal(result.code, "production_bucket_not_allowed_outside_production");
});

test("local and staging allow the staging Cloudflare R2 bucket name", () => {
  const resultLocal = evaluateRuntimeSafety("cloud_storage", {
    APP_ENV: "local",
    R2_BUCKET_NAME: "famlo-images-staging",
  } as unknown as NodeJS.ProcessEnv);
  assert.equal(resultLocal.ok, true);

  const resultStaging = evaluateRuntimeSafety("cloud_storage", {
    APP_ENV: "staging",
    R2_BUCKET_NAME: "famlo-images-staging",
  } as unknown as NodeJS.ProcessEnv);
  assert.equal(resultStaging.ok, true);
});

test("production allows only the production Cloudflare R2 bucket name", () => {
  const resultAllowed = evaluateRuntimeSafety("cloud_storage", {
    APP_ENV: "production",
    R2_BUCKET_NAME: "famlo-images",
  } as unknown as NodeJS.ProcessEnv);
  assert.equal(resultAllowed.ok, true);

  const result = evaluateRuntimeSafety("cloud_storage", {
    APP_ENV: "production",
    R2_BUCKET_NAME: "famlo-images-staging",
  } as unknown as NodeJS.ProcessEnv);

  assert.equal(result.ok, false);
  assert.equal(result.code, "non_production_bucket_not_allowed_in_production");
});

test("production rejects legacy or staging-like Cloudflare R2 bucket names", () => {
  const resultLegacyProd = evaluateRuntimeSafety("cloud_storage", {
    APP_ENV: "production",
    R2_BUCKET_NAME: "famlo-prod-images",
  } as unknown as NodeJS.ProcessEnv);

  assert.equal(resultLegacyProd.ok, false);
  assert.equal(resultLegacyProd.code, "non_production_bucket_not_allowed_in_production");
});

test("local and staging reject legacy staging-like Cloudflare R2 bucket names", () => {
  const resultLocal = evaluateRuntimeSafety("cloud_storage", {
    APP_ENV: "local",
    R2_BUCKET_NAME: "famlo-staging-images",
  } as unknown as NodeJS.ProcessEnv);
  assert.equal(resultLocal.ok, false);
  assert.equal(resultLocal.code, "production_bucket_not_allowed_outside_production");

  const resultStaging = evaluateRuntimeSafety("cloud_storage", {
    APP_ENV: "staging",
    R2_BUCKET_NAME: "famlo-staging-images",
  } as unknown as NodeJS.ProcessEnv);
  assert.equal(resultStaging.ok, false);
  assert.equal(resultStaging.code, "production_bucket_not_allowed_outside_production");
});

test("local production Supabase override still blocks the production Cloudflare R2 bucket", () => {
  const result = evaluateRuntimeSafety("cloud_storage", {
    APP_ENV: "local",
    NEXT_PUBLIC_SUPABASE_URL: "https://famlo-prod.supabase.co",
    FAMLO_TEMP_ALLOW_LOCAL_PRODUCTION_SUPABASE: "true",
    R2_BUCKET_NAME: "famlo-images",
  } as unknown as NodeJS.ProcessEnv);

  assert.equal(result.ok, false);
  assert.equal(result.code, "production_bucket_not_allowed_outside_production");
});

test("local and staging with WhatsApp enabled are blocked by runtime safety", () => {
  const resultLocal = evaluateRuntimeSafety("whatsapp_execution", {
    APP_ENV: "local",
    FAMLO_ENABLE_WHATSAPP_NOTIFICATIONS: "true",
  } as unknown as NodeJS.ProcessEnv);
  assert.equal(resultLocal.ok, false);
  assert.equal(resultLocal.code, "unsafe_whatsapp_execution_outside_production");

  const resultStaging = evaluateRuntimeSafety("whatsapp_execution", {
    APP_ENV: "staging",
    FAMLO_ENABLE_WHATSAPP_NOTIFICATIONS: "true",
  } as unknown as NodeJS.ProcessEnv);
  assert.equal(resultStaging.ok, false);
  assert.equal(resultStaging.code, "unsafe_whatsapp_execution_outside_production");
});

test("production may pass WhatsApp runtime safety", () => {
  const result = evaluateRuntimeSafety("whatsapp_execution", {
    APP_ENV: "production",
    FAMLO_ENABLE_WHATSAPP_NOTIFICATIONS: "true",
  } as unknown as NodeJS.ProcessEnv);

  assert.equal(result.ok, true);
});
