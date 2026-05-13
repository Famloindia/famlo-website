import { NextResponse } from "next/server";

import { syncChannexAriForFamily } from "@/lib/channex-ari-sync";
import { getChannexConfigSummary } from "@/lib/channel-providers/channex/client";
import { ensureChannexMutationAllowed } from "@/lib/channel-providers/channex/mutation-guard";
import { resolveAuthorizedHostResource } from "@/lib/host-access";
import { loadHostProAccess } from "@/lib/host-pro-access";
import { createAdminSupabaseClient } from "@/lib/supabase";

type AriPushBody = {
  familyId?: string;
  windowDays?: number;
};

const DEFAULT_WINDOW_DAYS = 30;
const LONG_WINDOW_DAYS = 365;

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = (await request.json()) as AriPushBody;
    const familyId = asString(body.familyId) ?? "";
    const requestedWindowDays = typeof body.windowDays === "number" ? Math.floor(body.windowDays) : DEFAULT_WINDOW_DAYS;
    const windowDays = requestedWindowDays === LONG_WINDOW_DAYS ? LONG_WINDOW_DAYS : DEFAULT_WINDOW_DAYS;
    const logAction = windowDays === LONG_WINDOW_DAYS ? "push_ari_365_day" : "push_ari_30_day";

    if (!familyId) {
      return NextResponse.json({ error: "familyId is required." }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();
    const authorizedResource = await resolveAuthorizedHostResource(supabase, request, { familyId });
    if (!authorizedResource?.familyId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!authorizedResource.isAdmin) {
      return NextResponse.json({ error: "Operator access is required." }, { status: 403 });
    }

    const access = await loadHostProAccess(supabase, familyId);
    if (!access.allowed) {
      return NextResponse.json({ error: "Famlo Pro is not active for this property." }, { status: 403 });
    }

    const blockedMutation = await ensureChannexMutationAllowed({
      supabase,
      familyId,
      action: logAction,
      route: "/api/host/pro/channel/channex/ari/push",
    });
    if (blockedMutation) return blockedMutation;

    const config = getChannexConfigSummary();
    if (!config.configured) {
      return NextResponse.json(
        {
          ok: false,
          status: "failed",
          configured: false,
          message: "Channex staging configuration is incomplete.",
        },
        { status: 400 }
      );
    }

    const result = await syncChannexAriForFamily({
      supabase,
      familyId,
      hostId: authorizedResource.hostId,
      windowDays,
      action: logAction,
      route: "/api/host/pro/channel/channex/ari/push",
      requireActiveChannel: false,
    });

    return NextResponse.json(result, { status: result.ok ? 200 : 502 });
  } catch (error) {
    console.error("[host.pro.channel.channex.ari.push] failed:", error);
    return NextResponse.json(
      {
        ok: false,
        status: "failed",
        message: error instanceof Error ? error.message : "Failed to push Channex staging ARI.",
      },
      { status: 500 }
    );
  }
}
