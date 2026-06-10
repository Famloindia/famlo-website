import { NextResponse } from "next/server";

import { resolveMessageThread } from "@/lib/chat-thread";
import { createAdminSupabaseClient } from "@/lib/supabase";

export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const referenceId = searchParams.get("referenceId") ?? searchParams.get("conversationId") ?? searchParams.get("bookingId");

  if (!referenceId) {
    return NextResponse.json({ error: "Missing referenceId" }, { status: 400 });
  }

  try {
    const supabase = createAdminSupabaseClient();
    const thread = await resolveMessageThread(supabase, referenceId, { createIfMissing: true });

    if (!thread) {
      return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
    }

    return NextResponse.json(thread);
  } catch (error) {
    console.error("[conversations/resolve] Failed:", error);
    return NextResponse.json({ error: "Failed to resolve conversation." }, { status: 500 });
  }
}
