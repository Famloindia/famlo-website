import test from "node:test";
import assert from "node:assert/strict";

import {
  buildHostPayoutHistoryUrl,
  buildHostRevenueUrl,
  deriveRevenuePaymentStatusLabel,
  isCompletedRevenueBooking,
  isFinanceBackedPaidStatus,
  matchesRevenueWindowDate,
  shouldIncludeFamloPayoutInTotals,
  toMaskedHostRevenueDestination,
  type RevenueBookingState,
} from "@/lib/finance/pro-revenue";

function baseBooking(overrides: Partial<RevenueBookingState> = {}): RevenueBookingState {
  return {
    revenueDate: "2026-05-22",
    checkoutDate: "2026-05-22",
    status: "completed",
    reservationStatus: "checked_out",
    paymentStatus: "paid",
  sourceCategory: "famlo",
  paymentCollectMode: "FAMLO_COLLECT",
  famloPayoutEligible: true,
  settlementEligible: true,
  payoutStatus: "payout_pending",
  payoutExecutionStatus: null,
  complianceBlocked: false,
  ...overrides,
  };
}

test("Famlo payout totals exclude OTA and direct bookings paid outside Famlo", () => {
  assert.equal(
    shouldIncludeFamloPayoutInTotals(
      baseBooking({
        sourceCategory: "ota",
        paymentCollectMode: "OTA_COLLECT",
        famloPayoutEligible: false,
      })
    ),
    false
  );
  assert.equal(
    shouldIncludeFamloPayoutInTotals(
      baseBooking({
        sourceCategory: "direct",
        paymentCollectMode: "PROPERTY_COLLECT",
        famloPayoutEligible: false,
      })
    ),
    false
  );
  assert.equal(shouldIncludeFamloPayoutInTotals(baseBooking()), true);
});

test("Revenue table eligibility only includes checked-out or revenue-recognized bookings", () => {
  assert.equal(isCompletedRevenueBooking(baseBooking()), true);
  assert.equal(
    isCompletedRevenueBooking(baseBooking({ revenueDate: null, status: "checked_in", reservationStatus: "checked_in" })),
    false
  );
  assert.equal(
    isCompletedRevenueBooking(baseBooking({ status: "cancelled", reservationStatus: "cancelled" })),
    false
  );
  assert.equal(
    isCompletedRevenueBooking(baseBooking({ paymentStatus: "failed" })),
    false
  );
});

test("Paid by Famlo comes from payout execution or paid settlement status, not booking status alone", () => {
  assert.equal(
    deriveRevenuePaymentStatusLabel(
      baseBooking({ payoutExecutionStatus: "processed", payoutStatus: "payout_processing" })
    ),
    "Paid by Famlo"
  );
  assert.equal(
    deriveRevenuePaymentStatusLabel(
      baseBooking({ payoutExecutionStatus: null, payoutStatus: "paid" })
    ),
    "Paid by Famlo"
  );
  assert.equal(
    deriveRevenuePaymentStatusLabel(
      baseBooking({ status: "completed", reservationStatus: "completed", payoutStatus: "payout_pending" })
    ),
    "Pending Famlo payout"
  );
});

test("Pending Famlo payout respects compliance blocks", () => {
  assert.equal(
    shouldIncludeFamloPayoutInTotals(baseBooking({ complianceBlocked: true })),
    false
  );
  assert.equal(
    deriveRevenuePaymentStatusLabel(baseBooking({ complianceBlocked: true })),
    "Blocked — action required"
  );
});

test("Completed Famlo booking without settlement line does not increase Famlo payout totals", () => {
  assert.equal(
    shouldIncludeFamloPayoutInTotals(
      baseBooking({
        famloPayoutEligible: false,
        settlementEligible: false,
      })
    ),
    false
  );
});

test("Completed Famlo booking without settlement line appears as pending settlement", () => {
  assert.equal(
    deriveRevenuePaymentStatusLabel(
      baseBooking({
        famloPayoutEligible: false,
        settlementEligible: false,
      })
    ),
    "Settlement pending"
  );
});

test("Held or paused Famlo payout uses host-safe labels", () => {
  assert.equal(
    shouldIncludeFamloPayoutInTotals(
      baseBooking({
        payoutHoldStatus: "on_hold",
      })
    ),
    false
  );
  assert.equal(
    deriveRevenuePaymentStatusLabel(
      baseBooking({
        payoutHoldStatus: "on_hold",
        payoutHoldIsHostActionable: false,
      })
    ),
    "Payout on hold"
  );
  assert.equal(
    deriveRevenuePaymentStatusLabel(
      baseBooking({
        payoutHoldStatus: "paused",
        payoutHoldIsHostActionable: true,
      })
    ),
    "Action required"
  );
});

test("Pending Famlo payout total only includes settlement-backed unpaid eligible amounts", () => {
  assert.equal(
    shouldIncludeFamloPayoutInTotals(
      baseBooking({
        famloPayoutEligible: true,
        settlementEligible: true,
        payoutStatus: "payout_pending",
      })
    ),
    true
  );
  assert.equal(
    shouldIncludeFamloPayoutInTotals(
      baseBooking({
        famloPayoutEligible: false,
        settlementEligible: true,
        payoutStatus: "payout_pending",
      })
    ),
    false
  );
});

test("Booking or folio fallback is not used for host-facing payout totals", () => {
  assert.equal(
    deriveRevenuePaymentStatusLabel(
      baseBooking({
        famloPayoutEligible: false,
        settlementEligible: true,
        payoutStatus: "paid",
        payoutExecutionStatus: null,
      })
    ),
    "Settlement pending"
  );
});

test("Today, this week, this month, and all time use checkout or revenue recognition date", () => {
  const anchors = {
    todayIsoDate: "2026-05-22",
    weekStartIsoDate: "2026-05-17",
    weekEndIsoDate: "2026-05-23",
    currentMonthPrefix: "2026-05",
  };

  assert.equal(matchesRevenueWindowDate("2026-05-22", "Today", anchors), true);
  assert.equal(matchesRevenueWindowDate("2026-05-21", "Today", anchors), false);
  assert.equal(matchesRevenueWindowDate("2026-05-18", "This week", anchors), true);
  assert.equal(matchesRevenueWindowDate("2026-04-30", "This week", anchors), false);
  assert.equal(matchesRevenueWindowDate("2026-05-01", "This month", anchors), true);
  assert.equal(matchesRevenueWindowDate("2026-04-30", "This month", anchors), false);
  assert.equal(matchesRevenueWindowDate("2026-01-01", "All time", anchors), true);
});

test("Host-facing payout destination stays masked and does not expose raw internal fields", () => {
  assert.equal(
    toMaskedHostRevenueDestination({ accountNumberMasked: "•••• 4821", vpa: null }),
    "Bank •••• 4821"
  );
  assert.equal(
    toMaskedHostRevenueDestination({ accountNumberMasked: null, vpa: "host@upi" }),
    "UPI host@upi"
  );
  assert.equal(isFinanceBackedPaidStatus("processed"), true);
  assert.equal(isFinanceBackedPaidStatus("created"), false);
});

test("Famlo payout card and payout history back button use the dedicated host-safe routes", () => {
  assert.equal(
    buildHostPayoutHistoryUrl("fam-123"),
    "/partnerslogin/home/pro/payouts?family=fam-123"
  );
  assert.equal(
    buildHostRevenueUrl("fam-123"),
    "/partnerslogin/home/pro/dashboard?family=fam-123&section=revenue"
  );
});
