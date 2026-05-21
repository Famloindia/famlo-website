import { NextRequest, NextResponse } from "next/server";

import { hasValidAdminSession } from "@/lib/admin-auth";
import { isSettlementDebugApiEnabled } from "@/lib/finance/feature-flags";
import { createDraftHostSettlement } from "@/lib/finance/settlement-engine";
import { createAdminSupabaseClient } from "@/lib/supabase";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    if (!isSettlementDebugApiEnabled()) {
      return NextResponse.json({ error: "Settlement debug API is disabled." }, { status: 403 });
    }

    if (!(await hasValidAdminSession())) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as {
      hostId?: string;
      propertyId?: string | null;
      periodStart?: string;
      periodEnd?: string;
      includeOta?: boolean;
      dryRun?: boolean;
      forceNewDraft?: boolean;
      actorUserId?: string | null;
    };

    const hostId = String(body.hostId ?? "").trim();
    const propertyId = String(body.propertyId ?? "").trim() || null;
    const periodStart = String(body.periodStart ?? "").trim();
    const periodEnd = String(body.periodEnd ?? "").trim();

    if (!hostId || !periodStart || !periodEnd) {
      return NextResponse.json({ error: "hostId, periodStart, and periodEnd are required." }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();
    const result = await createDraftHostSettlement(supabase, {
      hostId,
      propertyId,
      periodStart,
      periodEnd,
      includeOta: Boolean(body.includeOta),
      dryRun: Boolean(body.dryRun),
      forceNewDraft: Boolean(body.forceNewDraft),
      actorUserId: body.actorUserId ?? null,
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create settlement draft." },
      { status: 500 }
    );
  }
}
