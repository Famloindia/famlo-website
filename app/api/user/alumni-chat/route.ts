import { NextResponse } from "next/server";

import { ensureGuestNetworkConversation, loadHostGuestNetworkSummary } from "@/lib/host-guest-network";
import { resolveAuthenticatedUser } from "@/lib/request-user";
import { createAdminSupabaseClient } from "@/lib/supabase";

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const { familyId, peerUserId } = (await request.json()) as {
      familyId?: string;
      peerUserId?: string;
    };

    const cleanFamilyId = String(familyId ?? "").trim();
    const cleanPeerUserId = String(peerUserId ?? "").trim();

    if (!cleanFamilyId || !cleanPeerUserId) {
      return NextResponse.json({ error: "familyId and peerUserId are required." }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();
    const authUser = await resolveAuthenticatedUser(supabase, request);
    if (!authUser) {
      return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
    }
    if (cleanPeerUserId === authUser.id) {
      return NextResponse.json({ error: "Choose another verified guest to open this chat." }, { status: 400 });
    }

    const summary = await loadHostGuestNetworkSummary(supabase, {
      familyId: cleanFamilyId,
      viewerUserId: authUser.id,
      limit: 100,
    });

    if (!summary.viewerCanAccessPeerChat) {
      return NextResponse.json({ error: "Guest network chat unlocks after your booking is confirmed." }, { status: 403 });
    }
    if (!summary.guests.some((guest) => guest.id === cleanPeerUserId)) {
      return NextResponse.json({ error: "This verified guest is not available for this host network." }, { status: 404 });
    }

    const conversationId = await ensureGuestNetworkConversation(supabase, {
      familyId: cleanFamilyId,
      viewerUserId: authUser.id,
      peerUserId: cleanPeerUserId,
    });

    return NextResponse.json({ success: true, conversationId });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to open the guest network chat." },
      { status: 500 }
    );
  }
}
