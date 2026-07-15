import assert from "node:assert/strict";
import test from "node:test";

import {
  describeHostEmptyState,
  loadHostInvoiceRows,
  loadHostPayoutAccountView,
  loadHostSettlementDetail,
} from "@/lib/finance/host-finance-ui";
import { getAdminFinanceBlockedReasons, loadAdminReportsView } from "@/lib/finance/admin-finance-ui";

function createUiSupabase() {
  const state = {
    bookings_v2: [] as Array<Record<string, unknown>>,
    platform_fee_invoices: [] as Array<Record<string, unknown>>,
    credit_notes: [] as Array<Record<string, unknown>>,
    finance_email_deliveries: [] as Array<Record<string, unknown>>,
    host_payout_accounts: [] as Array<Record<string, unknown>>,
    host_tax_details: [] as Array<Record<string, unknown>>,
    host_settlements_v2: [] as Array<Record<string, unknown>>,
    settlement_line_items_v2: [] as Array<Record<string, unknown>>,
    guest_tax_invoices: [] as Array<Record<string, unknown>>,
    hosts: [] as Array<Record<string, unknown>>,
    payments_v2: [] as Array<Record<string, unknown>>,
    payment_provider_events: [] as Array<Record<string, unknown>>,
    finance_settings: [] as Array<Record<string, unknown>>,
    refund_requests: [] as Array<Record<string, unknown>>,
    reservation_folios_v2: [] as Array<Record<string, unknown>>,
    host_payout_executions: [] as Array<Record<string, unknown>>,
  };

  function matches(row: Record<string, unknown>, filters: Array<{ column: string; op: string; value: unknown }>) {
    return filters.every((filter) => {
      if (filter.op === "eq") return row[filter.column] === filter.value;
      if (filter.op === "in") return Array.isArray(filter.value) && filter.value.includes(row[filter.column]);
      return true;
    });
  }

  return {
    state,
    client: {
      from(table: string) {
        const rows = (state as Record<string, Array<Record<string, unknown>>>)[table] ?? [];
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
          maybeSingle: async () => {
            const found = rows.filter((row) => matches(row, filters))[0] ?? null;
            return { data: found, error: null };
          },
          then(resolve: (value: { data: Array<Record<string, unknown>>; error: null }) => unknown) {
            const data = rows
              .filter((row) => matches(row, filters))
              .sort((left, right) => {
                if (!orderBy) return 0;
                const leftValue = String(left[orderBy.column] ?? "");
                const rightValue = String(right[orderBy.column] ?? "");
                return orderBy.ascending ? leftValue.localeCompare(rightValue) : rightValue.localeCompare(leftValue);
              });
            return Promise.resolve(resolve({ data, error: null }));
          },
        };
        return builder;
      },
    } as any,
  };
}

test("host cannot load another host settlement detail", async () => {
  const { client, state } = createUiSupabase();
  state.host_settlements_v2.push({
    id: "settlement-1",
    host_id: "host-a",
    settlement_code: "SET-1",
    status: "approved",
  });

  const detail = await loadHostSettlementDetail(client, "host-b", "settlement-1");
  assert.equal(detail, null);
});

test("host dashboard empty state copy is available", () => {
  const empty = describeHostEmptyState("settlements");
  assert.match(empty.title, /No settlements yet/);
});

test("host payout account shows action-required state and no raw bank number", async () => {
  const { client, state } = createUiSupabase();
  state.host_tax_details.push({
    user_id: "user-1",
    verification_status: "pending",
    is_verified: false,
    pan_holder_name: "Host Legal Name",
    pan_last_four: "1234",
  });
  state.host_payout_accounts.push({
    host_id: "host-1",
    provider: "RAZORPAYX",
    account_holder_name: "Host Legal Name",
    account_number_masked: "******9876",
    ifsc: "HDFC0001",
    validation_status: "pending",
    is_active: false,
  });

  const view = await loadHostPayoutAccountView(client, {
    hostId: "host-1",
    hostUserId: "user-1",
    familyId: null,
    displayName: "Host 1",
  });

  assert.equal(view.accountStatus.includes("Action") || view.accountStatus.includes("Blocked"), true);
  assert.equal(view.payoutDestination.includes("9876543210"), false);
  assert.equal(view.payoutDestination.includes("******9876"), true);
});

test("invoice download list only includes own documents", async () => {
  const { client, state } = createUiSupabase();
  state.bookings_v2.push({ id: "booking-own", host_id: "host-1" }, { id: "booking-other", host_id: "host-2" });
  state.platform_fee_invoices.push(
    { id: "inv-own", host_id: "host-1", booking_id: "booking-own", invoice_number: "PFI-1", total_amount: 1600, status: "issued", issued_at: "2026-05-21" },
    { id: "inv-other", host_id: "host-2", booking_id: "booking-other", invoice_number: "PFI-2", total_amount: 1600, status: "issued", issued_at: "2026-05-21" }
  );
  state.credit_notes.push(
    { id: "cn-own", booking_id: "booking-own", credit_note_number: "CN-1", total_reversal_amount: 300, status: "issued", issued_at: "2026-05-21", original_invoice_type: "platform_fee_invoice" },
    { id: "cn-other", booking_id: "booking-other", credit_note_number: "CN-2", total_reversal_amount: 300, status: "issued", issued_at: "2026-05-21", original_invoice_type: "platform_fee_invoice" }
  );

  const rows = await loadHostInvoiceRows(client, "host-1");
  assert.deepEqual(
    rows.map((row) => row.id).sort(),
    ["cn-own", "inv-own"]
  );
});

test("disabled admin actions explain blocked reasons and reports use existing endpoints", async () => {
  const blocked = getAdminFinanceBlockedReasons("PENDING_COMPLIANCE");
  assert.match(blocked.guestInvoice ?? "", /PENDING_COMPLIANCE/);
  assert.match(blocked.reports ?? "", /GST exports/);

  const { client } = createUiSupabase();
  const reports = await loadAdminReportsView(client, {
    startDate: "2026-05-01",
    endDate: "2026-05-31",
  });
  assert.equal(reports.links.every((link) => link.href.startsWith("/api/admin/finance/reports/")), true);
});
