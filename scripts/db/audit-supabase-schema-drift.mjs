#!/usr/bin/env node

import { Client } from "pg";

function parseArgs(argv) {
  return {
    json: argv.includes("--json"),
    failOnDrift: argv.includes("--fail-on-drift"),
    requireEnv: argv.includes("--require-env"),
  };
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}

function sortByName(rows, keys) {
  return [...rows].sort((left, right) => {
    for (const key of keys) {
      const a = String(left[key] ?? "");
      const b = String(right[key] ?? "");
      const result = a.localeCompare(b);
      if (result !== 0) return result;
    }
    return 0;
  });
}

function rowsToMap(rows, keyBuilder) {
  return new Map(rows.map((row) => [keyBuilder(row), row]));
}

function diffNamedCollections(leftRows, rightRows, keyBuilder, normalizeValue) {
  const leftMap = rowsToMap(leftRows, keyBuilder);
  const rightMap = rowsToMap(rightRows, keyBuilder);

  const missingInProduction = [];
  const missingInStaging = [];
  const mismatches = [];

  for (const [key, leftValue] of leftMap.entries()) {
    if (!rightMap.has(key)) {
      missingInProduction.push(key);
      continue;
    }

    const rightValue = rightMap.get(key);
    if (stableStringify(normalizeValue(leftValue)) !== stableStringify(normalizeValue(rightValue))) {
      mismatches.push({
        key,
        staging: normalizeValue(leftValue),
        production: normalizeValue(rightValue),
      });
    }
  }

  for (const key of rightMap.keys()) {
    if (!leftMap.has(key)) {
      missingInStaging.push(key);
    }
  }

  return {
    missingInProduction: missingInProduction.sort(),
    missingInStaging: missingInStaging.sort(),
    mismatches,
  };
}

async function fetchRows(client, sql) {
  const { rows } = await client.query(sql);
  return rows;
}

async function collectSnapshot(client) {
  const [
    tables,
    columns,
    primaryKeys,
    foreignKeys,
    indexes,
    rls,
    policies,
    functions,
    triggers,
    views,
    enums,
    storagePolicies,
  ] = await Promise.all([
    fetchRows(
      client,
      `
        select table_name
        from information_schema.tables
        where table_schema = 'public'
          and table_type = 'BASE TABLE'
        order by table_name
      `
    ),
    fetchRows(
      client,
      `
        select
          table_name,
          column_name,
          data_type,
          udt_name,
          is_nullable,
          column_default
        from information_schema.columns
        where table_schema = 'public'
        order by table_name, ordinal_position
      `
    ),
    fetchRows(
      client,
      `
        select
          tc.table_name,
          tc.constraint_name,
          string_agg(kcu.column_name, ',' order by kcu.ordinal_position) as columns
        from information_schema.table_constraints tc
        join information_schema.key_column_usage kcu
          on tc.constraint_name = kcu.constraint_name
         and tc.table_schema = kcu.table_schema
         and tc.table_name = kcu.table_name
        where tc.table_schema = 'public'
          and tc.constraint_type = 'PRIMARY KEY'
        group by tc.table_name, tc.constraint_name
        order by tc.table_name, tc.constraint_name
      `
    ),
    fetchRows(
      client,
      `
        select
          tc.table_name,
          tc.constraint_name,
          kcu.column_name,
          ccu.table_schema as foreign_table_schema,
          ccu.table_name as foreign_table_name,
          ccu.column_name as foreign_column_name,
          rc.update_rule,
          rc.delete_rule
        from information_schema.table_constraints tc
        join information_schema.key_column_usage kcu
          on tc.constraint_name = kcu.constraint_name
         and tc.table_schema = kcu.table_schema
        join information_schema.constraint_column_usage ccu
          on tc.constraint_name = ccu.constraint_name
         and tc.table_schema = ccu.table_schema
        join information_schema.referential_constraints rc
          on tc.constraint_name = rc.constraint_name
         and tc.table_schema = rc.constraint_schema
        where tc.table_schema = 'public'
          and tc.constraint_type = 'FOREIGN KEY'
        order by tc.table_name, tc.constraint_name, kcu.ordinal_position
      `
    ),
    fetchRows(
      client,
      `
        select
          schemaname,
          tablename,
          indexname,
          indexdef
        from pg_indexes
        where schemaname = 'public'
        order by tablename, indexname
      `
    ),
    fetchRows(
      client,
      `
        select
          n.nspname as schema_name,
          c.relname as table_name,
          c.relrowsecurity as rls_enabled,
          c.relforcerowsecurity as rls_forced
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relkind = 'r'
        order by c.relname
      `
    ),
    fetchRows(
      client,
      `
        select
          schemaname,
          tablename,
          policyname,
          permissive,
          roles,
          cmd,
          qual,
          with_check
        from pg_policies
        where schemaname = 'public'
        order by tablename, policyname
      `
    ),
    fetchRows(
      client,
      `
        select
          n.nspname as schema_name,
          p.proname as function_name,
          pg_get_function_identity_arguments(p.oid) as identity_arguments,
          pg_get_function_result(p.oid) as result_type,
          l.lanname as language_name,
          p.prosecdef as security_definer,
          pg_get_functiondef(p.oid) as definition
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        join pg_language l on l.oid = p.prolang
        where n.nspname = 'public'
        order by p.proname, identity_arguments
      `
    ),
    fetchRows(
      client,
      `
        select
          event_object_table as table_name,
          trigger_name,
          action_timing,
          event_manipulation,
          action_orientation,
          action_statement
        from information_schema.triggers
        where trigger_schema = 'public'
        order by event_object_table, trigger_name, event_manipulation
      `
    ),
    fetchRows(
      client,
      `
        select
          table_name,
          view_definition
        from information_schema.views
        where table_schema = 'public'
        order by table_name
      `
    ),
    fetchRows(
      client,
      `
        select
          n.nspname as schema_name,
          t.typname as enum_name,
          e.enumsortorder,
          e.enumlabel
        from pg_type t
        join pg_enum e on t.oid = e.enumtypid
        join pg_namespace n on n.oid = t.typnamespace
        where n.nspname = 'public'
        order by t.typname, e.enumsortorder
      `
    ),
    fetchRows(
      client,
      `
        select
          schemaname,
          tablename,
          policyname,
          permissive,
          roles,
          cmd,
          qual,
          with_check
        from pg_policies
        where schemaname = 'storage'
        order by tablename, policyname
      `
    ),
  ]);

  return {
    tables: sortByName(tables, ["table_name"]),
    columns: sortByName(columns, ["table_name", "column_name"]),
    primaryKeys: sortByName(primaryKeys, ["table_name", "constraint_name"]),
    foreignKeys: sortByName(foreignKeys, ["table_name", "constraint_name", "column_name"]),
    indexes: sortByName(indexes, ["tablename", "indexname"]),
    rls: sortByName(rls, ["table_name"]),
    policies: sortByName(policies, ["tablename", "policyname"]),
    functions: sortByName(functions, ["function_name", "identity_arguments"]),
    triggers: sortByName(triggers, ["table_name", "trigger_name", "event_manipulation"]),
    views: sortByName(views, ["table_name"]),
    enums: sortByName(enums, ["enum_name", "enumsortorder"]),
    storagePolicies: sortByName(storagePolicies, ["tablename", "policyname"]),
  };
}

