import assert from "node:assert/strict";
import test from "node:test";

import { buildProductionFinanceReadinessReport } from "@/lib/finance/production-readiness";

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

function createReadinessSupabase() {
  const state = {
    finance_settings: [] as Array<Record<string, unknown>>,
    payments_v2: [] as Array<Record<string, unknown>>,
    bookings_v2: [] as Array<Record<string, unknown>>,
    payment_intents: [] as Array<Record<string, unknown>>,
    payment_provider_events: [] as Array<Record<string, unknown>>,
    folio_line_items_v2: [] as Array<Record<string, unknown>>,
    refund_requests: [] as Array<Record<string, unknown>>,
    refund_attempts: [] as Array<Record<string, unknown>>,
    refunds_v2: [] as Array<Record<string, unknown>>,
    credit_notes_v2: [] as Array<Record<string, unknown>>,
    host_settlements_v2: [] as Array<Record<string, unknown>>,
    host_payout_executions: [] as Array<Record<string, unknown>>,
    host_payout_accounts: [] as Array<Record<string, unknown>>,
    settlement_line_items_v2: [] as Array<Record<string, unknown>>,
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
        return {
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
          then(resolve: (value: { data: Array<Record<string, unknown>>; error: null }) => unknown) {
            return Promise.resolve(resolve({ data: rows.filter((row) => matches(row, filters)), error: null }));
          },
        } as any;
      },
    } as any,
  };
}

test("production readiness returns grouped blocking status by default", async () => {
  const { client } = createReadinessSupabase();

  const report = await withEnv(
    {
      TAX_MODE: "PENDING_COMPLIANCE",
      GST_COLLECTION_ENABLED: "false",
      RAZORPAY_KEY_ID: undefined,
      RAZORPAY_KEY_SECRET: undefined,
      RAZORPAY_WEBHOOK_SECRET: undefined,
      RAZORPAYX_KEY_ID: undefined,
      RAZORPAYX_KEY_SECRET: undefined,
      RAZORPAYX_ACCOUNT_NUMBER: undefined,
      RAZORPAYX_WEBHOOK_SECRET: undefined,
      FAMLO_GSTIN: undefined,
      FAMLO_LEGAL_ENTITY_NAME: undefined,
      FAMLO_LEGAL_ADDRESS: undefined,
    },
    () => buildProductionFinanceReadinessReport(client)
  );

  assert.equal(report.tax.state, "blocking");
  assert.equal(report.payments.state, "blocking");
  assert.equal(report.payouts.state, "blocking");
  assert.equal(report.flags.gstCollectionEnabled, false);
  assert.equal(report.flags.settlementPayoutExecutionEnabled, false);
});

test("production readiness surfaces reconciliation blockers for payout rollout", async () => {
  const { client, state } = createReadinessSupabase();
  state.finance_settings.push({
    id: "settings-1",
    scope_type: "GLOBAL",
    scope_id: null,
    tax_mode: "ECO_SECTION_9_5",
    gst_invoice_generation_enabled: true,
    approved_by: "admin-1",
    approved_at: "2026-05-21T00:00:00.000Z",
  });
  state.payment_provider_events.push({
    id: "evt-1",
    provider: "RAZORPAYX",
    event_id: "bad-1",
    event_type: "payout.processed",
    entity_type: "payout",
    entity_id: "payout-1",
    signature_valid: false,
    processing_status: "invalid_signature",
    processed_at: null,
    error_message: "bad signature",
    created_at: "2026-05-21T00:00:00.000Z",
  });

  const report = await withEnv(
    {
      TAX_MODE: "SECTION_9_5",
      FAMLO_GSTIN: "27ABCDE1234F1Z5",
      FAMLO_LEGAL_ENTITY_NAME: "Famlo Private Limited",
      FAMLO_LEGAL_ADDRESS: "Mumbai",
      RAZORPAY_KEY_ID: "key",
      RAZORPAY_KEY_SECRET: "secret",
      RAZORPAY_WEBHOOK_SECRET: "whsec",
      RAZORPAYX_KEY_ID: "xkey",
      RAZORPAYX_KEY_SECRET: "xsecret",
      RAZORPAYX_ACCOUNT_NUMBER: "1234",
      RAZORPAYX_WEBHOOK_SECRET: "xwhsec",
      FAMLO_CURRENT_ACCOUNT_NAME: "Famlo Current",
      FAMLO_CURRENT_ACCOUNT_NUMBER: "1234567890",
      FAMLO_CURRENT_ACCOUNT_IFSC: "HDFC0001",
      GST_INVOICE_NUMBER_PREFIX: "GTI",
      CREDIT_NOTE_NUMBER_PREFIX: "CN",
      SETTLEMENT_PAYOUT_EXECUTION_ENABLED: "true",
    },
    () => buildProductionFinanceReadinessReport(client)
  );

  assert.equal(report.reconciliation.state, "blocking");
  assert.equal(report.payouts.state, "blocking");
});
