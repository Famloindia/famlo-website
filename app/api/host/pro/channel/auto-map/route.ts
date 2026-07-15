import { NextResponse } from "next/server";

import { GET as loadPreview } from "@/app/api/host/pro/channel/preview/route";
import { buildInternalJsonRequest, readJsonResponse } from "@/lib/channel-api-bridge";

type AutoMapBody = {
  familyId?: string;
  providerKey?: string;
};

type PreviewResponse = {
  ok?: boolean;
  suggestions?: Array<Record<string, unknown>>;
  autoApplicableCount?: number;
  refreshedAt?: string | null;
  error?: string;
};

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = (await request.json()) as AutoMapBody;
    const familyId = typeof body.familyId === "string" ? body.familyId.trim() : "";
    const providerKey = typeof body.providerKey === "string" ? body.providerKey.trim() : "";

    if (!familyId || !providerKey) {
      return NextResponse.json({ ok: false, error: "familyId and providerKey are required." }, { status: 400 });
    }

    const previewRequest = buildInternalJsonRequest({
      request,
      pathname: "/api/host/pro/channel/preview",
      method: "GET",
      query: { familyId, providerKey },
    });
    const previewResponse = await loadPreview(previewRequest);
    const previewPayload = await readJsonResponse<PreviewResponse>(previewResponse);

    if (!previewResponse.ok || !previewPayload.ok) {
      return NextResponse.json(
        {
          ok: false,
          phase: "auto_map",
          providerKey,
          error: previewPayload.error ?? "Unable to generate auto-map suggestions.",
        },
        { status: previewResponse.status }
      );
    }

    return NextResponse.json({
      ok: true,
      phase: "auto_map",
      providerKey,
      refreshedAt: previewPayload.refreshedAt ?? null,
      autoApplicableCount: previewPayload.autoApplicableCount ?? 0,
      suggestions: previewPayload.suggestions ?? [],
    });
  } catch (error) {
    console.error("[host.pro.channel.auto-map] failed:", error);
    return NextResponse.json(
      {
        ok: false,
        phase: "auto_map",
        error: error instanceof Error ? error.message : "Unable to generate auto-map suggestions.",
      },
      { status: 500 }
    );
  }
}

