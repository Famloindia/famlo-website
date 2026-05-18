import { NextResponse } from "next/server";

import { getTodayInIndia } from "@/lib/booking-time";
import { projectInventoryRange } from "@/lib/inventory";
import { syncReservationFromBooking } from "@/lib/reservations";
import { resolveAuthenticatedUser } from "@/lib/request-user";
import { createAdminSupabaseClient } from "@/lib/supabase";

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function isEarlyCheckoutEligible(status: unknown): boolean {
  return String(status ?? "").trim().toLowerCase() === "checked_in";
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const { bookingId, familyId, checkoutDate } = (await request.json()) as {
      bookingId?: string;
      familyId?: string;
      checkoutDate?: string | null;
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
      .select("id,user_id,legacy_family_id")
      .eq("legacy_family_id", cleanFamilyId)
      .maybeSingle();
    if (hostError) throw hostError;
    if (!host?.id || host.user_id !== authUser.id) {
      return NextResponse.json({ error: "Host profile not found." }, { status: 404 });
    }

    const { data: booking, error: bookingError } = await supabase
      .from("bookings_v2")
      .select("id,status,host_id,stay_unit_id,start_date,end_date,legacy_booking_id,checked_out_at")
      .eq("id", cleanBookingId)
      .eq("host_id", host.id)
      .maybeSingle();
    if (bookingError) throw bookingError;
    if (!booking) {
      return NextResponse.json({ error: "Booking not found." }, { status: 404 });
    }
    if (!isEarlyCheckoutEligible(booking.status)) {
      return NextResponse.json({ error: "Early checkout is only available after check-in." }, { status: 409 });
    }
    if (String(booking.checked_out_at ?? "").length > 0) {
      return NextResponse.json({ error: "This stay is already checked out." }, { status: 409 });
    }

    const today = getTodayInIndia();
    const previousEndDate = asString(booking.end_date) ?? asString(booking.start_date) ?? today;
    const targetCheckoutDate = asString(checkoutDate) ?? today;
    if (targetCheckoutDate < (asString(booking.start_date) ?? targetCheckoutDate)) {
      return NextResponse.json({ error: "Checkout date cannot be before check-in date." }, { status: 400 });
    }
    if (targetCheckoutDate > previousEndDate) {
      return NextResponse.json({ error: "Early checkout date cannot be after the current checkout date." }, { status: 400 });
    }

    const now = new Date().toISOString();
    const { error: updateError } = await supabase
      .from("bookings_v2")
      .update({
        end_date: targetCheckoutDate,
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
      reason: "early_checkout",
      created_at: now,
    } as never);

    await syncReservationFromBooking(supabase, {
      bookingId: cleanBookingId,
      source: "early_checkout",
      actorUserId: authUser.id,
      actorRole: "host",
      eventType: "early_checkout_applied",
      payload: {
        previous_end_date: previousEndDate,
        new_end_date: targetCheckoutDate,
      },
    });

    const stayUnitId = asString(booking.stay_unit_id);
    if (stayUnitId) {
      await projectInventoryRange(supabase, {
        familyId: cleanFamilyId,
        stayUnitId,
        from: targetCheckoutDate,
        to: previousEndDate,
      });
    }

    return NextResponse.json({
      success: true,
      status: "completed",
      previousEndDate,
      newEndDate: targetCheckoutDate,
    });
  } catch (error) {
    console.error("Host early checkout failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not apply early checkout." },
      { status: 500 }
    );
  }
}
