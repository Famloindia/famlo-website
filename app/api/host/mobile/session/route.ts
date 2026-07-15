import { NextResponse } from "next/server";

import { resolveHostMobileSession } from "@/lib/host-mobile-session";
import { createAdminSupabaseClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

function logDuration(label: string, startedAt: number, status: number): void {
  if (process.env.NODE_ENV === "production") return;
  console.info(`${label} ${status} ${Date.now() - startedAt}ms`);
}

export async function GET(request: Request): Promise<NextResponse> {
  const startedAt = Date.now();
  try {
    const supabase = createAdminSupabaseClient();
    const session = await resolveHostMobileSession(supabase, request);
    const response = NextResponse.json(session);
    logDuration("[host.mobile.session]", startedAt, 200);
    return response;
  } catch (error) {
    const response = NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to resolve host mobile session.",
      },
      { status: 500 }
    );
    logDuration("[host.mobile.session]", startedAt, 500);
    return response;
  }
}
