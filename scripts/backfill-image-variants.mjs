import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import sharp from "sharp";

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
Usage: npm run images:backfill -- [--dry-run] [--table <name>] [--limit <count>]

Options:
  --dry-run       Show what would change without uploading or updating rows
  --table         Limit processing to one table group:
                  family_photos | host_media | families | hosts | stay_units_v2
  --limit         Maximum number of rows to update per table group
  --help          Show this help
`);
}

if (args.has("--help")) {
  printHelp();
  process.exit(0);
}

const tableFilter = getArgValue("--table");
const rowLimit = Number.parseInt(getArgValue("--limit", "0"), 10);
const effectiveLimit = Number.isFinite(rowLimit) && rowLimit > 0 ? rowLimit : Number.POSITIVE_INFINITY;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

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

async function uploadBufferToR2(buffer, key, contentType) {
  await getR2Client().send(
    new PutObjectCommand({
      Bucket: requireEnv("R2_BUCKET_NAME"),
      Key: key,
      Body: buffer,
      ContentType: contentType,
    })
  );
}

function isOptimizedVariant(url) {
  return typeof url === "string" && /-(full|preview)\.webp(?:$|\?)/i.test(url);
}

function isProcessableUrl(url) {
  return typeof url === "string" && /^https?:\/\//i.test(url) && !isOptimizedVariant(url);
}

function stableHash(value) {
  return createHash("sha1").update(value).digest("hex").slice(0, 12);
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

async function downloadBinary(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Fetch failed with ${response.status} for ${url}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function createOptimizedVariants(buffer) {
  const pipeline = sharp(buffer, { failOn: "none" }).rotate();
  const metadata = await pipeline.metadata();
  const targetWidth =
    typeof metadata.width === "number" && metadata.width > 0 ? Math.min(metadata.width, 1600) : 1600;

  const [fullBuffer, previewBuffer] = await Promise.all([
    pipeline
      .clone()
      .resize({ width: targetWidth, withoutEnlargement: true })
      .webp({ quality: 78, effort: 4 })
      .toBuffer(),
    pipeline
      .clone()
      .resize({ width: 96, withoutEnlargement: true })
      .webp({ quality: 36, effort: 3 })
      .toBuffer(),
  ]);

  return { fullBuffer, previewBuffer };
}

async function convertUrlToOptimizedFullUrl(url, folderSeed) {
  if (!isProcessableUrl(url)) return url;

  const sourceBuffer = await downloadBinary(url);
  const { fullBuffer, previewBuffer } = await createOptimizedVariants(sourceBuffer);
  const publicBase = requireEnv("R2_PUBLIC_URL").replace(/\/$/, "");
  const hash = stableHash(`${folderSeed}:${url}`);
  const baseKey = `backfill/${folderSeed}/${hash}`;
  const fullKey = `${baseKey}-full.webp`;
  const previewKey = `${baseKey}-preview.webp`;

  if (!dryRun) {
    await Promise.all([
      uploadBufferToR2(fullBuffer, fullKey, "image/webp"),
      uploadBufferToR2(previewBuffer, previewKey, "image/webp"),
    ]);
  }

  return `${publicBase}/${fullKey}`;
}

async function processUrlField(rows, table, idField, urlField, folderLabel) {
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of rows) {
    if (updated >= effectiveLimit) break;
    const originalUrl = row?.[urlField];
    if (!isProcessableUrl(originalUrl)) {
      skipped += 1;
      continue;
    }

    try {
      const optimizedUrl = await convertUrlToOptimizedFullUrl(
        originalUrl,
        `${folderLabel}/${row[idField]}`
      );

      if (optimizedUrl === originalUrl) {
        skipped += 1;
        continue;
      }

      console.log(
        `${dryRun ? "[dry-run] " : ""}${table}.${urlField} ${row[idField]} -> ${optimizedUrl}`
      );

      if (!dryRun) {
        const { error } = await supabase.from(table).update({ [urlField]: optimizedUrl }).eq(idField, row[idField]);
        if (error) throw error;
      }

      updated += 1;
    } catch (error) {
      failed += 1;
      console.error(`${table}.${urlField} ${row[idField]} failed:`, error instanceof Error ? error.message : error);
    }
  }

  console.log(`${table}.${urlField}: updated=${updated} skipped=${skipped} failed=${failed}`);
}

async function processArrayField(rows, table, idField, arrayField, folderLabel) {
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of rows) {
    if (updated >= effectiveLimit) break;
    const current = Array.isArray(row?.[arrayField]) ? row[arrayField] : [];
    if (current.length === 0) {
      skipped += 1;
      continue;
    }

    const next = [...current];
    let changed = false;

    try {
      for (let index = 0; index < current.length; index += 1) {
        const value = current[index];
        if (!isProcessableUrl(value)) continue;
        next[index] = await convertUrlToOptimizedFullUrl(
          value,
          `${folderLabel}/${row[idField]}/${arrayField}/${index}`
        );
        changed = changed || next[index] !== value;
      }

      if (!changed) {
        skipped += 1;
        continue;
      }

      console.log(
        `${dryRun ? "[dry-run] " : ""}${table}.${arrayField} ${row[idField]} -> ${next.length} optimized entries`
      );

      if (!dryRun) {
        const { error } = await supabase.from(table).update({ [arrayField]: next }).eq(idField, row[idField]);
        if (error) throw error;
      }

      updated += 1;
    } catch (error) {
      failed += 1;
      console.error(`${table}.${arrayField} ${row[idField]} failed:`, error instanceof Error ? error.message : error);
    }
  }

  console.log(`${table}.${arrayField}: updated=${updated} skipped=${skipped} failed=${failed}`);
}

async function backfillFamilyPhotos() {
  const rows = await fetchAll("family_photos", "id,url");
  await processUrlField(rows, "family_photos", "id", "url", "family-photos");
}

async function backfillHostMedia() {
  const rows = await fetchAll("host_media", "id,host_id,media_url");
  await processUrlField(rows, "host_media", "id", "media_url", "host-media");
}

async function backfillFamilies() {
  const rows = await fetchAll("families", "id,host_photo_url");
  await processUrlField(rows, "families", "id", "host_photo_url", "families/host-photo");
}

async function backfillHosts() {
  const rows = await fetchAll("hosts", "id,host_photo_url");
  await processUrlField(rows, "hosts", "id", "host_photo_url", "hosts/host-photo");
}

async function backfillStayUnits() {
  const rows = await fetchAll("stay_units_v2", "id,photos,locality_photos");
  await processArrayField(rows, "stay_units_v2", "id", "photos", "stay-units");
  await processArrayField(rows, "stay_units_v2", "id", "locality_photos", "stay-units");
}

async function main() {
  const tasks = [
    ["family_photos", backfillFamilyPhotos],
    ["host_media", backfillHostMedia],
    ["families", backfillFamilies],
    ["hosts", backfillHosts],
    ["stay_units_v2", backfillStayUnits],
  ];

  for (const [name, task] of tasks) {
    if (tableFilter && tableFilter !== name) continue;
    console.log(`\n=== Backfilling ${name} ${dryRun ? "(dry run)" : ""} ===`);
    await task();
  }
}

main().catch((error) => {
  console.error("Image variant backfill failed:", error);
  process.exit(1);
});
