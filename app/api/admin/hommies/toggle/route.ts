import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import {
  getAdminCookieName,
  verifyAdminSessionToken
} from "../../../../../lib/admin-auth";
import { createAdminSupabaseClient } from "../../../../../lib/supabase";
import type { Hommie } from "../../../../../lib/types";

export async function POST(request: Request): Promise<NextResponse> {
  const cookieStore = await cookies();
  const isAuthenticated = verifyAdminSessionToken(
    cookieStore.get(getAdminCookieName())?.value
  );

  if (!isAuthenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as {
    hommieId?: string;
    isActive?: boolean;
  };

  if (!body.hommieId || typeof body.isActive !== "boolean") {
    return NextResponse.json({ error: "Missing hommie data." }, { status: 400 });
  }

  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("hommies")
    .update({ is_active: body.isActive } as never)
    .eq("id", body.hommieId)
    .select("*")
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "Unable to update listing." },
      { status: 500 }
    );
  }

  return NextResponse.json({ hommie: data as Hommie });
}
