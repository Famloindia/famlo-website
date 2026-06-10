import { NextResponse } from "next/server";

import { resolveAuthenticatedUser } from "@/lib/request-user";
import { createAdminSupabaseClient } from "@/lib/supabase";

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const { userId, lat, lng, label } = (await request.json()) as Record<string, unknown>;

    if (typeof lat !== "number" || typeof lng !== "number") {
      return NextResponse.json({ error: "Missing location data." }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();
    const authUser = await resolveAuthenticatedUser(supabase, request);
    if (!authUser) {
      return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
    }
    if (typeof userId === "string" && userId.trim().length > 0 && userId !== authUser.id) {
      return NextResponse.json({ error: "You can only update your own location." }, { status: 403 });
    }

    const now = new Date().toISOString();
    const payload = {
      user_id: authUser.id,
      last_lat: lat,
      last_lng: lng,
      last_location_label: typeof label === "string" && label.trim().length > 0 ? label.trim() : "Current location",
      updated_at: now,
    };

    const { error } = await supabase
      .from("user_profiles_v2")
      .upsert(payload as never, { onConflict: "user_id" });

    if (error) {
      const message = error.message.toLowerCase();
      const ignorable =
        message.includes("does not exist") ||
        message.includes("relation") ||
        message.includes("schema cache") ||
        message.includes("column");
      if (!ignorable) throw error;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not save location." },
      { status: 500 }
    );
  }
}
