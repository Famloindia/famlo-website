import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  buildHostCalendarSyncDisplay,
  buildCalendarSyncMetadata,
  summarizeCalendarRoomSyncStatuses,
  checkoutExclusiveDateRange,
} from "@/lib/host-pro-calendar-sync";
import { enumerateStayNights } from "@/lib/platform-utils";

const repoRoot = process.cwd();
const source = (file: string): string => readFileSync(path.join(repoRoot, file), "utf8");

test("calendar open uses local projection first and moves Channex refresh to the background", () => {
  const renderSource = source("app/partnerslogin/home/pro/dashboard/render-dashboard.tsx");
  const shellSource = source("components/partners/pro/FamloProDashboardShell.tsx");

  assert.match(renderSource, /loadHostProCalendarSyncSnapshot\(\{/);
  assert.doesNotMatch(renderSource, /pullChannexCalendarForFamlo\(\{/);
  assert.match(shellSource, /runVisibleCalendarSync\("background_open"\)/);
  assert.match(renderSource, /calendarSync=\{calendarSync\}/);
});

test("Channex fetch failure metadata returns cached stale data warning", () => {
  const metadata = buildCalendarSyncMetadata({
    connected: true,
    ok: false,
    observedAt: "2026-05-28T00:00:00.000Z",
    lastSyncedAt: "2026-05-27T12:00:00.000Z",
    error: "Channex timeout",
  });

  assert.equal(metadata.syncSource, "cache");
  assert.equal(metadata.syncStatus, "failed");
  assert.equal(metadata.syncError, "Channex refresh timed out. Showing saved calendar.");
  assert.equal(metadata.stale, true);
  assert.equal(metadata.lastSyncedAt, "2026-05-27T12:00:00.000Z");
  assert.equal(metadata.statusDetail, "Showing saved calendar. Last Channex refresh failed.");
});

test("sync status display cannot show synced and failed contradictions together", () => {
  const metadata = buildCalendarSyncMetadata({
    connected: true,
    ok: false,
    observedAt: "2026-05-28T00:00:00.000Z",
    lastSyncedAt: "2026-05-27T12:00:00.000Z",
    error: "Channex timeout",
  });
  const display = buildHostCalendarSyncDisplay({
    metadata,
    isBackgroundSyncRunning: false,
    isBackgroundSyncTimedOut: false,
    timeAnchor: Date.parse("2026-05-28T00:03:00.000Z"),
  });

  assert.equal(display.badge, "Sync failed");
  assert.equal(display.detail, "Showing saved calendar. Last Channex refresh failed.");
  assert.equal(display.warning, "Channex refresh timed out. Showing saved calendar.");
});

test("background sync timeout downgrades syncing to saved-data messaging", () => {
  const metadata = buildCalendarSyncMetadata({
    connected: true,
    syncStatus: "pending",
    observedAt: "2026-05-28T00:00:00.000Z",
  });
  const display = buildHostCalendarSyncDisplay({
    metadata,
    isBackgroundSyncRunning: true,
    isBackgroundSyncTimedOut: true,
    timeAnchor: Date.parse("2026-05-28T00:03:00.000Z"),
  });

  assert.equal(display.badge, "Saved data loaded");
  assert.equal(display.detail, "Showing saved calendar. Channex refresh is still running.");
});

test("room sync summary marks missing mapping as not mapped", () => {
  const summaries = summarizeCalendarRoomSyncStatuses({
    requestedRoomIds: ["room-1"],
    connected: true,
    lastSyncedAt: null,
    roomMappings: [],
    ratePlans: [],
    jobs: [],
  });

  assert.equal(summaries[0]?.status, "not_mapped");
  assert.equal(summaries[0]?.safeMessage, "Room or rate mapping is missing.");
});

test("room sync summary marks failed jobs without newer success as failed", () => {
  const summaries = summarizeCalendarRoomSyncStatuses({
    requestedRoomIds: ["room-1"],
    connected: true,
    lastSyncedAt: "2026-05-27T00:00:00.000Z",
    roomMappings: [{ stayUnitId: "room-1", externalRoomTypeId: "ext-room", syncStatus: "mapped" }],
    ratePlans: [{ stayUnitId: "room-1", externalRatePlanId: "ext-rate", syncStatus: "mapped" }],
    jobs: [
      {
        status: "failed",
        updatedAt: "2026-05-28T00:00:00.000Z",
        runAfter: "2026-05-28T00:00:00.000Z",
        payload: { stay_unit_ids: ["room-1"] },
      },
    ],
  });

  assert.equal(summaries[0]?.status, "failed");
});

test("manual calendar routes return updated projected days immediately", () => {
  const blockRoute = source("app/api/host/pro/calendar/manual-block/route.ts");
  const rateRoute = source("app/api/host/pro/calendar/manual-rate/route.ts");

  assert.match(blockRoute, /const projectedDays = await projectInventoryRange/);
  assert.match(blockRoute, /projectedDays,/);
  assert.match(rateRoute, /const projectedDays = await projectInventoryRange/);
  assert.match(rateRoute, /projectedDays,/);
});

test("calendar sync route supports background and status-only modes without exposing internals", () => {
  const syncRoute = source("app/api/host/pro/calendar/sync/route.ts");

  assert.match(syncRoute, /body\.source === "background_open"/);
  assert.match(syncRoute, /body\.mode === "status_only"/);
  assert.doesNotMatch(syncRoute, /idempotency_key/);
  assert.doesNotMatch(syncRoute, /api_key/i);
});

test("manual block and rate updates queue immediate Channex ARI sync", () => {
  const blockRoute = source("app/api/host/pro/calendar/manual-block/route.ts");
  const rateRoute = source("app/api/host/pro/calendar/manual-rate/route.ts");

  assert.match(blockRoute, /enqueueChannexAriSyncJobs/);
  assert.match(blockRoute, /jobTypes:\s*\["availability_update",\s*"restriction_update"\]/);
  assert.match(blockRoute, /triggerQueuedChannexSyncWorker/);
  assert.match(rateRoute, /enqueueChannexAriSyncJobs/);
  assert.match(rateRoute, /jobTypes:\s*\["rate_update"\]/);
  assert.match(rateRoute, /triggerQueuedChannexSyncWorker/);
});

test("booking create modify and cancel trigger partial checkout-exclusive ARI sync", () => {
  const paymentTransitionSource = source("lib/payment-booking-finalization.ts");
  const modificationSource = source("lib/reservation-modifications.ts");
  const reassignmentSource = source("lib/reservation-reassignment.ts");

  assert.match(paymentTransitionSource, /resolveBookingInventoryImpactRange/);
  assert.match(paymentTransitionSource, /enqueueBookingInventoryAriSyncJobs/);
  assert.match(modificationSource, /getStayNightDateRange/);
  assert.match(modificationSource, /enqueueBookingInventoryAriSyncJobs/);
  assert.match(reassignmentSource, /getStayNightDateRange/);
  assert.match(reassignmentSource, /enqueueBookingInventoryAriSyncJobs/);
});

test("webhook is audited idempotently and guarded by an enable flag", () => {
  const webhookSource = source("app/api/webhooks/channex/bookings/route.ts");

  assert.match(webhookSource, /verifyChannexWebhookRequest/);
  assert.match(webhookSource, /webhook_idempotency_key/);
  assert.match(webhookSource, /duplicate_ignored/);
  assert.match(webhookSource, /CHANNEX_WEBHOOK_PROCESSING_ENABLED/);
  assert.match(webhookSource, /pollChannexBookingFeedForFamily/);
});

test("checkout-exclusive date ranges do not block checkout date", () => {
  assert.deepEqual(checkoutExclusiveDateRange("2026-05-28", "2026-05-29"), ["2026-05-28"]);
  assert.deepEqual(checkoutExclusiveDateRange("2026-05-28", "2026-05-30"), ["2026-05-28", "2026-05-29"]);
  assert.deepEqual(enumerateStayNights("2026-05-28", "2026-05-29"), ["2026-05-28"]);
  assert.deepEqual(enumerateStayNights("2026-05-28", "2026-05-30"), ["2026-05-28", "2026-05-29"]);
});
