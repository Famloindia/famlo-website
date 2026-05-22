import { NextResponse } from "next/server";

import { isOtaConnectId } from "@/lib/channels/ota-connect-config";
import { createOtaPreview } from "@/lib/channels/ota-connect-service";

type PreviewBody = {
  propertyId?: string;
  roomId?: string;
  otaId?: string;
  fields?: Record<string, string | undefined>;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = (await request.json()) as PreviewBody;
    const propertyId = asString(body.propertyId);
    const roomId = asString(body.roomId);
    const otaId = asString(body.otaId);

    if (!propertyId || !roomId || !otaId) {
      return NextResponse.json({ ok: false, error: "propertyId, roomId, and otaId are required." }, { status: 400 });
    }
    if (!isOtaConnectId(otaId)) {
      return NextResponse.json({ ok: false, error: "otaId is invalid." }, { status: 400 });
    }

    const preview = await createOtaPreview({
      request,
      propertyId,
      roomId,
      otaId,
      fields: body.fields ?? {},
    });

    return NextResponse.json({
      ok: true,
      previewId: preview.previewId,
      preview: preview.preview,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create OTA preview.";
    const status = /Unauthorized/i.test(message) ? 401 : /Room not found|Famlo Pro is not active/i.test(message) ? 403 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
