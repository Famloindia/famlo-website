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
import {
  OTA_CONNECT_CONFIGS,
  getOtaConnectConfig,
  isOtaConnectId,
} from "../lib/channels/ota-connect-config";
import {
  normalizeChannexPreview,
  validateOtaFields,
} from "../lib/channels/ota-connect-service";

const repoRoot = path.resolve(import.meta.dirname, "..");
const shellPath = path.join(repoRoot, "components/partners/pro/FamloProDashboardShell.tsx");
const renderDashboardPath = path.join(repoRoot, "app/partnerslogin/home/pro/dashboard/render-dashboard.tsx");
const cssPath = path.join(repoRoot, "components/partners/pro/pro-dashboard.module.css");
const otaPreviewRoutePath = path.join(repoRoot, "app/api/partners/pro/channels/ota/preview/route.ts");
const otaConfirmRoutePath = path.join(repoRoot, "app/api/partners/pro/channels/ota/confirm/route.ts");
const otaServicePath = path.join(repoRoot, "lib/channels/ota-connect-service.ts");
const shellSource = readFileSync(shellPath, "utf8");
const renderDashboardSource = readFileSync(renderDashboardPath, "utf8");
const cssSource = readFileSync(cssPath, "utf8");
const otaPreviewRouteSource = readFileSync(otaPreviewRoutePath, "utf8");
const otaConfirmRouteSource = readFileSync(otaConfirmRoutePath, "utf8");
const otaServiceSource = readFileSync(otaServicePath, "utf8");
const roomChannelsSectionSource = shellSource.slice(shellSource.indexOf("Connect this room to OTA"), shellSource.indexOf("Advanced setup tools"));

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

test("channels tab shows one main ota connection flow with exactly five cards", () => {
  assert.match(shellSource, /Connect this room to OTA/);
  assert.match(
    shellSource,
    /Select the OTA where this room is already listed\. Paste the required details from your OTA account\. Famlo will find the property through Channex and show you a preview before sync starts\./
  );
  assert.deepEqual(
    OTA_CONNECT_CONFIGS.map((config) => config.id),
    ["booking_com", "mmt_goibibo", "agoda", "expedia", "airbnb"]
  );
  assert.equal(isOtaConnectId("booking_com"), true);
  assert.equal(isOtaConnectId("google_hotel"), false);
  assert.match(shellSource, /Booking\.com/);
  assert.match(shellSource, /MakeMyTrip \/ Goibibo/);
  assert.match(shellSource, /Agoda/);
  assert.match(shellSource, /Expedia/);
  assert.match(shellSource, /Airbnb/);
  assert.doesNotMatch(roomChannelsSectionSource, /Google Hotel/);
});

