import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import { getAdminCookieName, verifyAdminSessionToken } from "@/lib/admin-auth";
import { generateCreditNote } from "@/lib/finance/invoices/credit-note-engine";
import { isTaxComplianceGuardError } from "@/lib/finance/tax-compliance-guard";
import { createAdminSupabaseClient } from "@/lib/supabase";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const cookieStore = await cookies();
    const isAuthenticated = verifyAdminSessionToken(cookieStore.get(getAdminCookieName())?.value);
    if (!isAuthenticated) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as {
      bookingId?: string;
      refundId?: string;
      reason?: string;
      policyInput?: Record<string, unknown>;
      adminId?: string | null;
    };
    const bookingId = String(body.bookingId ?? "").trim();
    const refundId = String(body.refundId ?? "").trim();
    if (!bookingId || !refundId || !body.policyInput) {
      return NextResponse.json({ error: "bookingId, refundId, and policyInput are required." }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();
    const creditNoteId = await generateCreditNote(supabase, {
      bookingId,
      refundId,
      reason: String(body.reason ?? "refund_adjustment").trim() || "refund_adjustment",
      policyInput: body.policyInput as any,
      actorUserId: body.adminId ?? null,
    });
    return NextResponse.json({ success: true, creditNoteId });
  } catch (error) {
    if (isTaxComplianceGuardError(error)) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate credit note." },
      { status: 500 }
    );
  }
}
