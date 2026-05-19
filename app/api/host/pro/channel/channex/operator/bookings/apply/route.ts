import { NextResponse } from "next/server";

import { POST as applyImportPreview } from "@/app/api/host/pro/channel/channex/bookings/import-preview/route";
import {
  getChannelProviderCapabilities,
  resolveProviderFromRevision,
} from "@/lib/channel-providers/provider-capabilities";
import { getChannelProviderDefinition } from "@/lib/channel-providers/provider-registry";
import { isChannelProviderKey } from "@/lib/channel-setup-state";
import { resolveAuthorizedHostResource } from "@/lib/host-access";
import { loadHostProAccess } from "@/lib/host-pro-access";
import { createAdminSupabaseClient } from "@/lib/supabase";

type OperatorBookingApplyBody = {
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

function buildForwardedRequest(request: Request, familyId: string, channelBookingRevisionId: string): Request {
  const headers = new Headers(request.headers);
  headers.set("Content-Type", "application/json");

  return new Request(request.url, {
    method: "POST",
    headers,
    body: JSON.stringify({ familyId, channelBookingRevisionId }),
  });
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = (await request.json()) as OperatorBookingApplyBody;
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
    if (!capabilities.supportsBookingIngest) {
      return NextResponse.json(
        {
          error: "This provider does not currently support booking import apply in Famlo.",
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
      .select("id,family_id,provider_code,ota_provider_code,ota_name,external_room_type_id,status,import_status,ack_status")
      .eq("id", channelBookingRevisionId)
      .eq("family_id", familyId)
      .eq("provider_code", "channex")
      .maybeSingle();

    if (revisionError) throw revisionError;
    if (!revisionRow) {
      return NextResponse.json({ error: "Booking preview not found for this selected property." }, { status: 404 });
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

    const importStatus = asStringOrNull(revisionRow.import_status) ?? "preview";
    const ackStatus = asStringOrNull(revisionRow.ack_status) ?? "not_acknowledged";
    const revisionStatus = asStringOrNull(revisionRow.status)?.toLowerCase() ?? "";
    const externalRoomTypeId = asStringOrNull(revisionRow.external_room_type_id);

    if (!["preview", "failed"].includes(importStatus)) {
      return NextResponse.json({ error: `This preview is already ${importStatus}.`, status: importStatus }, { status: 409 });
    }
    if (ackStatus !== "not_acknowledged") {
      return NextResponse.json({ error: "Acknowledged revisions cannot be imported again.", status: ackStatus }, { status: 409 });
    }
    if (revisionStatus === "modified") {
      return NextResponse.json({ error: "Modification revisions remain manual in this phase." }, { status: 409 });
    }
    if (revisionStatus === "cancelled") {
      return NextResponse.json({ error: "Cancelled revisions must use the cancellation apply path, not new booking import." }, { status: 409 });
    }
    if (!externalRoomTypeId) {
      return NextResponse.json({ error: "Cannot import without an external room type id." }, { status: 409 });
    }

    const { data: roomMappingRow, error: roomMappingError } = await supabase
      .from("channel_room_mappings")
      .select("stay_unit_id")
      .eq("family_id", familyId)
      .eq("provider_code", "channex")
      .eq("external_room_type_id", externalRoomTypeId)
      .maybeSingle();

    if (roomMappingError) throw roomMappingError;
    if (!roomMappingRow?.stay_unit_id) {
      return NextResponse.json({ error: "Cannot import until this provider room is mapped to a Famlo room." }, { status: 409 });
    }

    return applyImportPreview(buildForwardedRequest(request, familyId, channelBookingRevisionId));
  } catch (error) {
    console.error("[host.pro.channel.channex.operator.bookings.apply] failed:", error);
    return NextResponse.json(
      {
        ok: false,
        status: "failed",
        message: error instanceof Error ? error.message : "Unable to apply this Channex preview import.",
      },
      { status: 500 }
    );
  }
}