function summarizeDrift(staging, production) {
  const tables = diffNamedCollections(
    staging.tables,
    production.tables,
    (row) => row.table_name,
    (row) => row
  );
  const columns = diffNamedCollections(
    staging.columns,
    production.columns,
    (row) => `${row.table_name}.${row.column_name}`,
    (row) => ({
      data_type: row.data_type,
      udt_name: row.udt_name,
      is_nullable: row.is_nullable,
      column_default: row.column_default,
    })
  );
  const primaryKeys = diffNamedCollections(
    staging.primaryKeys,
    production.primaryKeys,
    (row) => `${row.table_name}.${row.constraint_name}`,
    (row) => ({ columns: row.columns })
  );
  const foreignKeys = diffNamedCollections(
    staging.foreignKeys,
    production.foreignKeys,
    (row) => `${row.table_name}.${row.constraint_name}.${row.column_name}`,
    (row) => ({
      foreign_table_schema: row.foreign_table_schema,
      foreign_table_name: row.foreign_table_name,
      foreign_column_name: row.foreign_column_name,
      update_rule: row.update_rule,
      delete_rule: row.delete_rule,
    })
  );
  const indexes = diffNamedCollections(
    staging.indexes,
    production.indexes,
    (row) => `${row.tablename}.${row.indexname}`,
    (row) => ({ indexdef: row.indexdef })
  );
  const rls = diffNamedCollections(
    staging.rls,
    production.rls,
    (row) => row.table_name,
    (row) => ({
      rls_enabled: row.rls_enabled,
      rls_forced: row.rls_forced,
    })
  );
  const policies = diffNamedCollections(
    staging.policies,
    production.policies,
    (row) => `${row.tablename}.${row.policyname}`,
    (row) => ({
      permissive: row.permissive,
      roles: row.roles,
      cmd: row.cmd,
      qual: row.qual,
      with_check: row.with_check,
    })
  );
  const functions = diffNamedCollections(
    staging.functions,
    production.functions,
    (row) => `${row.function_name}(${row.identity_arguments})`,
    (row) => ({
      result_type: row.result_type,
      language_name: row.language_name,
      security_definer: row.security_definer,
      definition: row.definition,
    })
  );
  const triggers = diffNamedCollections(
    staging.triggers,
    production.triggers,
    (row) => `${row.table_name}.${row.trigger_name}.${row.event_manipulation}`,
    (row) => ({
      action_timing: row.action_timing,
      action_orientation: row.action_orientation,
      action_statement: row.action_statement,
    })
  );
  const views = diffNamedCollections(
    staging.views,
    production.views,
    (row) => row.table_name,
    (row) => ({ view_definition: row.view_definition })
  );
  const enums = diffNamedCollections(
    staging.enums,
    production.enums,
    (row) => `${row.enum_name}.${row.enumsortorder}`,
    (row) => ({ enumlabel: row.enumlabel })
  );
  const storagePolicies = diffNamedCollections(
    staging.storagePolicies,
    production.storagePolicies,
    (row) => `${row.tablename}.${row.policyname}`,
    (row) => ({
      permissive: row.permissive,
      roles: row.roles,
      cmd: row.cmd,
      qual: row.qual,
      with_check: row.with_check,
    })
  );

  const sections = {
    tables,
    columns,
    primaryKeys,
    foreignKeys,
    indexes,
    rls,
    policies,
    functions,
    triggers,
    views,
    enums,
    storagePolicies,
  };

  const hasDrift = Object.values(sections).some(
    (section) =>
      section.missingInProduction.length > 0 ||
      section.missingInStaging.length > 0 ||
      section.mismatches.length > 0
  );

  return { hasDrift, sections };
}

