import { NextRequest, NextResponse } from "next/server";

import { buildBookingQuote, type BookingQuoteInput } from "@/lib/booking-compat";
import { getErrorDiagnostics, getErrorMessage } from "@/lib/error-utils";
import { resolveAuthenticatedUser } from "@/lib/request-user";
import { createAdminSupabaseClient } from "@/lib/supabase";

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = (await req.json()) as BookingQuoteInput;

    if (!body.userId || !body.bookingType || !body.startDate) {
      return NextResponse.json({ error: "userId, bookingType, and startDate are required." }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();
    const authUser = await resolveAuthenticatedUser(supabase, req);
    if (!authUser) {
      return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
    }
    if (body.userId !== authUser.id) {
      return NextResponse.json({ error: "You can only quote bookings for your own account." }, { status: 403 });
    }

    const quote = await buildBookingQuote(supabase, { ...body, userId: authUser.id });

    return NextResponse.json(quote);
  } catch (error) {
    console.error("[api/bookings/quote] failed", getErrorDiagnostics(error));
    return NextResponse.json(
      { error: getErrorMessage(error, "Failed to calculate booking quote.") },
      { status: 500 }
    );
  }
}