test("channels tab renders one main glass ota setup container with horizontal ota cards inside it", () => {
  assert.match(shellSource, /roomMainGlassPanel/);
  assert.match(shellSource, /roomWizardStepRow/);
  assert.match(shellSource, /roomOtaCardGrid/);
  assert.match(cssSource, /\.roomMainGlassPanel/);
  assert.match(cssSource, /\.roomOtaCardGrid\s*\{[\s\S]*overflow-x:\s*auto;/);
});

test("unified ota wizard uses the requested stepper and setup stays inside the same container", () => {
  assert.match(shellSource, /Step 1 Select OTA/);
  assert.match(shellSource, /Step 2 Enter OTA details/);
  assert.match(shellSource, /Step 3 Preview matched property\/rooms/);
  assert.match(shellSource, /Step 4 Confirm and sync/);
  assert.match(shellSource, /What to copy from/);
});

test("config exposes ota-specific setup fields and instructions", () => {
  const booking = getOtaConnectConfig("booking_com");
  const mmt = getOtaConnectConfig("mmt_goibibo");
  const agoda = getOtaConnectConfig("agoda");

  assert.equal(booking.displayName, "Booking.com");
  assert.match(booking.instructions.join(" "), /Booking\.com extranet/);
  assert.equal(mmt.requiredFields.some((field) => field.key === "providerAccessToken"), true);
  assert.equal(agoda.requiredFields.some((field) => field.key === "providerListingId"), true);
});

test("inline setup panel requires channel-manager confirmation and preview before final sync", () => {
  assert.match(shellSource, /Preview connection/);
  assert.match(shellSource, /Connect & start sync/);
  assert.match(shellSource, /disabled=\{!selectedChannelConfirmationChecked \|\| !roomEditorPreviewAccepted/);
  assert.match(shellSource, /I confirm this is the correct OTA property and room\. Famlo can manage availability, rates, and inventory for this OTA room\./);
});

test("preview card shows matched ota property, rooms, rate plans, and sync outcome copy", () => {
  assert.match(shellSource, /OTA property name/);
  assert.match(shellSource, /OTA property ID \/ reference/);
  assert.match(shellSource, /OTA room list/);
  assert.match(shellSource, /OTA rate plans/);
  assert.match(shellSource, /Famlo Pro will manage availability for this room\./);
  assert.match(shellSource, /Matched OTA rate plans will use Famlo Pro pricing after sync\./);
  assert.match(shellSource, /Sync will be queued safely through the existing Channex flow\./);
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
  assert.match(shellSource, /Run sync now/);
});

test("room and price matching tab uses host-friendly cards and links pricing back to Famlo pricing", () => {
  assert.match(shellSource, /Manage OTA room and price mapping/);
  assert.match(shellSource, /Famlo Room/);
  assert.match(shellSource, /Connected OTA Room/);
  assert.match(shellSource, /Price \/ Rate Plan/);
  assert.match(shellSource, /Sync Result/);
  assert.match(shellSource, /Famlo Pro is the master source\. Edit this room(?:&apos;|'|’)s price in Famlo Pro, then sync to matched OTA rate plans\./);
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
  assert.match(shellSource, /This room is ready for connected channels\./);
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

test("host channel card helper stays honest about connected and setup states", () => {
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

test("preview api validates ota ids and delegates to unified ota preview service", () => {
  assert.match(otaPreviewRouteSource, /isOtaConnectId/);
  assert.match(otaPreviewRouteSource, /createOtaPreview/);
  assert.match(otaPreviewRouteSource, /otaId is invalid/);
});

test("confirm api validates confirmation flow through unified ota confirm service", () => {
  assert.match(otaConfirmRouteSource, /isOtaConnectId/);
  assert.match(otaConfirmRouteSource, /confirmOtaConnection/);
  assert.match(otaConfirmRouteSource, /confirmationAccepted/);
});

test("ota connect service validates ownership, calls channex-backed host routes, and redacts secrets", () => {
  assert.match(otaServiceSource, /resolveAuthorizedHostResource/);
  assert.match(otaServiceSource, /loadStayUnitsForSelector/);
  assert.match(otaServiceSource, /createChannelRoute/);
  assert.match(otaServiceSource, /providerStructureRoute/);
  assert.match(otaServiceSource, /confirmMappingsRoute/);
  assert.match(otaServiceSource, /enqueueChannexAriSyncJobs/);
  assert.match(otaServiceSource, /\[redacted\]/);
  assert.match(otaServiceSource, /channel_sync_logs/);
});

test("ota field validation requires only supported configured fields", () => {
  assert.deepEqual(validateOtaFields("mmt_goibibo", {}), {
    ok: false,
    missingFields: ["MMT / Goibibo hotel ID"],
  });
  assert.deepEqual(
    validateOtaFields("agoda", {
      providerListingId: "AGO-99812",
    }),
    {
      ok: true,
      missingFields: [],
    }
  );
});

test("normalized channex preview returns host-safe matched property and warning data", () => {
  const preview = normalizeChannexPreview({
    propertyId: "family-1",
    roomId: "room-1",
    roomName: "Deluxe Room",
    otaId: "booking_com",
    fields: {
      bookingHotelId: "1234567",
    },
    providerStructurePayload: {
      verification: {
        propertyTitle: "Hotel Aurora",
        hotelId: "1234567",
      },
      catalog: {
        room_types: [{ id: "room-x", title: "Twin Room" }],
        rate_plans: [{ id: "rate-x", title: "Standard Rate", room_type_id: "room-x" }],
      },
      suggestions: [
        {
          roomId: "room-1",
          famloRoomName: "Deluxe Room",
          suggestedRoomTypeId: "room-x",
          suggestedRoomTypeTitle: "Twin Room",
          suggestedRatePlanId: "rate-x",
          suggestedRatePlanTitle: "Standard Rate",
        },
      ],
    },
  });

  assert.equal(preview.propertyName, "Hotel Aurora");
  assert.equal(preview.propertyReference, "1234567");
  assert.deepEqual(preview.roomList, [{ title: "Twin Room" }]);
  assert.deepEqual(preview.ratePlans, [{ title: "Standard Rate" }]);
  assert.deepEqual(preview.warnings, []);
  assert.equal(preview.suggestedMapping?.otaRoomName, "Twin Room");
});
