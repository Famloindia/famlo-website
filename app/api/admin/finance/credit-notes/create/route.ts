import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import { getAdminCookieName, verifyAdminSessionToken } from "@/lib/admin-auth";
import { ensureCreditNoteForRefund } from "@/lib/finance/operations";
import { createAdminSupabaseClient } from "@/lib/supabase";

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const cookieStore = await cookies();
    const isAuthenticated = verifyAdminSessionToken(cookieStore.get(getAdminCookieName())?.value);
    if (!isAuthenticated) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as { refundId?: string; adminId?: string };
    const refundId = String(body.refundId ?? "").trim();
    const adminId = String(body.adminId ?? "").trim() || null;
    if (!refundId) {
      return NextResponse.json({ error: "refundId is required." }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();
    const creditNoteId = await ensureCreditNoteForRefund(supabase, {
      refundId,
      actorUserId: adminId,
    });

    return NextResponse.json({ success: true, creditNoteId });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create credit note." },
      { status: 500 }
    );
  }
}
