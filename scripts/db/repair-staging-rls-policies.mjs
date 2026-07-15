#!/usr/bin/env node

import { Client } from "pg";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const EXPECTED_STAGING_PROJECT_REF = "nsanahmopvwrlwvmxdmf";

const KNOWN_PUBLIC_POLICY_SQL = {
  "fam_coin_wallets.fam_coin_wallets_owner_select":
    `CREATE POLICY fam_coin_wallets_owner_select ON public.fam_coin_wallets FOR SELECT TO authenticated USING ((auth.uid() = user_id));`,
  "guide_otps.guide_otps_all":
    `CREATE POLICY guide_otps_all ON public.guide_otps USING (true) WITH CHECK (true);`,
  "session_audit_log.session_no_delete":
    `CREATE POLICY session_no_delete ON public.session_audit_log FOR DELETE USING (false);`,
  "session_audit_log.session_no_update":
    `CREATE POLICY session_no_update ON public.session_audit_log FOR UPDATE USING (false);`,
  "users.users_insert_own_row":
    `CREATE POLICY users_insert_own_row ON public.users FOR INSERT TO authenticated WITH CHECK ((auth.uid() = id));`,
  "users.users_select_own_row":
    `CREATE POLICY users_select_own_row ON public.users FOR SELECT TO authenticated USING ((auth.uid() = id));`,
  "users.users_update_own_row":
    `CREATE POLICY users_update_own_row ON public.users FOR UPDATE TO authenticated USING ((auth.uid() = id)) WITH CHECK ((auth.uid() = id));`,
};

const KNOWN_STORAGE_POLICY_SQL = {
  "objects.Authenticated delete photos":
    `CREATE POLICY "Authenticated delete photos" ON storage.objects FOR DELETE TO public USING ((bucket_id = 'photos'::text));`,
  "objects.Authenticated update photos":
    `CREATE POLICY "Authenticated update photos" ON storage.objects FOR UPDATE TO public USING ((bucket_id = 'photos'::text));`,
  "objects.Authenticated upload photos":
    `CREATE POLICY "Authenticated upload photos" ON storage.objects FOR INSERT TO public WITH CHECK ((bucket_id = 'photos'::text));`,
  "objects.Public can upload application photos":
    `CREATE POLICY "Public can upload application photos" ON storage.objects FOR INSERT TO anon, authenticated WITH CHECK ((bucket_id = 'application-photos'::text));`,
  "objects.Public can view application photos":
    `CREATE POLICY "Public can view application photos" ON storage.objects FOR SELECT TO anon, authenticated USING ((bucket_id = 'application-photos'::text));`,
  "objects.Public read photos":
    `CREATE POLICY "Public read photos" ON storage.objects FOR SELECT TO public USING ((bucket_id = 'photos'::text));`,
};

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

function parseAuditReport(text) {
  const start = text.indexOf("{");
  if (start === -1) {
    throw new Error("Audit report does not contain JSON payload.");
  }
  return JSON.parse(text.slice(start));
}

function loadAuditReport(reportPath) {
  if (!existsSync(reportPath)) {
    throw new Error(`Audit report not found: ${reportPath}`);
  }
  return parseAuditReport(readFileSync(reportPath, "utf8"));
}

function ensureKnownItems(items, knownMap, label) {
  const unknown = items.filter((item) => !(item in knownMap));
  if (unknown.length > 0) {
    throw new Error(
      `Refusing to repair unknown ${label}: ${unknown.join(", ")}. Update the script with explicit definitions first.`
    );
  }
}

function buildRlsStatements(rlsMismatches) {
  return rlsMismatches.map((item) => {
    const tableName = item.key;
    if (item.production.rls_enabled && !item.staging.rls_enabled) {
      return `ALTER TABLE public.${tableName} ENABLE ROW LEVEL SECURITY;`;
    }
    if (!item.production.rls_enabled && item.staging.rls_enabled) {
      return `ALTER TABLE public.${tableName} DISABLE ROW LEVEL SECURITY;`;
    }
    if (item.production.rls_forced && !item.staging.rls_forced) {
      return `ALTER TABLE public.${tableName} FORCE ROW LEVEL SECURITY;`;
    }
    if (!item.production.rls_forced && item.staging.rls_forced) {
      return `ALTER TABLE public.${tableName} NO FORCE ROW LEVEL SECURITY;`;
    }
    return null;
  }).filter(Boolean);
}

async function executeStatements(client, label, statements, dryRun) {
  if (statements.length === 0) {
    console.log(`- ${label}: nothing to apply`);
    return;
  }

  console.log(`- ${label}: ${statements.length} statement(s)`);
  for (const sql of statements) {
    if (dryRun) {
      console.log(`[dry-run] ${sql}`);
      continue;
    }
    await client.query(sql);
  }
}

async function main() {
  const dryRun = String(process.env.DRY_RUN ?? "").toLowerCase() === "true";
  const confirm = String(process.env.CONFIRM_REPAIR_STAGING_RLS ?? "").toLowerCase() === "true";
  if (!dryRun && !confirm) {
    throw new Error("Refusing to run without CONFIRM_REPAIR_STAGING_RLS=true.");
  }

  const stagingDbUrl = requireEnv("STAGING_DB_URL");
  const stagingProjectRef = requireEnv("STAGING_PROJECT_REF");
  const reportPath =
    process.env.SCHEMA_DRIFT_REPORT_PATH?.trim() ||
    join(process.cwd(), "reports", "schema-drift", "latest-schema-drift.json");

  if (stagingProjectRef !== EXPECTED_STAGING_PROJECT_REF) {
    throw new Error(
      `Refusing to run because STAGING_PROJECT_REF does not match ${EXPECTED_STAGING_PROJECT_REF}.`
    );
  }

  const report = loadAuditReport(reportPath);
  const sections = report.sections ?? {};
  const rlsMismatches = sections.rls?.mismatches ?? [];
  const missingPublicPolicies = sections.policies?.missingInStaging ?? [];
  const missingStoragePolicies = sections.storagePolicies?.missingInStaging ?? [];

  ensureKnownItems(missingPublicPolicies, KNOWN_PUBLIC_POLICY_SQL, "public policies");
  ensureKnownItems(missingStoragePolicies, KNOWN_STORAGE_POLICY_SQL, "storage policies");

  const rlsStatements = buildRlsStatements(rlsMismatches);
  const publicPolicyStatements = missingPublicPolicies.map((key) => KNOWN_PUBLIC_POLICY_SQL[key]);
  const storagePolicyStatements = missingStoragePolicies.map((key) => KNOWN_STORAGE_POLICY_SQL[key]);

  console.log("Staging RLS/policy repair");
  console.log(`- staging target: ${JSON.stringify(maskConnectionString(stagingDbUrl))}`);
  console.log(`- report: ${reportPath}`);
  console.log(`- rls mismatches: ${rlsMismatches.length}`);
  console.log(`- missing public policies: ${missingPublicPolicies.length}`);
  console.log(`- missing storage policies: ${missingStoragePolicies.length}`);

  if (dryRun) {
    await executeStatements(null, "RLS status alignment", rlsStatements, true);
    await executeStatements(null, "Public RLS policies", publicPolicyStatements, true);
    await executeStatements(null, "Storage policies", storagePolicyStatements, true);
    return;
  }

  const client = new Client({
    connectionString: stagingDbUrl,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  try {
    await client.query("begin");
    await executeStatements(client, "RLS status alignment", rlsStatements, false);
    await executeStatements(client, "Public RLS policies", publicPolicyStatements, false);
    await executeStatements(client, "Storage policies", storagePolicyStatements, false);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
