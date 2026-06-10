import { NextResponse } from "next/server";

import { autoProcessPendingChannexFeedRevisions } from "@/lib/channex-booking-auto-apply";
import { pollChannexBookingFeedForFamily } from "@/lib/channex-booking-feed-sync";
import { getChannexConfigSummary } from "@/lib/channel-providers/channex/client";
import { resolveAuthorizedHostResource } from "@/lib/host-access";
import { loadHostProAccess } from "@/lib/host-pro-access";
import { createAdminSupabaseClient } from "@/lib/supabase";
import { shouldSkipChannexFeedPoll } from "@/lib/channex-booking-feed-sync";

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

    const { data: propertyRow, error: propertyError } = await supabase
      .from("channel_properties")
      .select("id,metadata")
      .eq("family_id", familyId)
      .eq("provider_code", "channex")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (propertyError) throw propertyError;

    const skip = shouldSkipChannexFeedPoll(
      propertyRow?.metadata && typeof propertyRow.metadata === "object" && !Array.isArray(propertyRow.metadata)
        ? (propertyRow.metadata as Record<string, unknown>)
        : null,
      new Date()
    );
    if (skip?.skip) {
      return NextResponse.json(
        {
          ok: true,
          status: "skipped",
          message:
            skip.reason === "backoff"
              ? "Recent Channex booking feed errors triggered a temporary backoff."
              : "Channex booking feed was polled recently, so Famlo skipped a duplicate refresh.",
          nextEligibleAt: skip.nextEligibleAt,
          revisions: [],
          autoApplySummary: null,
        },
        { status: 200 }
      );
    }

    const result = await pollChannexBookingFeedForFamily({
      supabase,
      familyId,
      action: authorizedResource.isAdmin ? "operator_requested_booking_feed" : "host_requested_booking_feed",
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
