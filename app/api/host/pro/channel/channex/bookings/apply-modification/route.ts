import { NextResponse } from "next/server";

import { loadHostProAccess } from "@/lib/host-pro-access";
import { resolveAuthorizedHostResource } from "@/lib/host-access";
import { createAdminSupabaseClient } from "@/lib/supabase";

type ApplyModificationBody = {
  channelBookingRevisionId?: string;
};

type JsonRecord = Record<string, unknown>;

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

function isMissingColumnError(error: unknown, columnName: string): boolean {
  if (!error || typeof error !== "object") return false;
  const record = error as { code?: unknown; message?: unknown };
  const code = typeof record.code === "string" ? record.code : "";
  const message = typeof record.message === "string" ? record.message : "";
  return (
    (code === "42703" && message.includes(columnName)) ||
    (message.includes(columnName) && (message.includes("schema cache") || message.includes("does not exist"))) ||
    (columnName === "stay_unit_id" && message === "")
  );
}

function normalizeDateOnly(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const candidate = trimmed.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(candidate) ? candidate : null;
}

function addUtcDays(date: string, days: number): string {
  const base = new Date(`${date}T00:00:00.000Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

function rangesOverlapExclusive(
  leftStart: string,
  leftEndExclusive: string,
  rightStart: string,
  rightEndExclusive: string
): boolean {
  return leftStart < rightEndExclusive && rightStart < leftEndExclusive;
}

function resolveStayUnitId(record: JsonRecord | null | undefined): string | null {
  const direct = asStringOrNull(record?.stay_unit_id);
  if (direct) return direct;
  return asStringOrNull(asObject(record?.pricing_snapshot).stay_unit_id);
}

function isBlockingBookingStatus(status: string | null): boolean {
  const normalized = String(status ?? "").trim().toLowerCase();
  return !["", "cancelled", "cancelled_by_user", "cancelled_by_partner", "rejected"].includes(normalized);
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
    action: "apply_booking_modification",
    status: input.status,
    message: input.message,
    payload: input.payload,
  } as never);

  if (error) {
    const message = String(error.message ?? "");
    if (!/relation|does not exist|schema cache/i.test(message)) {
      console.error("[host.pro.channel.channex.bookings.apply-modification] log failed:", error);
    }
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  let supabase: ReturnType<typeof createAdminSupabaseClient> | null = null;
  let familyIdForLog: string | null = null;
  let revisionIdForLog: string | null = null;

  try {
    const body = (await request.json()) as ApplyModificationBody;
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

    const access = await loadHostProAccess(supabase, familyId);
    if (!access.allowed) {
      return NextResponse.json({ error: "Famlo Pro is not active for this property." }, { status: 403 });
    }

    const importStatus = asStringOrNull(revisionRow.import_status) ?? "preview";
    const linkedBookingId = asStringOrNull(revisionRow.linked_booking_id);
    const externalBookingId = asStringOrNull(revisionRow.external_booking_id);
    const externalRoomTypeId = asStringOrNull(revisionRow.external_room_type_id);
    const source = asStringOrNull(revisionRow.source) ?? "booking_list_api";
    const arrivalDate = normalizeDateOnly(asStringOrNull(revisionRow.arrival_date));
    const departureDate = normalizeDateOnly(asStringOrNull(revisionRow.departure_date));
    const amountNumber = asNumberOrNull(revisionRow.amount);
    const currency = asStringOrNull(revisionRow.currency);

    if (importStatus !== "modified_pending_review") {
      return NextResponse.json(
        { error: "Only modified_pending_review revisions can be applied in this phase.", status: importStatus },
        { status: 409 }
      );
    }
    if (!linkedBookingId) {
      return NextResponse.json({ error: "A linked Famlo booking is required before applying a modification." }, { status: 409 });
    }
    if (!externalRoomTypeId || !arrivalDate || !departureDate || !externalBookingId) {
      return NextResponse.json(
        {
          error: "Revision is missing required booking, room, or date fields.",
          missingFields: [
            !externalBookingId ? "external_booking_id" : null,
            !externalRoomTypeId ? "external_room_type_id" : null,
            !arrivalDate ? "arrival_date" : null,
            !departureDate ? "departure_date" : null,
          ].filter(Boolean),
        },
        { status: 409 }
      );
    }
    if (arrivalDate >= departureDate) {
      return NextResponse.json({ error: "Revision has an invalid date range." }, { status: 409 });
    }
    if ((amountNumber != null && !currency) || (amountNumber == null && currency)) {
      return NextResponse.json({ error: "Revision amount and currency must both be present together if provided." }, { status: 409 });
    }
    if (amountNumber != null && amountNumber < 0) {
      return NextResponse.json({ error: "Revision amount must be zero or positive." }, { status: 409 });
    }

    const { data: roomMappingRow, error: roomMappingError } = await supabase
      .from("channel_room_mappings")
      .select("stay_unit_id")
      .eq("family_id", familyId)
      .eq("provider_code", "channex")
      .eq("external_room_type_id", externalRoomTypeId)
      .maybeSingle();

    if (roomMappingError) throw roomMappingError;
    const targetStayUnitId = asStringOrNull(roomMappingRow?.stay_unit_id);
    if (!targetStayUnitId) {
      return NextResponse.json({ error: "Mapped stay unit was not found for this external room type." }, { status: 409 });
    }

    const { data: stayUnitRow, error: stayUnitError } = await supabase
      .from("stay_units_v2")
      .select("id,host_id,name,is_active,legacy_family_id")
      .eq("id", targetStayUnitId)
      .maybeSingle();

    if (stayUnitError) throw stayUnitError;
    if (!stayUnitRow?.id) {
      return NextResponse.json({ error: "Resolved stay unit no longer exists." }, { status: 409 });
    }
    if (asStringOrNull(stayUnitRow.legacy_family_id) && asStringOrNull(stayUnitRow.legacy_family_id) !== familyId) {
      return NextResponse.json({ error: "Mapped stay unit does not belong to this property." }, { status: 409 });
    }

    let linkedBookingResult;
    try {
      linkedBookingResult = await supabase
        .from("bookings_v2")
        .select("id,host_id,stay_unit_id,status,payment_status,total_price,start_date,end_date,pricing_snapshot")
        .eq("id", linkedBookingId)
        .maybeSingle();
    } catch (error) {
      if (!isMissingColumnError(error, "stay_unit_id")) {
        throw error;
      }
      linkedBookingResult = await supabase
        .from("bookings_v2")
        .select("id,host_id,status,payment_status,total_price,start_date,end_date,pricing_snapshot")
        .eq("id", linkedBookingId)
        .maybeSingle();
    }

    if (linkedBookingResult.error) {
      if (!isMissingColumnError(linkedBookingResult.error, "stay_unit_id")) {
        throw linkedBookingResult.error;
      }
      linkedBookingResult = await supabase
        .from("bookings_v2")
        .select("id,host_id,status,payment_status,total_price,start_date,end_date,pricing_snapshot")
        .eq("id", linkedBookingId)
        .maybeSingle();
    }

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

    const currentPricingSnapshot = asObject(linkedBooking.pricing_snapshot);
    const currentStayUnitId = resolveStayUnitId(linkedBooking);
    const currentStartDate = normalizeDateOnly(asStringOrNull(linkedBooking.start_date));
    const currentEndDate = normalizeDateOnly(asStringOrNull(linkedBooking.end_date));
    if (!currentStartDate || !currentEndDate) {
      return NextResponse.json({ error: "Linked Famlo booking is missing a valid date range." }, { status: 409 });
    }

    let overlapResult:
      | {
          data: JsonRecord[] | null;
          error: unknown;
        }
      | undefined;

    try {
      overlapResult = await supabase
        .from("bookings_v2")
        .select("id,host_id,stay_unit_id,start_date,end_date,status,payment_status,pricing_snapshot")
        .eq("stay_unit_id", targetStayUnitId);
    } catch (error) {
      if (!isMissingColumnError(error, "stay_unit_id")) {
        throw error;
      }
      overlapResult = undefined;
    }

    if (!overlapResult || overlapResult.error) {
      overlapResult = await supabase
        .from("bookings_v2")
        .select("id,host_id,start_date,end_date,status,payment_status,pricing_snapshot")
        .eq("host_id", linkedHostId);
    }

    if (overlapResult.error) throw overlapResult.error;

    const candidateEndExclusive = departureDate;
    const overlappingRows = ((overlapResult.data ?? []) as JsonRecord[]).filter((row) => {
      const rowBookingId = asStringOrNull(row.id);
      const rowStayUnitId = resolveStayUnitId(row);
      const rowStartDate = normalizeDateOnly(asStringOrNull(row.start_date));
      const rowEndDate = normalizeDateOnly(asStringOrNull(row.end_date));

      if (!rowBookingId || rowBookingId === linkedBookingId || !rowStartDate || !rowEndDate) {
        return false;
      }
      if (!isBlockingBookingStatus(asStringOrNull(row.status))) {
        return false;
      }
      if (rowStayUnitId && rowStayUnitId !== targetStayUnitId) {
        return false;
      }

      const rowEndExclusive = rowEndDate;
      return rangesOverlapExclusive(arrivalDate, candidateEndExclusive, rowStartDate, rowEndExclusive);
    });

    if (overlappingRows.length > 0) {
      const firstOverlap = overlappingRows[0];
      const overlapMessage = "Another Famlo booking already blocks the target room/date range.";
      await logApplyResult({
        supabase,
        familyId,
        status: "failed",
        message: overlapMessage,
        payload: {
          channel_booking_revision_id: channelBookingRevisionId,
          external_booking_id: externalBookingId,
          linked_booking_id: linkedBookingId,
          target_stay_unit_id: targetStayUnitId,
          target_arrival_date: arrivalDate,
          target_departure_date: departureDate,
          conflicting_booking_id: asStringOrNull(firstOverlap.id),
          conflicting_start_date: normalizeDateOnly(asStringOrNull(firstOverlap.start_date)),
          conflicting_end_date: normalizeDateOnly(asStringOrNull(firstOverlap.end_date)),
        },
      });

      return NextResponse.json(
        {
          ok: false,
          status: "overlap_conflict",
          error: overlapMessage,
          conflict: {
            bookingId: asStringOrNull(firstOverlap.id),
            startDate: normalizeDateOnly(asStringOrNull(firstOverlap.start_date)),
            endDate: normalizeDateOnly(asStringOrNull(firstOverlap.end_date)),
          },
        },
        { status: 409 }
      );
    }

    const now = new Date().toISOString();
    const nextTotalPrice = amountNumber != null ? Math.round(amountNumber) : asNumberOrNull(linkedBooking.total_price);
    const nextPricingSnapshot: JsonRecord = {
      ...currentPricingSnapshot,
      stay_unit_id: targetStayUnitId,
      channel_provider: "channex",
      channel_source: source,
      channel_import_source: source,
      channel_external_booking_id: externalBookingId,
      channel_external_revision_id: asStringOrNull(revisionRow.external_revision_id),
      channel_external_room_type_id: externalRoomTypeId,
      channel_external_rate_plan_id: asStringOrNull(revisionRow.external_rate_plan_id),
      channel_booking_revision_id: channelBookingRevisionId,
      channel_last_applied_action: "modification",
      channel_last_applied_source: source,
      channel_last_applied_at: now,
      channel_modified_from: {
        start_date: currentStartDate,
        end_date: currentEndDate,
        stay_unit_id: currentStayUnitId,
        total_price: asNumberOrNull(linkedBooking.total_price),
      },
      channel_modified_to: {
        start_date: arrivalDate,
        end_date: departureDate,
        stay_unit_id: targetStayUnitId,
        total_price: nextTotalPrice,
      },
    };

    if (currency) {
      nextPricingSnapshot.currency = currency;
      if (amountNumber != null) {
        nextPricingSnapshot.base_price = nextTotalPrice;
        nextPricingSnapshot.unit_price = nextTotalPrice;
        nextPricingSnapshot.total_amount = amountNumber.toFixed(2);
      }
    }

    const updatePayload: Record<string, unknown> = {
      start_date: arrivalDate,
      end_date: departureDate,
      pricing_snapshot: nextPricingSnapshot,
      updated_at: now,
      payment_status: "not_required",
    };
    if (nextTotalPrice != null && Number.isFinite(nextTotalPrice)) {
      updatePayload.total_price = nextTotalPrice;
    }

    let bookingUpdateError: unknown = null;
    try {
      const result = await supabase
        .from("bookings_v2")
        .update({
          ...updatePayload,
          stay_unit_id: targetStayUnitId,
        } as never)
        .eq("id", linkedBookingId);
      bookingUpdateError = result.error;
    } catch (error) {
      if (!isMissingColumnError(error, "stay_unit_id")) {
        throw error;
      }
      bookingUpdateError = error;
    }

    if (bookingUpdateError && !isMissingColumnError(bookingUpdateError, "stay_unit_id")) {
      throw bookingUpdateError;
    }

    if (bookingUpdateError && isMissingColumnError(bookingUpdateError, "stay_unit_id")) {
      const fallbackResult = await supabase
        .from("bookings_v2")
        .update(updatePayload as never)
        .eq("id", linkedBookingId);
      if (fallbackResult.error) throw fallbackResult.error;
    }

    const { error: revisionUpdateError } = await supabase
      .from("channel_booking_revisions")
      .update({
        import_status: "modified_applied",
        ack_status: "not_acknowledged",
        linked_booking_id: linkedBookingId,
        updated_at: now,
      } as never)
      .eq("id", channelBookingRevisionId);

    if (revisionUpdateError) throw revisionUpdateError;

    await logApplyResult({
      supabase,
      familyId,
      status: "success",
      message: "Applied Channex booking modification to the linked Famlo booking. Channex acknowledgement remains pending.",
      payload: {
        channel_booking_revision_id: channelBookingRevisionId,
        external_booking_id: externalBookingId,
        linked_booking_id: linkedBookingId,
        source,
        from_start_date: currentStartDate,
        from_end_date: currentEndDate,
        from_stay_unit_id: currentStayUnitId,
        to_start_date: arrivalDate,
        to_end_date: departureDate,
        to_stay_unit_id: targetStayUnitId,
      },
    });

    return NextResponse.json(
      {
        ok: true,
        status: "modified_applied",
        message: "Modification applied to Famlo. Not acknowledged yet.",
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
        message: error instanceof Error ? error.message : "Unable to apply this Channex booking modification.",
        payload: {
          channel_booking_revision_id: revisionIdForLog,
        },
      });
    }

    console.error("[host.pro.channel.channex.bookings.apply-modification] failed:", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unable to apply this Channex booking modification.",
      },
      { status: 500 }
    );
  }
}
