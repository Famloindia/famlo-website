import assert from "node:assert/strict";
import test from "node:test";

import { calculateSection95FinanceContract } from "@/lib/finance/section-9-5-engine";

test("₹1,000 room/night uses 5% accommodation GST", () => {
  const result = calculateSection95FinanceContract({
    nights: [{ actualValue: 1000 }],
  });

  assert.equal(result.accommodationGstAmount, 50);
  assert.equal(result.guestPayableAmount, 1050);
  assert.equal(result.accommodationGstBreakdown[0]?.gstRateBps, 500);
});

test("₹8,000 room/night uses 18% accommodation GST", () => {
  const result = calculateSection95FinanceContract({
    nights: [{ actualValue: 8000 }],
  });

  assert.equal(result.accommodationGstAmount, 1440);
  assert.equal(result.guestPayableAmount, 9440);
  assert.equal(result.accommodationGstBreakdown[0]?.gstRateBps, 1800);
});

test("₹8,000 listed but ₹7,200 actual uses 5% slab on actual transaction value", () => {
  const result = calculateSection95FinanceContract({
    nights: [{ listedValue: 8000, actualValue: 7200 }],
  });

  assert.equal(result.accommodationGstAmount, 360);
  assert.equal(result.accommodationGstBreakdown[0]?.listedValue, 8000);
  assert.equal(result.accommodationGstBreakdown[0]?.actualValue, 7200);
  assert.equal(result.accommodationGstBreakdown[0]?.gstRateBps, 500);
});

test("3 nights at ₹6,000 each use 5% GST per night", () => {
  const result = calculateSection95FinanceContract({
    nights: [{ actualValue: 6000 }, { actualValue: 6000 }, { actualValue: 6000 }],
  });

  assert.equal(result.roomBaseAmount, 18000);
  assert.equal(result.accommodationGstAmount, 900);
  assert.deepEqual(
    result.accommodationGstBreakdown.map((night) => night.gstAmount),
    [300, 300, 300]
  );
});

test("mixed booking uses separate GST slabs per room-night", () => {
  const result = calculateSection95FinanceContract({
    nights: [{ actualValue: 5000 }, { actualValue: 8000 }],
  });

  assert.equal(result.roomBaseAmount, 13000);
  assert.equal(result.accommodationGstAmount, 1690);
  assert.deepEqual(
    result.accommodationGstBreakdown.map((night) => night.gstRateBps),
    [500, 1800]
  );
});

test("Famlo platform fee is 16% of room base and host payout is 84%", () => {
  const result = calculateSection95FinanceContract({
    nights: [{ actualValue: 10000 }],
  });

  assert.equal(result.famloPlatformFeeInclGst, 1600);
  assert.equal(result.hostGrossPayout, 8400);
});

test("platform fee GST is included inside the 16% platform fee", () => {
  const result = calculateSection95FinanceContract({
    nights: [{ actualValue: 10000 }],
  });

  assert.equal(result.famloPlatformFeeTaxable, 1356);
  assert.equal(result.famloPlatformFeeGst, 244);
  assert.equal(result.famloPlatformFeeTaxable + result.famloPlatformFeeGst, result.famloPlatformFeeInclGst);
});

test("gateway fee is calculated on guest payable", () => {
  const result = calculateSection95FinanceContract({
    nights: [{ actualValue: 10000 }],
    gatewayFee: {
      rateBps: 200,
    },
  });

  assert.equal(result.guestPayableAmount, 11800);
  assert.equal(result.gatewayFeeBase, 236);
  assert.equal(result.gatewayFeeGst, 42);
  assert.equal(result.gatewayFeeTotal, 278);
});

test("TCS is always zero under Section 9(5)", () => {
  const result = calculateSection95FinanceContract({
    taxMode: "ECO_SECTION_9_5",
    nights: [{ actualValue: 10000 }],
  });

  assert.equal(result.tcsAmount, 0);
});

test("TDS is tracked but not deducted when TDS_ENABLED is false", () => {
  const result = calculateSection95FinanceContract({
    nights: [{ actualValue: 10000 }],
    tds: {
      enabled: false,
      hostPanVerified: true,
      fyHostPayoutBeforeThisBooking: 499000,
    },
  });

  assert.equal(result.tdsApplicable, true);
  assert.equal(result.tdsRate, 0.001);
  assert.equal(result.tdsTrackedAmount, 8);
  assert.equal(result.tdsAmount, 0);
  assert.equal(result.hostNetPayout, result.hostGrossPayout);
});

test("missing PAN returns payout block reason instead of silent 5% fallback", () => {
  const result = calculateSection95FinanceContract({
    nights: [{ actualValue: 10000 }],
    tds: {
      enabled: false,
      hostPanVerified: false,
      fyHostPayoutBeforeThisBooking: 499000,
      blockPayoutIfPanMissing: true,
    },
  });

  assert.equal(result.tdsApplicable, true);
  assert.equal(result.tdsRate, 0.05);
  assert.equal(result.tdsTrackedAmount, 420);
  assert.equal(result.tdsAmount, 0);
  assert.equal(result.payoutBlocked, true);
  assert.match(result.payoutBlockReason ?? "", /PAN verification/i);
});
