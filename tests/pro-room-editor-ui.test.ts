import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  applyRoomCalendarAvailabilityOverride,
  buildHostRoomIssueCards,
  canRunHostChannelSync,
  classifyOtaReadiness,
  getChannelManagerConfirmationLabel,
  rollbackRoomCalendarAvailabilityOverride,
  resolveHostChannelCardState,
  resolveSmartPricingUiState,
} from "../lib/pro-room-editor-ui";

const repoRoot = path.resolve(import.meta.dirname, "..");
const shellPath = path.join(repoRoot, "components/partners/pro/FamloProDashboardShell.tsx");
const renderDashboardPath = path.join(repoRoot, "app/partnerslogin/home/pro/dashboard/render-dashboard.tsx");
const cssPath = path.join(repoRoot, "components/partners/pro/pro-dashboard.module.css");
const shellSource = readFileSync(shellPath, "utf8");
const renderDashboardSource = readFileSync(renderDashboardPath, "utf8");
const cssSource = readFileSync(cssPath, "utf8");

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
  assert.match(shellSource, /Advanced setup tools/);
  assert.match(shellSource, /Go to Channels/);
  assert.match(shellSource, /Advanced sync logs/);
});

test("channels tab shows OTA selection cards first with host-facing setup copy", () => {
  assert.match(shellSource, /Connect OTAs for this room/);
  assert.match(shellSource, /Select an OTA, confirm channel-manager setup, preview the room and rate mapping/);
  assert.match(shellSource, /Booking\.com/);
  assert.match(shellSource, /MakeMyTrip \/ Goibibo/);
  assert.match(shellSource, /Airbnb/);
  assert.match(shellSource, /Agoda/);
  assert.match(shellSource, /Expedia/);
  assert.match(shellSource, /Google Hotel/);
});

test("channels tab renders one main glass ota setup container with ota cards inside it", () => {
  assert.match(shellSource, /roomMainGlassPanel/);
  assert.match(shellSource, /roomWizardStepRow/);
  assert.match(shellSource, /roomOtaCardGrid/);
  assert.match(cssSource, /\.roomMainGlassPanel/);
});

test("inline setup panel requires confirmation before connect and previews before final sync", () => {
  assert.match(shellSource, /Preview connection/);
  assert.match(shellSource, /Connect & start sync/);
  assert.match(shellSource, /disabled=\{!selectedChannelConfirmationChecked/);
  assert.match(shellSource, /Step 1: Confirm OTA setup/);
  assert.match(shellSource, /Step 3: Preview connection/);
});

test("connected OTA state only offers run sync when readiness allows it", () => {
  assert.equal(
    canRunHostChannelSync({
      connected: true,
      roomMatched: true,
      rateMatched: true,
      calendarReady: true,
      supportsSelectedPropertySyncTest: true,
    }),
    true
  );
  assert.equal(
    canRunHostChannelSync({
      connected: true,
      roomMatched: false,
      rateMatched: true,
      calendarReady: true,
      supportsSelectedPropertySyncTest: true,
    }),
    false
  );
});

test("room and price matching tab uses host-friendly cards and links pricing back to Famlo pricing", () => {
  assert.match(shellSource, /Manage OTA room and price mapping/);
  assert.match(shellSource, /Famlo Room/);
  assert.match(shellSource, /Connected OTA Room/);
  assert.match(shellSource, /Price \/ Rate Plan/);
  assert.match(shellSource, /Sync Result/);
  assert.match(shellSource, /Edit Famlo price/);
  assert.match(shellSource, /setRoomEditorTab\("pricing"\)/);
});

test("room edit tabs use dark glass primitives instead of white summary cards", () => {
  assert.match(shellSource, /roomDarkCard/);
  assert.match(shellSource, /roomDarkEmptyState/);
  assert.match(shellSource, /roomInlineFeedback/);
  assert.match(cssSource, /\.roomDarkCard/);
  assert.match(cssSource, /\.roomDarkEmptyState/);
});

test("issues tab keeps a clean no-issues state and hides logs behind an advanced section", () => {
  assert.match(shellSource, /No issues found/);
  assert.match(shellSource, /Advanced sync logs/);
  assert.doesNotMatch(shellSource, /No room logs/);
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

test("channel card state stays honest about connected, setup-needed, and coming-soon OTAs", () => {
  assert.deepEqual(
    resolveHostChannelCardState({
      providerKey: "booking",
      setupStarted: false,
      connected: true,
      roomMatched: true,
      rateMatched: true,
      syncReady: true,
      providerMode: "self_serve",
    }),
    {
      status: "Connected",
      cta: "Connected",
      helperText: "Room, price, and sync readiness are in place for this OTA.",
      isConnected: true,
      isComingSoon: false,
    }
  );
  assert.equal(
    resolveHostChannelCardState({
      providerKey: "google-hotel",
      setupStarted: false,
      connected: false,
      roomMatched: false,
      rateMatched: false,
      syncReady: false,
      providerMode: "feed_only",
    }).status,
    "Coming soon"
  );
});

test("issues tab shows only real actionable issue cards for missing setup and content", () => {
  assert.deepEqual(
    buildHostRoomIssueCards({
      roomInactive: false,
      photosMissing: true,
      basePriceMissing: true,
      channelConnected: false,
      channelConfirmationMissing: true,
      roomMatched: false,
      rateMatched: false,
      calendarReady: false,
      lastSyncFailed: true,
      channelSetupIncomplete: true,
    }).map((issue) => issue.actionLabel),
    [
      "Setup channel",
      "Setup channel",
      "Review room match",
      "Review price match",
      "Setup channel",
      "Edit room details",
      "Add photos",
      "Setup channel",
      "Retry sync",
    ]
  );
});

test("confirmation copy is provider-specific and host-friendly", () => {
  assert.equal(
    getChannelManagerConfirmationLabel("mmt"),
    "I have enabled or requested Channex as channel manager in MakeMyTrip / Goibibo."
  );
  assert.equal(getChannelManagerConfirmationLabel("google-hotel"), null);
});

test("readiness audit helper classifies ota sync readiness honestly", () => {
  assert.equal(
    classifyOtaReadiness({
      providerMode: "self_serve",
      supportsRoomMatching: true,
      supportsPriceMatching: true,
      supportsAriSync: true,
      supportsSelectedPropertySyncTest: true,
      supportsGoLiveReadiness: true,
      supportsAutoActivation: true,
    }),
    "Ready for live sync"
  );
  assert.equal(
    classifyOtaReadiness({
      providerMode: "assisted_beta",
      supportsRoomMatching: true,
      supportsPriceMatching: true,
      supportsAriSync: true,
      supportsSelectedPropertySyncTest: true,
      supportsGoLiveReadiness: true,
      supportsAutoActivation: false,
    }),
    "Setup/assisted only"
  );
  assert.equal(
    classifyOtaReadiness({
      providerMode: "feed_only",
      supportsRoomMatching: true,
      supportsPriceMatching: true,
      supportsAriSync: true,
      supportsSelectedPropertySyncTest: false,
      supportsGoLiveReadiness: true,
      supportsAutoActivation: false,
    }),
    "Coming soon / not ready"
  );
});
