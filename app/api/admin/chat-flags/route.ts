// app/api/admin/chat-flags/route.ts
import { NextResponse } from "next/server";
import { hasValidAdminSession } from "@/lib/admin-auth";
import { createAdminSupabaseClient } from "@/lib/supabase";
import { logAuditAction } from "@/lib/audit";

export async function POST(request: Request) {
  try {
    if (!(await hasValidAdminSession())) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { conversationId, action } = await request.json();
    const supabase = createAdminSupabaseClient();

    if (!conversationId || !action) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Update the flag status in chat_flags table
    await supabase.from("chat_flags").update({
      status: action,
      reviewed_by: "system-admin",
      reviewed_at: new Date().toISOString()
    }).eq("conversation_id", conversationId);

    // Log the action in audit_log
    await logAuditAction({
      actorId: "system-admin",
      actorRole: "admin",
      actionType: action === "reviewed" ? "chat_flag_reviewed" : "chat_flag_dismissed",
      resourceType: "chat_flag",
      newValue: { conversationId, status: action }
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Chat flag action failed:", err);
    return NextResponse.json({ error: "Action failed" }, { status: 500 });
  }
}
