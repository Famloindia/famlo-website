import crypto from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  PRO_BILLING_ADDON_PROPERTY_PRICE,
  PRO_BILLING_ADDON_ROOM_PRICE,
  PRO_BILLING_GRACE_PERIOD_DAYS,
  PRO_BILLING_PERIOD_DAYS,
  PRO_BILLING_PRICING_VERSION,
  PRO_BILLING_AUTOPAY_TOTAL_COUNT,
  isFamloProAutopayEnabled,
  normalizeProBillingDurationMonths,
  resolveProBillingPlanDays,
  requiresFamloProSubscriptionAutopay,
  roundInrDisplay,
} from "@/lib/pro-billing/config";
import {
  canUseProFeature,
  computeProRenewalWindow,
  deriveProAccessStatus,
  getFamloProEntitlement,
  getProAccessStatus,
  markExpiredProSubscriptionsPaused,
  normalizeProSubscriptionStatus,
  type ProAccessStatusResult,
  type ProSubscriptionLifecycleStatus,
  type ProSubscriptionRecord,
} from "@/lib/pro-billing/access-status";
import { sendHostProInvoiceEmail } from "@/lib/pro-billing/email";
import {
  buildHostProInvoiceLineItems,
  buildHostProInvoiceNumber,
  buildHostProInvoicePayload,
  buildHostProReceiptNumber,
  deriveFinancialYearLabel,
  derivePlaceOfSupply,
  isSameStateSupply,
  resolveStateFromGstin,
} from "@/lib/pro-billing/invoice";
import { buildProBillingChargeQuote, buildProBillingPricingBreakdown } from "@/lib/pro-billing/pricing";
import { enqueueHostProInvoiceWhatsApp } from "@/lib/pro-billing/whatsapp";
import {
  cancelProSubscription,
  createOrReuseProPlan as createRazorpaySubscriptionPlan,
  createProSubscription,
  fetchProSubscription,
  type RazorpaySubscriptionEntity,
} from "@/lib/pro-billing/razorpay-subscriptions";
import type {
  ProAddonQuote,
  ProAddonType,
  ProAutopaySnapshot,
  ProBillingChargeQuote,
  ProBillingMode,
  ProBillingPricingBreakdown,
  ProBillingPropertySelectionInput,
  ProBillingValidatedProperty,
} from "@/lib/pro-billing/types";
import {
  buildProBillingScopeHash,
  normalizeProBillingSelections,
  validateProBillingScopeSelections,
} from "@/lib/pro-billing/workspace";
import {
  generateOrLoadFinancePdf,
  resolveFinanceDocumentById,
} from "@/lib/finance/invoices/pdf/document-service";
import {
  createRazorpayOrder,
  fetchRazorpayPayment,
  getRazorpayConfig,
  isRazorpayConfigured,
  type RazorpayOrder,
  type RazorpayPaymentEntity,
} from "@/lib/razorpay";

export {
  canUseProFeature,
  computeProRenewalWindow,
  deriveProAccessStatus,
  getFamloProEntitlement,
  getProAccessStatus,
  markExpiredProSubscriptionsPaused,
  normalizeProSubscriptionStatus,
  type ProAccessStatusResult,
  type ProSubscriptionLifecycleStatus,
  type ProSubscriptionRecord,
} from "@/lib/pro-billing/access-status";

