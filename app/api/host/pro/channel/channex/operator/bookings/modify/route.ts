import { NextResponse } from "next/server";

import { POST as applyModification } from "@/app/api/host/pro/channel/channex/bookings/apply-modification/route";
import {
  getChannelProviderCapabilities,
  resolveProviderFromRevision,
} from "@/lib/channel-providers/provider-capabilities";
import { getChannelProviderDefinition } from "@/lib/channel-providers/provider-registry";
import { isChannelProviderKey } from "@/lib/channel-setup-state";
import { resolveAuthorizedHostResource } from "@/lib/host-access";
import { loadHostProAccess } from "@/lib/host-pro-access";
import { createAdminSupabaseClient } from "@/lib/supabase";

type OperatorBookingModifyBody = {
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
    const body = (await request.json()) as OperatorBookingModifyBody;
    const familyId = asString(body.familyId);
    const providerKey = asString(body.providerKey) || "booking";
    const channelBookingRevisionId = asString(body.channelBookingRevisionId);

    if (!familyId || !channelBookingRevisionId) {
      return NextResponse.json({ error: "familyId and channelBookingRevisionId are required." }, { status: 400 });
    }

    if (!isChannelProviderKey(providerKey)) {
      return NextResponse.json({ error: "providerKey is invalid." }, { status: 400 });
    }

    const capabilities = getChannelProviderCapabilities(providerKey);
    if (!capabilities.supportsModificationIngest) {
      return NextResponse.json(
        {
          error: "This provider does not currently support modification apply in Famlo.",
          providerStatus: capabilities.displayStatus,
        },
        { status: 409 }
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
      .select("id,family_id,provider_code,ota_provider_code,ota_name,status,import_status,ack_status,linked_booking_id")
      .eq("id", channelBookingRevisionId)
      .eq("family_id", familyId)
      .eq("provider_code", "channex")
      .maybeSingle();

    if (revisionError) throw revisionError;
    if (!revisionRow) {
      return NextResponse.json({ error: "Booking modification revision not found for this selected property." }, { status: 404 });
    }

    const revisionProvider = resolveProviderFromRevision({
      otaProviderCode: asStringOrNull((revisionRow as Record<string, unknown>).ota_provider_code),
      otaName: asStringOrNull((revisionRow as Record<string, unknown>).ota_name),
    });
    if (revisionProvider && revisionProvider !== providerKey) {
      return NextResponse.json(
        {
          error: `This revision belongs to ${getChannelProviderDefinition(revisionProvider).displayName}, not ${getChannelProviderDefinition(providerKey).displayName}.`,
          status: "provider_mismatch",
        },
        { status: 409 }
      );
    }

    const revisionStatus = asStringOrNull(revisionRow.status)?.toLowerCase() ?? "";
    const importStatus = asStringOrNull(revisionRow.import_status) ?? "preview";
    const linkedBookingId = asStringOrNull(revisionRow.linked_booking_id);

    if (revisionStatus !== "modified") {
      return NextResponse.json({ error: "Only modified Channex revisions can use this modification path.", status: revisionStatus }, { status: 409 });
    }
    if (!linkedBookingId) {
      return NextResponse.json({ error: "A linked Famlo booking is required before applying modification." }, { status: 409 });
    }
    if (!["modified_pending_review", "modified_applied"].includes(importStatus)) {
      return NextResponse.json({ error: "This revision is not ready for modification apply.", status: importStatus }, { status: 409 });
    }

    return applyModification(buildForwardedRequest(request, channelBookingRevisionId));
  } catch (error) {
    console.error("[host.pro.channel.channex.operator.bookings.modify] failed:", error);
    return NextResponse.json(
      {
        ok: false,
        status: "failed",
        message: error instanceof Error ? error.message : "Unable to apply this Channex modification.",
      },
      { status: 500 }
    );
  }
}
