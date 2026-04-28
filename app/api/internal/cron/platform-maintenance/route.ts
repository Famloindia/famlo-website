import { NextRequest, NextResponse } from "next/server";

import { expireBookingHolds, processNotificationQueue } from "@/lib/booking-platform";
import { createAdminSupabaseClient } from "@/lib/supabase";

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const bearer = request.headers.get("authorization");
  const query = request.nextUrl.searchParams.get("secret");
  return bearer === `Bearer ${secret}` || query === secret;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createAdminSupabaseClient();
    const [holds, notifications] = await Promise.all([
      expireBookingHolds(supabase),
      processNotificationQueue(supabase),
    ]);

    return NextResponse.json({
      success: true,
      holds,
      notifications,
      ranAt: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to run maintenance cron." },
      { status: 500 }
    );
  }
}
