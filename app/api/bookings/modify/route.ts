import { NextRequest, NextResponse } from "next/server";

import { buildBookingQuote, type BookingQuoteInput } from "@/lib/booking-compat";
import { createBookingModification } from "@/lib/booking-platform";
import { resolveAuthenticatedUser } from "@/lib/request-user";
import { createAdminSupabaseClient } from "@/lib/supabase";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = (await request.json()) as {
      bookingId?: string;
      requestedByUserId?: string | null;
      quoteInput?: BookingQuoteInput;
      reason?: string | null;
    };

    const bookingId = String(body.bookingId ?? "").trim();
    if (!bookingId || !body.quoteInput) {
      return NextResponse.json({ error: "bookingId and quoteInput are required." }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();
    const authUser = await resolveAuthenticatedUser(supabase, request);
    if (!authUser) {
      return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
    }
    if (typeof body.requestedByUserId === "string" && body.requestedByUserId.trim().length > 0 && body.requestedByUserId !== authUser.id) {
      return NextResponse.json({ error: "You can only modify your own bookings." }, { status: 403 });
    }
    const { data: existing, error } = await supabase
      .from("bookings_v2")
      .select("id,start_date,end_date,quarter_type,guests_count,total_price,pricing_snapshot,user_id")
      .eq("id", bookingId)
      .maybeSingle();
    if (error) throw error;
    if (!existing) {
      return NextResponse.json({ error: "Booking not found." }, { status: 404 });
    }
    if (existing.user_id !== authUser.id) {
      return NextResponse.json({ error: "You can only modify your own bookings." }, { status: 403 });
    }

    const newQuote = await buildBookingQuote(supabase, { ...body.quoteInput, userId: authUser.id });
    const modificationId = await createBookingModification(supabase, {
      bookingId,
      requestedByUserId: authUser.id,
      oldSnapshot: {
        start_date: existing.start_date,
        end_date: existing.end_date,
        quarter_type: existing.quarter_type,
        guests_count: existing.guests_count,
        total_price: existing.total_price,
        pricing_snapshot: existing.pricing_snapshot,
      },
      requestedSnapshot: { ...body.quoteInput, userId: authUser.id } as unknown as Record<string, unknown>,
      financialDelta: {
        old_total_price: existing.total_price,
        new_total_price: newQuote.totalPrice,
        delta: newQuote.totalPrice - Number(existing.total_price ?? 0),
      },
      reason: body.reason ?? null,
    });

    return NextResponse.json({ success: true, modificationId, quote: newQuote });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create modification request." },
      { status: 500 }
    );
  }
}
