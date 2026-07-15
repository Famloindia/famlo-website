#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(SCRIPT_DIR, "..", "..");
const ENV_PATH = resolve(ROOT, ".env.local");
const DEV_LOG_PATH = resolve(ROOT, ".next/dev/logs/next-development.log");

function parseDotEnv(filePath) {
  if (!existsSync(filePath)) return {};
  const text = readFileSync(filePath, "utf8");
  const env = {};

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) continue;
    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }

  return env;
}

function maskSupabaseUrl(url) {
  if (!url) return "<missing>";
  try {
    const parsed = new URL(url);
    const host = parsed.hostname;
    const ref = host.split(".")[0] ?? "<unknown>";
    return `${parsed.protocol}//${ref}***.${host.split(".").slice(1).join(".")}`;
  } catch {
    return "<invalid>";
  }
}

function extractRuntimeFailures(logPath) {
  if (!existsSync(logPath)) return [];
  return readFileSync(logPath, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .filter((entry) => {
      const message = String(entry.message ?? "");
      return message.includes("42501") || message.toLowerCase().includes("permission denied");
    });
}

function pickMostUsefulFailure(failures) {
  if (failures.length === 0) return null;
  return (
    [...failures].reverse().find((entry) =>
      String(entry.message ?? "").includes("host_pro_subscriptions")
    ) ?? failures[failures.length - 1]
  );
}

function extractCodeReferences() {
  return [
    "app/partnerslogin/home/dashboard/page.tsx -> loadHostProAccessMap(...)",
    "app/api/app/session/route.ts -> loadHostProAccess(...)",
    "lib/host-pro-access.ts -> host_pro_subscriptions select",
    "lib/pro-billing/access-status.ts -> markExpiredProSubscriptionsPaused(...)",
  ];
}

function main() {
  const env = {
    ...parseDotEnv(ENV_PATH),
    ...process.env,
  };
  const failures = extractRuntimeFailures(DEV_LOG_PATH);
  const latestFailure = pickMostUsefulFailure(failures);

  const report = {
    environment: {
      APP_ENV: env.APP_ENV ?? null,
      NEXT_PUBLIC_APP_ENV: env.NEXT_PUBLIC_APP_ENV ?? null,
      SUPABASE_ENVIRONMENT: env.SUPABASE_ENVIRONMENT ?? null,
      NEXT_PUBLIC_SUPABASE_URL: maskSupabaseUrl(env.NEXT_PUBLIC_SUPABASE_URL),
      STAGING_SUPABASE_URL: maskSupabaseUrl(env.STAGING_SUPABASE_URL),
      STAGING_DB_URL_PRESENT: Boolean(env.STAGING_DB_URL),
      PRODUCTION_DB_URL_PRESENT: Boolean(env.PRODUCTION_DB_URL),
    },
    latestRuntimeFailure: latestFailure
      ? {
          source: latestFailure.source ?? null,
          level: latestFailure.level ?? null,
          message: latestFailure.message ?? null,
        }
      : null,
    likelyFailingObject:
      latestFailure && String(latestFailure.message ?? "").includes("host_pro_subscriptions")
        ? "public.host_pro_subscriptions"
        : null,
    codeReferences: extractCodeReferences(),
    notes: [
      "This audit is read-only.",
      "Direct grant/policy inspection requires STAGING_DB_URL and PRODUCTION_DB_URL.",
      "When DB URLs are absent, runtime log evidence is used to identify the failing dashboard object.",
    ],
  };

  console.log(JSON.stringify(report, null, 2));
}

main();
