import { NextResponse } from "next/server";

import { assessAcknowledgementEligibility } from "@/lib/channex/booking-acknowledgement";
import { acknowledgeChannexBookingRevision, getChannexConfigSummary } from "@/lib/channel-providers/channex/client";
import { ensureChannexMutationAllowed } from "@/lib/channel-providers/channex/mutation-guard";
import { loadHostProAccess } from "@/lib/host-pro-access";
import { resolveAuthorizedHostResource } from "@/lib/host-access";
import { createAdminSupabaseClient } from "@/lib/supabase";

type AcknowledgeBody = {
  channelBookingRevisionId?: string;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asStringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

async function logAcknowledgeResult(input: {
  supabase: ReturnType<typeof createAdminSupabaseClient>;
  familyId: string;
  status: "success" | "failed";
  message: string;
  payload: Record<string, unknown>;
}): Promise<void> {
  const { error } = await input.supabase.from("channel_sync_logs").insert({
    family_id: input.familyId,
    provider_code: "channex",
    action: "acknowledge_booking_revision",
    status: input.status,
    message: input.message,
    payload: input.payload,
  } as never);

  if (error) {
    const message = String(error.message ?? "");
    if (!/relation|does not exist|schema cache/i.test(message)) {
      console.error("[host.pro.channel.channex.bookings.acknowledge] log failed:", error);
    }
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = (await request.json()) as AcknowledgeBody;
    const channelBookingRevisionId = asString(body.channelBookingRevisionId);

    if (!channelBookingRevisionId) {
      return NextResponse.json({ error: "channelBookingRevisionId is required." }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();
    const { data: revisionRow, error: revisionError } = await supabase
      .from("channel_booking_revisions")
      .select("id,family_id,provider_code,external_booking_id,external_revision_id,source,import_status,ack_status,linked_booking_id,raw_payload")
      .eq("id", channelBookingRevisionId)
      .eq("provider_code", "channex")
      .maybeSingle();

    if (revisionError) throw revisionError;
    if (!revisionRow) {
      return NextResponse.json({ error: "Booking preview not found." }, { status: 404 });
    }

    const familyId = asString(revisionRow.family_id);
    if (!familyId) {
      return NextResponse.json({ error: "Booking preview is missing family scope." }, { status: 409 });
    }

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
      action: "acknowledge_booking_revision",
      route: "/api/host/pro/channel/channex/bookings/acknowledge",
    });
    if (blockedMutation) return blockedMutation;

    const config = getChannexConfigSummary();
    const importStatus = asStringOrNull(revisionRow.import_status) ?? "preview";
    const ackStatus = asStringOrNull(revisionRow.ack_status) ?? "not_acknowledged";
    const linkedBookingId = asStringOrNull(revisionRow.linked_booking_id);
    const externalRevisionId = asStringOrNull(revisionRow.external_revision_id);
    const source = asStringOrNull(revisionRow.source) ?? "booking_revision_feed";
    const externalBookingId = asStringOrNull(revisionRow.external_booking_id);

    const eligibility = assessAcknowledgementEligibility({
      importStatus,
      ackStatus,
      linkedBookingId,
      externalRevisionId,
      source,
    });
    if (!eligibility.ok && eligibility.state !== "missing_revision_id") {
      return NextResponse.json({ error: eligibility.message, status: eligibility.state }, { status: eligibility.status });
    }

    const { data: linkedBooking, error: linkedBookingError } = await supabase
      .from("bookings_v2")
      .select("id,host_id")
      .eq("id", linkedBookingId)
      .maybeSingle();

    if (linkedBookingError) throw linkedBookingError;
    if (!linkedBooking?.id) {
      return NextResponse.json({ error: "Linked Famlo booking no longer exists." }, { status: 409 });
    }

    const linkedHostId = asStringOrNull(linkedBooking.host_id);
    if (linkedHostId) {
      const { data: hostRow, error: hostError } = await supabase
        .from("hosts")
        .select("legacy_family_id")
        .eq("id", linkedHostId)
        .maybeSingle();
      if (hostError) throw hostError;
      const linkedFamilyId = asStringOrNull(hostRow?.legacy_family_id);
      if (linkedFamilyId && linkedFamilyId !== familyId) {
        return NextResponse.json({ error: "Linked Famlo booking does not belong to this property." }, { status: 409 });
      }
    }

    if (!eligibility.ok) {
      return NextResponse.json(
        {
          ok: false,
          status: "acknowledgement_requires_revision_id",
          message: eligibility.message,
        },
        { status: eligibility.status }
      );
    }

    const result = await acknowledgeChannexBookingRevision(externalRevisionId as string);
    if (!result.ok) {
      await logAcknowledgeResult({
        supabase,
        familyId,
        status: "failed",
        message: result.message,
        payload: {
          environment: result.environment,
          channel_booking_revision_id: channelBookingRevisionId,
          external_booking_id: externalBookingId,
          external_revision_id: externalRevisionId,
          linked_booking_id: linkedBookingId,
          endpoint: result.endpoint,
          http_status: result.httpStatus,
        },
      });

      return NextResponse.json(
        {
          ok: false,
          error: result.message,
        },
        { status: result.httpStatus && result.httpStatus >= 400 ? result.httpStatus : 502 }
      );
    }

    const acknowledgedAt = new Date().toISOString();
    const rawPayload =
      revisionRow.raw_payload && typeof revisionRow.raw_payload === "object" && !Array.isArray(revisionRow.raw_payload)
        ? (revisionRow.raw_payload as Record<string, unknown>)
        : {};

    const { error: updateError } = await supabase
      .from("channel_booking_revisions")
      .update({
        ack_status: "acknowledged",
        raw_payload: {
          ...rawPayload,
          acknowledged_at: acknowledgedAt,
          acknowledged_via: "manual_host_route",
        },
        updated_at: acknowledgedAt,
      } as never)
      .eq("id", channelBookingRevisionId);

    if (updateError) throw updateError;

    await logAcknowledgeResult({
      supabase,
      familyId,
      status: "success",
      message: "Acknowledged imported Channex booking revision after successful Famlo import.",
      payload: {
        environment: result.environment,
        channel_booking_revision_id: channelBookingRevisionId,
        external_booking_id: externalBookingId,
        external_revision_id: externalRevisionId,
        linked_booking_id: linkedBookingId,
        endpoint: result.endpoint,
        http_status: result.httpStatus,
        acknowledged_at: acknowledgedAt,
        config_environment: config.environment,
      },
    });

    return NextResponse.json(
      {
        ok: true,
        status: "acknowledged",
        message: "Acknowledged this Channex booking revision after successful Famlo import.",
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("[host.pro.channel.channex.bookings.acknowledge] failed:", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unable to acknowledge this Channex booking revision.",
      },
      { status: 500 }
    );
  }
}
