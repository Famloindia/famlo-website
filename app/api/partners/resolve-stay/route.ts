import { NextResponse } from "next/server";

import { createAdminSupabaseClient } from "@/lib/supabase";

export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as {
    email?: string;
    userId?: string;
  };

  const email = String(body.email ?? "").trim().toLowerCase();
  const userId = String(body.userId ?? "").trim();

  if (!email) {
    return NextResponse.json({ error: "Approved email is required." }, { status: 400 });
  }

  const supabase = createAdminSupabaseClient();

  const { data: hommie } = await supabase
    .from("hommies")
    .select("slug")
    .or(`host_user_id.eq.${userId},email.eq.${email}`)
    .eq("is_approved", true)
    .limit(1)
    .maybeSingle();
  const hommieRow = hommie as { slug: string | null } | null;

  if (hommieRow?.slug) {
    return NextResponse.json({
      ok: true,
      redirect: `/app/partnerslogin/hommie/dashboard?slug=${hommieRow.slug}`
    });
  }

  return NextResponse.json({ error: "No approved hommie partner account was found for this login." }, { status: 404 });
}
