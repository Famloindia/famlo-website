import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import { getAdminCookieName, verifyAdminSessionToken } from "@/lib/admin-auth";
import { sendInvoiceEmail } from "@/lib/notifications/email/finance-email-service";
import { createAdminSupabaseClient } from "@/lib/supabase";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const cookieStore = await cookies();
    const isAuthenticated = verifyAdminSessionToken(cookieStore.get(getAdminCookieName())?.value);
    if (!isAuthenticated) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as { creditNoteId?: string };
    const creditNoteId = String(body.creditNoteId ?? "").trim();
    if (!creditNoteId) {
      return NextResponse.json({ error: "creditNoteId is required." }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();
    const result = await sendInvoiceEmail(supabase, { invoiceId: creditNoteId });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to send credit note email." },
      { status: 500 }
    );
  }
}
