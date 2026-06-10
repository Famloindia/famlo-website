import assert from "node:assert/strict";
import test from "node:test";

import { onboardHostPayoutAccount } from "@/lib/finance/payout-account-engine";

function createPayoutSupabase() {
  const state = {
    host_tax_details: [] as Array<Record<string, unknown>>,
    host_payout_accounts: [] as Array<Record<string, unknown>>,
  };

  function matches(row: Record<string, unknown>, filters: Array<{ column: string; value: unknown; op: "eq" | "neq" }>) {
    return filters.every((filter) =>
      filter.op === "eq" ? row[filter.column] === filter.value : row[filter.column] !== filter.value
    );
  }

  return {
    state,
    client: {
      from(table: string) {
        const filters: Array<{ column: string; value: unknown; op: "eq" | "neq" }> = [];
        let orderedBy: { column: string; ascending: boolean } | null = null;
        return {
          select() {
            return this;
          },
          eq(column: string, value: unknown) {
            filters.push({ column, value, op: "eq" });
            return this;
          },
          neq(column: string, value: unknown) {
            filters.push({ column, value, op: "neq" });
            return this;
          },
          order(column: string, options?: { ascending?: boolean }) {
            orderedBy = { column, ascending: options?.ascending ?? true };
            return this;
          },
          async maybeSingle() {
            let rows = ((state as Record<string, Array<Record<string, unknown>>>)[table] ?? []).filter((candidate) =>
              matches(candidate, filters)
            );
            if (orderedBy) {
              rows = [...rows].sort((left, right) => {
                const leftValue = String(left[orderedBy!.column] ?? "");
                const rightValue = String(right[orderedBy!.column] ?? "");
                return orderedBy!.ascending ? leftValue.localeCompare(rightValue) : rightValue.localeCompare(leftValue);
              });
            }
            return { data: rows[0] ?? null, error: null };
          },
          async then(resolve: (value: { data: Array<Record<string, unknown>>; error: null }) => void) {
            let rows = ((state as Record<string, Array<Record<string, unknown>>>)[table] ?? []).filter((candidate) =>
              matches(candidate, filters)
            );
            if (orderedBy) {
              rows = [...rows].sort((left, right) => {
                const leftValue = String(left[orderedBy!.column] ?? "");
                const rightValue = String(right[orderedBy!.column] ?? "");
                return orderedBy!.ascending ? leftValue.localeCompare(rightValue) : rightValue.localeCompare(leftValue);
              });
            }
            resolve({ data: rows, error: null });
          },
          insert(payload: Record<string, unknown>) {
            return {
              select() {
                return {
                  async single() {
                    const rows = (state as Record<string, Array<Record<string, unknown>>>)[table];
                    const row = {
                      id: `${table}-${rows.length + 1}`,
                      created_at: `2026-05-21T00:00:0${rows.length}.000Z`,
                      updated_at: `2026-05-21T00:00:0${rows.length}.000Z`,
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
                filters.push({ column, value, op: "eq" });
                return {
                  eq(nextColumn: string, nextValue: unknown) {
                    filters.push({ column: nextColumn, value: nextValue, op: "eq" });
                    return this;
                  },
                  neq(nextColumn: string, nextValue: unknown) {
                    filters.push({ column: nextColumn, value: nextValue, op: "neq" });
                    return this;
                  },
                  select() {
                    return {
                      async single() {
                        const rows = (state as Record<string, Array<Record<string, unknown>>>)[table];
                        const row = rows.find((candidate) => matches(candidate, filters));
                        if (!row) return { data: null, error: new Error("Row not found") };
                        Object.assign(row, payload);
                        return { data: row, error: null };
                      },
                    };
                  },
                  async then(resolve: (value: { error: null }) => void) {
                    const rows = (state as Record<string, Array<Record<string, unknown>>>)[table];
                    rows.forEach((row) => {
                      if (matches(row, filters)) Object.assign(row, payload);
                    });
                    resolve({ error: null });
                  },
                };
              },
            };
          },
        };
      },
    } as any,
  };
}

test("missing PAN blocks activation", async () => {
  const { client, state } = createPayoutSupabase();

  const result = await onboardHostPayoutAccount(
    client,
    {
      hostId: "host-1",
      hostUserId: "user-1",
      legalName: "Host One",
      bankAccountNumber: "123456789012",
      ifsc: "HDFC0001234",
    },
    {
      isRazorpayXEnabled: () => true,
      isPayoutAccountCreationEnabled: () => true,
      isPayoutAccountValidationEnabled: () => false,
      isRazorpayXConfigured: () => true,
    }
  );

  assert.equal(result.isActive, false);
  assert.match(result.payoutBlockedReason ?? "", /PAN/i);
  assert.equal(state.host_payout_accounts.length, 1);
});

test("missing bank or UPI blocks activation", async () => {
  const { client, state } = createPayoutSupabase();
  state.host_tax_details.push({
    user_id: "user-1",
    pan_holder_name: "Host One",
    verification_status: "verified",
    is_verified: true,
  });

  const result = await onboardHostPayoutAccount(client, {
    hostId: "host-1",
    hostUserId: "user-1",
    legalName: "Host One",
  });

  assert.equal(result.isActive, false);
  assert.match(result.payoutBlockedReason ?? "", /bank account \+ IFSC or UPI/i);
});

test("flags off prevents provider calls", async () => {
  const { client, state } = createPayoutSupabase();
  state.host_tax_details.push({
    user_id: "user-1",
    pan_holder_name: "Host One",
    verification_status: "verified",
    is_verified: true,
  });
  let contactCalls = 0;
  let fundCalls = 0;

  const result = await onboardHostPayoutAccount(
    client,
    {
      hostId: "host-1",
      hostUserId: "user-1",
      legalName: "Host One",
      bankAccountNumber: "123456789012",
      ifsc: "HDFC0001234",
    },
    {
      isRazorpayXEnabled: () => false,
      isPayoutAccountCreationEnabled: () => false,
      isPayoutAccountValidationEnabled: () => false,
      isRazorpayXConfigured: () => true,
      createContact: async () => {
        contactCalls += 1;
        throw new Error("should not call");
      },
      createFundAccount: async () => {
        fundCalls += 1;
        throw new Error("should not call");
      },
    }
  );

  assert.equal(result.providerCallsAttempted, false);
  assert.equal(result.validationStatus, "disabled");
  assert.equal(contactCalls, 0);
  assert.equal(fundCalls, 0);
});

test("provider contact and fund account creation are stored correctly", async () => {
  const { client, state } = createPayoutSupabase();
  state.host_tax_details.push({
    user_id: "user-1",
    pan_holder_name: "Host One",
    verification_status: "approved",
    is_verified: false,
  });

  const result = await onboardHostPayoutAccount(
    client,
    {
      hostId: "host-1",
      hostUserId: "user-1",
      legalName: "Host One",
      bankAccountNumber: "123456789012",
      ifsc: "HDFC0001234",
    },
    {
      isRazorpayXEnabled: () => true,
      isPayoutAccountCreationEnabled: () => true,
      isPayoutAccountValidationEnabled: () => false,
      isRazorpayXConfigured: () => true,
      createContact: async () =>
        ({
          id: "cont_123",
          entity: "contact",
          name: "Host One",
        }) as any,
      createFundAccount: async () =>
        ({
          id: "fa_123",
          entity: "fund_account",
          contact_id: "cont_123",
          account_type: "bank_account",
        }) as any,
    }
  );

  assert.equal(result.isActive, true);
  assert.equal(result.providerContactId, "cont_123");
  assert.equal(result.providerFundAccountId, "fa_123");
  assert.equal(state.host_payout_accounts[0]?.provider_contact_id, "cont_123");
  assert.equal(state.host_payout_accounts[0]?.provider_fund_account_id, "fa_123");
});

test("validation disabled does not mark validated", async () => {
  const { client, state } = createPayoutSupabase();
  state.host_tax_details.push({
    user_id: "user-1",
    pan_holder_name: "Host One",
    verification_status: "verified",
    is_verified: true,
  });

  const result = await onboardHostPayoutAccount(
    client,
    {
      hostId: "host-1",
      hostUserId: "user-1",
      legalName: "Host One",
      vpa: "host@upi",
    },
    {
      isRazorpayXEnabled: () => true,
      isPayoutAccountCreationEnabled: () => true,
      isPayoutAccountValidationEnabled: () => false,
      isRazorpayXConfigured: () => true,
      createContact: async () =>
        ({
          id: "cont_123",
          entity: "contact",
          name: "Host One",
        }) as any,
      createFundAccount: async () =>
        ({
          id: "fa_123",
          entity: "fund_account",
          contact_id: "cont_123",
          account_type: "vpa",
        }) as any,
    }
  );

  assert.equal(result.validationStatus, "validation_unavailable");
});

test("duplicate onboarding does not create second active account", async () => {
  const { client, state } = createPayoutSupabase();
  state.host_tax_details.push({
    user_id: "user-1",
    pan_holder_name: "Host One",
    verification_status: "verified",
    is_verified: true,
  });

  const dependencies = {
    isRazorpayXEnabled: () => true,
    isPayoutAccountCreationEnabled: () => true,
    isPayoutAccountValidationEnabled: () => false,
    isRazorpayXConfigured: () => true,
    createContact: async () =>
      ({
        id: "cont_123",
        entity: "contact",
        name: "Host One",
      }) as any,
    createFundAccount: async () =>
      ({
        id: "fa_123",
        entity: "fund_account",
        contact_id: "cont_123",
        account_type: "bank_account",
      }) as any,
  };

  await onboardHostPayoutAccount(
    client,
    {
      hostId: "host-1",
      hostUserId: "user-1",
      legalName: "Host One",
      bankAccountNumber: "123456789012",
      ifsc: "HDFC0001234",
    },
    dependencies
  );

  const second = await onboardHostPayoutAccount(
    client,
    {
      hostId: "host-1",
      hostUserId: "user-1",
      legalName: "Host One",
      bankAccountNumber: "123456789012",
      ifsc: "HDFC0001234",
    },
    dependencies
  );

  assert.equal(second.reusedExisting, true);
  assert.equal(state.host_payout_accounts.length, 1);
  assert.equal(state.host_payout_accounts.filter((row) => row.is_active === true).length, 1);
});

test("provider failure leaves account inactive", async () => {
  const { client, state } = createPayoutSupabase();
  state.host_tax_details.push({
    user_id: "user-1",
    pan_holder_name: "Host One",
    verification_status: "verified",
    is_verified: true,
  });

  const result = await onboardHostPayoutAccount(
    client,
    {
      hostId: "host-1",
      hostUserId: "user-1",
      legalName: "Host One",
      bankAccountNumber: "123456789012",
      ifsc: "HDFC0001234",
    },
    {
      isRazorpayXEnabled: () => true,
      isPayoutAccountCreationEnabled: () => true,
      isPayoutAccountValidationEnabled: () => false,
      isRazorpayXConfigured: () => true,
      createContact: async () =>
        ({
          id: "cont_123",
          entity: "contact",
          name: "Host One",
        }) as any,
      createFundAccount: async () => {
        throw new Error("fund account failed");
      },
    }
  );

  assert.equal(result.isActive, false);
  assert.equal(result.validationStatus, "failed");
  assert.equal(state.host_payout_accounts[0]?.is_active, false);
});

test("account number is stored masked", async () => {
  const { client, state } = createPayoutSupabase();
  state.host_tax_details.push({
    user_id: "user-1",
    pan_holder_name: "Host One",
    verification_status: "verified",
    is_verified: true,
  });

  const result = await onboardHostPayoutAccount(client, {
    hostId: "host-1",
    hostUserId: "user-1",
    legalName: "Host One",
    bankAccountNumber: "123456789012",
    ifsc: "HDFC0001234",
  });

  assert.equal(result.accountNumberMasked?.includes("9012"), true);
  assert.equal(result.accountNumberMasked?.includes("123456789012"), false);
  assert.equal(String(state.host_payout_accounts[0]?.account_number_masked).includes("123456789012"), false);
});

test("no payout execution function is called", async () => {
  const { client, state } = createPayoutSupabase();
  state.host_tax_details.push({
    user_id: "user-1",
    pan_holder_name: "Host One",
    verification_status: "verified",
    is_verified: true,
  });

  let payoutExecutionCalls = 0;
  await onboardHostPayoutAccount(
    client,
    {
      hostId: "host-1",
      hostUserId: "user-1",
      legalName: "Host One",
      vpa: "host@upi",
    },
    {
      isRazorpayXEnabled: () => true,
      isPayoutAccountCreationEnabled: () => false,
      isPayoutAccountValidationEnabled: () => false,
      isRazorpayXConfigured: () => true,
      createContact: async () => {
        payoutExecutionCalls += 100;
        throw new Error("should not run");
      },
      createFundAccount: async () => {
        payoutExecutionCalls += 100;
        throw new Error("should not run");
      },
    }
  );

  assert.equal(payoutExecutionCalls, 0);
});
