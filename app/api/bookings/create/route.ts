import { NextRequest, NextResponse } from "next/server";

import { createBookingCompatibility, type BookingCreateInput } from "@/lib/booking-compat";
import { getErrorDiagnostics, getErrorMessage } from "@/lib/error-utils";
import { createPaymentIntentForBooking } from "@/lib/payment-intent";
import { resolveStrictAuthenticatedUser } from "@/lib/request-user";
import { getSafeGuestAuthReturnPath } from "@/lib/site-url";
import { createAdminSupabaseClient } from "@/lib/supabase";
import { loadGuestSessionSnapshot } from "@/lib/guest-session";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const startedAt = performance.now();
  const timings: string[] = [];
  const mark = (name: string, phaseStartedAt: number): number => {
    const now = performance.now();
    timings.push(`${name};dur=${Math.max(0, now - phaseStartedAt).toFixed(1)}`);
    return now;
  };
  const json = (body: unknown, init?: ResponseInit): NextResponse => {
    const response = NextResponse.json(body, init);
    response.headers.set("Server-Timing", [...timings, `total;dur=${Math.max(0, performance.now() - startedAt).toFixed(1)}`].join(", "));
    return response;
  };
  try {
    let phaseStartedAt = performance.now();
    const body = (await req.json()) as BookingCreateInput & {
      requestPaymentIntent?: boolean;
      gateway?: string;
      returnTo?: string;
    };
    phaseStartedAt = mark("parse", phaseStartedAt);

    if (!body.userId || !body.bookingType || !body.startDate) {
      return json({ error: "userId, bookingType, and startDate are required." }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();
    const authUser = await resolveStrictAuthenticatedUser(supabase, req);
    phaseStartedAt = mark("auth", phaseStartedAt);
    if (!authUser) {
      return json({ error: "You must be signed in." }, { status: 401 });
    }
    if (body.userId !== authUser.id) {
      return json({ error: "You can only create bookings for your own account." }, { status: 403 });
    }

    const session = await loadGuestSessionSnapshot(supabase, authUser);
    phaseStartedAt = mark("profile", phaseStartedAt);
    if (!session.profileComplete) {
      const profileUrl = new URL("/profile", req.url);
      profileUrl.searchParams.set("next", getSafeGuestAuthReturnPath(body.returnTo));
      return json(
        {
          error: "Complete your guest profile before booking.",
          code: "PROFILE_INCOMPLETE",
          profileUrl: `${profileUrl.pathname}${profileUrl.search}`,
        },
        { status: 428 }
      );
    }

    const result = await createBookingCompatibility(supabase, { ...body, userId: authUser.id });
    phaseStartedAt = mark("booking", phaseStartedAt);
    const shouldCreatePaymentIntent = body.requestPaymentIntent === true && body.bookingType === "host_stay";

    if (shouldCreatePaymentIntent) {
      const paymentIntent = await createPaymentIntentForBooking(supabase, {
        bookingId: result.bookingId,
      });
      mark("payment_intent", phaseStartedAt);

      return json({
        ...result,
        paymentIntent,
      });
    }

    return json(result);
  } catch (error) {
    console.error("[api/bookings/create] failed", getErrorDiagnostics(error));
    return json(
      { error: getErrorMessage(error, "Failed to create booking.") },
      { status: 500 }
    );
  }
}
