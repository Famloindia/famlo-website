import { NextResponse } from "next/server";

import { hasAdminPermission } from "@/lib/admin-auth";
import { loadChannelOpsReadiness } from "@/lib/channel-ops-readiness";
import { createAdminSupabaseClient } from "@/lib/supabase";

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const canAccess = (await hasAdminPermission("channels")) || (await hasAdminPermission("ops"));
    if (!canAccess) {
      return NextResponse.json({ ok: false, error: "Admin channel or ops access is required." }, { status: 403 });
    }

    const url = new URL(request.url);
    const familyId = asString(url.searchParams.get("familyId"));
    const lookbackHours = Math.max(1, Math.min(Number(url.searchParams.get("lookbackHours") ?? 24), 168));
    const supabase = createAdminSupabaseClient();
    const readiness = await loadChannelOpsReadiness(supabase, { familyId, lookbackHours });

    return NextResponse.json({ ok: true, readiness });
  } catch (error) {
    console.error("[admin.channels.ops] failed:", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to load channel operations readiness." },
      { status: 500 }
    );
  }
}
