import { NextResponse } from "next/server";

import { POST as refreshProvider } from "@/app/api/host/pro/channel/channex/provider-refresh/route";
import { GET as loadMappings } from "@/app/api/host/pro/channel/mappings/route";
import { GET as loadPreview } from "@/app/api/host/pro/channel/preview/route";
import { buildInternalJsonRequest, readJsonResponse } from "@/lib/channel-api-bridge";

type ProviderStructureBody = {
  familyId?: string;
  providerKey?: string;
};

type ProviderRefreshResponse = {
  ok?: boolean;
  status?: string;
  message?: string;
  error?: string;
  verification?: Record<string, unknown> | null;
  catalog?: Record<string, unknown> | null;
  state?: Record<string, unknown> | null;
};

type MappingsResponse = {
  ok?: boolean;
  catalog?: Record<string, unknown> | null;
  rooms?: Array<Record<string, unknown>>;
  error?: string;
};

type PreviewResponse = {
  ok?: boolean;
  suggestions?: Array<Record<string, unknown>>;
  autoApplicableCount?: number;
  error?: string;
};

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = (await request.json()) as ProviderStructureBody;
    const familyId = typeof body.familyId === "string" ? body.familyId.trim() : "";
    const providerKey = typeof body.providerKey === "string" ? body.providerKey.trim() : "";

    if (!familyId || !providerKey) {
      return NextResponse.json({ ok: false, error: "familyId and providerKey are required." }, { status: 400 });
    }

    const refreshRequest = buildInternalJsonRequest({
      request,
      pathname: "/api/host/pro/channel/channex/provider-refresh",
      body: { familyId, providerKey },
    });
    const refreshResponse = await refreshProvider(refreshRequest);
    const refreshPayload = await readJsonResponse<ProviderRefreshResponse>(refreshResponse);

    if (!refreshResponse.ok || !refreshPayload.ok) {
      return NextResponse.json(
        {
          ok: false,
          phase: "provider_structure",
          providerKey,
          status: refreshPayload.status ?? "failed",
          error: refreshPayload.error ?? refreshPayload.message ?? "Unable to refresh provider structure.",
        },
        { status: refreshResponse.status }
      );
    }

    const mappingsRequest = buildInternalJsonRequest({
      request,
      pathname: "/api/host/pro/channel/mappings",
      method: "GET",
      query: { familyId, providerKey },
    });
    const mappingsResponse = await loadMappings(mappingsRequest);
    const mappingsPayload = await readJsonResponse<MappingsResponse>(mappingsResponse);

    const previewRequest = buildInternalJsonRequest({
      request,
      pathname: "/api/host/pro/channel/preview",
      method: "GET",
      query: { familyId, providerKey },
    });
    const previewResponse = await loadPreview(previewRequest);
    const previewPayload = await readJsonResponse<PreviewResponse>(previewResponse);

    return NextResponse.json({
      ok: true,
      phase: "provider_structure",
      providerKey,
      status: refreshPayload.status ?? "channel_visible",
      message: refreshPayload.message ?? "Provider structure loaded.",
      verification: refreshPayload.verification ?? null,
      state: refreshPayload.state ?? null,
      catalog: refreshPayload.catalog ?? mappingsPayload.catalog ?? null,
      rooms: mappingsPayload.ok ? mappingsPayload.rooms ?? [] : [],
      suggestions: previewPayload.ok ? previewPayload.suggestions ?? [] : [],
      autoApplicableCount: previewPayload.ok ? previewPayload.autoApplicableCount ?? 0 : 0,
    });
  } catch (error) {
    console.error("[host.pro.channel.provider-structure] failed:", error);
    return NextResponse.json(
      {
        ok: false,
        phase: "provider_structure",
        error: error instanceof Error ? error.message : "Unable to load provider structure.",
      },
      { status: 500 }
    );
  }
}

