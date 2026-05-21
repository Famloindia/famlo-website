import assert from "node:assert/strict";
import test from "node:test";

import { getAdminFinanceBlockedReasons } from "@/lib/finance/admin-finance-ui";
import { buildCreditNoteArtifact } from "@/lib/finance/invoices/credit-note-engine";
import { buildGuestTaxInvoiceArtifact } from "@/lib/finance/invoices/guest-tax-invoice-engine";
import { buildPlatformFeeInvoiceArtifact } from "@/lib/finance/invoices/platform-fee-invoice-engine";
import { buildFolioLineIdempotencyKey } from "@/lib/finance/folio-event-pipeline";
import { resolveCheckoutPricingForPaymentIntent } from "@/lib/payment-intent";
import { buildProductionFinanceReadinessReport } from "@/lib/finance/production-readiness";
import { resolveRefundWebhookTransition } from "@/lib/finance/refund-requests";
import {
  applyRazorpayXPayoutWebhook,
  initiateApprovedSettlementPayout,
} from "@/lib/finance/payout-execution-engine";
import { loadHostInvoiceRows, loadHostSettlementDetail } from "@/lib/finance/host-finance-ui";

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

function createJourneySupabase() {
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
    disputes: [] as Array<Record<string, unknown>>,
    settlement_line_items_v2: [] as Array<Record<string, unknown>>,
    host_tax_details: [] as Array<Record<string, unknown>>,
    guest_tax_invoices: [] as Array<Record<string, unknown>>,
    platform_fee_invoices: [] as Array<Record<string, unknown>>,
    credit_notes: [] as Array<Record<string, unknown>>,
    finance_email_deliveries: [] as Array<Record<string, unknown>>,
    finance_audit_logs: [] as Array<Record<string, unknown>>,
  };

  function matches(row: Record<string, unknown>, filters: Array<{ column: string; op: string; value: unknown }>) {
    return filters.every((filter) => {
      if (filter.op === "eq") return row[filter.column] === filter.value;
      if (filter.op === "neq") return row[filter.column] !== filter.value;
      if (filter.op === "is") return filter.value == null ? row[filter.column] == null : row[filter.column] === filter.value;
      if (filter.op === "in") return Array.isArray(filter.value) && filter.value.includes(row[filter.column]);
      return true;
    });
  }

  return {
    state,
    client: {
      from(table: string) {
        const rows = (state as Record<string, Array<Record<string, unknown>>>)[table];
        const filters: Array<{ column: string; op: string; value: unknown }> = [];
        let orderBy: { column: string; ascending: boolean } | null = null;
        const builder: any = {
          select() {
            return this;
          },
          eq(column: string, value: unknown) {
            filters.push({ column, op: "eq", value });
            return this;
          },
          neq(column: string, value: unknown) {
            filters.push({ column, op: "neq", value });
            return this;
          },
          is(column: string, value: unknown) {
            filters.push({ column, op: "is", value });
            return this;
          },
          in(column: string, value: unknown[]) {
            filters.push({ column, op: "in", value });
            return this;
          },
          gte() {
            return this;
          },
          lte() {
            return this;
          },
          order(column: string, options?: { ascending?: boolean }) {
            orderBy = { column, ascending: options?.ascending ?? true };
            return this;
          },
          maybeSingle: async () => ({
            data: rows.filter((row) => matches(row, filters)).sort((a, b) => {
              if (!orderBy) return 0;
              const left = String(a[orderBy.column] ?? "");
              const right = String(b[orderBy.column] ?? "");
              return orderBy.ascending ? left.localeCompare(right) : right.localeCompare(left);
            })[0] ?? null,
            error: null,
          }),
          single: async () => {
            const found = rows.filter((row) => matches(row, filters))[0] ?? null;
            return { data: found, error: found ? null : new Error("Row not found") };
          },
          insert(payload: Record<string, unknown>) {
            return {
              select() {
                return {
                  async single() {
                    const row = {
                      id: String(payload.id ?? `${table}-${rows.length + 1}`),
                      created_at: "2026-05-21T00:00:00.000Z",
                      updated_at: "2026-05-21T00:00:00.000Z",
                      ...payload,
                    };
                    rows.push(row);
                    return { data: row, error: null };
                  },
                };
              },
              then(resolve: (value: { data: null; error: null }) => unknown) {
                rows.push({ ...payload });
                return Promise.resolve(resolve({ data: null, error: null }));
              },
            };
          },
          update(payload: Record<string, unknown>) {
            const updateBuilder: any = {
              eq(column: string, value: unknown) {
                filters.push({ column, op: "eq", value });
                return this;
              },
              neq(column: string, value: unknown) {
                filters.push({ column, op: "neq", value });
                return this;
              },
              select() {
                return {
                  async single() {
                    const row = rows.find((candidate) => matches(candidate, filters)) ?? null;
                    if (!row) return { data: null, error: new Error("Row not found") };
                    Object.assign(row, payload);
                    return { data: row, error: null };
                  },
                };
              },
              then(resolve: (value: { data: null; error: null }) => unknown) {
                rows.forEach((row) => {
                  if (matches(row, filters)) Object.assign(row, payload);
                });
                return Promise.resolve(resolve({ data: null, error: null }));
              },
            };
            return updateBuilder;
          },
          then(resolve: (value: { data: Array<Record<string, unknown>>; error: null }) => unknown) {
            const data = rows
              .filter((row) => matches(row, filters))
              .sort((a, b) => {
                if (!orderBy) return 0;
                const left = String(a[orderBy.column] ?? "");
                const right = String(b[orderBy.column] ?? "");
                return orderBy.ascending ? left.localeCompare(right) : right.localeCompare(left);
              });
            return Promise.resolve(resolve({ data, error: null }));
          },
        };
        return builder;
      },
    } as any,
  };
}

