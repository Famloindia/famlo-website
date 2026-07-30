import { NextRequest, NextResponse } from "next/server";

import { createBookingCompatibility, type BookingCreateInput } from "@/lib/booking-compat";
import { getErrorDiagnostics, getErrorMessage } from "@/lib/error-utils";
import { createPaymentIntentForBooking } from "@/lib/payment-intent";
import { resolveStrictAuthenticatedUser } from "@/lib/request-user";
import { getSafeGuestAuthReturnPath } from "@/lib/site-url";
import { createAdminSupabaseClient } from "@/lib/supabase";
import { isGuestProfileComplete, loadUserProfileCompatibility } from "@/lib/user-profile";

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = (await req.json()) as BookingCreateInput & {
      requestPaymentIntent?: boolean;
      gateway?: string;
      returnTo?: string;
    };

    if (!body.userId || !body.bookingType || !body.startDate) {
      return NextResponse.json({ error: "userId, bookingType, and startDate are required." }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();
    const authUser = await resolveStrictAuthenticatedUser(supabase, req);
    if (!authUser) {
      return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
    }
    if (body.userId !== authUser.id) {
      return NextResponse.json({ error: "You can only create bookings for your own account." }, { status: 403 });
    }

    const profile = await loadUserProfileCompatibility(supabase, authUser.id);
    if (!isGuestProfileComplete(profile)) {
      const profileUrl = new URL("/profile", req.url);
      profileUrl.searchParams.set("next", getSafeGuestAuthReturnPath(body.returnTo));
      return NextResponse.json(
        {
          error: "Complete your guest profile before booking.",
          code: "PROFILE_INCOMPLETE",
          profileUrl: `${profileUrl.pathname}${profileUrl.search}`,
        },
        { status: 428 }
      );
    }

    const result = await createBookingCompatibility(supabase, { ...body, userId: authUser.id });
    const shouldCreatePaymentIntent = body.requestPaymentIntent === true && body.bookingType === "host_stay";

    if (shouldCreatePaymentIntent) {
      const paymentIntent = await createPaymentIntentForBooking(supabase, {
        bookingId: result.bookingId,
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
