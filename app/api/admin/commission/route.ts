// app/api/admin/commission/route.ts
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getAdminCookieName, verifyAdminSessionToken } from "@/lib/admin-auth";
import { DEFAULT_COMMISSION_PCT } from "@/lib/finance/constants";
import { createAdminSupabaseClient } from "@/lib/supabase";
import { logAuditAction } from "@/lib/audit";

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const isAuthenticated = verifyAdminSessionToken(cookieStore.get(getAdminCookieName())?.value);

    if (!isAuthenticated) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { userId, newRate, oldRate } = await request.json();

    if (typeof userId !== "string" || !userId.trim()) {
      return NextResponse.json({ error: "Valid userId is required." }, { status: 400 });
    }

    if (typeof newRate !== "number" || Number(newRate) !== DEFAULT_COMMISSION_PCT) {
      return NextResponse.json(
        {
          error: `Manual commission overrides are disabled. Famlo OTA uses a flat ${DEFAULT_COMMISSION_PCT}% commission.`,
        },
        { status: 409 }
      );
    }

    const supabase = createAdminSupabaseClient();

    const { error: updateError } = await supabase
      .from("users")
      .update({ commission_rate_override: null })
      .eq("id", userId);

    if (updateError) {
      throw updateError;
    }

    // Immutable audit log entry
    await logAuditAction({
      actorId: "system-admin",
      actorRole: "admin",
      actionType: "commission_change",
      targetUserId: userId,
      resourceType: "commission_rate_override",
      oldValue: { rate: oldRate },
      newValue: { rate: DEFAULT_COMMISSION_PCT, override_cleared: true },
      reason: "flat_commission_enforced",
    });

    return NextResponse.json({ success: true, effectiveRate: DEFAULT_COMMISSION_PCT, overrideCleared: true });
  } catch (err) {
    console.error("Commission update failed:", err);
    return NextResponse.json({ error: "Failed to update commission rate" }, { status: 500 });
  }
}
