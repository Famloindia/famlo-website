import assert from "node:assert/strict";
import test from "node:test";

import { generateOrLoadFinancePdf, resolveFinanceDocumentById } from "@/lib/finance/invoices/pdf/document-service";
import { renderGuestTaxInvoicePdf } from "@/lib/finance/invoices/pdf/guest-tax-invoice-pdf";

async function withEnv<T>(values: Record<string, string | undefined>, run: () => Promise<T> | T): Promise<T> {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(values)) {
    previous.set(key, process.env[key]);
    if (typeof value === "undefined") delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return await run();
  } finally {
    for (const [key, value] of previous.entries()) {
      if (typeof value === "undefined") delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function createPdfSupabase() {
  const state = {
    finance_settings: [] as Array<Record<string, unknown>>,
    guest_tax_invoices: [] as Array<Record<string, unknown>>,
    platform_fee_invoices: [] as Array<Record<string, unknown>>,
    credit_notes: [] as Array<Record<string, unknown>>,
    finance_document_files: [] as Array<Record<string, unknown>>,
    bookings_v2: [] as Array<Record<string, unknown>>,
    hosts: [] as Array<Record<string, unknown>>,
  };

  function matches(row: Record<string, unknown>, filters: Array<{ column: string; value: unknown; op: "eq" | "is" }>) {
    return filters.every((filter) => (filter.op === "is" ? row[filter.column] == null : row[filter.column] === filter.value));
  }

  return {
    state,
    client: {
      from(table: string) {
        const rows = (state as Record<string, Array<Record<string, unknown>>>)[table];
        const filters: Array<{ column: string; value: unknown; op: "eq" | "is" }> = [];
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
          maybeSingle: async () => ({ data: rows.find((row) => matches(row, filters)) ?? null, error: null }),
          single: async () => ({ data: rows.find((row) => matches(row, filters)) ?? null, error: null }),
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
          update(payload: Record<string, unknown>) {
            return {
              eq(column: string, value: unknown) {
                const row = rows.find((candidate) => candidate[column] === value);
                if (row) Object.assign(row, payload);
                return {
                  select() {
                    return {
                      single: async () => ({ data: row ?? null, error: null }),
                    };
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

test("guest invoice PDF rendering returns bytes", async () => {
  const bytes = await renderGuestTaxInvoicePdf({
    invoiceNumber: "GTI-001",
    invoiceDate: "2026-05-21",
    bookingId: "booking-1",
    reservationId: "reservation-1",
    guestId: "guest-1",
    guestName: "Aryan",
    guestGstin: null,
    famloLegalEntityName: "Famlo Private Limited",
    famloGstin: "27ABCDE1234F1Z5",
    famloAddress: "Mumbai",
    sacCode: "9963",
    propertyName: "Famlo Villa",
    propertyAddress: "Goa",
    checkIn: "2026-05-21",
    checkOut: "2026-05-22",
    lineItems: [
      {
        roomId: "room-1",
        date: "2026-05-21",
        description: "Accommodation charge 1",
        roomBaseAmount: 1000,
        gstRateBps: 500,
        gstAmount: 50,
        totalAmount: 1050,
      },
    ],
    roomBaseAmount: 1000,
    gstAmount: 50,
    totalInvoiceAmount: 1050,
    placeOfSupply: "Goa",
    invoiceStatus: "issued",
    calculationVersion: "section_9_5_v1",
    issuerRole: "FAMLO",
  });

  assert.ok(bytes.length > 1000);
  assert.equal(bytes.subarray(0, 4).toString("utf8"), "%PDF");
});

test("document service stores PDF metadata for issued guest invoice", async () => {
  const { client, state } = createPdfSupabase();
  state.finance_settings.push({
    id: "settings-1",
    scope_type: "GLOBAL",
    scope_id: null,
    tax_mode: "ECO_SECTION_9_5",
    gst_invoice_generation_enabled: true,
    approved_by: "admin-1",
    approved_at: "2026-05-21T00:00:00.000Z",
  });
  state.bookings_v2.push({ id: "booking-1", host_id: "host-1" });
  state.guest_tax_invoices.push({
    id: "invoice-1",
    invoice_number: "GTI-001",
    booking_id: "booking-1",
    guest_id: "guest-1",
    status: "issued",
    payload: {
      invoiceNumber: "GTI-001",
      invoiceDate: "2026-05-21",
      bookingId: "booking-1",
      reservationId: "reservation-1",
      guestId: "guest-1",
      guestName: "Aryan",
      guestGstin: null,
      famloLegalEntityName: "Famlo Private Limited",
      famloGstin: "27ABCDE1234F1Z5",
      famloAddress: "Mumbai",
      sacCode: "9963",
      propertyName: "Famlo Villa",
      propertyAddress: "Goa",
      checkIn: "2026-05-21",
      checkOut: "2026-05-22",
      lineItems: [
        {
          roomId: "room-1",
          date: "2026-05-21",
          description: "Accommodation charge 1",
          roomBaseAmount: 1000,
          gstRateBps: 500,
          gstAmount: 50,
          totalAmount: 1050,
        },
      ],
      roomBaseAmount: 1000,
      gstAmount: 50,
      totalInvoiceAmount: 1050,
      placeOfSupply: "Goa",
      invoiceStatus: "issued",
      calculationVersion: "section_9_5_v1",
      issuerRole: "FAMLO",
    },
  });

  const document = await resolveFinanceDocumentById(client, "invoice-1");
  assert.ok(document);

  await withEnv(
    {
      INVOICE_PDF_GENERATION_ENABLED: "true",
      GST_INVOICE_GENERATION_ENABLED: "true",
      TAX_COMPLIANCE_LOCK_ENABLED: "false",
      FAMLO_LEGAL_ENTITY_NAME: "Famlo Private Limited",
      FAMLO_GSTIN: "27ABCDE1234F1Z5",
      FAMLO_LEGAL_ADDRESS: "Mumbai",
    },
    () => generateOrLoadFinancePdf(client, document!, "admin")
  );

  assert.equal(state.finance_document_files.length, 1);
  assert.equal(state.finance_document_files[0]?.artifact_type, "guest_tax_invoice");
});
