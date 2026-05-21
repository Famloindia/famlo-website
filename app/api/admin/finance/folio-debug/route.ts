import { NextRequest, NextResponse } from "next/server";

import { hasValidAdminSession } from "@/lib/admin-auth";
import { createAdminSupabaseClient } from "@/lib/supabase";

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    if (!(await hasValidAdminSession())) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const bookingId = String(request.nextUrl.searchParams.get("bookingId") ?? "").trim();
    if (!bookingId) {
      return NextResponse.json({ error: "bookingId is required." }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();
    const [{ data: booking, error: bookingError }, { data: reservation, error: reservationError }] = await Promise.all([
      supabase
        .from("bookings_v2")
        .select("id,user_id,source_channel,status,payment_status,total_price,pricing_snapshot")
        .eq("id", bookingId)
        .maybeSingle(),
      supabase
        .from("reservations_v2")
        .select("id,booking_id,source_kind,source_channel")
        .eq("booking_id", bookingId)
        .maybeSingle(),
    ]);

    if (bookingError) throw bookingError;
    if (!booking?.id) {
      return NextResponse.json({ error: "Booking not found." }, { status: 404 });
    }

    if (reservationError) throw reservationError;
    if (!reservation?.id) {
      return NextResponse.json({ error: "Reservation not found for booking." }, { status: 404 });
    }

    const pricingSnapshot =
      booking.pricing_snapshot && typeof booking.pricing_snapshot === "object" && !Array.isArray(booking.pricing_snapshot)
        ? (booking.pricing_snapshot as Record<string, unknown>)
        : {};

    const [{ data: folio, error: folioError }, { data: lineItems, error: lineItemsError }] = await Promise.all([
      supabase.from("reservation_folios_v2").select("*").eq("reservation_id", reservation.id).maybeSingle(),
      supabase
        .from("folio_line_items_v2")
        .select("*")
        .eq("reservation_id", reservation.id)
        .order("occurred_at", { ascending: true })
        .order("created_at", { ascending: true }),
    ]);

    if (folioError) throw folioError;
    if (lineItemsError) throw lineItemsError;

    const totals = {
      roomCharge: 0,
      guestPayment: 0,
      platformFee: 0,
      refund: 0,
      adjustment: 0,
      hostPayoutPending: 0,
    };

    for (const line of Array.isArray(lineItems) ? lineItems : []) {
      const amount = Math.max(0, asNumber((line as Record<string, unknown>).amount, 0));
      const code = String((line as Record<string, unknown>).line_code ?? "");
      if (code === "ROOM_CHARGE") totals.roomCharge += amount;
      if (code === "GUEST_PAYMENT") totals.guestPayment += amount;
      if (code === "PLATFORM_FEE") totals.platformFee += amount;
      if (code === "REFUND") totals.refund += amount;
      if (code === "ADJUSTMENT") totals.adjustment += amount;
      if (code === "HOST_PAYOUT_PENDING") totals.hostPayoutPending += amount;
    }

    const lineEventSources = Array.from(
      new Set(
        (Array.isArray(lineItems) ? lineItems : [])
          .map((line) => asString((line as Record<string, unknown>).source_event_type))
          .filter(Boolean)
      )
    );

    return NextResponse.json({
      bookingId,
      booking,
      reservation,
      folio,
      lineItems,
      totals,
      eventSource: {
        sourceKind: reservation.source_kind ?? null,
        sourceChannel: reservation.source_channel ?? null,
      },
      diagnostics: {
        paymentCollectMode:
          asString(pricingSnapshot.payment_collect_mode) ?? asString(pricingSnapshot.payment_collect) ?? null,
        externalOtaGuest:
          asString(pricingSnapshot.channel_user_id_mode) === "external_ota_guest",
        technicalOwnerUserId: asString(pricingSnapshot.technical_owner_user_id),
        otaSourceEventId:
          asString(pricingSnapshot.channel_external_revision_id) ?? asString(pricingSnapshot.channel_booking_revision_id),
        lastWriteResult:
          folio && typeof folio.metadata === "object" && folio.metadata
            ? (folio.metadata as Record<string, unknown>).last_finance_write_result ?? null
            : null,
        ambiguityWarnings:
          folio && typeof folio.metadata === "object" && folio.metadata
            ? (folio.metadata as Record<string, unknown>).ambiguity_warnings ?? []
            : [],
        isSettlementEligible:
          folio && typeof folio.metadata === "object" && folio.metadata
            ? Boolean((folio.metadata as Record<string, unknown>).is_settlement_eligible)
            : false,
        settlementBlockedReason:
          folio && typeof folio.metadata === "object" && folio.metadata
            ? (folio.metadata as Record<string, unknown>).settlement_blocked_reason ?? null
            : null,
        lineEventSources,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load folio debug payload." },
      { status: 500 }
    );
  }
}
