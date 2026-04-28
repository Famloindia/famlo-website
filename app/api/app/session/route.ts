import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { createAdminSupabaseClient } from "@/lib/supabase";

export async function GET(): Promise<NextResponse> {
  const cookieStore = await cookies();
  const familyId = cookieStore.get("famlo_host_family_id")?.value ?? "";

  if (!familyId) {
    return NextResponse.json({
      hostSession: {
        active: false,
      },
    });
  }

  try {
    const supabase = createAdminSupabaseClient();
    const { data: family, error: familyError } = await supabase
      .from("families")
      .select("id,user_id,name")
      .eq("id", familyId)
      .maybeSingle();

    if (familyError) throw familyError;

    const { data: host, error: hostError } = await supabase
      .from("hosts")
      .select("id,user_id,display_name")
      .eq("legacy_family_id", familyId)
      .maybeSingle();

    if (hostError) throw hostError;

    return NextResponse.json({
      hostSession: {
        active: Boolean(family?.id),
        familyId: family?.id ?? familyId,
        hostUserId:
          (typeof host?.user_id === "string" && host.user_id.length > 0
            ? host.user_id
            : typeof family?.user_id === "string" && family.user_id.length > 0
              ? family.user_id
              : null),
        displayName:
          (typeof host?.display_name === "string" && host.display_name.length > 0
            ? host.display_name
            : typeof family?.name === "string" && family.name.length > 0
              ? family.name
              : "Famlo Host"),
        dashboardUrl: `/partnerslogin/home/dashboard?family=${encodeURIComponent(family?.id ?? familyId)}`,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to load app session.",
      },
      { status: 500 }
    );
  }
}

export async function DELETE(): Promise<NextResponse> {
  const response = NextResponse.json({ success: true });
  response.cookies.set("famlo_host_family_id", "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}
