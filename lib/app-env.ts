export type AppEnv = "local" | "staging" | "production";

export type RuntimeSafetyScope =
  | "supabase"
  | "razorpay"
  | "razorpayx"
  | "channex"
  | "email_execution"
  | "whatsapp_execution"
  | "pro_billing_payment_execution"
  | "refund_execution"
  | "payout_execution"
  | "channex_sync_execution"
  | "cloud_storage";

export type ProviderKeyMode = "test" | "live" | "unknown" | "missing";

export type RuntimeSafetyCode =
  | "feature_disabled"
  | "email_execution_disabled"
  | "unsafe_email_provider_outside_production"
  | "unsafe_whatsapp_execution_outside_production"
  | "razorpay_not_configured"
  | "razorpayx_not_configured"
  | "live_key_not_allowed_outside_production"
  | "test_key_not_allowed_in_production"
  | "production_supabase_url_not_allowed_outside_production"
  | "non_production_supabase_url_not_allowed_in_production"
  | "production_channex_not_allowed_outside_production"
  | "non_production_channex_not_allowed_in_production"
  | "production_channex_mutations_not_confirmed"
  | "production_bucket_not_allowed_outside_production"
  | "non_production_bucket_not_allowed_in_production";

export const TEMP_UNSAFE_LOCAL_PRODUCTION_SUPABASE_WARNING =
  "TEMPORARY UNSAFE LOCAL MODE: local is connected to production Supabase. Do not run payments, payouts, refunds, Channex sync, destructive scripts, or test data mutations.";

type DeploymentStage = AppEnv | "unknown";
type RuntimeSafetyResult = {
  ok: boolean;
  scope: RuntimeSafetyScope;
  appEnv: AppEnv;
  code: RuntimeSafetyCode | null;
  message: string | null;
};

export class AppEnvSafetyError extends Error {
  code: RuntimeSafetyCode;
  scope: RuntimeSafetyScope;
  appEnv: AppEnv;

  constructor(input: { code: RuntimeSafetyCode; scope: RuntimeSafetyScope; appEnv: AppEnv; message: string }) {
    super(input.message);
    this.name = "AppEnvSafetyError";
    this.code = input.code;
    this.scope = input.scope;
    this.appEnv = input.appEnv;
  }
}

export function asTrimmedString(value: string | undefined): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

export function isTruthyEnv(value: string | undefined): boolean {
  if (typeof value !== "string" || value.trim().length === 0) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "on";
}

export function getAppEnv(env: NodeJS.ProcessEnv = process.env): AppEnv {
  const explicit = String(env.APP_ENV ?? "").trim().toLowerCase();
  if (explicit === "production") return "production";
  if (explicit === "staging" || explicit === "preview") return "staging";
  if (explicit === "local" || explicit === "development" || explicit === "dev") return "local";

  const publicExplicit = String(env.NEXT_PUBLIC_APP_ENV ?? "").trim().toLowerCase();
  if (publicExplicit === "production") return "production";
  if (publicExplicit === "staging" || publicExplicit === "preview") return "staging";
  if (publicExplicit === "local" || publicExplicit === "development" || publicExplicit === "dev") return "local";

  const vercelEnv = String(env.VERCEL_ENV ?? "").trim().toLowerCase();
  if (vercelEnv === "production") return "production";
  if (vercelEnv === "preview") return "staging";

  return "local";
}

export function detectRazorpayKeyMode(keyId: string | null): ProviderKeyMode {
  if (!keyId) return "missing";
  if (keyId.startsWith("rzp_test_")) return "test";
  if (keyId.startsWith("rzp_live_")) return "live";
  return "unknown";
}

export function isTempUnsafeLocalProductionSupabaseOverrideEnabled(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return isTruthyEnv(env.FAMLO_TEMP_ALLOW_LOCAL_PRODUCTION_SUPABASE);
}

function detectSupabaseStage(url: string | null, env: NodeJS.ProcessEnv): DeploymentStage {
  const explicit = String(env.SUPABASE_ENVIRONMENT ?? "").trim().toLowerCase();
  if (explicit === "local" || explicit === "staging" || explicit === "production") {
    return explicit;
  }

  if (!url) return "unknown";

  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1" || host === "host.docker.internal") return "local";
    if (host.includes("staging") || host.includes("preview") || host.includes("sandbox") || host.includes("dev")) {
      return "staging";
    }
    if (host.endsWith(".supabase.co")) return "production";
  } catch {
    if (/localhost|127\.0\.0\.1|host\.docker\.internal/i.test(url)) return "local";
    if (/staging|preview|sandbox|dev/i.test(url)) return "staging";
  }

  return "production";
}

