import { NextResponse } from "next/server";

import { POST as acknowledgeRevision } from "@/app/api/host/pro/channel/channex/bookings/acknowledge/route";
import { resolveAuthorizedHostResource } from "@/lib/host-access";
import { loadHostProAccess } from "@/lib/host-pro-access";
import { createAdminSupabaseClient } from "@/lib/supabase";

type OperatorBookingAcknowledgeBody = {
  familyId?: string;
  providerKey?: string;
  channelBookingRevisionId?: string;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asStringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function buildForwardedRequest(request: Request, channelBookingRevisionId: string): Request {
  const headers = new Headers(request.headers);
  headers.set("Content-Type", "application/json");

  return new Request(request.url, {
    method: "POST",
    headers,
    body: JSON.stringify({ channelBookingRevisionId }),
  });
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = (await request.json()) as OperatorBookingAcknowledgeBody;
    const familyId = asString(body.familyId);
    const providerKey = asString(body.providerKey) || "booking";
    const channelBookingRevisionId = asString(body.channelBookingRevisionId);

    if (!familyId || !channelBookingRevisionId) {
      return NextResponse.json({ error: "familyId and channelBookingRevisionId are required." }, { status: 400 });
    }

    if (providerKey !== "booking") {
      return NextResponse.json(
        { error: "Booking acknowledgement is currently available only for Booking.com through Channex." },
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

    const { data: revisionRow, error: revisionError } = await supabase
      .from("channel_booking_revisions")
      .select("id,family_id,provider_code,external_revision_id,import_status,ack_status,linked_booking_id")
      .eq("id", channelBookingRevisionId)
      .eq("family_id", familyId)
      .eq("provider_code", "channex")
      .maybeSingle();

    if (revisionError) throw revisionError;
    if (!revisionRow) {
      return NextResponse.json({ error: "Booking revision not found for this selected property." }, { status: 404 });
    }

    const importStatus = asStringOrNull(revisionRow.import_status) ?? "preview";
    const ackStatus = asStringOrNull(revisionRow.ack_status) ?? "not_acknowledged";
    const linkedBookingId = asStringOrNull(revisionRow.linked_booking_id);
    const externalRevisionId = asStringOrNull(revisionRow.external_revision_id);

    if (!["imported", "modified_applied", "cancelled_applied"].includes(importStatus)) {
      return NextResponse.json({ error: "Acknowledge only after successful import/apply.", status: importStatus }, { status: 409 });
    }
    if (ackStatus !== "not_acknowledged") {
      return NextResponse.json({ error: `This revision is already ${ackStatus}.`, status: ackStatus }, { status: 409 });
    }
    if (!linkedBookingId) {
      return NextResponse.json({ error: "A linked Famlo booking is required before acknowledgement." }, { status: 409 });
    }
    if (!externalRevisionId) {
      return NextResponse.json({ error: "A Channex feed revision id is required before acknowledgement." }, { status: 409 });
    }

    return acknowledgeRevision(buildForwardedRequest(request, channelBookingRevisionId));
  } catch (error) {
    console.error("[host.pro.channel.channex.operator.bookings.acknowledge] failed:", error);
    return NextResponse.json(
      {
        ok: false,
        status: "failed",
        message: error instanceof Error ? error.message : "Unable to acknowledge this Booking.com revision.",
      },
      { status: 500 }
    );
  }
}
