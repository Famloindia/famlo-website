#!/usr/bin/env node

import { Client } from "pg";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const EXPECTED_STAGING_PROJECT_REF = "nsanahmopvwrlwvmxdmf";
const NULL_TOKEN = "__FAMLO_NULL__";

const IMPORT_ORDER = [
  "users",
  "families",
  "hosts",
  "host_onboarding_drafts",
  "family_applications",
  "family_photos",
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

const INITIAL_SKIP_COLUMNS_BY_TABLE = {
  host_onboarding_drafts: new Set(["family_application_id"]),
  conversations: new Set(["booking_id"]),
};

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
  return arg;
}

function safeCommandPreview(command, args, masking = {}) {
  return `${command} ${args.map((arg) => maskCommandArg(arg, masking)).join(" ")}`;
}

function runCommand(command, args, options = {}) {
  const pretty = safeCommandPreview(command, args, options.masking);
  if (options.dryRun) {
    console.log(`[dry-run] ${pretty}`);
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
    const stderr = options.captureOutput ? result.stderr : "";
    throw new Error(`Command failed: ${pretty}${stderr ? `\n${stderr}` : ""}`);
  }
  return result;
}

function runCommandAllowFailure(command, args, options = {}) {
  const pretty = safeCommandPreview(command, args, options.masking);
  if (options.dryRun) {
    console.log(`[dry-run] ${pretty}`);
    return { stdout: "", stderr: "", status: 0, pretty };
  }

  const result = spawnSync(command, args, {
    cwd: options.cwd ?? process.cwd(),
    env: options.env ?? process.env,
    encoding: "utf8",
    stdio: ["inherit", "pipe", "pipe"],
    timeout: options.timeoutMs ?? 15 * 60 * 1000,
  });

  if (result.error) throw result.error;
  return {
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    status: result.status ?? 1,
    pretty,
  };
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeMarkdown(path, lines) {
  writeFileSync(path, `${lines.join("\n")}\n`, "utf8");
}

function quoteIdent(value) {
  return `"${String(value).replace(/"/g, "\"\"")}"`;
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

    if (char === "\r") continue;
    cell += char;
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell === NULL_TOKEN ? null : cell);
    rows.push(row);
  }

  return rows;
}

async function fetchPublicTableCount(client) {
  const result = await client.query(`
    select count(*)::int as count
    from information_schema.tables
    where table_schema = 'public'
      and table_type = 'BASE TABLE'
  `);
  return Number(result.rows[0]?.count ?? 0);
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

async function getColumnMetadata(client, tableName) {
  const result = await client.query(
    `
      select
        column_name,
        data_type,
        udt_name,
        is_nullable,
        column_default
      from information_schema.columns
      where table_schema = 'public'
        and table_name = $1
      order by ordinal_position
    `,
    [tableName]
  );
  return result.rows.map((row) => ({
    columnName: String(row.column_name),
    dataType: String(row.data_type),
    udtName: String(row.udt_name),
    isNullable: String(row.is_nullable) === "YES",
    columnDefault: row.column_default == null ? null : String(row.column_default),
  }));
}

function productionSchemaIncludesTable(schemaSql, tableName) {
  const patterns = [
    new RegExp(`create table(?: if not exists)?\\s+public\\.${tableName}\\b`, "i"),
    new RegExp(`create table(?: if not exists)?\\s+${tableName}\\b`, "i"),
  ];
  return patterns.some((pattern) => pattern.test(schemaSql));
}

function lastLines(text, count) {
  return text.split(/\r?\n/).slice(-count).join("\n");
}

function sanitizeProductionSchemaForExistingPublicSchema(schemaSql) {
  const lines = schemaSql.split(/\r?\n/);
  const sanitized = [];

  let skipCommentBlock = false;
  let skipSchemaStatement = false;

  for (const line of lines) {
    if (line.startsWith("-- Name: public; Type: SCHEMA;")) {
      skipSchemaStatement = true;
      continue;
    }

    if (line.startsWith("-- Name: SCHEMA public; Type: COMMENT;")) {
      skipCommentBlock = true;
      continue;
    }

    if (skipSchemaStatement) {
      if (line.trim() === "CREATE SCHEMA public;") {
        skipSchemaStatement = false;
        continue;
      }
      if (line.trim() === "") {
        skipSchemaStatement = false;
        continue;
      }
    }

    if (skipCommentBlock) {
      if (line.trim().startsWith("COMMENT ON SCHEMA public ")) {
        skipCommentBlock = false;
        continue;
      }
      if (line.trim() === "") {
        skipCommentBlock = false;
        continue;
      }
    }

    sanitized.push(line);
  }

  return sanitized.join("\n");
}

function normalizeTimestamp(value) {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed) return value;

  const gmtMatch = trimmed.match(/^(.*GMT[+-]\d{4})/);
  const candidate = gmtMatch ? gmtMatch[1] : trimmed;
  const timestamp = new Date(candidate);

  if (Number.isNaN(timestamp.getTime())) {
    return value;
  }

  return timestamp.toISOString();
}

