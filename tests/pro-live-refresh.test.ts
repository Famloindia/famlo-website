import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const repoRoot = process.cwd();
const source = (file: string): string => readFileSync(path.join(repoRoot, file), "utf8");

test("bookings snapshot route is dynamic and no-store", () => {
  const route = source("app/api/host/pro/bookings/snapshot/route.ts");
  const liveData = source("lib/host-pro-live-data.ts");

  assert.match(route, /loadLiveProBookingsSnapshot/);
  assert.match(route, /Cache-Control": "no-store, max-age=0"/);
  assert.match(liveData, /bookingRowsSelectWithStayUnit/);
  assert.match(liveData, /bookingRowsSelectFallback/);
  assert.match(liveData, /isMissingColumnError\(bookingRowsError, "stay_unit_id"\)/);
});

test("calendar snapshot route is dynamic and no-store", () => {
  const route = source("app/api/host/pro/calendar/snapshot/route.ts");
  const liveData = source("lib/host-pro-live-data.ts");

  assert.match(route, /loadLiveCalendarSnapshot/);
  assert.match(route, /Cache-Control": "no-store, max-age=0"/);
  assert.match(liveData, /calendarSelectWithStayUnit/);
  assert.match(liveData, /calendarSelectFallback/);
  assert.match(liveData, /pricing_snapshot->>stay_unit_id/);
});

test("dashboard shell keeps saved bookings and calendar rows in local state", () => {
  const shell = source("components/partners/pro/FamloProDashboardShell.tsx");

  assert.match(shell, /const \[proBookings, setProBookings\] = useState<ProBookingSummary\[]>\(initialProBookings\)/);
  assert.match(shell, /const \[calendarRows, setCalendarRows\] = useState<CalendarRow\[]>\(initialCalendarRows\)/);
  assert.match(shell, /\/api\/host\/pro\/bookings\/snapshot/);
  assert.match(shell, /\/api\/host\/pro\/calendar\/snapshot/);
  assert.match(shell, /Saved bookings are still visible/);
});

test("background booking feed refresh updates local snapshots instead of relying only on hard refresh", () => {
  const shell = source("components/partners/pro/FamloProDashboardShell.tsx");

  assert.match(shell, /await refreshBookingsSnapshot\(\)/);
  assert.match(shell, /await refreshCalendarSnapshot\(\)/);
  assert.match(shell, /New booking update received from Channex/);
});

test("channex webhook poll also auto-applies pending revisions", () => {
  const webhookRoute = source("app/api/webhooks/channex/bookings/route.ts");

  assert.match(webhookRoute, /autoProcessPendingChannexFeedRevisions/);
  assert.match(webhookRoute, /autoApplySummary/);
});
