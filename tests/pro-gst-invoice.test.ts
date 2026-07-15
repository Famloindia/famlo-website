import assert from "node:assert/strict";
import test from "node:test";

import {
  amountToWordsInr,
  buildHostProInvoiceLineItems,
  buildHostProInvoiceNumber,
  buildHostProInvoicePayload,
  buildHostProReceiptNumber,
  deriveFinancialYearLabel,
  derivePlaceOfSupply,
  isSameStateSupply,
  resolveStateFromGstin,
} from "@/lib/pro-billing/invoice";

test("Famlo Pro GST invoice numbering is financial-year aware", () => {
  const financialYearLabel = deriveFinancialYearLabel("2026-05-26T10:30:00.000Z");
  assert.equal(financialYearLabel, "2026-27");
  assert.equal(buildHostProInvoiceNumber(financialYearLabel, 123), "FAMLO/PRO/2026-27/000123");
  assert.equal(buildHostProReceiptNumber("FAMLO/PRO/2026-27/000123"), "FAMLO/PRO/2026-27/000123/RCPT");
});

test("Famlo Pro GST invoice line items preserve ₹499 taxable base for 1 property and 1 room", () => {
  const lineItems = buildHostProInvoiceLineItems({
    propertyCount: 1,
    roomCount: 1,
    durationMonths: 1,
    taxableValue: 499,
  });

  assert.deepEqual(lineItems, [
    { description: "Famlo Pro Property Charge", quantity: 1, rate: 199, taxableValue: 199 },
    { description: "Famlo Pro Room Charge", quantity: 1, rate: 100, taxableValue: 100 },
    { description: "Minimum Subscription Adjustment", quantity: 1, rate: 200, taxableValue: 200 },
  ]);
});

test("same-state Famlo Pro GST invoice splits GST into CGST and SGST", () => {
  const supplierState = resolveStateFromGstin("08ABCDE1234F1Z5") ?? "Rajasthan";
  const placeOfSupply = derivePlaceOfSupply({
    propertyState: "Rajasthan",
    hostState: null,
    supplierState,
  });

  assert.equal(placeOfSupply.value, "Rajasthan");
  assert.equal(placeOfSupply.source, "property_state");
  assert.equal(isSameStateSupply(placeOfSupply.value, supplierState), true);
});

test("interstate Famlo Pro GST invoice uses IGST", () => {
  const supplierState = resolveStateFromGstin("08ABCDE1234F1Z5") ?? "Rajasthan";
  const placeOfSupply = derivePlaceOfSupply({
    propertyState: "Goa",
    hostState: null,
    supplierState,
  });

  assert.equal(placeOfSupply.value, "Goa");
  assert.equal(isSameStateSupply(placeOfSupply.value, supplierState), false);
});

test("Famlo Pro GST payload stores ₹589 total with amount in words", () => {
  const payload = buildHostProInvoicePayload({
    invoiceNumber: "FAMLO/PRO/2026-27/000123",
    receiptNumber: "FAMLO/PRO/2026-27/000123/RCPT",
    financialYearLabel: "2026-27",
    sequenceNumber: 123,
    invoiceDate: "2026-05-26",
    paymentDate: "2026-05-26",
    hostUserId: "host-1",
    hostName: "Sam",
    propertyName: "SAM's Home",
    hostEmail: "host@example.com",
    hostPhone: "+91 9999999999",
    hostGstin: null,
    placeOfSupply: "Rajasthan",
    placeOfSupplySource: "property_state",
    supplier: {
      legalName: "Famlo Private Limited",
      gstin: "08ABCDE1234F1Z5",
      registeredAddress: "Jaipur, Rajasthan",
      state: "Rajasthan",
    },
    subscription: {
      service: "Famlo Pro Subscription",
      planLabel: "1 Month",
      durationMonths: 1,
      periodStart: "2026-05-26",
      periodEnd: "2026-06-25",
      propertyCount: 1,
      roomCount: 1,
    },
    charges: {
      lineItems: buildHostProInvoiceLineItems({
        propertyCount: 1,
        roomCount: 1,
        durationMonths: 1,
        taxableValue: 499,
      }),
      taxableValue: 499,
      cgstAmount: 44.91,
      sgstAmount: 44.91,
      igstAmount: 0,
      totalGst: 89.82,
      roundOff: 0.18,
      totalPaid: 589,
      taxMode: "intra_state",
    },
    payment: {
      status: "PAID",
      method: "Razorpay",
      reference: "pay_123",
      currency: "INR",
    },
  });

  assert.equal(payload.charges.totalPaid, 589);
  assert.equal(payload.charges.totalGst, 89.82);
  assert.equal(payload.amountInWords, amountToWordsInr(589));
  assert.equal(payload.amountInWords, "Rupees Five Hundred Eighty Nine Only");
});
