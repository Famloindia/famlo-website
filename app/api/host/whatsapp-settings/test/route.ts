import { NextResponse } from "next/server";

import { requireHostSettingsSession } from "@/lib/host-settings-auth";
import {
  hashRequestIp,
  recordBlockedTestMessage,
  whatsappDeliveryEnabled,
} from "@/lib/host-whatsapp-settings";
import { assertSameOrigin, getRequestIp } from "@/lib/request-security";
import { createAdminSupabaseClient } from "@/lib/supabase";

export async function POST(request: Request): Promise<NextResponse> {
  const supabase = createAdminSupabaseClient();
  try {
    assertSameOrigin(request);
    const session = await requireHostSettingsSession(supabase, request);
    if (!whatsappDeliveryEnabled()) {
      await recordBlockedTestMessage(supabase, {
        hostUserId: session.hostUserId,
        ipHash: hashRequestIp(getRequestIp(request)),
      });
      return NextResponse.json(
        {
          ok: false,
          code: "whatsapp_delivery_disabled",
          message: "WhatsApp delivery is not active yet.",
        },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { ok: false, code: "test_message_not_enabled", message: "Test delivery will be enabled in Phase 3." },
      { status: 409 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to test WhatsApp delivery.",
        code: "unauthorized",
      },
      { status: 401 }
    );
  }
}
