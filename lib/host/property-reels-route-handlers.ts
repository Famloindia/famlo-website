import { revalidatePath, revalidateTag } from "next/cache";
import { NextRequest, NextResponse } from "next/server";

import { resolveAuthorizedHostResource } from "@/lib/host-access";
import { parseHostListingMeta, serializeHostListingMeta } from "@/lib/host-listing-meta";
import { resolvePublicPropertyMedia } from "@/lib/property-public-media";
import { createAdminSupabaseClient } from "@/lib/supabase";

type JsonRecord = Record<string, unknown>;

type CanonicalReelRecord = {
  id: string;
  familyId: string;
  hostId: string;
  userId: string;
  storageKey: string;
  publicUrl: string;
  title: string;
  caption: string;
  mimeType: string;
  sizeBytes: number | null;
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
  isFeatured: boolean;
  status: string;
  createdAt: string;
  updatedAt: string;
};

type PropertyReelsRouteDeps = {
  createAdminSupabaseClient: typeof createAdminSupabaseClient;
  resolveAuthorizedHostResource: typeof resolveAuthorizedHostResource;
  resolvePublicPropertyMedia: typeof resolvePublicPropertyMedia;
  revalidatePath: typeof revalidatePath;
  revalidateTag: typeof revalidateTag;
};

