import { NextResponse } from "next/server";

import { POST as runLimitedAriTest } from "@/app/api/host/pro/channel/channex/operator/ari-test/route";
import { getProviderMutationPrimitiveAudit } from "@/lib/channel-providers/provider-mutation-primitives";
import type { ChannelProviderKey } from "@/lib/channel-providers/provider-registry";
import { buildInternalJsonRequest, readJsonResponse } from "@/lib/channel-api-bridge";

type SyncBody = {
  familyId?: string;
  providerKey?: string;
  windowDays?: number;
};

type SyncResponse = {
  ok?: boolean;
  status?: string;
  message?: string;
  error?: string;
  limitedTest?: boolean;
};

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = (await request.json()) as SyncBody;
    const familyId = typeof body.familyId === "string" ? body.familyId.trim() : "";
    const providerKey = typeof body.providerKey === "string" ? body.providerKey.trim() : "";

    if (!familyId || !providerKey) {
      return NextResponse.json({ ok: false, error: "familyId and providerKey are required." }, { status: 400 });
    }

    if (providerKey !== "booking") {
      const primitiveAudit = getProviderMutationPrimitiveAudit(providerKey as ChannelProviderKey);
      return NextResponse.json(
        {
          ok: false,
          phase: "sync",
          providerKey,
          status: "assisted_only",
          error: "Selected-property sync is currently available only for Booking.com through the Channex path in this repo.",
          primitiveAudit,
        },
        { status: 409 }
      );
    }

    const internalRequest = buildInternalJsonRequest({
      request,
      pathname: "/api/host/pro/channel/channex/operator/ari-test",
      body: {
        familyId,
        providerKey,
        windowDays: body.windowDays,
      },
    });

    const response = await runLimitedAriTest(internalRequest);
    const payload = await readJsonResponse<SyncResponse>(response);
    if (!response.ok || !payload.ok) {
      return NextResponse.json(
        {
          ok: false,
          phase: "sync",
          providerKey,
          status: payload.status ?? "failed",
          error: payload.error ?? payload.message ?? "Unable to run the selected-property sync.",
        },
        { status: response.status }
      );
    }

    return NextResponse.json({
      ...payload,
      ok: true,
      phase: "sync",
      providerKey,
    });
  } catch (error) {
    console.error("[host.pro.channel.sync] failed:", error);
    return NextResponse.json(
      {
        ok: false,
        phase: "sync",
        error: error instanceof Error ? error.message : "Unable to run the selected-property sync.",
      },
      { status: 500 }
    );
  }
}
