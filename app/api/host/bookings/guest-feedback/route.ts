import { NextResponse } from "next/server";

import { resolveAuthenticatedUser } from "@/lib/request-user";
import { createAdminSupabaseClient } from "@/lib/supabase";

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const { bookingId, familyId, wouldHostAgain, behaviorTags, note } = (await request.json()) as {
      bookingId?: string;
      familyId?: string;
      wouldHostAgain?: boolean;
      behaviorTags?: string[];
      note?: string;
    };

    const cleanBookingId = String(bookingId ?? "").trim();
    const cleanFamilyId = String(familyId ?? "").trim();

    if (!cleanBookingId || !cleanFamilyId || typeof wouldHostAgain !== "boolean") {
      return NextResponse.json({ error: "bookingId, familyId, and wouldHostAgain are required." }, { status: 400 });
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
    if (!host?.id || !host.user_id || host.user_id !== authUser.id) {
      return NextResponse.json({ error: "Host profile not found." }, { status: 404 });
    }

    const { data: booking, error: bookingError } = await supabase
      .from("bookings_v2")
      .select("id,user_id,status,host_id")
      .eq("id", cleanBookingId)
      .eq("host_id", host.id)
      .maybeSingle();
    if (bookingError) throw bookingError;
    if (!booking) {
      return NextResponse.json({ error: "Booking not found." }, { status: 404 });
    }

    const tags = Array.isArray(behaviorTags)
      ? behaviorTags.filter((tag): tag is string => typeof tag === "string" && tag.trim().length > 0).map((tag) => tag.trim().slice(0, 32)).slice(0, 8)
      : [];

    const { error: upsertError } = await supabase.from("guest_feedback_v2").upsert(
      {
        booking_id: cleanBookingId,
        guest_user_id: booking.user_id,
        host_user_id: host.user_id,
        would_host_again: wouldHostAgain,
        behavior_tags: tags,
        note: typeof note === "string" && note.trim().length > 0 ? note.trim().slice(0, 500) : null,
        updated_at: new Date().toISOString(),
      } as never,
      { onConflict: "booking_id" }
    );

    if (upsertError) throw upsertError;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Guest feedback save failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not save guest feedback." },
      { status: 500 }
    );
  }
}
