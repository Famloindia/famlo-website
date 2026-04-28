import { NextResponse } from "next/server";

import { getGuestCookieName } from "@/lib/guest-auth";
import { resolveAuthenticatedUser } from "@/lib/request-user";
import { createAdminSupabaseClient } from "@/lib/supabase";

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const supabase = createAdminSupabaseClient();
    const authUser = await resolveAuthenticatedUser(supabase, request);

    if (!authUser) {
      return NextResponse.json({ user: null });
    }

    const { data: profile } = await supabase
      .from("users")
      .select("email, phone")
      .eq("id", authUser.id)
      .maybeSingle();

    return NextResponse.json({
      user: {
        id: authUser.id,
        email: authUser.email ?? profile?.email ?? null,
        phone: authUser.phone ?? profile?.phone ?? null,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load auth session." },
      { status: 500 }
    );
  }
}

export async function DELETE(): Promise<NextResponse> {
  const response = NextResponse.json({ success: true });
  response.cookies.set(getGuestCookieName(), "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}
