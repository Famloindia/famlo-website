import { NextResponse } from "next/server";

import { handleAirbnbAuthorizationCallback } from "@/lib/channels/ota-connect-service";

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const result = await handleAirbnbAuthorizationCallback({ request });
    return NextResponse.redirect(result.redirectUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to finish Airbnb authorization.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
