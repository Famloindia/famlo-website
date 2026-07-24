import { NextResponse } from "next/server";

import { requireHostSettingsSession } from "@/lib/host-settings-auth";
import {
  getHostWhatsappSettings,
  hashRequestIp,
  updateHostWhatsappEnabled,
} from "@/lib/host-whatsapp-settings";
import { assertSameOrigin, getRequestIp } from "@/lib/request-security";
import { createAdminSupabaseClient } from "@/lib/supabase";

function errorResponse(error: unknown): NextResponse {
  const code = typeof error === "object" && error && "code" in error ? String(error.code) : "settings_error";
  const status = code === "unauthorized" ? 401 : code === "forbidden" ? 403 : 400;
  return NextResponse.json(
    { error: error instanceof Error ? error.message : "Unable to update WhatsApp settings.", code },
    { status }
  );
}
export async function GET(request: Request): Promise<NextResponse> {
  const supabase = createAdminSupabaseClient();
  try {
    const session = await requireHostSettingsSession(supabase, request);
    return NextResponse.json({ settings: await getHostWhatsappSettings(supabase, session.hostUserId) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request): Promise<NextResponse> {
  const supabase = createAdminSupabaseClient();
  try {
    assertSameOrigin(request);
    const session = await requireHostSettingsSession(supabase, request);
    const body = (await request.json()) as { enabled?: unknown };
    if (typeof body.enabled !== "boolean") {
      return NextResponse.json({ error: "Enabled must be true or false.", code: "invalid_request" }, { status: 400 });
    }
    const settings = await updateHostWhatsappEnabled(supabase, {
      hostUserId: session.hostUserId,
      enabled: body.enabled,
      ipHash: hashRequestIp(getRequestIp(request)),
    });
    return NextResponse.json({ settings });
  } catch (error) {
    return errorResponse(error);
  }
}