function printSection(label, section) {
  const hasAnything =
    section.missingInProduction.length > 0 ||
    section.missingInStaging.length > 0 ||
    section.mismatches.length > 0;

  if (!hasAnything) {
    console.log(`- ${label}: OK`);
    return;
  }

  console.log(`- ${label}: DRIFT`);
  if (section.missingInProduction.length > 0) {
    console.log(`  missing in production (${section.missingInProduction.length})`);
    for (const item of section.missingInProduction) {
      console.log(`    - ${item}`);
    }
  }
  if (section.missingInStaging.length > 0) {
    console.log(`  missing in staging (${section.missingInStaging.length})`);
    for (const item of section.missingInStaging) {
      console.log(`    - ${item}`);
    }
  }
  if (section.mismatches.length > 0) {
    console.log(`  mismatches (${section.mismatches.length})`);
    for (const mismatch of section.mismatches) {
      console.log(`    - ${mismatch.key}`);
      console.log(`      staging: ${stableStringify(mismatch.staging)}`);
      console.log(`      production: ${stableStringify(mismatch.production)}`);
    }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const stagingUrl = process.env.STAGING_DB_URL;
  const productionUrl = process.env.PRODUCTION_DB_URL;

  if (!stagingUrl || !productionUrl) {
    const missing = [
      !stagingUrl ? "STAGING_DB_URL" : null,
      !productionUrl ? "PRODUCTION_DB_URL" : null,
    ].filter(Boolean);
    const payload = {
      ok: false,
      skipped: !args.requireEnv,
      reason: "missing_env",
      missingEnv: missing,
    };

    if (args.json) {
      console.log(JSON.stringify(payload, null, 2));
    } else {
      console.log("Supabase schema drift audit");
      console.log(`- status: ${args.requireEnv ? "FAIL" : "SKIPPED"}`);
      console.log(`- missing env: ${missing.join(", ")}`);
      console.log("- required env vars:");
      console.log("  - STAGING_DB_URL");
      console.log("  - PRODUCTION_DB_URL");
    }

    process.exit(args.requireEnv ? 1 : 0);
  }

  const stagingClient = new Client({ connectionString: stagingUrl });
  const productionClient = new Client({ connectionString: productionUrl });

  try {
    await stagingClient.connect();
    await productionClient.connect();

    const [stagingSnapshot, productionSnapshot] = await Promise.all([
      collectSnapshot(stagingClient),
      collectSnapshot(productionClient),
    ]);

    const drift = summarizeDrift(stagingSnapshot, productionSnapshot);
    const payload = {
      ok: !drift.hasDrift,
      skipped: false,
      checkedAt: new Date().toISOString(),
      sections: drift.sections,
    };

    if (args.json) {
      console.log(JSON.stringify(payload, null, 2));
    } else {
      console.log("Supabase schema drift audit");
      console.log("- compared using direct Postgres connections");
      console.log("- scope: public schema, public RLS, public functions, public triggers, public views, public enums, storage policies");
      printSection("tables", drift.sections.tables);
      printSection("columns", drift.sections.columns);
      printSection("primary keys", drift.sections.primaryKeys);
      printSection("foreign keys", drift.sections.foreignKeys);
      printSection("indexes", drift.sections.indexes);
      printSection("RLS status", drift.sections.rls);
      printSection("RLS policies", drift.sections.policies);
      printSection("functions", drift.sections.functions);
      printSection("triggers", drift.sections.triggers);
      printSection("views", drift.sections.views);
      printSection("enums", drift.sections.enums);
      printSection("storage policies", drift.sections.storagePolicies);
      console.log(`Final result: ${drift.hasDrift ? "FAIL" : "PASS"}`);
    }

    if (drift.hasDrift && args.failOnDrift) {
      process.exit(1);
    }
  } finally {
    await Promise.allSettled([stagingClient.end(), productionClient.end()]);
  }
}

main().catch((error) => {
  console.error("Schema drift audit failed.");
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
