import { NextResponse } from "next/server";

import { canHostAccessConversation, resolveAuthorizedHostSession, resolveConversationAccess } from "@/lib/chat-access";
import { detectChatSafetyIssue, ensurePendingChatFlag, fetchChatKeywords } from "@/lib/chat-safety";
import { enqueueNotification } from "@/lib/booking-platform";
import { createAdminSupabaseClient } from "@/lib/supabase";

const DEFAULT_MESSAGE_LIMIT = 50;
const MAX_MESSAGE_LIMIT = 100;
const MESSAGE_COLUMNS = "id,conversation_id,booking_id,sender_id,receiver_id,sender_type,text,created_at";

function parseMessageLimit(value: string | null): number {
  if (!value) return DEFAULT_MESSAGE_LIMIT;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_MESSAGE_LIMIT;
  return Math.min(MAX_MESSAGE_LIMIT, Math.max(1, Math.trunc(parsed)));
}

function normalizeMessageForClient(message: Record<string, unknown>): Record<string, unknown> {
  const text = typeof message.text === "string" ? message.text : "";
  const imagePrefix = "Shared photo: ";
  const imageUrl = text.startsWith(imagePrefix) ? text.slice(imagePrefix.length).trim() : null;
  return {
    ...message,
    text: imageUrl ? "" : text,
    content: imageUrl ? "" : text,
    message_type: imageUrl ? "image" : text.startsWith("Shared location:") ? "location" : "text",
    image_url: imageUrl,
    image_name: null,
    deleted_at: null,
    deleted_by: null,
    seen_at: null,
  };
}

export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const conversationRef = searchParams.get("conversationId") ?? searchParams.get("bookingId");
  const before = searchParams.get("before");
  const limit = parseMessageLimit(searchParams.get("limit"));

  if (!conversationRef) {
    return NextResponse.json({ error: "Missing conversationId" }, { status: 400 });
  }

  const supabase = createAdminSupabaseClient();

  try {
    const hostSession = await resolveAuthorizedHostSession(supabase, request);
    if (!hostSession) {
      return NextResponse.json({ error: "Host session required." }, { status: 401 });
    }

    const access = await resolveConversationAccess(supabase, conversationRef, { createIfMissing: true });
    if (!access || !canHostAccessConversation(access, hostSession)) {
      return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
    }
    if (!access.chatUnlocked) {
      return NextResponse.json({ error: "Chat unlocks after the booking is confirmed." }, { status: 409 });
    }

    let query = supabase
      .from("messages")
      .select(MESSAGE_COLUMNS)
      .in("conversation_id", access.thread.relatedConversationIds)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (before) {
      query = query.lt("created_at", before);
    }

    const { data: messages, error: msgError } = await query;

    if (msgError) throw msgError;

    await supabase
      .from("conversations")
      .update({ host_unread: 0 } as never)
      .eq("id", access.conversationId);

    return NextResponse.json(
      [...(messages ?? [])]
        .reverse()
        .map((message) => normalizeMessageForClient(message as Record<string, unknown>))
    );
  } catch (error) {
    console.error("Messages fetch error:", error);
    return NextResponse.json({ error: "Failed to load thread" }, { status: 500 });
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as Record<string, unknown>;
  const conversationRef =
    (typeof body.conversationId === "string" && body.conversationId.trim().length > 0
      ? body.conversationId
      : typeof body.bookingId === "string" && body.bookingId.trim().length > 0
        ? body.bookingId
        : null) ?? null;
  const { text, messageType } = body;

  if (!conversationRef || (typeof text !== "string" && messageType !== "location")) {
    return NextResponse.json({ error: "Incomplete payload" }, { status: 400 });
  }

  if (messageType === "image") {
    return NextResponse.json({ error: "Host image uploads are disabled." }, { status: 400 });
  }

  const supabase = createAdminSupabaseClient();

  try {
    const hostSession = await resolveAuthorizedHostSession(supabase, request);
    if (!hostSession?.hostUserId) {
      return NextResponse.json({ error: "Host session required." }, { status: 401 });
    }

    const access = await resolveConversationAccess(supabase, conversationRef, { createIfMissing: true });
    if (!access || !canHostAccessConversation(access, hostSession)) {
      return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
    }
    if (!access.chatUnlocked) {
      return NextResponse.json({ error: "Chat unlocks after the booking is confirmed." }, { status: 409 });
    }

    const now = new Date().toISOString();
    const trimmedText = typeof text === "string" ? text.trim() : "";
    const messageKind = messageType === "location" ? "location" : "text";

    const { data: message, error: insertError } = await supabase
      .from("messages")
      .insert({
        conversation_id: access.conversationId,
        booking_id: access.legacyBookingId,
        sender_id: hostSession.hostUserId,
        receiver_id: access.guestId,
        sender_type: "host",
        text: trimmedText,
        created_at: now,
      } as never)
      .select(MESSAGE_COLUMNS)
      .single();

    if (insertError) throw insertError;

    const summaryText = messageKind === "location" ? "Shared location" : trimmedText;

    const { error: updateError } = await supabase
      .from("conversations")
      .update({
        last_message: summaryText,
        last_message_at: now,
        guest_unread: 1,
        host_unread: 0,
        typing_user_id: null,
        typing_updated_at: now,
      } as never)
      .eq("id", access.conversationId);

    if (updateError) throw updateError;

    if (access.guestId && message?.id) {
      void enqueueNotification(supabase, {
        eventType: "host_message_sent",
        channel: "email",
        userId: access.guestId,
        bookingId: access.legacyBookingId ?? access.bookingId ?? null,
        dedupeKey: `host_message_sent:${message.id}`,
        subject: "New Famlo message from your host",
        payload: {
          message: summaryText,
          cta_label: "Open conversation",
          cta_url: `/messages?conversation=${access.conversationId}`,
        },
      }).catch((notificationError) => console.error("Host message notification failed:", notificationError));
    }

    const keywords = await fetchChatKeywords(supabase);
    const safety = detectChatSafetyIssue(trimmedText, keywords);
    if (safety.matched) {
      await ensurePendingChatFlag(supabase, access.conversationId);
    }

    return NextResponse.json(normalizeMessageForClient(message as Record<string, unknown>));
  } catch (error) {
    console.error("Message send error:", error);
    return NextResponse.json({ error: "Failed to send message" }, { status: 500 });
  }
}

