import { NextResponse } from "next/server";

import {
  getChannelProviderCapabilities,
  resolveChannelStorageProviderCode,
  resolveProviderFromRevision,
} from "@/lib/channel-providers/provider-capabilities";
import { getChannelProviderDefinition } from "@/lib/channel-providers/provider-registry";
import { isChannelProviderKey } from "@/lib/channel-setup-state";
import { resolveAuthorizedHostResource } from "@/lib/host-access";
import { loadHostProAccess } from "@/lib/host-pro-access";
import { createAdminSupabaseClient } from "@/lib/supabase";

type OperatorBookingPreviewBody = {
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

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = (await request.json()) as OperatorBookingPreviewBody;
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
          error: "This provider does not currently support booking import preview in Famlo.",
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
      .select("id,family_id,provider_code,ota_provider_code,external_booking_id,external_revision_id,external_room_type_id,external_rate_plan_id,ota_name,status,arrival_date,departure_date,guest_name,amount,currency,payment_collect,source,raw_payload,import_status,ack_status,linked_booking_id,updated_at")
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
      otaName: asStringOrNull(revisionRow.ota_name),
    });
    const storageProviderCode = resolveChannelStorageProviderCode(revisionProvider ?? providerKey);
    if (revisionProvider && revisionProvider !== providerKey) {
      return NextResponse.json(
        {
          error: `This revision belongs to ${getChannelProviderDefinition(revisionProvider).displayName}, not ${getChannelProviderDefinition(providerKey).displayName}.`,
          status: "provider_mismatch",
        },
        { status: 409 }
      );
    }

    const externalRoomTypeId = asStringOrNull(revisionRow.external_room_type_id);
    const externalRatePlanId = asStringOrNull(revisionRow.external_rate_plan_id);
    const importStatus = asStringOrNull(revisionRow.import_status) ?? "preview";
    const ackStatus = asStringOrNull(revisionRow.ack_status) ?? "not_acknowledged";
    const revisionStatus = asStringOrNull(revisionRow.status)?.toLowerCase() ?? "unknown";
    const source = asStringOrNull(revisionRow.source) ?? "booking_revision_feed";

    const { data: roomMappingRow, error: roomMappingError } = externalRoomTypeId
      ? await supabase
          .from("channel_room_mappings")
          .select("stay_unit_id,external_room_type_id")
          .eq("family_id", familyId)
          .eq("provider_code", storageProviderCode)
          .eq("external_room_type_id", externalRoomTypeId)
          .maybeSingle()
      : { data: null, error: null };
    if (roomMappingError) throw roomMappingError;

    const blockers = [
      !externalRoomTypeId ? "Missing external room type id" : null,
      !roomMappingRow?.stay_unit_id ? "Missing Famlo room mapping for this provider room" : null,
      revisionStatus === "modified" ? "Modification revisions remain manual in this phase" : null,
      revisionStatus === "cancelled" && !asStringOrNull(revisionRow.linked_booking_id)
        ? "Cancellation needs an already linked Famlo booking"
        : null,
      source === "booking_list_api" && !asStringOrNull(revisionRow.external_revision_id)
        ? "Booking List preview cannot be acknowledged until a feed revision id exists"
        : null,
    ].filter((item): item is string => Boolean(item));

    return NextResponse.json({
      ok: true,
      status: blockers.length > 0 ? "needs_review" : "ready_for_operator_action",
      message:
        blockers.length > 0
          ? "Preview loaded with blockers. Do not apply until blockers are resolved."
          : "Preview is scoped to the selected property and ready for operator action.",
      revision: {
        id: asString(revisionRow.id),
        externalBookingId: asStringOrNull(revisionRow.external_booking_id),
        externalRevisionId: asStringOrNull(revisionRow.external_revision_id),
        status: revisionStatus,
        otaName: asStringOrNull(revisionRow.ota_name),
        arrivalDate: asStringOrNull(revisionRow.arrival_date),
        departureDate: asStringOrNull(revisionRow.departure_date),
        guestName: asStringOrNull(revisionRow.guest_name),
        externalRoomTypeId,
        externalRatePlanId,
        amount: revisionRow.amount,
        currency: asStringOrNull(revisionRow.currency),
        paymentCollect: asStringOrNull(revisionRow.payment_collect),
        source,
        importStatus,
        ackStatus,
        linkedBookingId: asStringOrNull(revisionRow.linked_booking_id),
        updatedAt: asStringOrNull(revisionRow.updated_at),
        roomMappingStatus: roomMappingRow?.stay_unit_id ? "matched" : "missing",
        stayUnitId: asStringOrNull(roomMappingRow?.stay_unit_id),
        rawPayload: asObject(revisionRow.raw_payload),
        normalizedProvider: revisionProvider ?? providerKey,
      },
      blockers,
    });
  } catch (error) {
    console.error("[host.pro.channel.channex.operator.bookings.preview] failed:", error);
    return NextResponse.json(
      {
        ok: false,
        status: "failed",
        message: error instanceof Error ? error.message : "Unable to preview this Channex revision.",
      },
      { status: 500 }
    );
  }
}
