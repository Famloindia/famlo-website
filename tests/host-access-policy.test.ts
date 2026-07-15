import assert from "node:assert/strict";
import test from "node:test";

import {
  canAccessFamloPro,
  canBuyFamloPro,
  canListOnMarketplace,
  canUseChannelManager,
  getHostDashboardMode,
  getHostMarketplaceReviewMode,
  normalizeMarketplaceStatus,
} from "../lib/host-access-policy";

const publicContent = {
  has_minimum_public_content: true,
  is_active: true,
  is_accepting: true,
};

test("approved marketplace + active Pro => public listing visible + Pro access allowed", () => {
  const property = { ...publicContent, property_marketplace_status: "approved", trust_status: "normal" };
  const subscription = { pro_access_status: "active" };

  assert.equal(canListOnMarketplace(property).allowed, true);
  assert.equal(canAccessFamloPro(property, subscription).allowed, true);
  assert.equal(getHostDashboardMode({ property, subscription }), "pro");
});

test("not listed marketplace + active Pro => public listing hidden + Pro access allowed", () => {
  const property = { ...publicContent, property_marketplace_status: "not_listed", trust_status: "normal" };
  const subscription = { pro_access_status: "active" };

  assert.equal(canListOnMarketplace(property).allowed, false);
  assert.equal(canListOnMarketplace(property).reason, "marketplace_not_listed");
  assert.equal(canAccessFamloPro(property, subscription).allowed, true);
  assert.equal(canBuyFamloPro(property).allowed, true);
  assert.equal(getHostMarketplaceReviewMode(property), "pro_allowed_not_listed");
});

test("under review + no Pro => public listing hidden + Pro upsell allowed", () => {
  const property = { ...publicContent, property_marketplace_status: "under_review", trust_status: "normal" };
  const subscription = { pro_access_status: "none" };

  assert.equal(canListOnMarketplace(property).allowed, false);
  assert.equal(canBuyFamloPro(property).allowed, true);
  assert.equal(canAccessFamloPro(property, subscription).allowed, false);
  assert.equal(getHostDashboardMode({ property, subscription }), "free");
  assert.equal(getHostMarketplaceReviewMode(property), "marketplace_under_review");
});

test("under review + active Pro => public listing hidden + Pro access allowed", () => {
  const property = { ...publicContent, property_marketplace_status: "under_review", trust_status: "normal" };
  const subscription = { pro_access_status: "active" };

  assert.equal(canListOnMarketplace(property).allowed, false);
  assert.equal(canAccessFamloPro(property, subscription).allowed, true);
});

test("trust blocked + active Pro => public listing hidden + Pro access blocked", () => {
  const property = { ...publicContent, property_marketplace_status: "approved", trust_status: "blocked" };
  const subscription = { pro_access_status: "active" };

  assert.equal(canListOnMarketplace(property).allowed, false);
  assert.equal(canListOnMarketplace(property).reason, "trust_blocked");
  assert.equal(canAccessFamloPro(property, subscription).allowed, false);
  assert.equal(getHostDashboardMode({ property, subscription }), "blocked");
  assert.equal(getHostMarketplaceReviewMode(property), "blocked");
});

test("trust blocked + no Pro => checkout blocked", () => {
  const property = { ...publicContent, property_marketplace_status: "under_review", trust_status: "blocked" };

  assert.equal(canBuyFamloPro(property).allowed, false);
  assert.equal(canBuyFamloPro(property).reason, "trust_blocked");
});

test("admin paused Pro + marketplace approved => public listing may stay visible but Pro access blocked", () => {
  const property = { ...publicContent, property_marketplace_status: "approved", trust_status: "normal" };
  const subscription = { pro_access_status: "admin_paused" };

  assert.equal(canListOnMarketplace(property).allowed, true);
  assert.equal(canAccessFamloPro(property, subscription).allowed, false);
  assert.equal(getHostDashboardMode({ property, subscription }), "pro_paused");
});

test("expired Pro + marketplace approved => public listing visible but Pro access blocked/renewal required", () => {
  const property = { ...publicContent, property_marketplace_status: "approved", trust_status: "normal" };
  const subscription = { pro_access_status: "expired" };

  assert.equal(canListOnMarketplace(property).allowed, true);
  assert.equal(canAccessFamloPro(property, subscription).allowed, false);
  assert.equal(getHostDashboardMode({ property, subscription }), "renewal_required");
});

test("grace Pro does not grant workspace or channel manager access", () => {
  const property = { ...publicContent, property_marketplace_status: "approved", trust_status: "normal" };
  const subscription = { pro_access_status: "grace" };

  assert.equal(canAccessFamloPro(property, subscription).allowed, false);
  assert.equal(getHostDashboardMode({ property, subscription }), "renewal_required");
  assert.equal(
    canUseChannelManager({
      property,
      subscription,
      mappingExists: true,
    }).allowed,
    false
  );
});

test("channel manager cannot sync unless Pro is active and trust not blocked", () => {
  assert.equal(
    canUseChannelManager({
      property: { ...publicContent, trust_status: "normal" },
      subscription: { pro_access_status: "active" },
      mappingExists: true,
    }).allowed,
    true
  );
  assert.equal(
    canUseChannelManager({
      property: { ...publicContent, trust_status: "normal" },
      subscription: { pro_access_status: "expired" },
      mappingExists: true,
    }).allowed,
    false
  );
  assert.equal(
    canUseChannelManager({
      property: { ...publicContent, trust_status: "normal" },
      subscription: { pro_access_status: "active" },
      mappingExists: false,
    }).reason,
    "channel_mapping_missing"
  );
  assert.equal(
    canUseChannelManager({
      property: { ...publicContent, trust_status: "blocked" },
      subscription: { pro_access_status: "active" },
      mappingExists: true,
    }).reason,
    "trust_blocked"
  );
});

test("existing approved property remains approved after migration-compatible normalization", () => {
  assert.equal(normalizeMarketplaceStatus({ status: "published" }), "approved");
  assert.equal(canListOnMarketplace({ status: "published", is_active: true, is_accepting: true }).allowed, true);
  assert.equal(
    canListOnMarketplace({
      status: "published",
      property_marketplace_status: "not_listed",
      is_active: true,
      is_accepting: true,
    }).allowed,
    false
  );
});

test("existing active Pro subscription remains active after policy normalization", () => {
  assert.equal(canAccessFamloPro({ trust_status: "normal" }, { status: "active" }).allowed, true);
});

test("existing unapproved property is not accidentally public after migration-compatible normalization", () => {
  assert.equal(normalizeMarketplaceStatus({ status: "draft" }), "draft");
  assert.equal(canListOnMarketplace({ status: "draft", is_active: true, is_accepting: true }).allowed, false);
  assert.equal(canListOnMarketplace({ property_marketplace_status: "under_review", is_active: true, is_accepting: true }).allowed, false);
});
