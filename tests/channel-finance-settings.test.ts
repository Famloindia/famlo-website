import assert from "node:assert/strict";
import test from "node:test";

import {
  createDefaultChannelFinanceSettings,
  estimateChannelCommission,
  maskAccountNumber,
  validateChannelFinanceSettings,
} from "@/lib/channel-finance-settings";

test("Channel Finance validation blocks invalid GSTIN and oversized percentage commission", () => {
  const settings = createDefaultChannelFinanceSettings("family-1");
  settings.gstSettings.gstEnabled = true;
  settings.gstSettings.gstin = "BAD";
  settings.gstSettings.legalBusinessName = "";
  settings.commissionRules[0] = {
    ...settings.commissionRules[0]!,
    commissionType: "percentage",
    commissionValue: 101,
  };

  const errors = validateChannelFinanceSettings(settings);

  assert.ok(errors.some((error) => error.includes("valid GSTIN")));
  assert.ok(errors.some((error) => error.includes("cannot exceed 100")));
});

test("Channel Finance estimates commission only from saved active rules", () => {
  const settings = createDefaultChannelFinanceSettings("family-1");
  settings.commissionRules[0] = {
    ...settings.commissionRules[0]!,
    source: "saved",
    channelKey: "booking_com",
    channelName: "Booking.com",
    commissionType: "percentage",
    commissionValue: 12,
    taxOnCommission: true,
    gstPercent: 18,
    isActive: true,
  };

  const estimate = estimateChannelCommission({
    grossAmount: 10000,
    rules: settings.commissionRules,
    sourceChannel: "Booking.com",
  });

  assert.equal(estimate.source, "estimated");
  assert.equal(estimate.amount, 1200);
  assert.equal(estimate.gstAmount, 216);
  assert.equal(estimate.totalCommissionAmount, 1416);
});

test("actual OTA commission overrides Channel Finance estimate", () => {
  const settings = createDefaultChannelFinanceSettings("family-1");
  settings.commissionRules[0] = {
    ...settings.commissionRules[0]!,
    source: "saved",
    commissionValue: 20,
  };

  const estimate = estimateChannelCommission({
    grossAmount: 10000,
    actualCommissionAmount: 700,
    rules: settings.commissionRules,
    sourceChannel: "Booking.com",
  });

  assert.equal(estimate.source, "actual");
  assert.equal(estimate.amount, 700);
  assert.equal(estimate.totalCommissionAmount, 700);
});

test("host bank account helper masks raw account numbers", () => {
  assert.equal(maskAccountNumber("1234567890"), "******7890");
  assert.equal(maskAccountNumber("******1234"), "******1234");
});
