import { NextResponse } from "next/server";

import { createAdminSupabaseClient } from "@/lib/supabase";

export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as {
    partnerId?: string;
    email?: string;
    newPassword?: string;
  };

  const partnerId = String(body.partnerId ?? "").trim().toUpperCase();
  const email = String(body.email ?? "").trim().toLowerCase();
  const newPassword = String(body.newPassword ?? "").trim();

  if (!partnerId || !email || !newPassword) {
    return NextResponse.json({ error: "Partner ID, approved email, and new password are required." }, { status: 400 });
  }

  const supabase = createAdminSupabaseClient();

  const { data: family } = await supabase
    .from("families")
    .select("id, user_id")
    .eq("host_id", partnerId)
    .maybeSingle();
  const familyRow = family as { id: string; user_id: string | null } | null;

  if (familyRow?.user_id) {
    const { data: userRecord } = await supabase
      .from("users")
      .select("email")
      .eq("id", familyRow.user_id)
      .maybeSingle();
    const userRow = userRecord as { email: string | null } | null;

    if (String(userRow?.email ?? "").toLowerCase() === email) {
      const { error } = await supabase
        .from("families")
        .update({ host_password: newPassword, password: newPassword } as never)
        .eq("id", familyRow.id);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ ok: true });
    }
  }

  return NextResponse.json({ error: "That partner ID and approved email do not match any Famlo Homes host." }, { status: 404 });
}
