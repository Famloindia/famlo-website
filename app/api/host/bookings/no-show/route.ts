import { NextResponse } from "next/server";

import { getTodayInIndia } from "@/lib/booking-time";
import { projectInventoryRange } from "@/lib/inventory";
import { setReservationOperationalStatus, syncReservationFromBooking } from "@/lib/reservations";
import { resolveAuthenticatedUser } from "@/lib/request-user";
import { createAdminSupabaseClient } from "@/lib/supabase";

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function isNoShowEligible(status: unknown): boolean {
  return ["accepted", "confirmed", "pending_host_approval"].includes(String(status ?? "").trim().toLowerCase());
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const { bookingId, familyId } = (await request.json()) as {
      bookingId?: string;
      familyId?: string;
    };
    const cleanBookingId = String(bookingId ?? "").trim();
    const cleanFamilyId = String(familyId ?? "").trim();
    if (!cleanBookingId || !cleanFamilyId) {
      return NextResponse.json({ error: "bookingId and familyId are required." }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();
    const authUser = await resolveAuthenticatedUser(supabase, request);
    if (!authUser) {
      return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
    }

    const { data: host, error: hostError } = await supabase
      .from("hosts")
      .select("id,user_id")
      .eq("legacy_family_id", cleanFamilyId)
      .maybeSingle();
    if (hostError) throw hostError;
    if (!host?.id || host.user_id !== authUser.id) {
      return NextResponse.json({ error: "Host profile not found." }, { status: 404 });
    }

    const { data: booking, error: bookingError } = await supabase
      .from("bookings_v2")
      .select("id,status,host_id,stay_unit_id,start_date,end_date,legacy_booking_id")
      .eq("id", cleanBookingId)
      .eq("host_id", host.id)
      .maybeSingle();
    if (bookingError) throw bookingError;
    if (!booking) {
      return NextResponse.json({ error: "Booking not found." }, { status: 404 });
    }
    if (!isNoShowEligible(booking.status)) {
      return NextResponse.json({ error: "This booking is not eligible for a no-show mark." }, { status: 409 });
    }

    const today = getTodayInIndia();
    const bookingStartDate = asString(booking.start_date) ?? today;
    if (today < bookingStartDate) {
      return NextResponse.json({ error: "No-show can only be marked on or after the arrival date." }, { status: 409 });
    }

    const previousEndDate = asString(booking.end_date) ?? bookingStartDate;
    const now = new Date().toISOString();
    const { error: updateError } = await supabase
      .from("bookings_v2")
      .update({
        end_date: bookingStartDate,
        status: "completed",
        checked_out_at: now,
        checked_out_by_host_user_id: authUser.id,
        updated_at: now,
      } as never)
      .eq("id", cleanBookingId);
    if (updateError) throw updateError;

    if (booking.legacy_booking_id) {
      await supabase
        .from("bookings")
        .update({ status: "completed", updated_at: now } as never)
        .eq("id", booking.legacy_booking_id);
    }

    await supabase.from("booking_status_history_v2").insert({
      booking_id: cleanBookingId,
      old_status: booking.status ?? null,
      new_status: "completed",
      changed_by_user_id: authUser.id,
      reason: "no_show_marked",
      created_at: now,
    } as never);

    await syncReservationFromBooking(supabase, {
      bookingId: cleanBookingId,
      source: "no_show",
      actorUserId: authUser.id,
      actorRole: "host",
      eventType: "status_synced",
      payload: {
        previous_end_date: previousEndDate,
        new_end_date: bookingStartDate,
      },
    });

    await setReservationOperationalStatus(supabase, {
      bookingId: cleanBookingId,
      status: "no_show",
      source: "no_show",
      eventType: "no_show_marked",
      actorUserId: authUser.id,
      actorRole: "host",
      payload: {
        previous_booking_status: booking.status,
      },
    });

    const stayUnitId = asString(booking.stay_unit_id);
    if (stayUnitId) {
      await projectInventoryRange(supabase, {
        familyId: cleanFamilyId,
        stayUnitId,
        from: bookingStartDate,
        to: previousEndDate,
      });
    }

    return NextResponse.json({
      success: true,
      bookingStatus: "completed",
      reservationStatus: "no_show",
    });
  } catch (error) {
    console.error("Host no-show marking failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not mark this booking as no-show." },
      { status: 500 }
    );
  }
}
