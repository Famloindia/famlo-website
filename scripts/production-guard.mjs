function resolveAppEnv(env = process.env) {
  const explicit = String(env.APP_ENV || "").trim().toLowerCase();
  if (explicit === "production") return "production";
  if (explicit === "staging" || explicit === "preview") return "staging";
  if (explicit === "local" || explicit === "development" || explicit === "dev") return "local";
  const vercelEnv = String(env.VERCEL_ENV || "").trim().toLowerCase();
  if (vercelEnv === "production") return "production";
  if (vercelEnv === "preview") return "staging";
  return "local";
}

export function assertSafeScriptEnv(scriptName, env = process.env) {
  if (resolveAppEnv(env) !== "production") return;
  if (String(env.FAMLO_ALLOW_PRODUCTION_SCRIPT_EXECUTION || "").trim().toLowerCase() === "true") {
    return;
  }
  throw new Error(
    `Refusing to run ${scriptName} in production. Set FAMLO_ALLOW_PRODUCTION_SCRIPT_EXECUTION=true only after explicit confirmation.`
  );
}
