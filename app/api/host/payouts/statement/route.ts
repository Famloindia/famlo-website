import { NextRequest, NextResponse } from "next/server";

import { hasValidAdminSession } from "@/lib/admin-auth";
import { buildPayoutStatementDocument } from "@/lib/booking-platform";
import { resolveAuthorizedHostResource } from "@/lib/host-access";
import { createAdminSupabaseClient } from "@/lib/supabase";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const payoutId = String(request.nextUrl.searchParams.get("payoutId") ?? "").trim();
    if (!payoutId) {
      return NextResponse.json({ error: "payoutId is required." }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();
    let isAdmin = false;
    try {
      isAdmin = await hasValidAdminSession();
    } catch {
      isAdmin = false;
    }

    if (!isAdmin) {
      const { data: payout, error: payoutError } = await supabase
        .from("payouts_v2")
        .select("id,partner_type,partner_user_id")
        .eq("id", payoutId)
        .maybeSingle();
      if (payoutError) throw payoutError;
      if (!payout) {
        return NextResponse.json({ error: "Payout not found." }, { status: 404 });
      }

      const { data: host } =
        typeof payout.partner_user_id === "string" && payout.partner_user_id.length > 0
          ? await supabase
              .from("hosts")
              .select("id,legacy_family_id")
              .eq("user_id", payout.partner_user_id)
              .maybeSingle()
          : { data: null };

      const hostAccess = await resolveAuthorizedHostResource(supabase, request, {
        hostId: typeof host?.id === "string" ? host.id : null,
        familyId: typeof host?.legacy_family_id === "string" ? host.legacy_family_id : null,
      });
      if (!hostAccess) {
        return NextResponse.json({ error: "You do not have access to this payout statement." }, { status: 403 });
      }
    }

    const document = await buildPayoutStatementDocument(supabase, payoutId);
    return new NextResponse(document.html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to build payout statement." },
      { status: 500 }
    );
  }
}
