import { NextResponse } from "next/server";

import { checkChannexConnection, getChannexConfigSummary } from "@/lib/channel-providers/channex/client";
import { resolveAuthorizedHostResource } from "@/lib/host-access";
import { loadHostProAccess } from "@/lib/host-pro-access";
import { createAdminSupabaseClient } from "@/lib/supabase";

type CheckBody = {
  familyId?: string;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = (await request.json()) as CheckBody;
    const familyId = asString(body.familyId);

    if (!familyId) {
      return NextResponse.json({ error: "familyId is required." }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();
    const authorizedResource = await resolveAuthorizedHostResource(supabase, request, { familyId });

    if (!authorizedResource?.familyId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const access = await loadHostProAccess(supabase, familyId);
    if (!access.allowed) {
      return NextResponse.json({ error: "Famlo Pro is not active for this property." }, { status: 403 });
    }

    const config = getChannexConfigSummary();
    const result = await checkChannexConnection();
    const status = result.ok ? "success" : "failed";
    const payload = {
      environment: result.environment,
      endpoint: result.endpoint,
      http_status: result.httpStatus,
      configured: result.configured,
      checked_by: authorizedResource.isAdmin ? "admin" : "host",
    };

    const { error: logError } = await supabase.from("channel_sync_logs").insert({
      family_id: familyId,
      provider_code: "channex",
      action: "connection_check",
      status,
      message: result.message,
      payload,
    } as never);

    if (logError) {
      const message = String(logError.message ?? "");
      if (!/relation|does not exist|schema cache/i.test(message)) {
        console.error("[host.pro.channel.channex.check] log failed:", logError);
      }
    }

    return NextResponse.json({
      configured: config.configured,
      ok: result.ok,
      environment: result.environment,
      message: result.message,
    });
  } catch (error) {
    console.error("[host.pro.channel.channex.check] failed:", error);
    const config = getChannexConfigSummary();
    return NextResponse.json(
      {
        configured: false,
        ok: false,
        environment: config.environment,
        message: error instanceof Error ? error.message : "Failed to check Channex connection.",
      },
      { status: 500 }
    );
  }
}
