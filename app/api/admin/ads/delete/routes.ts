import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase";
export async function POST(req: NextRequest) {
  try {
    const { id } = await req.json();
    const supabase = createAdminSupabaseClient();
    const { error } = await supabase.from("ads_v2").delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
