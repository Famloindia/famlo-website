#!/usr/bin/env node

import { spawnSync } from "node:child_process";

const stagingUrl = process.env.STAGING_DB_URL;
const productionUrl = process.env.PRODUCTION_DB_URL;

if (!stagingUrl || !productionUrl) {
  console.log("Schema drift guard skipped: STAGING_DB_URL and PRODUCTION_DB_URL are not both set.");
  process.exit(0);
}

const result = spawnSync(
  process.execPath,
  ["scripts/db/audit-supabase-schema-drift.mjs", "--fail-on-drift"],
  {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  }
);

process.exit(result.status ?? 1);
