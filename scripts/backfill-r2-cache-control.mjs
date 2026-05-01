import fs from "node:fs";
import path from "node:path";
import { CopyObjectCommand, HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { createClient } from "@supabase/supabase-js";

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

loadEnvFile(path.resolve(".env.local"));

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");

function getArgValue(flag, fallback = null) {
  const argv = process.argv.slice(2);
  const index = argv.indexOf(flag);
  if (index === -1) return fallback;
  return argv[index + 1] ?? fallback;
}

function printHelp() {
  console.log(`
Usage: npm run images:cache-backfill -- [--dry-run] [--table <name>] [--limit <count>]

Options:
  --dry-run       Show what would change without writing to R2
  --table         Limit processing to one table group:
                  family_photos | host_media | families | hosts | stay_units_v2
  --limit         Maximum number of object URLs to update per table group
  --help          Show this help
`);
}

if (args.has("--help")) {
  printHelp();
  process.exit(0);
}

const CACHE_CONTROL_VALUE = "public, max-age=31536000, immutable";
const tableFilter = getArgValue("--table");
const rowLimit = Number.parseInt(getArgValue("--limit", "0"), 10);
const effectiveLimit = Number.isFinite(rowLimit) && rowLimit > 0 ? rowLimit : Number.POSITIVE_INFINITY;

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let cachedClient = null;
function getR2Client() {
  if (cachedClient) return cachedClient;
  cachedClient = new S3Client({
    region: "auto",
    endpoint: `https://${requireEnv("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: requireEnv("R2_ACCESS_KEY_ID"),
      secretAccessKey: requireEnv("R2_SECRET_ACCESS_KEY"),
    },
  });
  return cachedClient;
}

function getPublicBase() {
  return requireEnv("R2_PUBLIC_URL").replace(/\/$/, "");
}

function toR2Key(url) {
  if (typeof url !== "string" || url.trim().length === 0) return null;
  const publicBase = getPublicBase();
  if (!url.startsWith(`${publicBase}/`)) return null;
  return url.slice(publicBase.length + 1);
}

async function fetchAll(table, select) {
  const pageSize = 1000;
  let from = 0;
  const rows = [];
  while (true) {
    const to = from + pageSize - 1;
    const { data, error } = await supabase.from(table).select(select).range(from, to);
    if (error) throw error;
    const chunk = data ?? [];
    rows.push(...chunk);
    if (chunk.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

async function rewriteObjectCacheControl(key) {
  const bucket = requireEnv("R2_BUCKET_NAME");
  const client = getR2Client();
  const head = await client.send(
    new HeadObjectCommand({
      Bucket: bucket,
      Key: key,
    })
  );

  if ((head.CacheControl ?? "").trim() === CACHE_CONTROL_VALUE) {
    return "unchanged";
  }

  if (dryRun) return "pending";

  await client.send(
    new CopyObjectCommand({
      Bucket: bucket,
      Key: key,
      CopySource: `${bucket}/${encodeURIComponent(key).replace(/%2F/g, "/")}`,
      MetadataDirective: "REPLACE",
      CacheControl: CACHE_CONTROL_VALUE,
      ContentType: head.ContentType ?? "application/octet-stream",
      Metadata: head.Metadata ?? {},
    })
  );

  return "updated";
}

async function processEntries(groupName, entries) {
  let updated = 0;
  let skipped = 0;
  let failed = 0;
  const seenKeys = new Set();

  for (const entry of entries) {
    if (updated >= effectiveLimit) break;
    const key = toR2Key(entry.url);
    if (!key || seenKeys.has(key)) {
      skipped += 1;
      continue;
    }
    seenKeys.add(key);

    try {
      const status = await rewriteObjectCacheControl(key);
      if (status === "updated") updated += 1;
      else skipped += 1;
      console.log(`${dryRun ? "[dry-run] " : ""}${groupName} ${entry.id} -> ${key} (${status})`);
    } catch (error) {
      failed += 1;
      console.error(`${groupName} ${entry.id} failed:`, error instanceof Error ? error.message : error);
    }
  }

  console.log(`${groupName}: updated=${updated} skipped=${skipped} failed=${failed}`);
}

const processors = {
  family_photos: async () => {
    const rows = await fetchAll("family_photos", "id,url");
    return rows.map((row) => ({ id: row.id, url: row.url }));
  },
  host_media: async () => {
    const rows = await fetchAll("host_media", "id,media_url");
    return rows.map((row) => ({ id: row.id, url: row.media_url }));
  },
  families: async () => {
    const rows = await fetchAll("families", "id,host_photo_url");
    return rows.map((row) => ({ id: row.id, url: row.host_photo_url }));
  },
  hosts: async () => {
    return [];
  },
  stay_units_v2: async () => {
    const rows = await fetchAll("stay_units_v2", "id,photos");
    return rows.flatMap((row) =>
      (Array.isArray(row.photos) ? row.photos : []).map((url, index) => ({
        id: `${row.id}[${index}]`,
        url,
      }))
    );
  },
};

const groups = tableFilter ? [tableFilter] : Object.keys(processors);

for (const group of groups) {
  const processor = processors[group];
  if (!processor) {
    console.error(`Unknown table group: ${group}`);
    process.exitCode = 1;
    continue;
  }

  try {
    const entries = await processor();
    await processEntries(group, entries);
  } catch (error) {
    console.warn(`Skipping ${group}:`, error instanceof Error ? error.message : error);
  }
}
