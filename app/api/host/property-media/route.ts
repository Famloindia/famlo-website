import { revalidatePath, revalidateTag } from "next/cache";
import { NextRequest, NextResponse } from "next/server";

import { resolveAuthorizedHostResource } from "@/lib/host-access";
import { resolvePublicPropertyMedia } from "@/lib/property-public-media";
import { createAdminSupabaseClient } from "@/lib/supabase";

type JsonRecord = Record<string, unknown>;

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
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

function mapPropertyPhotoRow(row: JsonRecord, fallbackFamilyId: string) {
  const url = asString(row.url) || asString(row.image_url) || asString(row.media_url);
  return {
    id: asString(row.id),
    familyId: asString(row.family_id) || fallbackFamilyId,
    url,
    storageKey: asString(row.storage_path) || asString(row.storage_key),
    caption: asString(row.caption),
    isPrimary: row.is_primary === true,
    sortOrder: asNumber(row.sort_order),
    source: asString(row.source) || "family_photos",
    createdAt: asString(row.created_at),
    updatedAt: asString(row.updated_at),
  };
}

async function ensureSinglePrimaryPhoto(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  familyId: string,
  nextPrimaryPhotoId?: string | null
): Promise<void> {
  const { data: rows, error } = await supabase
    .from("family_photos")
    .select("id")
    .eq("family_id", familyId)
    .order("is_primary", { ascending: false })
    .order("created_at", { ascending: true });

  if (error) {
    throw error;
  }

  const items = ((rows ?? []) as JsonRecord[]).map((row) => asString(row.id)).filter(Boolean);
  if (items.length === 0) return;

  const targetId = nextPrimaryPhotoId && items.includes(nextPrimaryPhotoId) ? nextPrimaryPhotoId : items[0];
  await supabase.from("family_photos").update({ is_primary: false } as never).eq("family_id", familyId);
  await supabase.from("family_photos").update({ is_primary: true } as never).eq("id", targetId);
}

