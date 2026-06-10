import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { extractOtaSyncSnapshotPayload } from "@/lib/inventory";

const repoRoot = process.cwd();
const source = (file: string): string => readFileSync(path.join(repoRoot, file), "utf8");

test("restriction snapshot parsing keeps Channex availability and restriction keys stable", () => {
  const payload = extractOtaSyncSnapshotPayload({
    availability: 0,
    rate: 200,
    stop_sell: true,
    closed_to_arrival: true,
    closed_to_departure: false,
    min_stay_through: 3,
    min_stay_arrival: 2,
    max_stay: 9,
  });

  assert.equal(payload.availability, 0);
  assert.equal(payload.amount, 200);
  assert.equal(payload.stopSell, true);
  assert.equal(payload.cta, true);
  assert.equal(payload.ctd, false);
  assert.equal(payload.minStayThrough, 3);
  assert.equal(payload.minStayArrival, 2);
  assert.equal(payload.maxStay, 9);
});

test("projection source consumes ota_sync_applied rows for saved Channex values", () => {
  const inventorySource = source("lib/inventory.ts");

  assert.match(inventorySource, /const otaSyncEvent = latestEventForDate\(input\.events, input\.date, \["ota_sync_applied"\]\);/);
  assert.match(inventorySource, /const otaPayload = extractOtaSyncSnapshotPayload/);
  assert.match(inventorySource, /: otaRateAmount > 0\s*\? "ota_sync_applied"/);
  assert.match(inventorySource, /const shouldUseOtaAvailability =\s*otaAvailability != null && !isEventNewer\(bookingInventoryEvent, otaSyncEvent\);/);
});

test("manual local rate still wins over saved Channex snapshot according to source priority", () => {
  const inventorySource = source("lib/inventory.ts");

  assert.match(inventorySource, /manualRateAmount > 0\s*\?\s*manualRateAmount\s*: otaRateAmount > 0/);
  assert.match(inventorySource, /manualRateAmount > 0\s*\?\s*"manual_rate"\s*: otaRateAmount > 0/);
});

test("Channex restriction snapshot request asks for CTA CTD min and max stay fields", () => {
  const clientSource = source("lib/channel-providers/channex/client.ts");

  assert.match(
    clientSource,
    /"filter\[restrictions\]"\s*,\s*"rate,stop_sell,closed_to_arrival,closed_to_departure,min_stay_through,min_stay_arrival,max_stay"/
  );
});

test("compare route reports mapping and projection mismatches without exposing secrets", () => {
  const compareRoute = source("app/api/admin/calendar/channex-projection-compare/route.ts");

  assert.match(compareRoute, /hasAdminPermission\("channels"\)/);
  assert.match(compareRoute, /process\.env\.NODE_ENV !== "production"/);
  assert.match(compareRoute, /missing_room_mapping/);
  assert.match(compareRoute, /missing_rate_plan_mapping/);
  assert.match(compareRoute, /availability_mismatch/);
  assert.match(compareRoute, /rate_mismatch/);
  assert.match(compareRoute, /latestOtaSyncAppliedEvent/);
  assert.match(compareRoute, /summarizeInventoryEvent/);
  assert.doesNotMatch(compareRoute, /api_key/i);
  assert.doesNotMatch(compareRoute, /idempotency_key/i);
});

test("admin rebuild route reprojects one family date range from canonical inventory events", () => {
  const rebuildRoute = source("app/api/admin/calendar/rebuild-projection/route.ts");

  assert.match(rebuildRoute, /hasAdminPermission\("channels"\)/);
  assert.match(rebuildRoute, /process\.env\.NODE_ENV !== "production"/);
  assert.match(rebuildRoute, /projectInventoryRange\(supabase, \{/);
  assert.match(rebuildRoute, /projectedRowCount/);
});

test("local-first calendar render still reads saved projection without server-side Channex pull", () => {
  const renderSource = source("app/partnerslogin/home/pro/dashboard/render-dashboard.tsx");

  assert.match(renderSource, /ensureProjectedInventory\(supabase, \{/);
  assert.doesNotMatch(renderSource, /pullChannexCalendarForFamlo\(.*calendar_open/);
});

test("calendar render projects Channex availability into visible availability cells", () => {
  const renderSource = source("app/partnerslogin/home/pro/dashboard/render-dashboard.tsx");

  assert.match(renderSource, /roomProjectedAvailability/);
  assert.match(renderSource, /availableUnits: day\.availableUnits/);
  assert.match(renderSource, /isProjectedUnavailable/);
  assert.match(renderSource, /status === "unavailable"/);
  assert.match(renderSource, /availableUnits:\s*status === "famlo"/);
});

test("calendar grid displays projected unit counts instead of hardcoded availability", () => {
  const shellSource = source("components/partners/pro/FamloProDashboardShell.tsx");
  const gridSource = source("components/partners/pro/FamloProCalendarGrid.tsx");

  assert.match(shellSource, /availableUnits: number \| null/);
  assert.match(shellSource, /calendarProjectedCellOverrides/);
  assert.match(shellSource, /applyProjectedCalendarCells/);
  assert.match(shellSource, /String\(cell\.availableUnits \?\? 0\)/);
  assert.doesNotMatch(shellSource, /cell\.status === "available" \? "1" : "0"/);
  assert.match(gridSource, /availableUnits: number \| null/);
  assert.match(gridSource, /String\(availabilityCell\.availableUnits \?\? 0\)/);
  assert.doesNotMatch(gridSource, /availabilityCell\.status === "available" \? "1" : "0"/);
});

test("inventory calendar section skips unrelated media and booking metric work", () => {
  const renderSource = source("app/partnerslogin/home/pro/dashboard/render-dashboard.tsx");

  assert.match(renderSource, /const isInventoryCalendarSection = initialSection === "inventory-calendar";/);
  assert.match(renderSource, /host\?\.id && !isInventoryCalendarSection/);
  assert.match(renderSource, /const propertyMedia: ResolvedPublicPropertyMedia = isInventoryCalendarSection/);
  assert.match(renderSource, /gallerySource: "none"/);
  assert.match(renderSource, /\[famlo-pro-calendar-render\]/);
});

test("calendar sync API dedupes background refreshes and keeps status-only lightweight", () => {
  const syncRoute = source("app/api/host/pro/calendar/sync/route.ts");

  assert.match(syncRoute, /BACKGROUND_SYNC_RECENCY_MS/);
  assert.match(syncRoute, /BACKGROUND_SYNC_IN_FLIGHT_MS/);
  assert.match(syncRoute, /inFlightCalendarSyncs/);
  assert.match(syncRoute, /mode === "status_only"/);
  assert.match(syncRoute, /shouldReturnExistingInFlight/);
  assert.match(syncRoute, /shouldSkipRecentBackgroundPull/);
  assert.match(syncRoute, /Channex refresh is already running/);
  assert.match(syncRoute, /loadProjectedCalendarCells/);
  assert.match(syncRoute, /projectedCells/);
});
