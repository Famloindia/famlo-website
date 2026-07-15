import { createClient } from "@supabase/supabase-js";

const META_PREFIX = "FAMLO_META::";

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function asString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function asPositiveNumber(value) {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }
  return null;
}

function parseMeta(value) {
  if (!value || typeof value !== "string" || !value.startsWith(META_PREFIX)) {
    return {};
  }

  try {
    const parsed = JSON.parse(value.slice(META_PREFIX.length));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function deriveLegacyReel({ family, draftPayload }) {
  const meta = parseMeta(family.admin_notes);
  const payload = draftPayload && typeof draftPayload === "object" && !Array.isArray(draftPayload) ? draftPayload : {};

  const storageKey =
    asString(payload.hostReelStorageKey) ||
    asString(meta.hostReelStorageKey) ||
    asString(family.host_reel_storage_key);
  const publicUrl =
    asString(payload.hostReelPublicUrl) ||
    asString(meta.hostReelPublicUrl) ||
    asString(family.host_reel_public_url);
  const mimeType =
    asString(payload.hostReelMimeType) ||
    asString(meta.hostReelMimeType) ||
    asString(family.host_reel_mime_type) ||
    "video/mp4";
  const sizeBytes =
    asPositiveNumber(payload.hostReelSizeBytes) ??
    asPositiveNumber(meta.hostReelSizeBytes) ??
    asPositiveNumber(family.host_reel_size_bytes);
  const uploadedAt =
    asString(payload.hostReelUploadedAt) ||
    asString(meta.hostReelUploadedAt) ||
    asString(family.host_reel_uploaded_at) ||
    asString(family.updated_at) ||
    new Date().toISOString();

  if (!publicUrl) {
    return null;
  }

  return {
    storageKey: storageKey || publicUrl,
    publicUrl,
    mimeType,
    sizeBytes,
    uploadedAt,
  };
}

async function main() {
  const supabase = createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  const [{ data: families, error: familiesError }, { data: hosts, error: hostsError }, { data: drafts, error: draftsError }, { data: reels, error: reelsError }] =
    await Promise.all([
      supabase
        .from("families")
        .select("id,user_id,admin_notes,updated_at,host_reel_public_url,host_reel_storage_key,host_reel_mime_type,host_reel_size_bytes,host_reel_uploaded_at"),
      supabase.from("hosts").select("id,user_id,legacy_family_id"),
      supabase
        .from("host_onboarding_drafts")
        .select("family_id,payload,updated_at")
        .order("updated_at", { ascending: false }),
      supabase
        .from("host_property_reels")
        .select("id,family_id,storage_key,public_url,status")
        .neq("status", "deleted"),
    ]);

  if (familiesError) throw familiesError;
  if (hostsError) throw hostsError;
  if (draftsError) throw draftsError;
  if (reelsError) throw reelsError;

  const hostByFamilyId = new Map(
    (hosts ?? [])
      .map((row) => [asString(row.legacy_family_id), row])
      .filter(([familyId]) => familyId.length > 0)
  );

  const latestDraftByFamilyId = new Map();
  for (const row of drafts ?? []) {
    const familyId = asString(row.family_id);
    if (!familyId || latestDraftByFamilyId.has(familyId)) continue;
    latestDraftByFamilyId.set(familyId, row);
  }

  const activeReelFamilyIds = new Set((reels ?? []).map((row) => asString(row.family_id)).filter(Boolean));
  let inserted = 0;
  let skipped = 0;

  for (const family of families ?? []) {
    const familyId = asString(family.id);
    if (!familyId) continue;

    if (activeReelFamilyIds.has(familyId)) {
      skipped += 1;
      continue;
    }

    const draftRow = latestDraftByFamilyId.get(familyId);
    const legacyReel = deriveLegacyReel({
      family,
      draftPayload: draftRow?.payload ?? null,
    });

    if (!legacyReel) {
      skipped += 1;
      continue;
    }

    const host = hostByFamilyId.get(familyId);
    const { error } = await supabase.from("host_property_reels").insert({
      family_id: familyId,
      host_id: asString(host?.id) || null,
      user_id: asString(host?.user_id) || asString(family.user_id) || null,
      storage_key: legacyReel.storageKey,
      public_url: legacyReel.publicUrl,
      mime_type: legacyReel.mimeType,
      size_bytes: legacyReel.sizeBytes,
      is_featured: true,
      status: "active",
      created_at: legacyReel.uploadedAt,
      updated_at: legacyReel.uploadedAt,
    });

    if (error) {
      throw error;
    }

    inserted += 1;
  }

  console.info(
    JSON.stringify(
      {
        ok: true,
        inserted,
        skipped,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error("[backfill-host-property-reels:error]", error);
  process.exitCode = 1;
});