type JsonRecord = Record<string, unknown>;

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asObject(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function formatDateOnly(value: string): string {
  return new Date(value).toISOString().slice(0, 10);
}

function toMillis(value: string | null | undefined): number | null {
  if (!value) return null;
  const millis = Date.parse(value);
  return Number.isNaN(millis) ? null : millis;
}

function daysBetweenCeil(startMillis: number, endMillis: number): number {
  const dayMillis = 24 * 60 * 60 * 1000;
  return Math.max(0, Math.ceil((endMillis - startMillis) / dayMillis));
}

async function resolveHostPrimaryProPropertyId(
  supabase: SupabaseClient,
  input: {
    hostUserId: string;
    fallbackFamilyId: string;
  }
): Promise<string> {
  const { data, error } = await supabase
    .from("host_pro_subscriptions")
    .select("primary_pro_property_id,family_id,created_at")
    .eq("host_user_id", input.hostUserId)
    .order("created_at", { ascending: true });
  if (error) throw error;

  const rows = Array.isArray(data) ? (data as JsonRecord[]) : [];
  const existingPrimary = rows.map((row) => asString(row.primary_pro_property_id)).find((value) => value);
  if (existingPrimary) {
    return existingPrimary;
  }

  const earliestFamilyId = rows
    .map((row) => ({ familyId: asString(row.family_id), createdAt: asString(row.created_at) }))
    .filter((row): row is { familyId: string; createdAt: string | null } => Boolean(row.familyId))
    .sort((left, right) => {
      const leftAt = left.createdAt ? Date.parse(left.createdAt) : 0;
      const rightAt = right.createdAt ? Date.parse(right.createdAt) : 0;
      return leftAt - rightAt;
    })[0]?.familyId;

  return earliestFamilyId ?? input.fallbackFamilyId;
}

export function isCapturedProBillingPaymentStatus(status: string | null | undefined): boolean {
  const normalized = String(status ?? "").trim().toLowerCase();
  return normalized === "captured" || normalized === "paid";
}

export function doesProBillingAmountMatch(expectedAmountRupees: number, providerAmountPaise: number | null | undefined): boolean {
  if (typeof providerAmountPaise !== "number" || !Number.isFinite(providerAmountPaise)) {
    return false;
  }
  return Math.round(providerAmountPaise / 100) === Math.round(expectedAmountRupees);
}

export function buildProratedProAddonQuote(input: {
  addonType: ProAddonType;
  durationMonths: 1 | 3 | 6;
  remainingDays: number;
}): ProAddonQuote {
  const totalPlanDays = resolveProBillingPlanDays(input.durationMonths);
  const remainingDays = Math.max(0, Math.min(totalPlanDays, Math.trunc(input.remainingDays)));
  const baseMonthlyAmount =
    input.addonType === "property" ? PRO_BILLING_ADDON_PROPERTY_PRICE : PRO_BILLING_ADDON_ROOM_PRICE;
  const payableSubtotalAmount = roundInrDisplay((baseMonthlyAmount * remainingDays) / totalPlanDays);
  const payableGstAmount = roundInrDisplay((payableSubtotalAmount * 18) / 100);
  const payableTotalAmount = roundInrDisplay(payableSubtotalAmount + payableGstAmount);

  return {
    addonType: input.addonType,
    durationMonths: input.durationMonths,
    totalPlanDays,
    remainingDays,
    baseMonthlyAmount,
    payableSubtotalAmount,
    payableGstAmount,
    payableTotalAmount,
    gstPct: 18,
  };
}

async function loadActiveProSubscriptionForAddons(
  supabase: SupabaseClient,
  familyId: string
): Promise<{
  id: string;
  durationMonths: 1 | 3 | 6;
  currentPeriodEnd: string;
} | null> {
  const { data, error } = await supabase
    .from("host_pro_subscriptions")
    .select("id,status,current_period_end,metadata,created_at")
    .eq("family_id", familyId)
    .order("created_at", { ascending: false })
    .limit(10);
  if (error) throw error;

  const rows = Array.isArray(data) ? (data as JsonRecord[]) : [];
  const now = new Date();
  const activeRow = rows
    .map((row) => ({
      id: asString(row.id),
      status: normalizeProSubscriptionStatus(row.status),
      currentPeriodEnd: asString(row.current_period_end),
      metadata: asObject(row.metadata),
      createdAt: toMillis(asString(row.created_at)),
    }))
    .filter((row): row is { id: string; status: ProSubscriptionLifecycleStatus; currentPeriodEnd: string | null; metadata: JsonRecord | null; createdAt: number | null } => Boolean(row.id))
    .sort((left, right) => {
      const rank = (status: ProSubscriptionLifecycleStatus) => (status === "active" ? 2 : status === "grace" ? 1 : 0);
      const rankDiff = rank(right.status) - rank(left.status);
      if (rankDiff !== 0) return rankDiff;
      return (right.createdAt ?? 0) - (left.createdAt ?? 0);
    })
    .find((row) => {
      const access = deriveProAccessStatus(
        {
          status: row.status,
          current_period_start: null,
          current_period_end: row.currentPeriodEnd,
          grace_until: null,
        },
        { now }
      );
      return access.allowed && access.status === "active" && Boolean(row.currentPeriodEnd);
    });

  if (!activeRow?.currentPeriodEnd) {
    return null;
  }

  const durationMonths = normalizeProBillingDurationMonths(activeRow.metadata?.duration_months ?? 1);
  return {
    id: activeRow.id,
    durationMonths,
    currentPeriodEnd: activeRow.currentPeriodEnd,
  };
}

export async function buildHostProAddonQuote(
  supabase: SupabaseClient,
  input: {
    familyId: string;
    addonType: ProAddonType;
    nowIso?: string;
  }
): Promise<ProAddonQuote> {
  const activeSubscription = await loadActiveProSubscriptionForAddons(supabase, input.familyId);
  if (!activeSubscription) {
    throw new Error("Famlo Pro add-ons are only available during an active paid period.");
  }

  const nowMillis = toMillis(input.nowIso ?? new Date().toISOString()) ?? Date.now();
  const currentPeriodEndMillis = toMillis(activeSubscription.currentPeriodEnd);
  if (currentPeriodEndMillis == null || currentPeriodEndMillis <= nowMillis) {
    throw new Error("Famlo Pro add-ons are only available before the paid period ends.");
  }

  return buildProratedProAddonQuote({
    addonType: input.addonType,
    durationMonths: activeSubscription.durationMonths,
    remainingDays: daysBetweenCeil(nowMillis, currentPeriodEndMillis),
  });
}

async function insertOrderScopeRows(
  supabase: SupabaseClient,
  billingOrderId: string,
  properties: ProBillingValidatedProperty[]
): Promise<void> {
  if (properties.length === 0) return;

  const propertyRows = properties.map((property) => ({
    billing_order_id: billingOrderId,
    family_id: property.familyId,
    property_name: property.propertyName,
    host_code: property.hostCode,
    city: property.city,
    state: property.state,
    selected_room_count: property.roomIds.length,
  }));
  const roomRows = properties.flatMap((property) =>
    property.rooms.map((room) => ({
      billing_order_id: billingOrderId,
      family_id: property.familyId,
      stay_unit_id: room.id,
      room_name: room.name,
    }))
  );

  const propertyInsert = await supabase.from("host_pro_billing_order_properties").insert(propertyRows as never);
  if (propertyInsert.error) throw propertyInsert.error;

  if (roomRows.length > 0) {
    const roomInsert = await supabase.from("host_pro_billing_order_rooms").insert(roomRows as never);
    if (roomInsert.error) throw roomInsert.error;
  }
}

async function loadOrderScope(
  supabase: SupabaseClient,
  billingOrderId: string
): Promise<ProBillingValidatedProperty[]> {
  const [{ data: properties, error: propertiesError }, { data: rooms, error: roomsError }] = await Promise.all([
    supabase
      .from("host_pro_billing_order_properties")
      .select("family_id,property_name,host_code,city,state")
      .eq("billing_order_id", billingOrderId),
    supabase
      .from("host_pro_billing_order_rooms")
      .select("family_id,stay_unit_id,room_name")
      .eq("billing_order_id", billingOrderId),
  ]);
  if (propertiesError) throw propertiesError;
  if (roomsError) throw roomsError;

  const roomsByFamily = new Map<string, Array<{ id: string; name: string }>>();
  for (const row of (rooms ?? []) as JsonRecord[]) {
    const familyId = asString(row.family_id);
    const roomId = asString(row.stay_unit_id);
    if (!familyId || !roomId) continue;
    const familyRooms = roomsByFamily.get(familyId) ?? [];
    familyRooms.push({ id: roomId, name: asString(row.room_name) ?? "Room" });
    roomsByFamily.set(familyId, familyRooms);
  }

  return ((properties ?? []) as JsonRecord[]).map((row) => {
    const familyId = asString(row.family_id) ?? "";
    const familyRooms = roomsByFamily.get(familyId) ?? [];
    return {
      familyId,
      propertyName: asString(row.property_name) ?? "Famlo Property",
      hostCode: asString(row.host_code),
      city: asString(row.city),
      state: asString(row.state),
      roomIds: familyRooms.map((room) => room.id),
      rooms: familyRooms,
    };
  });
}

function isInactiveFlag(value: unknown): boolean {
  return value === false;
}

async function loadFreshAutopayRenewalScope(
  supabase: SupabaseClient,
  input: {
    hostUserId: string;
    razorpaySubscriptionId: string;
  }
): Promise<{
  sourceFamilyId: string | null;
  scopeHash: string;
  properties: ProBillingValidatedProperty[];
  selections: ProBillingPropertySelectionInput[];
  pricing: ProBillingPricingBreakdown;
  razorpayPlanId: string;
}> {
  const { data: latestOrder, error: latestOrderError } = await supabase
    .from("host_pro_billing_orders")
    .select("id,source_family_id,scope_hash,gateway_plan_id")
    .eq("host_user_id", input.hostUserId)
    .eq("gateway_subscription_id", input.razorpaySubscriptionId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestOrderError) throw latestOrderError;
  if (!latestOrder?.id) {
    throw new Error("Famlo Pro autopay scope is missing for this subscription.");
  }

  const [{ data: subscriptions, error: subscriptionsError }, { data: subscriptionRooms, error: roomsError }, { data: addonOrders, error: addonOrdersError }] =
    await Promise.all([
      supabase
        .from("host_pro_subscriptions")
        .select("id,family_id,host_user_id,razorpay_subscription_id")
        .eq("host_user_id", input.hostUserId)
        .eq("razorpay_subscription_id", input.razorpaySubscriptionId),
      supabase
        .from("host_pro_subscription_rooms")
        .select(
          "subscription_id,family_id,stay_unit_id,room_name,status,host_pro_subscriptions!inner(id,host_user_id,razorpay_subscription_id)"
        ),
      supabase
        .from("host_pro_billing_orders")
        .select("id,host_user_id,source_family_id,status,metadata,created_at")
        .eq("host_user_id", input.hostUserId),
    ]);
  if (subscriptionsError) throw subscriptionsError;
  if (roomsError) throw roomsError;
  if (addonOrdersError) throw addonOrdersError;

  const scopedFamilyIds = new Set<string>();
  for (const row of (subscriptions ?? []) as JsonRecord[]) {
    const familyId = asString(row.family_id);
    if (familyId) scopedFamilyIds.add(familyId);
  }

  const paidAddonOrders = ((addonOrders ?? []) as JsonRecord[])
    .map((row) => ({
      sourceFamilyId: asString(row.source_family_id),
      status: asString(row.status),
      createdAt: toMillis(asString(row.created_at)),
      metadata: asObject(row.metadata),
    }))
    .filter((row) => row.status === "paid" && row.metadata);

  let expanded = true;
  while (expanded) {
    expanded = false;
    for (const order of paidAddonOrders) {
      if (asString(order.metadata?.order_kind) !== "addon" || asString(order.metadata?.addon_type) !== "property") {
        continue;
      }
      const consumedAt = asString(order.metadata?.consumed_at);
      const targetFamilyId = asString(order.metadata?.consumed_target_reference);
      if (!consumedAt || !targetFamilyId) continue;
      if (!order.sourceFamilyId || !scopedFamilyIds.has(order.sourceFamilyId)) continue;
      if (!scopedFamilyIds.has(targetFamilyId)) {
        scopedFamilyIds.add(targetFamilyId);
        expanded = true;
      }
    }
  }

  if (scopedFamilyIds.size === 0) {
    throw new Error("Famlo Pro autopay renewal scope is empty.");
  }

  const familyIds = Array.from(scopedFamilyIds);
  const [{ data: families, error: familiesError }, { data: stayUnits, error: stayUnitsError }] = await Promise.all([
    supabase
      .from("families")
      .select("id,name,host_id,city,state,is_active")
      .in("id", familyIds),
    supabase
      .from("stay_units_v2")
      .select("id,legacy_family_id,name,is_active")
      .in("legacy_family_id", familyIds),
  ]);
  if (familiesError) throw familiesError;
  if (stayUnitsError) throw stayUnitsError;

  const familyRows = new Map<string, JsonRecord>();
  for (const row of (families ?? []) as JsonRecord[]) {
    const familyId = asString(row.id);
    if (familyId) familyRows.set(familyId, row);
  }

  const roomsByFamilyId = new Map<string, Map<string, { id: string; name: string }>>();
  for (const row of (stayUnits ?? []) as JsonRecord[]) {
    const familyId = asString(row.legacy_family_id);
    const roomId = asString(row.id);
    if (!familyId || !roomId || isInactiveFlag(row.is_active)) continue;
    const familyRooms = roomsByFamilyId.get(familyId) ?? new Map<string, { id: string; name: string }>();
    familyRooms.set(roomId, {
      id: roomId,
      name: asString(row.name) ?? "Room",
    });
    roomsByFamilyId.set(familyId, familyRooms);
  }

  const scopedRoomIdsByFamily = new Map<string, Set<string>>();
  for (const row of (subscriptionRooms ?? []) as JsonRecord[]) {
    const familyId = asString(row.family_id);
    const roomId = asString(row.stay_unit_id);
    const joinedSubscription = asObject(row.host_pro_subscriptions);
    if (!familyId || !roomId || !joinedSubscription) continue;
    if (asString(joinedSubscription.host_user_id) !== input.hostUserId) continue;
    if (asString(joinedSubscription.razorpay_subscription_id) !== input.razorpaySubscriptionId) continue;
    const roomIds = scopedRoomIdsByFamily.get(familyId) ?? new Set<string>();
    roomIds.add(roomId);
    scopedRoomIdsByFamily.set(familyId, roomIds);
  }

  for (const order of paidAddonOrders) {
    if (asString(order.metadata?.order_kind) !== "addon" || asString(order.metadata?.addon_type) !== "room") {
      continue;
    }
    const consumedAt = asString(order.metadata?.consumed_at);
    const targetRoomId = asString(order.metadata?.consumed_target_reference);
    if (!consumedAt || !targetRoomId || !order.sourceFamilyId || !scopedFamilyIds.has(order.sourceFamilyId)) {
      continue;
    }
    const roomIds = scopedRoomIdsByFamily.get(order.sourceFamilyId) ?? new Set<string>();
    roomIds.add(targetRoomId);
    scopedRoomIdsByFamily.set(order.sourceFamilyId, roomIds);
  }

  const properties = familyIds
    .map((familyId) => {
      const familyRow = familyRows.get(familyId);
      if (!familyRow || isInactiveFlag(familyRow.is_active)) return null;

      const roomIds = Array.from(scopedRoomIdsByFamily.get(familyId) ?? new Set<string>())
        .filter((roomId) => (roomsByFamilyId.get(familyId) ?? new Map<string, { id: string; name: string }>()).has(roomId))
        .sort();
      const rooms = roomIds.map((roomId) => (roomsByFamilyId.get(familyId) as Map<string, { id: string; name: string }>).get(roomId)!);

      return {
        familyId,
        propertyName: asString(familyRow.name) ?? "Famlo Property",
        hostCode: asString(familyRow.host_id),
        city: asString(familyRow.city),
        state: asString(familyRow.state),
        roomIds,
        rooms,
      } satisfies ProBillingValidatedProperty;
    })
    .filter((property): property is ProBillingValidatedProperty => Boolean(property))
    .sort((left, right) => left.familyId.localeCompare(right.familyId));

  if (properties.length === 0) {
    throw new Error("Famlo Pro autopay renewal scope has no active properties.");
  }

  const selections = properties.map((property) => ({
    familyId: property.familyId,
    roomIds: property.roomIds,
  }));

  return {
    sourceFamilyId: asString(latestOrder.source_family_id),
    scopeHash: buildProBillingScopeHash(selections),
    properties,
    selections,
    pricing: buildProBillingPricingBreakdown(properties),
    razorpayPlanId: asString(latestOrder.gateway_plan_id) ?? "",
  };
}

async function createOrUpdateProInvoice(
  supabase: SupabaseClient,
  input: {
    billingOrderId: string;
    hostUserId: string;
    gatewayOrderId: string;
    gatewayPaymentId: string;
    issuedAtIso: string;
    pricing: ProBillingPricingBreakdown;
    quote: ProBillingChargeQuote;
    properties: ProBillingValidatedProperty[];
  }
): Promise<{ id: string; payload: ReturnType<typeof buildHostProInvoicePayload> }> {
  const { data: existing, error: existingError } = await supabase
    .from("host_pro_invoices")
    .select("id,payload")
    .eq("billing_order_id", input.billingOrderId)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing?.id) {
    return {
      id: String(existing.id),
      payload: existing.payload as ReturnType<typeof buildHostProInvoicePayload>,
    };
  }

  const propertyFamilyId = input.properties[0]?.familyId ?? null;
  const [{ data: family }, { data: user }, { data: hostGstProfile }, { data: subscriptions }] = await Promise.all([
    propertyFamilyId
      ? supabase
          .from("families")
          .select("id,name,property_name,host_display_name,primary_host_name,host_name,display_name,email,host_email,host_phone,state,latest_onboarding_payload,gstin")
          .eq("id", propertyFamilyId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase.from("users").select("id,name,email").eq("id", input.hostUserId).maybeSingle(),
    supabase
      .from("host_gst_profiles")
      .select("gstin")
      .eq("user_id", input.hostUserId)
      .maybeSingle(),
    supabase
      .from("host_pro_subscriptions")
      .select("id,family_id,current_period_start,current_period_end")
      .eq("billing_order_id", input.billingOrderId)
      .order("created_at", { ascending: true }),
  ]);

  const familyRecord = (family as JsonRecord | null) ?? null;
  const userRecord = (user as JsonRecord | null) ?? null;
  const gstProfileRecord = (hostGstProfile as JsonRecord | null) ?? null;
  const onboardingPayload = asObject(familyRecord?.latest_onboarding_payload) ?? {};
  const subscriptionRows = Array.isArray(subscriptions) ? (subscriptions as JsonRecord[]) : [];
  const firstSubscription = subscriptionRows[0] ?? null;
  const periodStart =
    asString(firstSubscription?.current_period_start) ??
    input.issuedAtIso;
  const periodEnd =
    asString(subscriptionRows[subscriptionRows.length - 1]?.current_period_end) ??
    input.issuedAtIso;
  const subscriptionId = asString(firstSubscription?.id);

  const supplierLegalName = process.env.FAMLO_LEGAL_ENTITY_NAME?.trim();
  const supplierGstin = process.env.FAMLO_GSTIN?.trim();
  const supplierRegisteredAddress = process.env.FAMLO_LEGAL_ADDRESS?.trim();
  if (!supplierLegalName || !supplierGstin || !supplierRegisteredAddress) {
    throw new Error("Famlo issuer profile is incomplete for Pro GST invoice generation.");
  }

  const supplierState =
    process.env.FAMLO_GST_STATE?.trim() ??
    resolveStateFromGstin(supplierGstin) ??
    "Rajasthan";
  const hostName =
    asString(familyRecord?.host_display_name) ??
    asString(familyRecord?.primary_host_name) ??
    asString(familyRecord?.host_name) ??
    asString(familyRecord?.display_name) ??
    asString(userRecord?.name) ??
    asString(onboardingPayload.hostName) ??
    "Famlo Host";
  const propertyName =
    asString(familyRecord?.property_name) ??
    asString(familyRecord?.name) ??
    input.properties[0]?.propertyName ??
    "Famlo Property";
  const hostEmail =
    asString(userRecord?.email) ??
    asString(familyRecord?.email) ??
    asString(familyRecord?.host_email) ??
    asString(onboardingPayload.email) ??
    asString(onboardingPayload.hostEmail) ??
    "";
  const hostPhone =
    asString(familyRecord?.host_phone) ??
    "";
  const hostGstin =
    asString(gstProfileRecord?.gstin) ??
    asString(familyRecord?.gstin) ??
    asString(onboardingPayload.gstin) ??
    asString(onboardingPayload.gstNumber);
  const placeOfSupply = derivePlaceOfSupply({
    propertyState: input.properties[0]?.state ?? null,
    hostState: asString(familyRecord?.state),
    supplierState,
  });

  const taxableValue = round2(input.quote.payableSubtotalAmount);
  const totalPaid = round2(input.quote.payableTotalAmount);
  const totalGst = round2((taxableValue * 18) / 100);
  const sameStateSupply = isSameStateSupply(placeOfSupply.value, supplierState);
  const cgstAmount = sameStateSupply ? round2(totalGst / 2) : 0;
  const sgstAmount = sameStateSupply ? round2(totalGst / 2) : 0;
  const igstAmount = sameStateSupply ? 0 : totalGst;
  const roundOff = round2(totalPaid - taxableValue - totalGst);
  const durationMonths = normalizeProBillingDurationMonths(
    input.quote.durationMonths
  );
  const financialYearLabel = deriveFinancialYearLabel(input.issuedAtIso);
  const { data: latestSequenceRow, error: latestSequenceError } = await supabase
    .from("host_pro_invoices")
    .select("sequence_number")
    .eq("financial_year_label", financialYearLabel)
    .order("sequence_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestSequenceError) throw latestSequenceError;

  let nextSequence = Math.max(1, Number(latestSequenceRow?.sequence_number ?? 0) + 1);
  let insertedInvoiceId: string | null = null;
  let payload: ReturnType<typeof buildHostProInvoicePayload> | null = null;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const invoiceNumber = buildHostProInvoiceNumber(financialYearLabel, nextSequence);
    const receiptNumber = buildHostProReceiptNumber(invoiceNumber);
    payload = buildHostProInvoicePayload({
      invoiceNumber,
      receiptNumber,
      financialYearLabel,
      sequenceNumber: nextSequence,
      invoiceDate: formatDateOnly(input.issuedAtIso),
      paymentDate: formatDateOnly(input.issuedAtIso),
      hostUserId: input.hostUserId,
      hostName,
      propertyName,
      hostEmail,
      hostPhone,
      hostGstin: hostGstin || null,
      placeOfSupply: placeOfSupply.value,
      placeOfSupplySource: placeOfSupply.source,
      supplier: {
        legalName: supplierLegalName,
        gstin: supplierGstin,
        registeredAddress: supplierRegisteredAddress,
        state: supplierState,
      },
      subscription: {
        service: "Famlo Pro Subscription",
        planLabel: `${durationMonths} Month${durationMonths === 1 ? "" : "s"}`,
        durationMonths,
        periodStart: formatDateOnly(periodStart),
        periodEnd: formatDateOnly(periodEnd),
        propertyCount: input.pricing.propertyCount,
        roomCount: input.pricing.roomCount,
      },
      charges: {
        lineItems: buildHostProInvoiceLineItems({
          propertyCount: input.pricing.propertyCount,
          roomCount: input.pricing.roomCount,
          durationMonths,
          taxableValue,
        }),
        taxableValue,
        cgstAmount,
        sgstAmount,
        igstAmount,
        totalGst,
        roundOff,
        totalPaid,
        taxMode: sameStateSupply ? "intra_state" : "inter_state",
      },
      payment: {
        status: "PAID",
        method: "Razorpay",
        reference: input.gatewayPaymentId,
        currency: "INR",
      },
    });

    const insertResult = await supabase
      .from("host_pro_invoices")
      .insert({
        billing_order_id: input.billingOrderId,
        family_id: propertyFamilyId,
        subscription_id: subscriptionId,
        host_user_id: input.hostUserId,
        invoice_number: payload.invoiceNumber,
        receipt_number: payload.receiptNumber,
        financial_year_label: financialYearLabel,
        sequence_number: nextSequence,
        invoice_date: payload.invoiceDate,
        payment_date: payload.paymentDate,
        status: "paid",
        currency: "INR",
        property_count: input.pricing.propertyCount,
        room_count: input.pricing.roomCount,
        subtotal_amount: Math.round(taxableValue),
        gst_amount: Math.round(totalGst),
        total_amount: Math.round(totalPaid),
        supplier_legal_name: supplierLegalName,
        supplier_gstin: supplierGstin,
        supplier_registered_address: supplierRegisteredAddress,
        host_name: hostName,
        property_name: propertyName,
        host_email: hostEmail || null,
        host_phone: hostPhone || null,
        host_gstin: hostGstin || null,
        place_of_supply: placeOfSupply.value,
        plan_duration_months: durationMonths,
        subscription_period_start: periodStart,
        subscription_period_end: periodEnd,
        taxable_value: taxableValue,
        cgst_amount: cgstAmount,
        sgst_amount: sgstAmount,
        igst_amount: igstAmount,
        total_gst: totalGst,
        round_off: roundOff,
        total_paid: totalPaid,
        razorpay_order_id: input.gatewayOrderId,
        razorpay_payment_id: input.gatewayPaymentId,
        payment_reference: input.gatewayPaymentId,
        invoice_pdf_url: `/api/host/finance/invoices/${encodeURIComponent(input.billingOrderId)}/download`,
        email_status: "pending",
        whatsapp_status: "pending",
        payload: payload as unknown as JsonRecord,
        issued_at: input.issuedAtIso,
        updated_at: input.issuedAtIso,
      } as never)
      .select("id")
      .maybeSingle();

    if (!insertResult.error && insertResult.data?.id) {
      insertedInvoiceId = String(insertResult.data.id);
      break;
    }

    const message = String((insertResult.error as { message?: string } | null)?.message ?? "");
    if (message.includes("host_pro_invoices_order_uidx")) {
      const { data: existingForOrder, error: existingForOrderError } = await supabase
        .from("host_pro_invoices")
        .select("id,payload")
        .eq("billing_order_id", input.billingOrderId)
        .maybeSingle();
      if (existingForOrderError) throw existingForOrderError;
      if (existingForOrder?.id) {
        return {
          id: String(existingForOrder.id),
          payload: existingForOrder.payload as ReturnType<typeof buildHostProInvoicePayload>,
        };
      }
    }
    if (message.includes("host_pro_invoices_financial_year_sequence_uidx") || message.includes("host_pro_invoices_invoice_number_key")) {
      nextSequence += 1;
      continue;
    }
    throw insertResult.error;
  }

  if (!insertedInvoiceId || !payload) {
    throw new Error("Unable to reserve a unique Famlo Pro GST invoice number.");
  }

  try {
    const document = await resolveFinanceDocumentById(supabase, insertedInvoiceId);
    if (document) {
      await generateOrLoadFinancePdf(supabase, document, input.hostUserId);
    }
  } catch (error) {
    console.error("[pro-billing] invoice PDF generation failed:", error);
  }

  const { error: pdfUrlError } = await supabase
    .from("host_pro_invoices")
    .update({
      invoice_pdf_url: `/api/host/finance/invoices/${encodeURIComponent(insertedInvoiceId)}/download`,
      updated_at: input.issuedAtIso,
    } as never)
    .eq("id", insertedInvoiceId);
  if (pdfUrlError) throw pdfUrlError;

  return { id: insertedInvoiceId, payload };
}

async function activateScopedSubscriptions(
  supabase: SupabaseClient,
  input: {
    billingOrderId: string;
    hostUserId: string;
    paidAtIso: string;
    pricing: ProBillingPricingBreakdown;
    quote: ProBillingChargeQuote;
    properties: ProBillingValidatedProperty[];
    scopeHash: string;
    billingMode: ProBillingMode;
    durationMonths: 1 | 3 | 6;
    providerSubscriptionId?: string | null;
    razorpayPlanId?: string | null;
    providerEventId?: string | null;
    autopayStatus?: string | null;
    mandateStatus?: string | null;
    nextChargeAt?: string | null;
    lastChargeAt?: string | null;
    paymentFailureReason?: string | null;
  }
): Promise<void> {
  const primaryProPropertyId = await resolveHostPrimaryProPropertyId(supabase, {
    hostUserId: input.hostUserId,
    fallbackFamilyId: input.properties[0]?.familyId ?? "",
  });

  for (const property of input.properties) {
    const { data: latestSubscription, error: latestSubscriptionError } = await supabase
      .from("host_pro_subscriptions")
      .select("id,current_period_end,status,metadata,created_at,razorpay_subscription_id")
      .eq("family_id", property.familyId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latestSubscriptionError) throw latestSubscriptionError;

    const { data: existingForOrder, error: existingForOrderError } = await supabase
      .from("host_pro_subscriptions")
      .select("id")
      .eq("billing_order_id", input.billingOrderId)
      .eq("family_id", property.familyId)
      .maybeSingle();
    if (existingForOrderError) throw existingForOrderError;
    if (existingForOrder?.id) {
      continue;
    }

    if (input.billingMode === "manual_order") {
      await supabase
        .from("host_pro_subscriptions")
        .update({
          status: "cancelled",
          cancelled_at: input.paidAtIso,
          updated_at: input.paidAtIso,
        } as never)
        .eq("family_id", property.familyId)
        .in("status", ["active", "grace", "paused", "payment_failed", "halted"]);
    }

    const renewalWindow = computeProRenewalWindow({
      paidAtIso: input.paidAtIso,
      previousCurrentPeriodEnd: asString(latestSubscription?.current_period_end) ?? null,
      durationMonths: input.durationMonths,
    }, {
      periodDays: PRO_BILLING_PERIOD_DAYS * input.durationMonths,
      graceDays: PRO_BILLING_GRACE_PERIOD_DAYS,
    });
    const currentPeriodEnd = renewalWindow.currentPeriodEnd;
    const graceUntilIso = renewalWindow.graceUntil;

    const metadata = {
      ...(((latestSubscription?.metadata as JsonRecord | null) ?? {}) as JsonRecord),
      selected_room_ids: property.roomIds,
      selected_room_names: property.rooms.map((room) => room.name),
      property_name: property.propertyName,
      activated_via: "host_pro_billing",
      billing_order_id: input.billingOrderId,
      primary_pro_property_id: primaryProPropertyId,
      duration_months: input.durationMonths,
      monthly_subtotal_amount: input.quote.monthlySubtotalAmount,
      monthly_gst_amount: input.quote.monthlyGstAmount,
      monthly_total_amount: input.quote.monthlyTotalAmount,
      paid_subtotal_amount: input.quote.payableSubtotalAmount,
      paid_gst_amount: input.quote.payableGstAmount,
      paid_total_amount: input.quote.payableTotalAmount,
      autopay_enabled: input.billingMode === "autopay_subscription",
      autopay_status: input.autopayStatus ?? null,
      mandate_status: input.mandateStatus ?? null,
    };

    const existingAutopay =
      input.billingMode === "autopay_subscription" && input.providerSubscriptionId
        ? await supabase
            .from("host_pro_subscriptions")
            .select("id")
            .eq("family_id", property.familyId)
            .eq("razorpay_subscription_id", input.providerSubscriptionId)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle()
        : { data: null, error: null };
    if (existingAutopay.error) throw existingAutopay.error;

    let insertedSubscriptionId: string;
    if (existingAutopay.data?.id) {
      const { data: updatedSubscription, error: updateSubscriptionError } = await supabase
        .from("host_pro_subscriptions")
        .update({
          host_user_id: input.hostUserId,
          status: "active",
          current_period_start: renewalWindow.currentPeriodStart,
          current_period_end: currentPeriodEnd,
          grace_until: graceUntilIso,
          activated_at: input.paidAtIso,
          cancelled_at: null,
          provider: "razorpay",
          last_payment_at: input.paidAtIso,
          billing_order_id: input.billingOrderId,
          primary_pro_property_id: primaryProPropertyId,
          scope_hash: input.scopeHash,
          room_count: property.roomIds.length,
          billing_subtotal_amount: input.quote.monthlySubtotalAmount,
          billing_gst_amount: input.quote.monthlyGstAmount,
          billing_total_amount: input.quote.monthlyTotalAmount,
          billing_mode: input.billingMode,
          autopay_enabled: true,
          autopay_status: input.autopayStatus ?? "active",
          subscription_status: input.autopayStatus ?? "active",
          mandate_status: input.mandateStatus ?? null,
          next_charge_at: input.nextChargeAt ?? currentPeriodEnd,
          last_charge_at: input.lastChargeAt ?? input.paidAtIso,
          payment_failure_reason: input.paymentFailureReason ?? null,
          last_provider_event_id: input.providerEventId ?? null,
          razorpay_plan_id: input.razorpayPlanId ?? null,
          razorpay_subscription_id: input.providerSubscriptionId,
          provider_subscription_id: input.providerSubscriptionId,
          cancel_at_period_end: false,
          provider_metadata: {
            billing_mode: input.billingMode,
          },
          metadata,
          updated_at: input.paidAtIso,
        } as never)
        .eq("id", existingAutopay.data.id)
        .select("id")
        .single();
      if (updateSubscriptionError) throw updateSubscriptionError;
      insertedSubscriptionId = String(updatedSubscription.id);

      const { error: clearRoomsError } = await supabase
        .from("host_pro_subscription_rooms")
        .delete()
        .eq("subscription_id", insertedSubscriptionId);
      if (clearRoomsError) throw clearRoomsError;
    } else {
      const { data: insertedSubscription, error: insertSubscriptionError } = await supabase
        .from("host_pro_subscriptions")
        .insert({
          family_id: property.familyId,
          host_user_id: input.hostUserId,
          plan_code: "famlo_plus",
          status: "active",
          current_period_start: renewalWindow.currentPeriodStart,
          current_period_end: currentPeriodEnd,
          grace_until: graceUntilIso,
          activated_at: input.paidAtIso,
          cancelled_at: null,
          provider: "razorpay",
          last_payment_at: input.paidAtIso,
          billing_order_id: input.billingOrderId,
          primary_pro_property_id: primaryProPropertyId,
          scope_hash: input.scopeHash,
          room_count: property.roomIds.length,
          billing_subtotal_amount: input.quote.monthlySubtotalAmount,
          billing_gst_amount: input.quote.monthlyGstAmount,
          billing_total_amount: input.quote.monthlyTotalAmount,
          billing_mode: input.billingMode,
          autopay_enabled: input.billingMode === "autopay_subscription",
          autopay_status: input.billingMode === "autopay_subscription" ? input.autopayStatus ?? "active" : null,
          subscription_status: input.billingMode === "autopay_subscription" ? input.autopayStatus ?? "active" : null,
          mandate_status: input.billingMode === "autopay_subscription" ? input.mandateStatus ?? null : null,
          subscription_started_at: input.billingMode === "autopay_subscription" ? input.paidAtIso : null,
          next_charge_at: input.billingMode === "autopay_subscription" ? input.nextChargeAt ?? currentPeriodEnd : null,
          last_charge_at: input.billingMode === "autopay_subscription" ? input.lastChargeAt ?? input.paidAtIso : null,
          payment_failure_reason: input.paymentFailureReason ?? null,
          last_provider_event_id: input.providerEventId ?? null,
          razorpay_plan_id: input.razorpayPlanId ?? null,
          razorpay_subscription_id: input.providerSubscriptionId ?? null,
          provider_subscription_id: input.providerSubscriptionId ?? null,
          cancel_at_period_end: false,
          provider_metadata: input.billingMode === "autopay_subscription" ? { billing_mode: input.billingMode } : {},
          metadata,
          updated_at: input.paidAtIso,
        } as never)
        .select("id")
        .single();
      if (insertSubscriptionError) throw insertSubscriptionError;
      insertedSubscriptionId = String(insertedSubscription.id);
    }

    if (property.rooms.length > 0) {
      const roomInsert = await supabase.from("host_pro_subscription_rooms").insert(
        property.rooms.map((room) => ({
          subscription_id: insertedSubscriptionId,
          family_id: property.familyId,
          stay_unit_id: room.id,
          room_name: room.name,
          status: "active",
          updated_at: input.paidAtIso,
        })) as never
      );
      if (roomInsert.error) throw roomInsert.error;
    }
  }
}

export async function buildHostProBillingDraft(
  supabase: SupabaseClient,
  input: {
    hostUserId: string;
    sourceFamilyId?: string | null;
    selections: ProBillingPropertySelectionInput[];
    durationMonths?: number;
  }
): Promise<{
  properties: ProBillingValidatedProperty[];
  pricing: ProBillingPricingBreakdown;
  quote: ProBillingChargeQuote;
  scopeHash: string;
  durationMonths: 1 | 3 | 6;
}> {
  const properties = await validateProBillingScopeSelections(supabase, input.hostUserId, input.selections, {
    sourceFamilyId: input.sourceFamilyId ?? null,
  });
  const pricing = buildProBillingPricingBreakdown(properties);
  const durationMonths = normalizeProBillingDurationMonths(input.durationMonths ?? 1);
  return {
    properties,
    pricing,
    quote: buildProBillingChargeQuote(pricing, durationMonths),
    scopeHash: buildProBillingScopeHash(input.selections),
    durationMonths,
  };
}

export function isFamloProDevResetEnabled(): boolean {
  return process.env.NODE_ENV !== "production" || String(process.env.FAMLO_PRO_DEV_RESET_ENABLED ?? "").trim().toLowerCase() === "true";
}

export async function resetHostProTestingState(
  supabase: SupabaseClient,
  input: {
    familyId: string;
  }
): Promise<{
  familyId: string;
  subscriptionIds: string[];
  billingOrderIds: string[];
  deletedSubscriptions: number;
  deletedSubscriptionRooms: number;
  deletedOrderProperties: number;
  deletedOrderRooms: number;
  deletedOrders: number;
  deletedInvoices: number;
}> {
  const familyId = input.familyId.trim();
  if (!familyId) {
    throw new Error("familyId is required.");
  }

  const { data: subscriptions, error: subscriptionsError } = await supabase
    .from("host_pro_subscriptions")
    .select("id,metadata")
    .eq("family_id", familyId);
  if (subscriptionsError) throw subscriptionsError;
  const subscriptionRows = (subscriptions ?? []) as JsonRecord[];
  const subscriptionIds = subscriptionRows
    .map((row) => asString(row.id))
    .filter((value): value is string => Boolean(value));

  const { data: orderProperties, error: orderPropertiesError } = await supabase
    .from("host_pro_billing_order_properties")
    .select("billing_order_id,family_id")
    .eq("family_id", familyId);
  if (orderPropertiesError) throw orderPropertiesError;
  const billingOrderIds = Array.from(
    new Set(
      ((orderProperties ?? []) as JsonRecord[])
        .map((row) => asString(row.billing_order_id))
        .filter((value): value is string => Boolean(value))
    )
  );

  const nowIso = new Date().toISOString();

  if (subscriptionIds.length > 0) {
    const resetSubscriptionRooms = await supabase
      .from("host_pro_subscription_rooms")
      .delete()
      .in("subscription_id", subscriptionIds);
    if (resetSubscriptionRooms.error) throw resetSubscriptionRooms.error;

    for (const subscriptionRow of subscriptionRows) {
      const subscriptionId = asString(subscriptionRow.id);
      if (!subscriptionId) continue;
      const metadata = (subscriptionRow.metadata as JsonRecord | null) ?? {};
      const resetSubscription = await supabase
        .from("host_pro_subscriptions")
        .update({
          status: "cancelled",
          current_period_start: null,
          current_period_end: null,
          grace_until: null,
          next_charge_at: null,
          cancelled_at: nowIso,
          updated_at: nowIso,
          metadata: {
            ...metadata,
            test_reset: true,
            non_granting: true,
            reset_family_id: familyId,
            reset_at: nowIso,
          },
        } as never)
        .eq("id", subscriptionId);
      if (resetSubscription.error) throw resetSubscription.error;
    }
  }

  if (billingOrderIds.length > 0) {
    const { data: orders, error: ordersError } = await supabase
      .from("host_pro_billing_orders")
      .select("id,status,metadata")
      .in("id", billingOrderIds);
    if (ordersError) throw ordersError;

    for (const orderRow of (orders ?? []) as JsonRecord[]) {
      const orderId = asString(orderRow.id);
      if (!orderId) continue;
      const currentStatus = asString(orderRow.status);
      const metadata = (orderRow.metadata as JsonRecord | null) ?? {};
      const resetOrder = await supabase
        .from("host_pro_billing_orders")
        .update({
          status: currentStatus === "paid" ? "cancelled" : "cancelled",
          updated_at: nowIso,
          metadata: {
            ...metadata,
            test_reset: true,
            non_granting: true,
            reset_family_id: familyId,
            reset_at: nowIso,
          },
        } as never)
        .eq("id", orderId);
      if (resetOrder.error) throw resetOrder.error;
    }
  }

  return {
    familyId,
    subscriptionIds,
    billingOrderIds,
    deletedSubscriptions: subscriptionIds.length,
    deletedSubscriptionRooms: subscriptionIds.length,
    deletedOrderProperties: 0,
    deletedOrderRooms: 0,
    deletedOrders: billingOrderIds.length,
    deletedInvoices: 0,
  };
}

export async function deactivateHostProAccess(
  supabase: SupabaseClient,
  input: {
    familyId: string;
    reason?: string | null;
  }
): Promise<{
  familyId: string;
  subscriptionIds: string[];
}> {
  const familyId = input.familyId.trim();
  if (!familyId) {
    throw new Error("familyId is required.");
  }

  const { data: subscriptions, error } = await supabase
    .from("host_pro_subscriptions")
    .select("id,metadata")
    .eq("family_id", familyId);
  if (error) throw error;

  const subscriptionRows = (subscriptions ?? []) as JsonRecord[];
  const subscriptionIds = subscriptionRows
    .map((row) => asString(row.id))
    .filter((value): value is string => Boolean(value));
  const nowIso = new Date().toISOString();

  for (const subscriptionRow of subscriptionRows) {
    const subscriptionId = asString(subscriptionRow.id);
    if (!subscriptionId) continue;
    const metadata = (subscriptionRow.metadata as JsonRecord | null) ?? {};
    const result = await supabase
      .from("host_pro_subscriptions")
      .update({
        status: "halted",
        current_period_end: null,
        grace_until: null,
        next_charge_at: null,
        halted_at: nowIso,
        updated_at: nowIso,
        metadata: {
          ...metadata,
          non_granting: true,
          admin_deactivated: true,
          deactivated_reason: input.reason ?? "admin_stop",
          deactivated_at: nowIso,
        },
      } as never)
      .eq("id", subscriptionId);
    if (result.error) throw result.error;
  }

  return {
    familyId,
    subscriptionIds,
  };
}

export async function createHostProAddonCheckout(
  supabase: SupabaseClient,
  input: {
    hostUserId: string;
    familyId: string;
    addonType: ProAddonType;
  },
  dependencies?: {
    createOrder?: (input: { amountRupees: number; receipt: string; notes?: Record<string, string> }) => Promise<RazorpayOrder>;
  }
): Promise<{
  billingOrderId: string;
  quote: ProAddonQuote;
  order: RazorpayOrder;
  keyId: string;
}> {
  if (!isRazorpayConfigured()) {
    throw new Error("Razorpay is not configured for Famlo Pro add-on billing.");
  }

  const quote = await buildHostProAddonQuote(supabase, {
    familyId: input.familyId,
    addonType: input.addonType,
  });
  const nowIso = new Date().toISOString();
  const { data: billingOrder, error: insertError } = await supabase
    .from("host_pro_billing_orders")
    .insert({
      host_user_id: input.hostUserId,
      source_family_id: input.familyId,
      status: "draft",
      currency: "INR",
      pricing_version: PRO_BILLING_PRICING_VERSION,
      property_count: input.addonType === "property" ? 1 : 0,
      room_count: input.addonType === "room" ? 1 : 0,
      raw_subtotal_amount: quote.payableSubtotalAmount,
      subtotal_amount: quote.payableSubtotalAmount,
      gst_amount: quote.payableGstAmount,
      total_amount: quote.payableTotalAmount,
      scope_hash: `addon:${input.familyId}:${input.addonType}:${nowIso}`,
      scope_snapshot: { addon_type: input.addonType } as never,
      gateway: "razorpay",
      billing_mode: "manual_order",
      metadata: {
        order_kind: "addon",
        addon_type: input.addonType,
        duration_months: quote.durationMonths,
        remaining_days: quote.remainingDays,
        total_plan_days: quote.totalPlanDays,
        base_monthly_amount: quote.baseMonthlyAmount,
        payable_subtotal_amount: quote.payableSubtotalAmount,
        payable_gst_amount: quote.payableGstAmount,
        payable_total_amount: quote.payableTotalAmount,
      },
      updated_at: nowIso,
    } as never)
    .select("id")
    .single();
  if (insertError) throw insertError;

  const billingOrderId = String(billingOrder.id);
  const order = await (dependencies?.createOrder ?? createRazorpayOrder)({
    amountRupees: quote.payableTotalAmount,
    receipt: billingOrderId,
    notes: {
      billing_order_id: billingOrderId,
      host_user_id: input.hostUserId,
      addon_type: input.addonType,
      remaining_days: String(quote.remainingDays),
      total_plan_days: String(quote.totalPlanDays),
    },
  });

  const updateResult = await supabase
    .from("host_pro_billing_orders")
    .update({
      status: "payment_pending",
      gateway_order_id: order.id,
      metadata: {
        order_kind: "addon",
        addon_type: input.addonType,
        duration_months: quote.durationMonths,
        remaining_days: quote.remainingDays,
        total_plan_days: quote.totalPlanDays,
        base_monthly_amount: quote.baseMonthlyAmount,
        payable_subtotal_amount: quote.payableSubtotalAmount,
        payable_gst_amount: quote.payableGstAmount,
        payable_total_amount: quote.payableTotalAmount,
        razorpay_order: order,
      },
      updated_at: new Date().toISOString(),
    } as never)
    .eq("id", billingOrderId);
  if (updateResult.error) throw updateResult.error;

  return {
    billingOrderId,
    quote,
    order,
    keyId: getRazorpayConfig().keyId,
  };
}

export async function verifyAndFinalizeHostProAddonOrder(
  supabase: SupabaseClient,
  input: {
    billingOrderId: string;
    gatewayOrderId: string;
    gatewayPaymentId: string;
    paymentSignature: string;
  },
  dependencies?: {
    fetchPayment?: (paymentId: string) => Promise<RazorpayPaymentEntity>;
  }
): Promise<{ billingOrderId: string; alreadyFinalized: boolean }> {
  const providerPayment = await (dependencies?.fetchPayment ?? fetchRazorpayPayment)(input.gatewayPaymentId);
  if (providerPayment.order_id && providerPayment.order_id !== input.gatewayOrderId) {
    throw new Error("Razorpay payment order mismatch.");
  }

  const { data: billingOrder, error } = await supabase
    .from("host_pro_billing_orders")
    .select("id,status,total_amount,gateway_order_id,metadata")
    .eq("id", input.billingOrderId)
    .maybeSingle();
  if (error) throw error;
  if (!billingOrder?.id) {
    throw new Error("Famlo Pro add-on order not found.");
  }

  const metadata = asObject(billingOrder.metadata);
  if (asString(metadata?.order_kind) !== "addon") {
    throw new Error("Billing order is not a Famlo Pro add-on order.");
  }

  if (String(billingOrder.status) === "paid") {
    return { billingOrderId: input.billingOrderId, alreadyFinalized: true };
  }

  if (!isCapturedProBillingPaymentStatus(providerPayment.status)) {
    throw new Error("Famlo Pro add-on payment is not captured yet.");
  }
  if (!doesProBillingAmountMatch(Number(billingOrder.total_amount ?? 0), providerPayment.amount)) {
    throw new Error("Captured Famlo Pro add-on payment amount does not match the billing order total.");
  }
  if (asString(billingOrder.gateway_order_id) && asString(billingOrder.gateway_order_id) !== input.gatewayOrderId) {
    throw new Error("Famlo Pro add-on order does not match the Razorpay order.");
  }

  const paidAtIso = new Date().toISOString();
  const updateResult = await supabase
    .from("host_pro_billing_orders")
    .update({
      status: "paid",
      gateway_payment_id: input.gatewayPaymentId,
      payment_signature: input.paymentSignature,
      payment_captured_at: paidAtIso,
      metadata: {
        ...(metadata ?? {}),
        last_payment_status: "paid",
        last_payment_at: paidAtIso,
        consumed_at: null,
      },
      updated_at: paidAtIso,
    } as never)
    .eq("id", input.billingOrderId);
  if (updateResult.error) throw updateResult.error;

  return { billingOrderId: input.billingOrderId, alreadyFinalized: false };
}

export async function consumePaidHostProAddonOrder(
  supabase: SupabaseClient,
  input: {
    billingOrderId: string;
    hostUserId: string;
    familyId: string;
    addonType: ProAddonType;
    targetReference: string;
  }
): Promise<void> {
  const { data, error } = await supabase
    .from("host_pro_billing_orders")
    .select("id,status,host_user_id,source_family_id,metadata")
    .eq("id", input.billingOrderId)
    .maybeSingle();
  if (error) throw error;
  if (!data?.id || asString(data.host_user_id) !== input.hostUserId || asString(data.source_family_id) !== input.familyId) {
    throw new Error("Famlo Pro add-on payment was not found for this host.");
  }

  const metadata = asObject(data.metadata);
  if (String(data.status) !== "paid" || asString(metadata?.order_kind) !== "addon" || asString(metadata?.addon_type) !== input.addonType) {
    throw new Error("Famlo Pro add-on payment is not valid for this action.");
  }
  if (asString(metadata?.consumed_at)) {
    if (asString(metadata?.consumed_target_reference) === input.targetReference) {
      return;
    }
    throw new Error("Famlo Pro add-on payment has already been used.");
  }

  const consumedAt = new Date().toISOString();
  const updateResult = await supabase
    .from("host_pro_billing_orders")
    .update({
      metadata: {
        ...(metadata ?? {}),
        consumed_at: consumedAt,
        consumed_target_reference: input.targetReference,
      },
      updated_at: consumedAt,
    } as never)
    .eq("id", input.billingOrderId);
  if (updateResult.error) throw updateResult.error;
}

export async function assertPaidHostProAddonOrderAvailable(
  supabase: SupabaseClient,
  input: {
    billingOrderId: string;
    hostUserId: string;
    familyId: string;
    addonType: ProAddonType;
  }
): Promise<void> {
  const { data, error } = await supabase
    .from("host_pro_billing_orders")
    .select("id,status,host_user_id,source_family_id,metadata")
    .eq("id", input.billingOrderId)
    .maybeSingle();
  if (error) throw error;
  if (!data?.id || asString(data.host_user_id) !== input.hostUserId || asString(data.source_family_id) !== input.familyId) {
    throw new Error("Famlo Pro add-on payment was not found for this host.");
  }

  const metadata = asObject(data.metadata);
  if (String(data.status) !== "paid" || asString(metadata?.order_kind) !== "addon" || asString(metadata?.addon_type) !== input.addonType) {
    throw new Error("Famlo Pro add-on payment is not valid for this action.");
  }
  if (asString(metadata?.consumed_at)) {
    throw new Error("Famlo Pro add-on payment has already been used.");
  }
}

export async function createHostProBillingCheckout(
  supabase: SupabaseClient,
  input: {
    hostUserId: string;
    sourceFamilyId: string | null;
    selections: ProBillingPropertySelectionInput[];
    durationMonths?: number;
  },
  dependencies?: {
    createOrder?: (input: { amountRupees: number; receipt: string; notes?: Record<string, string> }) => Promise<RazorpayOrder>;
  }
): Promise<{
  billingOrderId: string;
  pricing: ProBillingPricingBreakdown;
  quote: ProBillingChargeQuote;
  properties: ProBillingValidatedProperty[];
  order: RazorpayOrder;
  keyId: string;
  checkoutMode: "order";
  autopayEnabled: boolean;
}> {
  const normalizedSelections = normalizeProBillingSelections(input.selections);
  const { properties, pricing, quote, scopeHash, durationMonths } = await buildHostProBillingDraft(supabase, {
    hostUserId: input.hostUserId,
    sourceFamilyId: input.sourceFamilyId,
    selections: normalizedSelections,
    durationMonths: input.durationMonths ?? 1,
  });

  if (!isRazorpayConfigured()) {
    throw new Error("Razorpay is not configured for Famlo Pro billing.");
  }

  const { data: existingPending, error: existingPendingError } = await supabase
    .from("host_pro_billing_orders")
    .select("id,gateway_order_id,metadata")
    .eq("host_user_id", input.hostUserId)
    .eq("scope_hash", scopeHash)
    .eq("billing_mode", "manual_order")
    .in("status", ["draft", "payment_pending"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existingPendingError) throw existingPendingError;

  const existingPendingDuration = Number((existingPending?.metadata as JsonRecord | null)?.duration_months ?? 0);
  const existingPendingOrder = (existingPending?.metadata as JsonRecord | null)?.razorpay_order as RazorpayOrder | undefined;
  if (
    existingPending?.id &&
    existingPendingDuration === durationMonths &&
    existingPendingOrder?.id &&
    asString(existingPending.gateway_order_id) === existingPendingOrder.id
  ) {
    return {
      billingOrderId: String(existingPending.id),
      pricing,
      quote,
      properties,
      order: existingPendingOrder,
      keyId: getRazorpayConfig().keyId,
      checkoutMode: "order",
      autopayEnabled: false,
    };
  }

  const nowIso = new Date().toISOString();
  const { data: billingOrder, error: orderInsertError } = await supabase
    .from("host_pro_billing_orders")
    .insert({
      host_user_id: input.hostUserId,
      source_family_id: input.sourceFamilyId,
      status: "draft",
      currency: "INR",
      pricing_version: PRO_BILLING_PRICING_VERSION,
      property_count: pricing.propertyCount,
      room_count: pricing.roomCount,
      raw_subtotal_amount: pricing.rawSubtotalAmount,
      subtotal_amount: quote.payableSubtotalAmount,
      gst_amount: quote.payableGstAmount,
      total_amount: quote.payableTotalAmount,
      scope_hash: scopeHash,
      scope_snapshot: normalizedSelections as unknown as JsonRecord,
      gateway: "razorpay",
      billing_mode: "manual_order",
      metadata: {
        duration_months: durationMonths,
        monthly_subtotal_amount: quote.monthlySubtotalAmount,
        monthly_gst_amount: quote.monthlyGstAmount,
        monthly_total_amount: quote.monthlyTotalAmount,
        payable_subtotal_amount: quote.payableSubtotalAmount,
        payable_gst_amount: quote.payableGstAmount,
        payable_total_amount: quote.payableTotalAmount,
        autopay_enabled: false,
        billing_mode: "manual_order",
        properties: properties.map((property) => ({
          familyId: property.familyId,
          propertyName: property.propertyName,
          roomIds: property.roomIds,
          roomNames: property.rooms.map((room) => room.name),
        })),
      },
      updated_at: nowIso,
    } as never)
    .select("id")
    .single();
  if (orderInsertError) throw orderInsertError;

  const billingOrderId = String(billingOrder.id);
  await insertOrderScopeRows(supabase, billingOrderId, properties);

  const razorpayOrder = await (dependencies?.createOrder ?? createRazorpayOrder)({
    amountRupees: quote.payableTotalAmount,
    receipt: billingOrderId,
    notes: {
      billing_order_id: billingOrderId,
      host_user_id: input.hostUserId,
      property_count: String(pricing.propertyCount),
      room_count: String(pricing.roomCount),
      duration_months: String(durationMonths),
    },
  });

  const updateResult = await supabase
    .from("host_pro_billing_orders")
    .update({
      status: "payment_pending",
      gateway_order_id: razorpayOrder.id,
      metadata: {
        duration_months: durationMonths,
        monthly_subtotal_amount: quote.monthlySubtotalAmount,
        monthly_gst_amount: quote.monthlyGstAmount,
        monthly_total_amount: quote.monthlyTotalAmount,
        payable_subtotal_amount: quote.payableSubtotalAmount,
        payable_gst_amount: quote.payableGstAmount,
        payable_total_amount: quote.payableTotalAmount,
        autopay_enabled: false,
        billing_mode: "manual_order",
        properties: properties.map((property) => ({
          familyId: property.familyId,
          propertyName: property.propertyName,
          roomIds: property.roomIds,
          roomNames: property.rooms.map((room) => room.name),
        })),
        razorpay_order: razorpayOrder,
      },
      updated_at: new Date().toISOString(),
    } as never)
    .eq("id", billingOrderId);
  if (updateResult.error) throw updateResult.error;

  return {
    billingOrderId,
    pricing,
    quote,
    properties,
    order: razorpayOrder,
    keyId: getRazorpayConfig().keyId,
    checkoutMode: "order",
    autopayEnabled: false,
  };
}

export async function finalizeCapturedHostProBillingOrder(
  supabase: SupabaseClient,
  input: {
    billingOrderId: string;
    gatewayOrderId: string;
    gatewayPaymentId: string;
    paymentSignature?: string | null;
    providerPaymentStatus: string;
    providerAmountPaise: number | null | undefined;
    providerEventId?: string | null;
    paidAtIso?: string;
  },
  dependencies?: {
    fetchPayment?: (paymentId: string) => Promise<RazorpayPaymentEntity>;
    sendInvoiceEmail?: typeof sendHostProInvoiceEmail;
  }
): Promise<{
  billingOrderId: string;
  invoiceId: string;
  emailDeliveryId: string | null;
  alreadyFinalized: boolean;
}> {
  const { data: billingOrder, error: billingOrderError } = await supabase
    .from("host_pro_billing_orders")
    .select("id,host_user_id,status,total_amount,scope_hash,gateway_order_id,gateway_payment_id,invoice_id,finance_email_delivery_id,metadata,billing_mode,gateway_subscription_id,gateway_plan_id")
    .eq("id", input.billingOrderId)
    .maybeSingle();
  if (billingOrderError) throw billingOrderError;
  if (!billingOrder?.id) {
    throw new Error("Famlo Pro billing order not found.");
  }

  if (String(billingOrder.status) === "paid" && asString(billingOrder.invoice_id)) {
    return {
      billingOrderId: String(billingOrder.id),
      invoiceId: String(billingOrder.invoice_id),
      emailDeliveryId: asString(billingOrder.finance_email_delivery_id),
      alreadyFinalized: true,
    };
  }

  if (!isCapturedProBillingPaymentStatus(input.providerPaymentStatus)) {
    throw new Error("Famlo Pro billing payment is not captured yet.");
  }

  const expectedTotalAmount = Number(billingOrder.total_amount ?? 0);
  if (!doesProBillingAmountMatch(expectedTotalAmount, input.providerAmountPaise)) {
    throw new Error("Captured Famlo Pro payment amount does not match the billing order total.");
  }

  if (asString(billingOrder.gateway_order_id) && asString(billingOrder.gateway_order_id) !== input.gatewayOrderId) {
    throw new Error("Famlo Pro billing order does not match the Razorpay order.");
  }

  const paidAtIso = input.paidAtIso ?? new Date().toISOString();
  const hostUserId = String(billingOrder.host_user_id ?? "");
  const properties = await loadOrderScope(supabase, input.billingOrderId);
  const pricing = buildProBillingPricingBreakdown(properties);
  const durationMonths = normalizeProBillingDurationMonths((billingOrder.metadata as JsonRecord | null)?.duration_months ?? 1);
  const quote = buildProBillingChargeQuote(pricing, durationMonths);

  await activateScopedSubscriptions(supabase, {
    billingOrderId: input.billingOrderId,
    hostUserId,
    paidAtIso,
    pricing,
    quote,
    properties,
    scopeHash: asString(billingOrder.scope_hash) ?? buildProBillingScopeHash(
      properties.map((property) => ({ familyId: property.familyId, roomIds: property.roomIds }))
    ),
    billingMode: (asString(billingOrder.billing_mode) as ProBillingMode | null) ?? "manual_order",
    durationMonths,
    providerSubscriptionId: asString(billingOrder.gateway_subscription_id),
    razorpayPlanId: asString(billingOrder.gateway_plan_id),
    providerEventId: input.providerEventId ?? null,
    autopayStatus:
      (asString((billingOrder.metadata as JsonRecord | null)?.autopay_status) ?? null) ||
      ((asString(billingOrder.billing_mode) as ProBillingMode | null) === "autopay_subscription" ? "active" : null),
    mandateStatus: asString((billingOrder.metadata as JsonRecord | null)?.mandate_status),
    nextChargeAt: asString((billingOrder.metadata as JsonRecord | null)?.next_charge_at),
    lastChargeAt: paidAtIso,
    paymentFailureReason: null,
  });

  const invoice = await createOrUpdateProInvoice(supabase, {
    billingOrderId: input.billingOrderId,
    hostUserId,
    gatewayOrderId: input.gatewayOrderId,
    gatewayPaymentId: input.gatewayPaymentId,
    issuedAtIso: paidAtIso,
    pricing,
    quote,
    properties,
  });

  let emailDeliveryId: string | null = null;
  try {
    const emailResult = await (dependencies?.sendInvoiceEmail ?? sendHostProInvoiceEmail)(supabase, {
      invoiceId: invoice.id,
      hostUserId,
      payload: invoice.payload,
    });
    emailDeliveryId = emailResult.deliveryId;
  } catch (error) {
    console.error("[pro-billing] invoice email failed:", error);
  }

  try {
    await enqueueHostProInvoiceWhatsApp(supabase, {
      invoiceId: invoice.id,
      hostUserId,
      payload: invoice.payload,
    });
  } catch (error) {
    console.error("[pro-billing] invoice whatsapp enqueue failed:", error);
  }

  const updateResult = await supabase
    .from("host_pro_billing_orders")
    .update({
      status: "paid",
      gateway_payment_id: input.gatewayPaymentId,
      payment_signature: input.paymentSignature ?? null,
      payment_captured_at: paidAtIso,
      provider_event_id: input.providerEventId ?? null,
      invoice_id: invoice.id,
      finance_email_delivery_id: emailDeliveryId,
      metadata: {
        ...(((billingOrder.metadata as JsonRecord | null) ?? {}) as JsonRecord),
        last_payment_status: "paid",
        last_payment_at: paidAtIso,
        billing_mode: (asString(billingOrder.billing_mode) as ProBillingMode | null) ?? "manual_order",
        autopay_enabled: asString(billingOrder.billing_mode) === "autopay_subscription",
        autopay_status: asString(billingOrder.billing_mode) === "autopay_subscription" ? "active" : null,
      },
      updated_at: paidAtIso,
    } as never)
    .eq("id", input.billingOrderId);
  if (updateResult.error) throw updateResult.error;

  return {
    billingOrderId: input.billingOrderId,
    invoiceId: invoice.id,
    emailDeliveryId,
    alreadyFinalized: false,
  };
}

export async function verifyAndFinalizeHostProBillingOrder(
  supabase: SupabaseClient,
  input: {
    billingOrderId: string;
    gatewayOrderId: string;
    gatewayPaymentId: string;
    paymentSignature: string;
  },
  dependencies?: {
    fetchPayment?: (paymentId: string) => Promise<RazorpayPaymentEntity>;
    sendInvoiceEmail?: typeof sendHostProInvoiceEmail;
  }
) {
  const providerPayment = await (dependencies?.fetchPayment ?? fetchRazorpayPayment)(input.gatewayPaymentId);
  if (providerPayment.order_id && providerPayment.order_id !== input.gatewayOrderId) {
    throw new Error("Razorpay payment order mismatch.");
  }

  return finalizeCapturedHostProBillingOrder(
    supabase,
    {
      billingOrderId: input.billingOrderId,
      gatewayOrderId: input.gatewayOrderId,
      gatewayPaymentId: input.gatewayPaymentId,
      paymentSignature: input.paymentSignature,
      providerPaymentStatus: providerPayment.status,
      providerAmountPaise: providerPayment.amount,
    },
    dependencies
  );
}

function normalizeBillingMode(value: unknown): ProBillingMode {
  return String(value ?? "").trim().toLowerCase() === "autopay_subscription"
    ? "autopay_subscription"
    : "manual_order";
}

function buildAutopayCycleKey(input: {
  subscriptionId: string;
  paymentId?: string | null;
  invoiceId?: string | null;
  capturedAtIso?: string | null;
}): string {
  return [
    input.subscriptionId,
    input.paymentId ?? "no-payment",
    input.invoiceId ?? "no-invoice",
    input.capturedAtIso ?? "no-capture",
  ].join(":");
}

async function createOrReuseStoredProPlan(
  supabase: SupabaseClient,
  pricing: ProBillingPricingBreakdown,
  createPlan: typeof createRazorpaySubscriptionPlan = createRazorpaySubscriptionPlan
): Promise<{ id: string; razorpayPlanId: string }> {
  const amountPaise = Math.round(pricing.totalAmount * 100);
  const subtotalPaise = Math.round(pricing.subtotalAmount * 100);
  const gstPaise = Math.round(pricing.gstAmount * 100);

  const { data: existing, error: existingError } = await supabase
    .from("pro_razorpay_plans")
    .select("id,razorpay_plan_id")
    .eq("amount_paise", amountPaise)
    .eq("currency", "INR")
    .eq("period", "monthly")
    .eq("interval", 1)
    .eq("pricing_version", pricing.pricingVersion)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing?.id) {
    return { id: String(existing.id), razorpayPlanId: String(existing.razorpay_plan_id) };
  }

  const created = await createPlan({
    amountPaise,
    subtotalPaise,
    gstPaise,
    propertyCount: pricing.propertyCount,
    roomCount: pricing.roomCount,
    pricingVersion: pricing.pricingVersion,
  });

  const { data: inserted, error: insertError } = await supabase
    .from("pro_razorpay_plans")
    .insert({
      razorpay_plan_id: created.id,
      amount_paise: amountPaise,
      subtotal_paise: subtotalPaise,
      gst_paise: gstPaise,
      currency: "INR",
      period: "monthly",
      interval: 1,
      pricing_version: pricing.pricingVersion,
      metadata: {
        item_name: created.item?.name ?? "Famlo Pro Monthly",
        description: created.item?.description ?? null,
      },
    } as never)
    .select("id,razorpay_plan_id")
    .single();
  if (insertError) throw insertError;

  return { id: String(inserted.id), razorpayPlanId: String(inserted.razorpay_plan_id) };
}

async function createAutopayBillingOrder(
  supabase: SupabaseClient,
  input: {
    hostUserId: string;
    sourceFamilyId: string | null;
    selections: ProBillingPropertySelectionInput[];
    properties: ProBillingValidatedProperty[];
    pricing: ProBillingPricingBreakdown;
    scopeHash: string;
    razorpayPlanId: string;
    razorpaySubscriptionId: string;
    metadata?: JsonRecord;
    cycleKey?: string | null;
    gatewayPaymentId?: string | null;
    gatewayInvoiceId?: string | null;
    paidAtIso?: string | null;
    status?: string;
  }
): Promise<string> {
  const nowIso = input.paidAtIso ?? new Date().toISOString();
  const { data: billingOrder, error: orderInsertError } = await supabase
    .from("host_pro_billing_orders")
    .insert({
      host_user_id: input.hostUserId,
      source_family_id: input.sourceFamilyId,
      status: input.status ?? "payment_pending",
      currency: "INR",
      pricing_version: PRO_BILLING_PRICING_VERSION,
      property_count: input.pricing.propertyCount,
      room_count: input.pricing.roomCount,
      raw_subtotal_amount: input.pricing.rawSubtotalAmount,
      subtotal_amount: input.pricing.subtotalAmount,
      gst_amount: input.pricing.gstAmount,
      total_amount: input.pricing.totalAmount,
      scope_hash: input.scopeHash,
      scope_snapshot: normalizeProBillingSelections(input.selections) as unknown as JsonRecord,
      gateway: "razorpay",
      billing_mode: "autopay_subscription",
      gateway_subscription_id: input.razorpaySubscriptionId,
      gateway_plan_id: input.razorpayPlanId,
      gateway_payment_id: input.gatewayPaymentId ?? null,
      gateway_invoice_id: input.gatewayInvoiceId ?? null,
      cycle_key: input.cycleKey ?? null,
      payment_captured_at: input.paidAtIso ?? null,
      metadata: {
        autopay_enabled: true,
        billing_mode: "autopay_subscription",
        razorpay_subscription_id: input.razorpaySubscriptionId,
        razorpay_plan_id: input.razorpayPlanId,
        properties: input.properties.map((property) => ({
          familyId: property.familyId,
          propertyName: property.propertyName,
          roomIds: property.roomIds,
          roomNames: property.rooms.map((room) => room.name),
        })),
        ...(input.metadata ?? {}),
      },
      updated_at: nowIso,
    } as never)
    .select("id")
    .single();
  if (orderInsertError) throw orderInsertError;

  const billingOrderId = String(billingOrder.id);
  await insertOrderScopeRows(supabase, billingOrderId, input.properties);
  return billingOrderId;
}

async function createFreshScopeBillingOrderForRecurringCharge(
  supabase: SupabaseClient,
  input: {
    hostUserId: string;
    razorpaySubscriptionId: string;
    paidAtIso: string;
    gatewayPaymentId: string;
    gatewayInvoiceId?: string | null;
    providerEventId?: string | null;
  }
): Promise<string> {
  const cycleKey = buildAutopayCycleKey({
    subscriptionId: input.razorpaySubscriptionId,
    paymentId: input.gatewayPaymentId,
    invoiceId: input.gatewayInvoiceId ?? null,
    capturedAtIso: input.paidAtIso,
  });

  const { data: existingCycle, error: existingCycleError } = await supabase
    .from("host_pro_billing_orders")
    .select("id")
    .eq("gateway_subscription_id", input.razorpaySubscriptionId)
    .eq("cycle_key", cycleKey)
    .maybeSingle();
  if (existingCycleError) throw existingCycleError;
  if (existingCycle?.id) return String(existingCycle.id);

  const renewalScope = await loadFreshAutopayRenewalScope(supabase, {
    hostUserId: input.hostUserId,
    razorpaySubscriptionId: input.razorpaySubscriptionId,
  });

  return createAutopayBillingOrder(supabase, {
    hostUserId: input.hostUserId,
    sourceFamilyId: renewalScope.sourceFamilyId,
    selections: renewalScope.selections,
    properties: renewalScope.properties,
    pricing: renewalScope.pricing,
    scopeHash: renewalScope.scopeHash,
    razorpayPlanId: renewalScope.razorpayPlanId,
    razorpaySubscriptionId: input.razorpaySubscriptionId,
    cycleKey,
    gatewayPaymentId: input.gatewayPaymentId,
    gatewayInvoiceId: input.gatewayInvoiceId ?? null,
    paidAtIso: input.paidAtIso,
    status: "payment_pending",
    metadata: {
      last_provider_event_id: input.providerEventId ?? null,
      recurring_charge: true,
      renewal_scope_source: "live_active_inventory",
    },
  });
}

async function updateSubscriptionLifecycleByProviderId(
  supabase: SupabaseClient,
  input: {
    razorpaySubscriptionId: string;
    patch: JsonRecord;
  }
): Promise<void> {
  const { error } = await supabase
    .from("host_pro_subscriptions")
    .update(input.patch as never)
    .eq("razorpay_subscription_id", input.razorpaySubscriptionId);
  if (error) throw error;
}

export async function getHostProAutopaySnapshot(
  supabase: SupabaseClient,
  hostUserId: string
): Promise<ProAutopaySnapshot> {
  const { data, error } = await supabase
    .from("host_pro_subscriptions")
    .select(
      "billing_order_id,autopay_enabled,autopay_status,subscription_status,mandate_status,razorpay_subscription_id,current_period_end,grace_until,next_charge_at,payment_failure_reason,updated_at"
    )
    .eq("host_user_id", hostUserId)
    .eq("billing_mode", "autopay_subscription")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;

  return {
    enabled: isFamloProAutopayEnabled(),
    requireSubscription: requiresFamloProSubscriptionAutopay(),
    mode: isFamloProAutopayEnabled() ? "autopay_subscription" : "disabled",
    subscriptionId: asString(data?.razorpay_subscription_id),
    subscriptionStatus: asString(data?.subscription_status) ?? asString(data?.autopay_status),
    mandateStatus: asString(data?.mandate_status),
    nextChargeAt: asString(data?.next_charge_at),
    currentPeriodEnd: asString(data?.current_period_end),
    graceUntil: asString(data?.grace_until),
    billingOrderId: asString(data?.billing_order_id),
    failureReason: asString(data?.payment_failure_reason),
  };
}

export async function createHostProAutopayCheckout(
  supabase: SupabaseClient,
  input: {
    hostUserId: string;
    sourceFamilyId: string | null;
    selections: ProBillingPropertySelectionInput[];
  },
  dependencies?: {
    createPlan?: typeof createRazorpaySubscriptionPlan;
    createSubscription?: typeof createProSubscription;
  }
): Promise<{
  billingOrderId: string;
  pricing: ProBillingPricingBreakdown;
  properties: ProBillingValidatedProperty[];
  subscription: RazorpaySubscriptionEntity;
  keyId: string;
  checkoutMode: "subscription";
  autopayEnabled: true;
  manualFallbackAllowed: true;
}> {
  if (!isFamloProAutopayEnabled()) {
    throw new Error("Famlo Pro autopay is disabled in this environment.");
  }
  if (!requiresFamloProSubscriptionAutopay()) {
    throw new Error("Famlo Pro autopay requires Razorpay Subscriptions in this environment.");
  }
  if (!isRazorpayConfigured()) {
    throw new Error("Razorpay is not configured for Famlo Pro autopay.");
  }

  const normalizedSelections = normalizeProBillingSelections(input.selections);
  const { properties, pricing, scopeHash } = await buildHostProBillingDraft(supabase, {
    hostUserId: input.hostUserId,
    sourceFamilyId: input.sourceFamilyId,
    selections: normalizedSelections,
  });

  const storedPlan = await createOrReuseStoredProPlan(supabase, pricing, dependencies?.createPlan);
  const subscription = await (dependencies?.createSubscription ?? createProSubscription)({
    planId: storedPlan.razorpayPlanId,
    totalCount: PRO_BILLING_AUTOPAY_TOTAL_COUNT,
    customerNotify: true,
    notes: {
      famlo_product: "famlo_pro",
      host_user_id: input.hostUserId,
      property_count: String(pricing.propertyCount),
      room_count: String(pricing.roomCount),
      pricing_version: pricing.pricingVersion,
      scope_hash: scopeHash,
    },
  });

  const billingOrderId = await createAutopayBillingOrder(supabase, {
    hostUserId: input.hostUserId,
    sourceFamilyId: input.sourceFamilyId,
    selections: normalizedSelections,
    properties,
    pricing,
    scopeHash,
    razorpayPlanId: storedPlan.razorpayPlanId,
    razorpaySubscriptionId: subscription.id,
    metadata: {
      autopay_status: subscription.status,
      mandate_status: subscription.status === "authenticated" ? "authenticated" : null,
      next_charge_at: subscription.charge_at ? new Date(subscription.charge_at * 1000).toISOString() : null,
      short_url: subscription.short_url ?? null,
    },
  });

  return {
    billingOrderId,
    pricing,
    properties,
    subscription,
    keyId: getRazorpayConfig().keyId,
    checkoutMode: "subscription",
    autopayEnabled: true,
    manualFallbackAllowed: true,
  };
}

export async function verifyAndFinalizeHostProAutopaySubscription(
  supabase: SupabaseClient,
  input: {
    billingOrderId: string;
    razorpaySubscriptionId: string;
    razorpayPaymentId: string;
    razorpaySignature: string;
  }
): Promise<{ billingOrderId: string; invoiceId: string | null; alreadyFinalized: boolean; status: string }> {
  const providerSubscription = await fetchProSubscription(input.razorpaySubscriptionId);
  const providerPayment = await fetchRazorpayPayment(input.razorpayPaymentId);
  const { data: billingOrder, error: orderError } = await supabase
    .from("host_pro_billing_orders")
    .select("id,host_user_id,status,gateway_subscription_id,gateway_plan_id")
    .eq("id", input.billingOrderId)
    .maybeSingle();
  if (orderError) throw orderError;
  if (!billingOrder?.id) {
    throw new Error("Famlo Pro autopay billing order not found.");
  }

  if (asString(billingOrder.gateway_subscription_id) !== input.razorpaySubscriptionId) {
    throw new Error("Razorpay subscription mismatch for this Famlo Pro autopay order.");
  }

  const paidAtIso = new Date().toISOString();
  const result = await finalizeCapturedHostProBillingOrder(supabase, {
    billingOrderId: input.billingOrderId,
    gatewayOrderId: input.razorpaySubscriptionId,
    gatewayPaymentId: input.razorpayPaymentId,
    paymentSignature: input.razorpaySignature,
    providerPaymentStatus: providerPayment.status,
    providerAmountPaise: providerPayment.amount,
    providerEventId: null,
    paidAtIso,
  });

  await updateSubscriptionLifecycleByProviderId(supabase, {
    razorpaySubscriptionId: input.razorpaySubscriptionId,
    patch: {
      status: "active",
      billing_mode: "autopay_subscription",
      autopay_enabled: true,
      autopay_status: providerSubscription.status,
      subscription_status: providerSubscription.status,
      mandate_status: providerSubscription.status === "authenticated" ? "authenticated" : "active",
      next_charge_at: providerSubscription.charge_at ? new Date(providerSubscription.charge_at * 1000).toISOString() : null,
      updated_at: paidAtIso,
    },
  });

  return {
    billingOrderId: result.billingOrderId,
    invoiceId: result.invoiceId,
    alreadyFinalized: result.alreadyFinalized,
    status: providerSubscription.status,
  };
}

export async function processHostProAutopayWebhook(
  supabase: SupabaseClient,
  input: {
    eventName: string;
    providerEventId: string;
    razorpaySubscriptionId: string | null;
    razorpayPaymentId: string | null;
    razorpayInvoiceId?: string | null;
    paymentStatus?: string | null;
    subscriptionStatus?: string | null;
    amountPaise?: number | null;
    paidAtIso?: string | null;
    chargeAtIso?: string | null;
    notes?: Record<string, string>;
    failureReason?: string | null;
  },
  dependencies?: {
    sendInvoiceEmail?: typeof sendHostProInvoiceEmail;
  }
): Promise<{ processed: boolean; action: string }> {
  const subscriptionId = input.razorpaySubscriptionId;
  if (!subscriptionId) {
    return { processed: false, action: "missing_subscription_id" };
  }

  const paidAtIso = input.paidAtIso ?? new Date().toISOString();
  const { data: currentOrder, error: currentOrderError } = await supabase
    .from("host_pro_billing_orders")
    .select("id,host_user_id,status,gateway_subscription_id,gateway_plan_id,metadata")
    .eq("gateway_subscription_id", subscriptionId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (currentOrderError) throw currentOrderError;

  const hostUserId =
    asString(currentOrder?.host_user_id) ?? asString(input.notes?.host_user_id);
  if (!hostUserId) {
    return { processed: false, action: "missing_host_context" };
  }

  if (input.razorpayPaymentId) {
    const { data: existingPaymentOrder, error: existingPaymentOrderError } = await supabase
      .from("host_pro_billing_orders")
      .select("id,status,invoice_id")
      .eq("gateway_subscription_id", subscriptionId)
      .eq("gateway_payment_id", input.razorpayPaymentId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existingPaymentOrderError) throw existingPaymentOrderError;
    if (existingPaymentOrder?.id && String(existingPaymentOrder.status ?? "") === "paid" && asString(existingPaymentOrder.invoice_id)) {
      return { processed: true, action: "charge_duplicate" };
    }
  }

  if (
    input.eventName === "subscription.pending" ||
    input.eventName === "invoice.payment_failed" ||
    input.eventName === "payment.failed"
  ) {
    await updateSubscriptionLifecycleByProviderId(supabase, {
      razorpaySubscriptionId: subscriptionId,
      patch: {
        status: "payment_failed",
        autopay_enabled: true,
        autopay_status: input.subscriptionStatus ?? "payment_failed",
        subscription_status: input.subscriptionStatus ?? "payment_failed",
        payment_failure_reason: input.failureReason ?? null,
        last_provider_event_id: input.providerEventId,
        updated_at: paidAtIso,
      },
    });

    if (currentOrder?.id) {
      const { error } = await supabase
        .from("host_pro_billing_orders")
        .update({
          status: "payment_failed",
          payment_failed_at: paidAtIso,
          provider_event_id: input.providerEventId,
          failure_reason: input.failureReason ?? null,
          metadata: {
            ...(((currentOrder.metadata as JsonRecord | null) ?? {}) as JsonRecord),
            last_payment_status: "payment_failed",
            last_payment_at: paidAtIso,
            autopay_enabled: true,
            autopay_status: input.subscriptionStatus ?? "payment_failed",
          },
          updated_at: paidAtIso,
        } as never)
        .eq("id", currentOrder.id);
      if (error) throw error;
    }

    return { processed: true, action: "payment_failed" };
  }

  if (input.eventName === "subscription.halted") {
    await updateSubscriptionLifecycleByProviderId(supabase, {
      razorpaySubscriptionId: subscriptionId,
      patch: {
        status: "halted",
        autopay_enabled: true,
        autopay_status: "halted",
        subscription_status: input.subscriptionStatus ?? "halted",
        halted_at: paidAtIso,
        payment_failure_reason: input.failureReason ?? null,
        last_provider_event_id: input.providerEventId,
        updated_at: paidAtIso,
      },
    });
    return { processed: true, action: "halted" };
  }

  if (input.eventName === "subscription.cancelled") {
    await updateSubscriptionLifecycleByProviderId(supabase, {
      razorpaySubscriptionId: subscriptionId,
      patch: {
        status: "cancelled",
        autopay_enabled: true,
        autopay_status: "cancelled",
        subscription_status: input.subscriptionStatus ?? "cancelled",
        cancel_at_period_end: true,
        cancelled_at: paidAtIso,
        last_provider_event_id: input.providerEventId,
        updated_at: paidAtIso,
      },
    });
    return { processed: true, action: "cancelled" };
  }

  if (input.eventName === "subscription.paused") {
    await updateSubscriptionLifecycleByProviderId(supabase, {
      razorpaySubscriptionId: subscriptionId,
      patch: {
        status: "paused",
        autopay_enabled: true,
        autopay_status: "paused",
        subscription_status: input.subscriptionStatus ?? "paused",
        paused_at: paidAtIso,
        last_provider_event_id: input.providerEventId,
        updated_at: paidAtIso,
      },
    });
    return { processed: true, action: "paused" };
  }

  if (input.eventName === "subscription.resumed") {
    await updateSubscriptionLifecycleByProviderId(supabase, {
      razorpaySubscriptionId: subscriptionId,
      patch: {
        status: "active",
        autopay_enabled: true,
        autopay_status: "active",
        subscription_status: input.subscriptionStatus ?? "active",
        resumed_at: paidAtIso,
        next_charge_at: input.chargeAtIso ?? null,
        last_provider_event_id: input.providerEventId,
        updated_at: paidAtIso,
      },
    });
    return { processed: true, action: "resumed" };
  }

  if (
    input.eventName === "subscription.authenticated" ||
    input.eventName === "subscription.activated"
  ) {
    await updateSubscriptionLifecycleByProviderId(supabase, {
      razorpaySubscriptionId: subscriptionId,
      patch: {
        autopay_enabled: true,
        autopay_status: input.subscriptionStatus ?? "authenticated",
        subscription_status: input.subscriptionStatus ?? "authenticated",
        mandate_status: input.eventName === "subscription.authenticated" ? "authenticated" : "active",
        next_charge_at: input.chargeAtIso ?? null,
        last_provider_event_id: input.providerEventId,
        updated_at: paidAtIso,
      },
    });
    return { processed: true, action: input.eventName };
  }

  const shouldFinalizeCharge =
    input.eventName === "subscription.charged" ||
    input.eventName === "payment.captured" ||
    input.eventName === "invoice.paid";

  if (!shouldFinalizeCharge || !input.razorpayPaymentId) {
    return { processed: false, action: "ignored" };
  }

  const billingOrderId =
    currentOrder?.status !== "paid" && currentOrder?.id
      ? String(currentOrder.id)
      : await createFreshScopeBillingOrderForRecurringCharge(supabase, {
          hostUserId,
          razorpaySubscriptionId: subscriptionId,
          paidAtIso,
          gatewayPaymentId: input.razorpayPaymentId,
          gatewayInvoiceId: input.razorpayInvoiceId ?? null,
          providerEventId: input.providerEventId,
        });

  const result = await finalizeCapturedHostProBillingOrder(supabase, {
    billingOrderId,
    gatewayOrderId: subscriptionId,
    gatewayPaymentId: input.razorpayPaymentId,
    providerPaymentStatus: "captured",
    providerAmountPaise: input.amountPaise ?? null,
    providerEventId: input.providerEventId,
    paidAtIso,
  }, dependencies);

  await updateSubscriptionLifecycleByProviderId(supabase, {
    razorpaySubscriptionId: subscriptionId,
    patch: {
      status: "active",
      billing_mode: "autopay_subscription",
      autopay_enabled: true,
      autopay_status: input.subscriptionStatus ?? "active",
      subscription_status: input.subscriptionStatus ?? "active",
      mandate_status: "active",
      next_charge_at: input.chargeAtIso ?? null,
      last_charge_at: paidAtIso,
      payment_failure_reason: null,
      last_provider_event_id: input.providerEventId,
      updated_at: paidAtIso,
    },
  });

  if (currentOrder?.id && currentOrder.status !== "paid") {
    const replacesId = asString((currentOrder.metadata as JsonRecord | null)?.replaces_subscription_id);
    if (replacesId && replacesId !== subscriptionId) {
      await cancelProSubscription(replacesId, { cancelAtCycleEnd: true }).catch(() => {});
      await updateSubscriptionLifecycleByProviderId(supabase, {
        razorpaySubscriptionId: replacesId,
        patch: {
          cancel_at_period_end: true,
          status: "cancelled",
          updated_at: paidAtIso,
        },
      }).catch(() => {});
    }
  }

  return { processed: true, action: result.alreadyFinalized ? "charge_duplicate" : "charge_finalized" };
}

export async function cancelHostProAutopayAtPeriodEnd(
  supabase: SupabaseClient,
  input: { hostUserId: string; razorpaySubscriptionId: string }
): Promise<void> {
  await cancelProSubscription(input.razorpaySubscriptionId, { cancelAtCycleEnd: true });
  await updateSubscriptionLifecycleByProviderId(supabase, {
    razorpaySubscriptionId: input.razorpaySubscriptionId,
    patch: {
      cancel_at_period_end: true,
      status: "cancelled",
      updated_at: new Date().toISOString(),
    },
  });
}

export function buildProBillingRazorpayNotes(input: {
  billingOrderId: string;
  hostUserId: string;
  pricing: ProBillingPricingBreakdown;
}): Record<string, string> {
  return {
    billing_order_id: input.billingOrderId,
    host_user_id: input.hostUserId,
    property_count: String(input.pricing.propertyCount),
    room_count: String(input.pricing.roomCount),
    total_amount: String(input.pricing.totalAmount),
    nonce: crypto.randomUUID(),
  };
}
