import { NextResponse } from "next/server";

import { canGuestAccessConversation, canHostAccessConversation, resolveAuthorizedHostSession, resolveConversationAccess, resolveDirectHostConversationAccess } from "@/lib/chat-access";
import { resolveAuthenticatedUser } from "@/lib/request-user";
import { createAdminSupabaseClient } from "@/lib/supabase";

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const { conversationId, isTyping, userId } = (await request.json()) as Record<string, unknown>;

    if (typeof conversationId !== "string") {
      return NextResponse.json({ error: "conversationId is required." }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();
    const hostSession = await resolveAuthorizedHostSession(supabase, request);
    const requestedUserId = typeof userId === "string" ? userId : null;
    const directHostAccess =
      hostSession?.hostUserId && requestedUserId === hostSession.hostUserId
        ? await resolveDirectHostConversationAccess(supabase, conversationId, hostSession)
        : null;

    let actorUserId = directHostAccess?.hostUserId ?? null;
    let chatUnlocked = directHostAccess?.chatUnlocked ?? false;

    if (!directHostAccess) {
      const authUser = await resolveAuthenticatedUser(supabase, request);
      const access = await resolveConversationAccess(supabase, conversationId, { createIfMissing: false });

      if (!access) {
        return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
      }

      actorUserId =
        authUser && canGuestAccessConversation(access, authUser.id)
          ? authUser.id
          : hostSession && canHostAccessConversation(access, hostSession) && hostSession.hostUserId
            ? hostSession.hostUserId
            : null;
      chatUnlocked = access.chatUnlocked;
    }

    if (!actorUserId) {
      return NextResponse.json({ error: "Conversation access denied." }, { status: 403 });
    }
    if (!chatUnlocked) {
      return NextResponse.json({ error: "Chat unlocks after the booking is confirmed." }, { status: 409 });
    }

    const now = new Date().toISOString();
    const { error } = await supabase
      .from("conversations")
      .update({
        typing_user_id: isTyping === true ? actorUserId : null,
        typing_updated_at: now,
      } as never)
      .eq("id", conversationId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update typing state." },
      { status: 500 }
    );
  }
}
