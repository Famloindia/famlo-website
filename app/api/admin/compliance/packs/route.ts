import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import { getAdminCookieName, verifyAdminSessionToken } from "@/lib/admin-auth";
import { buildAnnualCompliancePack } from "@/lib/booking-platform";
import { createAdminSupabaseClient } from "@/lib/supabase";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const cookieStore = await cookies();
    const isAuthenticated = verifyAdminSessionToken(cookieStore.get(getAdminCookieName())?.value);
    if (!isAuthenticated) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const hostUserId = String(request.nextUrl.searchParams.get("hostUserId") ?? "").trim();
    const year = Number(request.nextUrl.searchParams.get("year") ?? new Date().getFullYear());
    if (!hostUserId) {
      return NextResponse.json({ error: "hostUserId is required." }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();
    const pack = await buildAnnualCompliancePack(supabase, { hostUserId, year });
    await supabase.from("document_exports").insert({
      document_type: "annual_compliance_pack",
      owner_user_id: hostUserId,
      access_scope: "admin",
      payload: pack.payload,
    });
    return new NextResponse(pack.html, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to build annual compliance pack." },
      { status: 500 }
    );
  }
}
