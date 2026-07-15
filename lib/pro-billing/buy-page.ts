import { deriveProAccessStatus, type ProSubscriptionLifecycleStatus, type ProSubscriptionRecord } from "@/lib/pro-billing/access-status";

export const FAMLO_PRO_BUY_BANNER_TITLE = "Grow with Famlo Pro";
export const FAMLO_PRO_BUY_BANNER_SUBTITLE =
  "PMS + Channel Manager built for serious homes. Manage rooms, rates, calendars, OTA sync, reports, and operations from one Pro workspace.";
export const FAMLO_PRO_BUY_BANNER_HEADING_COLOR = "#ffffff";
export const FAMLO_PRO_BUY_PAGE_ERROR_MESSAGE = "Unable to load pricing. Try refreshing once, or contact Famlo.";
export const FAMLO_PRO_NO_ROOMS_MESSAGE =
  "No active rooms found for this property. Add rooms first to calculate your Famlo Pro price.";

export const FAMLO_PRO_VALUE_CARDS = [
  {
    title: "Sell on more OTAs",
    copy: "Connect Booking.com, Airbnb, MMT, Agoda, Expedia, and more through one workflow.",
  },
  {
    title: "Avoid double bookings",
    copy: "Sync room availability and calendar updates from one place.",
  },
  {
    title: "Control rates faster",
    copy: "Update room rates, inventory, and plans without jumping between platforms.",
  },
  {
    title: "Understand revenue",
    copy: "Track booking sources, revenue, and performance in Famlo Pro.",
  },
] as const;

export const FAMLO_PRO_FEATURE_CARDS = [
  { title: "OTA Channel Manager", description: "Included with Famlo Pro for OTA connectivity and sync control." },
  { title: "Rooms & Rates", description: "Included with Famlo Pro for inventory, pricing, and plan management." },
  { title: "Smart Calendar", description: "Included with Famlo Pro for live room availability and planning." },
  { title: "Sync Logs", description: "Included with Famlo Pro for channel sync visibility and issue review." },
  { title: "Booking Source Tracking", description: "Included with Famlo Pro for source mix and demand tracking." },
  { title: "Revenue Reports", description: "Included with Famlo Pro for booking and revenue performance analysis." },
  { title: "Team & Groups", description: "Included with Famlo Pro for shared operations and coordination." },
  { title: "Multiple Properties", description: "Manage more than one property from your Famlo Pro workspace." },
] as const;

export type FamloProBuyPageSelectedProperty = {
  familyId: string;
  propertyName: string;
  billableRoomCount: number;
  billableRoomIds: string[];
} | null;

export type FamloProBuyPageDraft = {
  durationMonths: 1 | 3 | 6;
  pricing: {
    propertyCount: number;
    roomCount: number;
    rawSubtotalAmount: number;
    subtotalAmount: number;
    gstAmount: number;
    totalAmount: number;
    propertyUnitPrice: number;
    roomUnitPrice: number;
    minimumSubtotal: number;
    gstPct: number;
    pricingVersion: string;
  };
  quote: {
    durationMonths: 1 | 3 | 6;
    monthlySubtotalAmount: number;
    monthlyGstAmount: number;
    monthlyTotalAmount: number;
    payableSubtotalAmount: number;
    payableGstAmount: number;
    payableTotalAmount: number;
    gstPct: number;
  };
} | null;

export type FamloProVerifyRequest = {
  billingOrderId: string;
  familyId: string;
  durationMonths: 1 | 3 | 6;
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
};

export type FamloProBillingAccessState = {
  allowed: boolean;
  status: ProSubscriptionLifecycleStatus;
  currentPeriodEnd: string | null;
  graceUntil: string | null;
  reason: string;
};

