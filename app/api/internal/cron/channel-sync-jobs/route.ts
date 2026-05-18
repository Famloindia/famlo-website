import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import { getAdminCookieName, verifyAdminSessionToken } from "@/lib/admin-auth";
import { processDueChannelSyncJobs } from "@/lib/channel-provider-framework";
import { createAdminSupabaseClient } from "@/lib/supabase";

async function isAuthorized(request: NextRequest): Promise<boolean> {
  const secret = process.env.CRON_SECRET?.trim();
  const bearer = request.headers.get("authorization");
  const query = request.nextUrl.searchParams.get("secret");
  if (secret && (bearer === `Bearer ${secret}` || query === secret)) return true;

  const cookieStore = await cookies();
  return verifyAdminSessionToken(cookieStore.get(getAdminCookieName())?.value);
}

async function handleRequest(request: NextRequest): Promise<NextResponse> {
  try {
    if (!(await isAuthorized(request))) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const limit = Math.max(1, Math.min(Number(request.nextUrl.searchParams.get("limit") ?? 10), 50));
    const workerId = request.nextUrl.searchParams.get("workerId")?.trim() || "channel-sync-cron";
    const supabase = createAdminSupabaseClient();
    const result = await processDueChannelSyncJobs(supabase, { limit, workerId });

    return NextResponse.json({
      ok: true,
      ...result,
      ranAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[internal.cron.channel-sync-jobs] failed:", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to process channel sync jobs." },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  return handleRequest(request);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return handleRequest(request);
}
