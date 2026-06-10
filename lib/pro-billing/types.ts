export type ProBillingPropertySelectionInput = {
  familyId: string;
  roomIds: string[];
};

export type ProBillingValidatedProperty = {
  familyId: string;
  propertyName: string;
  hostCode: string | null;
  city: string | null;
  state: string | null;
  roomIds: string[];
  rooms: Array<{
    id: string;
    name: string;
  }>;
};

export type ProBillingPricingBreakdown = {
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

export type ProBillingChargeQuote = {
  durationMonths: 1 | 3 | 6;
  monthlySubtotalAmount: number;
  monthlyGstAmount: number;
  monthlyTotalAmount: number;
  payableSubtotalAmount: number;
  payableGstAmount: number;
  payableTotalAmount: number;
  gstPct: number;
};

export type ProBillingMode = "manual_order" | "autopay_subscription";

export type ProAddonType = "room" | "property";

export type ProAddonQuote = {
  addonType: ProAddonType;
  durationMonths: 1 | 3 | 6;
  totalPlanDays: number;
  remainingDays: number;
  baseMonthlyAmount: number;
  payableSubtotalAmount: number;
  payableGstAmount: number;
  payableTotalAmount: number;
  gstPct: number;
};

export type ProAutopaySnapshot = {
  enabled: boolean;
  requireSubscription: boolean;
  mode: ProBillingMode | "disabled";
  subscriptionId: string | null;
  subscriptionStatus: string | null;
  mandateStatus: string | null;
  nextChargeAt: string | null;
  currentPeriodEnd: string | null;
  graceUntil: string | null;
  billingOrderId: string | null;
  failureReason: string | null;
};

export type ProBillingWorkspaceProperty = {
  familyId: string;
  propertyName: string;
  hostCode: string | null;
  city: string | null;
  state: string | null;
  status: string;
  currentPeriodEnd: string | null;
  graceUntil: string | null;
  activeRoomIds: string[];
  rooms: Array<{
    id: string;
    name: string;
    isActive: boolean;
    isSelectedInActiveScope: boolean;
  }>;
};
