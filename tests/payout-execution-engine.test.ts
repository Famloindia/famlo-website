import assert from "node:assert/strict";
import test from "node:test";

import {
  applyRazorpayXPayoutWebhook,
  initiateApprovedSettlementPayout,
  isPayoutAutoRetryAllowed,
} from "@/lib/finance/payout-execution-engine";

function createPayoutExecutionSupabase() {
  const state = {
    host_settlements_v2: [] as Array<Record<string, unknown>>,
    settlement_line_items_v2: [] as Array<Record<string, unknown>>,
    host_payout_accounts: [] as Array<Record<string, unknown>>,
    host_tax_details: [] as Array<Record<string, unknown>>,
    bookings_v2: [] as Array<Record<string, unknown>>,
    refund_requests: [] as Array<Record<string, unknown>>,
    disputes: [] as Array<Record<string, unknown>>,
    host_payout_executions: [] as Array<Record<string, unknown>>,
    finance_audit_logs: [] as Array<Record<string, unknown>>,
  };

  function matches(row: Record<string, unknown>, filters: Array<{ column: string; op: "eq" | "neq" | "in"; value: unknown }>) {
    return filters.every((filter) => {
      if (filter.op === "eq") return row[filter.column] === filter.value;
      if (filter.op === "neq") return row[filter.column] !== filter.value;
      const values = Array.isArray(filter.value) ? filter.value : [];
      return values.includes(row[filter.column]);
    });
  }

  function sortRows(rows: Array<Record<string, unknown>>, orderBy: { column: string; ascending: boolean } | null) {
    if (!orderBy) return rows;
    return [...rows].sort((left, right) => {
      const leftValue = String(left[orderBy.column] ?? "");
      const rightValue = String(right[orderBy.column] ?? "");
      return orderBy.ascending ? leftValue.localeCompare(rightValue) : rightValue.localeCompare(leftValue);
    });
  }

  return {
    state,
    client: {
      from(table: string) {
        const filters: Array<{ column: string; op: "eq" | "neq" | "in"; value: unknown }> = [];
        let orderBy: { column: string; ascending: boolean } | null = null;
        const rows = (state as Record<string, Array<Record<string, unknown>>>)[table];

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
          in(column: string, value: unknown[]) {
            filters.push({ column, op: "in", value });
            return this;
          },
          order(column: string, options?: { ascending?: boolean }) {
            orderBy = { column, ascending: options?.ascending ?? true };
            return this;
          },
          async maybeSingle() {
            const found = sortRows(rows.filter((row) => matches(row, filters)), orderBy)[0] ?? null;
            return { data: found, error: null };
          },
          async single() {
            const found = sortRows(rows.filter((row) => matches(row, filters)), orderBy)[0] ?? null;
            return { data: found, error: found ? null : new Error("Row not found") };
          },
          async then(resolve: (value: { data: Array<Record<string, unknown>>; error: null }) => void) {
            resolve({ data: sortRows(rows.filter((row) => matches(row, filters)), orderBy), error: null });
          },
          insert(payload: Record<string, unknown>) {
            const insertBuilder: any = {
              async then(resolve: (value: { data: null; error: null }) => void) {
                rows.push({ ...payload });
                resolve({ data: null, error: null });
              },
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
            };
            return insertBuilder;
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
              in(column: string, value: unknown[]) {
                filters.push({ column, op: "in", value });
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
              async then(resolve: (value: { data: null; error: null }) => void) {
                rows.forEach((row) => {
                  if (matches(row, filters)) Object.assign(row, payload);
                });
                resolve({ data: null, error: null });
              },
            };
            return updateBuilder;
          },
        };
        return builder;
      },
    } as any,
  };
}

