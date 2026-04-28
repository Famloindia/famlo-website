import { NextRequest, NextResponse } from "next/server";
import { hasValidBackofficeSession } from "@/lib/admin-auth";
import { createAdminSupabaseClient } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  if (!(await hasValidBackofficeSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { image_url, alt_text, sort_order } = await req.json();
  if (!image_url) return NextResponse.json({ error: "Image URL required" }, { status: 400 });
  const supabase = createAdminSupabaseClient();
  const { error } = await supabase.from("hero_banners").insert({ image_url, alt_text, sort_order, is_active: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