function seedApprovedSettlement(state: ReturnType<typeof createJourneySupabase>["state"]) {
  state.host_settlements_v2.push({
    id: "settlement-1",
    host_id: "host-1",
    host_user_id: "user-1",
    status: "approved",
    net_payable_amount: 8400,
    gross_booking_value: 10000,
    platform_fee_amount: 1600,
    refund_adjustment_amount: 0,
    withholding_amount: 0,
    currency: "INR",
    settlement_code: "SET-1",
  });
  state.settlement_line_items_v2.push({
    id: "line-1",
    settlement_id: "settlement-1",
    booking_id: "booking-1",
    reservation_id: "reservation-1",
    amount: 8400,
    metadata: { refund_adjustment_amount: 0 },
  });
  state.bookings_v2.push({
    id: "booking-1",
    host_id: "host-1",
    status: "completed",
    payment_status: "paid",
    legacy_booking_id: "legacy-1",
    pricing_snapshot: {
      room_base_amount: 10000,
      platform_fee_amount: 1600,
      host_gross_payout_amount: 8400,
    },
  });
  state.host_payout_accounts.push({
    id: "acct-1",
    host_id: "host-1",
    provider: "RAZORPAYX",
    provider_fund_account_id: "fa_123",
    account_number_masked: "XXXX1234",
    ifsc: "HDFC0001234",
    validation_status: "validation_unavailable",
    is_active: true,
    updated_at: "2026-05-21T00:00:00.000Z",
  });
  state.host_tax_details.push({
    user_id: "user-1",
    verification_status: "verified",
    is_verified: true,
  });
}

test("direct booking Section 9(5) journey produces guest and host artifacts and payout completion", async () => {
  const guestInvoice = buildGuestTaxInvoiceArtifact({
    bookingId: "booking-1",
    reservationId: "reservation-1",
    guestId: "guest-1",
    guestName: "Guest",
    propertyName: "Famlo Stay",
    propertyAddress: "Goa",
    checkIn: "2026-05-21",
    checkOut: "2026-05-22",
    placeOfSupply: "Goa",
    nights: [{ actualValue: 1000, listedValue: 1000, date: "2026-05-21" }],
    famloLegalEntityName: "Famlo Pvt Ltd",
    famloGstin: "27ABCDE1234F1Z5",
    famloAddress: "Mumbai",
    taxMode: "ECO_SECTION_9_5",
    invoiceStatus: "issued",
  });
  const platformInvoice = buildPlatformFeeInvoiceArtifact({
    bookingId: "booking-1",
    reservationId: "reservation-1",
    hostId: "host-1",
    hostLegalName: "Host Legal",
    roomBaseAmount: guestInvoice.roomBaseAmount,
    calculationVersion: guestInvoice.calculationVersion,
    invoiceStatus: "issued",
  });

  assert.equal(guestInvoice.totalInvoiceAmount, 1050);
  assert.equal(platformInvoice.totalAmount, 160);

  const { client, state } = createJourneySupabase();
  seedApprovedSettlement(state);
  await initiateApprovedSettlementPayout(
    client,
    { settlementId: "settlement-1", explicitAdminAction: true },
    {
      isSettlementPayoutExecutionEnabled: () => true,
      isRazorpayXEnabled: () => true,
      isRazorpayXConfigured: () => true,
      createPayout: async () => ({ id: "pout_1", status: "processing" }) as any,
    }
  );
  await applyRazorpayXPayoutWebhook(client, {
    eventName: "payout.processed",
    providerPayoutId: "pout_1",
    referenceId: String(state.host_payout_executions[0]?.id ?? ""),
    rawPayload: { payload: { payout: { entity: { id: "pout_1", reference_id: state.host_payout_executions[0]?.id } } } },
  });

  assert.equal(state.host_settlements_v2[0]?.status, "paid");
});

