import { NextRequest, NextResponse } from "next/server";

import { processBookingActionJobBatch } from "@/lib/booking-whatsapp-actions";
import { processNotificationQueueBatch } from "@/lib/notifications/notification-worker";
import { createAdminSupabaseClient } from "@/lib/supabase";

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const startedAt = Date.now();
  try {
    const supabase = createAdminSupabaseClient();
    const [notifications, bookingActions] = await Promise.all([
      processNotificationQueueBatch(supabase, { batchSize: 25, maxDurationMs: 20_000 }),
      processBookingActionJobBatch(supabase),
    ]);
    return NextResponse.json({
      success: true,
      notifications,
      bookingActions,
      durationMs: Date.now() - startedAt,
    });
  } catch {
    return NextResponse.json(
      { error: "Notification processing failed.", durationMs: Date.now() - startedAt },
      { status: 500 }
    );
  }
}