function resolveChannexBaseUrl(env: NodeJS.ProcessEnv): string | null {
  const channexEnv = String(env.CHANNEX_ENVIRONMENT ?? env.CHANNEX_ENV ?? "staging").trim().toLowerCase();
  if (channexEnv === "production") {
    return asTrimmedString(env.CHANNEX_PRODUCTION_BASE_URL) ?? "https://app.channex.io";
  }
  return asTrimmedString(env.CHANNEX_STAGING_BASE_URL) ?? "https://staging.channex.io";
}

function detectChannexStage(url: string | null, env: NodeJS.ProcessEnv): DeploymentStage {
  const explicit = String(env.CHANNEX_ENVIRONMENT ?? env.CHANNEX_ENV ?? "").trim().toLowerCase();
  if (explicit === "production") return "production";
  if (explicit === "staging" || explicit === "preview" || explicit === "sandbox") return "staging";

  if (!url) return "unknown";

  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (host.includes("staging") || host.includes("sandbox") || host.includes("test")) return "staging";
    if (host === "app.channex.io" || host.endsWith(".channex.io")) return "production";
  } catch {
    if (/staging|sandbox|test/i.test(url)) return "staging";
    if (/app\.channex\.io|channex\.io/i.test(url)) return "production";
  }

  return "unknown";
}

function resolveEmailProvider(env: NodeJS.ProcessEnv): string {
  return String(env.EMAIL_PROVIDER ?? "resend").trim().toLowerCase() || "resend";
}

function isSafeEmailProvider(provider: string): boolean {
  return provider === "log" || provider === "mock" || provider === "console" || provider === "disabled";
}

export const PRODUCTION_R2_BUCKET = "famlo-images";
export const NON_PRODUCTION_R2_BUCKET = "famlo-images-staging";

export function detectR2BucketStage(bucket: string | null): DeploymentStage {
  if (!bucket) return "unknown";
  if (bucket === PRODUCTION_R2_BUCKET) return "production";
  if (bucket === NON_PRODUCTION_R2_BUCKET) return "staging";
  return "unknown";
}

export function getExpectedR2BucketForAppEnv(appEnv: AppEnv): string {
  return appEnv === "production" ? PRODUCTION_R2_BUCKET : NON_PRODUCTION_R2_BUCKET;
}

export function getTempUnsafeLocalProductionSupabaseWarning(
  env: NodeJS.ProcessEnv = process.env
): string | null {
  const appEnv = getAppEnv(env);
  const supabaseStage = detectSupabaseStage(asTrimmedString(env.NEXT_PUBLIC_SUPABASE_URL), env);

  if (
    appEnv === "local" &&
    supabaseStage === "production" &&
    isTempUnsafeLocalProductionSupabaseOverrideEnabled(env)
  ) {
    return TEMP_UNSAFE_LOCAL_PRODUCTION_SUPABASE_WARNING;
  }

  return null;
}

function ok(scope: RuntimeSafetyScope, appEnv: AppEnv): RuntimeSafetyResult {
  return { ok: true, scope, appEnv, code: null, message: null } as const;
}

function blocked(scope: RuntimeSafetyScope, appEnv: AppEnv, code: RuntimeSafetyCode, message: string): RuntimeSafetyResult {
  return { ok: false, scope, appEnv, code, message } as const;
}

