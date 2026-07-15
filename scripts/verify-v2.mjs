import fs from "node:fs";
import path from "node:path";
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

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const requiredTables = [
  "user_profiles_v2",
  "hosts",
  "host_media",
  "hommie_profiles_v2",
  "hommie_media_v2",
  "gallery_posts_v2",
  "activities_v2",
  "host_applications_v2",
  "hommie_applications_v2",
  "bookings_v2",
  "booking_status_history_v2",
  "payments_v2",
  "coupons_v2",
  "coupon_redemptions_v2",
  "payouts_v2",
  "reviews_v2",
  "recent_views_v2",
  "stories_v2",
  "ads_v2",
];

async function tableExists(table) {
  const { error } = await supabase.from(table).select("*").limit(1);
  return !error;
}

const results = [];
for (const table of requiredTables) {
  const exists = await tableExists(table);
  results.push({ table, exists });
}

const missing = results.filter((item) => !item.exists);
for (const item of results) {
  console.log(`${item.exists ? "OK " : "MISS"} ${item.table}`);
}

if (missing.length > 0) {
  console.error("\nV2 verification failed. Apply the SQL migration and reload the PostgREST schema cache.");
  process.exit(1);
}

console.log("\nV2 verification passed.");
