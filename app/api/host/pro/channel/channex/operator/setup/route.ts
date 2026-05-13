import { NextResponse } from "next/server";

import { POST as createProperty } from "@/app/api/host/pro/channel/channex/property/route";
import { POST as createRatePlans } from "@/app/api/host/pro/channel/channex/rate-plans/route";
import { POST as createRoomTypes } from "@/app/api/host/pro/channel/channex/rooms/route";
import { resolveAuthorizedHostResource } from "@/lib/host-access";
import { loadHostProAccess } from "@/lib/host-pro-access";
import { createAdminSupabaseClient } from "@/lib/supabase";

type OperatorSetupAction = "create_property" | "create_room_types" | "create_rate_plans";

type OperatorSetupBody = {
  familyId?: string;
  action?: OperatorSetupAction;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isOperatorSetupAction(value: string): value is OperatorSetupAction {
  return value === "create_property" || value === "create_room_types" || value === "create_rate_plans";
}

function buildForwardedRequest(request: Request, familyId: string): Request {
  const headers = new Headers(request.headers);
  headers.set("Content-Type", "application/json");

  return new Request(request.url, {
    method: "POST",
    headers,
    body: JSON.stringify({ familyId }),
  });
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = (await request.json()) as OperatorSetupBody;
    const familyId = asString(body.familyId);
    const action = asString(body.action);

    if (!familyId) {
      return NextResponse.json({ error: "familyId is required." }, { status: 400 });
    }

    if (!isOperatorSetupAction(action)) {
      return NextResponse.json({ error: "action is invalid." }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();
    const authorizedResource = await resolveAuthorizedHostResource(supabase, request, { familyId });

    if (!authorizedResource?.familyId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!authorizedResource.isAdmin) {
      return NextResponse.json({ error: "Operator access is required." }, { status: 403 });
    }

    const access = await loadHostProAccess(supabase, familyId);
    if (!access.allowed) {
      return NextResponse.json({ error: "Famlo Pro is not active for this property." }, { status: 403 });
    }

    const forwardedRequest = buildForwardedRequest(request, familyId);

    if (action === "create_property") {
      return createProperty(forwardedRequest);
    }

    if (action === "create_room_types") {
      return createRoomTypes(forwardedRequest);
    }

    return createRatePlans(forwardedRequest);
  } catch (error) {
    console.error("[host.pro.channel.channex.operator.setup] failed:", error);
    return NextResponse.json(
      {
        ok: false,
        status: "failed",
        message: error instanceof Error ? error.message : "Unable to run the operator setup action.",
      },
      { status: 500 }
    );
  }
}
