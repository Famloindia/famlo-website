import assert from "node:assert/strict";
import test from "node:test";

import { renderHostBookingStatement } from "@/lib/document-templates";

test("host booking statement renders real booking and OTA finance fields", () => {
  const html = renderHostBookingStatement({
    statement_number: "HS-BOOKING1",
    booking_id: "booking-1",
    external_booking_id: "OTA-123",
    property_name: "SAM's Home",
    room_name: "Sukoon",
    guest_name: "Rahul Sharma",
    source_channel: "Booking.com / Channex",
    check_in_date: "2026-05-29",
    check_out_date: "2026-05-31",
    booking_status: "confirmed",
    payment_collect_mode: "OTA_COLLECT",
    payment_status: "paid",
    settlement_status: "pending_reconciliation",
    gross_booking_amount: 8400,
    ota_commission_amount: 1200,
    ota_commission_source: "actual",
    ota_commission_gst_amount: 216,
    platform_fee_amount: 420,
    tax_amount: 76,
    refund_adjustment_amount: 0,
    host_payout_amount: 6704,
    payout_status: "pending",
    data_source_note: "Generated from real test data.",
  });

  assert.match(html, /Famlo Host Booking Statement/);
  assert.match(html, /OTA-123/);
  assert.match(html, /Booking\.com \/ Channex/);
  assert.match(html, /OTA collected/);
  assert.match(html, /Actual/);
  assert.match(html, /INR 8,400/);
  assert.match(html, /INR 6,704/);
  assert.doesNotMatch(html, /undefined/);
});
