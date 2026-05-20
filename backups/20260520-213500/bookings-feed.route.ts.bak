import { NextResponse } from "next/server";

import { autoProcessPendingChannexFeedRevisions } from "@/lib/channex-booking-auto-apply";
import { pollChannexBookingFeedForFamily } from "@/lib/channex-booking-feed-sync";
import { getChannexConfigSummary } from "@/lib/channel-providers/channex/client";
import { resolveAuthorizedHostResource } from "@/lib/host-access";
import { loadHostProAccess } from "@/lib/host-pro-access";
import { createAdminSupabaseClient } from "@/lib/supabase";

type FeedBody = {
  familyId?: string;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = (await request.json()) as FeedBody;
    const familyId = asString(body.familyId);

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

    const config = getChannexConfigSummary();
    if (!config.configured) {
      return NextResponse.json(
        {
          ok: false,
          status: "missing_config",
          message: "Channex staging configuration is incomplete.",
          configured: false,
          revisions: [],
        },
        { status: 503 }
      );
    }

    const result = await pollChannexBookingFeedForFamily({
      supabase,
      familyId,
      action: "fetch_booking_feed",
    });

    const autoApplySummary = await autoProcessPendingChannexFeedRevisions({
      supabase,
      familyId,
    });

    return NextResponse.json(
      {
        ...result,
        autoApplySummary,
      },
      { status: result.ok ? 200 : 502 }
    );
  } catch (error) {
    console.error("[host.pro.channel.channex.bookings.feed] failed:", error);
    return NextResponse.json(
      {
        ok: false,
        status: "failed",
        message: error instanceof Error ? error.message : "Failed to fetch the Channex booking feed.",
        revisions: [],
      },
      { status: 500 }
    );
  }
}
