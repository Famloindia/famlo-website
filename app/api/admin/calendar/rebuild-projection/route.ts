import { NextResponse } from "next/server";

import { hasAdminPermission } from "@/lib/admin-auth";
import { projectInventoryRange } from "@/lib/inventory";
import { createAdminSupabaseClient } from "@/lib/supabase";

type JsonRecord = Record<string, unknown>;

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function isIsoDate(value: string | null): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function canUseLocalDiagnostics(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.ENABLE_ADMIN_DIAGNOSTICS === "true";
}

async function canAccessDiagnostics(): Promise<boolean> {
  if (canUseLocalDiagnostics() && process.env.NODE_ENV !== "production") return true;
  return hasAdminPermission("channels");
}

export async function POST(request: Request): Promise<NextResponse> {
  if (!(await canAccessDiagnostics())) {
    return NextResponse.json({ error: "Admin channel access is required." }, { status: 403 });
  }

  try {
    const body = (await request.json()) as {
      familyId?: unknown;
      dateFrom?: unknown;
      dateTo?: unknown;
      roomIds?: unknown;
    };

    const familyId = asString(body.familyId);
    const dateFrom = asString(body.dateFrom);
    const dateTo = asString(body.dateTo);
    const requestedRoomIds = Array.isArray(body.roomIds)
      ? body.roomIds.map((value) => asString(value)).filter((value): value is string => Boolean(value))
      : [];

    if (!familyId || !isIsoDate(dateFrom) || !isIsoDate(dateTo) || dateTo < dateFrom) {
      return NextResponse.json({ error: "Valid familyId, dateFrom, and dateTo are required." }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();
    let roomsQuery = supabase
      .from("stay_units_v2")
      .select("id,name")
      .eq("legacy_family_id", familyId)
      .order("name", { ascending: true });

    if (requestedRoomIds.length > 0) {
      roomsQuery = roomsQuery.in("id", requestedRoomIds);
    }

    const { data: roomRows, error: roomError } = await roomsQuery;
    if (roomError) throw roomError;

    const rebuildSummaries = await Promise.all(
      ((roomRows ?? []) as JsonRecord[]).map(async (room) => {
        const roomId = asString(room.id);
        const roomName = asString(room.name) ?? "Room";
        if (!roomId) {
          return {
            roomId: null,
            roomName,
            projectedRowCount: 0,
            ok: false,
            error: "Missing room id.",
          };
        }

        try {
          const projected = await projectInventoryRange(supabase, {
            familyId,
            stayUnitId: roomId,
            from: dateFrom,
            to: dateTo,
          });
          return {
            roomId,
            roomName,
            projectedRowCount: projected.length,
            ok: true,
            error: null,
          };
        } catch (error) {
          return {
            roomId,
            roomName,
            projectedRowCount: 0,
            ok: false,
            error: error instanceof Error ? error.message : "Failed to rebuild projection for this room.",
          };
        }
      })
    );

    return NextResponse.json({
      ok: rebuildSummaries.every((entry) => entry.ok),
      familyId,
      dateFrom,
      dateTo,
      requestedRoomCount: requestedRoomIds.length || rebuildSummaries.length,
      rebuiltRoomCount: rebuildSummaries.filter((entry) => entry.ok).length,
      failedRoomCount: rebuildSummaries.filter((entry) => !entry.ok).length,
      projectedRowCount: rebuildSummaries.reduce((sum, entry) => sum + entry.projectedRowCount, 0),
      rooms: rebuildSummaries,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to rebuild inventory projections." },
      { status: 500 }
    );
  }
}
