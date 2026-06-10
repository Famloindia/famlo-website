import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import { getAdminCookieName, verifyAdminSessionToken } from "@/lib/admin-auth";
import { generateGuestTaxInvoice } from "@/lib/finance/invoices/guest-tax-invoice-engine";
import { isTaxComplianceGuardError } from "@/lib/finance/tax-compliance-guard";
import { createAdminSupabaseClient } from "@/lib/supabase";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const cookieStore = await cookies();
    const isAuthenticated = verifyAdminSessionToken(cookieStore.get(getAdminCookieName())?.value);
    if (!isAuthenticated) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as { bookingId?: string; adminId?: string | null };
    const bookingId = String(body.bookingId ?? "").trim();
    if (!bookingId) {
      return NextResponse.json({ error: "bookingId is required." }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();
    const invoiceId = await generateGuestTaxInvoice(supabase, {
      bookingId,
      actorUserId: body.adminId ?? null,
    });
    return NextResponse.json({ success: true, invoiceId });
  } catch (error) {
    if (isTaxComplianceGuardError(error)) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate guest tax invoice." },
      { status: 500 }
    );
  }
}
