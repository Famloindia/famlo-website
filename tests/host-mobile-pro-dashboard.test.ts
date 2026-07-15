import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const repoRoot = process.cwd();
const source = (file: string): string => readFileSync(path.join(repoRoot, file), "utf8");

test("mobile Pro overview route is authorized, no-store, and uses shared website loaders", () => {
  const route = source("app/api/host/mobile/pro-dashboard/route.ts");
  const helper = source("lib/host-mobile-pro-dashboard.ts");

  assert.match(route, /resolveAuthorizedHostResource/);
  assert.match(route, /loadHostMobileProDashboardOverview/);
  assert.match(route, /Cache-Control": "no-store, max-age=0"/);
  assert.match(helper, /loadStayUnitsForSelector/);
  assert.match(helper, /loadHostProChannelFoundation/);
  assert.match(helper, /loadLiveProBookingsSnapshot/);
  assert.match(helper, /buildHostProSetupReadiness/);
});

test("mobile Pro overview does not call Channex directly or fabricate dashboard data", () => {
  const helper = source("lib/host-mobile-pro-dashboard.ts");

  assert.doesNotMatch(helper, /channel-providers\/channex\/client/);
  assert.doesNotMatch(helper, /channex\.com/i);
  assert.doesNotMatch(helper, /Twin Room|Double Room|sukoon|Standard room/);
  assert.match(helper, /status: .*"unavailable".*"loaded"/);
  assert.match(helper, /trueZero: !unavailable/);
});

test("mobile Pro compact rooms include edit-critical fields for Add/Edit hydration", () => {
  const helper = source("lib/host-mobile-pro-dashboard.ts");
  const mobileTypes = source("../famlo-mobile/src/types.ts");

  assert.match(helper, /toilet_types/);
  assert.match(helper, /toilet_type/);
  assert.match(helper, /room_size_sqm/);
  assert.match(helper, /price_morning/);
  assert.match(helper, /price_afternoon/);
  assert.match(helper, /price_evening/);
  assert.match(helper, /quarter_enabled/);
  assert.match(helper, /locality_photos/);
  assert.match(helper, /toiletTypes: room\.toiletTypes/);
  assert.match(helper, /priceMorning: room\.priceMorning/);
  assert.match(helper, /priceAfternoon: room\.priceAfternoon/);
  assert.match(helper, /priceEvening: room\.priceEvening/);
  assert.match(helper, /localityPhotos: room\.localityPhotos/);

  assert.match(mobileTypes, /toiletTypes\?: string\[\]/);
  assert.match(mobileTypes, /priceMorning\?: number \| null/);
  assert.match(mobileTypes, /priceAfternoon\?: number \| null/);
  assert.match(mobileTypes, /priceEvening\?: number \| null/);
  assert.match(mobileTypes, /localityPhotos\?: string\[\]/);
});
