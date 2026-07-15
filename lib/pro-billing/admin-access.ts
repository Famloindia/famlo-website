import { deriveProAccessStatus, normalizeProSubscriptionStatus } from "@/lib/pro-billing/access-status";

type JsonRecord = Record<string, unknown>;

export const PRO_ADMIN_ACCESS_PROPERTY_PRICE = 199;
export const PRO_ADMIN_ACCESS_ROOM_PRICE = 100;
export const PRO_ADMIN_ACCESS_MINIMUM_SUBTOTAL = 499;

export type AdminProAccessRow = {
  recordKey: string;
  subscriptionId: string | null;
  hostUserId: string | null;
  hostName: string;
  hostCode: string | null;
  accountId: string | null;
  primaryProPropertyId: string | null;
  primaryProPropertyName: string;
  primaryProPropertyLocation: string | null;
  status: string;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  graceUntil: string | null;
  lastPaymentAt: string | null;
  lastChargeAt: string | null;
  nextRenewalDate: string | null;
  nextChargeAt: string | null;
  lastPaymentStatus: string | null;
  autopayEnabled: boolean;
  billingMode: "manual_order" | "autopay_subscription";
  mandateStatus: string | null;
  subscriptionProviderIdMasked: string | null;
  failedPaymentReason: string | null;
  hostCtaNeeded: string | null;
  scopedPropertiesCount: number;
  scopedRoomsCount: number;
  scopedPropertiesSummary: string;
  scopedRoomsSummary: string;
  purchasedDuration: string;
  proProperties: number;
  roomsCounted: number;
  currentMonthlyCharge: number;
  nonGranting: boolean;
};

type AdminProAccessSummary = {
  proRevenue: number;
  proGst: number;
  proProfit: number;
  totalCollected: number;
  pendingPayments: number;
  failedPayments: number;
  activeSubscriptions: number;
  graceSubscriptions: number;
  pausedSubscriptions: number;
  haltedSubscriptions: number;
  cancelledSubscriptions: number;
  paymentFailedSubscriptions: number;
  autopaySubscriptions: number;
  manualSubscriptions: number;
  selectedPropertiesCount: number;
  selectedRoomsCount: number;
  activeProperties: number;
  activeRooms: number;
  issuedInvoices: number;
};

type SubscriptionRecord = {
  id: string | null;
  family_id: string | null;
  host_user_id: string | null;
  billing_order_id?: string | null;
  primary_pro_property_id: string | null;
  status: string | null;
  current_period_start?: string | null;
  current_period_end: string | null;
  grace_until: string | null;
  last_payment_at: string | null;
  next_charge_at?: string | null;
  last_charge_at?: string | null;
  created_at: string | null;
  metadata?: JsonRecord | null;
  billing_mode?: string | null;
  autopay_enabled?: boolean | null;
  autopay_status?: string | null;
  mandate_status?: string | null;
  razorpay_subscription_id?: string | null;
  payment_failure_reason?: string | null;
};

type FamilyRecord = {
  id: string;
  name?: string | null;
  property_name?: string | null;
  host_id?: string | null;
  city?: string | null;
  state?: string | null;
  user_id?: string | null;
  is_active?: boolean | null;
  created_at?: string | null;
};

type StayUnitRecord = {
  id: string;
  legacy_family_id: string | null;
  is_active?: boolean | null;
  unit_key?: string | null;
  host_id?: string | null;
};

type HostRecord = {
  user_id?: string | null;
  display_name?: string | null;
};

type UserRecord = {
  id: string;
  name?: string | null;
};

type OrderRecord = {
  id: string;
  host_user_id: string | null;
  status: string | null;
  property_count: number | null;
  room_count: number | null;
  subtotal_amount: number | null;
  gst_amount: number | null;
  total_amount: number | null;
  created_at: string | null;
  payment_captured_at: string | null;
  billing_mode?: string | null;
  gateway_subscription_id?: string | null;
};

type InvoiceRecord = {
  id: string;
};

type SubscriptionRoomRecord = {
  subscription_id: string | null;
  family_id: string | null;
  stay_unit_id: string | null;
  room_name: string | null;
  status: string | null;
};

type OrderPropertyRecord = {
  billing_order_id: string | null;
  family_id: string | null;
  property_name: string | null;
};

const DEFAULT_PRO_CHANNEX_ROOM_COST_USD = 0.5;
const DEFAULT_PRO_USD_INR_RATE = 83;

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function asObject(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;
}