const defaultRouteDeps: PropertyReelsRouteDeps = {
  createAdminSupabaseClient,
  resolveAuthorizedHostResource,
  resolvePublicPropertyMedia,
  revalidatePath,
  revalidateTag,
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

function buildJsonError(
  branch: string,
  status: number,
  message: string,
  extra?: Record<string, unknown>
): NextResponse {
  return NextResponse.json(
    {
      error: message,
      branch,
      ...extra,
    },
    { status }
  );
}

async function resolveOnboardingDraftAccess(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  draftId: string,
  familyId: string
): Promise<{ familyId: string; hostId: string | null; hostUserId: string | null } | null> {
  if (!draftId || !familyId) return null;

  const { data: draft, error: draftError } = await supabase
    .from("host_onboarding_drafts")
    .select("id,family_id")
    .eq("id", draftId)
    .maybeSingle();

  if (draftError) {
    throw Object.assign(new Error(draftError.message), {
      branch: "draft_lookup_failed",
      code: draftError.code ?? null,
      details: draftError.details ?? null,
      hint: draftError.hint ?? null,
    });
  }

  const draftFamilyId =
    draft && typeof (draft as JsonRecord).family_id === "string" ? asString((draft as JsonRecord).family_id) : "";
  if (!draftFamilyId || draftFamilyId !== familyId) {
    return null;
  }

  const [{ data: host }, { data: family }] = await Promise.all([
    supabase.from("hosts").select("id,user_id").eq("legacy_family_id", familyId).maybeSingle(),
    supabase.from("families").select("user_id").eq("id", familyId).maybeSingle(),
  ]);

  return {
    familyId,
    hostId: host && typeof (host as JsonRecord).id === "string" ? asString((host as JsonRecord).id) : null,
    hostUserId:
      (host && typeof (host as JsonRecord).user_id === "string" ? asString((host as JsonRecord).user_id) : null) ||
      (family && typeof (family as JsonRecord).user_id === "string" ? asString((family as JsonRecord).user_id) : null),
  };
}

function isSchemaCompatibilityError(error: unknown): boolean {
  const message =
    typeof error === "object" && error && "message" in error
      ? String(error.message ?? "").toLowerCase()
      : String(error ?? "").toLowerCase();

  return (
    message.includes("column") ||
    message.includes("schema cache") ||
    message.includes("does not exist") ||
    message.includes("relation") ||
    message.includes("could not find")
  );
}

function isPermissionCompatibilityError(error: unknown): boolean {
  const message =
    typeof error === "object" && error && "message" in error
      ? String(error.message ?? "").toLowerCase()
      : String(error ?? "").toLowerCase();
  const code = typeof error === "object" && error && "code" in error ? String(error.code ?? "") : "";

  return code === "42501" || message.includes("permission denied");
}

function buildLegacyReelResponse(input: {
  familyId: string;
  id?: string | null;
  hostId: string;
  publicUrl: string;
  storageKey: string | null;
  mimeType: string;
  sizeBytes: number | null;
  durationSeconds: number | null;
  width?: number | null;
  height?: number | null;
  createdAt: string;
}) {
  return {
    id: input.id || `legacy-reel-${Date.now()}`,
    familyId: input.familyId,
    hostId: input.hostId,
    storageKey: input.storageKey ?? "",
    publicUrl: input.publicUrl,
    title: "",
    caption: "",
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
    durationSeconds: input.durationSeconds,
    width: input.width ?? null,
    height: input.height ?? null,
    isFeatured: true,
    status: "active",
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
  };
}

function normalizeLegacyReelRows(meta: ReturnType<typeof parseHostListingMeta>): CanonicalReelRecord[] {
  const rows = Array.isArray(meta.hostReels) ? meta.hostReels : [];
  const normalizedRows = rows
    .map((row, index) => {
      const publicUrl = asString(row?.publicUrl);
      if (!publicUrl) return null;
      const createdAt = asString(row?.createdAt) || asString(row?.updatedAt) || new Date().toISOString();
      return {
        id: asString(row?.id) || `legacy-reel-${index + 1}`,
        familyId: "",
        hostId: "",
        userId: "",
        storageKey: asString(row?.storageKey),
        publicUrl,
        title: "",
        caption: "",
        mimeType: asString(row?.mimeType) || "video/mp4",
        sizeBytes: typeof row?.sizeBytes === "number" ? row.sizeBytes : null,
        durationSeconds: typeof row?.durationSeconds === "number" ? row.durationSeconds : null,
        width: typeof row?.width === "number" ? row.width : null,
        height: typeof row?.height === "number" ? row.height : null,
        isFeatured: row?.isFeatured === true,
        status: "active",
        createdAt,
        updatedAt: asString(row?.updatedAt) || createdAt,
      } satisfies CanonicalReelRecord;
    })
    .filter((row): row is CanonicalReelRecord => row !== null);

  if (normalizedRows.length > 0) {
    const hasFeatured = normalizedRows.some((row) => row.isFeatured);
    return normalizedRows.map((row, index) => ({
      ...row,
      isFeatured: hasFeatured ? row.isFeatured : index === 0,
    }));
  }

  const publicUrl = asString(meta.hostReelPublicUrl);
  if (!publicUrl) return [];
  const createdAt = asString(meta.hostReelUploadedAt) || new Date().toISOString();
  return [
    {
      id: "legacy-reel-1",
      familyId: "",
      hostId: "",
      userId: "",
      storageKey: asString(meta.hostReelStorageKey),
      publicUrl,
      title: "",
      caption: "",
      mimeType: asString(meta.hostReelMimeType) || "video/mp4",
      sizeBytes: typeof meta.hostReelSizeBytes === "number" ? meta.hostReelSizeBytes : null,
      durationSeconds: null,
      width: null,
      height: null,
      isFeatured: true,
      status: "active",
      createdAt,
      updatedAt: createdAt,
    },
  ];
}

function serializeLegacyReelRows(rows: CanonicalReelRecord[]) {
  const hasFeatured = rows.some((row) => row.isFeatured);
  return rows.map((row, index) => ({
    id: row.id || `legacy-reel-${index + 1}`,
    publicUrl: row.publicUrl,
    storageKey: row.storageKey,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    durationSeconds: row.durationSeconds,
    width: row.width,
    height: row.height,
    isFeatured: hasFeatured ? row.isFeatured : index === 0,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));
}

async function persistLegacyReelMetadata(params: {
  supabase: ReturnType<typeof createAdminSupabaseClient>;
  familyId: string;
  storageKey: string | null;
  publicUrl: string;
  mimeType: string;
  sizeBytes: number | null;
  uploadedAt: string;
}): Promise<CanonicalReelRecord> {
  const { data: familyRow, error: familyLookupError } = await params.supabase
    .from("families")
    .select("admin_notes")
    .eq("id", params.familyId)
    .maybeSingle();

  if (familyLookupError) {
    throw familyLookupError;
  }

  const currentMeta = parseHostListingMeta(asString((familyRow as JsonRecord | null)?.admin_notes) || null);
  const currentRows = normalizeLegacyReelRows(currentMeta);
  const uploadedAt = params.uploadedAt;
  const nextRow: CanonicalReelRecord = {
    id: `legacy-reel-${Date.now()}`,
    familyId: params.familyId,
    hostId: "",
    userId: "",
    storageKey: params.storageKey ?? "",
    publicUrl: params.publicUrl,
    title: "",
    caption: "",
    mimeType: params.mimeType,
    sizeBytes: params.sizeBytes,
    durationSeconds: null,
    width: null,
    height: null,
    isFeatured: currentRows.length === 0,
    status: "active",
    createdAt: uploadedAt,
    updatedAt: uploadedAt,
  };
  const nextRows = serializeLegacyReelRows([nextRow, ...currentRows.filter((row) => row.publicUrl !== params.publicUrl)]);
  const featuredRow = nextRows.find((row) => row.isFeatured) ?? nextRows[0] ?? null;
  const nextMeta = {
    ...currentMeta,
    hostReels: nextRows,
    hostReelStorageKey: featuredRow?.storageKey ?? "",
    hostReelPublicUrl: featuredRow?.publicUrl ?? "",
    hostReelMimeType: featuredRow?.mimeType ?? "",
    hostReelSizeBytes: featuredRow?.sizeBytes ?? undefined,
    hostReelUploadedAt: featuredRow?.updatedAt ?? featuredRow?.createdAt ?? "",
  };

  const { error: familyUpdateError } = await params.supabase
    .from("families")
    .update({
      admin_notes: serializeHostListingMeta(nextMeta),
    } as never)
    .eq("id", params.familyId);

  if (familyUpdateError) {
    throw familyUpdateError;
  }

  const { data: latestDraft } = await params.supabase
    .from("host_onboarding_drafts")
    .select("id,payload")
    .eq("family_id", params.familyId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestDraft?.id) {
    const existingPayload =
      latestDraft.payload && typeof latestDraft.payload === "object" && !Array.isArray(latestDraft.payload)
        ? (latestDraft.payload as JsonRecord)
        : {};

    const { error: draftUpdateError } = await params.supabase
      .from("host_onboarding_drafts")
      .update({
        payload: {
          ...existingPayload,
          hostReels: nextRows,
          hostReelStorageKey: featuredRow?.storageKey ?? "",
          hostReelPublicUrl: featuredRow?.publicUrl ?? "",
          hostReelMimeType: featuredRow?.mimeType ?? "",
          hostReelSizeBytes: featuredRow?.sizeBytes ?? null,
          hostReelUploadedAt: featuredRow?.updatedAt ?? featuredRow?.createdAt ?? "",
        },
      } as never)
      .eq("id", latestDraft.id);

    if (draftUpdateError) {
      throw draftUpdateError;
    }
  }

  return nextRow;
}

async function clearLegacyReelMetadata(params: {
  supabase: ReturnType<typeof createAdminSupabaseClient>;
  familyId: string;
}): Promise<void> {
  const { data: familyRow, error: familyLookupError } = await params.supabase
    .from("families")
    .select("admin_notes")
    .eq("id", params.familyId)
    .maybeSingle();

  if (familyLookupError) {
    throw familyLookupError;
  }

  const currentMeta = parseHostListingMeta(asString((familyRow as JsonRecord | null)?.admin_notes) || null);
  const nextMeta = {
    ...currentMeta,
    hostReels: [],
    hostReelStorageKey: "",
    hostReelPublicUrl: "",
    hostReelMimeType: "",
    hostReelSizeBytes: undefined,
    hostReelUploadedAt: "",
  };

  const { error: familyUpdateError } = await params.supabase
    .from("families")
    .update({
      admin_notes: serializeHostListingMeta(nextMeta),
    } as never)
    .eq("id", params.familyId);

  if (familyUpdateError) {
    throw familyUpdateError;
  }

  const { data: latestDraft } = await params.supabase
    .from("host_onboarding_drafts")
    .select("id,payload")
    .eq("family_id", params.familyId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestDraft?.id) {
    const existingPayload =
      latestDraft.payload && typeof latestDraft.payload === "object" && !Array.isArray(latestDraft.payload)
        ? (latestDraft.payload as JsonRecord)
        : {};

    const { error: draftUpdateError } = await params.supabase
      .from("host_onboarding_drafts")
      .update({
        payload: {
          ...existingPayload,
          hostReels: [],
          hostReelStorageKey: "",
          hostReelPublicUrl: "",
          hostReelMimeType: "",
          hostReelSizeBytes: null,
          hostReelUploadedAt: "",
        },
      } as never)
      .eq("id", latestDraft.id);

    if (draftUpdateError) {
      throw draftUpdateError;
    }
  }
}

async function updateLegacyReelRows(params: {
  supabase: ReturnType<typeof createAdminSupabaseClient>;
  familyId: string;
  update: (rows: CanonicalReelRecord[]) => CanonicalReelRecord[];
}): Promise<CanonicalReelRecord[]> {
  const { data: familyRow, error: familyLookupError } = await params.supabase
    .from("families")
    .select("admin_notes")
    .eq("id", params.familyId)
    .maybeSingle();

  if (familyLookupError) {
    throw familyLookupError;
  }

  const currentMeta = parseHostListingMeta(asString((familyRow as JsonRecord | null)?.admin_notes) || null);
  const currentRows = normalizeLegacyReelRows(currentMeta);
  const nextRows = params.update(currentRows).filter((row) => row.publicUrl);
  const serializedRows = serializeLegacyReelRows(nextRows);
  const featuredRow = serializedRows.find((row) => row.isFeatured) ?? serializedRows[0] ?? null;
  const nextMeta = {
    ...currentMeta,
    hostReels: serializedRows,
    hostReelStorageKey: featuredRow?.storageKey ?? "",
    hostReelPublicUrl: featuredRow?.publicUrl ?? "",
    hostReelMimeType: featuredRow?.mimeType ?? "",
    hostReelSizeBytes: featuredRow?.sizeBytes ?? undefined,
    hostReelUploadedAt: featuredRow?.updatedAt ?? featuredRow?.createdAt ?? "",
  };

  const { error: familyUpdateError } = await params.supabase
    .from("families")
    .update({
      admin_notes: serializeHostListingMeta(nextMeta),
    } as never)
    .eq("id", params.familyId);

  if (familyUpdateError) {
    throw familyUpdateError;
  }

  const { data: latestDraft } = await params.supabase
    .from("host_onboarding_drafts")
    .select("id,payload")
    .eq("family_id", params.familyId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestDraft?.id) {
    const existingPayload =
      latestDraft.payload && typeof latestDraft.payload === "object" && !Array.isArray(latestDraft.payload)
        ? (latestDraft.payload as JsonRecord)
        : {};

    const { error: draftUpdateError } = await params.supabase
      .from("host_onboarding_drafts")
      .update({
        payload: {
          ...existingPayload,
          hostReels: serializedRows,
          hostReelStorageKey: featuredRow?.storageKey ?? "",
          hostReelPublicUrl: featuredRow?.publicUrl ?? "",
          hostReelMimeType: featuredRow?.mimeType ?? "",
          hostReelSizeBytes: featuredRow?.sizeBytes ?? null,
          hostReelUploadedAt: featuredRow?.updatedAt ?? featuredRow?.createdAt ?? "",
        },
      } as never)
      .eq("id", latestDraft.id);

    if (draftUpdateError) {
      throw draftUpdateError;
    }
  }

  return serializedRows.map((row) =>
    mapReelRow({
      id: row.id,
      family_id: params.familyId,
      storage_key: row.storageKey,
      public_url: row.publicUrl,
      mime_type: row.mimeType,
      size_bytes: row.sizeBytes,
      duration_seconds: row.durationSeconds,
      width: row.width,
      height: row.height,
      is_featured: row.isFeatured,
      status: "active",
      created_at: row.createdAt,
      updated_at: row.updatedAt,
    })
  );
}

function mapReelRow(row: JsonRecord): CanonicalReelRecord {
  return {
    id: asString(row.id),
    familyId: asString(row.family_id),
    hostId: asString(row.host_id),
    userId: asString(row.user_id),
    storageKey: asString(row.storage_key) || asString(row.r2_key),
    publicUrl: asString(row.public_url),
    title: asString(row.title),
    caption: asString(row.caption),
    mimeType: asString(row.mime_type),
    sizeBytes: asNumber(row.size_bytes),
    durationSeconds: asNumber(row.duration_seconds),
    width: asNumber(row.width),
    height: asNumber(row.height),
    isFeatured: row.is_featured === true,
    status: asString(row.status) || "active",
    createdAt: asString(row.created_at),
    updatedAt: asString(row.updated_at),
  };
}

function revalidatePropertyPaths(
  familyId: string,
  deps: Pick<PropertyReelsRouteDeps, "revalidatePath" | "revalidateTag">
): void {
  deps.revalidateTag("homepage-discovery", "max");
  deps.revalidateTag("home-detail-public-data", "max");
  deps.revalidatePath("/");
  deps.revalidatePath("/homestays");
  deps.revalidatePath(`/homes/${familyId}`);
  deps.revalidatePath(`/partnerslogin/home/dashboard?family=${familyId}&tab=profile`);
}

async function ensureSingleFeaturedReel(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  familyId: string,
  nextFeaturedId?: string | null
): Promise<void> {
  const { data: rows, error } = await supabase
    .from("host_property_reels")
    .select("id,status")
    .eq("family_id", familyId)
    .eq("status", "active")
    .order("is_featured", { ascending: false })
    .order("created_at", { ascending: true });

  if (error) {
    throw error;
  }

  const items = ((rows ?? []) as JsonRecord[]).map((row) => asString(row.id)).filter(Boolean);
  if (items.length === 0) return;

  const targetId = nextFeaturedId && items.includes(nextFeaturedId) ? nextFeaturedId : items[0];
  await supabase.from("host_property_reels").update({ is_featured: false } as never).eq("family_id", familyId);
  await supabase.from("host_property_reels").update({ is_featured: true } as never).eq("id", targetId);
}

async function loadCanonicalReels(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  familyId: string
): Promise<CanonicalReelRecord[]> {
  const preferred = await supabase
    .from("host_property_reels")
    .select(
      "id,family_id,host_id,user_id,storage_key,public_url,title,caption,mime_type,size_bytes,duration_seconds,width,height,is_featured,status,created_at,updated_at"
    )
    .eq("family_id", familyId)
    .neq("status", "deleted")
    .order("is_featured", { ascending: false })
    .order("created_at", { ascending: true });

  if (!preferred.error) {
    return ((preferred.data ?? []) as JsonRecord[]).map(mapReelRow);
  }

  if (isPermissionCompatibilityError(preferred.error)) {
    console.warn("[property-reels-api] canonical reels unavailable; falling back to legacy metadata.", {
      familyId,
      code: preferred.error.code ?? null,
      message: preferred.error.message,
    });
    return [];
  }

  if (!isSchemaCompatibilityError(preferred.error)) {
    throw preferred.error;
  }

  const legacyCompat = await supabase
    .from("host_property_reels")
    .select(
      "id,family_id,host_id,user_id,storage_key,public_url,mime_type,size_bytes,duration_seconds,is_featured,status,created_at,updated_at"
    )
    .eq("family_id", familyId)
    .neq("status", "deleted")
    .order("is_featured", { ascending: false })
    .order("created_at", { ascending: true });

  if (!legacyCompat.error) {
    return ((legacyCompat.data ?? []) as JsonRecord[]).map(mapReelRow);
  }

  if (isPermissionCompatibilityError(legacyCompat.error)) {
    console.warn("[property-reels-api] canonical reels unavailable; falling back to legacy metadata.", {
      familyId,
      code: legacyCompat.error.code ?? null,
      message: legacyCompat.error.message,
    });
    return [];
  }

  if (!isSchemaCompatibilityError(legacyCompat.error)) {
    throw legacyCompat.error;
  }

  const minimalCompat = await supabase
    .from("host_property_reels")
    .select("id,family_id,host_id,user_id,public_url,mime_type,size_bytes,duration_seconds,is_featured,status,created_at,updated_at")
    .eq("family_id", familyId)
    .neq("status", "deleted")
    .order("is_featured", { ascending: false })
    .order("created_at", { ascending: true });

  if (minimalCompat.error) {
    if (isPermissionCompatibilityError(minimalCompat.error)) {
      console.warn("[property-reels-api] canonical reels unavailable; falling back to legacy metadata.", {
        familyId,
        code: minimalCompat.error.code ?? null,
        message: minimalCompat.error.message,
      });
      return [];
    }
    throw minimalCompat.error;
  }

  return ((minimalCompat.data ?? []) as JsonRecord[]).map(mapReelRow);
}

async function syncLegacyMirrorFromFeaturedCanonical(params: {
  supabase: ReturnType<typeof createAdminSupabaseClient>;
  familyId: string;
}): Promise<void> {
  const reels = await loadCanonicalReels(params.supabase, params.familyId);
  const featured = reels.find((row) => row.isFeatured && row.status === "active") ?? reels[0] ?? null;

  if (!featured) {
    await clearLegacyReelMetadata({
      supabase: params.supabase,
      familyId: params.familyId,
    });
    return;
  }

  await persistLegacyReelMetadata({
    supabase: params.supabase,
    familyId: params.familyId,
    storageKey: featured.storageKey || null,
    publicUrl: featured.publicUrl,
    mimeType: featured.mimeType,
    sizeBytes: featured.sizeBytes,
    uploadedAt: featured.updatedAt || featured.createdAt || new Date().toISOString(),
  });
}

export function createPropertyReelsRouteHandlers(deps: PropertyReelsRouteDeps = defaultRouteDeps) {
  return {
    async GET(request: NextRequest): Promise<NextResponse> {
  const familyId = asString(request.nextUrl.searchParams.get("familyId"));
  try {
    if (!familyId) {
      return NextResponse.json({ error: "Family ID is required." }, { status: 400 });
    }

    const supabase = deps.createAdminSupabaseClient();
    const access = await deps.resolveAuthorizedHostResource(supabase, request, { familyId });
    if (!access?.familyId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const media = await deps.resolvePublicPropertyMedia(supabase, {
      familyId: access.familyId,
      hostId: access.hostId,
      debugContext: "profile-config-reels-api",
    });
    const reels = media.reels.map((reel) =>
      mapReelRow({
        id: reel.id,
        family_id: access.familyId,
        host_id: access.hostId,
        user_id: access.hostUserId,
        storage_key: reel.storageKey,
        public_url: reel.publicUrl,
        mime_type: reel.mimeType,
        size_bytes: reel.sizeBytes,
        duration_seconds: reel.durationSeconds,
        width: "width" in reel ? reel.width : null,
        height: "height" in reel ? reel.height : null,
        is_featured: reel.isFeatured,
        status: "active",
        created_at: reel.createdAt,
        updated_at: reel.updatedAt,
      })
    );
    console.info("[property-reels-api]", media.debug);
    return NextResponse.json({ reels });
  } catch (error) {
    console.error("[property-reels-api:error]", {
      route: "/api/host/property-reels",
      familyId,
      code: typeof error === "object" && error && "code" in error ? error.code : null,
      message: error instanceof Error ? error.message : String(error),
      details: typeof error === "object" && error && "details" in error ? error.details : null,
      hint: typeof error === "object" && error && "hint" in error ? error.hint : null,
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load host reels." },
      { status: 500 }
    );
  }
},

    async POST(request: Request): Promise<NextResponse> {
  try {
    const body = (await request.json()) as {
      draftId?: string;
      familyId?: string;
      publicUrl?: string;
      public_url?: string;
      storageKey?: string;
      storage_key?: string;
      title?: string;
      caption?: string;
      mimeType?: string;
      mime_type?: string;
      sizeBytes?: number | string;
      size_bytes?: number | string;
      durationSeconds?: number | string | null;
      duration_seconds?: number | string | null;
      width?: number | string | null;
      height?: number | string | null;
    };
    const familyId = asString(body.familyId);
    const draftId = asString(body.draftId);
    const publicUrl = asString(body.publicUrl) || asString(body.public_url);
    const storageKey = asString(body.storageKey) || asString(body.storage_key) || null;
    const mimeType = asString(body.mimeType) || asString(body.mime_type);
    if (!familyId || !publicUrl || !mimeType) {
      return buildJsonError(
        "missing_draft_or_family",
        400,
        "Family ID, reel URL, and mime type are required.",
        {
          hasDraftId: Boolean(draftId),
          hasFamilyId: Boolean(familyId),
          hasPublicUrl: Boolean(publicUrl),
          hasMimeType: Boolean(mimeType),
        }
      );
    }

    const supabase = deps.createAdminSupabaseClient();
    let directAccess = null;
    try {
      directAccess = await deps.resolveAuthorizedHostResource(supabase, request, { familyId });
    } catch (error) {
      console.warn("[property-reels-api] auth:warning", {
        familyId,
        draftId: draftId || null,
        message: error instanceof Error ? error.message : String(error),
      });
    }

    let onboardingDraftAccess = null;
    try {
      onboardingDraftAccess =
        !directAccess?.familyId && draftId ? await resolveOnboardingDraftAccess(supabase, draftId, familyId) : null;
    } catch (error) {
      return buildJsonError(
        "draft_lookup_failed",
        500,
        error instanceof Error ? error.message : "Draft lookup failed.",
        {
          code: typeof error === "object" && error && "code" in error ? error.code : null,
          details: typeof error === "object" && error && "details" in error ? error.details : null,
          hint: typeof error === "object" && error && "hint" in error ? error.hint : null,
        }
      );
    }
    const resolvedFamilyId = directAccess?.familyId || onboardingDraftAccess?.familyId || "";
    const resolvedHostId = directAccess?.hostId || onboardingDraftAccess?.hostId || null;
    const resolvedHostUserId = directAccess?.hostUserId || onboardingDraftAccess?.hostUserId || null;

    console.info("[property-reels-api] post:request", {
      familyId,
      draftId: draftId || null,
      resolvedFamilyId: resolvedFamilyId || null,
      resolvedHostId,
      resolvedHostUserId,
      publicUrl,
      storageKey,
      mimeType,
    });

    if (!resolvedFamilyId) {
      return buildJsonError("auth_failed", 401, "Unauthorized", {
        hasDraftId: Boolean(draftId),
        familyId,
      });
    }

    if (!resolvedHostUserId) {
      return buildJsonError("user_id_missing", 400, "Unable to resolve reel owner user ID.", {
        familyId: resolvedFamilyId,
        draftId: draftId || null,
        hostId: resolvedHostId,
      });
    }

    const createdAt = new Date().toISOString();
    const sizeBytes = asNumber(body.sizeBytes ?? body.size_bytes);
    const durationSeconds = asNumber(body.durationSeconds ?? body.duration_seconds);
    const width = asNumber(body.width);
    const height = asNumber(body.height);

    const existingReels = await loadCanonicalReels(supabase, resolvedFamilyId);
    const insertCandidates = [
      {
        family_id: resolvedFamilyId,
        host_id: resolvedHostId,
        user_id: resolvedHostUserId,
        storage_key: storageKey ?? publicUrl,
        public_url: publicUrl,
        mime_type: mimeType,
        size_bytes: sizeBytes,
        duration_seconds: durationSeconds,
        width,
        height,
        is_featured: existingReels.length === 0,
        status: "active",
        created_at: createdAt,
        updated_at: createdAt,
      },
      {
        family_id: resolvedFamilyId,
        host_id: resolvedHostId,
        user_id: resolvedHostUserId,
        storage_key: storageKey ?? publicUrl,
        public_url: publicUrl,
        mime_type: mimeType,
        size_bytes: sizeBytes,
        duration_seconds: durationSeconds,
        is_featured: existingReels.length === 0,
        status: "active",
        created_at: createdAt,
        updated_at: createdAt,
      },
    ];

    let insertedData: JsonRecord | null = null;
    let lastInsertError: unknown = null;
    for (const candidate of insertCandidates) {
      const inserted = await supabase.from("host_property_reels").insert(candidate as never).select("*").single();
      if (!inserted.error) {
        insertedData = (inserted.data ?? {}) as JsonRecord;
        break;
      }
      lastInsertError = inserted.error;
      if (isPermissionCompatibilityError(inserted.error)) {
        console.warn("[property-reels-api] insert permission denied; saving legacy reel metadata instead.", {
          familyId: resolvedFamilyId,
          draftId: draftId || null,
          code: inserted.error.code ?? null,
          message: inserted.error.message,
        });
        break;
      }
      if (!isSchemaCompatibilityError(inserted.error)) {
        console.error("[property-reels-api] insert:failure", {
          familyId: resolvedFamilyId,
          draftId: draftId || null,
          code: inserted.error.code ?? null,
          message: inserted.error.message,
          details: inserted.error.details ?? null,
          hint: inserted.error.hint ?? null,
        });
        return buildJsonError("supabase_insert_failed", 500, inserted.error.message, {
          code: inserted.error.code ?? null,
          details: inserted.error.details ?? null,
          hint: inserted.error.hint ?? null,
        });
      }
    }

    if (!insertedData) {
      const error = lastInsertError as { message?: string; code?: string; details?: string | null; hint?: string | null } | null;
      if (isPermissionCompatibilityError(error)) {
        const legacyRow = await persistLegacyReelMetadata({
          supabase,
          familyId: resolvedFamilyId,
          storageKey,
          publicUrl,
          mimeType,
          sizeBytes,
          uploadedAt: createdAt,
        });

        const legacyReel = buildLegacyReelResponse({
          familyId: resolvedFamilyId,
          id: legacyRow.id,
          hostId: resolvedHostId ?? "",
          storageKey,
          publicUrl,
          mimeType,
          sizeBytes,
          durationSeconds,
          width,
          height,
          createdAt,
        });
        revalidatePropertyPaths(resolvedFamilyId, deps);
        return NextResponse.json({
          ok: true,
          reel: legacyReel,
          warning: "Saved host reel metadata to legacy profile fields because canonical reel table access is unavailable.",
        });
      }

      console.error("[property-reels-api] insert:failure", {
        familyId: resolvedFamilyId,
        draftId: draftId || null,
        code: error?.code ?? null,
        message: error?.message ?? "Unknown insert failure",
        details: error?.details ?? null,
        hint: error?.hint ?? null,
      });
      return buildJsonError(
        "supabase_insert_failed",
        500,
        error?.message ?? "Unable to insert host reel metadata.",
        {
          code: error?.code ?? null,
          details: error?.details ?? null,
          hint: error?.hint ?? null,
        }
      );
    }

    const insertedReel = mapReelRow(insertedData);
    console.info("[property-reels-api] insert:success", {
      familyId: resolvedFamilyId,
      draftId: draftId || null,
      reelId: insertedReel.id,
      storageKey: insertedReel.storageKey,
      publicUrl: insertedReel.publicUrl,
    });
    if (insertedReel.isFeatured) {
      await ensureSingleFeaturedReel(supabase, resolvedFamilyId, insertedReel.id);
    }
    await syncLegacyMirrorFromFeaturedCanonical({
      supabase,
      familyId: resolvedFamilyId,
    });

    revalidatePropertyPaths(resolvedFamilyId, deps);
    return NextResponse.json({ ok: true, reel: insertedReel });
  } catch (error) {
    console.error("[property-reels-api:error]", {
      route: "/api/host/property-reels",
      message: error instanceof Error ? error.message : String(error),
      code: typeof error === "object" && error && "code" in error ? error.code : null,
      details: typeof error === "object" && error && "details" in error ? error.details : null,
      hint: typeof error === "object" && error && "hint" in error ? error.hint : null,
    });
    return buildJsonError(
      typeof error === "object" && error && "branch" in error ? String(error.branch) : "unexpected_error",
      500,
      error instanceof Error ? error.message : "Unable to save host reel.",
      {
        code: typeof error === "object" && error && "code" in error ? error.code : null,
        details: typeof error === "object" && error && "details" in error ? error.details : null,
        hint: typeof error === "object" && error && "hint" in error ? error.hint : null,
      }
    );
  }
},

    async PATCH(request: Request): Promise<NextResponse> {
  try {
    const body = (await request.json()) as {
      familyId?: string;
      reelId?: string;
      action?: "set_featured";
    };
    const familyId = asString(body.familyId);
    const reelId = asString(body.reelId);
    if (!familyId || !reelId || !body.action) {
      return NextResponse.json({ error: "Family ID, reel ID, and action are required." }, { status: 400 });
    }

    const supabase = deps.createAdminSupabaseClient();
    const access = await deps.resolveAuthorizedHostResource(supabase, request, { familyId });
    if (!access?.familyId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (reelId.startsWith("legacy-")) {
      await updateLegacyReelRows({
        supabase,
        familyId: access.familyId,
        update: (rows) =>
          rows.map((row) => ({
            ...row,
            isFeatured: row.id === reelId,
            updatedAt: row.id === reelId ? new Date().toISOString() : row.updatedAt,
          })),
      });
      revalidatePropertyPaths(access.familyId, deps);
      return NextResponse.json({ ok: true });
    }

    await ensureSingleFeaturedReel(supabase, access.familyId, reelId);
    await syncLegacyMirrorFromFeaturedCanonical({
      supabase,
      familyId: access.familyId,
    });
    revalidatePropertyPaths(access.familyId, deps);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to update host reel." },
      { status: 500 }
    );
  }
},

    async DELETE(request: Request): Promise<NextResponse> {
  try {
    const body = (await request.json()) as {
      familyId?: string;
      reelId?: string;
    };
    const familyId = asString(body.familyId);
    const reelId = asString(body.reelId);
    if (!familyId || !reelId) {
      return NextResponse.json({ error: "Family ID and reel ID are required." }, { status: 400 });
    }

    const supabase = deps.createAdminSupabaseClient();
    const access = await deps.resolveAuthorizedHostResource(supabase, request, { familyId });
    if (!access?.familyId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (reelId.startsWith("legacy-")) {
      await updateLegacyReelRows({
        supabase,
        familyId: access.familyId,
        update: (rows) => {
          const remaining = rows.filter((row) => row.id !== reelId);
          if (remaining.length > 0 && !remaining.some((row) => row.isFeatured)) {
            return remaining.map((row, index) => ({ ...row, isFeatured: index === 0 }));
          }
          return remaining;
        },
      });

      const compatDelete = await supabase
        .from("host_property_reels")
        .update({ status: "deleted", is_featured: false, updated_at: new Date().toISOString() } as never)
        .eq("family_id", access.familyId);

      if (
        compatDelete.error &&
        !isSchemaCompatibilityError(compatDelete.error) &&
        !isPermissionCompatibilityError(compatDelete.error)
      ) {
        throw compatDelete.error;
      }

      revalidatePropertyPaths(access.familyId, deps);
      return NextResponse.json({ ok: true });
    }

    const { error } = await supabase
      .from("host_property_reels")
      .update({ status: "deleted", is_featured: false, updated_at: new Date().toISOString() } as never)
      .eq("family_id", access.familyId)
      .eq("id", reelId);

    if (error) {
      throw error;
    }

    await ensureSingleFeaturedReel(supabase, access.familyId);
    await syncLegacyMirrorFromFeaturedCanonical({
      supabase,
      familyId: access.familyId,
    });
    revalidatePropertyPaths(access.familyId, deps);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to remove host reel." },
      { status: 500 }
    );
  }
},
  };
}
