import assert from "node:assert/strict";
import test from "node:test";

import { buildAdminFamloProAccessView } from "@/lib/pro-billing/admin-access";
import {
  buildHostProBillingDraft,
  createHostProAutopayCheckout,
  createHostProBillingCheckout,
  deriveProAccessStatus,
  markExpiredProSubscriptionsPaused,
  processHostProAutopayWebhook,
} from "@/lib/pro-billing/service";

type Row = Record<string, unknown>;

process.env.FAMLO_LEGAL_ENTITY_NAME ??= "Famlo Private Limited";
process.env.FAMLO_GSTIN ??= "08ABCDE1234F1Z5";
process.env.FAMLO_LEGAL_ADDRESS ??= "Jaipur, Rajasthan";

function createSupabaseMock() {
  const state = {
    families: [] as Row[],
    stay_units_v2: [] as Row[],
    host_pro_billing_orders: [] as Row[],
    host_pro_billing_order_properties: [] as Row[],
    host_pro_billing_order_rooms: [] as Row[],
    host_pro_subscriptions: [] as Row[],
    host_pro_subscription_rooms: [] as Row[],
    host_pro_invoices: [] as Row[],
    host_gst_profiles: [] as Row[],
    finance_email_deliveries: [] as Row[],
    users: [] as Row[],
    pro_razorpay_plans: [] as Row[],
  };

  function withJoinedRows(table: string, rows: Row[]): Row[] {
    if (table !== "host_pro_subscription_rooms") return rows;
    return rows.map((row) => ({
      ...row,
      host_pro_subscriptions:
        state.host_pro_subscriptions.find((subscription) => subscription.id === row.subscription_id) ?? null,
    }));
  }

  function createFilterMatcher(filters: Array<{ column: string; op: "eq" | "in"; value: unknown }>) {
    return (row: Row) =>
      filters.every((filter) => {
        if (filter.op === "eq") return row[filter.column] === filter.value;
        if (!Array.isArray(filter.value)) return false;
        return filter.value.includes(row[filter.column]);
      });
  }

  function sortRows(rows: Row[], orderColumn: string | null, ascending: boolean) {
    if (!orderColumn) return rows;
    return [...rows].sort((left, right) => {
      const leftValue = left[orderColumn];
      const rightValue = right[orderColumn];
      if (leftValue === rightValue) return 0;
      if (leftValue == null) return 1;
      if (rightValue == null) return -1;
      return ascending ? String(leftValue).localeCompare(String(rightValue)) : String(rightValue).localeCompare(String(leftValue));
    });
  }

  function dedupeRows(rows: Row[]) {
    const byId = new Map<unknown, Row>();
    const withoutIds: Row[] = [];
    for (const row of rows) {
      if (row.id == null) {
        withoutIds.push(row);
        continue;
      }
      if (!byId.has(row.id)) byId.set(row.id, row);
    }
    return [...byId.values(), ...withoutIds];
  }

  return {
    state,
    client: {
      from(table: keyof typeof state) {
        const filters: Array<{ column: string; op: "eq" | "in"; value: unknown }> = [];
        let orderColumn: string | null = null;
        let ascending = true;
        let limitCount: number | null = null;
        const rows = ((state as Record<string, Row[]>)[String(table)] ??= []);

        const selectBuilder: any = {
          select() {
            return this;
          },
          eq(column: string, value: unknown) {
            filters.push({ column, op: "eq", value });
            return this;
          },
          in(column: string, value: unknown[]) {
            filters.push({ column, op: "in", value });
            return this;
          },
          is(column: string, value: unknown) {
            filters.push({ column, op: "eq", value });
            return this;
          },
          order(column: string, options?: { ascending?: boolean }) {
            orderColumn = column;
            ascending = options?.ascending !== false;
            return this;
          },
          limit(value: number) {
            limitCount = value;
            return this;
          },
          async maybeSingle() {
            const matcher = createFilterMatcher(filters);
            const filtered = sortRows(withJoinedRows(table, dedupeRows(rows.filter(matcher))), orderColumn, ascending);
            return { data: filtered[0] ?? null, error: null };
          },
          async single() {
            return this.maybeSingle();
          },
          async then(resolve: (value: { data: Row[]; error: null }) => unknown) {
            const matcher = createFilterMatcher(filters);
            const filtered = sortRows(withJoinedRows(table, dedupeRows(rows.filter(matcher))), orderColumn, ascending);
            const limited = limitCount == null ? filtered : filtered.slice(0, limitCount);
            return resolve({ data: limited, error: null });
          },
        };

        const updateBuilder = (payload: Row) => {
          const updateFilters: Array<{ column: string; op: "eq" | "in"; value: unknown }> = [];
          const applyUpdate = () => {
            const matcher = createFilterMatcher(updateFilters);
            return rows.filter(matcher).map((row) => Object.assign(row, payload));
          };
          return {
            eq(column: string, value: unknown) {
              updateFilters.push({ column, op: "eq", value });
              return this;
            },
            in(column: string, value: unknown[]) {
              updateFilters.push({ column, op: "in", value });
              return this;
            },
            select() {
              const updated = applyUpdate();
              return {
                async single() {
                  return { data: updated[0] ?? null, error: null };
                },
              };
            },
            async maybeSingle() {
              const row = applyUpdate()[0] ?? null;
              if (row) Object.assign(row, payload);
              return { data: row, error: null };
            },
            async then(resolve: (value: { error: null }) => unknown) {
              const matcher = createFilterMatcher(updateFilters);
              rows.filter(matcher).forEach((row) => Object.assign(row, payload));
              return resolve({ error: null });
            },
          };
        };

        const deleteBuilder = () => {
          const deleteFilters: Array<{ column: string; op: "eq" | "in"; value: unknown }> = [];
          return {
            eq(column: string, value: unknown) {
              deleteFilters.push({ column, op: "eq", value });
              return this;
            },
            async then(resolve: (value: { error: null }) => unknown) {
              const matcher = createFilterMatcher(deleteFilters);
              const remaining = rows.filter((row) => !matcher(row));
              rows.splice(0, rows.length, ...remaining);
              return resolve({ error: null });
            },
          };
        };

        return {
          select() {
            return selectBuilder;
          },
          eq(column: string, value: unknown) {
            return selectBuilder.eq(column, value);
          },
          in(column: string, value: unknown[]) {
            return selectBuilder.in(column, value);
          },
          insert(payload: Row | Row[]) {
            const inputRows = Array.isArray(payload) ? payload : [payload];
            const insertedRows = inputRows.map((row, index) => {
              const nextRow = { id: row.id ?? `${String(table)}-${rows.length + index + 1}`, ...row };
              rows.push(nextRow);
              return nextRow;
            });
            return {
              data: insertedRows,
              error: null,
              select() {
                return {
                async single() {
                  return { data: insertedRows[0] ?? null, error: null };
                },
                async maybeSingle() {
                  return { data: insertedRows[0] ?? null, error: null };
                },
              };
            },
            };
          },
          update(payload: Row) {
            return updateBuilder(payload);
          },
          delete() {
            return deleteBuilder();
          },
        };
      },
    } as any,
  };
}

