import { createAdminSupabaseClient } from "@/lib/supabase";
import { NextResponse } from "next/server";
import { hasAdminPermission } from "@/lib/admin-auth";

export async function POST(req: Request) {
  try {
    if (!(await hasAdminPermission("support"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { ticketId, reply, status } = await req.json();

    if (!ticketId || !reply) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();
    const { error } = await supabase
      .from("support_tickets")
      .update({
        admin_reply: reply,
        status: status || "resolved",
        updated_at: new Date().toISOString(),
      })
      .eq("id", ticketId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
