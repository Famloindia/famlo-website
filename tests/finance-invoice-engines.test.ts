import assert from "node:assert/strict";
import test from "node:test";

import { buildCreditNoteArtifact, generateCreditNote } from "@/lib/finance/invoices/credit-note-engine";
import { buildGuestTaxInvoiceArtifact, generateGuestTaxInvoice } from "@/lib/finance/invoices/guest-tax-invoice-engine";
import { buildPlatformFeeInvoiceArtifact, generatePlatformFeeInvoice } from "@/lib/finance/invoices/platform-fee-invoice-engine";
import { resolveCheckoutPricingForPaymentIntent } from "@/lib/payment-intent";

async function withEnv<T>(values: Record<string, string | undefined>, run: () => Promise<T> | T): Promise<T> {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(values)) {
    previous.set(key, process.env[key]);
    if (typeof value === "undefined") {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  const restore = () => {
    for (const [key, value] of previous.entries()) {
      if (typeof value === "undefined") {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  };

  try {
    const result = await run();
    restore();
    return result;
  } catch (error) {
    restore();
    throw error;
  }
}

function createInvoiceSupabase() {
  const state = {
    finance_settings: [] as Array<Record<string, unknown>>,
    bookings_v2: [] as Array<Record<string, unknown>>,
    reservations_v2: [] as Array<Record<string, unknown>>,
    hosts: [] as Array<Record<string, unknown>>,
    guest_tax_invoices: [] as Array<Record<string, unknown>>,
    platform_fee_invoices: [] as Array<Record<string, unknown>>,
    credit_notes: [] as Array<Record<string, unknown>>,
    host_tax_details: [] as Array<Record<string, unknown>>,
  };

  function matches(row: Record<string, unknown>, filters: Array<{ column: string; value: unknown; op: "eq" | "is" }>) {
    return filters.every((filter) => {
      if (filter.op === "is") return row[filter.column] == null;
      return row[filter.column] === filter.value;
    });
  }

  return {
    state,
    client: {
      from(table: string) {
        const filters: Array<{ column: string; value: unknown; op: "eq" | "is" }> = [];
        const rows = (state as Record<string, Array<Record<string, unknown>>>)[table];

        const builder: any = {
          select() {
            return this;
          },
          eq(column: string, value: unknown) {
            filters.push({ column, value, op: "eq" });
            return this;
          },
          is(column: string, value: unknown) {
            filters.push({ column, value, op: "is" });
            return this;
          },
          maybeSingle: async () => {
            const row = rows.find((candidate) => matches(candidate, filters)) ?? null;
            return { data: row, error: null };
          },
          insert(payload: Record<string, unknown>) {
            return {
              select() {
                return {
                  single: async () => {
                    const row = {
                      id: `${table}-${rows.length + 1}`,
                      created_at: "2026-05-21T00:00:00.000Z",
                      updated_at: "2026-05-21T00:00:00.000Z",
                      ...payload,
                    };
                    rows.push(row);
                    return { data: row, error: null };
                  },
                };
              },
            };
          },
        };

        return builder;
      },
    } as any,
  };
}

test("guest invoice blocked under PENDING_COMPLIANCE", async () => {
  const { client } = createInvoiceSupabase();

  await assert.rejects(
    () =>
      withEnv(
        {
          GST_INVOICE_GENERATION_ENABLED: "true",
        },
        () => generateGuestTaxInvoice(client, { bookingId: "booking-1" })
      ),
    /PENDING_COMPLIANCE/
  );
});

test("platform fee invoice blocked under PENDING_COMPLIANCE", async () => {
  const { client } = createInvoiceSupabase();

  await assert.rejects(
    () =>
      withEnv(
        {
          PLATFORM_FEE_INVOICE_GENERATION_ENABLED: "true",
          GST_INVOICE_GENERATION_ENABLED: "true",
        },
        () => generatePlatformFeeInvoice(client, { bookingId: "booking-1" })
      ),
    /PENDING_COMPLIANCE/
  );
});

test("credit note blocked under PENDING_COMPLIANCE", async () => {
  const { client } = createInvoiceSupabase();

  await assert.rejects(
    () =>
      withEnv(
        {
          CREDIT_NOTE_GENERATION_ENABLED: "true",
        },
        () =>
          generateCreditNote(client, {
            bookingId: "booking-1",
            refundId: "refund-1",
            reason: "cancelled",
            policyInput: {
              policyCase: "FREE_CANCELLATION",
              roomBaseAmount: 10000,
              accommodationGstAmount: 500,
            },
          })
      ),
    /PENDING_COMPLIANCE/
  );
});

test("guest invoice generated under SECTION_9_5 when flags enabled", async () => {
  const { client, state } = createInvoiceSupabase();
  state.finance_settings.push({
    id: "settings-1",
    scope_type: "GLOBAL",
    scope_id: null,
    tax_mode: "ECO_SECTION_9_5",
    gst_collection_enabled: false,
    tcs_enabled: false,
    tds_enabled: false,
    gst_export_enabled: false,
    gst_invoice_generation_enabled: true,
    approved_by: "admin-1",
    approved_at: "2026-05-21T00:00:00.000Z",
  });
  state.bookings_v2.push({
    id: "booking-1",
    user_id: "guest-1",
    guest_name: "Aryan",
    payment_status: "paid",
    pricing_snapshot: {
      property_name: "Famlo Villa",
      property_address: "Goa",
      place_of_supply: "Goa",
      section_9_5_input_nights: [{ actualValue: 1000, listedValue: 1000, date: "2026-05-21" }],
    },
    start_date: "2026-05-21",
    end_date: "2026-05-22",
  });
  state.reservations_v2.push({
    id: "reservation-1",
    booking_id: "booking-1",
  });

  const invoiceId = await withEnv(
    {
      GST_INVOICE_GENERATION_ENABLED: "true",
      FAMLO_LEGAL_ENTITY_NAME: "Famlo Private Limited",
      FAMLO_GSTIN: "27ABCDE1234F1Z5",
      FAMLO_LEGAL_ADDRESS: "Mumbai, India",
    },
    () => generateGuestTaxInvoice(client, { bookingId: "booking-1" })
  );

  assert.equal(typeof invoiceId, "string");
  assert.equal(state.guest_tax_invoices.length, 1);
  assert.equal((state.guest_tax_invoices[0]?.payload as any)?.issuerRole, "FAMLO");
});

test("invoice issuer is Famlo", () => {
  const invoice = buildGuestTaxInvoiceArtifact({
    bookingId: "booking-1",
    reservationId: "reservation-1",
    guestId: "guest-1",
    guestName: "Guest",
    propertyName: "Property",
    propertyAddress: "Address",
    checkIn: "2026-05-21",
    checkOut: "2026-05-22",
    placeOfSupply: "Goa",
    nights: [{ actualValue: 1000, listedValue: 1000, date: "2026-05-21" }],
    famloLegalEntityName: "Famlo Private Limited",
    famloGstin: "27ABCDE1234F1Z5",
    famloAddress: "Mumbai",
    taxMode: "ECO_SECTION_9_5",
  });

  assert.equal(invoice.issuerRole, "FAMLO");
});

test("₹1,000 room generates 5% GST", () => {
  const invoice = buildGuestTaxInvoiceArtifact({
    bookingId: "booking-1",
    reservationId: null,
    guestId: null,
    guestName: "Guest",
    propertyName: "Property",
    propertyAddress: "Address",
    checkIn: null,
    checkOut: null,
    placeOfSupply: "Goa",
    nights: [{ actualValue: 1000, listedValue: 1000 }],
    famloLegalEntityName: "Famlo Private Limited",
    famloGstin: "27ABCDE1234F1Z5",
    famloAddress: "Mumbai",
    taxMode: "ECO_SECTION_9_5",
  });
  assert.equal(invoice.gstAmount, 50);
});

test("₹8,000 room generates 18% GST", () => {
  const invoice = buildGuestTaxInvoiceArtifact({
    bookingId: "booking-1",
    reservationId: null,
    guestId: null,
    guestName: "Guest",
    propertyName: "Property",
    propertyAddress: "Address",
    checkIn: null,
    checkOut: null,
    placeOfSupply: "Goa",
    nights: [{ actualValue: 8000, listedValue: 8000 }],
    famloLegalEntityName: "Famlo Private Limited",
    famloGstin: "27ABCDE1234F1Z5",
    famloAddress: "Mumbai",
    taxMode: "ECO_SECTION_9_5",
  });
  assert.equal(invoice.gstAmount, 1440);
});

test("mixed room booking generates mixed GST lines", () => {
  const invoice = buildGuestTaxInvoiceArtifact({
    bookingId: "booking-1",
    reservationId: null,
    guestId: null,
    guestName: "Guest",
    propertyName: "Property",
    propertyAddress: "Address",
    checkIn: null,
    checkOut: null,
    placeOfSupply: "Goa",
    nights: [{ actualValue: 5000 }, { actualValue: 8000 }],
    famloLegalEntityName: "Famlo Private Limited",
    famloGstin: "27ABCDE1234F1Z5",
    famloAddress: "Mumbai",
    taxMode: "ECO_SECTION_9_5",
  });
  assert.deepEqual(invoice.lineItems.map((line) => line.gstRateBps), [500, 1800]);
});

test("B2B booking without GSTIN blocks invoice", () => {
  assert.throws(
    () =>
      buildGuestTaxInvoiceArtifact({
        bookingId: "booking-1",
        reservationId: null,
        guestId: null,
        guestName: "Guest",
        propertyName: "Property",
        propertyAddress: "Address",
        checkIn: null,
        checkOut: null,
        placeOfSupply: "Goa",
        nights: [{ actualValue: 1000 }],
        famloLegalEntityName: "Famlo Private Limited",
        famloGstin: "27ABCDE1234F1Z5",
        famloAddress: "Mumbai",
        taxMode: "ECO_SECTION_9_5",
        requireGuestGstin: true,
      }),
    /GSTIN is required/
  );
});

test("platform fee invoice uses 16% full platform fee", () => {
  const invoice = buildPlatformFeeInvoiceArtifact({
    bookingId: "booking-1",
    reservationId: null,
    hostId: "host-1",
    hostLegalName: "Host",
    roomBaseAmount: 10000,
    calculationVersion: "section_9_5_v1",
  });
  assert.equal(invoice.totalAmount, 1600);
});

test("platform fee GST split is 18% inclusive", () => {
  const invoice = buildPlatformFeeInvoiceArtifact({
    bookingId: "booking-1",
    reservationId: null,
    hostId: "host-1",
    hostLegalName: "Host",
    roomBaseAmount: 10000,
    calculationVersion: "section_9_5_v1",
  });
  assert.equal(invoice.taxableValue + invoice.gstAmount, invoice.totalAmount);
});

test("gateway fee is not deducted from platform fee before GST", () => {
  const invoice = buildPlatformFeeInvoiceArtifact({
    bookingId: "booking-1",
    reservationId: null,
    hostId: "host-1",
    hostLegalName: "Host",
    roomBaseAmount: 10000,
    calculationVersion: "section_9_5_v1",
  });
  assert.equal(invoice.totalAmount, 1600);
});

test("full cancellation credit note reverses full GST", () => {
  const creditNote = buildCreditNoteArtifact({
    originalInvoiceId: "inv-1",
    originalInvoiceType: "guest_tax_invoice",
    bookingId: "booking-1",
    reservationId: "reservation-1",
    reason: "full_cancellation",
    policyInput: {
      policyCase: "FREE_CANCELLATION",
      roomBaseAmount: 10000,
      accommodationGstAmount: 500,
    },
    calculationVersion: "section_9_5_v1",
  });
  assert.equal(creditNote?.gstReversalAmount, 500);
});

test("partial cancellation credit note reverses only refunded base/GST", () => {
  const creditNote = buildCreditNoteArtifact({
    originalInvoiceId: "inv-1",
    originalInvoiceType: "guest_tax_invoice",
    bookingId: "booking-1",
    reservationId: "reservation-1",
    reason: "partial_cancellation",
    policyInput: {
      policyCase: "PARTIAL_CANCELLATION",
      roomBaseAmount: 10000,
      accommodationGstAmount: 500,
      retentionPercent: 0.5,
      nights: [{ actualValue: 10000 }],
    },
    calculationVersion: "section_9_5_v1",
  });
  assert.equal(creditNote?.taxableReversalAmount, 5000);
  assert.equal(creditNote?.gstReversalAmount, 250);
});

test("no-show does not create credit note", () => {
  const creditNote = buildCreditNoteArtifact({
    originalInvoiceId: "inv-1",
    originalInvoiceType: "guest_tax_invoice",
    bookingId: "booking-1",
    reservationId: "reservation-1",
    reason: "no_show",
    policyInput: {
      policyCase: "NO_SHOW",
      roomBaseAmount: 10000,
      accommodationGstAmount: 500,
    },
    calculationVersion: "section_9_5_v1",
  });
  assert.equal(creditNote, null);
});

test("credit note cannot exist without original invoice", () => {
  assert.throws(
    () =>
      buildCreditNoteArtifact({
        originalInvoiceId: null,
        originalInvoiceType: "guest_tax_invoice",
        bookingId: "booking-1",
        reservationId: "reservation-1",
        reason: "cancelled",
        policyInput: {
          policyCase: "FREE_CANCELLATION",
          roomBaseAmount: 10000,
          accommodationGstAmount: 500,
        },
        calculationVersion: "section_9_5_v1",
      }),
    /original invoice/
  );
});

test("checkout pricing unchanged when flag off", async () => {
  const { client } = createInvoiceSupabase();
  const result = await withEnv(
    {
      CHECKOUT_SECTION_9_5_PRICING_ENABLED: "false",
    },
    () =>
      resolveCheckoutPricingForPaymentIntent(client, {
        totalPrice: 10000,
        partnerPayoutAmount: 8400,
        pricingSnapshot: {
          guest_payable_amount: 10000,
          platform_fee: 1600,
          tax_amount: 0,
          section_9_5_input_nights: [{ actualValue: 1000 }],
        },
      })
  );
  assert.equal(result.amountTotal, 10000);
});

test("checkout guest payable includes GST when flag on", async () => {
  const { client, state } = createInvoiceSupabase();
  state.finance_settings.push({
    id: "settings-1",
    scope_type: "GLOBAL",
    scope_id: null,
    tax_mode: "ECO_SECTION_9_5",
    gst_invoice_generation_enabled: false,
  });

  const result = await withEnv(
    {
      CHECKOUT_SECTION_9_5_PRICING_ENABLED: "true",
    },
    () =>
      resolveCheckoutPricingForPaymentIntent(client, {
        totalPrice: 1000,
        partnerPayoutAmount: 840,
        pricingSnapshot: {
          section_9_5_input_nights: [{ actualValue: 1000, listedValue: 1000 }],
        },
      })
  );
  assert.equal(result.amountTotal, 1050);
});

test("mixed-room booking shows mixed tax lines when enabled", async () => {
  const { client, state } = createInvoiceSupabase();
  state.finance_settings.push({
    id: "settings-1",
    scope_type: "GLOBAL",
    scope_id: null,
    tax_mode: "ECO_SECTION_9_5",
    gst_invoice_generation_enabled: false,
  });

  const result = await withEnv(
    {
      CHECKOUT_SECTION_9_5_PRICING_ENABLED: "true",
    },
    () =>
      resolveCheckoutPricingForPaymentIntent(client, {
        totalPrice: 9000,
        partnerPayoutAmount: 7560,
        pricingSnapshot: {
          section_9_5_input_nights: [
            { actualValue: 1000, listedValue: 1000, date: "2026-05-21" },
            { actualValue: 8000, listedValue: 8000, date: "2026-05-22" },
          ],
        },
      })
  );

  assert.equal(result.amountTotal, 1000 + 50 + 8000 + 1440);
  assert.deepEqual(
    ((result.pricingSnapshot.finance_snapshot as any)?.tax_breakdown?.accommodation_gst_lines as any[])?.map((row: any) => row.gstRateBps),
    [500, 1800]
  );
});

test("Razorpay order amount equals guest payable when flag on", async () => {
  const { client, state } = createInvoiceSupabase();
  state.finance_settings.push({
    id: "settings-1",
    scope_type: "GLOBAL",
    scope_id: null,
    tax_mode: "ECO_SECTION_9_5",
    gst_invoice_generation_enabled: false,
  });

  const result = await withEnv(
    {
      CHECKOUT_SECTION_9_5_PRICING_ENABLED: "true",
    },
    () =>
      resolveCheckoutPricingForPaymentIntent(client, {
        totalPrice: 8000,
        partnerPayoutAmount: 6720,
        pricingSnapshot: {
          section_9_5_input_nights: [{ actualValue: 8000, listedValue: 8000 }],
        },
      })
  );
  assert.equal(result.amountTotal * 100, 944000);
});

test("guest invoice cannot be generated before payment capture", async () => {
  const { client, state } = createInvoiceSupabase();
  state.finance_settings.push({
    id: "settings-1",
    scope_type: "GLOBAL",
    scope_id: null,
    tax_mode: "ECO_SECTION_9_5",
    gst_invoice_generation_enabled: true,
    approved_by: "admin-1",
    approved_at: "2026-05-21T00:00:00.000Z",
  });
  state.bookings_v2.push({
    id: "booking-uncaptured",
    user_id: "guest-1",
    guest_name: "Aryan",
    payment_status: "pending",
    pricing_snapshot: {
      property_name: "Famlo Villa",
      property_address: "Goa",
      place_of_supply: "Goa",
      section_9_5_input_nights: [{ actualValue: 1000, listedValue: 1000, date: "2026-05-21" }],
    },
    start_date: "2026-05-21",
    end_date: "2026-05-22",
  });
  state.reservations_v2.push({
    id: "reservation-uncaptured",
    booking_id: "booking-uncaptured",
  });

  await assert.rejects(
    () =>
      withEnv(
        {
          GST_INVOICE_GENERATION_ENABLED: "true",
          FAMLO_LEGAL_ENTITY_NAME: "Famlo Private Limited",
          FAMLO_GSTIN: "27ABCDE1234F1Z5",
          FAMLO_LEGAL_ADDRESS: "Mumbai, India",
        },
        () => generateGuestTaxInvoice(client, { bookingId: "booking-uncaptured" })
      ),
    /payment capture/i
  );
});
