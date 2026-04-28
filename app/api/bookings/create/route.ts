import { NextRequest, NextResponse } from "next/server";

import { createBookingCompatibility, type BookingCreateInput } from "@/lib/booking-compat";
import { getErrorDiagnostics, getErrorMessage } from "@/lib/error-utils";
import { createPaymentIntentForBooking } from "@/lib/payment-intent";
import { resolveAuthenticatedUser } from "@/lib/request-user";
import { createAdminSupabaseClient } from "@/lib/supabase";

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = (await req.json()) as BookingCreateInput & { requestPaymentIntent?: boolean; gateway?: string };

    if (!body.userId || !body.bookingType || !body.startDate) {
      return NextResponse.json({ error: "userId, bookingType, and startDate are required." }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();
    const authUser = await resolveAuthenticatedUser(supabase, req);
    if (!authUser) {
      return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
    }
    if (body.userId !== authUser.id) {
      return NextResponse.json({ error: "You can only create bookings for your own account." }, { status: 403 });
    }

    const result = await createBookingCompatibility(supabase, { ...body, userId: authUser.id });
    const shouldCreatePaymentIntent = body.requestPaymentIntent === true && body.bookingType === "host_stay";

    if (shouldCreatePaymentIntent) {
      const paymentIntent = await createPaymentIntentForBooking(supabase, {
        bookingId: result.bookingId,
        gateway: body.gateway ?? "razorpay",
      });

      return NextResponse.json({
        ...result,
        paymentIntent,
      });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("[api/bookings/create] failed", getErrorDiagnostics(error));
    return NextResponse.json(
      { error: getErrorMessage(error, "Failed to create booking.") },
      { status: 500 }
    );
  }
}
