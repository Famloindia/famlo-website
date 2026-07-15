import { NextRequest, NextResponse } from "next/server";

import { evaluateRuntimeSafety as defaultEvaluateRuntimeSafety } from "@/lib/app-env";
import { resolveAuthorizedHostSession as defaultResolveAuthorizedHostSession } from "@/lib/chat-access";
import { resolveAuthorizedHostResource as defaultResolveAuthorizedHostResource } from "@/lib/host-access";
import {
  createHostProAddonCheckout as defaultCreateHostProAddonCheckout,
  verifyAndFinalizeHostProAddonOrder as defaultVerifyAndFinalizeHostProAddonOrder,
} from "@/lib/pro-billing/service";
import type { ProAddonType } from "@/lib/pro-billing/types";
import { verifyRazorpayPaymentSignature as defaultVerifyRazorpayPaymentSignature } from "@/lib/razorpay";
import { createAdminSupabaseClient as defaultCreateAdminSupabaseClient } from "@/lib/supabase";

type CheckoutBody = {
  familyId?: string;
  addonType?: ProAddonType;
};

type VerifyBody = {
  billingOrderId?: string;
  razorpay_order_id?: string;
  razorpay_payment_id?: string;
  razorpay_signature?: string;
};

type CheckoutRouteDependencies = {
  createAdminSupabaseClient?: typeof defaultCreateAdminSupabaseClient;
  resolveAuthorizedHostSession?: typeof defaultResolveAuthorizedHostSession;
  resolveAuthorizedHostResource?: typeof defaultResolveAuthorizedHostResource;
  createHostProAddonCheckout?: typeof defaultCreateHostProAddonCheckout;
  evaluateRuntimeSafety?: typeof defaultEvaluateRuntimeSafety;
};

type VerifyRouteDependencies = {
  createAdminSupabaseClient?: typeof defaultCreateAdminSupabaseClient;
  resolveAuthorizedHostSession?: typeof defaultResolveAuthorizedHostSession;
  verifyRazorpayPaymentSignature?: typeof defaultVerifyRazorpayPaymentSignature;
  verifyAndFinalizeHostProAddonOrder?: typeof defaultVerifyAndFinalizeHostProAddonOrder;
};

function normalizeAddonType(value: unknown): ProAddonType | null {
  return value === "property" || value === "room" ? value : null;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function createHostProAddonCheckoutRouteHandlers(dependencies: CheckoutRouteDependencies = {}) {
  const createAdminSupabaseClient = dependencies.createAdminSupabaseClient ?? defaultCreateAdminSupabaseClient;
  const resolveAuthorizedHostSession =
    dependencies.resolveAuthorizedHostSession ?? defaultResolveAuthorizedHostSession;
  const resolveAuthorizedHostResource =
    dependencies.resolveAuthorizedHostResource ?? defaultResolveAuthorizedHostResource;
  const createHostProAddonCheckout =
    dependencies.createHostProAddonCheckout ?? defaultCreateHostProAddonCheckout;
  const evaluateRuntimeSafety = dependencies.evaluateRuntimeSafety ?? defaultEvaluateRuntimeSafety;

  return {
    async POST(request: NextRequest): Promise<NextResponse> {
      try {
        const supabase = createAdminSupabaseClient();
        const hostSession = await resolveAuthorizedHostSession(supabase, request);
        const body = (await request.json()) as CheckoutBody;
        const familyId = typeof body.familyId === "string" ? body.familyId.trim() : "";
        const addonType = normalizeAddonType(body.addonType);

        if (!hostSession?.hostUserId) {
          return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        if (!familyId || !addonType) {
          return NextResponse.json({ error: "familyId and addonType are required." }, { status: 400 });
        }

        const hostAccess = await resolveAuthorizedHostResource(supabase, request, { familyId });
        if (!hostAccess) {
          return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
        }

        const paymentExecution = evaluateRuntimeSafety("pro_billing_payment_execution");
        if (!paymentExecution.ok) {
          const message = paymentExecution.code === "feature_disabled"
            ? `Payment execution disabled in ${paymentExecution.appEnv} environment.`
            : paymentExecution.message ?? "Famlo Pro add-on checkout is unavailable in this environment.";
          return NextResponse.json(
            {
              error: message,
              message,
              errorCode: "PRO_BILLING_PAYMENT_EXECUTION_DISABLED",
              paymentExecutionEnabled: false,
            },
            { status: 503 }
          );
        }

        const checkout = await createHostProAddonCheckout(supabase, {
          hostUserId: hostSession.hostUserId,
          familyId,
          addonType,
        });

        return NextResponse.json(checkout);
      } catch (error) {
        return NextResponse.json(
          { error: error instanceof Error ? error.message : "Failed to create Famlo Pro add-on checkout." },
          { status: 400 }
        );
      }
    },
  };
}

export function createHostProAddonVerifyRouteHandlers(dependencies: VerifyRouteDependencies = {}) {
  const createAdminSupabaseClient = dependencies.createAdminSupabaseClient ?? defaultCreateAdminSupabaseClient;
  const resolveAuthorizedHostSession =
    dependencies.resolveAuthorizedHostSession ?? defaultResolveAuthorizedHostSession;
  const verifyRazorpayPaymentSignature =
    dependencies.verifyRazorpayPaymentSignature ?? defaultVerifyRazorpayPaymentSignature;
  const verifyAndFinalizeHostProAddonOrder =
    dependencies.verifyAndFinalizeHostProAddonOrder ?? defaultVerifyAndFinalizeHostProAddonOrder;

  return {
    async POST(request: NextRequest): Promise<NextResponse> {
      try {
        const supabase = createAdminSupabaseClient();
        const hostSession = await resolveAuthorizedHostSession(supabase, request);
        if (!hostSession?.hostUserId) {
          return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = (await request.json()) as VerifyBody;
        const billingOrderId = asString(body.billingOrderId);
        const gatewayOrderId = asString(body.razorpay_order_id);
        const gatewayPaymentId = asString(body.razorpay_payment_id);
        const paymentSignature = asString(body.razorpay_signature);

        if (!billingOrderId || !gatewayOrderId || !gatewayPaymentId || !paymentSignature) {
          return NextResponse.json({ error: "Missing required Razorpay verification fields." }, { status: 400 });
        }

        if (
          !verifyRazorpayPaymentSignature({
            orderId: gatewayOrderId,
            paymentId: gatewayPaymentId,
            signature: paymentSignature,
          })
        ) {
          return NextResponse.json({ error: "Invalid Razorpay payment signature." }, { status: 400 });
        }

        const result = await verifyAndFinalizeHostProAddonOrder(supabase, {
          billingOrderId,
          gatewayOrderId,
          gatewayPaymentId,
          paymentSignature,
        });

        return NextResponse.json({
          success: true,
          ...result,
        });
      } catch (error) {
        return NextResponse.json(
          { error: error instanceof Error ? error.message : "Failed to verify Famlo Pro add-on payment." },
          { status: 400 }
        );
      }
    },
  };
}
