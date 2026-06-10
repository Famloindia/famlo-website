import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { assertRuntimeSafety } from "@/lib/app-env";
import { recordRecentEntityViewCompatibility } from "@/lib/recent-views-db";

type SupabaseAccessMode = "public" | "admin";
type SupabaseEnvironment = "local" | "staging" | "production";

const DEFAULT_SUPABASE_URL_ENV = "NEXT_PUBLIC_SUPABASE_URL";
const DEFAULT_SUPABASE_ANON_KEY_ENV = "NEXT_PUBLIC_SUPABASE_ANON_KEY";
const DEFAULT_SUPABASE_SERVICE_ROLE_KEY_ENV = "SUPABASE_SERVICE_ROLE_KEY";
const publicSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publicSupabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function requireEnv(value: string | undefined, name: string): string {
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function asTrimmedString(value: string | undefined): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function getSupabaseEnvironment(env: NodeJS.ProcessEnv = process.env): SupabaseEnvironment | null {
  const explicit = asTrimmedString(env.SUPABASE_ENVIRONMENT)?.toLowerCase();
  if (explicit === "local" || explicit === "staging" || explicit === "production") {
    return explicit;
  }
  return null;
}

function getStagePrefixedEnvName(stage: SupabaseEnvironment, suffix: "SUPABASE_URL" | "SUPABASE_ANON_KEY" | "SUPABASE_SERVICE_ROLE_KEY"): string {
  return `${stage.toUpperCase()}_${suffix}`;
}

function resolveSupabaseConfig(mode: SupabaseAccessMode, env: NodeJS.ProcessEnv = process.env): { url: string; key: string; urlEnvName: string; keyEnvName: string } {
  const stage = getSupabaseEnvironment(env);
  const urlEnvName = stage ? getStagePrefixedEnvName(stage, "SUPABASE_URL") : DEFAULT_SUPABASE_URL_ENV;
  const keyEnvName =
    mode === "admin"
      ? stage
        ? getStagePrefixedEnvName(stage, "SUPABASE_SERVICE_ROLE_KEY")
        : DEFAULT_SUPABASE_SERVICE_ROLE_KEY_ENV
      : stage
        ? getStagePrefixedEnvName(stage, "SUPABASE_ANON_KEY")
        : DEFAULT_SUPABASE_ANON_KEY_ENV;

  const url =
    asTrimmedString(env[urlEnvName]) ??
    requireEnv(env[DEFAULT_SUPABASE_URL_ENV], DEFAULT_SUPABASE_URL_ENV);
  const key =
    asTrimmedString(env[keyEnvName]) ??
    requireEnv(
      mode === "admin" ? env[DEFAULT_SUPABASE_SERVICE_ROLE_KEY_ENV] : env[DEFAULT_SUPABASE_ANON_KEY_ENV],
      mode === "admin" ? DEFAULT_SUPABASE_SERVICE_ROLE_KEY_ENV : DEFAULT_SUPABASE_ANON_KEY_ENV
    );

  return {
    url,
    key,
    urlEnvName: asTrimmedString(env[urlEnvName]) ? urlEnvName : DEFAULT_SUPABASE_URL_ENV,
    keyEnvName: asTrimmedString(env[keyEnvName])
      ? keyEnvName
      : mode === "admin"
        ? DEFAULT_SUPABASE_SERVICE_ROLE_KEY_ENV
        : DEFAULT_SUPABASE_ANON_KEY_ENV,
  };
}

export function getSupabaseConfigDiagnostics(
  mode: SupabaseAccessMode,
  env: NodeJS.ProcessEnv = process.env
): {
  mode: SupabaseAccessMode;
  supabaseEnvironment: SupabaseEnvironment | null;
  urlOrigin: string | null;
  projectRef: string | null;
  urlEnvName: string;
  keyEnvName: string;
  keyPresent: boolean;
} {
  const stage = getSupabaseEnvironment(env);
  const config = resolveSupabaseConfig(mode, env);
  let urlOrigin: string | null = null;
  let projectRef: string | null = null;

  try {
    const parsed = new URL(config.url);
    urlOrigin = parsed.origin;
    projectRef = parsed.hostname.split(".")[0] ?? null;
  } catch {
    urlOrigin = null;
    projectRef = null;
  }

  return {
    mode,
    supabaseEnvironment: stage,
    urlOrigin,
    projectRef,
    urlEnvName: config.urlEnvName,
    keyEnvName: config.keyEnvName,
    keyPresent: config.key.length > 0,
  };
}

// ✅ Singleton instances — created once, reused everywhere
let _publicClient: SupabaseClient | null = null;
let _adminClient: SupabaseClient | null = null;

export function createPublicSupabaseClient(): SupabaseClient {
  if (_publicClient) return _publicClient;
  assertRuntimeSafety("supabase");
  _publicClient = createClient(
    requireEnv(publicSupabaseUrl, DEFAULT_SUPABASE_URL_ENV),
    requireEnv(publicSupabaseAnonKey, DEFAULT_SUPABASE_ANON_KEY_ENV)
  );
  return _publicClient;
}

export function createBrowserSupabaseClient(): SupabaseClient {
  return createPublicSupabaseClient();
}

export function createAdminSupabaseClient(): SupabaseClient {
  if (typeof window !== "undefined") {
    throw new Error("createAdminSupabaseClient() must only be called on the server.");
  }
  if (_adminClient) return _adminClient;
  assertRuntimeSafety("supabase");
  const config = resolveSupabaseConfig("admin");
  _adminClient = createClient(
    config.url,
    config.key,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
  return _adminClient;
}

// ✅ Fixed: correct table name and column names from your schema
export async function recordRecentView(familyId: string) {
  const supabase = createPublicSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return;

  try {
    await recordRecentEntityViewCompatibility({
      supabase,
      userId: user.id,
      entityType: "host",
      entityId: familyId,
      legacyFamilyId: familyId
    });
  } catch (err) {
    console.error("Failed to record recent view:", err);
  }
}
