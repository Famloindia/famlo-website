#!/usr/bin/env node

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";

const EXPECTED_STAGING_PROJECT_REF = "nsanahmopvwrlwvmxdmf";
const EXPECTED_PRODUCTION_PROJECT_REF = "wokjtntnbkwdsxbkotcr";

function requireEnv(name) {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new Error(`${name} is required.`);
  }
  return value.trim();
}

function parseConnectionString(connectionString) {
  const parsed = new URL(connectionString);
  return {
    protocol: parsed.protocol,
    username: parsed.username,
    hostname: parsed.hostname,
    port: parsed.port || null,
    database: parsed.pathname.replace(/^\//, "") || null,
  };
}

function maskValue(value, visible = 4) {
  if (!value) return "<missing>";
  if (value.length <= visible) return "*".repeat(value.length);
  return `${value.slice(0, visible)}***`;
}

function maskConnectionString(connectionString) {
  const parsed = parseConnectionString(connectionString);
  return {
    protocol: parsed.protocol.replace(":", ""),
    username: parsed.username ? maskValue(parsed.username, 6) : "<missing>",
    hostname: parsed.hostname,
    port: parsed.port ?? "<default>",
    database: parsed.database ?? "<missing>",
  };
}

function sameConnectionTarget(left, right) {
  const a = parseConnectionString(left);
  const b = parseConnectionString(right);
  return (
    a.protocol === b.protocol &&
    a.username === b.username &&
    a.hostname === b.hostname &&
    (a.port ?? "") === (b.port ?? "") &&
    (a.database ?? "") === (b.database ?? "")
  );
}

function timestampLabel() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return [
    now.getUTCFullYear(),
    pad(now.getUTCMonth() + 1),
    pad(now.getUTCDate()),
    "-",
    pad(now.getUTCHours()),
    pad(now.getUTCMinutes()),
    pad(now.getUTCSeconds()),
  ].join("");
}

function ensureDir(path) {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true });
  }
}

function assertCommandAvailable(name) {
  const result = spawnSync(name, ["--version"], { stdio: "ignore" });
  if (result.error || result.status !== 0) {
    throw new Error(
      `Missing required command: ${name}. Install PostgreSQL client tools so ${name} is available on PATH. ` +
      `For example on macOS: brew install libpq && brew link --force libpq`
    );
  }
}

function maskCommandArg(arg, masking = {}) {
  if (typeof arg !== "string") return String(arg);
  if (masking.stagingDbUrl && arg === masking.stagingDbUrl) return '"$STAGING_DB_URL"';
  if (masking.productionDbUrl && arg === masking.productionDbUrl) return '"$PRODUCTION_DB_URL"';
  return arg;
}

function safeCommandPreview(command, args, masking = {}) {
  return `${command} ${args.map((arg) => maskCommandArg(arg, masking)).join(" ")}`;
}

function runCommand(command, args, options = {}) {
  const pretty = safeCommandPreview(command, args, options.masking);
  if (options.dryRun) {
    console.log(`[dry-run] ${pretty}`);
    return { stdout: "", status: 0 };
  }

  const result = spawnSync(command, args, {
    cwd: options.cwd ?? process.cwd(),
    env: options.env ?? process.env,
    encoding: "utf8",
    stdio: options.captureOutput ? ["inherit", "pipe", "pipe"] : "inherit",
  });

  if (result.error) {
    throw result.error;
  }
  if ((result.status ?? 1) !== 0) {
    const stderr = options.captureOutput ? result.stderr : "";
    throw new Error(`Command failed: ${pretty}${stderr ? `\n${stderr}` : ""}`);
  }
  return result;
}

function writeJsonAuditFile(path, stdout, dryRun) {
  if (dryRun) {
    console.log(`[dry-run] write audit JSON to ${path}`);
    return;
  }
  ensureDir(dirname(path));
  writeFileSync(path, stdout, "utf8");
}

