import { NextRequest, NextResponse } from "next/server";

import { resolveAuthorizedHostResource } from "@/lib/host-access";
import { generateHostPricingSuggestions } from "@/lib/pricing-insights";
import { createAdminSupabaseClient } from "@/lib/supabase";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const hostId = String(request.nextUrl.searchParams.get("hostId") ?? "").trim();
    if (!hostId) {
      return NextResponse.json({ error: "hostId is required." }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();
    const hostAccess = await resolveAuthorizedHostResource(supabase, request, { hostId });
    if (!hostAccess) {
      return NextResponse.json({ error: "You do not have access to these pricing suggestions." }, { status: 403 });
    }
    const suggestions = await generateHostPricingSuggestions(supabase, hostId);
    return NextResponse.json({ suggestions });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate pricing suggestions." },
      { status: 500 }
    );
  }
}
