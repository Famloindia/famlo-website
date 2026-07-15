import { createClient } from "@supabase/supabase-js";

function asTrimmedString(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function getSupabaseEnvironment(env = process.env) {
  const explicit = asTrimmedString(env.SUPABASE_ENVIRONMENT)?.toLowerCase();
  if (explicit === "local" || explicit === "staging" || explicit === "production") return explicit;
  return null;
}

function getStagePrefixedEnvName(stage, suffix) {
  return `${stage.toUpperCase()}_${suffix}`;
}

function resolveSupabaseConfig(mode, env = process.env) {
  const stage = getSupabaseEnvironment(env);
  const defaultUrlEnvName = "NEXT_PUBLIC_SUPABASE_URL";
  const defaultKeyEnvName = mode === "admin" ? "SUPABASE_SERVICE_ROLE_KEY" : "NEXT_PUBLIC_SUPABASE_ANON_KEY";
  const stageUrlEnvName = stage ? getStagePrefixedEnvName(stage, "SUPABASE_URL") : null;
  const stageKeyEnvName =
    stage
      ? getStagePrefixedEnvName(stage, mode === "admin" ? "SUPABASE_SERVICE_ROLE_KEY" : "SUPABASE_ANON_KEY")
      : null;

  const url = asTrimmedString(stageUrlEnvName ? env[stageUrlEnvName] : undefined) ?? asTrimmedString(env[defaultUrlEnvName]);
  const key = asTrimmedString(stageKeyEnvName ? env[stageKeyEnvName] : undefined) ?? asTrimmedString(env[defaultKeyEnvName]);

  return {
    stage,
    url,
    key,
    urlEnvName: stageUrlEnvName && asTrimmedString(env[stageUrlEnvName]) ? stageUrlEnvName : defaultUrlEnvName,
    keyEnvName: stageKeyEnvName && asTrimmedString(env[stageKeyEnvName]) ? stageKeyEnvName : defaultKeyEnvName,
  };
}

function decodePayload(token) {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

function maskOrigin(url) {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.origin;
  } catch {
    return null;
  }
}

function getProjectRef(url) {
  if (!url) return null;
  try {
    return new URL(url).hostname.split(".")[0] ?? null;
  } catch {
    return null;
  }
}

async function run() {
  const config = resolveSupabaseConfig("admin");
  const payload = decodePayload(config.key);

  console.log(
    JSON.stringify(
      {
        appEnv: asTrimmedString(process.env.APP_ENV) ?? asTrimmedString(process.env.NEXT_PUBLIC_APP_ENV) ?? "unknown",
        supabaseEnvironment: config.stage,
        urlOrigin: maskOrigin(config.url),
        projectRef: getProjectRef(config.url),
        urlEnvName: config.urlEnvName,
        keyEnvName: config.keyEnvName,
        keyPresent: Boolean(config.key),
        keyLength: config.key?.length ?? 0,
        keyRole: payload?.role ?? null,
        keyRefMatchesUrl: getProjectRef(config.url) != null && getProjectRef(config.url) === (payload?.ref ?? null),
      },
      null,
      2
    )
  );

  if (!config.url || !config.key) {
    console.error("Missing Supabase admin config.");
    process.exitCode = 1;
    return;
  }

  const supabase = createClient(config.url, config.key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const authResult = await supabase.auth.admin.listUsers({ page: 1, perPage: 1 }).catch((error) => ({ error }));
  console.log(
    JSON.stringify(
      {
        authAdminOk: Boolean(authResult?.data),
        authAdminError: authResult?.error
          ? {
              code: authResult.error.code ?? null,
              message: authResult.error.message ?? "Unknown auth admin error.",
              status: authResult.error.status ?? null,
            }
          : null,
      },
      null,
      2
    )
  );

  for (const table of ["families", "hommie_profiles_v2", "users"]) {
    const result = await supabase.from(table).select("id", { head: true, count: "exact" });
    console.log(
      JSON.stringify(
        {
          table,
          ok: !result.error,
          count: result.count ?? null,
          error: result.error
            ? {
                code: result.error.code ?? null,
                message: result.error.message ?? "Unknown table read error.",
                details: result.error.details ?? null,
                hint: result.error.hint ?? null,
              }
            : null,
        },
        null,
        2
      )
    );
  }
}

await run();
