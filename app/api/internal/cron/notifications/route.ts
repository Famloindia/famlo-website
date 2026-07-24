import { NextRequest, NextResponse } from "next/server";

import { processBookingActionJobBatch } from "@/lib/booking-whatsapp-actions";
import { processNotificationQueueBatch } from "@/lib/notifications/notification-worker";
import { createAdminSupabaseClient } from "@/lib/supabase";

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

function workerSource(request: NextRequest): string {
  const source = request.headers.get("x-famlo-worker-source")?.trim();
  return source === "supabase_pg_cron" || source === "vercel_cron" ? source : "manual";
}

async function run(request: NextRequest): Promise<NextResponse> {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const startedAt = Date.now();
  const source = workerSource(request);
  const supabase = createAdminSupabaseClient();
  try {
    const [notifications, bookingActions] = await Promise.all([
      processNotificationQueueBatch(supabase, { batchSize: 25, maxDurationMs: 20_000 }),
      processBookingActionJobBatch(supabase),
    ]);
    const durationMs = Date.now() - startedAt;
    await supabase.from("notification_worker_runs").insert({
      source,
      status: "completed",
      claimed_count: notifications.claimed,
      processed_count: notifications.processed,
      failed_count: notifications.failed,
      retried_count: notifications.retried,
      skipped_count: notifications.skipped,
      booking_processed_count: bookingActions.processed,
      booking_failed_count: bookingActions.failed,
      booking_ignored_count: bookingActions.ignored,
      duration_ms: durationMs,
    } as never);
    return NextResponse.json({
      success: true,
      notifications,
      bookingActions,
      durationMs,
    });
  } catch {
    const durationMs = Date.now() - startedAt;
    try {
      await supabase.from("notification_worker_runs").insert({
        source,
        status: "failed",
        duration_ms: durationMs,
        error_category: "worker_execution_failed",
      } as never);
    } catch {
      // Metrics must not mask the worker failure response.
    }
    return NextResponse.json(
      { error: "Notification processing failed.", durationMs },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  return run(request);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return run(request);
}
