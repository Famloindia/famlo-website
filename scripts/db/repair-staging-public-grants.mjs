#!/usr/bin/env node

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

function maskValue(value, visible = 4) {
  if (!value) return "<missing>";
  if (value.length <= visible) return "*".repeat(value.length);
  return `${value.slice(0, visible)}***`;
}

function maskConnectionString(connectionString) {
  const parsed = new URL(connectionString);
  return {
    protocol: parsed.protocol.replace(":", ""),
    username: parsed.username ? maskValue(parsed.username, 6) : "<missing>",
    hostname: parsed.hostname,
    port: parsed.port || "<default>",
    database: parsed.pathname.replace(/^\//, "") || "<missing>",
  };
}

function maskCommandArg(arg, masking = {}) {
  if (arg === masking.stagingDbUrl) return '"$STAGING_DB_URL"';
  if (arg === masking.productionDbUrl) return '"$PRODUCTION_DB_URL"';
  return arg;
}

function safePreview(command, args, masking = {}) {
  return `${command} ${args.map((arg) => maskCommandArg(arg, masking)).join(" ")}`;
}

function runCommand(command, args, options = {}) {
  const preview = safePreview(command, args, options.masking);
  if (options.dryRun) {
    console.log(`[dry-run] ${preview}`);
    return { stdout: "", stderr: "", status: 0 };
  }

  const result = spawnSync(command, args, {
    cwd: options.cwd ?? process.cwd(),
    env: options.env ?? process.env,
    encoding: "utf8",
    stdio: options.captureOutput ? ["inherit", "pipe", "pipe"] : "inherit",
  });

  if (result.error) throw result.error;
  if ((result.status ?? 1) !== 0) {
    throw new Error(
      `Command failed: ${preview}${result.stderr ? `\n${result.stderr}` : ""}`
    );
  }
  return result;
}

function extractPrivilegeStatements(sqlText) {
  return sqlText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(
      (line) =>
        line.startsWith("GRANT ") ||
        line.startsWith("REVOKE ") ||
        line.startsWith("ALTER DEFAULT PRIVILEGES ")
    );
}

function splitStatements(statements) {
  const defaultPrivilegeStatements = [];
  const liveGrantStatements = [];

  for (const statement of statements) {
    if (statement.startsWith("ALTER DEFAULT PRIVILEGES ")) {
      defaultPrivilegeStatements.push(statement);
    } else {
      liveGrantStatements.push(statement);
    }
  }

  return { liveGrantStatements, defaultPrivilegeStatements };
}

function main() {
  const dryRun = String(process.env.DRY_RUN ?? "").toLowerCase() === "true";
  const confirm = String(process.env.CONFIRM_REPAIR_STAGING_PUBLIC_GRANTS ?? "").toLowerCase() === "true";

  if (!dryRun && !confirm) {
    throw new Error("Refusing to run without CONFIRM_REPAIR_STAGING_PUBLIC_GRANTS=true.");
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

  const tempDir = mkdtempSync(join(tmpdir(), "famlo-public-grants-"));
  const dumpPath = join(tempDir, "production-public-with-privs.sql");
  const grantsPath = join(tempDir, "production-public-grants-only.sql");

  try {
    console.log("Staging public grants repair");
    console.log(`- dry run: ${dryRun ? "yes" : "no"}`);
    console.log(`- staging target: ${JSON.stringify(maskConnectionString(stagingDbUrl))}`);
    console.log(`- production source: ${JSON.stringify(maskConnectionString(productionDbUrl))}`);

    runCommand(
      "pg_dump",
      [productionDbUrl, "--schema=public", "--schema-only", `--file=${dumpPath}`],
      { dryRun, masking: { stagingDbUrl, productionDbUrl } }
    );

    if (dryRun) {
      console.log(`[dry-run] extract GRANT/REVOKE/ALTER DEFAULT PRIVILEGES into ${grantsPath}`);
      runCommand("psql", [stagingDbUrl, "-v", "ON_ERROR_STOP=1", "-f", grantsPath], {
        dryRun,
        masking: { stagingDbUrl, productionDbUrl },
      });
      return;
    }

    const dumpSql = readFileSync(dumpPath, "utf8");
    const statements = extractPrivilegeStatements(dumpSql);

    if (statements.length === 0) {
      throw new Error("No privilege statements were extracted from the production public schema dump.");
    }

    const { liveGrantStatements, defaultPrivilegeStatements } = splitStatements(statements);

    if (liveGrantStatements.length === 0) {
      throw new Error("No live GRANT/REVOKE privilege statements were extracted from the production public schema dump.");
    }

    writeFileSync(grantsPath, `${liveGrantStatements.join("\n")}\n`, "utf8");
    console.log(`- extracted live privilege statements: ${liveGrantStatements.length}`);
    if (defaultPrivilegeStatements.length > 0) {
      console.log(`- skipped default-privilege statements: ${defaultPrivilegeStatements.length}`);
    }

    runCommand("psql", [stagingDbUrl, "-v", "ON_ERROR_STOP=1", "-f", grantsPath], {
      masking: { stagingDbUrl, productionDbUrl },
    });
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
