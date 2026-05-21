import { NextResponse } from "next/server";

import { resolveNormalizedOtaSourceChannel } from "@/lib/channel-booking-normalization";
import { processFinanceEventContract } from "@/lib/finance/folio-line-writer";
import { loadHostProAccess } from "@/lib/host-pro-access";
import { resolveAuthorizedHostResource } from "@/lib/host-access";
import { createAdminSupabaseClient } from "@/lib/supabase";

type ApplyCancellationBody = {
  channelBookingRevisionId?: string;
};

type JsonRecord = Record<string, unknown>;

export function assessCancellationApplyEligibility(input: {
  revisionStatus: string | null;
  linkedBookingId: string | null;
}): { ok: boolean; status: number; message: string; state: string } {
  const revisionStatus = input.revisionStatus?.toLowerCase() ?? "";
  if (revisionStatus !== "cancelled") {
    return {
      ok: false,
      status: 409,
      message: "Only real cancelled Channex revisions can be applied in this phase.",
      state: revisionStatus || "unknown",
    };
  }
  if (!input.linkedBookingId) {
    return {
      ok: false,
      status: 409,
      message: "A linked Famlo booking is required before applying a cancellation.",
      state: "missing_linked_booking",
    };
  }
  return { ok: true, status: 200, message: "Cancellation revision can be applied in Famlo.", state: "eligible" };
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asStringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asNumberOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function asObject(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function normalizeDateOnly(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const candidate = trimmed.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(candidate) ? candidate : null;
}

async function logApplyResult(input: {
  supabase: ReturnType<typeof createAdminSupabaseClient>;
  familyId: string;
  status: "success" | "failed";
  message: string;
  payload: Record<string, unknown>;
}): Promise<void> {
  const { error } = await input.supabase.from("channel_sync_logs").insert({
    family_id: input.familyId,
    provider_code: "channex",
    action: "apply_booking_cancellation",
    status: input.status,
    message: input.message,
    payload: input.payload,
  } as never);

  if (error) {
    const message = String(error.message ?? "");
    if (!/relation|does not exist|schema cache/i.test(message)) {
      console.error("[host.pro.channel.channex.bookings.apply-cancellation] log failed:", error);
    }
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  let supabase: ReturnType<typeof createAdminSupabaseClient> | null = null;
  let familyIdForLog: string | null = null;
  let revisionIdForLog: string | null = null;

  try {
    const body = (await request.json()) as ApplyCancellationBody;
    const channelBookingRevisionId = asString(body.channelBookingRevisionId);
    revisionIdForLog = channelBookingRevisionId || null;

    if (!channelBookingRevisionId) {
      return NextResponse.json({ error: "channelBookingRevisionId is required." }, { status: 400 });
    }

    supabase = createAdminSupabaseClient();

    const { data: revisionRow, error: revisionError } = await supabase
      .from("channel_booking_revisions")
      .select("id,family_id,provider_code,external_booking_id,external_revision_id,external_room_type_id,external_rate_plan_id,ota_name,status,arrival_date,departure_date,guest_name,amount,currency,payment_collect,source,raw_payload,import_status,ack_status,linked_booking_id")
      .eq("id", channelBookingRevisionId)
      .eq("provider_code", "channex")
      .maybeSingle();

    if (revisionError) throw revisionError;
    if (!revisionRow) {
      return NextResponse.json({ error: "Booking revision not found." }, { status: 404 });
    }

    const familyId = asString(revisionRow.family_id);
    familyIdForLog = familyId || null;
    if (!familyId) {
      return NextResponse.json({ error: "Booking revision is missing family scope." }, { status: 409 });
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

    const revisionStatus = asStringOrNull(revisionRow.status)?.toLowerCase() ?? "";
    const importStatus = asStringOrNull(revisionRow.import_status) ?? "preview";
    const linkedBookingId = asStringOrNull(revisionRow.linked_booking_id);
    const externalBookingId = asStringOrNull(revisionRow.external_booking_id);
    const source = asStringOrNull(revisionRow.source) ?? "booking_revision_feed";

    const eligibility = assessCancellationApplyEligibility({ revisionStatus, linkedBookingId });
    if (!eligibility.ok && eligibility.state !== "missing_linked_booking") {
      return NextResponse.json(
        { error: eligibility.message, status: revisionStatus || "unknown" },
        { status: eligibility.status }
      );
    }

    if (!eligibility.ok) {
      return NextResponse.json({ error: eligibility.message }, { status: eligibility.status });
    }

    let linkedBookingResult = await supabase
      .from("bookings_v2")
      .select("id,host_id,status,payment_status,total_price,start_date,end_date,pricing_snapshot")
      .eq("id", linkedBookingId)
      .maybeSingle();

    if (linkedBookingResult.error) throw linkedBookingResult.error;
    const linkedBooking = (linkedBookingResult.data as JsonRecord | null) ?? null;
    if (!linkedBooking?.id) {
      return NextResponse.json({ error: "Linked Famlo booking no longer exists." }, { status: 409 });
    }

    const linkedHostId = asStringOrNull(linkedBooking.host_id);
    if (!linkedHostId) {
      return NextResponse.json({ error: "Linked Famlo booking is missing host ownership." }, { status: 409 });
    }

    const { data: hostRow, error: hostLookupError } = await supabase
      .from("hosts")
      .select("legacy_family_id")
      .eq("id", linkedHostId)
      .maybeSingle();

    if (hostLookupError) throw hostLookupError;
    if (asStringOrNull(hostRow?.legacy_family_id) && asStringOrNull(hostRow?.legacy_family_id) !== familyId) {
      return NextResponse.json({ error: "Linked Famlo booking does not belong to this property." }, { status: 409 });
    }

    const now = new Date().toISOString();
    const existingStatus = asStringOrNull(linkedBooking.status)?.toLowerCase() ?? "";
    const currentPricingSnapshot = asObject(linkedBooking.pricing_snapshot);
    const arrivalDate = normalizeDateOnly(asStringOrNull(revisionRow.arrival_date)) ?? normalizeDateOnly(asStringOrNull(linkedBooking.start_date));
    const departureDate = normalizeDateOnly(asStringOrNull(revisionRow.departure_date)) ?? normalizeDateOnly(asStringOrNull(linkedBooking.end_date));
    const nextPricingSnapshot: JsonRecord = {
      ...currentPricingSnapshot,
      channel_provider: "channex",
      channel_source: source,
      channel_import_source: source,
      channel_external_booking_id: externalBookingId,
      channel_external_revision_id: asStringOrNull(revisionRow.external_revision_id),
      channel_external_room_type_id: asStringOrNull(revisionRow.external_room_type_id),
      channel_external_rate_plan_id: asStringOrNull(revisionRow.external_rate_plan_id),
      channel_booking_revision_id: channelBookingRevisionId,
      channel_last_applied_action: "cancellation",
      channel_last_applied_source: source,
      channel_last_applied_at: now,
      channel_cancelled_at: now,
      channel_cancellation: {
        external_revision_id: asStringOrNull(revisionRow.external_revision_id),
        arrival_date: arrivalDate,
        departure_date: departureDate,
        raw_payload: revisionRow.raw_payload,
      },
    };

    if (existingStatus !== "cancelled") {
      const { error: bookingUpdateError } = await supabase
        .from("bookings_v2")
        .update({
          status: "cancelled",
          payment_status: "not_required",
          source_channel: resolveNormalizedOtaSourceChannel({
            otaName: asStringOrNull(revisionRow.ota_name),
            source,
          }),
          pricing_snapshot: nextPricingSnapshot,
          updated_at: now,
        } as never)
        .eq("id", linkedBookingId);

      if (bookingUpdateError) throw bookingUpdateError;
    } else {
      const { error: bookingUpdateError } = await supabase
        .from("bookings_v2")
        .update({
          payment_status: "not_required",
          source_channel: resolveNormalizedOtaSourceChannel({
            otaName: asStringOrNull(revisionRow.ota_name),
            source,
          }),
          pricing_snapshot: nextPricingSnapshot,
          updated_at: now,
        } as never)
        .eq("id", linkedBookingId);

      if (bookingUpdateError) throw bookingUpdateError;
    }

    const nextImportStatus = importStatus === "cancelled_applied" ? "cancelled_applied" : "cancelled_applied";
    const { error: revisionUpdateError } = await supabase
      .from("channel_booking_revisions")
      .update({
        import_status: nextImportStatus,
        ack_status: "not_acknowledged",
        linked_booking_id: linkedBookingId,
        updated_at: now,
      } as never)
      .eq("id", channelBookingRevisionId);

    if (revisionUpdateError) throw revisionUpdateError;

    const assuredLinkedBookingId = String(linkedBookingId);

    await processFinanceEventContract(supabase, {
      bookingId: assuredLinkedBookingId,
      eventType: "OTA_BOOKING_CANCELLED",
      sourceEventId: channelBookingRevisionId,
      calculationVersion: "batch3-ota-folio-v1",
      bookingAmount: asNumberOrNull(linkedBooking.total_price) ?? undefined,
      sourceChannel: resolveNormalizedOtaSourceChannel({
        otaName: asStringOrNull(revisionRow.ota_name),
        source,
      }),
      paymentCollectMode: asStringOrNull(revisionRow.payment_collect),
      metadata: {
        source: "channex.apply_cancellation",
        external_booking_id: externalBookingId,
        external_revision_id: asStringOrNull(revisionRow.external_revision_id),
        ambiguity_reason: "ota_cancellation_financials_not_explicit",
      },
    });

    await logApplyResult({
      supabase,
      familyId,
      status: "success",
      message: "Applied Channex booking cancellation to the linked Famlo booking. Channex acknowledgement remains pending.",
      payload: {
        channel_booking_revision_id: channelBookingRevisionId,
        external_booking_id: externalBookingId,
        linked_booking_id: linkedBookingId,
        source,
        status_before: existingStatus || null,
        status_after: "cancelled",
        arrival_date: arrivalDate,
        departure_date: departureDate,
      },
    });

    return NextResponse.json(
      {
        ok: true,
        status: "cancelled_applied",
        message: "Cancellation applied to Famlo. Not acknowledged yet.",
        bookingId: linkedBookingId,
      },
      { status: 200 }
    );
  } catch (error) {
    if (supabase && familyIdForLog) {
      await logApplyResult({
        supabase,
        familyId: familyIdForLog,
        status: "failed",
        message: error instanceof Error ? error.message : "Unable to apply this Channex booking cancellation.",
        payload: {
          channel_booking_revision_id: revisionIdForLog,
        },
      });
    }

    console.error("[host.pro.channel.channex.bookings.apply-cancellation] failed:", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unable to apply this Channex booking cancellation.",
      },
      { status: 500 }
    );
  }
}
