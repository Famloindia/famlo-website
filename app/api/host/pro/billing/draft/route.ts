import { NextRequest, NextResponse } from "next/server";

import { resolveAuthorizedHostSession } from "@/lib/chat-access";
import { resolveAuthorizedHostResource } from "@/lib/host-access";
import { buildHostProBillingDraft } from "@/lib/pro-billing/service";
import type { ProBillingPropertySelectionInput } from "@/lib/pro-billing/types";
import { createAdminSupabaseClient } from "@/lib/supabase";

type DraftBody = {
  family_id?: string;
  selections?: ProBillingPropertySelectionInput[];
  duration_months?: number;
};

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const supabase = createAdminSupabaseClient();
    const hostSession = await resolveAuthorizedHostSession(supabase, request);
    const body = (await request.json()) as DraftBody;
    const selectedFamilyId =
      body.family_id ??
      (Array.isArray(body.selections) && body.selections.length > 0 ? body.selections[0]?.familyId : null) ??
      hostSession?.familyId ??
      null;

    if (!selectedFamilyId) {
      return NextResponse.json({ error: "Missing family_id." }, { status: 400 });
    }

    const hostAccess = await resolveAuthorizedHostResource(supabase, request, { familyId: selectedFamilyId });
    if (!hostAccess) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const resolvedHostUserId = hostAccess.hostUserId ?? hostSession?.hostUserId ?? "";
    if (process.env.NODE_ENV !== "production") {
      console.info("[host.pro.billing.draft] request", {
        hostUserId: resolvedHostUserId || null,
        authUserId: hostSession?.authUserId ?? null,
        selectedFamilyId,
        resolvedFamilyId: hostAccess.familyId,
        selections: body.selections ?? [],
        durationMonths: body.duration_months ?? 1,
      });
    }
    const draft = await buildHostProBillingDraft(supabase, {
      hostUserId: resolvedHostUserId,
      sourceFamilyId: hostAccess.familyId ?? selectedFamilyId,
      selections: body.selections ?? [],
      durationMonths: body.duration_months ?? 1,
    });

    return NextResponse.json(draft);
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error("[host.pro.billing.draft] failed", {
        name: error instanceof Error ? error.name : "UnknownError",
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack ?? null : null,
      });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to build Famlo Pro billing draft." },
      { status: 400 }
    );
  }
}