function seedApprovedSettlement(state: ReturnType<typeof createPayoutExecutionSupabase>["state"]) {
  state.host_settlements_v2.push({
    id: "settlement-1",
    host_id: "host-1",
    host_user_id: "user-1",
    status: "approved",
    net_payable_amount: 8400,
    currency: "INR",
  });
  state.settlement_line_items_v2.push({
    id: "line-1",
    settlement_id: "settlement-1",
    booking_id: "booking-1",
    metadata: {},
  });
  state.bookings_v2.push({
    id: "booking-1",
    status: "completed",
    payment_status: "paid",
    legacy_booking_id: "legacy-1",
  });
  state.host_payout_accounts.push({
    id: "acct-1",
    host_id: "host-1",
    provider: "RAZORPAYX",
    provider_fund_account_id: "fa_123",
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

test("draft settlement cannot payout", async () => {
  const { client, state } = createPayoutExecutionSupabase();
  seedApprovedSettlement(state);
  state.host_settlements_v2[0]!.status = "draft";

  await assert.rejects(
    () =>
      initiateApprovedSettlementPayout(
        client,
        { settlementId: "settlement-1", explicitAdminAction: true },
        {
          isSettlementPayoutExecutionEnabled: () => true,
          isRazorpayXEnabled: () => true,
          isRazorpayXConfigured: () => true,
        }
      ),
    /Only approved settlements/
  );
});

test("approved settlement with execution flag off cannot payout", async () => {
  const { client, state } = createPayoutExecutionSupabase();
  seedApprovedSettlement(state);

  await assert.rejects(
    () => initiateApprovedSettlementPayout(client, { settlementId: "settlement-1", explicitAdminAction: true }),
    /disabled/
  );
});

test("approved settlement with inactive payout account cannot payout", async () => {
  const { client, state } = createPayoutExecutionSupabase();
  seedApprovedSettlement(state);
  state.host_payout_accounts[0]!.is_active = false;

  await assert.rejects(
    () =>
      initiateApprovedSettlementPayout(
        client,
        { settlementId: "settlement-1", explicitAdminAction: true },
        {
          isSettlementPayoutExecutionEnabled: () => true,
          isRazorpayXEnabled: () => true,
          isRazorpayXConfigured: () => true,
        }
      ),
    /Active RazorpayX payout account/
  );
});

test("missing PAN/KYC blocks payout", async () => {
  const { client, state } = createPayoutExecutionSupabase();
  seedApprovedSettlement(state);
  state.host_tax_details[0]!.is_verified = false;
  state.host_tax_details[0]!.verification_status = "pending";

  await assert.rejects(
    () =>
      initiateApprovedSettlementPayout(
        client,
        { settlementId: "settlement-1", explicitAdminAction: true },
        {
          isSettlementPayoutExecutionEnabled: () => true,
          isRazorpayXEnabled: () => true,
          isRazorpayXConfigured: () => true,
        }
      ),
    /PAN\/KYC/
  );
});

test("pending refund blocks payout", async () => {
  const { client, state } = createPayoutExecutionSupabase();
  seedApprovedSettlement(state);
  state.refund_requests.push({
    id: "refund-1",
    booking_id: "booking-1",
    status: "processing",
  });

  await assert.rejects(
    () =>
      initiateApprovedSettlementPayout(
        client,
        { settlementId: "settlement-1", explicitAdminAction: true },
        {
          isSettlementPayoutExecutionEnabled: () => true,
          isRazorpayXEnabled: () => true,
          isRazorpayXConfigured: () => true,
        }
      ),
    /refund request/
  );
});

test("net amount <= 0 blocks payout", async () => {
  const { client, state } = createPayoutExecutionSupabase();
  seedApprovedSettlement(state);
  state.host_settlements_v2[0]!.net_payable_amount = 0;

  await assert.rejects(
    () =>
      initiateApprovedSettlementPayout(
        client,
        { settlementId: "settlement-1", explicitAdminAction: true },
        {
          isSettlementPayoutExecutionEnabled: () => true,
          isRazorpayXEnabled: () => true,
          isRazorpayXConfigured: () => true,
        }
      ),
    /positive net payable/
  );
});

test("creates internal payout execution before provider call", async () => {
  const { client, state } = createPayoutExecutionSupabase();
  seedApprovedSettlement(state);

  const result = await initiateApprovedSettlementPayout(
    client,
    { settlementId: "settlement-1", actorUserId: "admin-1", explicitAdminAction: true },
    {
      isSettlementPayoutExecutionEnabled: () => true,
      isRazorpayXEnabled: () => true,
      isRazorpayXConfigured: () => true,
      createPayout: async (input) => {
        assert.equal(state.host_payout_executions.length, 1);
        assert.equal(state.host_payout_executions[0]?.reference_id, state.host_payout_executions[0]?.id);
        return {
          id: "pout_123",
          entity: "payout",
          amount: Math.round(input.amountRupees * 100),
          currency: "INR",
          status: "queued",
        } as any;
      },
    }
  );

  assert.equal(result.referenceId, result.payoutExecutionId);
});

test("RazorpayX API response does not mark settlement paid", async () => {
  const { client, state } = createPayoutExecutionSupabase();
  seedApprovedSettlement(state);

  const result = await initiateApprovedSettlementPayout(
    client,
    { settlementId: "settlement-1", explicitAdminAction: true },
    {
      isSettlementPayoutExecutionEnabled: () => true,
      isRazorpayXEnabled: () => true,
      isRazorpayXConfigured: () => true,
      createPayout: async () =>
        ({
          id: "pout_123",
          entity: "payout",
          amount: 840000,
          currency: "INR",
          status: "queued",
        }) as any,
    }
  );

  assert.notEqual(result.settlementStatus, "paid");
  assert.notEqual(state.host_settlements_v2[0]?.status, "paid");
});

test("processed webhook marks payout processed and settlement paid", async () => {
  const { client, state } = createPayoutExecutionSupabase();
  seedApprovedSettlement(state);
  state.host_settlements_v2[0]!.status = "payout_processing";
  state.host_payout_executions.push({
    id: "exec-1",
    settlement_id: "settlement-1",
    host_id: "host-1",
    provider: "RAZORPAYX",
    provider_payout_id: "pout_123",
    amount: 8400,
    currency: "INR",
    reference_id: "exec-1",
    status: "processing",
  });

  const result = await applyRazorpayXPayoutWebhook(client, {
    eventName: "payout.processed",
    providerPayoutId: "pout_123",
    providerStatus: "processed",
    rawPayload: {},
  });

  assert.equal(result.payoutStatus, "processed");
  assert.equal(result.settlementStatus, "paid");
  assert.equal(state.host_settlements_v2[0]?.status, "paid");
});

test("failed webhook marks failed and settlement payout_failed", async () => {
  const { client, state } = createPayoutExecutionSupabase();
  seedApprovedSettlement(state);
  state.host_settlements_v2[0]!.status = "payout_processing";
  state.host_payout_executions.push({
    id: "exec-1",
    settlement_id: "settlement-1",
    host_id: "host-1",
    provider: "RAZORPAYX",
    provider_payout_id: "pout_123",
    amount: 8400,
    currency: "INR",
    reference_id: "exec-1",
    status: "processing",
  });

  const result = await applyRazorpayXPayoutWebhook(client, {
    eventName: "payout.failed",
    providerPayoutId: "pout_123",
    providerStatus: "failed",
    rawPayload: {},
  });

  assert.equal(result.payoutStatus, "failed");
  assert.equal(result.settlementStatus, "payout_failed");
});

test("reversed webhook marks needs_review", async () => {
  const { client, state } = createPayoutExecutionSupabase();
  seedApprovedSettlement(state);
  state.host_settlements_v2[0]!.status = "paid";
  state.host_payout_executions.push({
    id: "exec-1",
    settlement_id: "settlement-1",
    host_id: "host-1",
    provider: "RAZORPAYX",
    provider_payout_id: "pout_123",
    amount: 8400,
    currency: "INR",
    reference_id: "exec-1",
    status: "processed",
  });

  const result = await applyRazorpayXPayoutWebhook(client, {
    eventName: "payout.reversed",
    providerPayoutId: "pout_123",
    providerStatus: "reversed",
    rawPayload: {},
  });

  assert.equal(result.payoutStatus, "reversed");
  assert.equal(result.settlementStatus, "needs_review");
});

test("duplicate webhook does not duplicate transition", async () => {
  const { client, state } = createPayoutExecutionSupabase();
  seedApprovedSettlement(state);
  state.host_settlements_v2[0]!.status = "paid";
  state.host_payout_executions.push({
    id: "exec-1",
    settlement_id: "settlement-1",
    host_id: "host-1",
    provider: "RAZORPAYX",
    provider_payout_id: "pout_123",
    amount: 8400,
    currency: "INR",
    reference_id: "exec-1",
    status: "processed",
  });

  const result = await applyRazorpayXPayoutWebhook(client, {
    eventName: "payout.processed",
    providerPayoutId: "pout_123",
    providerStatus: "processed",
    rawPayload: {},
  });

  assert.equal(result.ignored, true);
  assert.equal(state.host_settlements_v2[0]?.status, "paid");
});

test("auto retry remains disabled by default", () => {
  assert.equal(isPayoutAutoRetryAllowed(), false);
});

test("reference_id uses internal payout id", async () => {
  const { client, state } = createPayoutExecutionSupabase();
  seedApprovedSettlement(state);

  const result = await initiateApprovedSettlementPayout(
    client,
    { settlementId: "settlement-1", explicitAdminAction: true },
    {
      isSettlementPayoutExecutionEnabled: () => true,
      isRazorpayXEnabled: () => true,
      isRazorpayXConfigured: () => true,
      createPayout: async (input) => {
        assert.equal(input.referenceId, state.host_payout_executions[0]?.id);
        return {
          id: "pout_123",
          entity: "payout",
          amount: 840000,
          currency: "INR",
          status: "processing",
        } as any;
      },
    }
  );

  assert.equal(result.referenceId, state.host_payout_executions[0]?.id);
});

test("no checkout, refund, or invoice behavior is mutated by payout initiation", async () => {
  const { client, state } = createPayoutExecutionSupabase();
  seedApprovedSettlement(state);
  const refundCountBefore = state.refund_requests.length;

  await initiateApprovedSettlementPayout(
    client,
    { settlementId: "settlement-1", explicitAdminAction: true },
    {
      isSettlementPayoutExecutionEnabled: () => true,
      isRazorpayXEnabled: () => true,
      isRazorpayXConfigured: () => true,
      createPayout: async () =>
        ({
          id: "pout_123",
          entity: "payout",
          amount: 840000,
          currency: "INR",
          status: "queued",
        }) as any,
    }
  );

  assert.equal(state.bookings_v2[0]?.status, "completed");
  assert.equal(state.refund_requests.length, refundCountBefore);
});