function revalidatePropertyPaths(familyId: string): void {
  revalidateTag("homepage-discovery", "max");
  revalidateTag("home-detail-public-data", "max");
  revalidatePath("/");
  revalidatePath("/homestays");
  revalidatePath(`/homes/${familyId}`);
  revalidatePath(`/partnerslogin/home/dashboard?family=${familyId}&tab=profile`);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const familyId = asString(request.nextUrl.searchParams.get("familyId"));
  try {
    if (!familyId) {
      return NextResponse.json({ error: "Family ID is required." }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();
    const access = await resolveAuthorizedHostResource(supabase, request, { familyId });
    if (!access?.familyId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const resolvedFamilyId = access.familyId;
    const media = await resolvePublicPropertyMedia(supabase, {
      familyId: resolvedFamilyId,
      hostId: access.hostId,
      debugContext: "profile-config-gallery-api",
    });
    const photos = media.gallery.map((photo) =>
      mapPropertyPhotoRow(
        {
          id: photo.id,
          family_id: resolvedFamilyId,
          url: photo.url,
          is_primary: photo.isPrimary,
          created_at: photo.createdAt,
          source: photo.source,
        },
        resolvedFamilyId
      )
    );
    console.info("[property-media-api]", media.debug);
    return NextResponse.json({ photos });
  } catch (error) {
    console.error("[property-media-api:error]", {
      route: "/api/host/property-media",
      familyId,
      code: typeof error === "object" && error && "code" in error ? error.code : null,
      message: error instanceof Error ? error.message : String(error),
      details: typeof error === "object" && error && "details" in error ? error.details : null,
      hint: typeof error === "object" && error && "hint" in error ? error.hint : null,
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load property gallery." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = (await request.json()) as {
      familyId?: string;
      publicUrl?: string;
      storageKey?: string;
      caption?: string;
    };
    const familyId = asString(body.familyId);
    if (!familyId || !asString(body.publicUrl)) {
      return NextResponse.json({ error: "Family ID and media URL are required." }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();
    const access = await resolveAuthorizedHostResource(supabase, request, { familyId });
    if (!access?.familyId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const publicUrl = asString(body.publicUrl);
    const storageKey = asString(body.storageKey) || null;
    const caption = asString(body.caption) || null;

    try {
      let existingCount = 0;
      const countQuery = await supabase
        .from("family_photos")
        .select("id", { count: "exact", head: true })
        .eq("family_id", access.familyId);

      if (countQuery.error) {
        throw countQuery.error;
      }

      existingCount = countQuery.count ?? 0;

      const insertCandidates = [
        {
          family_id: access.familyId,
          url: publicUrl,
          image_url: publicUrl,
          storage_path: storageKey,
          caption,
          is_primary: existingCount === 0,
          sort_order: existingCount,
        },
        {
          family_id: access.familyId,
          url: publicUrl,
          image_url: publicUrl,
          caption,
          is_primary: existingCount === 0,
          sort_order: existingCount,
        },
        {
          family_id: access.familyId,
          url: publicUrl,
          is_primary: existingCount === 0,
          sort_order: existingCount,
        },
        {
          family_id: access.familyId,
          url: publicUrl,
          is_primary: existingCount === 0,
        },
      ];

      let insertedRow: JsonRecord | null = null;
      let lastInsertError: unknown = null;

      for (const candidate of insertCandidates) {
        const { data, error } = await supabase
          .from("family_photos")
          .insert(candidate as never)
          .select("*")
          .single();

        if (!error) {
          insertedRow = (data ?? {}) as JsonRecord;
          break;
        }

        lastInsertError = error;
        if (!isSchemaCompatibilityError(error)) {
          throw error;
        }
      }

      if (!insertedRow) {
        throw lastInsertError instanceof Error ? lastInsertError : new Error(String(lastInsertError ?? "Unable to insert gallery metadata."));
      }

      revalidatePropertyPaths(access.familyId);
      return NextResponse.json({ ok: true, photo: mapPropertyPhotoRow(insertedRow, access.familyId) });
    } catch (canonicalError) {
      if (!access.hostId) {
        throw canonicalError;
      }

      console.warn("[property-media-api] Falling back to legacy host_media save.", {
        familyId: access.familyId,
        hostId: access.hostId,
        message: canonicalError instanceof Error ? canonicalError.message : String(canonicalError),
      });

      const { count: legacyCount, error: legacyCountError } = await supabase
        .from("host_media")
        .select("id", { count: "exact", head: true })
        .eq("host_id", access.hostId);

      if (legacyCountError) {
        throw legacyCountError;
      }

      const legacyInsertCandidates = [
        {
          host_id: access.hostId,
          media_url: publicUrl,
          is_primary: (legacyCount ?? 0) === 0,
          sort_order: legacyCount ?? 0,
        },
        {
          host_id: access.hostId,
          media_url: publicUrl,
          is_primary: (legacyCount ?? 0) === 0,
        },
        {
          host_id: access.hostId,
          media_url: publicUrl,
        },
      ];

      let legacyRow: JsonRecord | null = null;
      let lastLegacyError: unknown = null;

      for (const candidate of legacyInsertCandidates) {
        const { data, error } = await supabase
          .from("host_media")
          .insert(candidate as never)
          .select("*")
          .single();

        if (!error) {
          legacyRow = {
            ...(data as JsonRecord | null),
            family_id: access.familyId,
            storage_key: storageKey,
            source: "host_media",
          };
          break;
        }

        lastLegacyError = error;
        if (!isSchemaCompatibilityError(error)) {
          throw error;
        }
      }

      if (!legacyRow) {
        throw lastLegacyError instanceof Error ? lastLegacyError : new Error(String(lastLegacyError ?? "Unable to insert legacy gallery metadata."));
      }

      revalidatePropertyPaths(access.familyId);
      return NextResponse.json({ ok: true, photo: mapPropertyPhotoRow(legacyRow, access.familyId), warning: "Saved gallery metadata using compatibility mode." });
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to save property gallery image." },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request): Promise<NextResponse> {
  try {
    const body = (await request.json()) as {
      familyId?: string;
      photoId?: string;
      action?: "set_primary" | "replace";
      publicUrl?: string;
      storageKey?: string;
      caption?: string;
    };
    const familyId = asString(body.familyId);
    const photoId = asString(body.photoId);
    if (!familyId || !photoId || !body.action) {
      return NextResponse.json({ error: "Family ID, photo ID, and action are required." }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();
    const access = await resolveAuthorizedHostResource(supabase, request, { familyId });
    if (!access?.familyId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (body.action === "set_primary") {
      await ensureSinglePrimaryPhoto(supabase, access.familyId, photoId);
    } else {
      const { error } = await supabase
        .from("family_photos")
        .update({
          url: asString(body.publicUrl) || undefined,
          image_url: asString(body.publicUrl) || undefined,
          storage_path: asString(body.storageKey) || undefined,
          caption: asString(body.caption) || undefined,
          updated_at: new Date().toISOString(),
        } as never)
        .eq("family_id", access.familyId)
        .eq("id", photoId);

      if (error) {
        throw error;
      }
    }

    revalidatePropertyPaths(access.familyId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to update property gallery image." },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request): Promise<NextResponse> {
  try {
    const body = (await request.json()) as {
      familyId?: string;
      photoId?: string;
    };
    const familyId = asString(body.familyId);
    const photoId = asString(body.photoId);
    if (!familyId || !photoId) {
      return NextResponse.json({ error: "Family ID and photo ID are required." }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();
    const access = await resolveAuthorizedHostResource(supabase, request, { familyId });
    if (!access?.familyId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { error } = await supabase
      .from("family_photos")
      .delete()
      .eq("family_id", access.familyId)
      .eq("id", photoId);

    if (error) {
      throw error;
    }

    await ensureSinglePrimaryPhoto(supabase, access.familyId);
    revalidatePropertyPaths(access.familyId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to remove property gallery image." },
      { status: 500 }
    );
  }
}