export async function DELETE(request: Request): Promise<NextResponse> {
  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const conversationRef =
      (typeof payload.conversationId === "string" && payload.conversationId.trim().length > 0
        ? payload.conversationId
        : typeof payload.bookingId === "string" && payload.bookingId.trim().length > 0
          ? payload.bookingId
          : null) ?? null;
    const messageId = typeof payload.messageId === "string" ? payload.messageId : null;

    if (!messageId || !conversationRef) {
      return NextResponse.json({ error: "Incomplete payload" }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();
    const hostSession = await resolveAuthorizedHostSession(supabase, request);
    if (!hostSession?.hostUserId) {
      return NextResponse.json({ error: "Host session required." }, { status: 401 });
    }

    const access = await resolveConversationAccess(supabase, conversationRef, { createIfMissing: false });
    if (!access || !canHostAccessConversation(access, hostSession)) {
      return NextResponse.json({ error: "Message not found." }, { status: 404 });
    }

    const { data: currentMessage, error: lookupError } = await supabase
      .from("messages")
      .select("id, sender_id, conversation_id")
      .eq("id", messageId)
      .in("conversation_id", access.thread.relatedConversationIds)
      .maybeSingle();

    if (lookupError) throw lookupError;
    if (!currentMessage || currentMessage.sender_id !== hostSession.hostUserId) {
      return NextResponse.json({ error: "You can only delete your own messages." }, { status: 403 });
    }

    const { error: deleteError } = await supabase
      .from("messages")
      .update({
        text: "Message deleted",
      } as never)
      .eq("id", messageId);

    if (deleteError) throw deleteError;

    await supabase
      .from("conversations")
      .update({
        last_message: "Message deleted",
        last_message_at: new Date().toISOString(),
      } as never)
      .eq("id", access.conversationId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Message delete error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to delete message." }, { status: 500 });
  }
}
