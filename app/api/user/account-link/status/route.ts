import { NextResponse } from "next/server";

import { createSafeAccountLinkResponse } from "@/lib/auth/account-linking";
import { resolveStrictAuthenticatedUser } from "@/lib/request-user";
import { createAdminSupabaseClient } from "@/lib/supabase";

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const supabase = createAdminSupabaseClient();
    const target = await resolveStrictAuthenticatedUser(supabase, request);
    if (!target) {
      return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
    }
    const requestId = new URL(request.url).searchParams.get("requestId")?.trim();
    if (!requestId) {
      return NextResponse.json({ error: "Link request is required." }, { status: 400 });
    }

    const { data: linkRequest, error } = await supabase
      .from("account_link_requests")
      .select(
        "id,target_user_id,status,intended_return_path,source_has_business_data,target_has_business_data,ownership_verified_at"
      )
      .eq("id", requestId)
      .eq("target_user_id", target.id)
      .not("ownership_verified_at", "is", null)
      .maybeSingle();
    if (error || !linkRequest) {
      return NextResponse.json({ error: "Link request was not found." }, { status: 404 });
    }

    return NextResponse.json({
      ...createSafeAccountLinkResponse({
        requestId: linkRequest.id,
        status: linkRequest.status,
        intendedReturnPath: linkRequest.intended_return_path,
        sourceHasBusinessData: linkRequest.source_has_business_data,
        targetHasBusinessData: linkRequest.target_has_business_data,
      }),
      targetSupabaseSessionVerified: target.authKind === "supabase",
    });
  } catch (error) {
    console.error("Account-link status failed", {
      name: error instanceof Error ? error.name : "Error",
    });
    return NextResponse.json(
      { error: "Link status could not be loaded." },
      { status: 500 }
    );
  }
}
