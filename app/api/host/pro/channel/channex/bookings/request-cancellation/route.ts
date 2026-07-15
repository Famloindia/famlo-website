import { NextRequest, NextResponse } from "next/server";

import { autoProcessPendingChannexFeedRevisions } from "@/lib/channex-booking-auto-apply";
import { pollChannexBookingFeedForFamily } from "@/lib/channex-booking-feed-sync";
import { updateChannexBookingViaCrs } from "@/lib/channel-providers/channex/client";
import { ensureChannexMutationAllowed } from "@/lib/channel-providers/channex/mutation-guard";
import { resolveAuthorizedHostResource } from "@/lib/host-access";
import { createAdminSupabaseClient } from "@/lib/supabase";

type RequestCancellationBody = {
  bookingId?: string;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asStringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function normalizeStatus(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function buildCrsCancellationPayload(rawPayload: Record<string, unknown>): {
  ok: true;
  bookingId: string;
  booking: Record<string, unknown>;
} | {
  ok: false;
  message: string;
} {
  const attributes = asObject(rawPayload.attributes);
  const relationships = asObject(rawPayload.relationships);
  const relationshipData = asObject(relationships?.data);
  const relationshipBooking = asObject(relationshipData?.booking);

  const bookingId =
    asStringOrNull(attributes?.booking_id) ??
    asStringOrNull(relationshipBooking?.id) ??
    asStringOrNull(rawPayload.booking_id);

  if (!bookingId) {
    return { ok: false, message: "This OTA booking is missing the Channex booking id needed for CRS cancellation." };
  }

  const propertyId = asStringOrNull(attributes?.property_id);
  const otaName = asStringOrNull(attributes?.ota_name);
  const arrivalDate = asStringOrNull(attributes?.arrival_date);
  const departureDate = asStringOrNull(attributes?.departure_date);

  if (!propertyId || !otaName || !arrivalDate || !departureDate) {
    return { ok: false, message: "The stored Channex booking payload is missing required CRS booking fields." };
  }

  const booking: Record<string, unknown> = {
    status: "cancelled",
    property_id: propertyId,
    ota_reservation_code: asStringOrNull(attributes?.ota_reservation_code),
    ota_name: otaName,
    arrival_date: arrivalDate,
    departure_date: departureDate,
    arrival_hour: asStringOrNull(attributes?.arrival_hour),
    services: asArray(attributes?.services),
    deposits: asArray(attributes?.deposits),
    payment_collect: attributes?.payment_collect ?? null,
    payment_type: attributes?.payment_type ?? null,
    currency: asStringOrNull(attributes?.currency),
    amount: attributes?.amount ?? null,
    ota_commission: attributes?.ota_commission ?? null,
    notes: attributes?.notes ?? null,
    meta: attributes?.meta ?? null,
    customer: asObject(attributes?.customer),
    rooms: asArray(attributes?.rooms),
    guarantee: attributes?.guarantee ?? null,
    occupancy: asObject(attributes?.occupancy),
    secondary_ota: attributes?.secondary_ota ?? null,
  };

  return {
    ok: true,
    bookingId,
    booking,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function logCancellationRequest(input: {
  supabase: ReturnType<typeof createAdminSupabaseClient>;
  familyId: string;
  status: "success" | "failed";
  message: string;
  payload: Record<string, unknown>;
}): Promise<void> {
  const { error } = await input.supabase.from("channel_sync_logs").insert({
    family_id: input.familyId,
    provider_code: "channex",
    action: "request_booking_cancellation_crs",
    status: input.status,
    message: input.message,
    payload: input.payload,
  } as never);

  if (error) {
    const message = String(error.message ?? "");
    if (!/relation|does not exist|schema cache/i.test(message)) {
      console.error("[host.pro.channel.channex.bookings.request-cancellation] log failed:", error);
    }
  }
}

async function loadLocalCancellationState(input: {
  supabase: ReturnType<typeof createAdminSupabaseClient>;
  bookingId: string;
}): Promise<{
  bookingStatus: string | null;
  revisionStatus: string | null;
  importStatus: string | null;
  ackStatus: string | null;
}> {
  const [{ data: bookingRow }, { data: revisionRow }] = await Promise.all([
    input.supabase
      .from("bookings_v2")
      .select("status")
      .eq("id", input.bookingId)
      .maybeSingle(),
    input.supabase
      .from("channel_booking_revisions")
      .select("status,import_status,ack_status")
      .eq("linked_booking_id", input.bookingId)
      .eq("provider_code", "channex")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  return {
    bookingStatus: asStringOrNull(bookingRow?.status),
    revisionStatus: asStringOrNull(revisionRow?.status),
    importStatus: asStringOrNull(revisionRow?.import_status),
    ackStatus: asStringOrNull(revisionRow?.ack_status),
  };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = (await request.json()) as RequestCancellationBody;
    const bookingId = asString(body.bookingId);

    if (!bookingId) {
      return NextResponse.json({ error: "bookingId is required." }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();

    const { data: bookingRow, error: bookingError } = await supabase
      .from("bookings_v2")
      .select("id,host_id,status,pricing_snapshot")
      .eq("id", bookingId)
      .maybeSingle();
    if (bookingError) throw bookingError;
    if (!bookingRow?.id) {
      return NextResponse.json({ error: "Booking not found." }, { status: 404 });
    }

    const hostId = asStringOrNull(bookingRow.host_id);
    if (!hostId) {
      return NextResponse.json({ error: "Booking is missing host ownership." }, { status: 409 });
    }

    const authorizedResource = await resolveAuthorizedHostResource(supabase, request, { hostId });
    if (!authorizedResource?.hostId) {
      return NextResponse.json({ error: "You do not have access to this booking." }, { status: 403 });
    }

    const currentStatus = normalizeStatus(bookingRow.status);
    if (["cancelled", "cancelled_by_user", "cancelled_by_partner", "rejected"].includes(currentStatus)) {
      return NextResponse.json(
        {
          ok: true,
          status: "already_cancelled",
          message: "This OTA booking is already cancelled in Famlo.",
        },
        { status: 200 }
      );
    }

    const pricingSnapshot = asObject(bookingRow.pricing_snapshot) ?? {};
    if (asStringOrNull(pricingSnapshot.channel_provider) !== "channex") {
      return NextResponse.json({ error: "This route only supports OTA bookings connected through Channex." }, { status: 409 });
    }

    const externalBookingId = asStringOrNull(pricingSnapshot.channel_external_booking_id);
    let revisionQuery = supabase
      .from("channel_booking_revisions")
      .select("id,family_id,external_booking_id,external_revision_id,status,import_status,ack_status,linked_booking_id,raw_payload,updated_at")
      .eq("provider_code", "channex")
      .order("updated_at", { ascending: false })
      .limit(1);

    if (externalBookingId) {
      revisionQuery = revisionQuery.eq("external_booking_id", externalBookingId);
    } else {
      revisionQuery = revisionQuery.eq("linked_booking_id", bookingId);
    }

    const { data: revisionRow, error: revisionError } = await revisionQuery.maybeSingle();
    if (revisionError) throw revisionError;
    if (!revisionRow?.id) {
      return NextResponse.json({ error: "No linked Channex booking revision was found for this OTA booking." }, { status: 409 });
    }

    const familyId = asString(revisionRow.family_id);
    if (!familyId) {
      return NextResponse.json({ error: "Channex revision is missing family scope." }, { status: 409 });
    }

    const blockedMutation = await ensureChannexMutationAllowed({
      supabase,
      familyId,
      action: "request_booking_cancellation_crs",
      route: "/api/host/pro/channel/channex/bookings/request-cancellation",
    });
    if (blockedMutation) return blockedMutation;

    const rawPayload = asObject(revisionRow.raw_payload) ?? {};
    const payloadResult = buildCrsCancellationPayload(rawPayload);
    if (!payloadResult.ok) {
      return NextResponse.json({ error: payloadResult.message }, { status: 409 });
    }

    const channexResult = await updateChannexBookingViaCrs({
      bookingId: payloadResult.bookingId,
      booking: payloadResult.booking,
    });

    if (!channexResult.ok) {
      await logCancellationRequest({
        supabase,
        familyId,
        status: "failed",
        message: channexResult.message,
        payload: {
          booking_id: bookingId,
          external_booking_id: externalBookingId,
          channex_booking_id: payloadResult.bookingId,
          revision_id: revisionRow.id,
          http_status: channexResult.httpStatus,
          endpoint: channexResult.endpoint,
        },
      });

      return NextResponse.json(
        {
          ok: false,
          error: channexResult.message,
          status: "channex_cancellation_failed",
        },
        { status: channexResult.httpStatus && channexResult.httpStatus >= 400 ? channexResult.httpStatus : 502 }
      );
    }

    await logCancellationRequest({
      supabase,
      familyId,
      status: "success",
      message: "Sent OTA booking cancellation request to Channex Booking CRS.",
      payload: {
        booking_id: bookingId,
        external_booking_id: externalBookingId,
        channex_booking_id: payloadResult.bookingId,
        channex_unique_id: channexResult.uniqueId,
        channex_revision_id: channexResult.revisionId,
        channex_status: channexResult.status,
        endpoint: channexResult.endpoint,
        http_status: channexResult.httpStatus,
      },
    });

    const syncAttempts = [0, 1500, 3000];
    for (const waitMs of syncAttempts) {
      if (waitMs > 0) {
        await sleep(waitMs);
      }

      try {
        await pollChannexBookingFeedForFamily({
          supabase,
          familyId,
          action: "host_requested_ota_booking_cancellation",
        });
        await autoProcessPendingChannexFeedRevisions({
          supabase,
          familyId,
        });
      } catch (error) {
        console.error("[host.pro.channel.channex.bookings.request-cancellation] sync follow-up failed:", error);
      }

      const localState = await loadLocalCancellationState({
        supabase,
        bookingId,
      });

      const localBookingCancelled = ["cancelled", "cancelled_by_user", "cancelled_by_partner"].includes(
        normalizeStatus(localState.bookingStatus)
      );
      const revisionCancelled = normalizeStatus(localState.importStatus) === "cancelled_applied";
      const acknowledged = normalizeStatus(localState.ackStatus) === "acknowledged";

      if (localBookingCancelled && revisionCancelled) {
        return NextResponse.json(
          {
            ok: true,
            status: acknowledged ? "cancelled_synced" : "cancelled_applied_waiting_ack",
            message: acknowledged
              ? "OTA booking cancellation reached Channex and synced back into Famlo."
              : "OTA booking cancellation reached Channex and was applied in Famlo. Acknowledgement is still pending.",
          },
          { status: 200 }
        );
      }
    }

    return NextResponse.json(
      {
        ok: true,
        status: "cancellation_requested",
        message: "Cancellation request was sent to Channex. Famlo is waiting for the cancellation revision feed to confirm it.",
      },
      { status: 202 }
    );
  } catch (error) {
    console.error("[host.pro.channel.channex.bookings.request-cancellation] failed:", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unable to request OTA booking cancellation through Channex.",
      },
      { status: 500 }
    );
  }
}
