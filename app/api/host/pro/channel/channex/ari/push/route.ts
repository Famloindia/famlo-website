import { NextResponse } from "next/server";

import { enqueueChannexAriSyncJobs } from "@/lib/channex-ari-jobs";
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

    const queuedJobIds = await enqueueChannexAriSyncJobs(supabase, {
      familyId,
      dateFrom: new Date().toISOString().slice(0, 10),
      dateTo: new Date().toISOString().slice(0, 10),
      jobTypes: ["full_sync"],
      certificationScenario: windowDays === LONG_WINDOW_DAYS ? "operator_full_sync_long_window" : "operator_full_sync",
      sourceUiAction:
        windowDays === LONG_WINDOW_DAYS
          ? "Famlo operator full sync (365 day request)"
          : "Famlo operator full sync",
      sourceRoute: "/api/host/pro/channel/channex/ari/push",
      stayUnitIds: null,
      actorUserId: authorizedResource.hostUserId ?? null,
      actorRole: "admin",
    });

    return NextResponse.json(
      {
        ok: true,
        status: "queued",
        configured: true,
        queuedJobIds,
        message: "Channex ARI full sync was queued from the Famlo operator flow.",
      },
      { status: 202 }
    );
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