function toMillis(value: string | null): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function normalizeStatus(value: string | null | undefined): string {
  return normalizeProSubscriptionStatus(value);
}

function statusRank(value: string): number {
  if (value === "active") return 5;
  if (value === "grace") return 4;
  if (value === "payment_failed") return 3;
  if (value === "halted") return 3;
  if (value === "paused") return 2;
  if (value === "inactive") return 1;
  if (value === "cancelled") return 1;
  return 1;
}

function compareSubscriptionPriority(left: SubscriptionRecord, right: SubscriptionRecord): number {
  const now = new Date();
  const rankDiff =
    statusRank(deriveProAccessStatus(right, { now }).status) -
    statusRank(deriveProAccessStatus(left, { now }).status);
  if (rankDiff !== 0) return rankDiff;

  const rightBoundary = toMillis(right.current_period_end) || toMillis(right.grace_until) || toMillis(right.created_at);
  const leftBoundary = toMillis(left.current_period_end) || toMillis(left.grace_until) || toMillis(left.created_at);
  return rightBoundary - leftBoundary;
}

function compareCreatedAscending(
  left: { created_at?: string | null },
  right: { created_at?: string | null }
): number {
  return toMillis(left.created_at ?? null) - toMillis(right.created_at ?? null);
}

function resolveLocation(family: FamilyRecord | null | undefined): string | null {
  if (!family) return null;
  const parts = [asString(family.city), asString(family.state)].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(", ") : null;
}

function resolvePropertyLabel(family: FamilyRecord | null | undefined): string {
  return asString(family?.property_name) ?? asString(family?.name) ?? "Famlo Property";
}

function resolveMonthlyCharge(propertyCount: number, roomCount: number): number {
  const subtotal = propertyCount * PRO_ADMIN_ACCESS_PROPERTY_PRICE + roomCount * PRO_ADMIN_ACCESS_ROOM_PRICE;
  return Math.max(subtotal, PRO_ADMIN_ACCESS_MINIMUM_SUBTOTAL);
}

function getUsdInrRate(): number {
  const parsed = Number.parseFloat(String(process.env.FAMLO_PRO_USD_INR_RATE ?? ""));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_PRO_USD_INR_RATE;
}

