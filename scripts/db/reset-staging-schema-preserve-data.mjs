#!/usr/bin/env node

import { Client } from "pg";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";

const EXPECTED_STAGING_PROJECT_REF = "nsanahmopvwrlwvmxdmf";
const EXPECTED_PRODUCTION_PROJECT_REF = "wokjtntnbkwdsxbkotcr";
const NULL_TOKEN = "__FAMLO_NULL__";

const PRESERVE_CANDIDATES = [
  "users",
  "families",
  "hosts",
  "family_applications",
  "family_photos",
  "host_onboarding_drafts",
  "bookings",
  "bookings_v2",
  "stay_units_v2",
  "conversations",
  "messages",
  "host_pro_subscriptions",
  "host_pro_subscription_rooms",
  "host_pro_billing_orders",
  "host_pro_billing_order_properties",
  "host_pro_billing_order_rooms",
  "host_pro_invoices",
  "support_tickets",
  "platform_settings",
];

const IMPORT_ORDER = [
  "users",
  "families",
  "hosts",
  "family_applications",
  "family_photos",
  "host_onboarding_drafts",
  "stay_units_v2",
  "bookings",
  "bookings_v2",
  "conversations",
  "messages",
  "host_pro_subscriptions",
  "host_pro_subscription_rooms",
  "host_pro_billing_orders",
  "host_pro_billing_order_properties",
  "host_pro_billing_order_rooms",
  "host_pro_invoices",
  "support_tickets",
  "platform_settings",
];

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

function quoteIdent(value) {
  return `"${String(value).replace(/"/g, "\"\"")}"`;
}

function encodeCsvCell(value) {
  if (value === null || typeof value === "undefined") return NULL_TOKEN;
  const text = String(value);
  return `"${text.replace(/"/g, "\"\"")}"`;
}

function writeCsv(path, columns, rows) {
  const lines = [];
  lines.push(columns.map((column) => encodeCsvCell(column)).join(","));
  for (const row of rows) {
    lines.push(
      columns
        .map((column) => encodeCsvCell(row[column]))
        .join(",")
    );
  }
  writeFileSync(path, `${lines.join("\n")}\n`, "utf8");
}

function parseCsv(content) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    const next = content[index + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }

    if (char === ",") {
      row.push(cell === NULL_TOKEN ? null : cell);
      cell = "";
      continue;
    }

    if (char === "\n") {
      row.push(cell === NULL_TOKEN ? null : cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    if (char === "\r") {
      continue;
    }

    cell += char;
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell === NULL_TOKEN ? null : cell);
    rows.push(row);
  }

  return rows;
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeMarkdown(path, lines) {
  writeFileSync(path, `${lines.join("\n")}\n`, "utf8");
}

async function tableExists(client, tableName) {
  const result = await client.query(
    `
      select exists (
        select 1
        from information_schema.tables
        where table_schema = 'public'
          and table_name = $1
      ) as present
    `,
    [tableName]
  );
  return Boolean(result.rows[0]?.present);
}

async function getColumns(client, tableName) {
  const result = await client.query(
    `
      select column_name
      from information_schema.columns
      where table_schema = 'public'
        and table_name = $1
      order by ordinal_position
    `,
    [tableName]
  );
  return result.rows.map((row) => String(row.column_name));
}

async function exportPreserveTables(client, preserveDir, dryRun) {
  const manifest = {};

  for (const tableName of PRESERVE_CANDIDATES) {
    const present = await tableExists(client, tableName);
    if (!present) {
      manifest[tableName] = {
        exported: false,
        reason: "missing_in_staging_before_reset",
      };
      continue;
    }

    const columns = await getColumns(client, tableName);
    const query = `select ${columns.map(quoteIdent).join(", ")} from public.${quoteIdent(tableName)}`;
    const { rows } = await client.query(query);
    const csvPath = join(preserveDir, `${tableName}.csv`);

    if (dryRun) {
      console.log(`[dry-run] export preserve table ${tableName} -> ${csvPath}`);
    } else {
      writeCsv(csvPath, columns, rows);
    }

    manifest[tableName] = {
      exported: true,
      rowCount: rows.length,
      columns,
      csvPath,
    };
  }

  return manifest;
}

