import { NextRequest, NextResponse } from "next/server";

import { resolveAuthorizedHostSession } from "@/lib/chat-access";
import { resolveAuthorizedHostResource } from "@/lib/host-access";
import { loadHostProAccess } from "@/lib/host-pro-access";
import { buildProBillingSetupNotReadyPayload, isProBillingCompatibilityError } from "@/lib/pro-billing/compat";
import {
  PRO_BILLING_ALLOWED_DURATIONS,
  PRO_BILLING_GST_PCT,
  PRO_BILLING_MIN_SUBTOTAL,
  PRO_BILLING_PROPERTY_PRICE,
  PRO_BILLING_ROOM_PRICE,
  isFamloProAutopayEnabled,
  requiresFamloProSubscriptionAutopay,
} from "@/lib/pro-billing/config";
import { getHostProAutopaySnapshot } from "@/lib/pro-billing/service";
import { loadHostProBillingWorkspace } from "@/lib/pro-billing/workspace";
import { createAdminSupabaseClient } from "@/lib/supabase";

type JsonRecord = Record<string, unknown>;

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function logDev(message: string, details: Record<string, unknown>): void {
  if (process.env.NODE_ENV === "production") return;
  console.info(message, details);
}

function describeError(error: unknown): Record<string, string | null> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      code: null,
      details: null,
      hint: null,
    };
  }

  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    return {
      name: typeof record.name === "string" ? record.name : "UnknownError",
      message: typeof record.message === "string" ? record.message : String(error),
      code: typeof record.code === "string" ? record.code : null,
      details: typeof record.details === "string" ? record.details : null,
      hint: typeof record.hint === "string" ? record.hint : null,
    };
  }

  return {
    name: "UnknownError",
    message: String(error),
    code: null,
    details: null,
    hint: null,
  };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const debug: {
    requestedFamilyId: string | null;
    authUserId: string | null;
    resolvedHostUserId: string | null;
    resolvedHostId: string | null;
    sessionFamilyId: string | null;
    sourceFamilyId: string | null;
    fallbackUsed: boolean;
    workspacePropertiesCount: number;
    workspacePropertyIds: string[];
    selectedPropertyId: string | null;
    selectedFamilyId: string | null;
    roomCount: number;
    roomCountSource: string | null;
    pricingReadyReason: string | null;
    setupReadyReason: string | null;
    step: string | null;
    optionalAutopayStatus: string | null;
    optionalBillingStatus: string | null;
    caughtErrorName: string | null;
    caughtErrorMessage: string | null;
    caughtErrorCode?: string | null;
    caughtErrorDetails?: string | null;
    caughtErrorHint?: string | null;
  } = {
    requestedFamilyId: null,
    authUserId: null,
    resolvedHostUserId: null,
    resolvedHostId: null,
    sessionFamilyId: null,
    sourceFamilyId: null,
    fallbackUsed: false,
    workspacePropertiesCount: 0,
    workspacePropertyIds: [],
    selectedPropertyId: null,
    selectedFamilyId: null,
    roomCount: 0,
    roomCountSource: "loadStayUnitsForSelector(hostId, legacyFamilyId)",
    pricingReadyReason: null,
    setupReadyReason: null,
    step: "init",
    optionalAutopayStatus: null,
    optionalBillingStatus: null,
    caughtErrorName: null,
    caughtErrorMessage: null,
    caughtErrorCode: null,
    caughtErrorDetails: null,
    caughtErrorHint: null,
  };
  try {
    debug.step = "create_admin_client";
    const supabase = createAdminSupabaseClient();
    debug.step = "resolve_host_session";
    const hostSession = await resolveAuthorizedHostSession(supabase, request);
    const requestedFamilyId = request.nextUrl.searchParams.get("familyId")?.trim() ?? "";
    debug.requestedFamilyId = requestedFamilyId || null;
    debug.authUserId = hostSession?.authUserId ?? null;
    debug.sessionFamilyId = hostSession?.familyId ?? null;

    if (!hostSession?.hostUserId) {
      logDev("[host.pro.billing] host session missing host user id, resolving by resource", {
        authUserId: hostSession?.authUserId ?? null,
        sessionFamilyId: hostSession?.familyId ?? null,
      });
    }

    let familyId = requestedFamilyId || hostSession?.familyId || "";
    debug.step = "resolve_authorized_resource";
    let hostAccess =
      familyId.length > 0
        ? await resolveAuthorizedHostResource(supabase, request, { familyId }).catch(() => null)
        : null;

    if (!hostAccess && hostSession?.familyId) {
      familyId = hostSession.familyId;
      hostAccess = await resolveAuthorizedHostResource(supabase, request, { familyId }).catch(() => null);
    }

    if (!hostAccess && !familyId && hostSession?.familyId) {
      familyId = hostSession.familyId;
    }

    if (!hostAccess && !familyId) {
      debug.setupReadyReason = "missing_family_id";
      debug.pricingReadyReason = "missing_family_id";
      return NextResponse.json({ error: "Missing familyId." }, { status: 400 });
    }

    const resolvedHostUserId = hostAccess?.hostUserId ?? hostSession?.hostUserId ?? "";
    debug.resolvedHostUserId = resolvedHostUserId || null;
    debug.resolvedHostId = hostAccess?.hostId ?? null;
    debug.sourceFamilyId = hostAccess?.familyId ?? familyId ?? null;
    debug.fallbackUsed =
      Boolean(requestedFamilyId) &&
      Boolean(hostAccess?.familyId || familyId) &&
      requestedFamilyId !== (hostAccess?.familyId ?? familyId);
    logDev("[host.pro.billing] workspace request", {
      hostUserId: resolvedHostUserId || null,
      authUserId: hostSession?.authUserId ?? null,
      selectedFamilyId: requestedFamilyId || familyId || null,
      resolvedFamilyId: hostAccess?.familyId ?? familyId ?? null,
      billingTables: {
        subscriptionsOptional: true,
        ordersOptional: true,
      },
    });
    debug.step = "load_workspace";
    const workspace = await loadHostProBillingWorkspace(supabase, resolvedHostUserId, {
      sourceFamilyId: hostAccess?.familyId ?? familyId,
    });
    debug.workspacePropertiesCount = workspace.length;
    debug.workspacePropertyIds = workspace.map((property) => property.familyId);
    debug.step = "select_property";
    const fallbackFamilyId =
      workspace.length === 1
        ? workspace[0]?.familyId ?? ""
        : hostAccess?.familyId ?? hostSession?.familyId ?? familyId;
    const selectedProperty =
      workspace.find((property) => property.familyId === (requestedFamilyId || familyId)) ??
      workspace.find((property) => property.familyId === fallbackFamilyId) ??
      workspace[0] ??
      null;
    familyId = selectedProperty?.familyId ?? fallbackFamilyId ?? familyId;
    debug.selectedPropertyId = selectedProperty?.familyId ?? null;
    debug.selectedFamilyId = familyId || null;
    debug.roomCount = selectedProperty?.rooms.filter((room) => room.isActive).length ?? 0;
    logDev("[host.pro.billing] workspace resolved", {
      hostUserId: resolvedHostUserId || null,
      selectedFamilyId: requestedFamilyId || familyId || null,
      resolvedPropertyId: selectedProperty?.familyId ?? null,
      resolvedPropertyName: selectedProperty?.propertyName ?? null,
      workspacePropertyCount: workspace.length,
      roomCount: selectedProperty?.rooms.length ?? 0,
      activeRoomCount: selectedProperty?.rooms.filter((room) => room.isActive).length ?? 0,
      roomCountQuerySource: "loadStayUnitsForSelector(hostId, legacyFamilyId)",
    });

    debug.step = "load_autopay_snapshot";
    const autopay = resolvedHostUserId
      ? await getHostProAutopaySnapshot(supabase, resolvedHostUserId).catch((error) => {
        const errorMeta = describeError(error);
        debug.optionalAutopayStatus = isProBillingCompatibilityError(error) ? "compatibility_fallback" : "nonfatal_fallback";
        logDev("[host.pro.billing] optional autopay snapshot unavailable", {
          hostUserId: resolvedHostUserId || null,
          selectedFamilyId: familyId,
          ...errorMeta,
        });
        return {
          enabled: false,
          requireSubscription: false,
          mode: "disabled" as const,
          subscriptionId: null,
          subscriptionStatus: null,
          mandateStatus: null,
          nextChargeAt: null,
          currentPeriodEnd: null,
          graceUntil: null,
          billingOrderId: null,
          failureReason: null,
        };
      })
      : {
          enabled: false,
          requireSubscription: false,
          mode: "disabled" as const,
          subscriptionId: null,
          subscriptionStatus: null,
          mandateStatus: null,
          nextChargeAt: null,
          currentPeriodEnd: null,
          graceUntil: null,
          billingOrderId: null,
          failureReason: null,
        };
    if (!debug.optionalAutopayStatus) {
      debug.optionalAutopayStatus = "loaded";
    }

    let setup: ReturnType<typeof buildProBillingSetupNotReadyPayload> | { ready: true } = { ready: true };
    let recentOrders: Array<Record<string, unknown>> = [];
    let recentInvoices: Array<Record<string, unknown>> = [];
    let currentSubscription: Record<string, unknown> | null = null;
    let latestOrder: Record<string, unknown> | null = null;
    let access = null as Awaited<ReturnType<typeof loadHostProAccess>> | null;

    try {
      debug.step = "load_optional_billing_status";
      const [ordersResult, subscriptionResult, familyOrdersResult] = await Promise.all([
        supabase
          .from("host_pro_billing_orders")
          .select(
            "id,status,total_amount,gst_amount,property_count,room_count,created_at,payment_captured_at,billing_mode,gateway_subscription_id,gateway_payment_id,invoice_id,metadata"
          )
          .eq("host_user_id", resolvedHostUserId)
          .order("created_at", { ascending: false })
          .limit(10),
        selectedProperty
          ? supabase
              .from("host_pro_subscriptions")
              .select(
                "id,status,current_period_start,current_period_end,grace_until,last_payment_at,billing_order_id,room_count,billing_subtotal_amount,billing_gst_amount,billing_total_amount,metadata,created_at,updated_at"
              )
              .eq("host_user_id", resolvedHostUserId)
              .eq("family_id", selectedProperty.familyId)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        selectedProperty
          ? supabase
              .from("host_pro_billing_order_properties")
              .select(
                "billing_order_id,host_pro_billing_orders!inner(id,host_user_id,status,total_amount,subtotal_amount,gst_amount,payment_captured_at,created_at,gateway_payment_id,invoice_id,metadata)"
              )
              .eq("family_id", selectedProperty.familyId)
              .order("created_at", { ascending: false })
              .limit(5)
          : Promise.resolve({ data: [], error: null }),
      ]);

      const { data: orders, error: ordersError } = ordersResult;
      if (ordersError) throw ordersError;
      recentOrders = (orders ?? []) as Array<Record<string, unknown>>;

      const invoiceIds = recentOrders
        .map((row) => asString(row.invoice_id))
        .filter((value): value is string => Boolean(value));
      if (invoiceIds.length > 0) {
        const { data: invoiceRows, error: invoiceError } = await supabase
          .from("host_pro_invoices")
          .select("id,invoice_number,invoice_date,payment_date,status,total_paid,plan_duration_months,subscription_period_start,subscription_period_end,email_status,email_sent_at,email_error,whatsapp_status,whatsapp_sent_at,whatsapp_error,invoice_pdf_url")
          .in("id", invoiceIds);
        if (invoiceError) throw invoiceError;
        recentInvoices = (invoiceRows ?? []) as Array<Record<string, unknown>>;
      }

      if (subscriptionResult.error) throw subscriptionResult.error;
      currentSubscription = (subscriptionResult.data as Record<string, unknown> | null) ?? null;

      if (familyOrdersResult.error) throw familyOrdersResult.error;
      latestOrder =
        ((familyOrdersResult.data as Array<{ host_pro_billing_orders?: Record<string, unknown> | null }> | null) ?? [])
          .map((row) => row.host_pro_billing_orders ?? null)
          .find((row) => asString(row?.host_user_id) === resolvedHostUserId) ?? null;

      access = selectedProperty ? await loadHostProAccess(supabase, selectedProperty.familyId) : null;
    } catch (error) {
      const errorMeta = describeError(error);
      debug.optionalBillingStatus = isProBillingCompatibilityError(error) ? "compatibility_fallback" : "nonfatal_fallback";
      logDev("[host.pro.billing] optional billing status unavailable", {
        hostUserId: resolvedHostUserId || null,
        selectedFamilyId: familyId,
        resolvedPropertyId: selectedProperty?.familyId ?? null,
        ...errorMeta,
      });
      setup = selectedProperty ? { ready: true } : setup;
    }
    if (!debug.optionalBillingStatus) {
      debug.optionalBillingStatus = "loaded";
    }

    debug.step = "build_response";
    const setupReady = setup.ready === true;
    const pricingReady = Boolean(selectedProperty) && setupReady;
    const billableRoomCount = selectedProperty?.rooms.filter((room) => room.isActive).length ?? 0;
    const canOpenProDashboard = Boolean(selectedProperty) && Boolean(access?.allowed);
    const canBuyOrRenew = Boolean(selectedProperty) && billableRoomCount > 0 && !canOpenProDashboard;
    const requiresRenewal = access ? !access.allowed && access.status !== "inactive" : false;
    debug.pricingReadyReason = !selectedProperty
      ? "selected_property_missing"
      : !setupReady
        ? "setup_not_ready"
        : billableRoomCount === 0
          ? "no_active_rooms"
          : "selected_property_and_rooms_resolved";
    debug.setupReadyReason = setupReady ? "setup_ready_true" : "setup_ready_false";

    return NextResponse.json({
      pricing: {
        propertyPrice: PRO_BILLING_PROPERTY_PRICE,
        roomPrice: PRO_BILLING_ROOM_PRICE,
        minimumSubtotal: PRO_BILLING_MIN_SUBTOTAL,
        gstPct: PRO_BILLING_GST_PCT,
        allowedDurations: PRO_BILLING_ALLOWED_DURATIONS,
      },
      setup,
      selectedProperty: selectedProperty
        ? {
            ...selectedProperty,
            billableRoomCount,
            billableRoomIds: selectedProperty.rooms.filter((room) => room.isActive).map((room) => room.id),
            state: {
              pricingReady,
              canBuy: canBuyOrRenew,
              canOpenProDashboard,
              canBuyOrRenew,
              requiresRenewal,
            },
            access: access
              ? {
                  allowed: access.allowed,
                  status: access.status,
                  currentPeriodEnd: access.current_period_end,
                  graceUntil: access.grace_until,
                  reason: access.reason,
                }
              : null,
            currentSubscription: currentSubscription
              ? {
                  id: asString(currentSubscription.id),
                  status: asString(currentSubscription.status),
                  currentPeriodStart: asString(currentSubscription.current_period_start),
                  currentPeriodEnd: asString(currentSubscription.current_period_end),
                  graceUntil: asString(currentSubscription.grace_until),
                  lastPaymentAt: asString(currentSubscription.last_payment_at),
                  billingOrderId: asString(currentSubscription.billing_order_id),
                  roomCount: asNumber(currentSubscription.room_count),
                  monthlySubtotalAmount:
                    asNumber((currentSubscription.metadata as JsonRecord | null)?.monthly_subtotal_amount) ??
                    asNumber(currentSubscription.billing_subtotal_amount),
                  monthlyGstAmount:
                    asNumber((currentSubscription.metadata as JsonRecord | null)?.monthly_gst_amount) ??
                    asNumber(currentSubscription.billing_gst_amount),
                  monthlyTotalAmount:
                    asNumber((currentSubscription.metadata as JsonRecord | null)?.monthly_total_amount) ??
                    asNumber(currentSubscription.billing_total_amount),
                  paidSubtotalAmount: asNumber((currentSubscription.metadata as JsonRecord | null)?.paid_subtotal_amount),
                  paidGstAmount: asNumber((currentSubscription.metadata as JsonRecord | null)?.paid_gst_amount),
                  paidTotalAmount: asNumber((currentSubscription.metadata as JsonRecord | null)?.paid_total_amount),
                  durationMonths: asNumber((currentSubscription.metadata as JsonRecord | null)?.duration_months) ?? 1,
                }
              : null,
            latestOrder: latestOrder
              ? {
                  id: asString(latestOrder.id),
                  status: asString(latestOrder.status),
                  subtotalAmount: asNumber(latestOrder.subtotal_amount),
                  gstAmount: asNumber(latestOrder.gst_amount),
                  totalAmount: asNumber(latestOrder.total_amount),
                  paymentCapturedAt: asString(latestOrder.payment_captured_at),
                  createdAt: asString(latestOrder.created_at),
                  gatewayPaymentId: asString(latestOrder.gateway_payment_id),
                  invoiceId: asString(latestOrder.invoice_id),
                  durationMonths: asNumber((latestOrder.metadata as JsonRecord | null)?.duration_months) ?? 1,
                }
              : null,
          }
        : null,
      uiState: {
        pricingReady,
        canBuy: canBuyOrRenew,
        canOpenProDashboard,
        canBuyOrRenew,
        requiresRenewal,
      },
      autopay: {
        enabled: isFamloProAutopayEnabled(),
        requireSubscription: requiresFamloProSubscriptionAutopay(),
        mode: isFamloProAutopayEnabled() ? "autopay_subscription" : "manual_order",
        snapshot: autopay,
      },
      recentOrders: recentOrders.map((order) => {
        const invoiceId = asString(order.invoice_id);
        const invoice =
          recentInvoices.find((row) => asString(row.id) === invoiceId) ?? null;
        return {
          ...order,
          invoice: invoice
            ? {
                id: asString(invoice.id),
                invoiceNumber: asString(invoice.invoice_number),
                invoiceDate: asString(invoice.invoice_date),
                paymentDate: asString(invoice.payment_date),
                status: asString(invoice.status),
                totalPaid: asNumber(invoice.total_paid),
                planDurationMonths: asNumber(invoice.plan_duration_months),
                subscriptionPeriodStart: asString(invoice.subscription_period_start),
                subscriptionPeriodEnd: asString(invoice.subscription_period_end),
                emailStatus: asString(invoice.email_status),
                emailSentAt: asString(invoice.email_sent_at),
                emailError: asString(invoice.email_error),
                whatsappStatus: asString(invoice.whatsapp_status),
                whatsappSentAt: asString(invoice.whatsapp_sent_at),
                whatsappError: asString(invoice.whatsapp_error),
                downloadHref:
                  invoiceId
                    ? `/api/host/finance/invoices/${encodeURIComponent(invoiceId)}/download`
                    : null,
              }
            : null,
        };
      }),
      ...(process.env.NODE_ENV !== "production" ? { debug } : {}),
    });
  } catch (error) {
    const errorMeta = describeError(error);
    debug.step = debug.step ?? "outer_catch";
    debug.caughtErrorName = errorMeta.name;
    debug.caughtErrorMessage = errorMeta.message;
    debug.caughtErrorCode = errorMeta.code;
    debug.caughtErrorDetails = errorMeta.details;
    debug.caughtErrorHint = errorMeta.hint;
    debug.setupReadyReason = "caught_exception";
    debug.pricingReadyReason = "caught_exception";
    logDev("[host.pro.billing] required pricing workspace failed", {
      name: error instanceof Error ? error.name : "UnknownError",
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack ?? null : null,
      debug,
    });
    return NextResponse.json({
      pricing: {
        propertyPrice: PRO_BILLING_PROPERTY_PRICE,
        roomPrice: PRO_BILLING_ROOM_PRICE,
        minimumSubtotal: PRO_BILLING_MIN_SUBTOTAL,
        gstPct: PRO_BILLING_GST_PCT,
        allowedDurations: PRO_BILLING_ALLOWED_DURATIONS,
      },
      setup: {
        ready: false,
        hostMessage: "Unable to load pricing. Try refreshing once, or contact Famlo.",
        ...(process.env.NODE_ENV !== "production"
          ? {
              adminMessage: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
            }
          : {}),
      },
      selectedProperty: null,
      uiState: {
        pricingReady: false,
        canBuy: false,
      },
      autopay: {
        enabled: false,
        requireSubscription: false,
        mode: "manual_order",
        snapshot: {
          enabled: false,
          requireSubscription: false,
          mode: "disabled",
          subscriptionId: null,
          subscriptionStatus: null,
          mandateStatus: null,
          nextChargeAt: null,
          currentPeriodEnd: null,
          graceUntil: null,
          billingOrderId: null,
          failureReason: null,
        },
      },
      recentOrders: [],
      ...(process.env.NODE_ENV !== "production" ? { debug } : {}),
    });
  }
}