async function main() {
  const dryRun = String(process.env.DRY_RUN ?? "").toLowerCase() === "true";
  const confirm = String(process.env.CONFIRM_RESET_STAGING_SCHEMA ?? "").toLowerCase() === "true";

  if (!confirm) {
    throw new Error("Refusing to run without CONFIRM_RESET_STAGING_SCHEMA=true.");
  }

  const stagingDbUrl = requireEnv("STAGING_DB_URL");
  const productionDbUrl = requireEnv("PRODUCTION_DB_URL");
  const stagingProjectRef = requireEnv("STAGING_PROJECT_REF");
  const productionProjectRef = requireEnv("PRODUCTION_PROJECT_REF");

  if (stagingProjectRef !== EXPECTED_STAGING_PROJECT_REF) {
    throw new Error(`Refusing to run because STAGING_PROJECT_REF does not match ${EXPECTED_STAGING_PROJECT_REF}.`);
  }
  if (productionProjectRef !== EXPECTED_PRODUCTION_PROJECT_REF) {
    throw new Error(`Refusing to run because PRODUCTION_PROJECT_REF does not match ${EXPECTED_PRODUCTION_PROJECT_REF}.`);
  }
  if (stagingDbUrl === productionDbUrl || sameConnectionTarget(stagingDbUrl, productionDbUrl)) {
    throw new Error("Refusing to run because staging and production DB URLs appear to target the same database.");
  }

  assertCommandAvailable("pg_dump");
  assertCommandAvailable("psql");

  const backupsDir = join(process.cwd(), "backups", "staging-reset");
  const reportsDir = join(process.cwd(), "reports", "schema-drift");
  const stamp = timestampLabel();
  const stagingDumpPath = join(backupsDir, `staging-before-reset-${stamp}.dump`);
  const stagingSchemaPath = join(backupsDir, `staging-schema-before-reset-${stamp}.sql`);
  const productionSchemaPath = join(backupsDir, `production-public-schema-${stamp}.sql`);
  const latestAuditJsonPath = join(reportsDir, "latest-schema-drift.json");

  ensureDir(backupsDir);
  ensureDir(reportsDir);

  console.log("Staging reset from production schema");
  console.log(`- dry run: ${dryRun ? "yes" : "no"}`);
  console.log(`- staging target: ${JSON.stringify(maskConnectionString(stagingDbUrl))}`);
  console.log(`- production source: ${JSON.stringify(maskConnectionString(productionDbUrl))}`);
  console.log(`- backups dir: ${backupsDir}`);
  console.log(`- reports dir: ${reportsDir}`);

  runCommand("pg_dump", [
    stagingDbUrl,
    "--format=custom",
    `--file=${stagingDumpPath}`,
  ], { dryRun, masking: { stagingDbUrl, productionDbUrl } });

  runCommand("pg_dump", [
    stagingDbUrl,
    "--schema-only",
    `--file=${stagingSchemaPath}`,
  ], { dryRun, masking: { stagingDbUrl, productionDbUrl } });

  runCommand("pg_dump", [
    productionDbUrl,
    "--schema-only",
    "--no-owner",
    "--no-privileges",
    "--schema=public",
    `--file=${productionSchemaPath}`,
  ], { dryRun, masking: { stagingDbUrl, productionDbUrl } });

  runCommand("psql", [
    stagingDbUrl,
    "-v",
    "ON_ERROR_STOP=1",
    "-c",
    "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public; GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role; GRANT ALL ON SCHEMA public TO postgres, service_role;",
  ], { dryRun, masking: { stagingDbUrl, productionDbUrl } });

  runCommand("psql", [
    stagingDbUrl,
    "-v",
    "ON_ERROR_STOP=1",
    "-f",
    productionSchemaPath,
  ], { dryRun, masking: { stagingDbUrl, productionDbUrl } });

  runCommand("npm", ["run", "db:audit:schema-drift"], { dryRun, masking: { stagingDbUrl, productionDbUrl } });

  const jsonAuditResult = runCommand("npm", ["run", "db:audit:schema-drift:json"], {
    dryRun,
    captureOutput: true,
    masking: { stagingDbUrl, productionDbUrl },
  });
  writeJsonAuditFile(latestAuditJsonPath, jsonAuditResult.stdout, dryRun);

  console.log("Done.");
  console.log(`- staging backup dump: ${stagingDumpPath}`);
  console.log(`- staging schema backup: ${stagingSchemaPath}`);
  console.log(`- production public schema dump: ${productionSchemaPath}`);
  console.log(`- latest audit JSON: ${latestAuditJsonPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
