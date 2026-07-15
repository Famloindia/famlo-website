import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const webRoot = process.cwd();
const mobileRoot = path.resolve(webRoot, "../famlo-mobile");

function readWeb(relativePath: string): string {
  return readFileSync(path.join(webRoot, relativePath), "utf8");
}

function readMobile(relativePath: string): string {
  return readFileSync(path.join(mobileRoot, relativePath), "utf8");
}

test("Free PMS calendar routes use canonical inventory without Channex or ARI queues", () => {
  const files = [
    "app/api/host/free-pms/calendar/snapshot/route.ts",
    "app/api/host/free-pms/calendar/day/route.ts",
    "app/api/host/free-pms/calendar/bulk-update/route.ts",
    "lib/free-pms-calendar.ts",
  ];

  for (const file of files) {
    const source = readWeb(file);
    assert.match(source, /free-pms-calendar|appendInventoryEvent|ensureProjectedInventory|projectInventoryRange/);
    assert.doesNotMatch(source, /enqueueChannex|triggerQueuedChannex|channex-ari-jobs|ota_sync_applied/);
    assert.doesNotMatch(source, /\/api\/host\/pro\/calendar/);
  }
});

test("Free website calendar reads and writes Free PMS APIs instead of legacy blockedDates", () => {
  const source = readWeb("components/partners/tabs/CalendarTab.tsx");
  assert.match(source, /\/api\/host\/free-pms\/calendar\/snapshot/);
  assert.match(source, /\/api\/host\/free-pms\/calendar\/day/);
  assert.match(source, /\/api\/host\/free-pms\/calendar\/bulk-update/);
  assert.doesNotMatch(source, /schedule\.blockedDates/);
  assert.doesNotMatch(source, /blocked_dates/);
});

test("Free calendar canonical response includes compatibility field names", () => {
  const source = readWeb("lib/free-pms-calendar.ts");
  for (const field of [
    "stay_unit_id",
    "room_id",
    "availability",
    "rate",
    "price",
    "stop_sell",
    "closed_to_arrival",
    "closed_to_departure",
    "min_stay_arrival",
    "min_stay_through",
    "max_stay",
    "updated_at",
  ]) {
    assert.match(source, new RegExp(field));
  }
});

test("Mobile Free calendar branches to Free PMS APIs while preserving Pro APIs", () => {
  const apiSource = readMobile("src/api.ts");
  const appSource = readMobile("src/App.tsx");

  assert.match(apiSource, /loadFreeCalendar/);
  assert.match(apiSource, /\/api\/host\/free-pms\/calendar\/snapshot/);
  assert.match(apiSource, /\/api\/host\/free-pms\/calendar\/day/);
  assert.match(apiSource, /\/api\/host\/free-pms\/calendar\/bulk-update/);
  assert.match(apiSource, /\/api\/host\/pro\/calendar\/snapshot/);
  assert.match(appSource, /loadCalendarSnapshot\(familyId, startDate, "calendar"\)/);
  assert.match(appSource, /loadFreeCalendar\(familyId, startDate, "calendar"\)/);
  assert.match(appSource, /isProMode \? bulkUpdateCalendar : bulkUpdateFreeCalendar/);
  assert.match(appSource, /isProMode \? saveCalendarRate : saveFreeCalendarRate/);
  assert.match(appSource, /isProMode \? saveCalendarBlock : saveFreeCalendarBlock/);
});
