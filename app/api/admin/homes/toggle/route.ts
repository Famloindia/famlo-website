import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import {
  getAdminCookieName,
  verifyAdminSessionToken
} from "../../../../../lib/admin-auth";
import { createAdminSupabaseClient } from "../../../../../lib/supabase";
import type { Home } from "../../../../../lib/types";

export async function POST(request: Request): Promise<NextResponse> {
  const cookieStore = await cookies();
  const isAuthenticated = verifyAdminSessionToken(
    cookieStore.get(getAdminCookieName())?.value
  );

  if (!isAuthenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as { homeId?: string; isActive?: boolean };
  if (!body.homeId || typeof body.isActive !== "boolean") {
    return NextResponse.json({ error: "Missing home data." }, { status: 400 });
  }

  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("homes")
    .update({ is_active: body.isActive } as never)
    .eq("id", body.homeId)
    .select("*")
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "Unable to update listing." },
      { status: 500 }
    );
  }

  return NextResponse.json({ home: data as Home });
}
