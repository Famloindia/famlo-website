import { NextRequest, NextResponse } from "next/server";

import { resolveAuthorizedHostSession } from "@/lib/chat-access";
import { resolveAuthorizedHostResource } from "@/lib/host-access";
import { loadFamloProCheckoutAccess } from "@/lib/host-pro-checkout-policy";
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
    const selectedFamilyId =
      (Array.isArray(body.selections) && body.selections.length > 0 ? body.selections[0]?.familyId : null) ??
      hostSession.familyId ??
      null;

    if (!selectedFamilyId) {
      return NextResponse.json({ error: "Missing family_id." }, { status: 400 });
    }

    const hostAccess = await resolveAuthorizedHostResource(supabase, request, { familyId: selectedFamilyId });
    if (!hostAccess) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const proPurchaseAccess = await loadFamloProCheckoutAccess(supabase, hostAccess.familyId ?? selectedFamilyId);
    if (!proPurchaseAccess.allowed) {
      return NextResponse.json(
        { error: "Famlo Pro checkout is blocked for this property.", reason: proPurchaseAccess.reason },
        { status: 403 }
      );
    }

    const checkout = await createHostProAutopayCheckout(supabase, {
      hostUserId: hostSession.hostUserId,
      sourceFamilyId: hostAccess.familyId ?? selectedFamilyId,
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
