import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { applyFamilyWorkspacePolicyState } from "@/lib/family-approval";

type Row = Record<string, unknown>;

function createPolicySupabase() {
  const state = {
    families: [{ id: "fam-pro-only", property_marketplace_status: "under_review", trust_status: "normal" }] as Row[],
    hosts: [{ id: "host-pro-only", legacy_family_id: "fam-pro-only", status: "published", property_marketplace_status: "under_review", trust_status: "normal" }] as Row[],
    host_onboarding_drafts: [{ id: "draft-pro-only", family_id: null, listing_status: "submitted", property_marketplace_status: "under_review", trust_status: "normal" }] as Row[],
    family_applications: [{ id: "app-pro-only", status: "pending", approved_family_id: null, property_marketplace_status: "under_review", trust_status: "normal" }] as Row[],
  };

  function matches(filters: Array<{ column: string; value: unknown }>) {
    return (row: Row) => filters.every((filter) => row[filter.column] === filter.value);
  }

  return {
    state,
    client: {
      from(table: keyof typeof state) {
        const rows = state[table];
        return {
          update(payload: Row) {
            const filters: Array<{ column: string; value: unknown }> = [];
            const runner: any = {
              eq(column: string, value: unknown) {
                filters.push({ column, value });
                return this;
              },
              async then(resolve: (value: { error: null }) => unknown) {
                for (const row of rows.filter(matches(filters))) {
                  Object.assign(row, payload);
                }
                return resolve({ error: null });
              },
            };
            return runner;
          },
        };
      },
    },
  };
}

test("admin marks draft as not_listed_allow_pro and workspace policy is preserved", async () => {
  const { client, state } = createPolicySupabase();

  await applyFamilyWorkspacePolicyState(client as never, {
    familyId: "fam-pro-only",
    hostId: "host-pro-only",
    onboardingDraftId: "draft-pro-only",
    applicationId: "app-pro-only",
    propertyMarketplaceStatus: "not_listed",
    trustStatus: "normal",
    reviewNotes: "Marketplace not suitable, Pro allowed.",
    draftListingStatus: "paused",
    applicationStatus: "approved",
  });

  assert.equal(state.families[0]?.property_marketplace_status, "not_listed");
  assert.equal(state.hosts[0]?.property_marketplace_status, "not_listed");
  assert.equal(state.hosts[0]?.trust_status, "normal");
  assert.equal(state.host_onboarding_drafts[0]?.listing_status, "paused");
  assert.equal(state.host_onboarding_drafts[0]?.family_id, "fam-pro-only");
  assert.equal(state.family_applications[0]?.status, "approved");
  assert.equal(state.family_applications[0]?.approved_family_id, "fam-pro-only");
});

test("admin block completely marks workspace as trust blocked without deleting data", async () => {
  const { client, state } = createPolicySupabase();

  await applyFamilyWorkspacePolicyState(client as never, {
    familyId: "fam-pro-only",
    hostId: "host-pro-only",
    onboardingDraftId: "draft-pro-only",
    applicationId: "app-pro-only",
    propertyMarketplaceStatus: "rejected",
    trustStatus: "blocked",
    reviewNotes: "Fraud risk.",
    draftListingStatus: "rejected",
    applicationStatus: "rejected",
  });

  assert.equal(state.families.length, 1);
  assert.equal(state.hosts.length, 1);
  assert.equal(state.families[0]?.property_marketplace_status, "rejected");
  assert.equal(state.families[0]?.trust_status, "blocked");
  assert.equal(state.hosts[0]?.trust_status, "blocked");
  assert.equal(state.host_onboarding_drafts[0]?.listing_status, "rejected");
  assert.equal(state.family_applications[0]?.status, "rejected");
});

test("teams vetting route exposes separate marketplace, Pro-only, and trust-block actions", () => {
  const repoRoot = process.cwd();
  const routeSource = fs.readFileSync(path.join(repoRoot, "app/api/teams/vetting/decide/route.ts"), "utf8");
  const checkoutRouteSource = fs.readFileSync(path.join(repoRoot, "app/api/host/pro/billing/checkout/route.ts"), "utf8");
  const autopayCheckoutRouteSource = fs.readFileSync(
    path.join(repoRoot, "app/api/host/pro/billing/autopay/checkout/route.ts"),
    "utf8"
  );
  const checkoutPolicySource = fs.readFileSync(path.join(repoRoot, "lib/host-pro-checkout-policy.ts"), "utf8");
  const viewMigration = fs.readFileSync(
    path.join(repoRoot, "supabase/migrations/20260611000002_pro_only_workspace_public_view.sql"),
    "utf8"
  );

  assert.match(routeSource, /not_listed_allow_pro/);
  assert.match(routeSource, /block_completely/);
  assert.match(routeSource, /provisionFamilyApplicationForProOnly/);
  assert.match(routeSource, /blockFamilyApplicationCompletely/);
  assert.match(checkoutRouteSource, /loadFamloProCheckoutAccess/);
  assert.match(autopayCheckoutRouteSource, /loadFamloProCheckoutAccess/);
  assert.match(checkoutPolicySource, /canBuyFamloPro/);
  assert.match(checkoutPolicySource, /trust_status/);
  assert.match(viewMigration, /property_marketplace_status/);
  assert.match(viewMigration, /trust_status/);
  assert.match(viewMigration, /where h\.status = 'published'/);
});

test("legacy admin update-status blocks host-only Pro decisions and syncs family rejection through shared policy", () => {
  const repoRoot = process.cwd();
  const legacyRouteSource = fs.readFileSync(path.join(repoRoot, "app/api/admin/update-status/route.ts"), "utf8");

  assert.match(legacyRouteSource, /decisionAction/);
  assert.match(legacyRouteSource, /not_listed_allow_pro/);
  assert.match(legacyRouteSource, /block_completely/);
  assert.match(legacyRouteSource, /must use \/api\/teams\/vetting\/decide/);
  assert.match(legacyRouteSource, /applyFamilyWorkspacePolicyState/);
  assert.match(legacyRouteSource, /propertyMarketplaceStatus: "rejected"/);
  assert.match(legacyRouteSource, /trustStatus: "normal"/);
});
