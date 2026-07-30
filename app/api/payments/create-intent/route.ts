import { NextRequest, NextResponse } from "next/server";

import { getErrorDiagnostics, getErrorMessage } from "@/lib/error-utils";
import { createPaymentIntentForBooking } from "@/lib/payment-intent";
import { loadGuestSessionSnapshot } from "@/lib/guest-session";
import { resolveStrictAuthenticatedUser } from "@/lib/request-user";
import { createAdminSupabaseClient } from "@/lib/supabase";

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = (await req.json()) as { bookingId?: string };
    const bookingId = String(body.bookingId ?? "").trim();

    if (!bookingId) {
      return NextResponse.json({ error: "bookingId is required." }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();
    const authUser = await resolveStrictAuthenticatedUser(supabase, req);
    if (!authUser) {
      return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
    }
    const [{ data: booking, error: bookingError }, guestSession] = await Promise.all([
      supabase
        .from("bookings_v2")
        .select("user_id")
        .eq("id", bookingId)
        .maybeSingle(),
      loadGuestSessionSnapshot(supabase, authUser),
    ]);
    if (bookingError) throw bookingError;
    if (!booking || booking.user_id !== authUser.id) {
      return NextResponse.json(
        { error: "You can only pay for your own booking." },
        { status: 403 }
      );
    }
    if (!guestSession.profileComplete) {
      return NextResponse.json(
        {
          error: "Verify both contact methods before starting payment.",
          code: "PROFILE_INCOMPLETE",
        },
        { status: 428 }
      );
    }
    const result = await createPaymentIntentForBooking(supabase, { bookingId });

    return NextResponse.json({
      payment: result.payment,
      order: result.order,
      integrationStatus: result.integrationStatus,
      nextStep: result.nextStep,
    });
  } catch (error) {
    console.error("[api/payments/create-intent] failed", getErrorDiagnostics(error));
    return NextResponse.json(
      { error: getErrorMessage(error, "Failed to create payment intent.") },
      { status: 500 }
    );
  }
}
