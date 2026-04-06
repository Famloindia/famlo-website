import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import {
  getAdminCookieName,
  verifyAdminSessionToken
} from "../../../../lib/admin-auth";
import { createAdminSupabaseClient } from "../../../../lib/supabase";

export async function POST(request: Request): Promise<NextResponse> {
  const cookieStore = cookies();
  const isAuthenticated = verifyAdminSessionToken(
    cookieStore.get(getAdminCookieName())?.value
  );

  if (!isAuthenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as Record<string, number>;
  const supabase = createAdminSupabaseClient();

  const { data, error } = await supabase
    .from("admin_platform_settings")
    .upsert({
      id: "default",
      ...body
    } as never)
    .select("*")
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "Unable to save settings." },
      { status: 500 }
    );
  }

  return NextResponse.json({ settings: data });
}
