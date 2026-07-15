import { NextResponse } from "next/server";

import { POST as connectProvider } from "@/app/api/host/pro/channel/connect/route";
import { GET as loadPreview } from "@/app/api/host/pro/channel/preview/route";
import { getProviderMutationPrimitiveAudit } from "@/lib/channel-providers/provider-mutation-primitives";
import type { ChannelProviderKey } from "@/lib/channel-providers/provider-registry";
import { buildInternalJsonRequest, readJsonResponse } from "@/lib/channel-api-bridge";

type CreateBody = {
  familyId?: string;
  providerKey?: string;
  bookingHotelId?: string;
  bookingPropertyCode?: string;
  bookingExtranetRequested?: boolean;
  providerListingId?: string;
  providerPropertyCode?: string;
  providerListingUrl?: string;
  providerExtranetRequested?: boolean;
  providerAccessToken?: string;
};

type ConnectResponse = {
  ok?: boolean;
  mode?: "workspace_required" | "ready_for_preview";
  message?: string;
  iframeUrl?: string | null;
  providerHint?: string | null;
  verification?: Record<string, unknown> | null;
  state?: Record<string, unknown> | null;
  error?: string;
};

type PreviewResponse = {
  ok?: boolean;
  refreshedAt?: string | null;
  suggestions?: Array<Record<string, unknown>>;
  autoApplicableCount?: number;
  error?: string;
};

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = (await request.json()) as CreateBody;
    const providerKey = typeof body.providerKey === "string" ? body.providerKey.trim() : "";
    const familyId = typeof body.familyId === "string" ? body.familyId.trim() : "";

    if (!familyId || !providerKey) {
      return NextResponse.json({ ok: false, error: "familyId and providerKey are required." }, { status: 400 });
    }

    const connectRequest = buildInternalJsonRequest({
      request,
      pathname: "/api/host/pro/channel/connect",
      body,
    });
    const connectResponse = await connectProvider(connectRequest);
    const connectPayload = await readJsonResponse<ConnectResponse>(connectResponse);

    if (!connectResponse.ok || !connectPayload.ok) {
      return NextResponse.json(
        {
          ok: false,
          phase: "connect",
          error: connectPayload.error ?? connectPayload.message ?? "Unable to create the OTA connection flow.",
        },
        { status: connectResponse.status }
      );
    }

    let preview: PreviewResponse | null = null;
    if (connectPayload.mode === "ready_for_preview") {
      const previewRequest = buildInternalJsonRequest({
        request,
        pathname: "/api/host/pro/channel/preview",
        method: "GET",
        query: {
          familyId,
          providerKey,
        },
      });
      const previewResponse = await loadPreview(previewRequest);
      const previewPayload = await readJsonResponse<PreviewResponse>(previewResponse);
      if (previewResponse.ok && previewPayload.ok) {
        preview = previewPayload;
      }
    }

    const primitiveAudit = getProviderMutationPrimitiveAudit(providerKey as ChannelProviderKey);

    return NextResponse.json({
      ok: true,
      phase: "create",
      providerKey,
      directMutationAvailable:
        primitiveAudit.createChannelApiAvailable && primitiveAudit.testConnectionApiAvailable,
      fallbackRequired: connectPayload.mode === "workspace_required",
      message: connectPayload.message ?? "Connection details were saved.",
      verification: connectPayload.verification ?? null,
      state: connectPayload.state ?? null,
      preview,
      fallback: connectPayload.mode === "workspace_required"
        ? {
            workspaceUrl: connectPayload.iframeUrl ?? null,
            hint: connectPayload.providerHint ?? primitiveAudit.nextAction,
            primitiveAudit,
          }
        : null,
    });
  } catch (error) {
    console.error("[host.pro.channel.create] failed:", error);
    return NextResponse.json(
      {
        ok: false,
        phase: "create",
        error: error instanceof Error ? error.message : "Unable to start the OTA connection flow.",
      },
      { status: 500 }
    );
  }
}