function sortTablesForImport(tableNames) {
  const rank = new Map(IMPORT_ORDER.map((table, index) => [table, index]));
  return [...tableNames].sort((left, right) => {
    const leftRank = rank.has(left) ? rank.get(left) : Number.MAX_SAFE_INTEGER;
    const rightRank = rank.has(right) ? rank.get(right) : Number.MAX_SAFE_INTEGER;
    if (leftRank !== rightRank) return leftRank - rightRank;
    return left.localeCompare(right);
  });
}

async function importPreservedData(client, preserveDir, manifest, dryRun) {
  const summary = {
    importedTables: [],
    skippedTables: [],
    quarantinedTables: [],
  };

  const quarantine = [];
  const tableNames = sortTablesForImport(
    Object.entries(manifest)
      .filter(([, details]) => details.exported)
      .map(([tableName]) => tableName)
  );

  for (const tableName of tableNames) {
    const details = manifest[tableName];
    const existsInNewSchema = await tableExists(client, tableName);
    if (!existsInNewSchema) {
      const item = {
        table: tableName,
        reason: "missing_in_new_schema",
      };
      summary.skippedTables.push(item);
      quarantine.push(item);
      continue;
    }

    const newColumns = await getColumns(client, tableName);
    const commonColumns = details.columns.filter((column) => newColumns.includes(column));
    const skippedColumns = details.columns.filter((column) => !newColumns.includes(column));

    if (commonColumns.length === 0) {
      const item = {
        table: tableName,
        reason: "no_common_columns",
      };
      summary.quarantinedTables.push(item);
      quarantine.push(item);
      continue;
    }

    if (dryRun) {
      console.log(
        `[dry-run] import preserve table ${tableName} using common columns: ${commonColumns.join(", ")}`
      );
      if (skippedColumns.length > 0) {
        console.log(`[dry-run] quarantine partial columns for ${tableName}: ${skippedColumns.join(", ")}`);
      }
      summary.importedTables.push({
        table: tableName,
        rowCount: details.rowCount,
        commonColumns,
        skippedColumns,
      });
      if (skippedColumns.length > 0) {
        quarantine.push({
          table: tableName,
          reason: "partial_column_import",
          skippedColumns,
        });
      }
      continue;
    }

    const csvRows = parseCsv(readFileSync(details.csvPath, "utf8"));
    const [header, ...dataRows] = csvRows;
    const headerColumns = header.map((column) => String(column));
    const commonIndexes = commonColumns.map((column) => headerColumns.indexOf(column));

    try {
      await client.query("begin");
      for (const row of dataRows) {
        const values = commonIndexes.map((index) => row[index]);
        const placeholders = values.map((_, index) => `$${index + 1}`).join(", ");
        const sql = `insert into public.${quoteIdent(tableName)} (${commonColumns.map(quoteIdent).join(", ")}) values (${placeholders})`;
        await client.query(sql, values);
      }
      await client.query("commit");
      summary.importedTables.push({
        table: tableName,
        rowCount: dataRows.length,
        commonColumns,
        skippedColumns,
      });
      if (skippedColumns.length > 0) {
        quarantine.push({
          table: tableName,
          reason: "partial_column_import",
          skippedColumns,
        });
      }
    } catch (error) {
      await client.query("rollback");
      const item = {
        table: tableName,
        reason: "insert_failed",
        message: error instanceof Error ? error.message : String(error),
        commonColumns,
        skippedColumns,
      };
      summary.quarantinedTables.push(item);
      quarantine.push(item);
    }
  }

  return { summary, quarantine };
}

function renderQuarantineReport(quarantine) {
  const lines = ["# Quarantine Report", ""];
  if (quarantine.length === 0) {
    lines.push("No tables or columns were quarantined.");
    return lines;
  }

  for (const item of quarantine) {
    lines.push(`## ${item.table}`);
    lines.push(`- reason: ${item.reason}`);
    if (item.skippedColumns?.length) {
      lines.push(`- skipped columns: ${item.skippedColumns.join(", ")}`);
    }
    if (item.message) {
      lines.push(`- message: ${item.message}`);
    }
    lines.push("");
  }
  return lines;
}

