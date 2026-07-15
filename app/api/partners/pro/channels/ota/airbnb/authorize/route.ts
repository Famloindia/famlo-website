import { NextResponse } from "next/server";

import { createAirbnbAuthorizationUrl } from "@/lib/channels/ota-connect-service";

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const url = new URL(request.url);
    const propertyId = asString(url.searchParams.get("propertyId"));
    const roomId = asString(url.searchParams.get("roomId"));

    if (!propertyId || !roomId) {
      return NextResponse.json({ ok: false, error: "propertyId and roomId are required." }, { status: 400 });
    }

    const { authorizationUrl } = await createAirbnbAuthorizationUrl({
      request,
      propertyId,
      roomId,
    });

    return NextResponse.json({
      ok: true,
      authorizationUrl,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to start Airbnb authorization.";
    const status = /Unauthorized/i.test(message) ? 401 : /Room not found|active/i.test(message) ? 403 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
