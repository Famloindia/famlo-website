import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";

import {
  buildFamloProPostPaymentRedirectHref,
  buildFamloProDashboardHref,
  buildFamloProDraftRequest,
  buildFamloProVerifyRequest,
  canOpenFamloProDashboard,
  deriveFamloProBuyUiState,
  FAMLO_PRO_BUY_BANNER_HEADING_COLOR,
  FAMLO_PRO_FEATURE_CARDS,
  FAMLO_PRO_BUY_BANNER_SUBTITLE,
  FAMLO_PRO_BUY_BANNER_TITLE,
  isFamloProBuyButtonDisabled,
  FAMLO_PRO_VALUE_CARDS,
} from "@/lib/pro-billing/buy-page";
import {
  isFamloProAutopayEnabled,
  normalizeProBillingDurationMonths,
  PRO_BILLING_GRACE_PERIOD_DAYS,
  PRO_BILLING_PERIOD_DAYS,
} from "@/lib/pro-billing/config";
import { buildProBillingChargeQuote, buildProBillingPricingBreakdown } from "@/lib/pro-billing/pricing";
import {
  assertPaidHostProAddonOrderAvailable,
  buildHostProAddonQuote,
  buildHostProBillingDraft,
  buildProratedProAddonQuote,
  canUseProFeature,
  consumePaidHostProAddonOrder,
  computeProRenewalWindow,
  createHostProAddonCheckout,
  createHostProBillingCheckout,
  deriveProAccessStatus,
  finalizeCapturedHostProBillingOrder,
  getFamloProEntitlement,
  resetHostProTestingState,
  deactivateHostProAccess,
  markExpiredProSubscriptionsPaused,
  processHostProAutopayWebhook,
  verifyAndFinalizeHostProAddonOrder,
  verifyAndFinalizeHostProBillingOrder,
} from "@/lib/pro-billing/service";
import { buildAdminFamloProAccessView } from "@/lib/pro-billing/admin-access";
import { loadHostProAccess } from "@/lib/host-pro-access";
import { loadHostProBillingWorkspace } from "@/lib/pro-billing/workspace";
import { verifyRazorpayPaymentSignature } from "@/lib/razorpay";

type Row = Record<string, unknown>;

process.env.FAMLO_LEGAL_ENTITY_NAME ??= "Famlo Private Limited";
process.env.FAMLO_GSTIN ??= "08ABCDE1234F1Z5";
process.env.FAMLO_LEGAL_ADDRESS ??= "Jaipur, Rajasthan";

