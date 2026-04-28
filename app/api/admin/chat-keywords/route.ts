// app/api/admin/chat-keywords/route.ts
import { NextResponse } from "next/server";
import { hasValidAdminSession } from "@/lib/admin-auth";
import { createAdminSupabaseClient } from "@/lib/supabase";
import { logAuditAction } from "@/lib/audit";

export async function POST(request: Request) {
  try {
    if (!(await hasValidAdminSession())) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { action, keyword } = await request.json();
    const supabase = createAdminSupabaseClient();

    if (!keyword) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (action === "add") {
      await supabase.from("chat_keywords").insert({ keyword, created_by: "system-admin" });
    } else if (action === "remove") {
      await supabase.from("chat_keywords").delete().eq("keyword", keyword);
    }

    // Log the keyword action in audit_log
    await logAuditAction({
      actorId: "system-admin",
      actorRole: "admin",
      actionType: action === "add" ? "add_chat_keyword" : "remove_chat_keyword",
      resourceType: "chat_keyword",
      newValue: { keyword }
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Chat keyword action failed:", err);
    return NextResponse.json({ error: "Action failed" }, { status: 500 });
  }
}
