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

function withCanonicalStayUnitIdentifiers<T extends JsonRecord>(
  stayUnit: T,
  input: { canonicalStayUnitId: string; familyId: string; unitKey?: string | null }
): T & { unitId: string; canonicalStayUnitId: string; familyId: string; propertyId: string } {
  return {
    ...stayUnit,
    id: input.canonicalStayUnitId,
    unitId: input.canonicalStayUnitId,
    canonicalStayUnitId: input.canonicalStayUnitId,
    familyId: input.familyId,
    propertyId: input.familyId,
    unitKey: input.unitKey ?? (typeof stayUnit.unitKey === "string" ? stayUnit.unitKey : null),
  };
}

function isLikelyUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isInvalidUuidLookupError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = "code" in error && typeof error.code === "string" ? error.code : "";
  const message = "message" in error && typeof error.message === "string" ? error.message : "";
  return code === "22P02" || /invalid input syntax for type uuid/i.test(message);
}

async function fetchRoomWithSchemaFallback(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  input: {
    unitId: string;
    familyId: string;
    hostId: string | null;
  }
): Promise<{ data: JsonRecord | null; error: unknown }> {
  const baseSelect = "id,host_id,legacy_family_id,photos,locality_photos";
  const fallbackSelect = "id,host_id,legacy_family_id,photos";

  let firstQuery = supabase
    .from("stay_units_v2")
    .select(baseSelect)
    .eq("id", input.unitId)
    .eq("legacy_family_id", input.familyId);
  if (input.hostId) firstQuery = firstQuery.eq("host_id", input.hostId);
  const first = await firstQuery.maybeSingle();

  if (!first.error) {
    return { data: (first.data as JsonRecord | null) ?? null, error: null };
  }

  const missingColumn = extractMissingColumnFromSchemaError(first.error);
  if (missingColumn !== "locality_photos") {
    return { data: null, error: first.error };
  }

  let retryQuery = supabase
    .from("stay_units_v2")
    .select(fallbackSelect)
    .eq("id", input.unitId)
    .eq("legacy_family_id", input.familyId);
  if (input.hostId) retryQuery = retryQuery.eq("host_id", input.hostId);
  const retry = await retryQuery.maybeSingle();

  return {
    data: (retry.data as JsonRecord | null) ?? null,
    error: retry.error,
  };
}

async function resolveCanonicalRoomForUpload(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  input: {
    familyId: string;
    hostId: string | null;
    unitId: string;
    unitKey?: string | null;
    roomName?: string | null;
    clientId?: string | null;
  }
): Promise<{ data: JsonRecord | null; error: unknown }> {
  const lookupIds = [input.unitId, input.unitKey, input.clientId]
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter((value, index, values) => value.length > 0 && values.indexOf(value) === index);

  for (const lookupId of lookupIds) {
    if (!isLikelyUuid(lookupId)) continue;
    const direct = await fetchRoomWithSchemaFallback(supabase, {
      unitId: lookupId,
      familyId: input.familyId,
      hostId: input.hostId,
    });
    if (direct.error && isInvalidUuidLookupError(direct.error)) {
      continue;
    }
    if (direct.error || direct.data) {
      return direct;
    }
  }

  let byUnitKeyQuery = supabase
    .from("stay_units_v2")
    .select("id")
    .eq("legacy_family_id", input.familyId)
    .in("unit_key", lookupIds)
    .order("updated_at", { ascending: false })
    .limit(1);
  if (input.hostId) byUnitKeyQuery = byUnitKeyQuery.eq("host_id", input.hostId);
  const { data, error } = await byUnitKeyQuery.maybeSingle();

  if (error) {
    return { data: null, error };
  }

  const canonicalId = asString((data as JsonRecord | null)?.id);
  if (!canonicalId) {
    const roomName = typeof input.roomName === "string" ? input.roomName.trim() : "";
    if (!roomName) {
      return { data: null, error: null };
    }
    let byNameQuery = supabase
      .from("stay_units_v2")
      .select("id")
      .eq("legacy_family_id", input.familyId)
      .eq("name", roomName)
      .order("updated_at", { ascending: false })
      .limit(1);
    if (input.hostId) byNameQuery = byNameQuery.eq("host_id", input.hostId);
    const byName = await byNameQuery.maybeSingle();
    if (byName.error) {
      return { data: null, error: byName.error };
    }
    const nameMatchedId = asString((byName.data as JsonRecord | null)?.id);
    if (!nameMatchedId) {
      return { data: null, error: null };
    }
    return fetchRoomWithSchemaFallback(supabase, {
      unitId: nameMatchedId,
      familyId: input.familyId,
      hostId: input.hostId,
    });
  }

  return fetchRoomWithSchemaFallback(supabase, {
    unitId: canonicalId,
    familyId: input.familyId,
    hostId: input.hostId,
  });
}

