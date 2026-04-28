import { NextResponse } from "next/server";

import { loadHostGuestNetworkSummary } from "@/lib/host-guest-network";
import { resolveAuthenticatedUser } from "@/lib/request-user";
import { createAdminSupabaseClient } from "@/lib/supabase";

export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const familyId = String(searchParams.get("familyId") ?? "").trim();

  if (!familyId) {
    return NextResponse.json({ error: "familyId is required." }, { status: 400 });
  }

  try {
    const supabase = createAdminSupabaseClient();
    const authUser = await resolveAuthenticatedUser(supabase, request);
    const summary = await loadHostGuestNetworkSummary(supabase, {
      familyId,
      viewerUserId: authUser?.id ?? null,
      limit: 18,
    });

    return NextResponse.json({
      familyId: summary.familyId,
      guestCount: summary.guestCount,
      viewerCanAccessPeerChat: summary.viewerCanAccessPeerChat,
      guests: summary.viewerCanAccessPeerChat ? summary.guests : [],
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load the verified guest network." },
      { status: 500 }
    );
  }
}
