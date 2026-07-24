import { createHash } from "node:crypto";
import { NextResponse } from "next/server";

import { resolvePublicPropertyMedia } from "@/lib/property-public-media";
import { createAdminSupabaseClient } from "@/lib/supabase";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json().catch(() => ({}))) as { familyId?: unknown; reelId?: unknown };
  const familyId = typeof body.familyId === "string" ? body.familyId.trim() : "";
  const reelId = typeof body.reelId === "string" ? body.reelId.trim() : "";

  if (!UUID_PATTERN.test(familyId) || !reelId || reelId.length > 180) {
    return NextResponse.json({ error: "A valid family and reel are required." }, { status: 400 });
  }

  const cookieKey = `famlo_reel_${createHash("sha1").update(`${familyId}:${reelId}`).digest("hex").slice(0, 20)}`;
  const cookieHeader = request.headers.get("cookie") ?? "";
  if (cookieHeader.split(";").some((part) => part.trim().startsWith(`${cookieKey}=`))) {
    return NextResponse.json({ ok: true, counted: false });
  }

  const supabase = createAdminSupabaseClient();
  const { data: family, error: familyError } = await supabase
    .from("families")
    .select("id,is_active,is_accepting")
    .eq("id", familyId)
    .maybeSingle();
  if (familyError) throw familyError;
  if (!family || family.is_active === false || family.is_accepting === false) {
    return NextResponse.json({ error: "Reel not found." }, { status: 404 });
  }

  const media = await resolvePublicPropertyMedia(supabase, {
    familyId,
    debugContext: "public-reel-view",
  });
  if (!media.reels.some((reel) => reel.id === reelId)) {
    return NextResponse.json({ error: "Reel not found." }, { status: 404 });
  }

  const { data, error } = await supabase.rpc("increment_reel_view_count", {
    p_family_id: familyId,
    p_reel_key: reelId,
  });
  if (error) {
    console.error("[public-reel-view] increment failed", { familyId, reelId, message: error.message });
    return NextResponse.json({ error: "Unable to record reel view." }, { status: 500 });
  }

  const response = NextResponse.json({ ok: true, counted: true, viewCount: Number(data ?? 0) });
  response.cookies.set(cookieKey, "1", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24,
    path: "/",
  });
  return response;
}
