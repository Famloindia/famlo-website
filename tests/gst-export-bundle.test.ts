import assert from "node:assert/strict";
import test from "node:test";

import { buildCombinedGstExportRows } from "@/lib/finance/reports/gst-export-bundle";

test("combined GST export includes accommodation, platform fee, and credit note rows in date order", () => {
  const rows = buildCombinedGstExportRows({
    accommodation: [
      {
        invoice_number: "GTI-1",
        invoice_date: "2026-05-10",
        booking_id: "booking-1",
        reservation_id: "reservation-1",
        taxable_value: 1000,
        total_gst: 50,
        total_invoice_amount: 1050,
        place_of_supply: "Goa",
        sac_code: "9963",
        gst_rate: "5%",
        cgst: 25,
        sgst: 25,
        igst: 0,
        guest_gstin: "27ABCDE1234F1Z5",
      },
    ],
    platformFee: [
      {
        invoice_number: "PFI-1",
        invoice_date: "2026-05-11",
        booking_id: "booking-1",
        host_id: "host-1",
        taxable_value: 1600,
        gst_at_18_percent: 288,
        total_invoice_amount: 1888,
        host_gstin: "27ABCDE1234F1Z5",
      },
    ],
    creditNotes: [
      {
        credit_note_number: "CN-1",
        credit_note_date: "2026-05-12",
        booking_id: "booking-1",
        original_invoice_number: "GTI-1",
        reversal_taxable_amount: 1000,
        reversal_gst_amount: 50,
        total_reversal_amount: 1050,
        reason: "refund",
      },
    ],
  });

  assert.deepEqual(
    rows.map((row) => row.report_type),
    ["accommodation", "platform_fee", "credit_note"]
  );
  assert.equal(rows[0]?.document_number, "GTI-1");
  assert.equal(rows[1]?.reservation_or_host, "host-1");
  assert.equal(rows[2]?.place_of_supply_or_reason, "refund");
});
