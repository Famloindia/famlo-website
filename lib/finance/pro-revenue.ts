export type RevenueWindowFilter = "Today" | "This week" | "This month" | "All time";

export type RevenueSourceCategory = "famlo" | "direct" | "ota";

export type RevenuePaymentCollectMode =
  | "FAMLO_COLLECT"
  | "OTA_COLLECT"
  | "PROPERTY_COLLECT"
  | "UNKNOWN";

export type RevenueBookingState = {
  revenueDate: string | null;
  checkoutDate: string;
  status: string | null;
  reservationStatus: string | null;
  paymentStatus: string | null;
  sourceCategory: RevenueSourceCategory;
  paymentCollectMode: RevenuePaymentCollectMode;
  famloPayoutEligible: boolean;
  settlementEligible: boolean;
  payoutStatus: string | null;
  payoutExecutionStatus: string | null;
  complianceBlocked: boolean;
};

function normalizeToken(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function isFinanceBackedPaidStatus(value: unknown): boolean {
  const normalized = normalizeToken(value);
  return (
    normalized === "processed" ||
    normalized === "paid" ||
    normalized === "completed"
  );
}

export function isCompletedRevenueBooking(booking: RevenueBookingState): boolean {
  if (!booking.revenueDate) return false;

  const bookingStatus = normalizeToken(booking.status);
  const reservationStatus = normalizeToken(booking.reservationStatus);
  const paymentStatus = normalizeToken(booking.paymentStatus);

  if (
    bookingStatus === "cancelled" ||
    bookingStatus === "cancelled_by_user" ||
    bookingStatus === "cancelled_by_partner" ||
    reservationStatus === "cancelled"
  ) {
    return false;
  }

  if (
    paymentStatus === "failed" ||
    paymentStatus === "failed_payment" ||
    paymentStatus === "pending"
  ) {
    return false;
  }

  return true;
}

export function matchesRevenueWindowDate(
  date: string | null | undefined,
  window: RevenueWindowFilter,
  anchors: {
    todayIsoDate: string;
    weekStartIsoDate: string;
    weekEndIsoDate: string;
    currentMonthPrefix: string;
  }
): boolean {
  if (!date) return false;
  if (window === "Today") return date === anchors.todayIsoDate;
  if (window === "This week") {
    return date >= anchors.weekStartIsoDate && date <= anchors.weekEndIsoDate;
  }
  if (window === "This month") {
    return date.startsWith(anchors.currentMonthPrefix);
  }
  return true;
}

export function shouldIncludeFamloPayoutInTotals(
  booking: Pick<RevenueBookingState, "famloPayoutEligible" | "complianceBlocked">
): boolean {
  return booking.famloPayoutEligible && !booking.complianceBlocked;
}

export function deriveRevenuePaymentStatusLabel(booking: RevenueBookingState): string {
  const payoutExecutionStatus = normalizeToken(booking.payoutExecutionStatus);
  const payoutStatus = normalizeToken(booking.payoutStatus);

  if (booking.sourceCategory === "ota" && booking.paymentCollectMode !== "FAMLO_COLLECT") {
    return "Paid by OTA";
  }

  if (booking.sourceCategory === "direct" && booking.paymentCollectMode !== "FAMLO_COLLECT") {
    return "Paid outside Famlo";
  }

  if (booking.paymentCollectMode === "FAMLO_COLLECT" && !booking.famloPayoutEligible) {
    return "Settlement pending";
  }

  if (booking.complianceBlocked) {
    return "Blocked — action required";
  }

  if (isFinanceBackedPaidStatus(payoutExecutionStatus) || isFinanceBackedPaidStatus(payoutStatus)) {
    return "Paid by Famlo";
  }

  if (
    payoutExecutionStatus === "processing" ||
    payoutStatus === "payout_processing" ||
    payoutStatus === "processing"
  ) {
    return "Processing";
  }

  if (booking.famloPayoutEligible) {
    return "Pending Famlo payout";
  }

  return booking.settlementEligible ? "Pending" : "Settlement pending";
}

export function toMaskedHostRevenueDestination(input: {
  accountNumberMasked?: string | null;
  vpa?: string | null;
}): string | null {
  if (input.vpa && input.vpa.trim().length > 0) {
    return `UPI ${input.vpa.trim()}`;
  }

  if (input.accountNumberMasked && input.accountNumberMasked.trim().length > 0) {
    return input.accountNumberMasked.trim().startsWith("Bank")
      ? input.accountNumberMasked.trim()
      : `Bank ${input.accountNumberMasked.trim()}`;
  }

  return null;
}