function looksLikeJson(value) {
  return (
    (value.startsWith("{") && value.endsWith("}")) ||
    (value.startsWith("[") && value.endsWith("]"))
  );
}

function defaultJsonValue(columnMeta) {
  if (columnMeta.columnDefault?.includes("'[]'::jsonb")) return [];
  if (columnMeta.columnName === "rooms") return [];
  return {};
}

function coerceJsonValue(value, columnMeta) {
  if (value == null) return null;
  if (typeof value !== "string") return value;

  const trimmed = value.trim();
  if (trimmed === "") {
    return columnMeta.isNullable ? null : defaultJsonValue(columnMeta);
  }

  if (trimmed === "[object Object]") {
    return defaultJsonValue(columnMeta);
  }

  if (looksLikeJson(trimmed)) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return defaultJsonValue(columnMeta);
    }
  }

  return defaultJsonValue(columnMeta);
}

function coerceArrayValue(value) {
  if (value == null) return null;
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return [String(value)];

  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function coerceScalarValue(value, columnMeta) {
  if (value == null) return null;
  if (typeof value !== "string") return value;

  if (columnMeta.dataType === "boolean") {
    if (value === "true") return true;
    if (value === "false") return false;
  }

  if (["smallint", "integer", "bigint"].includes(columnMeta.dataType)) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isNaN(parsed)) return parsed;
  }

  if (["numeric", "real", "double precision"].includes(columnMeta.dataType)) {
    const parsed = Number.parseFloat(value);
    if (!Number.isNaN(parsed)) return parsed;
  }

  if (
    columnMeta.dataType === "date" ||
    columnMeta.dataType === "timestamp with time zone" ||
    columnMeta.dataType === "timestamp without time zone"
  ) {
    return normalizeTimestamp(value);
  }

  return value;
}

function coerceValue(value, columnMeta) {
  if (value == null) return null;

  if (columnMeta.dataType === "ARRAY" || columnMeta.udtName.startsWith("_")) {
    return coerceArrayValue(value);
  }

  if (columnMeta.dataType === "json" || columnMeta.dataType === "jsonb") {
    return coerceJsonValue(value, columnMeta);
  }

  return coerceScalarValue(value, columnMeta);
}

function getInitialSkippedColumns(tableName) {
  return INITIAL_SKIP_COLUMNS_BY_TABLE[tableName] ?? new Set();
}

