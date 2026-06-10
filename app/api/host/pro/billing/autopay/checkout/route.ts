import { NextRequest, NextResponse } from "next/server";

import { resolveAuthorizedHostSession } from "@/lib/chat-access";
import { createHostProAutopayCheckout } from "@/lib/pro-billing/service";
import type { ProBillingPropertySelectionInput } from "@/lib/pro-billing/types";
import { createAdminSupabaseClient } from "@/lib/supabase";

type CheckoutBody = {
  selections?: ProBillingPropertySelectionInput[];
};

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const supabase = createAdminSupabaseClient();
    const hostSession = await resolveAuthorizedHostSession(supabase, request);

    if (!hostSession?.hostUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as CheckoutBody;
    const checkout = await createHostProAutopayCheckout(supabase, {
      hostUserId: hostSession.hostUserId,
      sourceFamilyId: hostSession.familyId,
      selections: body.selections ?? [],
    });

    return NextResponse.json(checkout);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create Famlo Pro autopay checkout." },
      { status: 400 }
    );
  }
}
