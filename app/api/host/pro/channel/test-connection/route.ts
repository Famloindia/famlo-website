import { NextResponse } from "next/server";

import { POST as verifyBooking } from "@/app/api/host/pro/channel/channex/booking/verify/route";
import { POST as refreshProvider } from "@/app/api/host/pro/channel/channex/provider-refresh/route";
import { buildInternalJsonRequest, readJsonResponse } from "@/lib/channel-api-bridge";

type TestConnectionBody = {
  familyId?: string;
  providerKey?: string;
};

type TestConnectionResponse = {
  ok?: boolean;
  status?: string;
  message?: string;
  error?: string;
  verification?: Record<string, unknown> | null;
  state?: Record<string, unknown> | null;
  catalog?: Record<string, unknown> | null;
};

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = (await request.json()) as TestConnectionBody;
    const familyId = typeof body.familyId === "string" ? body.familyId.trim() : "";
    const providerKey = typeof body.providerKey === "string" ? body.providerKey.trim() : "";

    if (!familyId || !providerKey) {
      return NextResponse.json({ ok: false, error: "familyId and providerKey are required." }, { status: 400 });
    }

    const internalRequest =
      providerKey === "booking"
        ? buildInternalJsonRequest({
            request,
            pathname: "/api/host/pro/channel/channex/booking/verify",
            body: {
              familyId,
              action: "check",
            },
          })
        : buildInternalJsonRequest({
            request,
            pathname: "/api/host/pro/channel/channex/provider-refresh",
            body: {
              familyId,
              providerKey,
            },
          });

    const response =
      providerKey === "booking"
        ? await verifyBooking(internalRequest)
        : await refreshProvider(internalRequest);

    const payload = await readJsonResponse<TestConnectionResponse>(response);
    if (!response.ok || !payload.ok) {
      return NextResponse.json(
        {
          ok: false,
          phase: "test_connection",
          providerKey,
          error: payload.error ?? payload.message ?? "Unable to test the OTA connection.",
          status: payload.status ?? "failed",
        },
        { status: response.status }
      );
    }

    return NextResponse.json({
      ok: true,
      phase: "test_connection",
      providerKey,
      status: payload.status ?? "verified",
      message: payload.message ?? "Connection check completed.",
      verification: payload.verification ?? null,
      state: payload.state ?? null,
      catalog: payload.catalog ?? null,
    });
  } catch (error) {
    console.error("[host.pro.channel.test-connection] failed:", error);
    return NextResponse.json(
      {
        ok: false,
        phase: "test_connection",
        error: error instanceof Error ? error.message : "Unable to test the OTA connection.",
      },
      { status: 500 }
    );
  }
}