async function importCsvTable(client, tableName, csvPath, dryRun) {
  const csvRows = parseCsv(readFileSync(csvPath, "utf8"));
  const [header = [], ...dataRows] = csvRows;
  const csvColumns = header.map((column) => String(column));
  const targetColumns = await getColumnMetadata(client, tableName);
  const targetColumnsByName = new Map(targetColumns.map((column) => [column.columnName, column]));
  const initialSkippedColumns = getInitialSkippedColumns(tableName);
  const commonColumns = csvColumns.filter(
    (column) => targetColumnsByName.has(column) && !initialSkippedColumns.has(column)
  );
  const skippedColumns = csvColumns.filter(
    (column) => !targetColumnsByName.has(column) || initialSkippedColumns.has(column)
  );

  if (commonColumns.length === 0) {
    return {
      status: "quarantined",
      reason: "no_common_columns",
      commonColumns,
      skippedColumns,
      rowCount: dataRows.length,
    };
  }

  if (dryRun) {
    console.log(
      `[dry-run] import ${tableName} using common columns: ${commonColumns.join(", ")}`
    );
    return {
      status: skippedColumns.length > 0 ? "partial" : "imported",
      commonColumns,
      skippedColumns,
      rowCount: dataRows.length,
    };
  }

  const commonIndexes = commonColumns.map((column) => csvColumns.indexOf(column));
  let insertedRowCount = 0;
  let conflictIgnoredRowCount = 0;
  let failedRowCount = 0;
  let firstFailureMessage = null;

  try {
    await client.query("begin");
    for (const row of dataRows) {
      await client.query("savepoint import_row");
      try {
        const values = commonIndexes.map((index, commonIndex) =>
          coerceValue(row[index], targetColumnsByName.get(commonColumns[commonIndex]))
        );
        const placeholders = values.map((_, index) => `$${index + 1}`).join(", ");
        const sql = `insert into public.${quoteIdent(tableName)} (${commonColumns.map(quoteIdent).join(", ")}) values (${placeholders}) on conflict do nothing`;
        const result = await client.query(sql, values);
        if ((result.rowCount ?? 0) > 0) {
          insertedRowCount += result.rowCount ?? 0;
        } else {
          conflictIgnoredRowCount += 1;
        }
        await client.query("release savepoint import_row");
      } catch (error) {
        failedRowCount += 1;
        if (!firstFailureMessage) {
          firstFailureMessage = error instanceof Error ? error.message : String(error);
        }
        await client.query("rollback to savepoint import_row");
        await client.query("release savepoint import_row");
      }
    }
    await client.query("commit");

    if (insertedRowCount === 0 && failedRowCount > 0) {
      return {
        status: "quarantined",
        reason: "insert_failed",
        message: firstFailureMessage,
        commonColumns,
        skippedColumns,
        rowCount: dataRows.length,
        insertedRowCount,
        failedRowCount,
      };
    }

    const partialReasons = [];
    if (skippedColumns.length > 0) partialReasons.push("partial_column_import");
    if (failedRowCount > 0) partialReasons.push("partial_row_import");
    if (conflictIgnoredRowCount > 0) partialReasons.push("conflict_ignored");

    return {
      status: partialReasons.length > 0 ? "partial" : "imported",
      reason: partialReasons[0] ?? null,
      message: firstFailureMessage,
      commonColumns,
      skippedColumns,
      rowCount: dataRows.length,
      insertedRowCount,
      failedRowCount,
      conflictIgnoredRowCount,
    };
  } catch (error) {
    await client.query("rollback");
    return {
      status: "quarantined",
      reason: "insert_failed",
      message: error instanceof Error ? error.message : String(error),
      commonColumns,
      skippedColumns,
      rowCount: dataRows.length,
    };
  }
}

function renderQuarantineReport(items) {
  const lines = ["# Quarantine Report", ""];
  if (items.length === 0) {
    lines.push("No tables were quarantined.");
    return lines;
  }

  for (const item of items) {
    lines.push(`## ${item.table}`);
    lines.push(`- reason: ${item.reason}`);
    if (item.skippedColumns?.length) {
      lines.push(`- skipped columns: ${item.skippedColumns.join(", ")}`);
    }
    if (item.message) {
      lines.push(`- message: ${item.message}`);
    }
    if (item.insertedRowCount != null) {
      lines.push(`- inserted rows: ${item.insertedRowCount}`);
    }
    if (item.failedRowCount != null) {
      lines.push(`- failed rows: ${item.failedRowCount}`);
    }
    lines.push(`- row count: ${item.rowCount ?? 0}`);
    lines.push("");
  }
  return lines;
}

async function backfillHostOnboardingDraftFamilyApplicationLinks(client, preserveDataDir) {
  const draftCsvPath = join(preserveDataDir, "host_onboarding_drafts.csv");
  if (!existsSync(draftCsvPath)) {
    return { updatedRowCount: 0, skipped: true, reason: "csv_missing" };
  }

  const csvRows = parseCsv(readFileSync(draftCsvPath, "utf8"));
  const [header = [], ...dataRows] = csvRows;
  const idIndex = header.indexOf("id");
  const familyApplicationIdIndex = header.indexOf("family_application_id");

  if (idIndex === -1 || familyApplicationIdIndex === -1) {
    return { updatedRowCount: 0, skipped: true, reason: "required_columns_missing" };
  }

  let updatedRowCount = 0;
  for (const row of dataRows) {
    const draftId = row[idIndex];
    const familyApplicationId = row[familyApplicationIdIndex];
    if (!draftId || !familyApplicationId) continue;

    const result = await client.query(
      `
        update public.host_onboarding_drafts
        set family_application_id = $2
        where id = $1
          and exists (
            select 1
            from public.family_applications
            where id = $2
          )
      `,
      [draftId, familyApplicationId]
    );
    updatedRowCount += result.rowCount ?? 0;
  }

  return { updatedRowCount, skipped: false };
}

