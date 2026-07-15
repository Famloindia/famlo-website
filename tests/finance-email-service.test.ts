import assert from "node:assert/strict";
import test from "node:test";

import { sendInvoiceEmail } from "@/lib/notifications/email/finance-email-service";

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

function createEmailSupabase() {
  const state = {
    guest_tax_invoices: [] as Array<Record<string, unknown>>,
    platform_fee_invoices: [] as Array<Record<string, unknown>>,
    credit_notes: [] as Array<Record<string, unknown>>,
    bookings_v2: [] as Array<Record<string, unknown>>,
    users: [] as Array<Record<string, unknown>>,
    hosts: [] as Array<Record<string, unknown>>,
    finance_email_deliveries: [] as Array<Record<string, unknown>>,
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
          insert(payload: Record<string, unknown>) {
            return {
              select() {
                return {
                  single: async () => {
                    const row = { id: `${table}-${rows.length + 1}`, ...payload };
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
                return { then: async (resolve: (value: { error: null }) => unknown) => resolve({ error: null }) };
              },
            };
          },
        };
        return builder;
      },
    } as any,
  };
}

test("invoice email delivery is blocked when flag is off", async () => {
  const { client, state } = createEmailSupabase();
  state.guest_tax_invoices.push({
    id: "invoice-1",
    booking_id: "booking-1",
    guest_id: "guest-1",
    payload: {
      invoiceNumber: "GTI-001",
      bookingId: "booking-1",
      guestName: "Aryan",
      totalInvoiceAmount: 1050,
      invoiceStatus: "issued",
    },
  });
  await assert.rejects(() => sendInvoiceEmail(client, { invoiceId: "invoice-1" }), /disabled by feature flag/i);
});

test("guest invoice email delivery logs a send when enabled", async () => {
  const { client, state } = createEmailSupabase();
  state.guest_tax_invoices.push({
    id: "invoice-1",
    booking_id: "booking-1",
    guest_id: "guest-1",
    payload: {
      invoiceNumber: "GTI-001",
      bookingId: "booking-1",
      guestName: "Aryan",
      totalInvoiceAmount: 1050,
      invoiceStatus: "issued",
    },
  });
  state.bookings_v2.push({ id: "booking-1", user_id: "guest-1" });
  state.users.push({ id: "guest-1", email: "guest@example.com" });

  const result = await withEnv(
    {
      INVOICE_EMAIL_DELIVERY_ENABLED: "true",
      EMAIL_PROVIDER: "log",
      APP_BASE_URL: "https://example.com",
    },
    () => sendInvoiceEmail(client, { invoiceId: "invoice-1" })
  );

  assert.equal(typeof result.deliveryId, "string");
  assert.equal(state.finance_email_deliveries.length, 1);
  assert.equal(state.finance_email_deliveries[0]?.template_key, "guest_invoice");
});