export type FamloProBuyUiState = {
  isProActive: boolean;
  isInGrace: boolean;
  isProExpired: boolean;
  canOpenProDashboard: boolean;
  canBuyOrRenew: boolean;
  showPricingCalculator: boolean;
  ctaLabel: "Buy Famlo Pro" | "Renew Famlo Pro";
};

export function buildFamloProDraftRequest(
  selectedProperty: FamloProBuyPageSelectedProperty,
  durationMonths: 1 | 3 | 6
): {
  family_id: string;
  selections: Array<{ familyId: string; roomIds: string[] }>;
  duration_months: 1 | 3 | 6;
} | null {
  if (!selectedProperty || selectedProperty.billableRoomIds.length === 0) {
    return null;
  }

  return {
    family_id: selectedProperty.familyId,
    selections: [{ familyId: selectedProperty.familyId, roomIds: selectedProperty.billableRoomIds }],
    duration_months: durationMonths,
  };
}

export function buildFamloProVerifyRequest(input: {
  billingOrderId: string;
  familyId: string;
  durationMonths: 1 | 3 | 6;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}): FamloProVerifyRequest {
  return {
    billingOrderId: input.billingOrderId,
    familyId: input.familyId,
    durationMonths: input.durationMonths,
    razorpay_order_id: input.razorpayOrderId,
    razorpay_payment_id: input.razorpayPaymentId,
    razorpay_signature: input.razorpaySignature,
  };
}

export function buildFamloProDashboardHref(familyId: string): string {
  return `/partnerslogin/home/pro/dashboard?family=${encodeURIComponent(familyId)}&section=properties-home`;
}

export function canOpenFamloProDashboard(params: {
  dashboardHref: string | null | undefined;
  access: FamloProBillingAccessState | null | undefined;
}): boolean {
  return Boolean(params.dashboardHref) && Boolean(params.access?.allowed);
}

export function deriveFamloProAccessState(
  subscription:
    | Pick<ProSubscriptionRecord, "status" | "current_period_end" | "grace_until">
    | null
    | undefined
): FamloProBillingAccessState {
  const derived = deriveProAccessStatus(subscription ?? null);
  return {
    allowed: derived.allowed,
    status: derived.status,
    currentPeriodEnd: derived.currentPeriodEnd,
    graceUntil: derived.graceUntil,
    reason: derived.reason,
  };
}

export function deriveFamloProBuyUiState(params: {
  access: FamloProBillingAccessState | null | undefined;
  dashboardHref: string | null | undefined;
}): FamloProBuyUiState {
  const normalizedStatus = params.access?.status ?? "inactive";
  const isProActive = normalizedStatus === "active";
  const isInGrace = normalizedStatus === "grace";
  const isProExpired = !params.access?.allowed && normalizedStatus !== "inactive";
  const canOpenProDashboard = canOpenFamloProDashboard({
    dashboardHref: params.dashboardHref,
    access: params.access,
  });

  return {
    isProActive,
    isInGrace,
    isProExpired,
    canOpenProDashboard,
    canBuyOrRenew: !canOpenProDashboard,
    showPricingCalculator: !canOpenProDashboard,
    ctaLabel: isProExpired ? "Renew Famlo Pro" : "Buy Famlo Pro",
  };
}

export function buildFamloProPostPaymentRedirectHref(params: {
  familyId: string;
  dashboardHref?: string | null;
  access: FamloProBillingAccessState | null | undefined;
}): string | null {
  if (!params.access?.allowed) return null;
  return params.dashboardHref ?? buildFamloProDashboardHref(params.familyId);
}

export function isFamloProBuyButtonDisabled(params: {
  loading: boolean;
  draftLoading: boolean;
  checkoutLoading: boolean;
  billableRooms: number;
  draft: FamloProBuyPageDraft;
  pricingError: string | null;
}): boolean {
  return (
    params.loading ||
    params.draftLoading ||
    params.checkoutLoading ||
    params.billableRooms === 0 ||
    !params.draft ||
    Boolean(params.pricingError)
  );
}
