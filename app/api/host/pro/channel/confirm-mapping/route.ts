import { NextResponse } from "next/server";

import { POST as saveMappings } from "@/app/api/host/pro/channel/mappings/route";
import { POST as applyPreviewMappings } from "@/app/api/host/pro/channel/preview/route";
import { buildInternalJsonRequest, readJsonResponse } from "@/lib/channel-api-bridge";

type ConfirmMappingBody = {
  familyId?: string;
  providerKey?: string;
  mode?: "preview" | "manual";
  roomIds?: string[];
  stayUnitId?: string;
  externalRoomTypeId?: string | null;
  externalRatePlanId?: string | null;
};

type GenericResponse = {
  ok?: boolean;
  message?: string;
  error?: string;
  state?: Record<string, unknown> | null;
  appliedCount?: number;
};

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = (await request.json()) as ConfirmMappingBody;
    const familyId = typeof body.familyId === "string" ? body.familyId.trim() : "";
    const providerKey = typeof body.providerKey === "string" ? body.providerKey.trim() : "";
    const mode = body.mode === "manual" ? "manual" : "preview";

    if (!familyId || !providerKey) {
      return NextResponse.json({ ok: false, error: "familyId and providerKey are required." }, { status: 400 });
    }

    const internalRequest =
      mode === "manual"
        ? buildInternalJsonRequest({
            request,
            pathname: "/api/host/pro/channel/mappings",
            body: {
              familyId,
              providerKey,
              stayUnitId: body.stayUnitId,
              externalRoomTypeId: body.externalRoomTypeId,
              externalRatePlanId: body.externalRatePlanId,
            },
          })
        : buildInternalJsonRequest({
            request,
            pathname: "/api/host/pro/channel/preview",
            body: {
              familyId,
              providerKey,
              roomIds: Array.isArray(body.roomIds) ? body.roomIds : [],
            },
          });

    const response =
      mode === "manual"
        ? await saveMappings(internalRequest)
        : await applyPreviewMappings(internalRequest);

    const payload = await readJsonResponse<GenericResponse>(response);
    if (!response.ok || !payload.ok) {
      return NextResponse.json(
        {
          ok: false,
          phase: "confirm_mapping",
          providerKey,
          mode,
          error: payload.error ?? payload.message ?? "Unable to confirm provider mapping.",
        },
        { status: response.status }
      );
    }

    return NextResponse.json({
      ok: true,
      phase: "confirm_mapping",
      providerKey,
      mode,
      message: payload.message ?? "Provider mapping confirmed.",
      appliedCount: payload.appliedCount ?? null,
      state: payload.state ?? null,
    });
  } catch (error) {
    console.error("[host.pro.channel.confirm-mapping] failed:", error);
    return NextResponse.json(
      {
        ok: false,
        phase: "confirm_mapping",
        error: error instanceof Error ? error.message : "Unable to confirm provider mapping.",
      },
      { status: 500 }
    );
  }
}