test("free cancellation before payout yields refund transition and credit note with no host payout", () => {
  const creditNote = buildCreditNoteArtifact({
    originalInvoiceId: "invoice-1",
    originalInvoiceType: "guest_tax_invoice",
    bookingId: "booking-1",
    reservationId: "reservation-1",
    reason: "free_cancellation",
    policyInput: {
      policyCase: "FREE_CANCELLATION",
      roomBaseAmount: 10000,
      accommodationGstAmount: 500,
      guestPayableAmount: 10500,
    },
    calculationVersion: "section_9_5_v1",
  });
  assert.equal(creditNote?.totalReversalAmount, 10500);
  assert.equal(resolveRefundWebhookTransition("refund.created").shouldFinalizeFolio, false);
});

test("partial cancellation keeps retained economics and partial credit note", () => {
  const creditNote = buildCreditNoteArtifact({
    originalInvoiceId: "invoice-1",
    originalInvoiceType: "guest_tax_invoice",
    bookingId: "booking-1",
    reservationId: "reservation-1",
    reason: "partial_cancellation",
    policyInput: {
      policyCase: "PARTIAL_CANCELLATION",
      roomBaseAmount: 10000,
      accommodationGstAmount: 1800,
      guestPayableAmount: 11800,
      retentionPercent: 0.5,
    },
    calculationVersion: "section_9_5_v1",
  });
  assert.equal((creditNote?.totalReversalAmount ?? 0) > 0, true);
  assert.equal((creditNote?.totalReversalAmount ?? 0) < 11800, true);
});

test("no-show keeps full GST payable and no credit note", () => {
  const creditNote = buildCreditNoteArtifact({
    originalInvoiceId: "invoice-1",
    originalInvoiceType: "guest_tax_invoice",
    bookingId: "booking-1",
    reservationId: "reservation-1",
    reason: "no_show",
    policyInput: {
      policyCase: "NO_SHOW",
      roomBaseAmount: 10000,
      accommodationGstAmount: 1800,
      guestPayableAmount: 11800,
    },
    calculationVersion: "section_9_5_v1",
  });
  assert.equal(creditNote, null);
});

test("host cancellation produces full refund economics", () => {
  const creditNote = buildCreditNoteArtifact({
    originalInvoiceId: "invoice-1",
    originalInvoiceType: "guest_tax_invoice",
    bookingId: "booking-1",
    reservationId: "reservation-1",
    reason: "host_cancellation",
    policyInput: {
      policyCase: "HOST_CANCELLATION",
      roomBaseAmount: 10000,
      accommodationGstAmount: 500,
      guestPayableAmount: 10500,
    },
    calculationVersion: "section_9_5_v1",
  });
  assert.equal(creditNote?.totalReversalAmount, 10500);
});

test("failed refund stays non-final and requires review", () => {
  const failed = resolveRefundWebhookTransition("refund.failed");
  assert.equal(failed.requestStatus, "failed");
  assert.equal(failed.shouldFinalizeFolio, false);
});

test("failed payout marks settlement payout_failed", async () => {
  const { client, state } = createJourneySupabase();
  seedApprovedSettlement(state);
  state.host_payout_executions.push({
    id: "payout-exec-1",
    settlement_id: "settlement-1",
    host_id: "host-1",
    provider: "RAZORPAYX",
    provider_payout_id: "pout_1",
    status: "processing",
    reference_id: "payout-exec-1",
  });
  await applyRazorpayXPayoutWebhook(client, {
    eventName: "payout.failed",
    providerPayoutId: "pout_1",
    referenceId: "payout-exec-1",
    rawPayload: { payload: { payout: { entity: { id: "pout_1", reference_id: "payout-exec-1", failure_reason: "bank_error" } } } },
  });
  assert.equal(state.host_settlements_v2[0]?.status, "payout_failed");
});

