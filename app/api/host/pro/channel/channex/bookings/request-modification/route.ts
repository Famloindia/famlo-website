import { NextRequest, NextResponse } from "next/server";

import { autoProcessPendingChannexFeedRevisions } from "@/lib/channex-booking-auto-apply";
import { pollChannexBookingFeedForFamily } from "@/lib/channex-booking-feed-sync";
import { updateChannexBookingViaCrs } from "@/lib/channel-providers/channex/client";
import { ensureChannexMutationAllowed } from "@/lib/channel-providers/channex/mutation-guard";
import { resolveAuthorizedHostResource } from "@/lib/host-access";
import { createAdminSupabaseClient } from "@/lib/supabase";

type RequestModificationBody = {
  bookingId?: string;
  startDate?: string;
  endDate?: string;
  stayUnitId?: string;
  totalAmount?: number | string;
};

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

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function normalizeStatus(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeDateOnly(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null;
}

function enumerateStayDates(startDate: string, endDateExclusive: string): string[] {
  const dates: string[] = [];
  const cursor = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDateExclusive}T00:00:00.000Z`);
  while (cursor < end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

function distributeNightlyAmounts(stayDates: string[], totalAmount: number): Record<string, string> {
  if (stayDates.length === 0) return {};
  const cents = Math.round(totalAmount * 100);
  const base = Math.floor(cents / stayDates.length);
  let remainder = cents - base * stayDates.length;
  const nightly: Record<string, string> = {};
  for (const date of stayDates) {
    const centsForNight = base + (remainder > 0 ? 1 : 0);
    if (remainder > 0) remainder -= 1;
    nightly[date] = (centsForNight / 100).toFixed(2);
  }
  return nightly;
}

async function logModificationRequest(input: {
  supabase: ReturnType<typeof createAdminSupabaseClient>;
  familyId: string;
  status: "success" | "failed";
  message: string;
  payload: Record<string, unknown>;
}): Promise<void> {
  const { error } = await input.supabase.from("channel_sync_logs").insert({
    family_id: input.familyId,
    provider_code: "channex",
    action: "request_booking_modification_crs",
    status: input.status,
    message: input.message,
    payload: input.payload,
  } as never);

  if (error) {
    const message = String(error.message ?? "");
    if (!/relation|does not exist|schema cache/i.test(message)) {
      console.error("[host.pro.channel.channex.bookings.request-modification] log failed:", error);
    }
  }
}

async function loadLocalModificationState(input: {
  supabase: ReturnType<typeof createAdminSupabaseClient>;
  bookingId: string;
}): Promise<{
  bookingStatus: string | null;
  bookingStartDate: string | null;
  bookingEndDate: string | null;
  bookingStayUnitId: string | null;
  importStatus: string | null;
  ackStatus: string | null;
}> {
  const [{ data: bookingRow }, { data: revisionRow }] = await Promise.all([
    input.supabase
      .from("bookings_v2")
      .select("status,start_date,end_date,stay_unit_id,pricing_snapshot")
      .eq("id", input.bookingId)
      .maybeSingle(),
    input.supabase
      .from("channel_booking_revisions")
      .select("import_status,ack_status")
      .eq("linked_booking_id", input.bookingId)
      .eq("provider_code", "channex")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const pricingSnapshot = asObject(bookingRow?.pricing_snapshot) ?? {};
  return {
    bookingStatus: asStringOrNull(bookingRow?.status),
    bookingStartDate: asStringOrNull(bookingRow?.start_date),
    bookingEndDate: asStringOrNull(bookingRow?.end_date),
    bookingStayUnitId: asStringOrNull(bookingRow?.stay_unit_id) ?? asStringOrNull(pricingSnapshot.stay_unit_id),
    importStatus: asStringOrNull(revisionRow?.import_status),
    ackStatus: asStringOrNull(revisionRow?.ack_status),
  };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = (await request.json()) as RequestModificationBody;
    const bookingId = asString(body.bookingId);
    const requestedStartDate = normalizeDateOnly(asStringOrNull(body.startDate));
    const requestedEndDate = normalizeDateOnly(asStringOrNull(body.endDate));
    const requestedStayUnitId = asString(body.stayUnitId);
    const requestedTotalAmount = asNumberOrNull(body.totalAmount);

    if (!bookingId || !requestedStartDate || !requestedEndDate || !requestedStayUnitId || requestedTotalAmount == null) {
      return NextResponse.json(
        { error: "bookingId, startDate, endDate, stayUnitId, and totalAmount are required." },
        { status: 400 }
      );
    }
    if (requestedEndDate <= requestedStartDate) {
      return NextResponse.json({ error: "Checkout date must be after check-in date." }, { status: 409 });
    }
    if (requestedTotalAmount <= 0) {
      return NextResponse.json({ error: "Total amount must be greater than zero." }, { status: 409 });
    }

    const supabase = createAdminSupabaseClient();

    const { data: bookingRow, error: bookingError } = await supabase
      .from("bookings_v2")
      .select("id,host_id,status,stay_unit_id,start_date,end_date,pricing_snapshot,total_price")
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
      return NextResponse.json({ error: "Cancelled OTA bookings cannot be modified." }, { status: 409 });
    }

    const pricingSnapshot = asObject(bookingRow.pricing_snapshot) ?? {};
    if (asStringOrNull(pricingSnapshot.channel_provider) !== "channex") {
      return NextResponse.json({ error: "This route only supports OTA bookings connected through Channex." }, { status: 409 });
    }

    const externalBookingId = asStringOrNull(pricingSnapshot.channel_external_booking_id);
    const currentStayUnitId = asStringOrNull(bookingRow.stay_unit_id) ?? asStringOrNull(pricingSnapshot.stay_unit_id);

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
      action: "request_booking_modification_crs",
      route: "/api/host/pro/channel/channex/bookings/request-modification",
    });
    if (blockedMutation) return blockedMutation;

    const rawPayload = asObject(revisionRow.raw_payload) ?? {};
    const attributes = asObject(rawPayload.attributes);
    const relationships = asObject(rawPayload.relationships);
    const relationshipData = asObject(relationships?.data);
    const relationshipBooking = asObject(relationshipData?.booking);

    const channexBookingId =
      asStringOrNull(attributes?.booking_id) ??
      asStringOrNull(relationshipBooking?.id) ??
      asStringOrNull(rawPayload.booking_id);
    if (!channexBookingId) {
      return NextResponse.json({ error: "This OTA booking is missing the Channex booking id needed for CRS modification." }, { status: 409 });
    }

    const propertyId = asStringOrNull(attributes?.property_id);
    const otaName = asStringOrNull(attributes?.ota_name);
    if (!propertyId || !otaName) {
      return NextResponse.json({ error: "The stored Channex booking payload is missing required CRS booking fields." }, { status: 409 });
    }

    const rooms = asArray(attributes?.rooms);
    if (rooms.length !== 1) {
      return NextResponse.json({ error: "This OTA modification flow currently supports only single-room bookings." }, { status: 409 });
    }
    const currentRoom = asObject(rooms[0]);
    if (!currentRoom) {
      return NextResponse.json({ error: "Stored Channex room payload is missing." }, { status: 409 });
    }

    const { data: roomMappingRow, error: roomMappingError } = await supabase
      .from("channel_room_mappings")
      .select("stay_unit_id,external_room_type_id")
      .eq("family_id", familyId)
      .eq("provider_code", "channex")
      .eq("stay_unit_id", requestedStayUnitId)
      .maybeSingle();
    if (roomMappingError) throw roomMappingError;

    const externalRoomTypeId = asStringOrNull(roomMappingRow?.external_room_type_id);
    if (!externalRoomTypeId) {
      return NextResponse.json({ error: "Selected room is not mapped to a Channex room type." }, { status: 409 });
    }

    const { data: ratePlanRow, error: ratePlanError } = await supabase
      .from("channel_rate_plans")
      .select("stay_unit_id,external_rate_plan_id")
      .eq("family_id", familyId)
      .eq("provider_code", "channex")
      .eq("stay_unit_id", requestedStayUnitId)
      .maybeSingle();
    if (ratePlanError) throw ratePlanError;

    const externalRatePlanId = asStringOrNull(ratePlanRow?.external_rate_plan_id);
    if (!externalRatePlanId) {
      return NextResponse.json({ error: "Selected room is not mapped to a Channex rate plan." }, { status: 409 });
    }

    const stayDates = enumerateStayDates(requestedStartDate, requestedEndDate);
    if (stayDates.length === 0) {
      return NextResponse.json({ error: "Requested OTA modification has no bookable nights." }, { status: 409 });
    }

    const currency = asStringOrNull(attributes?.currency) ?? "INR";
    const nextRoom: Record<string, unknown> = {
      ...currentRoom,
      room_type_id: externalRoomTypeId,
      rate_plan_id: externalRatePlanId,
      checkin_date: requestedStartDate,
      checkout_date: requestedEndDate,
      amount: requestedTotalAmount.toFixed(2),
      days: distributeNightlyAmounts(stayDates, requestedTotalAmount),
    };

    const bookingPayload: Record<string, unknown> = {
      status: "modified",
      property_id: propertyId,
      ota_reservation_code: asStringOrNull(attributes?.ota_reservation_code),
      ota_name: otaName,
      arrival_date: requestedStartDate,
      departure_date: requestedEndDate,
      arrival_hour: asStringOrNull(attributes?.arrival_hour),
      services: asArray(attributes?.services),
      deposits: asArray(attributes?.deposits),
      payment_collect: attributes?.payment_collect ?? null,
      payment_type: attributes?.payment_type ?? null,
      currency,
      amount: requestedTotalAmount.toFixed(2),
      ota_commission: attributes?.ota_commission ?? null,
      notes: attributes?.notes ?? null,
      meta: attributes?.meta ?? null,
      customer: asObject(attributes?.customer),
      rooms: [nextRoom],
      guarantee: attributes?.guarantee ?? null,
      occupancy: asObject(attributes?.occupancy),
      secondary_ota: attributes?.secondary_ota ?? null,
    };

    const channexResult = await updateChannexBookingViaCrs({
      bookingId: channexBookingId,
      booking: bookingPayload,
    });

    if (!channexResult.ok) {
      await logModificationRequest({
        supabase,
        familyId,
        status: "failed",
        message: channexResult.message,
        payload: {
          booking_id: bookingId,
          external_booking_id: externalBookingId,
          channex_booking_id: channexBookingId,
          revision_id: revisionRow.id,
          requested_start_date: requestedStartDate,
          requested_end_date: requestedEndDate,
          requested_stay_unit_id: requestedStayUnitId,
          current_stay_unit_id: currentStayUnitId,
          requested_total_amount: requestedTotalAmount,
          http_status: channexResult.httpStatus,
          endpoint: channexResult.endpoint,
        },
      });

      return NextResponse.json(
        {
          ok: false,
          error: channexResult.message,
          status: "channex_modification_failed",
        },
        { status: channexResult.httpStatus && channexResult.httpStatus >= 400 ? channexResult.httpStatus : 502 }
      );
    }

    await logModificationRequest({
      supabase,
      familyId,
      status: "success",
      message: "Sent OTA booking modification request to Channex Booking CRS.",
      payload: {
        booking_id: bookingId,
        external_booking_id: externalBookingId,
        channex_booking_id: channexBookingId,
        channex_unique_id: channexResult.uniqueId,
        channex_revision_id: channexResult.revisionId,
        channex_status: channexResult.status,
        requested_start_date: requestedStartDate,
        requested_end_date: requestedEndDate,
        requested_stay_unit_id: requestedStayUnitId,
        requested_total_amount: requestedTotalAmount,
        endpoint: channexResult.endpoint,
        http_status: channexResult.httpStatus,
      },
    });

    const syncAttempts = [0, 1500, 3000];
    for (const waitMs of syncAttempts) {
      if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));

      try {
        await pollChannexBookingFeedForFamily({
          supabase,
          familyId,
          action: "host_requested_ota_booking_modification",
        });
        await autoProcessPendingChannexFeedRevisions({
          supabase,
          familyId,
        });
      } catch (error) {
        console.error("[host.pro.channel.channex.bookings.request-modification] sync follow-up failed:", error);
      }

      const localState = await loadLocalModificationState({
        supabase,
        bookingId,
      });
      const locallyUpdated =
        localState.bookingStartDate === requestedStartDate &&
        localState.bookingEndDate === requestedEndDate &&
        localState.bookingStayUnitId === requestedStayUnitId;
      const modificationApplied = normalizeStatus(localState.importStatus) === "modified_applied";
      const acknowledged = normalizeStatus(localState.ackStatus) === "acknowledged";

      if (locallyUpdated && modificationApplied) {
        return NextResponse.json(
          {
            ok: true,
            status: acknowledged ? "modified_synced" : "modified_applied_waiting_ack",
            message: acknowledged
              ? "OTA booking modification reached Channex and synced back into Famlo."
              : "OTA booking modification reached Channex and was applied in Famlo. Acknowledgement is still pending.",
          },
          { status: 200 }
        );
      }
    }

    return NextResponse.json(
      {
        ok: true,
        status: "modification_requested",
        message: "Modification request was sent to Channex. Famlo is waiting for the modification revision feed to confirm it.",
      },
      { status: 202 }
    );
  } catch (error) {
    console.error("[host.pro.channel.channex.bookings.request-modification] failed:", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unable to request OTA booking modification through Channex.",
      },
      { status: 500 }
    );
  }
}