async function main() {
  const dryRun = String(process.env.DRY_RUN ?? "").toLowerCase() === "true";
  const confirm = String(process.env.CONFIRM_RESET_STAGING_SCHEMA ?? "").toLowerCase() === "true";

  if (!dryRun && !confirm) {
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

  const stamp = timestampLabel();
  const baseDir = join(process.cwd(), "backups", "staging-reset", stamp);
  const preserveDir = join(baseDir, "preserve-data");
  const reportsDir = join(process.cwd(), "reports", "schema-drift");
  const stagingDumpPath = join(baseDir, "staging-full-before-reset.dump");
  const stagingSchemaPath = join(baseDir, "staging-schema-before-reset.sql");
  const productionSchemaPath = join(baseDir, "production-public-schema.sql");
  const restoreSummaryPath = join(baseDir, "restore-summary.json");
  const quarantineReportPath = join(baseDir, "quarantine-report.md");
  const preserveManifestPath = join(baseDir, "preserve-manifest.json");
  const latestAuditJsonPath = join(reportsDir, "latest-schema-drift.json");

  ensureDir(baseDir);
  ensureDir(preserveDir);
  ensureDir(reportsDir);

  console.log("Staging schema reset preserving data");
  console.log(`- dry run: ${dryRun ? "yes" : "no"}`);
  console.log(`- staging target: ${JSON.stringify(maskConnectionString(stagingDbUrl))}`);
  console.log(`- production source: ${JSON.stringify(maskConnectionString(productionDbUrl))}`);
  console.log(`- preserve candidates: ${PRESERVE_CANDIDATES.join(", ")}`);
  console.log(`- import order: ${IMPORT_ORDER.join(" -> ")}`);
  console.log(`- backup base dir: ${baseDir}`);

  let preserveManifest = {};
  if (dryRun) {
    for (const tableName of PRESERVE_CANDIDATES) {
      console.log(`[dry-run] inspect and export preserve candidate: ${tableName}`);
    }
  } else {
    const stagingClient = new Client({ connectionString: stagingDbUrl, ssl: { rejectUnauthorized: false } });
    await stagingClient.connect();
    try {
      preserveManifest = await exportPreserveTables(stagingClient, preserveDir, dryRun);
      writeJson(preserveManifestPath, preserveManifest);
    } finally {
      await stagingClient.end();
    }
  }

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

  let restoreSummary = {
    dryRun,
    preserveCandidates: PRESERVE_CANDIDATES,
    importOrder: IMPORT_ORDER,
    importedTables: [],
    skippedTables: [],
    quarantinedTables: [],
  };
  let quarantine = [];

  if (dryRun) {
    for (const tableName of IMPORT_ORDER) {
      console.log(`[dry-run] attempt import for ${tableName} if exported and present in new schema`);
    }
    quarantine.push({
      table: "<computed-at-runtime>",
      reason: "dry_run_no_live_compatibility_check",
    });
  } else {
    preserveManifest = JSON.parse(readFileSync(preserveManifestPath, "utf8"));
    const stagingClient = new Client({ connectionString: stagingDbUrl, ssl: { rejectUnauthorized: false } });
    await stagingClient.connect();
    try {
      const imported = await importPreservedData(stagingClient, preserveDir, preserveManifest, dryRun);
      restoreSummary = {
        ...restoreSummary,
        ...imported.summary,
      };
      quarantine = imported.quarantine;
    } finally {
      await stagingClient.end();
    }
  }

  if (dryRun) {
    console.log("[dry-run] npm run db:audit:schema-drift");
    console.log("[dry-run] npm run db:audit:schema-drift:json > reports/schema-drift/latest-schema-drift.json");
    console.log(`[dry-run] write restore summary to ${restoreSummaryPath}`);
    console.log(`[dry-run] write quarantine report to ${quarantineReportPath}`);
  } else {
    runCommand("npm", ["run", "db:audit:schema-drift"], { masking: { stagingDbUrl, productionDbUrl } });
    const auditResult = runCommand("npm", ["run", "db:audit:schema-drift:json"], {
      captureOutput: true,
      masking: { stagingDbUrl, productionDbUrl },
    });
    writeFileSync(latestAuditJsonPath, auditResult.stdout, "utf8");
    writeJson(restoreSummaryPath, restoreSummary);
    writeMarkdown(quarantineReportPath, renderQuarantineReport(quarantine));
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