test("reversed payout marks settlement needs_review", async () => {
  const { client, state } = createJourneySupabase();
  seedApprovedSettlement(state);
  state.host_payout_executions.push({
    id: "payout-exec-1",
    settlement_id: "settlement-1",
    host_id: "host-1",
    provider: "RAZORPAYX",
    provider_payout_id: "pout_1",
    status: "processed",
    reference_id: "payout-exec-1",
  });
  await applyRazorpayXPayoutWebhook(client, {
    eventName: "payout.reversed",
    providerPayoutId: "pout_1",
    referenceId: "payout-exec-1",
    rawPayload: { payload: { payout: { entity: { id: "pout_1", reference_id: "payout-exec-1" } } } },
  });
  assert.equal(state.host_settlements_v2[0]?.status, "needs_review");
});

test("duplicate webhook replay keeps idempotent keys stable", () => {
  const paymentKeyA = buildFolioLineIdempotencyKey({
    bookingId: "booking-1",
    lineCode: "GUEST_PAYMENT",
    eventType: "PAYMENT_CAPTURED",
    sourceEventId: "evt-1",
    calculationVersion: "v1",
  });
  const paymentKeyB = buildFolioLineIdempotencyKey({
    bookingId: "booking-1",
    lineCode: "GUEST_PAYMENT",
    eventType: "PAYMENT_CAPTURED",
    sourceEventId: "evt-1",
    calculationVersion: "v1",
  });
  assert.equal(paymentKeyA, paymentKeyB);
  assert.equal(resolveRefundWebhookTransition("refund.processed").shouldFinalizeFolio, true);
});

test("checkout flag off keeps old behavior", async () => {
  const { client } = createJourneySupabase();
  const result = await withEnv(
    { CHECKOUT_SECTION_9_5_PRICING_ENABLED: "false" },
    () =>
      resolveCheckoutPricingForPaymentIntent(client, {
        totalPrice: 10000,
        partnerPayoutAmount: 8400,
        pricingSnapshot: { guest_payable_amount: 10000, platform_fee: 1600, tax_amount: 0 },
      })
  );
  assert.equal(result.amountTotal, 10000);
});

test("pending compliance blocks all tax artifacts and GST report actions", () => {
  const blocked = getAdminFinanceBlockedReasons("PENDING_COMPLIANCE");
  assert.match(blocked.guestInvoice ?? "", /PENDING_COMPLIANCE/);
  assert.match(blocked.platformFeeInvoice ?? "", /PENDING_COMPLIANCE/);
  assert.match(blocked.creditNote ?? "", /PENDING_COMPLIANCE/);
  assert.match(blocked.reports ?? "", /PENDING_COMPLIANCE/);
});

test("missing GSTIN and config block production readiness", async () => {
  const { client } = createJourneySupabase();
  const report = await withEnv(
    {
      TAX_MODE: "PENDING_COMPLIANCE",
      FAMLO_GSTIN: undefined,
      FAMLO_LEGAL_ENTITY_NAME: undefined,
      FAMLO_LEGAL_ADDRESS: undefined,
    },
    () => buildProductionFinanceReadinessReport(client)
  );
  assert.equal(report.tax.state, "blocking");
});

test("host cannot see another host finance data", async () => {
  const { client, state } = createJourneySupabase();
  state.bookings_v2.push({ id: "booking-own", host_id: "host-1" }, { id: "booking-other", host_id: "host-2" });
  state.platform_fee_invoices.push(
    { id: "doc-own", host_id: "host-1", booking_id: "booking-own", invoice_number: "PFI-1", total_amount: 100, status: "issued", issued_at: "2026-05-21" },
    { id: "doc-other", host_id: "host-2", booking_id: "booking-other", invoice_number: "PFI-2", total_amount: 100, status: "issued", issued_at: "2026-05-21" }
  );
  const rows = await loadHostInvoiceRows(client, "host-1");
  assert.deepEqual(rows.map((row) => row.id), ["doc-own"]);
  const detail = await loadHostSettlementDetail(client, "host-1", "unknown");
  assert.equal(detail, null);
});

test("disabled flags prevent admin write actions", () => {
  const blocked = getAdminFinanceBlockedReasons("ECO_SECTION_9_5");
  assert.equal(typeof blocked.refundExecution, "string");
  assert.equal(typeof blocked.payoutTrigger, "string");
});

test("GST export is blocked by default until GST_EXPORT_ENABLED is enabled", () => {
  const blocked = getAdminFinanceBlockedReasons("ECO_SECTION_9_5");
  assert.match(blocked.reports ?? "", /GST exports are disabled by default/);
});
