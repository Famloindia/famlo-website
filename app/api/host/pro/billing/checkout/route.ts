import { NextRequest, NextResponse } from "next/server";

import { resolveAuthorizedHostSession } from "@/lib/chat-access";
import { resolveAuthorizedHostResource } from "@/lib/host-access";
import { loadFamloProCheckoutAccess } from "@/lib/host-pro-checkout-policy";
import { createHostProBillingCheckout } from "@/lib/pro-billing/service";
import type { ProBillingPropertySelectionInput } from "@/lib/pro-billing/types";
import { createAdminSupabaseClient } from "@/lib/supabase";

type CheckoutBody = {
  family_id?: string;
  selections?: ProBillingPropertySelectionInput[];
  duration_months?: number;
};

function logStep(startedAt: number, step: string, extra?: Record<string, unknown>): void {
  if (process.env.NODE_ENV === "production") return;
  console.info("[host.pro.billing.checkout] timing", {
    step,
    ms: Date.now() - startedAt,
    ...extra,
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const startedAt = Date.now();
  try {
    const supabase = createAdminSupabaseClient();
    const hostSession = await resolveAuthorizedHostSession(supabase, request);
    logStep(startedAt, "auth/session", { hasHostSession: Boolean(hostSession?.hostUserId) });
    const body = (await request.json()) as CheckoutBody;
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
    logStep(startedAt, "host_access", { familyId: hostAccess.familyId ?? selectedFamilyId });

    const proPurchaseAccess = await loadFamloProCheckoutAccess(supabase, hostAccess.familyId ?? selectedFamilyId);
    if (!proPurchaseAccess.allowed) {
      return NextResponse.json(
        { error: "Famlo Pro checkout is blocked for this property.", reason: proPurchaseAccess.reason },
        { status: 403 }
      );
    }
    logStep(startedAt, "validation", { allowed: proPurchaseAccess.allowed });

    const resolvedHostUserId = hostAccess.hostUserId ?? hostSession?.hostUserId ?? "";
    if (process.env.NODE_ENV !== "production") {
      console.info("[host.pro.billing.checkout] request", {
        hostUserId: resolvedHostUserId || null,
        authUserId: hostSession?.authUserId ?? null,
        selectedFamilyId,
        resolvedFamilyId: hostAccess.familyId,
        selections: body.selections ?? [],
        durationMonths: body.duration_months ?? 1,
      });
    }
    const checkout = await createHostProBillingCheckout(supabase, {
      hostUserId: resolvedHostUserId,
      sourceFamilyId: hostAccess.familyId ?? selectedFamilyId,
      selections: body.selections ?? [],
      durationMonths: body.duration_months ?? 1,
    });
    logStep(startedAt, "razorpay_order_create", {
      billingOrderId: checkout.billingOrderId,
      totalMs: Date.now() - startedAt,
    });

    return NextResponse.json(checkout);
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error("[host.pro.billing.checkout] failed", {
        name: error instanceof Error ? error.name : "UnknownError",
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack ?? null : null,
      });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create Famlo Pro Razorpay checkout." },
      { status: 400 }
    );
  }
}
