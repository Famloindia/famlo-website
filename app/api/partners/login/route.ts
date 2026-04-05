import { NextResponse } from "next/server";

import { createAdminSupabaseClient } from "@/lib/supabase";

export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as {
    identifier?: string;
    password?: string;
  };

  const identifier = String(body.identifier ?? "").trim().toUpperCase();
  const password = String(body.password ?? "").trim();

  if (!identifier || !password) {
    return NextResponse.json({ error: "Partner ID and password are required." }, { status: 400 });
  }

  const supabase = createAdminSupabaseClient();

  const { data: family, error } = await supabase
    .from("families")
    .select("id, host_password, host_phone")
    .eq("host_id", identifier)
    .maybeSingle();
  const familyRow = family as { id: string; host_password: string | null; host_phone: string | null } | null;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!familyRow) {
    return NextResponse.json({ error: "Partner ID or password is incorrect." }, { status: 401 });
  }

  const fallbackPassword =
    typeof familyRow.host_phone === "string" && familyRow.host_phone.length >= 4
      ? `famlo${familyRow.host_phone.slice(-4)}`
      : "";

  const isMatch =
    password === String(familyRow.host_password ?? "") ||
    (fallbackPassword.length > 0 && password === fallbackPassword);

  if (!isMatch) {
    return NextResponse.json({ error: "Partner ID or password is incorrect." }, { status: 401 });
  }

  const response = NextResponse.json({
    ok: true,
    redirect: `/app/partnerslogin/home/dashboard?family=${familyRow.id}`
  });

  response.cookies.set("famlo_host_family_id", familyRow.id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30
  });

  return response;
}