async function loadUploadLookupDiagnostics(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  input: {
    familyId: string;
    hostId: string | null;
    unitId: string;
    unitKey: string;
    roomName: string;
    clientId: string;
  }
): Promise<JsonRecord> {
  const { data: byIdWithoutFamily } = input.unitId
    ? await supabase.from("stay_units_v2").select("id,host_id,legacy_family_id,unit_key,name,created_at,updated_at").eq("id", input.unitId).maybeSingle()
    : { data: null };
  const lookupUnitKeys = [input.unitKey, input.clientId, input.unitId]
    .map((value) => value.trim())
    .filter((value, index, values) => value.length > 0 && values.indexOf(value) === index);
  let byFamilyClientQuery = supabase
    .from("stay_units_v2")
    .select("id,host_id,legacy_family_id,unit_key,name,created_at,updated_at")
    .eq("legacy_family_id", input.familyId)
    .in("unit_key", lookupUnitKeys.length ? lookupUnitKeys : ["__none__"])
    .order("updated_at", { ascending: false })
    .limit(5);
  if (input.hostId) byFamilyClientQuery = byFamilyClientQuery.eq("host_id", input.hostId);
  const { data: byFamilyClientId } = await byFamilyClientQuery;
  let byFamilyNameQuery = supabase
    .from("stay_units_v2")
    .select("id,host_id,legacy_family_id,unit_key,name,created_at,updated_at")
    .eq("legacy_family_id", input.familyId)
    .eq("name", input.roomName)
    .order("updated_at", { ascending: false })
    .limit(5);
  if (input.hostId) byFamilyNameQuery = byFamilyNameQuery.eq("host_id", input.hostId);
  const { data: byFamilyRoomName } = await byFamilyNameQuery;

  return {
    failed_filter: {
      table: "stay_units_v2",
      id: input.unitId,
      legacy_family_id: input.familyId,
      host_id: input.hostId,
    },
    byIdWithoutFamily,
    byFamilyClientId,
    byFamilyRoomName,
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
    const unitKey = asString(formData.get("unitKey"));
    const roomName = asString(formData.get("roomName"));
    const clientId = asString(formData.get("clientId"));
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
    const { data: room, error: roomError } = await resolveCanonicalRoomForUpload(supabase, {
      familyId,
      hostId: hostAccess.hostId,
      unitId,
      unitKey,
      roomName,
      clientId,
    });
    console.info("[stay-units:upload-photos] room_lookup", {
      familyId,
      requestedUnitId: unitId,
      unitKey: unitKey || null,
      roomName: roomName || null,
      clientId: clientId || null,
      resolvedUnitId: room ? asString((room as JsonRecord).id) : null,
      found: Boolean(room),
      error: roomError ? getErrorMessage(roomError, "Failed to load room.") : null,
    });

    if (roomError) {
      return NextResponse.json({ error: getErrorMessage(roomError, "Failed to load room.") }, { status: 500 });
    }

    if (!room) {
      const diagnostics = await loadUploadLookupDiagnostics(supabase, {
        familyId,
        hostId: hostAccess.hostId,
        unitId,
        unitKey,
        roomName,
        clientId,
      });
      console.warn("[stay-units:upload-photos] room_not_found", {
        familyId,
        hostId: hostAccess.hostId,
        requestedUnitId: unitId,
        unitKey: unitKey || null,
        roomName: roomName || null,
        clientId: clientId || null,
        diagnostics,
      });
      return NextResponse.json({ error: "Room not found." }, { status: 404 });
    }

    const roomFamilyId = asString((room as JsonRecord).legacy_family_id);
    const roomHostId = asString((room as JsonRecord).host_id);
    if (roomFamilyId !== familyId && roomHostId.length === 0) {
      return NextResponse.json({ error: "Room does not belong to this host." }, { status: 403 });
    }

    const currentPhotos = asStringArray(kind === "locality" ? (room as JsonRecord).locality_photos : (room as JsonRecord).photos);
    const newUrls: string[] = [];

    for (const file of files) {
      const lowerName = file.name.toLowerCase();
      const isImage = file.type.startsWith("image/") || /\.(jpe?g|png|webp|heic|heif)$/.test(lowerName);
      if (!isImage) {
        return NextResponse.json({ error: "Please upload image files only." }, { status: 400 });
      }
      if (file.size > MAX_GALLERY_IMAGE_UPLOAD_BYTES) {
        return NextResponse.json({ error: "Image must be 50MB or smaller." }, { status: 400 });
      }
      const resolvedUnitId = asString((room as JsonRecord).id) || unitId;
      const publicUrl = await uploadFileToR2(file, `stay-units/${familyId}/${resolvedUnitId}`);
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
      asString((room as JsonRecord).id) || unitId,
      updatePayload
    );

    if (updateError) {
      return NextResponse.json({ error: getErrorMessage(updateError, "Failed to update room photos." ) }, { status: 500 });
    }

    if (strippedColumns.length > 0) {
      console.warn("[stay-units] stripped unsupported columns during photo update", strippedColumns);
    }

    const canonicalUnitId = asString((room as JsonRecord).id) || unitId;
    const mappedUpdated = updated ? mapStayUnitRow(updated as JsonRecord) : null;
    return NextResponse.json({
      ok: true,
      stayUnit: mappedUpdated
        ? withCanonicalStayUnitIdentifiers(mappedUpdated as unknown as JsonRecord, {
            canonicalStayUnitId: canonicalUnitId,
            familyId,
            unitKey,
          })
        : null,
      unitId: canonicalUnitId,
      canonicalStayUnitId: canonicalUnitId,
      familyId,
      propertyId: familyId,
      photoUrls: mergedPhotos,
      kind,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to upload room photos." },
      { status: 500 }
    );
  }
}
