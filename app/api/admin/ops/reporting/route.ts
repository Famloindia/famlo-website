import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { getAdminCookieName, verifyAdminSessionToken } from "@/lib/admin-auth";
import { createAdminSupabaseClient } from "@/lib/supabase";

const num = (value: unknown) => (typeof value === "number" ? value : Number(value ?? 0));

export async function GET(): Promise<NextResponse> {
  try {
    const cookieStore = await cookies();
    const isAuthenticated = verifyAdminSessionToken(cookieStore.get(getAdminCookieName())?.value);
    if (!isAuthenticated) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createAdminSupabaseClient();
    const [syncLogs, notifications, conflicts, payouts, documents] = await Promise.all([
      supabase.from("calendar_sync_logs").select("status,events_seen,events_applied,conflicts_found").order("started_at", { ascending: false }).limit(100),
      supabase.from("notification_queue").select("status").order("created_at", { ascending: false }).limit(200),
      supabase.from("calendar_conflicts").select("status").order("created_at", { ascending: false }).limit(100),
      supabase.from("payouts_v2").select("status,amount").order("created_at", { ascending: false }).limit(200),
      supabase.from("document_exports").select("document_type,created_at").order("created_at", { ascending: false }).limit(200),
    ]);

    return NextResponse.json({
      syncMetrics: {
        totalRuns: syncLogs.data?.length ?? 0,
        failedRuns: (syncLogs.data ?? []).filter((row) => row.status === "failed").length,
        partialRuns: (syncLogs.data ?? []).filter((row) => row.status === "partial").length,
        eventsSeen: (syncLogs.data ?? []).reduce((sum, row) => sum + num(row.events_seen), 0),
        eventsApplied: (syncLogs.data ?? []).reduce((sum, row) => sum + num(row.events_applied), 0),
        conflictsFound: (syncLogs.data ?? []).reduce((sum, row) => sum + num(row.conflicts_found), 0),
      },
      notificationMetrics: {
        queued: (notifications.data ?? []).filter((row) => row.status === "pending").length,
        processed: (notifications.data ?? []).filter((row) => row.status === "processed").length,
        failed: (notifications.data ?? []).filter((row) => row.status === "failed").length,
      },
      conflictMetrics: {
        open: (conflicts.data ?? []).filter((row) => row.status === "open").length,
        resolved: (conflicts.data ?? []).filter((row) => row.status === "resolved").length,
      },
      payoutMetrics: {
        scheduledAmount: (payouts.data ?? []).filter((row) => row.status === "scheduled").reduce((sum, row) => sum + num(row.amount), 0),
        holdCount: (payouts.data ?? []).filter((row) => row.status === "on_hold").length,
        paidAmount: (payouts.data ?? []).filter((row) => row.status === "paid").reduce((sum, row) => sum + num(row.amount), 0),
      },
      documentMetrics: {
        generated: documents.data?.length ?? 0,
        latestTypes: Array.from(new Set((documents.data ?? []).map((row) => row.document_type))).slice(0, 10),
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load ops reporting." },
      { status: 500 }
    );
  }
}
