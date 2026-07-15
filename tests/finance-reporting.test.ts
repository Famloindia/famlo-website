import assert from "node:assert/strict";
import test from "node:test";

import { buildCreditNoteReportRows } from "@/lib/finance/reports/credit-note-report";
import { buildGatewayItcReportRows } from "@/lib/finance/reports/gateway-itc-report";
import { buildGstAccommodationReportRows } from "@/lib/finance/reports/gst-accommodation-report";
import { buildRevenueReportRows } from "@/lib/finance/reports/revenue-report";
import { buildTdsReportRows } from "@/lib/finance/reports/tds-report";

const MAY_RANGE = {
  startDate: "2026-05-01",
  endDate: "2026-05-31",
} as const;

test("GST accommodation report generated for issued invoices only", () => {
  const rows = buildGstAccommodationReportRows(
    [
      {
        invoice_number: "GTI-1",
        booking_id: "booking-1",
        reservation_id: "reservation-1",
        status: "issued",
        issued_at: "2026-05-10T10:00:00.000Z",
        payload: {
          invoiceDate: "2026-05-10",
          roomBaseAmount: 1000,
          gstAmount: 50,
          totalInvoiceAmount: 1050,
          placeOfSupply: "Goa",
          famloGstin: "30ABCDE1234F1Z5",
          guestGstin: "27ABCDE1234F1Z5",
          lineItems: [{ gstRateBps: 500 }],
        },
      },
      {
        invoice_number: "GTI-2",
        booking_id: "booking-2",
        reservation_id: "reservation-2",
        status: "draft",
        issued_at: "2026-05-11T10:00:00.000Z",
        payload: {
          invoiceDate: "2026-05-11",
          roomBaseAmount: 2000,
          gstAmount: 100,
          totalInvoiceAmount: 2100,
          placeOfSupply: "Goa",
          famloGstin: "30ABCDE1234F1Z5",
        },
      },
    ],
    MAY_RANGE
  );

  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.invoice_number, "GTI-1");
  assert.equal(rows[0]?.cgst, 25);
  assert.equal(rows[0]?.sgst, 25);
  assert.equal(rows[0]?.igst, 0);
});

test("credit-note report includes issued credit notes only", () => {
  const rows = buildCreditNoteReportRows(
    [
      {
        credit_note_number: "CN-1",
        original_invoice_id: "invoice-1",
        booking_id: "booking-1",
        status: "issued",
        issued_at: "2026-05-12T10:00:00.000Z",
        taxable_reversal_amount: 1000,
        gst_reversal_amount: 50,
        total_reversal_amount: 1050,
        reason: "refund",
      },
      {
        credit_note_number: "CN-2",
        original_invoice_id: "invoice-2",
        booking_id: "booking-2",
        status: "draft",
        issued_at: "2026-05-13T10:00:00.000Z",
        taxable_reversal_amount: 2000,
        gst_reversal_amount: 100,
        total_reversal_amount: 2100,
        reason: "draft refund",
      },
    ],
    new Map([
      ["invoice-1", "GTI-1"],
      ["invoice-2", "GTI-2"],
    ]),
    MAY_RANGE
  );

  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.original_invoice_number, "GTI-1");
});

test("TDS report uses payout withholding data", () => {
  const rows = buildTdsReportRows({
    payouts: [
      {
        id: "payout-1",
        partner_profile_id: "host-1",
        gross_booking_value: 10000,
        platform_fee: 1600,
        withholding_amount: 8,
        created_at: "2026-05-20T10:00:00.000Z",
      },
    ],
    settlementLines: [{ payout_id: "payout-1", settlement_id: "settlement-1" }],
    hosts: [{ id: "host-1", user_id: "user-1", display_name: "Fallback Host" }],
    hostTaxes: [{ user_id: "user-1", pan_holder_name: "Host Legal Name", pan_last_four: "1234" }],
    range: MAY_RANGE,
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.host_legal_name, "Host Legal Name");
  assert.equal(rows[0]?.pan_masked, "XXXXXX1234");
  assert.equal(rows[0]?.settlement_id, "settlement-1");
  assert.equal(rows[0]?.tds_amount, 8);
});

test("gateway ITC report tolerates missing settlement metadata", () => {
  const rows = buildGatewayItcReportRows({
    payments: [
      {
        id: "payment-1",
        booking_id: "booking-1",
        gateway: "razorpay",
        gateway_payment_id: "rzp_pay_1",
        created_at: "2026-05-14T10:00:00.000Z",
        raw_response: {
          fee: 118,
          tax: 18,
          reference_id: "ref-1",
        },
      },
    ],
    settlementLines: [],
    range: MAY_RANGE,
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.settlement_id, "");
  assert.equal(rows[0]?.gateway_fee_taxable, 100);
  assert.equal(rows[0]?.gateway_gst, 18);
});

test("revenue report ignores draft invoices and respects date filters", () => {
  const rows = buildRevenueReportRows({
    guestInvoices: [
      {
        booking_id: "booking-1",
        status: "issued",
        issued_at: "2026-05-10T10:00:00.000Z",
        payload: { invoiceDate: "2026-05-10", roomBaseAmount: 1000, gstAmount: 50 },
      },
      {
        booking_id: "booking-2",
        status: "draft",
        issued_at: "2026-05-11T10:00:00.000Z",
        payload: { invoiceDate: "2026-05-11", roomBaseAmount: 2000, gstAmount: 100 },
      },
      {
        booking_id: "booking-3",
        status: "issued",
        issued_at: "2026-06-01T10:00:00.000Z",
        payload: { invoiceDate: "2026-06-01", roomBaseAmount: 3000, gstAmount: 150 },
      },
    ],
    platformInvoices: [
      {
        booking_id: "booking-1",
        status: "issued",
        taxable_amount: 136,
        gst_amount: 24,
      },
    ],
    creditNotes: [{ booking_id: "booking-1", status: "issued", total_reversal_amount: 1050 }],
    payouts: [{ booking_id: "booking-1", status: "paid", gross_booking_value: 1000, platform_fee: 160 }],
    range: MAY_RANGE,
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.booking_id, "booking-1");
  assert.equal(rows[0]?.refund_adjustments, 1050);
  assert.equal(rows[0]?.invoice_status, "issued_with_credit_note");
});