function withEnv(env: Record<string, string>, fn: () => Promise<void> | void) {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(env)) {
    previous.set(key, process.env[key]);
    process.env[key] = value;
  }
  return Promise.resolve(fn()).finally(() => {
    for (const [key, value] of previous.entries()) {
      if (typeof value === "undefined") {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });
}

function seedWorkspace(state: ReturnType<typeof createSupabaseMock>["state"]) {
  state.families.push(
    { id: "fam-a", user_id: "host-1", name: "Alpha", property_name: "Alpha Stay", host_id: "A1", city: "Goa", state: "Goa", is_active: true, created_at: "2026-05-20T10:00:00.000Z" },
    { id: "fam-b", user_id: "host-1", name: "Beta", property_name: "Beta Stay", host_id: "B1", city: "Goa", state: "Goa", is_active: true, created_at: "2026-05-19T10:00:00.000Z" },
  );
  state.stay_units_v2.push(
    { id: "a-room-1", legacy_family_id: "fam-a", unit_key: "a-room-1", name: "A Room 1", is_active: true, sort_order: 1 },
    { id: "a-room-2", legacy_family_id: "fam-a", unit_key: "a-room-2", name: "A Room 2", is_active: true, sort_order: 2 },
    { id: "b-room-1", legacy_family_id: "fam-b", unit_key: "b-room-1", name: "B Room 1", is_active: true, sort_order: 1 },
  );
  state.users.push({ id: "host-1", email: "host@example.com" });
}

test("autopay enabled creates and reuses Razorpay plan and returns subscription checkout", async () => {
  const { client, state } = createSupabaseMock();
  seedWorkspace(state);

  await withEnv(
    {
      FAMLO_PRO_AUTOPAY_ENABLED: "true",
      FAMLO_PRO_AUTOPAY_REQUIRE_SUBSCRIPTION: "true",
      RAZORPAY_KEY_ID: "rzp_test_key",
      RAZORPAY_KEY_SECRET: "secret",
      RAZORPAY_WEBHOOK_SECRET: "webhook",
    },
    async () => {
      const createPlan = async () => ({
        id: "plan_1",
        entity: "plan" as const,
        period: "monthly",
        interval: 1,
        item: { amount: 58900, currency: "INR", name: "Famlo Pro Monthly ₹589" },
      });
      const createSubscription = async () => ({
        id: "sub_1",
        entity: "subscription" as const,
        plan_id: "plan_1",
        status: "created",
        charge_at: Math.floor(Date.parse("2026-06-23T10:00:00.000Z") / 1000),
      });

      const first = await createHostProAutopayCheckout(
        client,
        {
          hostUserId: "host-1",
          sourceFamilyId: "fam-a",
          selections: [{ familyId: "fam-a", roomIds: ["a-room-1"] }],
        },
        { createPlan, createSubscription }
      );

      const second = await createHostProAutopayCheckout(
        client,
        {
          hostUserId: "host-1",
          sourceFamilyId: "fam-a",
          selections: [{ familyId: "fam-a", roomIds: ["a-room-1"] }],
        },
        {
          createPlan,
          createSubscription: async () => ({
            id: "sub_2",
            entity: "subscription" as const,
            plan_id: "plan_1",
            status: "created",
            charge_at: Math.floor(Date.parse("2026-06-23T10:00:00.000Z") / 1000),
          }),
        }
      );

      assert.equal(first.checkoutMode, "subscription");
      assert.equal(first.subscription.id, "sub_1");
      assert.equal(state.pro_razorpay_plans.length, 1);
      assert.equal(second.subscription.id, "sub_2");
      assert.equal(state.pro_razorpay_plans.length, 1);
      assert.equal(state.host_pro_billing_orders[0]?.gateway_subscription_id, "sub_1");
    }
  );
});

test("first successful autopay charge activates Pro and duplicate charge stays idempotent", async () => {
  const { client, state } = createSupabaseMock();
  seedWorkspace(state);
  let emailCount = 0;

  await withEnv(
    {
      FAMLO_PRO_AUTOPAY_ENABLED: "true",
      FAMLO_PRO_AUTOPAY_REQUIRE_SUBSCRIPTION: "true",
      RAZORPAY_KEY_ID: "rzp_test_key",
      RAZORPAY_KEY_SECRET: "secret",
      RAZORPAY_WEBHOOK_SECRET: "webhook",
    },
    async () => {
      const checkout = await createHostProAutopayCheckout(
        client,
        {
          hostUserId: "host-1",
          sourceFamilyId: "fam-a",
          selections: [{ familyId: "fam-a", roomIds: ["a-room-1"] }],
        },
        {
          createPlan: async () => ({
            id: "plan_1",
            entity: "plan" as const,
            period: "monthly",
            interval: 1,
            item: { amount: 58900, currency: "INR", name: "Famlo Pro Monthly ₹589" },
          }),
          createSubscription: async () => ({
            id: "sub_1",
            entity: "subscription" as const,
            plan_id: "plan_1",
            status: "created",
            charge_at: Math.floor(Date.parse("2026-06-23T10:00:00.000Z") / 1000),
          }),
        }
      );

      const first = await processHostProAutopayWebhook(
        client,
        {
          eventName: "subscription.charged",
          providerEventId: "evt_1",
          razorpaySubscriptionId: "sub_1",
          razorpayPaymentId: "pay_1",
          paymentStatus: "captured",
          subscriptionStatus: "active",
          amountPaise: 58900,
          paidAtIso: "2026-05-24T10:00:00.000Z",
          chargeAtIso: "2026-06-23T10:00:00.000Z",
          notes: { host_user_id: "host-1" },
        },
        {
          sendInvoiceEmail: async () => {
            emailCount += 1;
            return { deliveryId: `delivery-${emailCount}`, providerMessageId: `msg-${emailCount}` };
          },
        }
      );
      const duplicate = await processHostProAutopayWebhook(
        client,
        {
          eventName: "subscription.charged",
          providerEventId: "evt_1_dup",
          razorpaySubscriptionId: "sub_1",
          razorpayPaymentId: "pay_1",
          paymentStatus: "captured",
          subscriptionStatus: "active",
          amountPaise: 58900,
          paidAtIso: "2026-05-24T10:00:00.000Z",
          chargeAtIso: "2026-06-23T10:00:00.000Z",
          notes: { host_user_id: "host-1" },
        },
        {
          sendInvoiceEmail: async () => {
            emailCount += 1;
            return { deliveryId: `delivery-${emailCount}`, providerMessageId: `msg-${emailCount}` };
          },
        }
      );

      assert.equal(first.action, "charge_finalized");
      assert.equal(duplicate.action, "charge_duplicate");
      assert.equal(state.host_pro_invoices.length, 1);
      assert.equal(emailCount, 1);
      assert.equal(state.host_pro_subscriptions.length, 1);
      assert.equal(state.host_pro_subscriptions[0]?.status, "active");
      assert.equal(state.host_pro_subscriptions[0]?.current_period_end, "2026-06-23T10:00:00.000Z");
      assert.equal(checkout.billingOrderId, state.host_pro_billing_orders[0]?.id);
    }
  );
});

test("recurring charged webhook extends paid period by 30 days", async () => {
  const { client, state } = createSupabaseMock();
  seedWorkspace(state);
  state.host_pro_billing_orders.push({
    id: "order-1",
    host_user_id: "host-1",
    source_family_id: "fam-a",
    status: "paid",
    property_count: 1,
    room_count: 1,
    raw_subtotal_amount: 300,
    subtotal_amount: 499,
    gst_amount: 90,
    total_amount: 589,
    scope_hash: "scope",
    gateway: "razorpay",
    billing_mode: "autopay_subscription",
    gateway_subscription_id: "sub_1",
    gateway_plan_id: "plan_1",
    gateway_payment_id: "pay_old",
    payment_captured_at: "2026-05-24T10:00:00.000Z",
    metadata: { autopay_enabled: true },
  });
  state.host_pro_billing_order_properties.push({
    id: "prop-1",
    billing_order_id: "order-1",
    family_id: "fam-a",
    property_name: "Alpha Stay",
    host_code: "A1",
    city: "Goa",
    state: "Goa",
    selected_room_count: 1,
  });
  state.host_pro_billing_order_rooms.push({
    id: "room-1",
    billing_order_id: "order-1",
    family_id: "fam-a",
    stay_unit_id: "a-room-1",
    room_name: "A Room 1",
  });
  state.host_pro_subscriptions.push({
    id: "sub-row-1",
    family_id: "fam-a",
    host_user_id: "host-1",
    status: "active",
    current_period_start: "2026-05-24T10:00:00.000Z",
    current_period_end: "2026-06-23T10:00:00.000Z",
    grace_until: "2026-06-30T10:00:00.000Z",
    billing_order_id: "order-1",
    billing_mode: "autopay_subscription",
    autopay_enabled: true,
    razorpay_plan_id: "plan_1",
    razorpay_subscription_id: "sub_1",
    provider_subscription_id: "sub_1",
    room_count: 1,
    billing_subtotal_amount: 499,
    billing_gst_amount: 90,
    billing_total_amount: 589,
    metadata: { autopay_enabled: true, property_name: "Alpha Stay" },
  });
  state.host_pro_subscription_rooms.push({
    id: "sub-room-1",
    subscription_id: "sub-row-1",
    family_id: "fam-a",
    stay_unit_id: "a-room-1",
    room_name: "A Room 1",
    status: "active",
  });

  await processHostProAutopayWebhook(client, {
    eventName: "subscription.charged",
    providerEventId: "evt_2",
    razorpaySubscriptionId: "sub_1",
    razorpayPaymentId: "pay_new",
    paymentStatus: "captured",
    subscriptionStatus: "active",
    amountPaise: 58900,
    paidAtIso: "2026-06-20T10:00:00.000Z",
    chargeAtIso: "2026-07-23T10:00:00.000Z",
    notes: { host_user_id: "host-1" },
  }, {
    sendInvoiceEmail: async () => ({ deliveryId: "delivery-recurring", providerMessageId: "msg-recurring" }),
  });

  assert.equal(state.host_pro_billing_orders.length, 2);
  assert.equal(state.host_pro_subscriptions[0]?.current_period_end, "2026-07-23T10:00:00.000Z");
  assert.equal(state.host_pro_invoices.length, 1);
});

test("failed and halted autopay states preserve grace before pause", async () => {
  const { client, state } = createSupabaseMock();
  seedWorkspace(state);
  state.host_pro_subscriptions.push(
    {
      id: "sub-row-1",
      family_id: "fam-a",
      host_user_id: "host-1",
      status: "active",
      current_period_start: "2026-05-24T10:00:00.000Z",
      current_period_end: "2026-06-23T10:00:00.000Z",
      grace_until: "2026-06-30T10:00:00.000Z",
      billing_mode: "autopay_subscription",
      autopay_enabled: true,
      razorpay_subscription_id: "sub_1",
    },
    {
      id: "sub-row-2",
      family_id: "fam-b",
      host_user_id: "host-1",
      status: "active",
      current_period_start: "2026-05-24T10:00:00.000Z",
      current_period_end: "2026-06-23T10:00:00.000Z",
      grace_until: "2026-06-30T10:00:00.000Z",
      billing_mode: "autopay_subscription",
      autopay_enabled: true,
      razorpay_subscription_id: "sub_2",
    }
  );

  await processHostProAutopayWebhook(client, {
    eventName: "payment.failed",
    providerEventId: "evt_fail",
    razorpaySubscriptionId: "sub_1",
    razorpayPaymentId: "pay_fail",
    subscriptionStatus: "pending",
    paidAtIso: "2026-06-24T10:00:00.000Z",
    failureReason: "card_declined",
    notes: { host_user_id: "host-1" },
  });
  await processHostProAutopayWebhook(client, {
    eventName: "subscription.halted",
    providerEventId: "evt_halt",
    razorpaySubscriptionId: "sub_2",
    razorpayPaymentId: null,
    subscriptionStatus: "halted",
    paidAtIso: "2026-06-24T10:00:00.000Z",
    failureReason: "mandate_revoked",
    notes: { host_user_id: "host-1" },
  });

  assert.equal(deriveProAccessStatus(state.host_pro_subscriptions[0] as any, { now: new Date("2026-06-25T10:00:00.000Z") }).status, "payment_failed");
  assert.equal(deriveProAccessStatus(state.host_pro_subscriptions[1] as any, { now: new Date("2026-06-25T10:00:00.000Z") }).status, "halted");

  await markExpiredProSubscriptionsPaused(client, new Date("2026-07-02T10:00:00.000Z"));
  assert.equal(state.host_pro_subscriptions[0]?.status, "paused");
  assert.equal(state.host_pro_subscriptions[1]?.status, "paused");
});

test("cancelled autopay remains usable until paid period end and manual order fallback still works", async () => {
  const cancelled = deriveProAccessStatus(
    {
      status: "cancelled",
      current_period_start: "2026-05-24T10:00:00.000Z",
      current_period_end: "2026-06-23T10:00:00.000Z",
      grace_until: "2026-06-30T10:00:00.000Z",
    },
    { now: new Date("2026-06-01T10:00:00.000Z") }
  );
  assert.equal(cancelled.allowed, true);

  const { client, state } = createSupabaseMock();
  seedWorkspace(state);
  await withEnv(
    {
      FAMLO_PRO_AUTOPAY_ENABLED: "true",
      RAZORPAY_KEY_ID: "rzp_test_key",
      RAZORPAY_KEY_SECRET: "secret",
      RAZORPAY_WEBHOOK_SECRET: "webhook",
    },
    async () => {
      const checkout = await createHostProBillingCheckout(
        client,
        {
          hostUserId: "host-1",
          sourceFamilyId: "fam-a",
          selections: [{ familyId: "fam-a", roomIds: ["a-room-1"] }],
        },
        {
          createOrder: async () =>
            ({
              id: "order_rzp_manual",
              entity: "order",
              amount: 58900,
              amount_paid: 0,
              amount_due: 58900,
              currency: "INR",
              receipt: "manual",
              status: "created",
              attempts: 0,
              created_at: 1,
            }) as any,
        }
      );
      assert.equal(checkout.checkoutMode, "order");
      assert.equal(checkout.autopayEnabled, false);
    }
  );
});

test("admin summary shows autopay and manual subscription health counts and Pro GST", () => {
  const result = buildAdminFamloProAccessView({
    subscriptions: [
      { id: "sub-1", family_id: "fam-a", host_user_id: "host-1", primary_pro_property_id: "fam-a", status: "active", current_period_end: "2026-06-23T10:00:00.000Z", grace_until: "2026-06-30T10:00:00.000Z", billing_mode: "autopay_subscription", autopay_enabled: true, mandate_status: "active", razorpay_subscription_id: "sub_12345678", created_at: "2026-05-24T10:00:00.000Z" },
      { id: "sub-2", family_id: "fam-b", host_user_id: "host-2", primary_pro_property_id: "fam-b", status: "halted", current_period_end: "2026-06-23T10:00:00.000Z", grace_until: "2026-06-30T10:00:00.000Z", billing_mode: "autopay_subscription", autopay_enabled: true, payment_failure_reason: "mandate_revoked", created_at: "2026-05-24T10:00:00.000Z" },
      { id: "sub-3", family_id: "fam-c", host_user_id: "host-3", primary_pro_property_id: "fam-c", status: "paused", current_period_end: "2026-05-20T10:00:00.000Z", grace_until: "2026-05-27T10:00:00.000Z", billing_mode: "manual_order", autopay_enabled: false, created_at: "2026-04-24T10:00:00.000Z" },
    ],
    families: [
      { id: "fam-a", property_name: "Alpha", user_id: "host-1", is_active: true, created_at: "2026-01-01T00:00:00.000Z" },
      { id: "fam-b", property_name: "Beta", user_id: "host-2", is_active: true, created_at: "2026-01-01T00:00:00.000Z" },
      { id: "fam-c", property_name: "Gamma", user_id: "host-3", is_active: true, created_at: "2026-01-01T00:00:00.000Z" },
    ],
    stayUnits: [
      { id: "room-a", legacy_family_id: "fam-a", is_active: true },
      { id: "room-b", legacy_family_id: "fam-b", is_active: true },
      { id: "room-c", legacy_family_id: "fam-c", is_active: true },
    ],
    hosts: [],
    users: [],
    orders: [
      { id: "order-1", host_user_id: "host-1", status: "paid", subtotal_amount: 499, gst_amount: 90, total_amount: 589, billing_mode: "autopay_subscription", gateway_subscription_id: "sub_12345678" },
      { id: "order-2", host_user_id: "host-3", status: "paid", subtotal_amount: 499, gst_amount: 90, total_amount: 589, billing_mode: "manual_order" },
    ],
    invoices: [],
  });

  assert.equal(result.summary.proRevenue, 998);
  assert.equal(result.summary.proGst, 180);
  assert.equal(result.summary.autopaySubscriptions, 2);
  assert.equal(result.summary.manualSubscriptions, 1);
  assert.equal(result.summary.haltedSubscriptions, 1);
});