export function evaluateRuntimeSafety(
  scope: RuntimeSafetyScope,
  env: NodeJS.ProcessEnv = process.env
): RuntimeSafetyResult {
  const appEnv = getAppEnv(env);
  const razorpayKeyMode = detectRazorpayKeyMode(asTrimmedString(env.RAZORPAY_KEY_ID));
  const razorpayXKeyMode = detectRazorpayKeyMode(asTrimmedString(env.RAZORPAYX_KEY_ID));
  const supabaseStage = detectSupabaseStage(asTrimmedString(env.NEXT_PUBLIC_SUPABASE_URL), env);
  const channexStage = detectChannexStage(resolveChannexBaseUrl(env), env);

  if (scope === "supabase") {
    if (
      appEnv === "local" &&
      supabaseStage === "production" &&
      isTempUnsafeLocalProductionSupabaseOverrideEnabled(env)
    ) {
      return ok(scope, appEnv);
    }

    if (appEnv !== "production" && supabaseStage === "production") {
      return blocked(scope, appEnv, "production_supabase_url_not_allowed_outside_production", "Production Supabase URLs are not allowed in local or staging environments.");
    }
    if (appEnv === "production" && supabaseStage !== "production") {
      return blocked(scope, appEnv, "non_production_supabase_url_not_allowed_in_production", "Production requires a production Supabase URL.");
    }
    return ok(scope, appEnv);
  }

  if (scope === "razorpay") {
    if (appEnv !== "production" && razorpayKeyMode === "live") {
      return blocked(scope, appEnv, "live_key_not_allowed_outside_production", "Live Razorpay keys are not allowed outside production.");
    }
    if (appEnv === "production" && razorpayKeyMode === "test") {
      return blocked(scope, appEnv, "test_key_not_allowed_in_production", "Production cannot use Razorpay test keys.");
    }
    return ok(scope, appEnv);
  }

  if (scope === "razorpayx") {
    if (appEnv !== "production" && razorpayXKeyMode === "live") {
      return blocked(scope, appEnv, "live_key_not_allowed_outside_production", "Live RazorpayX keys are not allowed outside production.");
    }
    if (appEnv === "production" && razorpayXKeyMode === "test") {
      return blocked(scope, appEnv, "test_key_not_allowed_in_production", "Production cannot use RazorpayX test keys.");
    }
    return ok(scope, appEnv);
  }

  if (scope === "channex") {
    if (appEnv !== "production" && channexStage === "production") {
      return blocked(scope, appEnv, "production_channex_not_allowed_outside_production", "Channex production configuration is not allowed in local or staging environments.");
    }
    if (appEnv === "production" && isTruthyEnv(env.CHANNEX_SYNC_EXECUTION_ENABLED) && channexStage !== "production") {
      return blocked(scope, appEnv, "non_production_channex_not_allowed_in_production", "Production Channex execution cannot use staging or sandbox configuration.");
    }
    return ok(scope, appEnv);
  }

  if (scope === "email_execution") {
    const provider = resolveEmailProvider(env);
    if (isSafeEmailProvider(provider)) return ok(scope, appEnv);
    if (!isTruthyEnv(env.EMAIL_EXECUTION_ENABLED)) {
      return blocked(scope, appEnv, "email_execution_disabled", "Real email execution is disabled. Use EMAIL_EXECUTION_ENABLED=true only in the correct environment.");
    }
    if (appEnv !== "production") {
      return blocked(scope, appEnv, "unsafe_email_provider_outside_production", "Real email providers are not allowed outside production.");
    }
    return ok(scope, appEnv);
  }

  if (scope === "whatsapp_execution") {
    if (appEnv !== "production") {
      return blocked(
        scope,
        appEnv,
        "unsafe_whatsapp_execution_outside_production",
        "WhatsApp execution is not allowed outside production."
      );
    }
    return ok(scope, appEnv);
  }

  if (scope === "pro_billing_payment_execution") {
    if (!isTruthyEnv(env.PRO_BILLING_PAYMENT_EXECUTION_ENABLED)) {
      return blocked(scope, appEnv, "feature_disabled", "Pro billing payment execution is disabled.");
    }
    if (!asTrimmedString(env.RAZORPAY_KEY_ID) || !asTrimmedString(env.RAZORPAY_KEY_SECRET)) {
      return blocked(scope, appEnv, "razorpay_not_configured", "Razorpay is not fully configured.");
    }
    const razorpaySafety = evaluateRuntimeSafety("razorpay", env);
    return razorpaySafety.ok ? ok(scope, appEnv) : blocked(scope, appEnv, razorpaySafety.code!, razorpaySafety.message!);
  }

  if (scope === "refund_execution") {
    if (!isTruthyEnv(env.REFUND_PROVIDER_EXECUTION_ENABLED)) {
      return blocked(scope, appEnv, "feature_disabled", "Refund provider execution is disabled.");
    }
    if (appEnv === "local" || appEnv === "staging") {
      return blocked(scope, appEnv, "feature_disabled", "Refund provider execution is not allowed in local development or staging.");
    }
    if (!asTrimmedString(env.RAZORPAY_KEY_ID) || !asTrimmedString(env.RAZORPAY_KEY_SECRET)) {
      return blocked(scope, appEnv, "razorpay_not_configured", "Razorpay is not fully configured.");
    }
    const razorpaySafety = evaluateRuntimeSafety("razorpay", env);
    return razorpaySafety.ok ? ok(scope, appEnv) : blocked(scope, appEnv, razorpaySafety.code!, razorpaySafety.message!);
  }

  if (scope === "payout_execution") {
    if (!isTruthyEnv(env.SETTLEMENT_PAYOUT_EXECUTION_ENABLED)) {
      return blocked(scope, appEnv, "feature_disabled", "Payout execution is disabled.");
    }
    if (appEnv === "local" || appEnv === "staging") {
      return blocked(scope, appEnv, "feature_disabled", "Payout execution is not allowed in local development or staging.");
    }
    if (!asTrimmedString(env.RAZORPAYX_KEY_ID) || !asTrimmedString(env.RAZORPAYX_KEY_SECRET) || !asTrimmedString(env.RAZORPAYX_ACCOUNT_NUMBER)) {
      return blocked(scope, appEnv, "razorpayx_not_configured", "RazorpayX is not fully configured.");
    }
    const razorpayXSafety = evaluateRuntimeSafety("razorpayx", env);
    return razorpayXSafety.ok ? ok(scope, appEnv) : blocked(scope, appEnv, razorpayXSafety.code!, razorpayXSafety.message!);
  }

  if (scope === "channex_sync_execution") {
    if (!isTruthyEnv(env.CHANNEX_SYNC_EXECUTION_ENABLED)) {
      return blocked(scope, appEnv, "feature_disabled", "Channex sync execution is disabled.");
    }
    if (appEnv === "local") {
      return blocked(scope, appEnv, "feature_disabled", "Channex sync execution is not allowed in local development.");
    }
    if (appEnv === "production" && channexStage !== "production") {
      return blocked(scope, appEnv, "non_production_channex_not_allowed_in_production", "Production Channex sync execution cannot use staging or sandbox configuration.");
    }
    if (appEnv === "production" && !isTruthyEnv(env.FAMLO_CHANNEX_ALLOW_PRODUCTION_MUTATIONS)) {
      return blocked(scope, appEnv, "production_channex_mutations_not_confirmed", "Production Channex mutations require FAMLO_CHANNEX_ALLOW_PRODUCTION_MUTATIONS=true.");
    }
    if (appEnv !== "production" && channexStage === "production") {
      return blocked(scope, appEnv, "production_channex_not_allowed_outside_production", "Channex production configuration is not allowed in local or staging environments.");
    }
    return ok(scope, appEnv);
  }

  if (scope === "cloud_storage") {
    const bucket = asTrimmedString(env.R2_BUCKET_NAME);
    if (!bucket) {
      return blocked(scope, appEnv, "feature_disabled", "R2_BUCKET_NAME is not configured.");
    }
    if (appEnv !== "production" && bucket !== NON_PRODUCTION_R2_BUCKET) {
      return blocked(
        scope,
        appEnv,
        "production_bucket_not_allowed_outside_production",
        "Local and staging environments must use the famlo-images-staging R2 bucket."
      );
    }
    if (appEnv === "production" && bucket !== PRODUCTION_R2_BUCKET) {
      return blocked(
        scope,
        appEnv,
        "non_production_bucket_not_allowed_in_production",
        "Production must use the famlo-images R2 bucket."
      );
    }
    return ok(scope, appEnv);
  }

  return ok(scope, appEnv);
}

export function isRuntimeSafetySatisfied(scope: RuntimeSafetyScope, env: NodeJS.ProcessEnv = process.env): boolean {
  return evaluateRuntimeSafety(scope, env).ok;
}

export function assertRuntimeSafety(scope: RuntimeSafetyScope, env: NodeJS.ProcessEnv = process.env): void {
  if (scope === "supabase") {
    const warning = getTempUnsafeLocalProductionSupabaseWarning(env);
    if (warning) {
      console.warn(warning);
    }
  }

  const result = evaluateRuntimeSafety(scope, env);
  if (result.ok) return;
  throw new AppEnvSafetyError({
    code: result.code!,
    scope,
    appEnv: result.appEnv,
    message: result.message!,
  });
}
