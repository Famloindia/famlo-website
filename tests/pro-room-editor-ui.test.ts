import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  applyRoomCalendarAvailabilityOverride,
  rollbackRoomCalendarAvailabilityOverride,
  resolveSmartPricingUiState,
} from "../lib/pro-room-editor-ui";

const repoRoot = path.resolve(import.meta.dirname, "..");
const shellPath = path.join(repoRoot, "components/partners/pro/FamloProDashboardShell.tsx");
const renderDashboardPath = path.join(repoRoot, "app/partnerslogin/home/pro/dashboard/render-dashboard.tsx");
const shellSource = readFileSync(shellPath, "utf8");
const renderDashboardSource = readFileSync(renderDashboardPath, "utf8");

test("Add Room card reuses the room showcase card layout", () => {
  assert.match(
    shellSource,
    /className=\{`\$\{styles\.propertyRoomShowcaseCard\} \$\{styles\.addRoomShowcaseCard\}`\}/
  );
  assert.match(shellSource, /Create a new room inside this property\./);
});

test("room cards stay independent from heavy sync logs on initial property load", () => {
  assert.match(renderDashboardSource, /includeSyncLogs: needsChannelSyncHistory/);
  assert.match(renderDashboardSource, /includeBookingRevisions: needsBookingRevisions/);
});

test("room tabs inline reused content replaces old open-another-page CTAs", () => {
  assert.doesNotMatch(shellSource, /Open Channels/);
  assert.doesNotMatch(shellSource, /Open Room Matching/);
  assert.doesNotMatch(shellSource, /View Sync Logs/);
  assert.match(shellSource, /ChannelSetupWizard/);
  assert.match(shellSource, /Open full Channels workspace/);
  assert.match(shellSource, /Open advanced room matching/);
  assert.match(shellSource, /Open full sync workspace/);
});

test("calendar optimistic update success applies only the targeted room date", () => {
  const current = {};
  const next = applyRoomCalendarAvailabilityOverride(current, {
    roomId: "room-1",
    date: "2026-06-10",
    action: "block",
  });

  assert.deepEqual(next, {
    "room-1:2026-06-10": "manual_block",
  });
});

test("calendar optimistic rollback restores the previous date state after failure", () => {
  const optimistic = applyRoomCalendarAvailabilityOverride({}, {
    roomId: "room-1",
    date: "2026-06-10",
    action: "block",
  });

  const rolledBack = rollbackRoomCalendarAvailabilityOverride(optimistic, {
    roomId: "room-1",
    date: "2026-06-10",
    previousStatus: "available",
  });

  assert.deepEqual(rolledBack, {
    "room-1:2026-06-10": "available",
  });
});

test("manual pricing is the only active pricing state without operational backend support", () => {
  assert.deepEqual(resolveSmartPricingUiState(false), {
    manualPricingLabel: "Manual pricing active",
    smartPricingLabel: "Coming soon",
    smartPricingEnabled: false,
  });
});
