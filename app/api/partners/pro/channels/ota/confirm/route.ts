import { NextResponse } from "next/server";

import { isOtaConnectId } from "@/lib/channels/ota-connect-config";
import { confirmOtaConnection } from "@/lib/channels/ota-connect-service";

type ConfirmBody = {
  propertyId?: string;
  roomId?: string;
  otaId?: string;
  previewId?: string;
  mappings?: {
    externalRoomTypeId?: string | null;
    externalRatePlanId?: string | null;
  };
  confirmationAccepted?: boolean;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = (await request.json()) as ConfirmBody;
    const propertyId = asString(body.propertyId);
    const roomId = asString(body.roomId);
    const otaId = asString(body.otaId);
    const previewId = asString(body.previewId);

    if (!propertyId || !roomId || !otaId || !previewId) {
      return NextResponse.json({ ok: false, error: "propertyId, roomId, otaId, and previewId are required." }, { status: 400 });
    }
    if (!isOtaConnectId(otaId)) {
      return NextResponse.json({ ok: false, error: "otaId is invalid." }, { status: 400 });
    }

    const result = await confirmOtaConnection({
      request,
      propertyId,
      roomId,
      otaId,
      previewId,
      mappings: body.mappings ?? {},
      confirmationAccepted: body.confirmationAccepted === true,
    });

    return NextResponse.json({
      ok: true,
      status: result.status,
      connected: result.connected,
      syncQueued: result.syncQueued,
      queuedJobIds: result.queuedJobIds,
      message: result.message,
      state: result.state,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to confirm OTA connection.";
    const status = /Unauthorized/i.test(message) ? 401 : /required|Confirmation/i.test(message) ? 400 : /not found|active/i.test(message) ? 403 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