function createProBillingSupabase() {
  const state = {
    families: [] as Row[],
    hosts: [] as Row[],
    stay_units_v2: [] as Row[],
    host_onboarding_drafts: [] as Row[],
    host_pro_billing_orders: [] as Row[],
    host_pro_billing_order_properties: [] as Row[],
    host_pro_billing_order_rooms: [] as Row[],
    host_pro_subscriptions: [] as Row[],
    host_pro_subscription_rooms: [] as Row[],
    host_pro_invoices: [] as Row[],
    host_gst_profiles: [] as Row[],
    finance_document_files: [] as Row[],
    finance_settings: [] as Row[],
    finance_email_deliveries: [] as Row[],
    notification_queue: [] as Row[],
    users: [] as Row[],
  };

  function withJoinedRows(table: string, rows: Row[]): Row[] {
    return rows.map((row) => {
      const normalizedRow =
        table === "stay_units_v2" && typeof row.id === "string" && typeof row.unit_key !== "string"
          ? { ...row, unit_key: row.id }
          : row;

      if (table !== "host_pro_subscription_rooms") {
        return normalizedRow;
      }

      return {
        ...normalizedRow,
        host_pro_subscriptions:
          state.host_pro_subscriptions.find((subscription) => subscription.id === normalizedRow.subscription_id) ?? null,
      };
    });
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

  return {
    state,
    client: {
      from(table: keyof typeof state) {
        const filters: Array<{ column: string; op: "eq" | "in"; value: unknown }> = [];
        let orderColumn: string | null = null;
        let ascending = true;
        let limitCount: number | null = null;
        const rows = ((state as Record<string, Row[]>)[table] ?? []) as Row[];

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
            const filtered = sortRows(withJoinedRows(table, rows.filter(matcher)), orderColumn, ascending);
            return { data: filtered[0] ?? null, error: null };
          },
          async single() {
            const result = await this.maybeSingle();
            return result;
          },
          async then(resolve: (value: { data: Row[]; error: null }) => unknown) {
            const matcher = createFilterMatcher(filters);
            const filtered = sortRows(withJoinedRows(table, rows.filter(matcher)), orderColumn, ascending);
            const limited = limitCount == null ? filtered : filtered.slice(0, limitCount);
            return resolve({ data: limited, error: null });
          },
        };

        const updateBuilder = (payload: Row) => {
          const updateState: Array<{ column: string; op: "eq" | "in"; value: unknown }> = [];
          const runner: any = {
            eq(column: string, value: unknown) {
              updateState.push({ column, op: "eq", value });
              return this;
            },
            in(column: string, value: unknown[]) {
              updateState.push({ column, op: "in", value });
              return this;
            },
            async maybeSingle() {
              const matcher = createFilterMatcher(updateState);
              const row = rows.find(matcher) ?? null;
              if (row) Object.assign(row, payload);
              return { data: row, error: null };
            },
            async then(resolve: (value: { error: null }) => unknown) {
              const matcher = createFilterMatcher(updateState);
              for (const row of rows.filter(matcher)) {
                Object.assign(row, payload);
              }
              return resolve({ error: null });
            },
            select() {
              return {
                single: async () => {
                  const matcher = createFilterMatcher(updateState);
                  const row = rows.find(matcher) ?? null;
                  if (row) Object.assign(row, payload);
                  return { data: row, error: null };
                },
              };
            },
          };
          return runner;
        };

        const deleteBuilder = () => {
          const deleteFilters: Array<{ column: string; op: "eq" | "in"; value: unknown }> = [];
          const runner: any = {
            eq(column: string, value: unknown) {
              deleteFilters.push({ column, op: "eq", value });
              return this;
            },
            in(column: string, value: unknown[]) {
              deleteFilters.push({ column, op: "in", value });
              return this;
            },
            async then(resolve: (value: { error: null }) => unknown) {
              const matcher = createFilterMatcher(deleteFilters);
              const remaining = rows.filter((row) => !matcher(row));
              rows.splice(0, rows.length, ...remaining);
              return resolve({ error: null });
            },
          };
          return runner;
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

function makeProperty(familyId: string, propertyName: string, roomCount: number) {
  return {
    familyId,
    propertyName,
    hostCode: `HC-${familyId}`,
    city: "Goa",
    state: "Goa",
    roomIds: Array.from({ length: roomCount }, (_, index) => `${familyId}-room-${index + 1}`),
    rooms: Array.from({ length: roomCount }, (_, index) => ({
      id: `${familyId}-room-${index + 1}`,
      name: `Room ${index + 1}`,
    })),
  };
}

test("Famlo Pro pricing applies minimum subtotal for 1 property and 1 room", () => {
  const pricing = buildProBillingPricingBreakdown([makeProperty("fam-a", "Villa One", 1)]);
  assert.equal(pricing.rawSubtotalAmount, 299);
  assert.equal(pricing.subtotalAmount, 499);
  assert.equal(pricing.gstAmount, 90);
  assert.equal(pricing.totalAmount, 589);
});

test("Famlo Pro pricing charges property plus room counts beyond minimum for 1 property and 4 rooms", () => {
  const pricing = buildProBillingPricingBreakdown([makeProperty("fam-a", "Villa One", 4)]);
  assert.equal(pricing.rawSubtotalAmount, 599);
  assert.equal(pricing.subtotalAmount, 599);
  assert.equal(pricing.gstAmount, 108);
  assert.equal(pricing.totalAmount, 707);
});

test("Famlo Pro pricing charges 1 property and 8 rooms correctly", () => {
  const pricing = buildProBillingPricingBreakdown([makeProperty("fam-a", "Villa One", 8)]);
  assert.equal(pricing.rawSubtotalAmount, 999);
  assert.equal(pricing.subtotalAmount, 999);
  assert.equal(pricing.gstAmount, 180);
  assert.equal(pricing.totalAmount, 1179);
});

test("Famlo Pro pricing counts multiple subscribed properties and rooms", () => {
  const pricing = buildProBillingPricingBreakdown([
    makeProperty("fam-a", "Villa One", 8),
    makeProperty("fam-b", "Villa Two", 8),
  ]);
  assert.equal(pricing.propertyCount, 2);
  assert.equal(pricing.roomCount, 16);
  assert.equal(pricing.subtotalAmount, 1998);
  assert.equal(pricing.gstAmount, 360);
  assert.equal(pricing.totalAmount, 2358);
});

test("Famlo Pro prepaid duration quote multiplies totals for 1, 3, and 6 months", () => {
  const pricing = buildProBillingPricingBreakdown([makeProperty("fam-a", "Villa One", 4)]);
  const oneMonth = buildProBillingChargeQuote(pricing, 1);
  const threeMonth = buildProBillingChargeQuote(pricing, 3);
  const sixMonth = buildProBillingChargeQuote(pricing, 6);

  assert.equal(oneMonth.payableTotalAmount, 707);
  assert.equal(threeMonth.payableSubtotalAmount, 1797);
  assert.equal(threeMonth.payableGstAmount, 323);
  assert.equal(threeMonth.payableTotalAmount, 2120);
  assert.equal(sixMonth.payableSubtotalAmount, 3594);
  assert.equal(sixMonth.payableGstAmount, 647);
  assert.equal(sixMonth.payableTotalAmount, 4241);
});

test("invalid Famlo Pro prepaid duration is rejected", () => {
  assert.throws(() => normalizeProBillingDurationMonths(12), /1, 3, or 6 months/i);
});

test("buy page banner copy stays on the simple purchase page", () => {
  assert.equal(FAMLO_PRO_BUY_BANNER_TITLE, "Grow with Famlo Pro");
  assert.equal(FAMLO_PRO_BUY_BANNER_HEADING_COLOR, "#ffffff");
  assert.equal(
    FAMLO_PRO_BUY_BANNER_SUBTITLE,
    "PMS + Channel Manager built for serious homes. Manage rooms, rates, calendars, OTA sync, reports, and operations from one Pro workspace."
  );
  assert.equal(FAMLO_PRO_VALUE_CARDS.some((card) => card.copy.includes("Contact Famlo")), false);
});

test("included tools contain Multiple Properties", () => {
  assert.equal(FAMLO_PRO_FEATURE_CARDS.some((feature) => feature.title === "Multiple Properties"), true);
});

test("buy button is disabled when pricing fails", () => {
  assert.equal(
    isFamloProBuyButtonDisabled({
      loading: false,
      draftLoading: false,
      checkoutLoading: false,
      billableRooms: 4,
      draft: {
        durationMonths: 3,
        pricing: {
          propertyCount: 1,
          roomCount: 4,
          rawSubtotalAmount: 599,
          subtotalAmount: 599,
          gstAmount: 108,
          totalAmount: 707,
          propertyUnitPrice: 199,
          roomUnitPrice: 100,
          minimumSubtotal: 499,
          gstPct: 18,
          pricingVersion: "test",
        },
        quote: {
          durationMonths: 3,
          monthlySubtotalAmount: 599,
          monthlyGstAmount: 108,
          monthlyTotalAmount: 707,
          payableSubtotalAmount: 1797,
          payableGstAmount: 323,
          payableTotalAmount: 2120,
          gstPct: 18,
        },
      },
      pricingError: "Unable to load pricing. Try refreshing once, or contact Famlo.",
    }),
    true
  );
});

test("buy button payload sends selected duration_months correctly", () => {
  const request = buildFamloProDraftRequest(
    {
      familyId: "fam-a",
      propertyName: "Alpha Stay",
      billableRoomCount: 2,
      billableRoomIds: ["room-1", "room-2"],
    },
    3
  );

  assert.deepEqual(request, {
    family_id: "fam-a",
    selections: [{ familyId: "fam-a", roomIds: ["room-1", "room-2"] }],
    duration_months: 3,
  });
});

test("payment success frontend builds verify request and opens Famlo Pro dashboard", () => {
  const verifyRequest = buildFamloProVerifyRequest({
    billingOrderId: "order-verify-1",
    familyId: "fam-a",
    durationMonths: 3,
    razorpayOrderId: "order_rzp_verify_1",
    razorpayPaymentId: "pay_verify_1",
    razorpaySignature: "sig_verify_1",
  });

  assert.deepEqual(verifyRequest, {
    billingOrderId: "order-verify-1",
    familyId: "fam-a",
    durationMonths: 3,
    razorpay_order_id: "order_rzp_verify_1",
    razorpay_payment_id: "pay_verify_1",
    razorpay_signature: "sig_verify_1",
  });
  assert.equal(buildFamloProDashboardHref("fam-a"), "/partnerslogin/home/pro/dashboard?family=fam-a&section=properties-home");
  assert.equal(
    canOpenFamloProDashboard({
      dashboardHref: buildFamloProDashboardHref("fam-a"),
      access: {
        allowed: true,
        status: "active",
        currentPeriodEnd: "2026-06-24T00:00:00.000Z",
        graceUntil: "2026-07-01T00:00:00.000Z",
        reason: "active_period",
      },
    }),
    true
  );
  assert.equal(
    buildFamloProPostPaymentRedirectHref({
      familyId: "fam-a",
      dashboardHref: buildFamloProDashboardHref("fam-a"),
      access: {
        allowed: true,
        status: "active",
        currentPeriodEnd: "2026-06-24T00:00:00.000Z",
        graceUntil: "2026-07-01T00:00:00.000Z",
        reason: "active_period",
      },
    }),
    "/partnerslogin/home/pro/dashboard?family=fam-a&section=properties-home"
  );
});

test("unpaid user sees Buy Famlo Pro and cannot open dashboard", () => {
  assert.deepEqual(
    deriveFamloProBuyUiState({
      access: {
        allowed: false,
        status: "inactive",
        currentPeriodEnd: null,
        graceUntil: null,
        reason: "no_subscription",
      },
      dashboardHref: buildFamloProDashboardHref("fam-a"),
    }),
    {
      isProActive: false,
      isInGrace: false,
      isProExpired: false,
      canOpenProDashboard: false,
      canBuyOrRenew: true,
      showPricingCalculator: true,
      ctaLabel: "Buy Famlo Pro",
    }
  );
});

test("active user sees dashboard access and buy is hidden", () => {
  assert.deepEqual(
    deriveFamloProBuyUiState({
      access: {
        allowed: true,
        status: "active",
        currentPeriodEnd: "2026-06-24T00:00:00.000Z",
        graceUntil: "2026-07-01T00:00:00.000Z",
        reason: "active_period",
      },
      dashboardHref: buildFamloProDashboardHref("fam-a"),
    }),
    {
      isProActive: true,
      isInGrace: false,
      isProExpired: false,
      canOpenProDashboard: true,
      canBuyOrRenew: false,
      showPricingCalculator: false,
      ctaLabel: "Buy Famlo Pro",
    }
  );
});

test("expired after grace shows Renew Famlo Pro and hides dashboard", () => {
  assert.deepEqual(
    deriveFamloProBuyUiState({
      access: {
        allowed: false,
        status: "paused",
        currentPeriodEnd: "2026-05-01T00:00:00.000Z",
        graceUntil: "2026-05-08T00:00:00.000Z",
        reason: "grace_period_ended",
      },
      dashboardHref: buildFamloProDashboardHref("fam-a"),
    }),
    {
      isProActive: false,
      isInGrace: false,
      isProExpired: true,
      canOpenProDashboard: false,
      canBuyOrRenew: true,
      showPricingCalculator: true,
      ctaLabel: "Renew Famlo Pro",
    }
  );
  assert.equal(
    buildFamloProPostPaymentRedirectHref({
      familyId: "fam-a",
      dashboardHref: buildFamloProDashboardHref("fam-a"),
      access: {
        allowed: false,
        status: "paused",
        currentPeriodEnd: "2026-05-01T00:00:00.000Z",
        graceUntil: "2026-05-08T00:00:00.000Z",
        reason: "grace_period_ended",
      },
    }),
    null
  );
});

test("invalid Razorpay payment signature is rejected", async () => {
  const previousKeyId = process.env.RAZORPAY_KEY_ID;
  const previousKeySecret = process.env.RAZORPAY_KEY_SECRET;
  process.env.RAZORPAY_KEY_ID = "rzp_test_verify";
  process.env.RAZORPAY_KEY_SECRET = "verify_secret";

  try {
    const validSignature = crypto.createHmac("sha256", "verify_secret").update("order_1|pay_1").digest("hex");
    assert.equal(
      verifyRazorpayPaymentSignature({
        orderId: "order_1",
        paymentId: "pay_1",
        signature: validSignature,
      }),
      true
    );
    assert.equal(
      verifyRazorpayPaymentSignature({
        orderId: "order_1",
        paymentId: "pay_1",
        signature: "invalid_signature",
      }),
      false
    );
  } finally {
    process.env.RAZORPAY_KEY_ID = previousKeyId;
    process.env.RAZORPAY_KEY_SECRET = previousKeySecret;
  }
});

test("pricing draft still works when subscription status tables fail separately", async () => {
  const { client, state } = createProBillingSupabase();
  state.families.push({
    id: "fam-a",
    user_id: "host-1",
    name: "Alpha",
    property_name: "Alpha Stay",
    host_id: "HOST-1",
    city: "Goa",
    state: "Goa",
    updated_at: "2026-05-24T10:00:00.000Z",
  });
  state.stay_units_v2.push(
    { id: "a-room-1", legacy_family_id: "fam-a", name: "A Room 1", is_active: true, sort_order: 1 },
    { id: "a-room-2", legacy_family_id: "fam-a", name: "A Room 2", is_active: true, sort_order: 2 }
  );

  const clientWithBrokenSubscriptionReads = {
    from(table: string) {
      if (table === "host_pro_subscriptions" || table === "host_pro_subscription_rooms") {
        throw new Error("optional subscription table unavailable");
      }
      return client.from(table as never);
    },
  } as typeof client;

  const draft = await buildHostProBillingDraft(clientWithBrokenSubscriptionReads, {
    hostUserId: "host-1",
    sourceFamilyId: "fam-a",
    selections: [{ familyId: "fam-a", roomIds: ["a-room-1", "a-room-2"] }],
    durationMonths: 3,
  });

  assert.equal(draft.pricing.roomCount, 2);
  assert.equal(draft.quote.durationMonths, 3);
});

test("pricing draft fails only when selected property or rooms cannot be resolved", async () => {
  const { client, state } = createProBillingSupabase();
  state.families.push({
    id: "fam-a",
    user_id: "host-1",
    name: "Alpha",
    property_name: "Alpha Stay",
    host_id: "HOST-1",
    city: "Goa",
    state: "Goa",
    updated_at: "2026-05-24T10:00:00.000Z",
  });
  state.stay_units_v2.push({ id: "a-room-1", legacy_family_id: "fam-a", name: "A Room 1", is_active: true, sort_order: 1 });

  await assert.rejects(
    () =>
      buildHostProBillingDraft(client, {
        hostUserId: "host-1",
        sourceFamilyId: "fam-missing",
        selections: [{ familyId: "fam-missing", roomIds: ["missing-room"] }],
        durationMonths: 1,
      }),
    /does not belong to this host/i
  );

  await assert.rejects(
    () =>
      buildHostProBillingDraft(client, {
        hostUserId: "host-1",
        sourceFamilyId: "fam-a",
        selections: [{ familyId: "fam-a", roomIds: ["missing-room"] }],
        durationMonths: 1,
      }),
    /does not belong to property/i
  );
});

test("workspace falls back to the host's only property when selected family id cannot be resolved", async () => {
  const { client, state } = createProBillingSupabase();
  state.families.push({
    id: "fam-a",
    user_id: "host-1",
    name: "SAM's Home",
    property_name: "SAM's Home",
    host_id: "HOST-1",
    city: "Goa",
    state: "Goa",
    updated_at: "2026-05-24T10:00:00.000Z",
  });
  state.stay_units_v2.push({
    id: "a-room-1",
    legacy_family_id: "fam-a",
    name: "A Room 1",
    is_active: true,
    sort_order: 1,
  });

  const workspace = await loadHostProBillingWorkspace(client, "host-1", { sourceFamilyId: "fam-missing" });

  assert.equal(workspace.length, 1);
  assert.equal(workspace[0]?.familyId, "fam-a");
  assert.equal(workspace[0]?.rooms.filter((room) => room.isActive).length, 1);
});

test("workspace resolves family name even when families.property_name is absent", async () => {
  const { client, state } = createProBillingSupabase();
  state.families.push({
    id: "fam-a",
    user_id: "host-1",
    name: "SAM's Home",
    host_id: "HOST-1",
    city: "Goa",
    state: "Goa",
    updated_at: "2026-05-24T10:00:00.000Z",
  });
  state.stay_units_v2.push({
    id: "a-room-1",
    legacy_family_id: "fam-a",
    name: "A Room 1",
    is_active: true,
    sort_order: 1,
  });

  const workspace = await loadHostProBillingWorkspace(client, "host-1", { sourceFamilyId: "fam-a" });

  assert.equal(workspace[0]?.propertyName, "SAM's Home");
  assert.equal(workspace[0]?.rooms.filter((room) => room.isActive).length, 1);
});

test("billing draft still resolves a single host property when requested family id is missing", async () => {
  const { client, state } = createProBillingSupabase();
  state.families.push({
    id: "fam-a",
    user_id: "host-1",
    name: "SAM's Home",
    property_name: "SAM's Home",
    host_id: "HOST-1",
    city: "Goa",
    state: "Goa",
    updated_at: "2026-05-24T10:00:00.000Z",
  });
  state.stay_units_v2.push({
    id: "a-room-1",
    legacy_family_id: "fam-a",
    name: "A Room 1",
    is_active: true,
    sort_order: 1,
  });

  const draft = await buildHostProBillingDraft(client, {
    hostUserId: "host-1",
    sourceFamilyId: "fam-missing",
    selections: [{ familyId: "fam-a", roomIds: ["a-room-1"] }],
    durationMonths: 1,
  });

  assert.equal(draft.pricing.propertyCount, 1);
  assert.equal(draft.pricing.roomCount, 1);
  assert.equal(draft.pricing.subtotalAmount, 499);
});

test("Famlo Pro draft and workspace only count and show selected billing scope", async () => {
  const { client, state } = createProBillingSupabase();
  state.families.push(
    { id: "fam-a", user_id: "host-1", name: "Alpha", property_name: "Alpha Stay", host_id: "A1", city: "Goa", state: "Goa", created_at: "2026-05-20T10:00:00.000Z" },
    { id: "fam-b", user_id: "host-1", name: "Beta", property_name: "Beta Stay", host_id: "B1", city: "Goa", state: "Goa", created_at: "2026-05-19T10:00:00.000Z" },
  );
  state.stay_units_v2.push(
    { id: "a-room-1", legacy_family_id: "fam-a", name: "A Room 1", is_active: true, sort_order: 1 },
    { id: "a-room-2", legacy_family_id: "fam-a", name: "A Room 2", is_active: true, sort_order: 2 },
    { id: "b-room-1", legacy_family_id: "fam-b", name: "B Room 1", is_active: true, sort_order: 1 },
  );

  const draft = await buildHostProBillingDraft(client, {
    hostUserId: "host-1",
    selections: [{ familyId: "fam-a", roomIds: ["a-room-1"] }],
    durationMonths: 6,
  });
  assert.equal(draft.pricing.propertyCount, 1);
  assert.equal(draft.pricing.roomCount, 1);
  assert.equal(draft.quote.durationMonths, 6);

  state.host_pro_billing_orders.push({
    id: "order-1",
    host_user_id: "host-1",
    status: "payment_pending",
    total_amount: 3534,
    scope_hash: draft.scopeHash,
    gateway_order_id: "order_rzp_1",
    metadata: {
      duration_months: 6,
    },
  });
  state.host_pro_billing_order_properties.push({
    id: "order-prop-1",
    billing_order_id: "order-1",
    family_id: "fam-a",
    property_name: "Alpha Stay",
    host_code: "A1",
    city: "Goa",
    state: "Goa",
  });
  state.host_pro_billing_order_rooms.push({
    id: "order-room-1",
    billing_order_id: "order-1",
    family_id: "fam-a",
    stay_unit_id: "a-room-1",
    room_name: "A Room 1",
  });
  state.users.push({ id: "host-1", email: "host@example.com" });

  let emailCount = 0;
  await finalizeCapturedHostProBillingOrder(
    client,
    {
      billingOrderId: "order-1",
      gatewayOrderId: "order_rzp_1",
      gatewayPaymentId: "pay_1",
      providerPaymentStatus: "captured",
      providerAmountPaise: 353400,
    },
    {
      sendInvoiceEmail: async () => {
        emailCount += 1;
        return { deliveryId: "delivery-1", providerMessageId: "msg-1" };
      },
    }
  );

  const workspace = await loadHostProBillingWorkspace(client, "host-1");
  const alpha = workspace.find((property) => property.familyId === "fam-a");
  const beta = workspace.find((property) => property.familyId === "fam-b");

  assert.deepEqual(alpha?.activeRoomIds, []);
  assert.equal(alpha?.status, "inactive");
  assert.equal(alpha?.rooms.length, 2);
  assert.deepEqual(beta?.activeRoomIds, []);
  assert.equal(beta?.status, "inactive");
  assert.equal(beta?.rooms.length, 1);
  assert.equal(emailCount, 1);
  assert.equal((state.host_pro_subscriptions[0]?.metadata as Record<string, unknown> | undefined)?.duration_months, 6);
});

test("workspace room count only uses the selected property rooms", async () => {
  const { client, state } = createProBillingSupabase();
  state.families.push(
    { id: "fam-a", user_id: "host-1", name: "Alpha", property_name: "Alpha Stay", host_id: "HOST-1", city: "Goa", state: "Goa", updated_at: "2026-05-24T10:00:00.000Z" },
    { id: "fam-b", user_id: "host-1", name: "Beta", property_name: "Beta Stay", host_id: "HOST-1", city: "Goa", state: "Goa", updated_at: "2026-05-24T10:00:00.000Z" },
  );
  state.stay_units_v2.push(
    { id: "a-room-1", legacy_family_id: "fam-a", name: "A Room 1", is_active: true, sort_order: 1 },
    { id: "a-room-2", legacy_family_id: "fam-a", name: "A Room 2", is_active: true, sort_order: 2 },
    { id: "a-room-3", legacy_family_id: "fam-a", name: "A Room 3", is_active: false, sort_order: 3 },
    { id: "b-room-1", legacy_family_id: "fam-b", name: "B Room 1", is_active: true, sort_order: 1 },
  );

  const workspace = await loadHostProBillingWorkspace(client, "host-1", { sourceFamilyId: "fam-a" });
  const alpha = workspace.find((property) => property.familyId === "fam-a");
  const beta = workspace.find((property) => property.familyId === "fam-b");

  assert.equal(alpha?.rooms.filter((room) => room.isActive).length, 2);
  assert.equal(beta?.rooms.filter((room) => room.isActive).length, 1);
});

test("Famlo Pro receipt and email are generated only after captured payment", async () => {
  const { client, state } = createProBillingSupabase();
  state.host_pro_billing_orders.push({
    id: "order-2",
    host_user_id: "host-1",
    status: "payment_pending",
    total_amount: 589,
    scope_hash: "scope-2",
    gateway_order_id: "order_rzp_2",
  });
  state.host_pro_billing_order_properties.push({
    id: "order-prop-2",
    billing_order_id: "order-2",
    family_id: "fam-a",
    property_name: "Alpha Stay",
    host_code: "A1",
    city: "Goa",
    state: "Goa",
  });
  state.host_pro_billing_order_rooms.push({
    id: "order-room-2",
    billing_order_id: "order-2",
    family_id: "fam-a",
    stay_unit_id: "a-room-1",
    room_name: "A Room 1",
  });

  let emailCount = 0;

  await assert.rejects(
    () =>
      finalizeCapturedHostProBillingOrder(
        client,
        {
          billingOrderId: "order-2",
          gatewayOrderId: "order_rzp_2",
          gatewayPaymentId: "pay_2",
          providerPaymentStatus: "failed",
          providerAmountPaise: 58900,
        },
        {
          sendInvoiceEmail: async () => {
            emailCount += 1;
            return { deliveryId: "delivery-2", providerMessageId: "msg-2" };
          },
        }
      ),
    /not captured/i
  );

  assert.equal(state.host_pro_invoices.length, 0);
  assert.equal(emailCount, 0);

  await finalizeCapturedHostProBillingOrder(
    client,
    {
      billingOrderId: "order-2",
      gatewayOrderId: "order_rzp_2",
      gatewayPaymentId: "pay_2",
      providerPaymentStatus: "captured",
      providerAmountPaise: 58900,
    },
    {
      sendInvoiceEmail: async () => {
        emailCount += 1;
        return { deliveryId: "delivery-2", providerMessageId: "msg-2" };
      },
    }
  );

  assert.equal(state.host_pro_invoices.length, 1);
  assert.equal(emailCount, 1);
});

test("duplicate Pro finalization does not duplicate subscription invoice or email", async () => {
  const { client, state } = createProBillingSupabase();
  state.host_pro_billing_orders.push({
    id: "order-3",
    host_user_id: "host-1",
    status: "payment_pending",
    total_amount: 707,
    scope_hash: "scope-3",
    gateway_order_id: "order_rzp_3",
  });
  state.host_pro_billing_order_properties.push({
    id: "order-prop-3",
    billing_order_id: "order-3",
    family_id: "fam-a",
    property_name: "Alpha Stay",
    host_code: "A1",
    city: "Goa",
    state: "Goa",
  });
  state.host_pro_billing_order_rooms.push(
    { id: "order-room-3a", billing_order_id: "order-3", family_id: "fam-a", stay_unit_id: "a-room-1", room_name: "A Room 1" },
    { id: "order-room-3b", billing_order_id: "order-3", family_id: "fam-a", stay_unit_id: "a-room-2", room_name: "A Room 2" },
    { id: "order-room-3c", billing_order_id: "order-3", family_id: "fam-a", stay_unit_id: "a-room-3", room_name: "A Room 3" },
    { id: "order-room-3d", billing_order_id: "order-3", family_id: "fam-a", stay_unit_id: "a-room-4", room_name: "A Room 4" },
  );

  let emailCount = 0;

  const first = await finalizeCapturedHostProBillingOrder(
    client,
    {
      billingOrderId: "order-3",
      gatewayOrderId: "order_rzp_3",
      gatewayPaymentId: "pay_3",
      providerPaymentStatus: "captured",
      providerAmountPaise: 70700,
    },
    {
      sendInvoiceEmail: async () => {
        emailCount += 1;
        return { deliveryId: "delivery-3", providerMessageId: "msg-3" };
      },
    }
  );

  const second = await finalizeCapturedHostProBillingOrder(
    client,
    {
      billingOrderId: "order-3",
      gatewayOrderId: "order_rzp_3",
      gatewayPaymentId: "pay_3",
      providerPaymentStatus: "captured",
      providerAmountPaise: 70700,
    },
    {
      sendInvoiceEmail: async () => {
        emailCount += 1;
        return { deliveryId: "delivery-3", providerMessageId: "msg-3" };
      },
    }
  );

  assert.equal(first.alreadyFinalized, false);
  assert.equal(second.alreadyFinalized, true);
  assert.equal(state.host_pro_subscriptions.length, 1);
  assert.equal(state.host_pro_subscription_rooms.length, 4);
  assert.equal(state.host_pro_invoices.length, 1);
  assert.equal(emailCount, 1);
});

test("Famlo Pro activation stays paid when invoice email fails", async () => {
  const { client, state } = createProBillingSupabase();
  state.families.push({
    id: "fam-mail-1",
    user_id: "host-mail-1",
    name: "Mail Stay",
    property_name: "Mail Stay",
    host_phone: "+919999999999",
    state: "Rajasthan",
    latest_onboarding_payload: { hostName: "Sam", email: "host@example.com" },
  });
  state.users.push({ id: "host-mail-1", name: "Sam", email: "host@example.com" });
  state.host_pro_billing_orders.push({
    id: "order-mail-1",
    host_user_id: "host-mail-1",
    status: "payment_pending",
    total_amount: 589,
    scope_hash: "scope-mail-1",
    gateway_order_id: "order_rzp_mail_1",
    metadata: { duration_months: 1 },
  });
  state.host_pro_billing_order_properties.push({
    id: "order-prop-mail-1",
    billing_order_id: "order-mail-1",
    family_id: "fam-mail-1",
    property_name: "Mail Stay",
    host_code: "MAIL1",
    city: "Jaipur",
    state: "Rajasthan",
  });
  state.host_pro_billing_order_rooms.push({
    id: "order-room-mail-1",
    billing_order_id: "order-mail-1",
    family_id: "fam-mail-1",
    stay_unit_id: "mail-room-1",
    room_name: "Mail Room 1",
  });

  const result = await finalizeCapturedHostProBillingOrder(
    client,
    {
      billingOrderId: "order-mail-1",
      gatewayOrderId: "order_rzp_mail_1",
      gatewayPaymentId: "pay_mail_1",
      providerPaymentStatus: "captured",
      providerAmountPaise: 58900,
    },
    {
      sendInvoiceEmail: async () => {
        throw new Error("SMTP unavailable");
      },
    }
  );

  assert.equal(result.alreadyFinalized, false);
  assert.equal(state.host_pro_billing_orders[0]?.status, "paid");
  assert.equal(state.host_pro_invoices.length, 1);
  assert.equal(state.notification_queue.length, 1);
});

test("successful Razorpay verify activates Famlo Pro and stays idempotent", async () => {
  const { client, state } = createProBillingSupabase();
  state.host_pro_billing_orders.push({
    id: "order-verify-4",
    host_user_id: "host-1",
    status: "payment_pending",
    total_amount: 589,
    scope_hash: "scope-verify-4",
    gateway_order_id: "order_rzp_verify_4",
    metadata: {
      duration_months: 1,
    },
  });
  state.host_pro_billing_order_properties.push({
    id: "order-prop-verify-4",
    billing_order_id: "order-verify-4",
    family_id: "fam-a",
    property_name: "Alpha Stay",
    host_code: "A1",
    city: "Goa",
    state: "Goa",
  });
  state.host_pro_billing_order_rooms.push({
    id: "order-room-verify-4",
    billing_order_id: "order-verify-4",
    family_id: "fam-a",
    stay_unit_id: "a-room-1",
    room_name: "A Room 1",
  });
  state.users.push({ id: "host-1", email: "host@example.com" });

  const first = await verifyAndFinalizeHostProBillingOrder(
    client,
    {
      billingOrderId: "order-verify-4",
      gatewayOrderId: "order_rzp_verify_4",
      gatewayPaymentId: "pay_verify_4",
      paymentSignature: "sig_verify_4",
    },
    {
      fetchPayment: async () => ({
        id: "pay_verify_4",
        entity: "payment",
        amount: 58900,
        currency: "INR",
        status: "captured",
        order_id: "order_rzp_verify_4",
        method: "upi",
        amount_refunded: 0,
        refund_status: null,
        captured: true,
        description: null,
        card_id: null,
        bank: null,
        wallet: null,
        vpa: null,
        email: null,
        contact: null,
        fee: null,
        tax: null,
        error_code: null,
        error_description: null,
        error_source: null,
        error_step: null,
        error_reason: null,
        notes: {},
        acquirer_data: {},
        created_at: Math.floor(Date.now() / 1000),
      }),
      sendInvoiceEmail: async () => ({ deliveryId: "delivery-verify-4", providerMessageId: "msg-verify-4" }),
    }
  );

  const second = await verifyAndFinalizeHostProBillingOrder(
    client,
    {
      billingOrderId: "order-verify-4",
      gatewayOrderId: "order_rzp_verify_4",
      gatewayPaymentId: "pay_verify_4",
      paymentSignature: "sig_verify_4",
    },
    {
      fetchPayment: async () => ({
        id: "pay_verify_4",
        entity: "payment",
        amount: 58900,
        currency: "INR",
        status: "captured",
        order_id: "order_rzp_verify_4",
        method: "upi",
        amount_refunded: 0,
        refund_status: null,
        captured: true,
        description: null,
        card_id: null,
        bank: null,
        wallet: null,
        vpa: null,
        email: null,
        contact: null,
        fee: null,
        tax: null,
        error_code: null,
        error_description: null,
        error_source: null,
        error_step: null,
        error_reason: null,
        notes: {},
        acquirer_data: {},
        created_at: Math.floor(Date.now() / 1000),
      }),
      sendInvoiceEmail: async () => ({ deliveryId: "delivery-verify-4", providerMessageId: "msg-verify-4" }),
    }
  );

  assert.equal(first.alreadyFinalized, false);
  assert.equal(second.alreadyFinalized, true);
  assert.equal(state.host_pro_billing_orders[0]?.status, "paid");
  assert.equal(state.host_pro_subscriptions[0]?.status, "active");
});

test("dev reset clears only selected family Famlo Pro records", async () => {
  const { client, state } = createProBillingSupabase();
  state.host_pro_subscriptions.push(
    { id: "sub-a", family_id: "fam-a", host_user_id: "host-1", status: "active", current_period_end: "2026-06-23T10:00:00.000Z", grace_until: "2026-06-30T10:00:00.000Z", metadata: {} },
    { id: "sub-b", family_id: "fam-b", host_user_id: "host-1", status: "active" },
  );
  state.host_pro_subscription_rooms.push(
    { id: "sub-room-a", subscription_id: "sub-a", family_id: "fam-a", stay_unit_id: "a-room-1", room_name: "A Room 1", status: "active" },
    { id: "sub-room-b", subscription_id: "sub-b", family_id: "fam-b", stay_unit_id: "b-room-1", room_name: "B Room 1", status: "active" },
  );
  state.host_pro_billing_orders.push(
    { id: "order-a", host_user_id: "host-1", status: "paid" },
    { id: "order-b", host_user_id: "host-1", status: "paid" },
  );
  state.host_pro_billing_order_properties.push(
    { id: "order-prop-a", billing_order_id: "order-a", family_id: "fam-a", property_name: "Alpha Stay" },
    { id: "order-prop-b", billing_order_id: "order-b", family_id: "fam-b", property_name: "Beta Stay" },
  );
  state.host_pro_billing_order_rooms.push(
    { id: "order-room-a", billing_order_id: "order-a", family_id: "fam-a", stay_unit_id: "a-room-1", room_name: "A Room 1" },
    { id: "order-room-b", billing_order_id: "order-b", family_id: "fam-b", stay_unit_id: "b-room-1", room_name: "B Room 1" },
  );
  state.host_pro_invoices.push(
    { id: "invoice-a", billing_order_id: "order-a" },
    { id: "invoice-b", billing_order_id: "order-b" },
  );

  await resetHostProTestingState(client, { familyId: "fam-a" });
  const access = await loadHostProAccess(client, "fam-a");

  assert.equal(state.host_pro_subscriptions.some((row) => row.id === "sub-a"), true);
  assert.equal(state.host_pro_subscriptions.some((row) => row.id === "sub-b"), true);
  assert.equal(state.host_pro_subscriptions.find((row) => row.id === "sub-a")?.status, "cancelled");
  assert.equal(state.host_pro_billing_orders.find((row) => row.id === "order-a")?.status, "cancelled");
  assert.equal(state.host_pro_billing_orders.some((row) => row.id === "order-b"), true);
  assert.equal((state.host_pro_billing_orders.find((row) => row.id === "order-a")?.metadata as Record<string, unknown>)?.non_granting, true);
  assert.equal(state.host_pro_invoices.some((row) => row.id === "invoice-b"), true);
  assert.equal(access.allowed, false);
  assert.equal(access.status, "cancelled");
});

test("admin stop deactivates Famlo Pro access immediately", async () => {
  const { client, state } = createProBillingSupabase();

  state.host_pro_subscriptions.push({
    id: "sub-stop",
    family_id: "fam-stop",
    host_user_id: "host-stop",
    status: "active",
    current_period_start: "2026-05-24T10:00:00.000Z",
    current_period_end: "2026-07-23T10:00:00.000Z",
    grace_until: "2026-07-30T10:00:00.000Z",
    created_at: "2026-05-24T10:00:00.000Z",
    metadata: {},
  });

  await deactivateHostProAccess(client, { familyId: "fam-stop", reason: "admin_stop" });
  assert.equal(state.host_pro_subscriptions[0]?.status, "halted");
  const access = await loadHostProAccess(client, "fam-stop");

  assert.equal(state.host_pro_subscriptions[0]?.status, "paused");
  assert.equal(state.host_pro_subscriptions[0]?.current_period_end, null);
  assert.equal(state.host_pro_subscriptions[0]?.grace_until, null);
  assert.equal((state.host_pro_subscriptions[0]?.metadata as Record<string, unknown>)?.non_granting, true);
  assert.equal(access.allowed, false);
  assert.equal(access.status, "paused");
});

test("trust blocked property blocks Famlo Pro access even with active subscription", async () => {
  const { client, state } = createProBillingSupabase();

  state.families.push({
    id: "fam-trust-blocked",
    user_id: "host-trust-blocked",
    trust_status: "blocked",
  });
  state.host_pro_subscriptions.push({
    id: "sub-trust-blocked",
    family_id: "fam-trust-blocked",
    host_user_id: "host-trust-blocked",
    status: "active",
    current_period_start: "2026-05-24T10:00:00.000Z",
    current_period_end: "2026-07-23T10:00:00.000Z",
    grace_until: "2026-07-30T10:00:00.000Z",
    created_at: "2026-05-24T10:00:00.000Z",
    metadata: {},
  });

  const access = await loadHostProAccess(client, "fam-trust-blocked");

  assert.equal(access.allowed, false);
  assert.equal(access.status, "paused");
  assert.equal(access.reason, "locked");
  assert.equal(state.host_pro_subscriptions[0]?.status, "active");
});

test("prorated room add-on uses remaining active days", () => {
  const quote = buildProratedProAddonQuote({
    addonType: "room",
    durationMonths: 1,
    remainingDays: 10,
  });

  assert.equal(quote.totalPlanDays, 30);
  assert.equal(quote.remainingDays, 10);
  assert.equal(quote.baseMonthlyAmount, 100);
  assert.equal(quote.payableSubtotalAmount, 33.33);
  assert.equal(quote.payableGstAmount, 6);
  assert.equal(quote.payableTotalAmount, 39.33);
});

test("active subscription add-on quote uses plan metadata for property proration", async () => {
  const { client, state } = createProBillingSupabase();
  state.host_pro_subscriptions.push({
    id: "sub-addon",
    family_id: "fam-addon",
    host_user_id: "host-addon",
    status: "active",
    current_period_start: "2026-05-01T00:00:00.000Z",
    current_period_end: "2026-06-30T00:00:00.000Z",
    metadata: { duration_months: 3 },
    created_at: "2026-05-01T00:00:00.000Z",
  });

  const quote = await buildHostProAddonQuote(client, {
    familyId: "fam-addon",
    addonType: "property",
    nowIso: "2026-06-10T00:00:00.000Z",
  });

  assert.equal(quote.totalPlanDays, 90);
  assert.equal(quote.baseMonthlyAmount, 199);
  assert.equal(quote.remainingDays, 20);
  assert.equal(quote.payableSubtotalAmount, 44.22);
  assert.equal(quote.payableGstAmount, 7.96);
  assert.equal(quote.payableTotalAmount, 52.18);
});

test("room add-on checkout verifies and is consumed once before creation", async () => {
  const { client, state } = createProBillingSupabase();
  state.host_pro_subscriptions.push({
    id: "sub-addon",
    family_id: "fam-addon",
    host_user_id: "host-addon",
    status: "active",
    current_period_start: "2026-05-24T00:00:00.000Z",
    current_period_end: "2026-07-23T00:00:00.000Z",
    metadata: { duration_months: 1 },
    created_at: "2026-05-24T00:00:00.000Z",
  });

  const checkout = await createHostProAddonCheckout(
    client,
    {
      hostUserId: "host-addon",
      familyId: "fam-addon",
      addonType: "room",
    },
    {
      createOrder: async ({ amountRupees, receipt, notes }) =>
        ({
          id: "order-addon",
          entity: "order",
          amount: Math.round(amountRupees * 100),
          amount_paid: 0,
          amount_due: Math.round(amountRupees * 100),
          currency: "INR",
          receipt,
          offer_id: null,
          status: "created",
          attempts: 0,
          created_at: 1716500000,
          notes: notes ?? {},
        }) as any,
    }
  );

  const verified = await verifyAndFinalizeHostProAddonOrder(
    client,
    {
      billingOrderId: checkout.billingOrderId,
      gatewayOrderId: "order-addon",
      gatewayPaymentId: "pay-addon",
      paymentSignature: "sig-addon",
    },
    {
      fetchPayment: async () =>
        ({
          id: "pay-addon",
          entity: "payment",
          amount: Math.round(checkout.quote.payableTotalAmount * 100),
          currency: "INR",
          status: "captured",
          order_id: "order-addon",
        }) as any,
    }
  );

  assert.equal(verified.alreadyFinalized, false);
  assert.equal(state.host_pro_billing_orders[0]?.status, "paid");
  assert.equal((state.host_pro_billing_orders[0]?.metadata as Record<string, unknown>)?.consumed_at ?? null, null);

  await assert.doesNotReject(() =>
    assertPaidHostProAddonOrderAvailable(client, {
      billingOrderId: checkout.billingOrderId,
      hostUserId: "host-addon",
      familyId: "fam-addon",
      addonType: "room",
    })
  );

  await consumePaidHostProAddonOrder(client, {
    billingOrderId: checkout.billingOrderId,
    hostUserId: "host-addon",
    familyId: "fam-addon",
    addonType: "room",
    targetReference: "room-1",
  });

  assert.equal(Boolean((state.host_pro_billing_orders[0]?.metadata as Record<string, unknown>)?.consumed_at), true);

  await assert.doesNotReject(() =>
    consumePaidHostProAddonOrder(client, {
      billingOrderId: checkout.billingOrderId,
      hostUserId: "host-addon",
      familyId: "fam-addon",
      addonType: "room",
      targetReference: "room-1",
    })
  );

  await assert.rejects(
    () =>
      consumePaidHostProAddonOrder(client, {
        billingOrderId: checkout.billingOrderId,
        hostUserId: "host-addon",
        familyId: "fam-addon",
        addonType: "room",
        targetReference: "room-2",
      }),
    /already been used/i
  );
});

test("backend guard rejects unpaid or already-consumed add-on orders before property or room activation", async () => {
  const { client, state } = createProBillingSupabase();
  state.host_pro_billing_orders.push(
    {
      id: "addon-unpaid",
      host_user_id: "host-guard",
      source_family_id: "fam-guard",
      status: "payment_pending",
      metadata: {
        order_kind: "addon",
        addon_type: "property",
      },
    },
    {
      id: "addon-used",
      host_user_id: "host-guard",
      source_family_id: "fam-guard",
      status: "paid",
      metadata: {
        order_kind: "addon",
        addon_type: "room",
        consumed_at: "2026-06-01T10:00:00.000Z",
        consumed_target_reference: "room-99",
      },
    }
  );

  await assert.rejects(
    () =>
      assertPaidHostProAddonOrderAvailable(client, {
        billingOrderId: "addon-unpaid",
        hostUserId: "host-guard",
        familyId: "fam-guard",
        addonType: "property",
      }),
    /not valid for this action/i
  );

  await assert.rejects(
    () =>
      assertPaidHostProAddonOrderAvailable(client, {
        billingOrderId: "addon-used",
        hostUserId: "host-guard",
        familyId: "fam-guard",
        addonType: "room",
      }),
    /already been used/i
  );
});

test("add-on verify keeps subscription expiry dates unchanged", async () => {
  const { client, state } = createProBillingSupabase();
  state.host_pro_subscriptions.push({
    id: "sub-addon-stable",
    family_id: "fam-addon-stable",
    host_user_id: "host-addon-stable",
    status: "active",
    current_period_start: "2026-05-24T10:00:00.000Z",
    current_period_end: "2026-07-23T10:00:00.000Z",
    grace_until: "2026-07-30T10:00:00.000Z",
    next_charge_at: "2026-07-23T10:00:00.000Z",
    metadata: { duration_months: 1 },
    created_at: "2026-05-24T10:00:00.000Z",
  });

  const checkout = await createHostProAddonCheckout(
    client,
    {
      hostUserId: "host-addon-stable",
      familyId: "fam-addon-stable",
      addonType: "room",
    },
    {
      createOrder: async ({ amountRupees, receipt, notes }) =>
        ({
          id: "order-addon-stable",
          entity: "order",
          amount: Math.round(amountRupees * 100),
          amount_paid: 0,
          amount_due: Math.round(amountRupees * 100),
          currency: "INR",
          receipt,
          offer_id: null,
          status: "created",
          attempts: 0,
          created_at: 1716500000,
          notes: notes ?? {},
        }) as any,
    }
  );

  const beforeVerify = { ...state.host_pro_subscriptions[0] };

  await verifyAndFinalizeHostProAddonOrder(
    client,
    {
      billingOrderId: checkout.billingOrderId,
      gatewayOrderId: "order-addon-stable",
      gatewayPaymentId: "pay-addon-stable",
      paymentSignature: "sig-addon-stable",
    },
    {
      fetchPayment: async () =>
        ({
          id: "pay-addon-stable",
          entity: "payment",
          amount: Math.round(checkout.quote.payableTotalAmount * 100),
          currency: "INR",
          status: "captured",
          order_id: "order-addon-stable",
        }) as any,
    }
  );

  const afterVerify = state.host_pro_subscriptions[0];
  assert.equal(afterVerify?.current_period_start, beforeVerify.current_period_start);
  assert.equal(afterVerify?.current_period_end, beforeVerify.current_period_end);
  assert.equal(afterVerify?.grace_until, beforeVerify.grace_until);
  assert.equal(afterVerify?.next_charge_at, beforeVerify.next_charge_at);
});

test("autopay renewal rebuilds fresh room scope and excludes inactive add-on rooms", async () => {
  const { client, state } = createProBillingSupabase();
  state.families.push({
    id: "fam-a",
    user_id: "host-1",
    name: "Alpha Stay",
    host_id: "A1",
    city: "Goa",
    state: "Goa",
    is_active: true,
  });
  state.stay_units_v2.push(
    { id: "a-room-1", legacy_family_id: "fam-a", name: "A Room 1", is_active: true },
    { id: "a-room-2", legacy_family_id: "fam-a", name: "A Room 2", is_active: true },
    { id: "a-room-3", legacy_family_id: "fam-a", name: "A Room 3", is_active: false }
  );
  state.host_pro_billing_orders.push(
    {
      id: "order-auto-base",
      host_user_id: "host-1",
      source_family_id: "fam-a",
      status: "paid",
      property_count: 1,
      room_count: 1,
      subtotal_amount: 499,
      gst_amount: 90,
      total_amount: 589,
      gateway_subscription_id: "sub-auto-1",
      gateway_plan_id: "plan-auto-1",
      metadata: {},
      created_at: "2026-05-24T10:00:00.000Z",
    },
    {
      id: "addon-room-active",
      host_user_id: "host-1",
      source_family_id: "fam-a",
      status: "paid",
      metadata: {
        order_kind: "addon",
        addon_type: "room",
        consumed_at: "2026-06-05T10:00:00.000Z",
        consumed_target_reference: "a-room-2",
      },
      created_at: "2026-06-05T10:00:00.000Z",
    },
    {
      id: "addon-room-inactive",
      host_user_id: "host-1",
      source_family_id: "fam-a",
      status: "paid",
      metadata: {
        order_kind: "addon",
        addon_type: "room",
        consumed_at: "2026-06-06T10:00:00.000Z",
        consumed_target_reference: "a-room-3",
      },
      created_at: "2026-06-06T10:00:00.000Z",
    }
  );
  state.host_pro_billing_order_properties.push({
    id: "order-auto-base-prop",
    billing_order_id: "order-auto-base",
    family_id: "fam-a",
    property_name: "Alpha Stay",
    host_code: "A1",
    city: "Goa",
    state: "Goa",
  });
  state.host_pro_billing_order_rooms.push({
    id: "order-auto-base-room",
    billing_order_id: "order-auto-base",
    family_id: "fam-a",
    stay_unit_id: "a-room-1",
    room_name: "A Room 1",
  });
  state.host_pro_subscriptions.push({
    id: "sub-auto-row-a",
    family_id: "fam-a",
    host_user_id: "host-1",
    status: "active",
    billing_order_id: "order-auto-base",
    billing_mode: "autopay_subscription",
    autopay_enabled: true,
    razorpay_subscription_id: "sub-auto-1",
    current_period_start: "2026-05-24T10:00:00.000Z",
    current_period_end: "2026-06-23T10:00:00.000Z",
    grace_until: "2026-06-30T10:00:00.000Z",
    metadata: {},
    created_at: "2026-05-24T10:00:00.000Z",
  });
  state.host_pro_subscription_rooms.push({
    id: "sub-auto-room-a1",
    subscription_id: "sub-auto-row-a",
    family_id: "fam-a",
    stay_unit_id: "a-room-1",
    room_name: "A Room 1",
    status: "active",
  });

  await processHostProAutopayWebhook(
    client,
    {
      eventName: "subscription.charged",
      providerEventId: "evt-auto-room-refresh",
      razorpaySubscriptionId: "sub-auto-1",
      razorpayPaymentId: "pay-auto-room-refresh",
      paymentStatus: "captured",
      subscriptionStatus: "active",
      amountPaise: 58900,
      paidAtIso: "2026-06-23T10:00:00.000Z",
      chargeAtIso: "2026-07-23T10:00:00.000Z",
      notes: { host_user_id: "host-1" },
    },
    {
      sendInvoiceEmail: async () => ({ deliveryId: "delivery-auto-room", providerMessageId: "msg-auto-room" }),
    }
  );

  const renewedOrder = state.host_pro_billing_orders.find((row) => row.gateway_payment_id === "pay-auto-room-refresh");
  assert.equal(renewedOrder?.property_count, 1);
  assert.equal(renewedOrder?.room_count, 2);
  assert.equal((renewedOrder?.metadata as Record<string, unknown>)?.renewal_scope_source, "live_active_inventory");

  const renewedRooms = state.host_pro_billing_order_rooms
    .filter((row) => row.billing_order_id === renewedOrder?.id)
    .map((row) => row.stay_unit_id)
    .sort();
  assert.deepEqual(renewedRooms, ["a-room-1", "a-room-2"]);
});

test("autopay renewal includes mid-cycle property add-ons and skips inactive properties", async () => {
  const { client, state } = createProBillingSupabase();
  state.families.push(
    {
      id: "fam-a",
      user_id: "host-1",
      name: "Alpha Stay",
      host_id: "A1",
      city: "Goa",
      state: "Goa",
      is_active: true,
    },
    {
      id: "fam-b",
      user_id: "host-1",
      name: "Beta Stay",
      host_id: "B1",
      city: "Jaipur",
      state: "Rajasthan",
      is_active: true,
    },
    {
      id: "fam-c",
      user_id: "host-1",
      name: "Gamma Stay",
      host_id: "C1",
      city: "Kochi",
      state: "Kerala",
      is_active: false,
    }
  );
  state.stay_units_v2.push({ id: "a-room-1", legacy_family_id: "fam-a", name: "A Room 1", is_active: true });
  state.host_pro_billing_orders.push(
    {
      id: "order-auto-prop-base",
      host_user_id: "host-1",
      source_family_id: "fam-a",
      status: "paid",
      property_count: 1,
      room_count: 1,
      subtotal_amount: 499,
      gst_amount: 90,
      total_amount: 589,
      gateway_subscription_id: "sub-auto-2",
      gateway_plan_id: "plan-auto-2",
      metadata: {},
      created_at: "2026-05-24T10:00:00.000Z",
    },
    {
      id: "addon-prop-active",
      host_user_id: "host-1",
      source_family_id: "fam-a",
      status: "paid",
      metadata: {
        order_kind: "addon",
        addon_type: "property",
        consumed_at: "2026-06-08T10:00:00.000Z",
        consumed_target_reference: "fam-b",
      },
      created_at: "2026-06-08T10:00:00.000Z",
    },
    {
      id: "addon-prop-inactive",
      host_user_id: "host-1",
      source_family_id: "fam-a",
      status: "paid",
      metadata: {
        order_kind: "addon",
        addon_type: "property",
        consumed_at: "2026-06-09T10:00:00.000Z",
        consumed_target_reference: "fam-c",
      },
      created_at: "2026-06-09T10:00:00.000Z",
    }
  );
  state.host_pro_billing_order_properties.push({
    id: "order-auto-prop-base-prop",
    billing_order_id: "order-auto-prop-base",
    family_id: "fam-a",
    property_name: "Alpha Stay",
    host_code: "A1",
    city: "Goa",
    state: "Goa",
  });
  state.host_pro_billing_order_rooms.push({
    id: "order-auto-prop-base-room",
    billing_order_id: "order-auto-prop-base",
    family_id: "fam-a",
    stay_unit_id: "a-room-1",
    room_name: "A Room 1",
  });
  state.host_pro_subscriptions.push({
    id: "sub-auto-row-base",
    family_id: "fam-a",
    host_user_id: "host-1",
    status: "active",
    billing_order_id: "order-auto-prop-base",
    billing_mode: "autopay_subscription",
    autopay_enabled: true,
    razorpay_subscription_id: "sub-auto-2",
    current_period_start: "2026-05-24T10:00:00.000Z",
    current_period_end: "2026-06-23T10:00:00.000Z",
    grace_until: "2026-06-30T10:00:00.000Z",
    metadata: {},
    created_at: "2026-05-24T10:00:00.000Z",
  });
  state.host_pro_subscription_rooms.push({
    id: "sub-auto-prop-room-a1",
    subscription_id: "sub-auto-row-base",
    family_id: "fam-a",
    stay_unit_id: "a-room-1",
    room_name: "A Room 1",
    status: "active",
  });

  await processHostProAutopayWebhook(
    client,
    {
      eventName: "subscription.charged",
      providerEventId: "evt-auto-prop-refresh",
      razorpaySubscriptionId: "sub-auto-2",
      razorpayPaymentId: "pay-auto-prop-refresh",
      paymentStatus: "captured",
      subscriptionStatus: "active",
      amountPaise: 58900,
      paidAtIso: "2026-06-23T10:00:00.000Z",
      chargeAtIso: "2026-07-23T10:00:00.000Z",
      notes: { host_user_id: "host-1" },
    },
    {
      sendInvoiceEmail: async () => ({ deliveryId: "delivery-auto-prop", providerMessageId: "msg-auto-prop" }),
    }
  );

  const renewedOrder = state.host_pro_billing_orders.find((row) => row.gateway_payment_id === "pay-auto-prop-refresh");
  assert.equal(renewedOrder?.property_count, 2);
  assert.equal(renewedOrder?.room_count, 1);

  const renewedProperties = state.host_pro_billing_order_properties
    .filter((row) => row.billing_order_id === renewedOrder?.id)
    .map((row) => row.family_id)
    .sort();
  assert.deepEqual(renewedProperties, ["fam-a", "fam-b"]);
});

test("renewal window starts from captured payment date and lasts exactly 30 days plus 7 day grace", () => {
  const renewal = computeProRenewalWindow({
    paidAtIso: "2026-05-24T10:00:00.000Z",
    durationMonths: 1,
  });

  assert.equal(PRO_BILLING_PERIOD_DAYS, 30);
  assert.equal(PRO_BILLING_GRACE_PERIOD_DAYS, 7);
  assert.equal(renewal.currentPeriodStart, "2026-05-24T10:00:00.000Z");
  assert.equal(renewal.currentPeriodEnd, "2026-06-23T10:00:00.000Z");
  assert.equal(renewal.graceUntil, "2026-06-30T10:00:00.000Z");
});

test("renewal extends from previous paid end instead of snapping to calendar month starts", () => {
  const renewal = computeProRenewalWindow({
    paidAtIso: "2026-05-24T10:00:00.000Z",
    previousCurrentPeriodEnd: "2026-05-30T10:00:00.000Z",
    durationMonths: 1,
  });

  assert.equal(renewal.currentPeriodStart, "2026-05-24T10:00:00.000Z");
  assert.equal(renewal.currentPeriodEnd, "2026-06-29T10:00:00.000Z");
  assert.equal(renewal.graceUntil, "2026-07-06T10:00:00.000Z");
});

test("3 month and 6 month validity use exact 90 and 180 day windows plus 7 day grace", () => {
  const threeMonth = computeProRenewalWindow({
    paidAtIso: "2026-05-24T10:00:00.000Z",
    durationMonths: 3,
  });
  const sixMonth = computeProRenewalWindow({
    paidAtIso: "2026-05-24T10:00:00.000Z",
    durationMonths: 6,
  });

  assert.equal(threeMonth.currentPeriodEnd, "2026-08-22T10:00:00.000Z");
  assert.equal(threeMonth.graceUntil, "2026-08-29T10:00:00.000Z");
  assert.equal(sixMonth.currentPeriodEnd, "2026-11-20T10:00:00.000Z");
  assert.equal(sixMonth.graceUntil, "2026-11-27T10:00:00.000Z");
});

test("Pro entitlement opens only during a paid active period and defaults to free during grace", async () => {
  const subscription = {
    status: "active",
    current_period_start: "2026-05-24T10:00:00.000Z",
    current_period_end: "2026-06-23T10:00:00.000Z",
    grace_until: "2026-06-30T10:00:00.000Z",
  };

  const active = deriveProAccessStatus(subscription, { now: new Date("2026-06-10T10:00:00.000Z") });
  const grace = deriveProAccessStatus(subscription, { now: new Date("2026-06-25T10:00:00.000Z") });
  const paused = deriveProAccessStatus(subscription, { now: new Date("2026-07-02T10:00:00.000Z") });

  assert.equal(active.status, "active");
  assert.equal(active.allowed, true);
  assert.equal(active.paidActive, true);
  assert.equal(active.inGrace, false);
  assert.equal(active.defaultWorkspace, "pro");
  assert.equal(active.proActionsAllowed, true);
  assert.equal(active.reason, "active");
  assert.equal(grace.status, "grace");
  assert.equal(grace.allowed, false);
  assert.equal(grace.paidActive, false);
  assert.equal(grace.inGrace, true);
  assert.equal(grace.defaultWorkspace, "free");
  assert.equal(grace.proActionsAllowed, false);
  assert.equal(grace.reason, "grace");
  assert.equal(paused.status, "paused");
  assert.equal(paused.allowed, false);
  assert.equal(paused.paidActive, false);
  assert.equal(paused.inGrace, false);
  assert.equal(paused.defaultWorkspace, "free");
  assert.equal(paused.proActionsAllowed, false);
  assert.equal(paused.reason, "expired");
  assert.deepEqual(
    getFamloProEntitlement(subscription, { now: new Date("2026-06-25T10:00:00.000Z") }),
    {
      paidActive: false,
      inGrace: true,
      graceUntil: "2026-06-30T10:00:00.000Z",
      expiresAt: "2026-06-23T10:00:00.000Z",
      defaultWorkspace: "free",
      proActionsAllowed: false,
      reason: "grace",
    }
  );
  assert.equal(canUseProFeature({ subscription, now: new Date("2026-07-02T10:00:00.000Z") }), false);
});

test("paused or locked Pro subscriptions default to free and block Pro actions", () => {
  const paused = getFamloProEntitlement(
    {
      status: "paused",
      current_period_end: "2026-07-23T10:00:00.000Z",
      grace_until: "2026-07-30T10:00:00.000Z",
    },
    { now: new Date("2026-06-25T10:00:00.000Z") }
  );
  const locked = getFamloProEntitlement(
    {
      status: "halted",
      current_period_end: "2026-07-23T10:00:00.000Z",
      grace_until: "2026-07-30T10:00:00.000Z",
    },
    { now: new Date("2026-06-25T10:00:00.000Z") }
  );

  assert.equal(paused.paidActive, false);
  assert.equal(paused.defaultWorkspace, "free");
  assert.equal(paused.proActionsAllowed, false);
  assert.equal(paused.reason, "paused");
  assert.equal(locked.paidActive, false);
  assert.equal(locked.defaultWorkspace, "free");
  assert.equal(locked.proActionsAllowed, false);
  assert.equal(locked.reason, "locked");
});

test("markExpiredProSubscriptionsPaused persists grace and paused lifecycle transitions", async () => {
  const { client, state } = createProBillingSupabase();
  state.host_pro_subscriptions.push(
    {
      id: "sub-grace",
      family_id: "fam-a",
      status: "active",
      current_period_start: "2026-05-24T10:00:00.000Z",
      current_period_end: "2026-06-23T10:00:00.000Z",
      grace_until: "2026-06-30T10:00:00.000Z",
      created_at: "2026-05-24T10:00:00.000Z",
    },
    {
      id: "sub-paused",
      family_id: "fam-b",
      status: "grace",
      current_period_start: "2026-05-01T10:00:00.000Z",
      current_period_end: "2026-05-31T10:00:00.000Z",
      grace_until: "2026-06-07T10:00:00.000Z",
      created_at: "2026-05-01T10:00:00.000Z",
    }
  );

  const result = await markExpiredProSubscriptionsPaused(client, new Date("2026-06-25T10:00:00.000Z"));
  assert.equal(result.updatedCount, 2);
  assert.equal(state.host_pro_subscriptions.find((row) => row.id === "sub-grace")?.status, "grace");
  assert.equal(state.host_pro_subscriptions.find((row) => row.id === "sub-paused")?.status, "paused");
});

test("captured renewal extends access and stays selected-scope only", async () => {
  const { client, state } = createProBillingSupabase();
  state.host_pro_subscriptions.push({
    id: "legacy-sub",
    family_id: "fam-a",
    host_user_id: "host-1",
    status: "active",
    current_period_start: "2026-05-01T10:00:00.000Z",
    current_period_end: "2026-06-01T10:00:00.000Z",
    grace_until: "2026-06-08T10:00:00.000Z",
    created_at: "2026-05-01T10:00:00.000Z",
    metadata: {},
  });
  state.host_pro_billing_orders.push({
    id: "order-renew",
    host_user_id: "host-1",
    status: "payment_pending",
    total_amount: 589,
    scope_hash: "scope-renew",
    gateway_order_id: "order_rzp_renew",
  });
  state.host_pro_billing_order_properties.push({
    id: "order-renew-prop",
    billing_order_id: "order-renew",
    family_id: "fam-a",
    property_name: "Alpha Stay",
    host_code: "A1",
    city: "Goa",
    state: "Goa",
  });
  state.host_pro_billing_order_rooms.push({
    id: "order-renew-room",
    billing_order_id: "order-renew",
    family_id: "fam-a",
    stay_unit_id: "a-room-1",
    room_name: "A Room 1",
  });

  await finalizeCapturedHostProBillingOrder(
    client,
    {
      billingOrderId: "order-renew",
      gatewayOrderId: "order_rzp_renew",
      gatewayPaymentId: "pay_renew",
      providerPaymentStatus: "captured",
      providerAmountPaise: 58900,
      paidAtIso: "2026-05-24T10:00:00.000Z",
    },
    {
      sendInvoiceEmail: async () => ({ deliveryId: "delivery-renew", providerMessageId: "msg-renew" }),
    }
  );

  const activeSubscription = state.host_pro_subscriptions.find((row) => row.billing_order_id === "order-renew");
  assert.equal(activeSubscription?.current_period_start, "2026-05-24T10:00:00.000Z");
  assert.equal(activeSubscription?.current_period_end, "2026-07-01T10:00:00.000Z");
  assert.equal(activeSubscription?.grace_until, "2026-07-08T10:00:00.000Z");
});

test("one-time Razorpay order flow remains the default checkout path when autopay is disabled", async () => {
  const { client, state } = createProBillingSupabase();
  state.families.push({ id: "fam-a", user_id: "host-1", name: "Alpha", property_name: "Alpha Stay", host_id: "A1", city: "Goa", state: "Goa" });
  state.stay_units_v2.push({ id: "a-room-1", legacy_family_id: "fam-a", name: "A Room 1", is_active: true, sort_order: 1 });

  const previousKeyId = process.env.RAZORPAY_KEY_ID;
  const previousKeySecret = process.env.RAZORPAY_KEY_SECRET;
  process.env.RAZORPAY_KEY_ID = "rzp_test_key";
  process.env.RAZORPAY_KEY_SECRET = "rzp_test_secret";

  try {
    const checkout = await createHostProBillingCheckout(
      client,
      {
        hostUserId: "host-1",
        sourceFamilyId: "fam-a",
        selections: [{ familyId: "fam-a", roomIds: ["a-room-1"] }],
        durationMonths: 6,
      },
      {
        createOrder: async ({ amountRupees, receipt, notes }) => ({
          id: `order_${receipt}`,
          entity: "order",
          amount: amountRupees * 100,
          amount_paid: 0,
          amount_due: amountRupees * 100,
          currency: "INR",
          receipt,
          status: "created",
          attempts: 0,
          created_at: 1716500000,
          notes: notes ?? {},
        }),
      }
    );

    assert.equal(isFamloProAutopayEnabled(), false);
    assert.equal(checkout.checkoutMode, "order");
    assert.equal(checkout.autopayEnabled, false);
    assert.equal(checkout.quote.durationMonths, 6);
    assert.equal(checkout.order.amount, 353300);
    assert.equal(state.host_pro_billing_orders[0]?.status, "payment_pending");
    assert.equal(state.host_pro_billing_orders[0]?.total_amount, 3533);
  } finally {
    if (previousKeyId == null) {
      delete process.env.RAZORPAY_KEY_ID;
    } else {
      process.env.RAZORPAY_KEY_ID = previousKeyId;
    }
    if (previousKeySecret == null) {
      delete process.env.RAZORPAY_KEY_SECRET;
    } else {
      process.env.RAZORPAY_KEY_SECRET = previousKeySecret;
    }
  }
});

test("admin Famlo Pro view reports scoped counts and profit summary", () => {
  const summaryView = buildAdminFamloProAccessView({
    subscriptions: [
      {
        id: "sub-a",
        family_id: "fam-a",
        host_user_id: "host-1",
        primary_pro_property_id: "fam-a",
        status: "active",
        current_period_start: "2026-05-24T10:00:00.000Z",
        current_period_end: "2026-08-22T10:00:00.000Z",
        grace_until: "2026-08-29T10:00:00.000Z",
        billing_order_id: "order-a",
        metadata: { duration_months: 3 },
      },
    ],
    families: [
      { id: "fam-a", user_id: "host-1", name: "Alpha", property_name: "Alpha Stay", host_id: "A1", city: "Goa", state: "Goa", is_active: true, created_at: "2026-05-20T10:00:00.000Z" },
    ],
    stayUnits: [
      { id: "a-room-1", legacy_family_id: "fam-a", is_active: true, unit_key: "a-room-1", host_id: "host-row-1" },
      { id: "a-room-2", legacy_family_id: "fam-a", is_active: true, unit_key: "a-room-2", host_id: "host-row-1" },
    ],
    subscriptionRooms: [
      { subscription_id: "sub-a", family_id: "fam-a", stay_unit_id: "a-room-1", room_name: "A Room 1", status: "active" },
      { subscription_id: "sub-a", family_id: "fam-a", stay_unit_id: "a-room-2", room_name: "A Room 2", status: "active" },
    ],
    orderProperties: [
      { billing_order_id: "order-a", family_id: "fam-a", property_name: "Alpha Stay" },
    ],
    hosts: [{ user_id: "host-1", display_name: "Sam" }],
    users: [{ id: "host-1", name: "Sam" }],
    orders: [
      { id: "order-a", host_user_id: "host-1", status: "paid", property_count: 1, room_count: 2, subtotal_amount: 399, gst_amount: 72, total_amount: 471, created_at: "2026-05-24T10:00:00.000Z", payment_captured_at: "2026-05-24T10:05:00.000Z" },
    ],
    invoices: [],
  });

  assert.equal(summaryView.rows[0]?.hostName, "Sam");
  assert.equal(summaryView.rows[0]?.scopedPropertiesCount, 1);
  assert.equal(summaryView.rows[0]?.scopedRoomsCount, 2);
  assert.equal(summaryView.rows[0]?.purchasedDuration, "3 months");
  assert.equal(summaryView.summary.totalCollected, 471);
  assert.equal(summaryView.summary.proRevenue, 399);
  assert.equal(summaryView.summary.proGst, 72);
  assert.equal(summaryView.summary.proProfit, 244);
});
