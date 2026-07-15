import { NextRequest, NextResponse } from "next/server";
import { hasValidBackofficeSession } from "@/lib/admin-auth";
import { createAdminSupabaseClient } from "@/lib/supabase";
export async function POST(req: NextRequest) {
  try {
    if (!(await hasValidBackofficeSession())) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id, is_active } = await req.json();
    const supabase = createAdminSupabaseClient();
    const { error } = await supabase.from("ads_v2").update({ is_active }).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
