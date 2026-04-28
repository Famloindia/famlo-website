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
  const { data: family } = userId
    ? await supabase
        .from("families")
        .select("id")
        .eq("user_id", userId)
        .limit(1)
        .maybeSingle()
    : { data: null };

  if (family?.id) {
    const response = NextResponse.json({
      ok: true,
      redirect: `/partnerslogin/home/dashboard?family=${family.id}`,
    });

    response.cookies.set("famlo_host_family_id", family.id, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });

    return response;
  }

  const { data: v2Hommie } = await supabase
    .from("hommie_profiles_v2")
    .select("id,slug,legacy_hommie_id")
    .or([userId ? `user_id.eq.${userId}` : null, email ? `email.eq.${email}` : null].filter(Boolean).join(","))
    .eq("status", "published")
    .limit(1)
    .maybeSingle();

  if (v2Hommie?.id) {
    const redirectSlug =
      typeof v2Hommie.slug === "string" && v2Hommie.slug.length > 0
        ? v2Hommie.slug
        : typeof v2Hommie.legacy_hommie_id === "string" && v2Hommie.legacy_hommie_id.length > 0
          ? v2Hommie.legacy_hommie_id
          : String(v2Hommie.id);

    return NextResponse.json({
      ok: true,
      redirect: `/partnerslogin/hommie/dashboard?slug=${redirectSlug}`
    });
  }

  return NextResponse.json(
    { error: "No approved hommie partner account was found for this login." },
    { status: 404 }
  );
}
