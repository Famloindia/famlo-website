export const FAMLO_FLEXIBLE_POLICY_CODE = "famlo_flexible_v1";
export const FAMLO_COMMISSION_BPS = 1_600;
export const HOST_SHARE_BPS = 8_400;
export const HOST_RESPONSE_SLA_HOURS = 12;
export const HOST_REMINDER_HOURS = 6;
export const HOST_INTERNAL_WARNING_HOURS = 10;

export type CancellationReason =
  | "guest_change_of_plans"
  | "guest_travel_issue"
  | "guest_other"
  | "host_declined"
  | "host_unresponsive"
  | "host_cancelled"
  | "property_unable_to_honour";

export type FlexiblePolicyResult = {
  policyCode: typeof FAMLO_FLEXIBLE_POLICY_CODE;
  grossPaidAmountMinor: number;
  suggestedRefundAmountMinor: number;
  refundPercent: 0 | 50 | 100;
  rule: string;
  evaluatedAt: string;
  hoursUntilCheckIn: number | null;
};

function assertMinorUnits(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${field} must be a non-negative integer in minor units.`);
  }
}
export function applyBasisPoints(amountMinor: number, basisPoints: number): number {
  assertMinorUnits(amountMinor, "amountMinor");
  if (!Number.isSafeInteger(basisPoints) || basisPoints < 0 || basisPoints > 10_000) {
    throw new Error("basisPoints must be an integer between 0 and 10000.");
  }
  return Math.floor((amountMinor * basisPoints + 5_000) / 10_000);
}

export function calculateRetainedValueAccounting(grossPaidAmountMinor: number, approvedRefundAmountMinor: number): {
  retainedBookingValueMinor: number;
  famloCommissionMinor: number;
  hostGrossShareMinor: number;
} {
  assertMinorUnits(grossPaidAmountMinor, "grossPaidAmountMinor");
  assertMinorUnits(approvedRefundAmountMinor, "approvedRefundAmountMinor");
  if (approvedRefundAmountMinor > grossPaidAmountMinor) throw new Error("Refund exceeds gross paid amount.");
  const retainedBookingValueMinor = grossPaidAmountMinor - approvedRefundAmountMinor;
  const famloCommissionMinor = applyBasisPoints(retainedBookingValueMinor, FAMLO_COMMISSION_BPS);
  return {
    retainedBookingValueMinor,
    famloCommissionMinor,
    hostGrossShareMinor: retainedBookingValueMinor - famloCommissionMinor,
  };
}

export function calculateFlexibleCancellationPolicy(input: {
  grossPaidAmountMinor: number;
  bookingStatus: string | null;
  reason: CancellationReason;
  checkInDate: string | null;
  now?: Date;
}): FlexiblePolicyResult {
  assertMinorUnits(input.grossPaidAmountMinor, "grossPaidAmountMinor");
  const now = input.now ?? new Date();
  const checkIn = input.checkInDate ? new Date(`${input.checkInDate}T00:00:00+05:30`) : null;
  const hoursUntilCheckIn = checkIn && !Number.isNaN(checkIn.getTime())
    ? (checkIn.getTime() - now.getTime()) / 3_600_000
    : null;
  const fullRefundReasons = new Set<CancellationReason>([
    "host_declined",
    "host_unresponsive",
    "host_cancelled",
    "property_unable_to_honour",
  ]);
  const beforeHostApproval = ["pending", "pending_host_approval"].includes(String(input.bookingStatus ?? "").toLowerCase());

  let refundPercent: 0 | 50 | 100;
  let rule: string;
  if (beforeHostApproval) {
    refundPercent = 100;
    rule = "Cancellation requested before host approval.";
  } else if (fullRefundReasons.has(input.reason)) {
    refundPercent = 100;
    rule = "The host or property could not confirm the stay.";
  } else if (hoursUntilCheckIn === null || hoursUntilCheckIn > 48) {
    refundPercent = 100;
    rule = "Cancellation requested more than 48 hours before check-in.";
  } else if (hoursUntilCheckIn >= 24) {
    refundPercent = 50;
    rule = "Cancellation requested between 24 and 48 hours before check-in.";
  } else {
    refundPercent = 0;
    rule = "Cancellation requested less than 24 hours before check-in.";
  }

  return {
    policyCode: FAMLO_FLEXIBLE_POLICY_CODE,
    grossPaidAmountMinor: input.grossPaidAmountMinor,
    suggestedRefundAmountMinor: applyBasisPoints(input.grossPaidAmountMinor, refundPercent * 100),
    refundPercent,
    rule,
    evaluatedAt: now.toISOString(),
    hoursUntilCheckIn,
  };
}
