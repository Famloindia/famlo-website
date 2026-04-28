import { NextRequest, NextResponse } from "next/server";

import { resolveAuthorizedHostResource } from "@/lib/host-access";
import { loadStayUnitsForSelector, mapStayUnitRow } from "@/lib/stay-units";
import { normalizeAmenityList } from "@/lib/room-amenities";
import { createAdminSupabaseClient } from "@/lib/supabase";

type JsonRecord = Record<string, unknown>;

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNullableString(value: unknown): string | null {
  const next = asString(value);
  return next.length > 0 ? next : null;
}

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function asNullableNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function asBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(normalized)) return true;
    if (["false", "0", "no", "off"].includes(normalized)) return false;
  }
  return fallback;
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter((item) => item.length > 0);
  }

  if (typeof value === "string") {
    return value
      .split(/[\n,]/)
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }

  return [];
}

function makeUnitKey(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
  return `room-${slug || "unit"}-${Date.now().toString(36)}`;
}

function extractMissingColumnFromSchemaError(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const message = "message" in error && typeof error.message === "string" ? error.message : "";
  const match = message.match(/Could not find the '([^']+)' column/i);
  return match?.[1] ?? null;
}

async function mutateStayUnitWithSchemaFallback(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  mode: "insert" | "update",
  payload: JsonRecord,
  unitId?: string | null
): Promise<{ data: JsonRecord | null; error: unknown; strippedColumns: string[] }> {
  const workingPayload: JsonRecord = { ...payload };
  const strippedColumns: string[] = [];

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const query =
      mode === "update"
        ? supabase
            .from("stay_units_v2")
            .update(workingPayload as never)
            .eq("id", unitId ?? "")
            .select("*")
            .maybeSingle()
        : supabase.from("stay_units_v2").insert(workingPayload as never).select("*").maybeSingle();

    const { data, error } = await query;
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

async function resolveHostContext(supabase: ReturnType<typeof createAdminSupabaseClient>, familyId: string): Promise<{
  legacyFamilyId: string;
  hostId: string | null;
}> {
  const { data: family } = await supabase
    .from("families")
    .select("id")
    .eq("id", familyId)
    .maybeSingle();

  if (!family) {
    return { legacyFamilyId: familyId, hostId: null };
  }

  const { data: host } = await supabase
    .from("hosts")
    .select("id")
    .eq("legacy_family_id", familyId)
    .maybeSingle();

  return {
    legacyFamilyId: familyId,
    hostId: asNullableString((host as JsonRecord | null)?.id),
  };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const familyId = request.nextUrl.searchParams.get("familyId");
  if (!familyId) {
    return NextResponse.json({ error: "Missing familyId." }, { status: 400 });
  }

  const supabase = createAdminSupabaseClient();
  const hostAccess = await resolveAuthorizedHostResource(supabase, request, { familyId });
  if (!hostAccess) {
    return NextResponse.json({ error: "You do not have access to these rooms." }, { status: 403 });
  }
  const { hostId, legacyFamilyId } = await resolveHostContext(supabase, familyId);
  const stayUnits = await loadStayUnitsForSelector(supabase, { hostId, legacyFamilyId });

  return NextResponse.json({ stayUnits });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = (await request.json()) as JsonRecord;
    const familyId = asNullableString(body.familyId);
    const clientId = asNullableString(body.clientId);
    if (!familyId) {
      return NextResponse.json({ error: "Missing familyId." }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();
    const hostAccess = await resolveAuthorizedHostResource(supabase, request, { familyId });
    if (!hostAccess) {
      return NextResponse.json({ error: "You do not have access to these rooms." }, { status: 403 });
    }
    const { hostId, legacyFamilyId } = await resolveHostContext(supabase, familyId);
    const unit = body.unit && typeof body.unit === "object" ? (body.unit as JsonRecord) : {};
    const unitId = asNullableString(unit.id);
    const name = asString(unit.name);
    if (!name) {
      return NextResponse.json({ error: "Room name is required." }, { status: 400 });
    }

    const unitKey = asNullableString(unit.unitKey) || (unitId ? null : makeUnitKey(name));
    const payload: JsonRecord = {
      host_id: hostId,
      legacy_family_id: legacyFamilyId,
      unit_key: unitKey ?? "primary",
      name,
      unit_type: asString(unit.unitType) || "private_room",
      description: asNullableString(unit.description),
      max_guests: Math.max(1, Math.trunc(asNumber(unit.maxGuests, 1))),
      bed_info: asNullableString(unit.bedInfo),
      bathroom_type: asNullableString(unit.bathroomType),
      room_size_sqm: typeof unit.roomSizeSqm === "number" || typeof unit.roomSizeSqm === "string" ? asNumber(unit.roomSizeSqm, 0) : null,
      lat: asNullableNumber(unit.lat),
      lng: asNullableNumber(unit.lng),
      price_morning: Math.max(0, Math.trunc(asNumber(unit.priceMorning, 0))),
      price_afternoon: Math.max(0, Math.trunc(asNumber(unit.priceAfternoon, 0))),
      price_evening: Math.max(0, Math.trunc(asNumber(unit.priceEvening, 0))),
      price_fullday: Math.max(0, Math.trunc(asNumber(unit.priceFullday, 0))),
      quarter_enabled: asBoolean(unit.quarterEnabled, true),
      is_active: asBoolean(unit.isActive, true),
      is_primary: asBoolean(unit.isPrimary, false),
      amenities: normalizeAmenityList(asStringArray(unit.amenities)),
      photos: asStringArray(unit.photos),
      locality_photos: asStringArray(unit.localityPhotos),
      sort_order: Math.trunc(asNumber(unit.sortOrder, 0)),
      updated_at: new Date().toISOString(),
    };

    if (payload.is_primary) {
      await supabase
        .from("stay_units_v2")
        .update({ is_primary: false })
        .eq("legacy_family_id", legacyFamilyId)
        .neq("id", unitId ?? "00000000-0000-0000-0000-000000000000");
      if (hostId) {
        await supabase
          .from("stay_units_v2")
          .update({ is_primary: false })
          .eq("host_id", hostId)
          .neq("id", unitId ?? "00000000-0000-0000-0000-000000000000");
      }
    }

    if (unitId) {
      const { data, error, strippedColumns } = await mutateStayUnitWithSchemaFallback(
        supabase,
        "update",
        payload,
        unitId
      );
      if (strippedColumns.length > 0) {
        console.warn("[stay-units] stripped unsupported columns during update", strippedColumns);
      }
      if (error) throw error;
      return NextResponse.json({ stayUnit: mapStayUnitRow(data as JsonRecord), clientId });
    }

    const { data, error, strippedColumns } = await mutateStayUnitWithSchemaFallback(
      supabase,
      "insert",
      payload
    );
    if (strippedColumns.length > 0) {
      console.warn("[stay-units] stripped unsupported columns during insert", strippedColumns);
    }
    if (error) throw error;
    return NextResponse.json({ stayUnit: mapStayUnitRow(data as JsonRecord), clientId });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save room." },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  try {
    const body = (await request.json()) as JsonRecord;
    const familyId = asNullableString(body.familyId);
    const unitId = asNullableString(body.unitId);

    if (!familyId || !unitId) {
      return NextResponse.json({ error: "Missing familyId or unitId." }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();
    const hostAccess = await resolveAuthorizedHostResource(supabase, request, { familyId });
    if (!hostAccess) {
      return NextResponse.json({ error: "You do not have access to these rooms." }, { status: 403 });
    }
    const { hostId, legacyFamilyId } = await resolveHostContext(supabase, familyId);

    const deleteQuery = supabase.from("stay_units_v2").delete().eq("id", unitId);
    if (legacyFamilyId) {
      deleteQuery.eq("legacy_family_id", legacyFamilyId);
    }
    if (hostId) {
      deleteQuery.eq("host_id", hostId);
    }

    const { error } = await deleteQuery;
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete room." },
      { status: 500 }
    );
  }
}