function getAdditionalCostInr(envKey: string): number {
  const parsed = Number.parseFloat(String(process.env[envKey] ?? ""));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function resolveProProfit(params: {
  proRevenue: number;
  proGst: number;
  scopedRoomsCount: number;
  totalCollected: number;
  paidOrdersCount: number;
}): number {
  const usdInrRate = getUsdInrRate();
  const channexCostInr = params.scopedRoomsCount * DEFAULT_PRO_CHANNEX_ROOM_COST_USD * usdInrRate;
  const razorpayFeePct = Number.parseFloat(String(process.env.FAMLO_PRO_RAZORPAY_FEE_PCT ?? "0"));
  const razorpayFeeFixedInr = Number.parseFloat(String(process.env.FAMLO_PRO_RAZORPAY_FEE_FIXED_INR ?? "0"));
  const razorpayFeeGstPct = Number.parseFloat(String(process.env.FAMLO_PRO_RAZORPAY_FEE_GST_PCT ?? "18"));
  const gatewayFeeBase =
    (Number.isFinite(razorpayFeePct) && razorpayFeePct > 0 ? (params.totalCollected * razorpayFeePct) / 100 : 0) +
    (Number.isFinite(razorpayFeeFixedInr) && razorpayFeeFixedInr > 0 ? params.paidOrdersCount * razorpayFeeFixedInr : 0);
  const gatewayFeeGst =
    Number.isFinite(razorpayFeeGstPct) && razorpayFeeGstPct > 0 ? (gatewayFeeBase * razorpayFeeGstPct) / 100 : 0;
  const razorpayGatewayCostInr = gatewayFeeBase + gatewayFeeGst;
  const internationalPaymentCostInr = getAdditionalCostInr("FAMLO_PRO_INTL_PAYMENT_COST_INR");
  const applicableTaxCostInr = getAdditionalCostInr("FAMLO_PRO_APPLICABLE_TAX_COST_INR");
  return params.proRevenue - params.proGst - channexCostInr - razorpayGatewayCostInr - internationalPaymentCostInr - applicableTaxCostInr;
}

function maskProviderId(value: string | null): string | null {
  if (!value) return null;
  if (value.length <= 8) return value;
  return `${value.slice(0, 4)}••••${value.slice(-4)}`;
}

function resolveHostCtaNeeded(status: string, autopayEnabled: boolean, failedPaymentReason: string | null): string | null {
  if (!autopayEnabled) return "Manual renewal available";
  if (status === "payment_failed") return failedPaymentReason ? `Action needed: ${failedPaymentReason}` : "Action needed: update payment method";
  if (status === "halted") return "Action needed: re-authenticate auto-renewal";
  if (status === "grace") return "Renewal risk: payment retry pending";
  if (status === "cancelled") return "Auto-renewal cancelled at period end";
  if (status === "paused") return "Reactivate with a fresh payment";
  return null;
}

function resolvePurchasedDuration(currentPeriodStart: string | null, currentPeriodEnd: string | null, metadata: JsonRecord | null): string {
  const metadataDuration = asNumber(metadata?.duration_months);
  if (metadataDuration === 1) return "1 month";
  if (metadataDuration === 3) return "3 months";
  if (metadataDuration === 6) return "6 months";

  const startMillis = toMillis(currentPeriodStart);
  const endMillis = toMillis(currentPeriodEnd);
  if (!startMillis || !endMillis || endMillis <= startMillis) return "Custom";
  const diffDays = Math.round((endMillis - startMillis) / (24 * 60 * 60 * 1000));
  if (diffDays >= 25 && diffDays <= 35) return "1 month";
  if (diffDays >= 85 && diffDays <= 95) return "3 months";
  if (diffDays >= 175 && diffDays <= 185) return "6 months";
  return `${diffDays} days`;
}

function isFamilyActive(family: FamilyRecord | undefined): boolean {
  return family?.is_active !== false;
}

function resolvePrimaryPropertyId(
  subscriptions: SubscriptionRecord[],
  familiesForHost: FamilyRecord[],
  fallbackFamilyId: string | null
): string | null {
  const existingPrimary =
    subscriptions
      .map((row) => asString(row.primary_pro_property_id))
      .find((value) => value) ??
    subscriptions
      .map((row) => {
        const metadata = asObject(row.metadata);
        return (
          asString(metadata?.primary_pro_property_id) ??
          asString(metadata?.started_with_property_id) ??
          asString(metadata?.source_family_id)
        );
      })
      .find((value) => value);
  if (existingPrimary) return existingPrimary;

  const earliestSubscriptionFamily = [...subscriptions]
    .sort(compareCreatedAscending)
    .map((row) => asString(row.family_id))
    .find((value) => value);
  if (earliestSubscriptionFamily) return earliestSubscriptionFamily;

  const earliestFamily = [...familiesForHost].sort(compareCreatedAscending)[0];
  return asString(earliestFamily?.id) ?? fallbackFamilyId;
}

export function buildAdminFamloProAccessView(input: {
  subscriptions: Array<Record<string, unknown>>;
  families: Array<Record<string, unknown>>;
  stayUnits: Array<Record<string, unknown>>;
  subscriptionRooms?: Array<Record<string, unknown>>;
  orderProperties?: Array<Record<string, unknown>>;
  hosts: Array<Record<string, unknown>>;
  users: Array<Record<string, unknown>>;
  orders: Array<Record<string, unknown>>;
  invoices: Array<Record<string, unknown>>;
}): {
  rows: AdminProAccessRow[];
  orders: Array<{
    id: string;
    hostUserId: string | null;
    hostName: string;
    status: string;
    propertyCount: number;
    roomCount: number;
    subtotalAmount: number;
    gstAmount: number;
    totalAmount: number;
    createdAt: string | null;
    paymentCapturedAt: string | null;
  }>;
  summary: AdminProAccessSummary;
} {
  const families: FamilyRecord[] = input.families.map((row) => ({
    id: String(row.id ?? ""),
    name: asString(row.name),
    property_name: asString(row.property_name),
    host_id: asString(row.host_id),
    city: asString(row.city),
    state: asString(row.state),
    user_id: asString(row.user_id),
    is_active: typeof row.is_active === "boolean" ? row.is_active : true,
    created_at: asString(row.created_at),
  }));
  const familiesById = new Map(families.map((family) => [family.id, family]));
  const familiesByUserId = new Map<string, FamilyRecord[]>();
  for (const family of families) {
    const hostUserId = asString(family.user_id);
    if (!hostUserId) continue;
    familiesByUserId.set(hostUserId, [...(familiesByUserId.get(hostUserId) ?? []), family]);
  }

  const hostRows = input.hosts
    .map((row) => ({
      user_id: asString(row.user_id),
      display_name: asString(row.display_name),
    }))
    .filter((row): row is { user_id: string; display_name: string | null } => Boolean(row.user_id));
  const hostsByUserId = new Map(hostRows.map((row) => [row.user_id, row]));
  const usersById = new Map(
    input.users
      .map((row) => ({ id: String(row.id ?? ""), name: asString(row.name) }))
      .filter((row) => row.id)
      .map((row) => [row.id, row])
  );

  const stayUnits = input.stayUnits.map((row) => ({
    id: String(row.id ?? ""),
    legacy_family_id: asString(row.legacy_family_id),
    is_active: typeof row.is_active === "boolean" ? row.is_active : true,
    unit_key: asString(row.unit_key),
    host_id: asString(row.host_id),
  }));

  const roomCountByFamilyId = new Map<string, number>();
  for (const room of stayUnits) {
    if (!room.legacy_family_id || room.is_active === false) continue;
    roomCountByFamilyId.set(room.legacy_family_id, (roomCountByFamilyId.get(room.legacy_family_id) ?? 0) + 1);
  }

  const subscriptionRooms = (input.subscriptionRooms ?? []).map((row) => ({
    subscription_id: asString(row.subscription_id),
    family_id: asString(row.family_id),
    stay_unit_id: asString(row.stay_unit_id),
    room_name: asString(row.room_name),
    status: asString(row.status),
  } satisfies SubscriptionRoomRecord));

  const orderProperties = (input.orderProperties ?? []).map((row) => ({
    billing_order_id: asString(row.billing_order_id),
    family_id: asString(row.family_id),
    property_name: asString(row.property_name),
  } satisfies OrderPropertyRecord));

  const subscriptions = input.subscriptions.map((row) => ({
    id: asString(row.id),
    family_id: asString(row.family_id),
    host_user_id: asString(row.host_user_id),
    billing_order_id: asString(row.billing_order_id),
    primary_pro_property_id: asString(row.primary_pro_property_id),
    status: asString(row.status),
    current_period_start: asString(row.current_period_start),
    current_period_end: asString(row.current_period_end),
    grace_until: asString(row.grace_until),
    last_payment_at: asString(row.last_payment_at),
    next_charge_at: asString(row.next_charge_at),
    last_charge_at: asString(row.last_charge_at),
    created_at: asString(row.created_at),
    metadata: asObject(row.metadata),
    billing_mode: asString(row.billing_mode),
    autopay_enabled: row.autopay_enabled === true,
    autopay_status: asString(row.autopay_status),
    mandate_status: asString(row.mandate_status),
    razorpay_subscription_id: asString(row.razorpay_subscription_id),
    payment_failure_reason: asString(row.payment_failure_reason),
  }));

  const grouped = new Map<string, SubscriptionRecord[]>();
  for (const subscription of subscriptions) {
    const family = subscription.family_id ? familiesById.get(subscription.family_id) : null;
    const hostUserId = subscription.host_user_id ?? asString(family?.user_id);
    const key = hostUserId ? `host:${hostUserId}` : subscription.family_id ?? `legacy-family:${subscription.id ?? "unknown"}`;
    grouped.set(key, [...(grouped.get(key) ?? []), { ...subscription, host_user_id: hostUserId }]);
  }

  const now = new Date();
  const rows: AdminProAccessRow[] = Array.from(grouped.entries())
    .map(([groupKey, familySubscriptions]) => {
      const sortedByPriority = [...familySubscriptions].sort(compareSubscriptionPriority);
      const bestSubscription = sortedByPriority[0] ?? null;
      const fallbackFamilyId = asString(bestSubscription?.family_id);
      const hostUserId =
        asString(bestSubscription?.host_user_id) ??
        asString(fallbackFamilyId ? familiesById.get(fallbackFamilyId)?.user_id : null);
      const familiesForHost = hostUserId ? (familiesByUserId.get(hostUserId) ?? []).filter(isFamilyActive) : [];
      const primaryPropertyId = resolvePrimaryPropertyId(familySubscriptions, familiesForHost, fallbackFamilyId);
      const primaryFamily = primaryPropertyId ? familiesById.get(primaryPropertyId) : null;
      const bestSubscriptionId = asString(bestSubscription?.id);
      const scopedRooms = subscriptionRooms.filter(
        (room) =>
          room.subscription_id === bestSubscriptionId &&
          room.family_id === primaryPropertyId &&
          room.status !== "inactive"
      );
      const scopedPropertyIdsFromRooms = Array.from(
        new Set(scopedRooms.map((room) => room.family_id).filter((value): value is string => Boolean(value)))
      );
      const scopedPropertyIdsFromOrder = Array.from(
        new Set(
          orderProperties
            .filter((property) => property.billing_order_id === asString(bestSubscription?.billing_order_id))
            .map((property) => property.family_id)
            .filter((value): value is string => Boolean(value))
        )
      );
      const scopedPropertyIds =
        scopedPropertyIdsFromRooms.length > 0
          ? scopedPropertyIdsFromRooms
          : scopedPropertyIdsFromOrder.length > 0
            ? scopedPropertyIdsFromOrder
            : familiesForHost.length > 0
              ? familiesForHost.map((family) => family.id)
              : primaryPropertyId
                ? [primaryPropertyId]
                : fallbackFamilyId
                  ? [fallbackFamilyId]
                  : [];
      const hostName =
        (hostUserId ? hostsByUserId.get(hostUserId)?.display_name : null) ??
        (hostUserId ? usersById.get(hostUserId)?.name : null) ??
        resolvePropertyLabel(primaryFamily) ??
        "Famlo Host";

      const scopedRoomsCount =
        scopedRooms.length > 0
          ? scopedRooms.length
          : scopedPropertyIds.reduce((sum, familyId) => sum + (roomCountByFamilyId.get(familyId) ?? 0), 0);
      const scopedPropertiesCount = scopedPropertyIds.length;
      const currentMonthlyCharge = resolveMonthlyCharge(scopedPropertiesCount, scopedRoomsCount);
      const lifecycle = deriveProAccessStatus(bestSubscription, { now });
      const explicitStatus = normalizeStatus(bestSubscription?.status);
      const displayStatus =
        explicitStatus === "payment_failed" || explicitStatus === "halted" ? explicitStatus : lifecycle.status;
      const bestMetadata = asObject(bestSubscription?.metadata);
      const nonGranting = bestMetadata?.non_granting === true || bestMetadata?.test_reset === true;
      const autopayEnabled = bestSubscription?.autopay_enabled === true || bestMetadata?.autopay_enabled === true;
      const billingMode: "manual_order" | "autopay_subscription" = autopayEnabled
        ? "autopay_subscription"
        : "manual_order";
      const failedPaymentReason =
        asString(bestSubscription?.payment_failure_reason) ?? asString(bestMetadata?.payment_failure_reason);

      return {
        recordKey: groupKey,
        subscriptionId: asString(bestSubscription?.id),
        hostUserId,
        hostName,
        hostCode: asString(primaryFamily?.host_id),
        accountId: hostUserId,
        primaryProPropertyId: primaryPropertyId,
        primaryProPropertyName: resolvePropertyLabel(primaryFamily),
        primaryProPropertyLocation: resolveLocation(primaryFamily),
        status: displayStatus,
        currentPeriodStart: asString(bestSubscription?.current_period_start),
        currentPeriodEnd: lifecycle.currentPeriodEnd,
        graceUntil: lifecycle.graceUntil,
        lastPaymentAt: asString(bestSubscription?.last_payment_at),
        lastChargeAt: asString(bestSubscription?.last_charge_at),
        nextRenewalDate: lifecycle.currentPeriodEnd,
        nextChargeAt: asString(bestSubscription?.next_charge_at) ?? lifecycle.currentPeriodEnd,
        lastPaymentStatus: asString(bestMetadata?.last_payment_status),
        autopayEnabled,
        billingMode,
        mandateStatus: asString(bestSubscription?.mandate_status) ?? asString(bestMetadata?.mandate_status),
        subscriptionProviderIdMasked: maskProviderId(
          asString(bestSubscription?.razorpay_subscription_id) ?? asString(bestMetadata?.razorpay_subscription_id)
        ),
        failedPaymentReason,
        hostCtaNeeded: resolveHostCtaNeeded(displayStatus, autopayEnabled, failedPaymentReason),
        scopedPropertiesCount,
        scopedRoomsCount,
        scopedPropertiesSummary:
          scopedPropertyIds
            .map((familyId) => resolvePropertyLabel(familiesById.get(familyId)))
            .filter(Boolean)
            .join(", ") || "No scoped properties",
        scopedRoomsSummary:
          scopedRooms.length > 0
            ? scopedRooms
                .map((room) => room.room_name ?? room.stay_unit_id ?? "Room")
                .slice(0, 6)
                .join(", ")
            : `${scopedRoomsCount} active room${scopedRoomsCount === 1 ? "" : "s"}`,
        purchasedDuration: resolvePurchasedDuration(asString(bestSubscription?.current_period_start), lifecycle.currentPeriodEnd, bestMetadata),
        proProperties: scopedPropertiesCount,
        roomsCounted: scopedRoomsCount,
        currentMonthlyCharge,
        nonGranting,
      };
    })
    .sort((left, right) => `${left.hostName} ${left.primaryProPropertyName}`.localeCompare(`${right.hostName} ${right.primaryProPropertyName}`));

  const rowByHostUserId = new Map(rows.filter((row) => row.hostUserId).map((row) => [row.hostUserId as string, row]));
  const orders = input.orders.map((row) => {
    const hostUserId = asString(row.host_user_id);
    return {
      id: String(row.id ?? ""),
      hostUserId,
      hostName: hostUserId ? rowByHostUserId.get(hostUserId)?.hostName ?? "Famlo Host" : "Famlo Host",
      status: String(row.status ?? "draft"),
      propertyCount: asNumber(row.property_count),
      roomCount: asNumber(row.room_count),
      subtotalAmount: asNumber(row.subtotal_amount),
      gstAmount: asNumber(row.gst_amount),
      totalAmount: asNumber(row.total_amount),
      createdAt: asString(row.created_at),
      paymentCapturedAt: asString(row.payment_captured_at),
      billingMode: asString(row.billing_mode),
      gatewaySubscriptionId: asString(row.gateway_subscription_id),
    };
  });

  const paidOrders = orders.filter((row) => row.status === "paid");
  const proRevenue = paidOrders.reduce((sum, row) => sum + row.subtotalAmount, 0);
  const proGst = paidOrders.reduce((sum, row) => sum + row.gstAmount, 0);
  const totalCollected = paidOrders.reduce((sum, row) => sum + row.totalAmount, 0);
  const scopedRows = rows.filter((row) => !row.nonGranting && row.status !== "cancelled" && row.status !== "inactive");
  const selectedRoomsCount = scopedRows.reduce((sum, row) => sum + row.scopedRoomsCount, 0);
  const activeSubscriptions = rows.filter((row) => row.status === "active").length;
  const summary = {
    proRevenue,
    proGst,
    proProfit: resolveProProfit({
      proRevenue,
      proGst,
      scopedRoomsCount: selectedRoomsCount,
      totalCollected,
      paidOrdersCount: paidOrders.length,
    }),
    totalCollected,
    pendingPayments: orders.filter((row) => row.status === "payment_pending" || row.status === "draft").length,
    failedPayments: orders.filter((row) => row.status === "payment_failed" || row.status === "failed").length,
    activeSubscriptions,
    graceSubscriptions: rows.filter((row) => row.status === "grace").length,
    pausedSubscriptions: rows.filter((row) => row.status === "paused").length,
    haltedSubscriptions: rows.filter((row) => row.status === "halted").length,
    cancelledSubscriptions: rows.filter((row) => row.status === "cancelled").length,
    paymentFailedSubscriptions: rows.filter((row) => row.status === "payment_failed").length,
    autopaySubscriptions: rows.filter((row) => row.autopayEnabled).length,
    manualSubscriptions: rows.filter((row) => !row.autopayEnabled).length,
    selectedPropertiesCount: scopedRows.reduce((sum, row) => sum + row.scopedPropertiesCount, 0),
    selectedRoomsCount,
    activeProperties: rows.filter((row) => row.status === "active" || row.status === "grace").reduce((sum, row) => sum + row.scopedPropertiesCount, 0),
    activeRooms: rows.filter((row) => row.status === "active" || row.status === "grace").reduce((sum, row) => sum + row.scopedRoomsCount, 0),
    issuedInvoices: input.invoices.length,
  };

  return {
    rows,
    orders,
    summary,
  };
}
