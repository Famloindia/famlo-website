import { NextResponse } from "next/server";

import { provisionSingleStayUnitInChannex } from "@/lib/channex-room-provisioning";
import { resolveAuthorizedHostResource } from "@/lib/host-access";
import { loadHostProAccess } from "@/lib/host-pro-access";
import { createAdminSupabaseClient } from "@/lib/supabase";

type RepairBody = {
  familyId?: string;
  stayUnitId?: string;
};

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = (await request.json()) as RepairBody;
    const familyId = asString(body.familyId) ?? "";
    const stayUnitId = asString(body.stayUnitId) ?? "";

    if (!familyId || !stayUnitId) {
      return NextResponse.json({ error: "familyId and stayUnitId are required." }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();
    const authorizedResource = await resolveAuthorizedHostResource(supabase, request, { familyId });
    if (!authorizedResource?.familyId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const access = await loadHostProAccess(supabase, familyId);
    if (!access.allowed) {
      return NextResponse.json(
        {
          ok: false,
          status: "pro_inactive",
          message: "Famlo Pro is not active for this selected property.",
        },
        { status: 403 }
      );
    }

    const result = await provisionSingleStayUnitInChannex({
      supabase,
      hostId: authorizedResource.hostId,
      familyId,
      stayUnitId,
      reason: "manual_room_repair",
      sourceRoute: "/api/host/pro/channel/channex/rooms/repair",
      actorUserId: authorizedResource.hostUserId ?? null,
      actorRole: authorizedResource.isAdmin ? "admin" : "host",
    });

    const statusCode =
      result.ok ? 200 : result.status === "not_connected" || result.status === "repair_needed" ? 409 : 500;

    return NextResponse.json(result, { status: statusCode });
  } catch (error) {
    console.error("[host.pro.channel.channex.rooms.repair] failed:", error);
    return NextResponse.json(
      {
        ok: false,
        status: "failed",
        message: error instanceof Error ? error.message : "Failed to repair the Channex room mapping.",
      },
      { status: 500 }
    );
  }
}