async function main() {
  const dryRun = String(process.env.DRY_RUN ?? "").toLowerCase() === "true";
  const confirm = String(process.env.CONFIRM_RECOVER_EMPTY_STAGING ?? "").toLowerCase() === "true";

  if (!dryRun && !confirm) {
    throw new Error("Refusing to run without CONFIRM_RECOVER_EMPTY_STAGING=true.");
  }

  const stagingDbUrl = requireEnv("STAGING_DB_URL");
  const stagingProjectRef = requireEnv("STAGING_PROJECT_REF");
  const resetBackupDir = requireEnv("RESET_BACKUP_DIR");

  if (stagingProjectRef !== EXPECTED_STAGING_PROJECT_REF) {
    throw new Error(`Refusing to run because STAGING_PROJECT_REF does not match ${EXPECTED_STAGING_PROJECT_REF}.`);
  }

  assertCommandAvailable("psql");

  const backupDir = join(process.cwd(), resetBackupDir);
  const productionSchemaPath = join(backupDir, "production-public-schema.sql");
  const stagingFullDumpPath = join(backupDir, "staging-full-before-reset.dump");
  const stagingSchemaPath = join(backupDir, "staging-schema-before-reset.sql");
  const preserveManifestPath = join(backupDir, "preserve-manifest.json");
  const preserveDataDir = join(backupDir, "preserve-data");
  const restoreSummaryPath = join(backupDir, "restore-summary.json");
  const quarantineReportPath = join(backupDir, "quarantine-report.md");
  const recoveryLogPath = join(backupDir, "recovery-schema-restore.log");
  const sanitizedSchemaPath = join(backupDir, "production-public-schema.restore.sql");
  const auditJsonPath = join(process.cwd(), "reports", "schema-drift", "latest-schema-drift.json");

  console.log("[1/8] verifying backup dir");
  if (!existsSync(backupDir)) throw new Error(`RESET_BACKUP_DIR does not exist: ${resetBackupDir}`);
  for (const requiredPath of [
    productionSchemaPath,
    stagingFullDumpPath,
    stagingSchemaPath,
    preserveManifestPath,
  ]) {
    if (!existsSync(requiredPath)) throw new Error(`Required backup file is missing: ${requiredPath}`);
  }
  if (!existsSync(preserveDataDir)) throw new Error(`Required preserve-data directory is missing: ${preserveDataDir}`);
  ensureDir(join(process.cwd(), "reports", "schema-drift"));

  console.log(`- staging target: ${JSON.stringify(maskConnectionString(stagingDbUrl))}`);
  console.log(`- reset backup dir: ${resetBackupDir}`);

  const productionSchemaSql = readFileSync(productionSchemaPath, "utf8");
  const sanitizedSchemaSql = sanitizeProductionSchemaForExistingPublicSchema(productionSchemaSql);
  writeFileSync(sanitizedSchemaPath, sanitizedSchemaSql, "utf8");
  const preserveManifest = JSON.parse(readFileSync(preserveManifestPath, "utf8"));
  void preserveManifest;

  let restoreSummary = {
    backupDir: resetBackupDir,
    dryRun,
    tableCountBefore: 0,
    schemaRestored: false,
    tableCountAfterRestore: 0,
    importedTables: [],
    skippedTables: [],
    quarantinedTables: [],
  };

  if (dryRun) {
    console.log("[2/8] checking staging schema state");
    console.log("[dry-run] query public table count");
    console.log("[3/8] restoring production schema into staging");
    console.log(`[dry-run] sanitized restore SQL written to ${sanitizedSchemaPath}`);
    runCommand("psql", [stagingDbUrl, "-v", "ON_ERROR_STOP=1", "-f", sanitizedSchemaPath], {
      dryRun,
      masking: { stagingDbUrl },
    });
    console.log(`[dry-run] capture restore log to ${recoveryLogPath}`);
    console.log("[4/8] verifying restored schema");
    console.log("[dry-run] query public table count after restore");
    console.log("[dry-run] verify public.users if present in production schema");
    console.log("[dry-run] verify public.families if present in production schema");
    console.log("[5/8] importing preserved data");
    for (const tableName of IMPORT_ORDER) {
      const csvPath = join(preserveDataDir, `${tableName}.csv`);
      if (!existsSync(csvPath)) {
        restoreSummary.skippedTables.push({ table: tableName, reason: "csv_missing" });
        continue;
      }
      console.log(`[dry-run] inspect target table ${tableName} and import from ${csvPath}`);
      restoreSummary.importedTables.push({ table: tableName, status: "planned" });
    }
    console.log("[6/8] writing reports");
    console.log(`[dry-run] write ${restoreSummaryPath}`);
    console.log(`[dry-run] write ${quarantineReportPath}`);
    console.log("[7/8] rerunning audit");
    runCommand("npm", ["run", "db:audit:schema-drift"], { dryRun });
    console.log(`[dry-run] node scripts/db/audit-supabase-schema-drift.mjs --json > ${auditJsonPath}`);
    console.log("[8/8] done");
    return;
  }

  const client = new Client({ connectionString: stagingDbUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();

  try {
    console.log("[2/8] checking staging schema state");
    const tableCountBefore = await fetchPublicTableCount(client);
    restoreSummary.tableCountBefore = tableCountBefore;
    console.log(`- current public table count: ${tableCountBefore}`);

    if (tableCountBefore === 0) {
      console.log("[3/8] restoring production schema into staging");
      console.log(`- using sanitized restore SQL: ${sanitizedSchemaPath}`);
      const result = runCommandAllowFailure(
        "psql",
        [stagingDbUrl, "-v", "ON_ERROR_STOP=1", "-f", sanitizedSchemaPath],
        { masking: { stagingDbUrl } }
      );
      writeFileSync(
        recoveryLogPath,
        `COMMAND\n${result.pretty}\n\nSTDOUT\n${result.stdout}\n\nSTDERR\n${result.stderr}\n`,
        "utf8"
      );
      if (result.status !== 0) {
        throw new Error(
          `Schema restore failed.\nLast 80 log lines:\n${lastLines(
            `${result.stdout}\n${result.stderr}`,
            80
          )}`
        );
      }
      restoreSummary.schemaRestored = true;
    } else {
      console.log("[3/8] restoring production schema into staging");
      console.log("- skipped schema restore because public schema is not empty");
    }

    console.log("[4/8] verifying restored schema");
    const tableCountAfterRestore = await fetchPublicTableCount(client);
    restoreSummary.tableCountAfterRestore = tableCountAfterRestore;
    if (tableCountAfterRestore <= 0) {
      const recoveryLog = existsSync(recoveryLogPath) ? readFileSync(recoveryLogPath, "utf8") : "";
      throw new Error(
        `Schema restore did not produce any public tables.\nLast 80 log lines:\n${lastLines(recoveryLog, 80)}`
      );
    }

    for (const tableName of ["users", "families"]) {
      if (productionSchemaIncludesTable(productionSchemaSql, tableName)) {
        const present = await tableExists(client, tableName);
        if (!present) {
          throw new Error(`Expected public.${tableName} to exist after schema restore.`);
        }
      }
    }

    console.log(`- restored public table count: ${tableCountAfterRestore}`);

    console.log("[5/8] importing preserved data");
    for (const tableName of IMPORT_ORDER) {
      const csvPath = join(preserveDataDir, `${tableName}.csv`);
      if (!existsSync(csvPath)) {
        restoreSummary.skippedTables.push({ table: tableName, reason: "csv_missing" });
        continue;
      }

      const present = await tableExists(client, tableName);
      if (!present) {
        restoreSummary.quarantinedTables.push({ table: tableName, reason: "target_table_missing" });
        continue;
      }

      const result = await importCsvTable(client, tableName, csvPath, dryRun);
      if (result.status === "imported" || result.status === "partial") {
        restoreSummary.importedTables.push({ table: tableName, ...result });
        if (result.status === "partial") {
          restoreSummary.quarantinedTables.push({
            table: tableName,
            reason: result.reason ?? "partial_import",
            ...result,
          });
        }
      } else {
        restoreSummary.quarantinedTables.push({ table: tableName, ...result });
      }
    }

    const linkRepairResult = await backfillHostOnboardingDraftFamilyApplicationLinks(client, preserveDataDir);
    restoreSummary.linkRepair = linkRepairResult;

    console.log("[6/8] writing reports");
    writeJson(restoreSummaryPath, restoreSummary);
    writeMarkdown(quarantineReportPath, renderQuarantineReport(restoreSummary.quarantinedTables));

    console.log("[7/8] rerunning audit");
    runCommand("npm", ["run", "db:audit:schema-drift"]);
    const auditResult = runCommand("node", ["scripts/db/audit-supabase-schema-drift.mjs", "--json"], {
      captureOutput: true,
    });
    writeFileSync(auditJsonPath, auditResult.stdout, "utf8");

    console.log("[8/8] done");
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
