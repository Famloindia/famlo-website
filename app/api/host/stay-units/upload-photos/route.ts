import { NextResponse } from "next/server";

import { resolveAuthorizedHostResource } from "@/lib/host-access";
import { uploadFileToR2 } from "@/lib/r2-upload";
import { createAdminSupabaseClient } from "@/lib/supabase";
import { mapStayUnitRow } from "@/lib/stay-units";
import { MAX_GALLERY_IMAGE_UPLOAD_BYTES } from "@/lib/upload-limits";

type JsonRecord = Record<string, unknown>;

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0);
}

function extractMissingColumnFromSchemaError(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const message = "message" in error && typeof error.message === "string" ? error.message : "";
  const match = message.match(/Could not find the '([^']+)' column/i);
  return match?.[1] ?? null;
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

async function fetchRoomWithSchemaFallback(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  unitId: string
): Promise<{ data: JsonRecord | null; error: unknown }> {
  const baseSelect = "id,host_id,legacy_family_id,photos,locality_photos";
  const fallbackSelect = "id,host_id,legacy_family_id,photos";

  const first = await supabase
    .from("stay_units_v2")
    .select(baseSelect)
    .eq("id", unitId)
    .maybeSingle();

  if (!first.error) {
    return { data: (first.data as JsonRecord | null) ?? null, error: null };
  }

  const missingColumn = extractMissingColumnFromSchemaError(first.error);
  if (missingColumn !== "locality_photos") {
    return { data: null, error: first.error };
  }

  const retry = await supabase
    .from("stay_units_v2")
    .select(fallbackSelect)
    .eq("id", unitId)
    .maybeSingle();

  return {
    data: (retry.data as JsonRecord | null) ?? null,
    error: retry.error,
  };
}

async function updateRoomWithSchemaFallback(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  unitId: string,
  payload: JsonRecord
): Promise<{ data: JsonRecord | null; error: unknown; strippedColumns: string[] }> {
  const workingPayload: JsonRecord = { ...payload };
  const strippedColumns: string[] = [];

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const { data, error } = await supabase
      .from("stay_units_v2")
      .update(workingPayload as never)
      .eq("id", unitId)
      .select("*")
      .maybeSingle();

    if (!error) {
      return { data: (data as JsonRecord | null) ?? null, error: null, strippedColumns };
    }

    const missingColumn = extractMissingColumnFromSchemaError(error);
    if (!missingColumn || !(missingColumn in workingPayload)) {
      return { data: null, error, strippedColumns };
    }

    delete workingPayload[missingColumn];
    strippedColumns.push(missingColumn);
  }

  return {
    data: null,
    error: new Error("Schema fallback exhausted for stay_units_v2."),
    strippedColumns,
  };
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const formData = await request.formData();
    const familyId = asString(formData.get("familyId"));
    const unitId = asString(formData.get("unitId"));
    const kind = asString(formData.get("kind")) === "locality" ? "locality" : "room";
    const files = formData.getAll("photos").filter((item): item is File => item instanceof File);

    if (!familyId || !unitId) {
      return NextResponse.json({ error: "Missing familyId or unitId." }, { status: 400 });
    }

    if (files.length === 0) {
      return NextResponse.json({ error: "Choose at least one room photo." }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();
    const hostAccess = await resolveAuthorizedHostResource(supabase, request, { familyId });
    if (!hostAccess) {
      return NextResponse.json({ error: "You do not have access to these room photos." }, { status: 403 });
    }
    const { data: room, error: roomError } = await fetchRoomWithSchemaFallback(supabase, unitId);

    if (roomError) {
      return NextResponse.json({ error: getErrorMessage(roomError, "Failed to load room.") }, { status: 500 });
    }

    if (!room) {
      return NextResponse.json({ error: "Room not found." }, { status: 404 });
    }

    const roomFamilyId = asString((room as JsonRecord).legacy_family_id);
    const roomHostId = asString((room as JsonRecord).host_id);
    if (roomFamilyId !== familyId && roomHostId.length === 0) {
      return NextResponse.json({ error: "Room does not belong to this host." }, { status: 403 });
    }

    const currentPhotos = asStringArray(kind === "locality" ? (room as JsonRecord).locality_photos : (room as JsonRecord).photos);
    const newUrls: string[] = [];

    for (const [index, file] of files.entries()) {
      const lowerName = file.name.toLowerCase();
      const isImage = file.type.startsWith("image/") || /\.(jpe?g|png|webp|heic|heif)$/.test(lowerName);
      if (!isImage) {
        return NextResponse.json({ error: "Please upload image files only." }, { status: 400 });
      }
      if (file.size > MAX_GALLERY_IMAGE_UPLOAD_BYTES) {
        return NextResponse.json({ error: "Image must be 50MB or smaller." }, { status: 400 });
      }
      const publicUrl = await uploadFileToR2(file, `stay-units/${familyId}/${unitId}`);
      newUrls.push(publicUrl);
    }

    const mergedPhotos = Array.from(new Set([...currentPhotos, ...newUrls])).slice(0, 8);
    const updatePayload =
      kind === "locality"
        ? {
            locality_photos: mergedPhotos,
            updated_at: new Date().toISOString(),
          }
        : {
            photos: mergedPhotos,
            updated_at: new Date().toISOString(),
          };
    const { data: updated, error: updateError, strippedColumns } = await updateRoomWithSchemaFallback(
      supabase,
      unitId,
      updatePayload
    );

    if (updateError) {
      return NextResponse.json({ error: getErrorMessage(updateError, "Failed to update room photos." ) }, { status: 500 });
    }

    if (strippedColumns.length > 0) {
      console.warn("[stay-units] stripped unsupported columns during photo update", strippedColumns);
    }

    return NextResponse.json({ ok: true, stayUnit: updated ? mapStayUnitRow(updated as JsonRecord) : null, photoUrls: mergedPhotos, kind });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to upload room photos." },
      { status: 500 }
    );
  }
}
