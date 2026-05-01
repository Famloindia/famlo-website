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

function getArgValue(flag, fallback = null) {
  const argv = process.argv.slice(2);
  const index = argv.indexOf(flag);
  if (index === -1) return fallback;
  return argv[index + 1] ?? fallback;
}

function printHelp() {
  console.log(`
Usage: node scripts/repair-room-rating-target.mjs --room <current-room-id> [--booking <booking-id>] [--review <review-id>] [--old-room <stale-room-id>] [--dry-run]
   or: node scripts/repair-room-rating-target.mjs --inspect-booking <booking-id>
   or: node scripts/repair-room-rating-target.mjs --inspect-review <review-id>

Options:
  --booking    Booking id to repair
  --review     Exact review row id to repair
  --room       Current active room id the review should point to
  --old-room   Optional stale/deleted room id to restrict repair
  --inspect-booking  Print matching review rows for a booking id
  --inspect-review   Print the exact review row for a review id
  --dry-run    Print what would change without updating
  --help       Show this help
`);
}

const args = new Set(process.argv.slice(2));
if (args.has("--help")) {
  printHelp();
  process.exit(0);
}

const bookingId = (getArgValue("--booking", "") ?? "").trim();
const reviewId = (getArgValue("--review", "") ?? "").trim();
const inspectBookingId = (getArgValue("--inspect-booking", "") ?? "").trim();
const inspectReviewId = (getArgValue("--inspect-review", "") ?? "").trim();
const currentRoomId = (getArgValue("--room", "") ?? "").trim();
const staleRoomId = (getArgValue("--old-room", "") ?? "").trim();
const dryRun = args.has("--dry-run");

const inspectMode = Boolean(inspectBookingId || inspectReviewId);

if ((!bookingId && !reviewId) || !currentRoomId) {
  if (!inspectMode) {
    printHelp();
    process.exit(1);
  }
}

if (inspectMode && (currentRoomId || bookingId || reviewId || staleRoomId || dryRun)) {
  printHelp();
  process.exit(1);
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

const query = supabase
  .from("reviews_v2")
  .select("id,booking_id,target_profile_id,target_type,rating,created_at")
  .eq("target_type", "stay_unit")
  .order("created_at", { ascending: false });

const { data, error } = inspectReviewId
  ? await query.eq("id", inspectReviewId)
  : inspectBookingId
    ? await query.eq("booking_id", inspectBookingId)
    : reviewId
      ? await query.eq("id", reviewId)
      : await query.eq("booking_id", bookingId);

if (error) {
  console.error("Could not load room reviews:", error.message);
  process.exit(1);
}

const rows = (data ?? []).filter((row) => !staleRoomId || row.target_profile_id === staleRoomId);
if (rows.length === 0) {
  console.log("No matching stay-unit review rows found for that booking.");
  process.exit(0);
}

console.log("Matching review rows:");
for (const row of rows) {
  console.log(`- ${row.id}: booking=${row.booking_id} target=${row.target_profile_id} rating=${row.rating}`);
}

if (inspectMode) {
  process.exit(0);
}

if (dryRun) {
  console.log(`[dry-run] Would update ${rows[0].id} -> target_profile_id=${currentRoomId}`);
  process.exit(0);
}

const { error: updateError } = await supabase
  .from("reviews_v2")
  .update({ target_profile_id: currentRoomId })
  .eq("id", rows[0].id);

if (updateError) {
  console.error("Repair failed:", updateError.message);
  process.exit(1);
}

console.log(`Updated review ${rows[0].id} to current room ${currentRoomId}.`);
