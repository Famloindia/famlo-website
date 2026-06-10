import assert from "node:assert/strict";
import test from "node:test";

import { calculateFinanceQuote } from "@/lib/finance/calculate";
import { DEFAULT_COMMISSION_PCT } from "@/lib/finance/constants";

test("default OTA commission config is flat 16 percent", () => {
  assert.equal(DEFAULT_COMMISSION_PCT, 16);
});

test("finance calculation falls back to flat 16 percent when no commission is supplied", () => {
  const result = calculateFinanceQuote({
    bookingAmount: 10000,
    commissionPct: Number.NaN,
    productType: "host_stay",
  });

  assert.equal(result.platformFee, 1600);
  assert.equal(result.hostPayout, 8400);
});
