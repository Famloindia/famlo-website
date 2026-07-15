import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { getAdminCookieName, verifyAdminSessionToken } from "@/lib/admin-auth";
import { createAdminSupabaseClient } from "@/lib/supabase";

function readNumber(value: unknown): number {
  return typeof value === "number" ? value : Number(value ?? 0);
}

export async function GET(): Promise<NextResponse> {
  try {
    const cookieStore = await cookies();
    const isAuthenticated = verifyAdminSessionToken(cookieStore.get(getAdminCookieName())?.value);
    if (!isAuthenticated) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createAdminSupabaseClient();
    const [holdsRes, conflictsRes, syncsRes, paymentsRes] = await Promise.all([
      supabase.from("bookings_v2").select("id").eq("status", "awaiting_payment"),
      supabase.from("calendar_conflicts").select("id").eq("status", "open"),
      supabase.from("calendar_sync_logs").select("id,status").order("started_at", { ascending: false }).limit(50),
      supabase.from("reconciliation_runs").select("id,status").neq("status", "matched"),
    ]);

    return NextResponse.json({
      staleHoldCount: holdsRes.data?.length ?? 0,
      openCalendarConflictCount: conflictsRes.data?.length ?? 0,
      failedSyncCount: (syncsRes.data ?? []).filter((row) => row.status === "failed").length,
      unreconciledPaymentCount: paymentsRes.data?.length ?? 0,
      syncHealth: {
        success: (syncsRes.data ?? []).filter((row) => row.status === "success").length,
        partial: (syncsRes.data ?? []).filter((row) => row.status === "partial").length,
        failed: (syncsRes.data ?? []).filter((row) => row.status === "failed").length,
      },
      riskScore:
        readNumber(holdsRes.data?.length) * 2 +
        readNumber(conflictsRes.data?.length) * 3 +
        (syncsRes.data ?? []).filter((row) => row.status === "failed").length * 2 +
        readNumber(paymentsRes.data?.length),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load inventory health." },
      { status: 500 }
    );
  }
}
