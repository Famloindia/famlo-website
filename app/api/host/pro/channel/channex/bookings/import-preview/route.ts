import { createHash } from "node:crypto";
import { NextResponse } from "next/server";

import { loadHostProAccess } from "@/lib/host-pro-access";
import { resolveAuthorizedHostResource } from "@/lib/host-access";
import { createAdminSupabaseClient } from "@/lib/supabase";

type ImportPreviewBody = {
  familyId?: string;
  channelBookingRevisionId?: string;
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

function deterministicGuestUserId(seed: string): string {
  const digest = createHash("sha256").update(seed).digest("hex").slice(0, 32);
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-${digest.slice(12, 16)}-${digest.slice(16, 20)}-${digest.slice(20, 32)}`;
}

async function logImportResult(input: {
  supabase: ReturnType<typeof createAdminSupabaseClient>;
  familyId: string;
  status: "success" | "failed";
  message: string;
  payload: Record<string, unknown>;
}): Promise<void> {
  const { error } = await input.supabase.from("channel_sync_logs").insert({
    family_id: input.familyId,
    provider_code: "channex",
    action: "import_booking_preview",
    status: input.status,
    message: input.message,
    payload: input.payload,
  } as never);

  if (error) {
    const message = String(error.message ?? "");
    if (!/relation|does not exist|schema cache/i.test(message)) {
      console.error("[host.pro.channel.channex.bookings.import-preview] log failed:", error);
    }
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = (await request.json()) as ImportPreviewBody;
    const familyId = asString(body.familyId);
    const channelBookingRevisionId = asString(body.channelBookingRevisionId);

    if (!familyId || !channelBookingRevisionId) {
      return NextResponse.json({ error: "familyId and channelBookingRevisionId are required." }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();
    const authorizedResource = await resolveAuthorizedHostResource(supabase, request, { familyId });
    if (!authorizedResource?.familyId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const access = await loadHostProAccess(supabase, familyId);
    if (!access.allowed) {
      return NextResponse.json({ error: "Famlo Pro is not active for this property." }, { status: 403 });
    }

    const { data: revisionRow, error: revisionError } = await supabase
      .from("channel_booking_revisions")
      .select("id,family_id,provider_code,external_booking_id,external_revision_id,external_room_type_id,external_rate_plan_id,ota_name,status,arrival_date,departure_date,guest_name,amount,currency,payment_collect,source,raw_payload,import_status,ack_status,linked_booking_id")
      .eq("id", channelBookingRevisionId)
      .eq("family_id", familyId)
      .eq("provider_code", "channex")
      .maybeSingle();

    if (revisionError) throw revisionError;
    if (!revisionRow) {
      return NextResponse.json({ error: "Preview booking not found for this property." }, { status: 404 });
    }

    const importStatus = asStringOrNull(revisionRow.import_status) ?? "preview";
    const ackStatus = asStringOrNull(revisionRow.ack_status) ?? "not_acknowledged";
    const externalBookingId = asStringOrNull(revisionRow.external_booking_id);
    const arrivalDate = asStringOrNull(revisionRow.arrival_date);
    const departureDate = asStringOrNull(revisionRow.departure_date);
    const externalRoomTypeId = asStringOrNull(revisionRow.external_room_type_id);
    const externalRatePlanId = asStringOrNull(revisionRow.external_rate_plan_id);
    const currency = asStringOrNull(revisionRow.currency);
    const amountNumber = asNumberOrNull(revisionRow.amount);

    if (!["preview", "failed"].includes(importStatus)) {
      return NextResponse.json({ error: `This preview is already ${importStatus}.` }, { status: 409 });
    }
    if (ackStatus !== "not_acknowledged") {
      return NextResponse.json({ error: "Only not_acknowledged preview bookings can be imported in this phase." }, { status: 409 });
    }
    if (!externalBookingId || !arrivalDate || !departureDate || !externalRoomTypeId) {
      return NextResponse.json(
        {
          error: "Preview booking is missing required booking, room, or date fields.",
          missingFields: [
            !externalBookingId ? "external_booking_id" : null,
            !arrivalDate ? "arrival_date" : null,
            !departureDate ? "departure_date" : null,
            !externalRoomTypeId ? "external_room_type_id" : null,
          ].filter(Boolean),
        },
        { status: 409 }
      );
    }
    if (amountNumber == null || !currency) {
      return NextResponse.json(
        {
          error: "Preview booking amount or currency is missing.",
          missingFields: [
            amountNumber == null ? "amount" : null,
            !currency ? "currency" : null,
          ].filter(Boolean),
        },
        { status: 409 }
      );
    }

    if (asStringOrNull(revisionRow.linked_booking_id)) {
      return NextResponse.json(
        {
          ok: true,
          status: "already_imported",
          message: "This preview is already linked to a Famlo booking.",
          bookingId: asStringOrNull(revisionRow.linked_booking_id),
        },
        { status: 200 }
      );
    }

    const { data: roomMappingRow, error: roomMappingError } = await supabase
      .from("channel_room_mappings")
      .select("stay_unit_id,external_room_type_id")
      .eq("family_id", familyId)
      .eq("provider_code", "channex")
      .eq("external_room_type_id", externalRoomTypeId)
      .maybeSingle();

    if (roomMappingError) throw roomMappingError;
    const stayUnitId = asStringOrNull(roomMappingRow?.stay_unit_id);
    if (!stayUnitId) {
      return NextResponse.json({ error: "Mapped stay unit was not found for this external room type." }, { status: 409 });
    }

    const { data: stayUnitRow, error: stayUnitError } = await supabase
      .from("stay_units_v2")
      .select("id,host_id,name")
      .eq("id", stayUnitId)
      .maybeSingle();

    if (stayUnitError) throw stayUnitError;
    const hostId = asStringOrNull(stayUnitRow?.host_id);
    if (!hostId) {
      return NextResponse.json({ error: "Resolved stay unit is not linked to an active host profile." }, { status: 409 });
    }

    const { data: existingBooking, error: existingBookingError } = await supabase
      .from("bookings_v2")
      .select("id,status,payment_status")
      .eq("host_id", hostId)
      .eq("pricing_snapshot->>channel_provider", "channex")
      .eq("pricing_snapshot->>channel_external_booking_id", externalBookingId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingBookingError) throw existingBookingError;

    if (existingBooking?.id) {
      const existingBookingId = asStringOrNull(existingBooking.id);
      const now = new Date().toISOString();
      await supabase
        .from("channel_booking_revisions")
        .update({
          import_status: "imported",
          linked_booking_id: existingBookingId,
          updated_at: now,
        } as never)
        .eq("id", channelBookingRevisionId);

      await logImportResult({
        supabase,
        familyId,
        status: "success",
        message: "Preview booking already exists in Famlo. Linked the existing booking without acknowledging Channex.",
        payload: {
          external_booking_id: externalBookingId,
          external_room_type_id: externalRoomTypeId,
          external_rate_plan_id: externalRatePlanId,
          linked_booking_id: existingBookingId,
          duplicate_detected: true,
        },
      });

      return NextResponse.json(
        {
          ok: true,
          status: "already_imported",
          message: "A matching Famlo OTA booking already exists. Linked the preview to that booking without creating a duplicate.",
          bookingId: existingBookingId,
        },
        { status: 200 }
      );
    }

    const guestUserId = deterministicGuestUserId(`channex:${familyId}:${externalBookingId}`);
    const now = new Date().toISOString();
    const guestName = asStringOrNull(revisionRow.guest_name) ?? "OTA guest";
    const amountRounded = Math.round(amountNumber);

    const { error: guestUpsertError } = await supabase.from("users").upsert(
      {
        id: guestUserId,
        name: guestName,
        role: "guest",
        email: null,
        phone: null,
        onboarding_completed: false,
        auth_provider: "channex_preview",
        updated_at: now,
      } as never,
      { onConflict: "id" }
    );

    if (guestUpsertError) throw guestUpsertError;

    const pricingSnapshot = {
      stay_unit_id: stayUnitId,
      base_price: amountRounded,
      unit_price: amountRounded,
      total_amount: amountNumber.toFixed(2),
      currency,
      channel_provider: "channex",
      channel_source_type: "ota",
      channel_import_source: asStringOrNull(revisionRow.source) ?? "booking_list_api",
      channel_external_booking_id: externalBookingId,
      channel_external_revision_id: asStringOrNull(revisionRow.external_revision_id),
      channel_external_room_type_id: externalRoomTypeId,
      channel_external_rate_plan_id: externalRatePlanId,
      channel_booking_revision_id: channelBookingRevisionId,
      payment_collect: asStringOrNull(revisionRow.payment_collect),
      ota_name: asStringOrNull(revisionRow.ota_name),
      imported_from_channex_preview: true,
      guest_name: guestName,
    };

    const bookingPayload: Record<string, unknown> = {
      user_id: guestUserId,
      booking_type: "host_stay",
      recipient_type: "host",
      recipient_id: hostId,
      product_type: "host_listing",
      product_id: hostId,
      host_id: hostId,
      status: "confirmed",
      start_date: arrivalDate,
      end_date: departureDate,
      quarter_type: null,
      quarter_time: null,
      guests_count: 1,
      notes: `Imported from Channex preview ${externalBookingId}. Not acknowledged yet.`,
      pricing_snapshot: pricingSnapshot,
      total_price: amountRounded,
      partner_payout_amount: 0,
      payment_status: "not_required",
      cancellation_policy_code: null,
      stay_unit_id: stayUnitId,
    };

    let insertResult;
    try {
      insertResult = await supabase.from("bookings_v2").insert(bookingPayload as never).select("id").single();
    } catch (error) {
      if (!isMissingColumnError(error, "stay_unit_id")) {
        throw error;
      }
      const { stay_unit_id: _ignored, ...fallbackPayload } = bookingPayload;
      insertResult = await supabase.from("bookings_v2").insert(fallbackPayload as never).select("id").single();
    }

    if (insertResult.error && isMissingColumnError(insertResult.error, "stay_unit_id")) {
      const { stay_unit_id: _ignored, ...fallbackPayload } = bookingPayload;
      insertResult = await supabase.from("bookings_v2").insert(fallbackPayload as never).select("id").single();
    }

    if (insertResult.error || !insertResult.data?.id) {
      throw insertResult.error ?? new Error("Unable to create bookings_v2 row.");
    }

    const bookingId = asString(insertResult.data.id);
    const { error: revisionUpdateError } = await supabase
      .from("channel_booking_revisions")
      .update({
        import_status: "imported",
        linked_booking_id: bookingId,
        updated_at: now,
      } as never)
      .eq("id", channelBookingRevisionId);

    if (revisionUpdateError) throw revisionUpdateError;

    await logImportResult({
      supabase,
      familyId,
      status: "success",
      message: "Imported Channex preview booking into Famlo without acknowledging Channex.",
      payload: {
        external_booking_id: externalBookingId,
        external_room_type_id: externalRoomTypeId,
        external_rate_plan_id: externalRatePlanId,
        linked_booking_id: bookingId,
        stay_unit_id: stayUnitId,
        host_id: hostId,
        amount: amountNumber.toFixed(2),
        currency,
      },
    });

    return NextResponse.json(
      {
        ok: true,
        status: "imported",
        message: "Imported this Channex preview booking into Famlo bookings. Channex acknowledgement remains pending.",
        bookingId,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("[host.pro.channel.channex.bookings.import-preview] failed:", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unable to import this preview booking.",
      },
      { status: 500 }
    );
  }
}
