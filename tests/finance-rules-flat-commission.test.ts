import assert from "node:assert/strict";
import test from "node:test";

import { resolveFinanceRules } from "@/lib/finance/rules";

function createRulesSupabase() {
  return {
    from(table: string) {
      const builder: any = {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        order() {
          return this;
        },
        limit() {
          return this;
        },
        async maybeSingle() {
          if (table === "finance_rule_sets") {
            return {
              data: {
                id: "ruleset-1",
                calculation_mode: "commission_gst_only",
                effective_from: "2026-01-01T00:00:00.000Z",
                effective_to: null,
              },
              error: null,
            };
          }

          return { data: null, error: null };
        },
        then(resolve: (value: { data: Array<Record<string, unknown>>; error: null }) => unknown) {
          if (table === "commission_rules") {
            return Promise.resolve(
              resolve({
                data: [
                  {
                    id: "commission-rule-1",
                    rate_bps: 1800,
                    priority: 1,
                    effective_from: "2026-01-01T00:00:00.000Z",
                    effective_to: null,
                    is_preview: false,
                    product_type: "host_stay",
                    target_type: "product_type",
                    target_id: null,
                  },
                ],
                error: null,
              })
            );
          }

          if (table === "tax_rules") {
            return Promise.resolve(
              resolve({
                data: [
                  {
                    id: "tax-rule-1",
                    rate_bps: 1800,
                    priority: 1,
                    effective_from: "2026-01-01T00:00:00.000Z",
                    effective_to: null,
                    is_preview: false,
                    product_type: "host_stay",
                    calculation_target: "platform_fee",
                  },
                ],
                error: null,
              })
            );
          }

          return Promise.resolve(resolve({ data: [], error: null }));
        },
      };

      return builder;
    },
  } as any;
}

test("host_stay finance rules ignore legacy non-16 commission data", async () => {
  const result = await resolveFinanceRules(createRulesSupabase(), {
    effectiveAt: "2026-05-24T10:00:00.000Z",
    productType: "host_stay",
    hostUserId: "host-1",
  });

  assert.equal(result.commissionRateBps, 1600);
  assert.equal(result.warnings.some((warning) => warning.includes("flat 16%")), true);
});
