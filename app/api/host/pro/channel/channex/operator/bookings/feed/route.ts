import { NextResponse } from "next/server";

import { pollChannexBookingFeedForFamily } from "@/lib/channex-booking-feed-sync";
import { getChannexConfigSummary } from "@/lib/channel-providers/channex/client";
import { resolveAuthorizedHostResource } from "@/lib/host-access";
import { loadHostProAccess } from "@/lib/host-pro-access";
import { createAdminSupabaseClient } from "@/lib/supabase";

type OperatorFeedBody = {
  familyId?: string;
  providerKey?: string;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = (await request.json()) as OperatorFeedBody;
    const familyId = asString(body.familyId);
    const providerKey = asString(body.providerKey) || "booking";

    if (!familyId) {
      return NextResponse.json({ error: "familyId is required." }, { status: 400 });
    }

    if (providerKey !== "booking") {
      return NextResponse.json(
        { error: "Booking feed test is currently available only for Booking.com through Channex." },
        { status: 400 }
      );
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

    return NextResponse.json(
      {
        ...result,
        operatorOnly: true,
        providerKey,
      },
      { status: result.ok ? 200 : 502 }
    );
  } catch (error) {
    console.error("[host.pro.channel.channex.operator.bookings.feed] failed:", error);
    return NextResponse.json(
      {
        ok: false,
        status: "failed",
        message: error instanceof Error ? error.message : "Unable to poll selected-property booking feed.",
        revisions: [],
      },
      { status: 500 }
    );
  }
}
