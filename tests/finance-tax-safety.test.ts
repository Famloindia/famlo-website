import assert from "node:assert/strict";
import test from "node:test";

import { planFinanceEventContract } from "@/lib/finance/folio-event-pipeline";
import { getFinanceSettings } from "@/lib/finance/settings";
import { approveSettlementDraft } from "@/lib/finance/settlement-engine";
import {
  assertTaxArtifactAllowed,
  assertGstExportAllowed,
  assertGstInvoiceAllowed,
  assertTaxCollectionAllowed,
  getSafeTaxDisplayState,
} from "@/lib/finance/tax-compliance-guard";

function createMissingFinanceSettingsSupabase() {
  return {
    from() {
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        is() {
          return this;
        },
        async maybeSingle() {
          return {
            data: null,
            error: {
              code: "42P01",
              message: "relation public.finance_settings does not exist",
            },
          };
        },
      };
    },
  } as any;
}

function createSettlementApprovalSupabase() {
  let settlement = {
    id: "settlement-1",
    status: "draft",
    approved_by: null,
    approved_at: null,
    paid_at: null,
    transfer_reference: null,
    provider: null,
  } as Record<string, unknown>;
  const touchedTables: string[] = [];

  const client = {
    from(table: string) {
      touchedTables.push(table);

      if (table === "host_settlements_v2") {
        let lookupId: string | null = null;
        return {
          select() {
            return this;
          },
          eq(_column: string, value: unknown) {
            lookupId = String(value);
            return this;
          },
          async maybeSingle() {
            return {
              data: lookupId === settlement.id ? settlement : null,
              error: null,
            };
          },
          update(payload: Record<string, unknown>) {
            return {
              eq(_column: string, value: unknown) {
                return {
                  select() {
                    return {
                      async single() {
                        if (String(value) !== settlement.id) {
                          return { data: null, error: new Error("Settlement not found.") };
                        }
                        settlement = { ...settlement, ...payload };
                        return { data: settlement, error: null };
                      },
                    };
                  },
                };
              },
            };
          },
        };
      }

      if (table === "finance_audit_logs") {
        return {
          async insert() {
            return { data: null, error: null };
          },
        };
      }

      throw new Error(`Unexpected table access: ${table}`);
    },
  } as any;

  return { client, touchedTables, getSettlement: () => settlement };
}

test("settings resolver fallback returns safe defaults when finance_settings is missing", async () => {
  const settings = await getFinanceSettings({}, createMissingFinanceSettingsSupabase());

  assert.equal(settings.taxMode, "PENDING_COMPLIANCE");
  assert.equal(settings.gstCollectionEnabled, false);
  assert.equal(settings.tcsEnabled, false);
  assert.equal(settings.tdsEnabled, false);
  assert.equal(settings.gstExportEnabled, false);
  assert.equal(settings.gstInvoiceGenerationEnabled, false);
  assert.equal(settings.defaultPlatformFeeBps, 1600);
  assert.equal(settings.payoutReleasePolicy, "AFTER_CHECKOUT");
});

test("tax compliance guard blocks GST collection under pending compliance", () => {
  assert.throws(
    () =>
      assertTaxCollectionAllowed({
        id: null,
        scopeType: "GLOBAL",
        scopeId: null,
        taxMode: "PENDING_COMPLIANCE",
        gstCollectionEnabled: false,
        tcsEnabled: false,
        tdsEnabled: false,
        gstExportEnabled: false,
        gstInvoiceGenerationEnabled: false,
        defaultPlatformFeeBps: 1600,
        payoutReleasePolicy: "AFTER_CHECKOUT",
        complianceNotes: null,
        approvedBy: null,
        approvedAt: null,
        metadata: {},
      }),
    /PENDING_COMPLIANCE/
  );
});

test("GST export and invoice generation are blocked by default", () => {
  const settings = {
    id: null,
    scopeType: "GLOBAL",
    scopeId: null,
    taxMode: "PENDING_COMPLIANCE" as const,
    gstCollectionEnabled: false,
    tcsEnabled: false,
    tdsEnabled: false,
    gstExportEnabled: false,
    gstInvoiceGenerationEnabled: false,
    defaultPlatformFeeBps: 1600,
    payoutReleasePolicy: "AFTER_CHECKOUT",
    complianceNotes: null,
    approvedBy: null,
    approvedAt: null,
    metadata: {},
  };

  assert.throws(() => assertGstExportAllowed(settings), /GST export/);
  assert.throws(() => assertGstInvoiceAllowed(settings), /GST invoice/);
  assert.throws(() => assertTaxArtifactAllowed(settings, "CREATE_TAX_INVOICE"), /Tax invoice/);
  assert.throws(() => assertTaxArtifactAllowed(settings, "CREATE_CREDIT_NOTE"), /credit note/i);
});

test("safe tax display state keeps host and admin copy disabled", () => {
  const display = getSafeTaxDisplayState({
    id: null,
    scopeType: "GLOBAL",
    scopeId: null,
    taxMode: "PENDING_COMPLIANCE",
    gstCollectionEnabled: false,
    tcsEnabled: false,
    tdsEnabled: false,
    gstExportEnabled: false,
    gstInvoiceGenerationEnabled: false,
    defaultPlatformFeeBps: 1600,
    payoutReleasePolicy: "AFTER_CHECKOUT",
    complianceNotes: null,
    approvedBy: null,
    approvedAt: null,
    metadata: {},
  });

  assert.equal(display.gstCollectionLabel, "Disabled");
  assert.equal(display.tcsLabel, "Disabled");
  assert.equal(display.tdsLabel, "Disabled");
  assert.equal(display.gstInvoiceLabel, "Disabled");
  assert.equal(display.taxMode, "PENDING_COMPLIANCE");
  assert.match(display.hostTaxMessage, /GST collection is disabled/i);
  assert.match(display.adminTaxMessage, /locked until compliance is explicitly approved/i);
});

test("folio tax placeholders remain absent from default planned line writes", () => {
  const result = planFinanceEventContract({
    bookingId: "booking-1",
    eventType: "BOOKING_CREATED",
    sourceEventId: "booking-1",
    calculationVersion: "batch6-tax-lock-v1",
    bookingAmount: 10000,
    platformFeeAmount: 1600,
    hostPayoutAmount: 8400,
    sourceChannel: "famlo_direct",
  });

  assert.deepEqual(
    result.plannedLines.map((line) => line.lineCode),
    ["ROOM_CHARGE", "PLATFORM_FEE", "HOST_PAYOUT_PENDING"]
  );
});

test("settlement approval does not execute payout or mark settlement paid", async () => {
  const { client, touchedTables, getSettlement } = createSettlementApprovalSupabase();
  const result = await approveSettlementDraft(client, {
    settlementId: "settlement-1",
    actorUserId: "admin-1",
  });

  assert.equal(result.status, "approved");
  assert.equal(result.paid_at, null);
  assert.equal(result.transfer_reference, null);
  assert.equal(result.provider, null);
  assert.equal(touchedTables.includes("payouts_v2"), false);
  assert.equal(touchedTables.includes("payout_transfers_v2"), false);
  assert.equal(getSettlement().status, "approved");
});
