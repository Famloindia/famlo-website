import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import { getAdminCookieName, verifyAdminSessionToken } from "@/lib/admin-auth";
import { ensureInvoiceForBooking } from "@/lib/finance/operations";
import { createAdminSupabaseClient } from "@/lib/supabase";

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const cookieStore = await cookies();
    const isAuthenticated = verifyAdminSessionToken(cookieStore.get(getAdminCookieName())?.value);
    if (!isAuthenticated) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as { bookingId?: string; adminId?: string };
    const bookingId = String(body.bookingId ?? "").trim();
    const adminId = String(body.adminId ?? "").trim() || null;
    if (!bookingId) {
      return NextResponse.json({ error: "bookingId is required." }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();
    const invoiceId = await ensureInvoiceForBooking(supabase, {
      bookingId,
      actorUserId: adminId,
    });

    return NextResponse.json({ success: true, invoiceId });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create invoice." },
      { status: 500 }
    );
  }
}
