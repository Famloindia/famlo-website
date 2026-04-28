import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";

import { getAdminCookieName, verifyAdminSessionToken } from "@/lib/admin-auth";
import { createAdminSupabaseClient } from "@/lib/supabase";

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const cookieStore = await cookies();
    const isAuthenticated = verifyAdminSessionToken(cookieStore.get(getAdminCookieName())?.value);

    if (!isAuthenticated) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { userId } = (await request.json()) as { userId?: string };
    const cleanUserId = String(userId ?? "").trim();
    if (!cleanUserId) {
      return NextResponse.json({ error: "userId is required." }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();
    const nextSeed = randomUUID();

    const { error } = await supabase
      .from("users")
      .update({ guest_checkin_seed: nextSeed, updated_at: new Date().toISOString() } as never)
      .eq("id", cleanUserId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Guest check-in code reset failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not reset guest check-in code." },
      { status: 500 }
    );
  }
}
