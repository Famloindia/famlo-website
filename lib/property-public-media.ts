import type { SupabaseClient } from "@supabase/supabase-js";

import { getHostReelAsset } from "@/lib/host-onboarding-legal";
import { parseHostListingMeta } from "@/lib/host-listing-meta";

type JsonRecord = Record<string, unknown>;

type SupabaseErrorLike = {
  code?: string;
  message?: string;
  details?: string | null;
  hint?: string | null;
};

type QueryResult = {
  data: JsonRecord[] | JsonRecord | null;
  error: SupabaseErrorLike | null;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function pickObject(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function isSchemaCompatibilityError(error: SupabaseErrorLike | null | undefined): boolean {
  const message = `${error?.message ?? ""} ${error?.details ?? ""} ${error?.hint ?? ""}`.toLowerCase();
  return (
    message.includes("column") ||
    message.includes("schema cache") ||
    message.includes("does not exist") ||
    message.includes("relation") ||
    message.includes("could not find")
  );
}

function isPermissionCompatibilityError(error: SupabaseErrorLike | null | undefined): boolean {
  const message = `${error?.message ?? ""} ${error?.details ?? ""} ${error?.hint ?? ""}`.toLowerCase();
  return error?.code === "42501" || message.includes("permission denied");
}

function logSupabaseQueryIssue(params: {
  context: string;
  familyId: string;
  hostId: string;
  table: string;
  error: SupabaseErrorLike;
  severity?: "error" | "warn";
}): void {
  const method = params.severity === "warn" ? console.warn : console.error;
  method("[property-public-media:error]", {
    context: params.context,
    familyId: params.familyId,
    hostId: params.hostId,
    table: params.table,
    code: params.error.code ?? null,
    message: params.error.message ?? "Unknown Supabase error",
    details: params.error.details ?? null,
    hint: params.error.hint ?? null,
  });
}

function collectPhotoFallbackUrls(params: {
  familyRow: JsonRecord | null;
  hostRow: JsonRecord | null;
  approvedDraft: JsonRecord | null;
  onboardingPayload: JsonRecord;
  meta: ReturnType<typeof parseHostListingMeta>;
  hostPhotoSeed: string;
}): string[] {
  const sourceValues = [
    params.familyRow?.images,
    params.familyRow?.photo_urls,
    params.familyRow?.photo_url,
    params.familyRow?.host_gallery_photos,
    params.familyRow?.host_photo_url,
    params.hostRow?.images,
    params.hostRow?.photo_urls,
    params.hostRow?.photo_url,
    params.hostRow?.host_gallery_photos,
    params.hostRow?.host_photo_url,
    params.approvedDraft?.images,
    params.approvedDraft?.photo_urls,
    params.approvedDraft?.photo_url,
    params.onboardingPayload.photos,
    params.onboardingPayload.photoUrls,
    params.onboardingPayload.images,
    params.onboardingPayload.hostGalleryPhotos,
    params.meta.photoUrls,
    params.meta.hostInstagramGallery,
    params.hostPhotoSeed,
  ];

  const urls: string[] = [];
  for (const value of sourceValues) {
    if (typeof value === "string") {
      const normalized = asString(value);
      if (normalized) urls.push(normalized);
      continue;
    }
    if (!Array.isArray(value)) continue;
    for (const item of value) {
      const normalized = asString(item);
      if (normalized) urls.push(normalized);
    }
  }

  return Array.from(new Set(urls));
}

async function queryFamilyPhotos(
  supabase: SupabaseClient,
  familyId: string
): Promise<QueryResult> {
  const preferred = await supabase
    .from("family_photos")
    .select("id,url,image_url,is_primary,created_at")
    .eq("family_id", familyId)
    .order("is_primary", { ascending: false })
    .order("created_at", { ascending: true });

  if (!preferred.error || !isSchemaCompatibilityError(preferred.error)) {
    return preferred as QueryResult;
  }

  return (await supabase
    .from("family_photos")
    .select("id,url,is_primary,created_at")
    .eq("family_id", familyId)
    .order("is_primary", { ascending: false })
    .order("created_at", { ascending: true })) as QueryResult;
}

async function queryHostMedia(
  supabase: SupabaseClient,
  hostId: string
): Promise<QueryResult> {
  const preferred = await supabase
    .from("host_media")
    .select("id,media_url,is_primary,sort_order,created_at")
    .eq("host_id", hostId)
    .order("is_primary", { ascending: false })
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (!preferred.error || !isSchemaCompatibilityError(preferred.error)) {
    return preferred as QueryResult;
  }

  return (await supabase
    .from("host_media")
    .select("id,media_url,is_primary,created_at")
    .eq("host_id", hostId)
    .order("is_primary", { ascending: false })
    .order("created_at", { ascending: true })) as QueryResult;
}

async function queryPropertyReels(
  supabase: SupabaseClient,
  familyId: string
): Promise<QueryResult> {
  const preferred = await supabase
    .from("host_property_reels")
    .select("id,public_url,storage_key,mime_type,size_bytes,duration_seconds,width,height,is_featured,status,created_at,updated_at")
    .eq("family_id", familyId)
    .neq("status", "deleted")
    .order("is_featured", { ascending: false })
    .order("created_at", { ascending: true });

  if (!preferred.error || !isSchemaCompatibilityError(preferred.error)) {
    return preferred as QueryResult;
  }

  const storageCompat = await supabase
    .from("host_property_reels")
    .select("id,public_url,storage_key,mime_type,size_bytes,duration_seconds,is_featured,status,created_at,updated_at")
    .eq("family_id", familyId)
    .neq("status", "deleted")
    .order("is_featured", { ascending: false })
    .order("created_at", { ascending: true });

  if (!storageCompat.error || !isSchemaCompatibilityError(storageCompat.error)) {
    return storageCompat as QueryResult;
  }

  return (await supabase
    .from("host_property_reels")
    .select("id,public_url,mime_type,size_bytes,duration_seconds,is_featured,status,created_at,updated_at")
    .eq("family_id", familyId)
    .neq("status", "deleted")
    .order("is_featured", { ascending: false })
    .order("created_at", { ascending: true })) as QueryResult;
}

async function queryFamilyProfile(
  supabase: SupabaseClient,
  familyId: string
): Promise<QueryResult> {
  const preferred = await supabase
    .from("families")
    .select("id,admin_notes,host_photo_url,latest_onboarding_payload,updated_at")
    .eq("id", familyId)
    .maybeSingle();

  if (!preferred.error || !isSchemaCompatibilityError(preferred.error)) {
    return preferred as QueryResult;
  }

  return (await supabase
    .from("families")
    .select("id,admin_notes,host_photo_url,updated_at")
    .eq("id", familyId)
    .maybeSingle()) as QueryResult;
}

async function queryHostProfile(
  supabase: SupabaseClient,
  hostId: string
): Promise<QueryResult> {
  const preferred = await supabase
    .from("hosts")
    .select("id,host_photo_url")
    .eq("id", hostId)
    .maybeSingle();

  if (!preferred.error || !isSchemaCompatibilityError(preferred.error)) {
    return preferred as QueryResult;
  }

  return (await supabase
    .from("hosts")
    .select("id")
    .eq("id", hostId)
    .maybeSingle()) as QueryResult;
}

export type PublicPropertyGalleryImage = {
  id: string;
  url: string;
  isPrimary: boolean;
  createdAt: string;
  source: "family_photos" | "host_media";
};

export type PublicPropertyReel = {
  id: string;
  publicUrl: string;
  storageKey: string;
  mimeType: string;
  sizeBytes: number | null;
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
  isFeatured: boolean;
  createdAt: string;
  updatedAt: string;
  source: "host_property_reels" | "family_legacy_reel";
};

export type ResolvedPublicPropertyMedia = {
  gallery: PublicPropertyGalleryImage[];
  reels: PublicPropertyReel[];
  debug: {
    familyId: string;
    hostId: string;
    gallerySource: "family_photos" | "host_media" | "none";
    reelSource: "host_property_reels" | "family_legacy_reel" | "none";
    galleryCount: number;
    reelCount: number;
  };
};

export async function resolvePublicPropertyMedia(
  supabase: SupabaseClient,
  params: {
    familyId: string;
    hostId?: string | null;
    familyRow?: JsonRecord | null;
    hostRow?: JsonRecord | null;
    approvedDraftRow?: JsonRecord | null;
    debugContext?: string;
  }
): Promise<ResolvedPublicPropertyMedia> {
  const familyId = asString(params.familyId);
  const hostId = asString(params.hostId);

  const [familyPhotosResult, hostMediaResult, propertyReelsResult, familyResult, hostResult, approvedDraftResult] =
    await Promise.all([
      familyId
        ? queryFamilyPhotos(supabase, familyId)
        : Promise.resolve({ data: [] as JsonRecord[], error: null }),
      hostId
        ? queryHostMedia(supabase, hostId)
        : Promise.resolve({ data: [] as JsonRecord[], error: null }),
      familyId
        ? queryPropertyReels(supabase, familyId)
        : Promise.resolve({ data: [] as JsonRecord[], error: null }),
      params.familyRow
        ? Promise.resolve({ data: params.familyRow, error: null })
        : familyId
          ? queryFamilyProfile(supabase, familyId)
          : Promise.resolve({ data: null, error: null }),
      params.hostRow
        ? Promise.resolve({ data: params.hostRow, error: null })
        : hostId
          ? queryHostProfile(supabase, hostId)
          : Promise.resolve({ data: null, error: null }),
      params.approvedDraftRow
        ? Promise.resolve({ data: params.approvedDraftRow, error: null })
        : familyId
          ? supabase
              .from("host_onboarding_drafts")
              .select("payload,updated_at")
              .eq("family_id", familyId)
              .eq("listing_status", "approved")
              .order("updated_at", { ascending: false })
              .limit(1)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
    ]);

  if (familyPhotosResult.error && !isPermissionCompatibilityError(familyPhotosResult.error)) {
    logSupabaseQueryIssue({
      context: params.debugContext ?? "unknown",
      familyId,
      hostId,
      table: "family_photos",
      error: familyPhotosResult.error,
    });
    throw familyPhotosResult.error;
  }
  if (hostMediaResult.error && !isPermissionCompatibilityError(hostMediaResult.error)) {
    logSupabaseQueryIssue({
      context: params.debugContext ?? "unknown",
      familyId,
      hostId,
      table: "host_media",
      error: hostMediaResult.error,
    });
    throw hostMediaResult.error;
  }
  if (propertyReelsResult.error && !isPermissionCompatibilityError(propertyReelsResult.error)) {
    logSupabaseQueryIssue({
      context: params.debugContext ?? "unknown",
      familyId,
      hostId,
      table: "host_property_reels",
      error: propertyReelsResult.error,
    });
    throw propertyReelsResult.error;
  }
  if (familyResult.error) {
    logSupabaseQueryIssue({
      context: params.debugContext ?? "unknown",
      familyId,
      hostId,
      table: "families",
      error: familyResult.error,
    });
    throw familyResult.error;
  }
  if (hostResult.error) {
    logSupabaseQueryIssue({
      context: params.debugContext ?? "unknown",
      familyId,
      hostId,
      table: "hosts",
      error: hostResult.error,
    });
    throw hostResult.error;
  }
  if (approvedDraftResult.error) {
    logSupabaseQueryIssue({
      context: params.debugContext ?? "unknown",
      familyId,
      hostId,
      table: "host_onboarding_drafts",
      error: approvedDraftResult.error,
    });
    throw approvedDraftResult.error;
  }

  const familyRow = (familyResult.data as JsonRecord | null) ?? null;
  const hostRow = (hostResult.data as JsonRecord | null) ?? null;
  const approvedDraft = (approvedDraftResult.data as JsonRecord | null) ?? null;
  const meta = parseHostListingMeta(asString(familyRow?.admin_notes) || null);
  const onboardingPayload = pickObject(
    approvedDraft?.payload ??
    (familyRow && typeof familyRow.latest_onboarding_payload === "object" && !Array.isArray(familyRow.latest_onboarding_payload)
      ? familyRow.latest_onboarding_payload
      : null)
  );
  const hostPhotoSeed =
    asString(familyRow?.host_photo_url) ||
    asString(hostRow?.host_photo_url) ||
    asString(meta.hostSelfieUrl) ||
    "";

  if (familyPhotosResult.error) {
    logSupabaseQueryIssue({
      context: params.debugContext ?? "unknown",
      familyId,
      hostId,
      table: "family_photos",
      error: familyPhotosResult.error,
      severity: isPermissionCompatibilityError(familyPhotosResult.error) ? "warn" : "error",
    });
  }

  if (hostMediaResult.error) {
    logSupabaseQueryIssue({
      context: params.debugContext ?? "unknown",
      familyId,
      hostId,
      table: "host_media",
      error: hostMediaResult.error,
      severity: isPermissionCompatibilityError(hostMediaResult.error) ? "warn" : "error",
    });
  }

  if (propertyReelsResult.error) {
    logSupabaseQueryIssue({
      context: params.debugContext ?? "unknown",
      familyId,
      hostId,
      table: "host_property_reels",
      error: propertyReelsResult.error,
      severity: isPermissionCompatibilityError(propertyReelsResult.error) ? "warn" : "error",
    });
  }

  const familyPhotos = ((familyPhotosResult.error ? [] : familyPhotosResult.data ?? []) as JsonRecord[])
    .map((row) => ({
      id: asString(row.id),
      url: asString(row.url) || asString(row.image_url) || asString(row.media_url),
      isPrimary: row.is_primary === true,
      createdAt: asString(row.created_at),
      source: "family_photos" as const,
    }))
    .filter((row) => row.url.length > 0);

  const hostMedia = ((hostMediaResult.error ? [] : hostMediaResult.data ?? []) as JsonRecord[])
    .map((row) => ({
      id: asString(row.id),
      url: asString(row.media_url),
      isPrimary: row.is_primary === true,
      createdAt: asString(row.created_at),
      source: "host_media" as const,
    }))
    .filter((row) => row.url.length > 0 && row.url !== hostPhotoSeed);

  const fallbackGallery = collectPhotoFallbackUrls({
    familyRow,
    hostRow,
    approvedDraft,
    onboardingPayload,
    meta,
    hostPhotoSeed,
  }).map((url, index) => ({
    id: `fallback-photo-${index + 1}`,
    url,
    isPrimary: index === 0,
    createdAt: "",
    source: "family_photos" as const,
  }));

  const gallery = familyPhotos.length > 0 ? familyPhotos : hostMedia.length > 0 ? hostMedia : fallbackGallery;
  const gallerySource = familyPhotos.length > 0 ? "family_photos" : hostMedia.length > 0 ? "host_media" : "none";

  const canonicalReels = ((propertyReelsResult.error ? [] : propertyReelsResult.data ?? []) as JsonRecord[])
    .map((row) => ({
      id: asString(row.id),
      publicUrl: asString(row.public_url),
      storageKey: asString(row.storage_key) || asString(row.r2_key),
      mimeType: asString(row.mime_type),
      sizeBytes: asNumber(row.size_bytes),
      durationSeconds: asNumber(row.duration_seconds),
      width: asNumber(row.width),
      height: asNumber(row.height),
      isFeatured: row.is_featured === true,
      createdAt: asString(row.created_at),
      updatedAt: asString(row.updated_at),
      source: "host_property_reels" as const,
    }))
    .filter((row) => row.publicUrl.length > 0);

  const legacyReelAsset = getHostReelAsset({
    meta,
    payload: onboardingPayload,
    row: familyRow,
  });
  const metaReels = Array.isArray(meta.hostReels) ? meta.hostReels : [];
  const legacyReelsFromMeta: PublicPropertyReel[] = metaReels
    .map<PublicPropertyReel | null>((reel, index) => {
      const publicUrl = asString(reel.publicUrl);
      if (!publicUrl) return null;
      const createdAt = asString(reel.createdAt) || asString(reel.updatedAt) || asString(familyRow?.updated_at);
      return {
        id: asString(reel.id) || `legacy-reel-${index + 1}`,
        publicUrl,
        storageKey: asString(reel.storageKey),
        mimeType: asString(reel.mimeType) || "video/mp4",
        sizeBytes: asNumber(reel.sizeBytes),
        durationSeconds: asNumber(reel.durationSeconds),
        width: asNumber(reel.width),
        height: asNumber(reel.height),
        isFeatured: reel.isFeatured === true,
        createdAt,
        updatedAt: asString(reel.updatedAt) || createdAt,
        source: "family_legacy_reel" as const,
      };
    })
    .filter((reel): reel is PublicPropertyReel => reel !== null);
  const legacyReels: PublicPropertyReel[] = legacyReelsFromMeta.length > 0
    ? legacyReelsFromMeta.map((reel, index) => ({
        ...reel,
        isFeatured: legacyReelsFromMeta.some((item) => item.isFeatured) ? reel.isFeatured : index === 0,
      }))
    : legacyReelAsset
      ? [
          {
            id: "legacy-reel-1",
            publicUrl: legacyReelAsset.publicUrl,
            storageKey: legacyReelAsset.storageKey,
            mimeType: legacyReelAsset.mimeType,
            sizeBytes: legacyReelAsset.sizeBytes || null,
            durationSeconds: null,
            width: null,
            height: null,
            isFeatured: true,
            createdAt: legacyReelAsset.uploadedAt || asString(approvedDraft?.updated_at) || asString(familyRow?.updated_at),
            updatedAt: legacyReelAsset.uploadedAt || asString(approvedDraft?.updated_at) || asString(familyRow?.updated_at),
            source: "family_legacy_reel" as const,
          },
        ]
      : [];
  const reels = canonicalReels.length > 0 ? canonicalReels : legacyReels;
  const reelSource =
    canonicalReels.length > 0 ? "host_property_reels" : legacyReels.length > 0 ? "family_legacy_reel" : "none";

  console.info("[property-public-media]", {
    context: params.debugContext ?? "unknown",
    familyId,
    hostId,
    gallerySource,
    reelSource,
    galleryCount: gallery.length,
    reelCount: reels.length,
  });

  return {
    gallery,
    reels,
    debug: {
      familyId,
      hostId,
      gallerySource,
      reelSource,
      galleryCount: gallery.length,
      reelCount: reels.length,
    },
  };
}
