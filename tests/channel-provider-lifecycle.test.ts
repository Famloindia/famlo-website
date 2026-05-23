import test from "node:test";
import assert from "node:assert/strict";

import { buildAriMetadataPatch, type ChannexAriHealthSnapshot } from "@/lib/channex-ari-sync";
import {
  buildFeedMetadataPatch,
  extractProviderKeyFromFeedRevision,
  shouldIgnoreFeedRevisionForProvider,
  type ChannexFeedHealthSnapshot,
} from "@/lib/channex-booking-feed-sync";
import { findStaleMappingRebindCandidate, projectChannexAvailabilityValue } from "@/lib/channex-ari-jobs";
import {
  getChannelProviderCapabilities,
  resolveChannelStorageProviderCode,
} from "@/lib/channel-providers/provider-capabilities";
import {
  assertChannelProviderOperationPermission,
  ChannelProviderPermissionError,
} from "@/lib/channel-provider-framework";
import { normalizeInventoryRateAmount } from "@/lib/inventory";
import { resolveProviderOperationPolicy } from "@/lib/host/pro/channel/provider-operation-policy";
import { resolveBulkRoomScopePolicy } from "@/lib/host/pro/calendar/bulk-room-scope-policy";
import { verifyChannexWebhookRequest } from "@/lib/channex-webhook-auth";
import { assessImportPreviewEligibility } from "@/app/api/host/pro/channel/channex/bookings/import-preview/route";
import { assessModificationApplyEligibility } from "@/app/api/host/pro/channel/channex/bookings/apply-modification/route";
import { assessCancellationApplyEligibility } from "@/app/api/host/pro/channel/channex/bookings/apply-cancellation/route";
import { assessAcknowledgementEligibility } from "@/app/api/host/pro/channel/channex/bookings/acknowledge/route";

function buildAriSnapshot(label: string): ChannexAriHealthSnapshot {
  return {
    lastAriSyncAt: `${label}-at`,
    lastSuccessfulAriSyncAt: `${label}-success`,
    lastAriSyncError: null,
    lastAriSyncErrorAt: null,
    consecutiveAriFailures: 0,
    syncedDateRange: { from: "2026-05-19", to: "2026-05-25", windowDays: 7 },
    verifiedAvailabilityCount: 7,
    verifiedRateCount: 7,
    verifiedMinStayThroughCount: 7,
    availabilityMismatchCount: 0,
    rateMismatchCount: 0,
    lastAriSyncAction: "push_ari_limited_test",
    lastAriSyncStatus: "synced",
    lastAriSyncMessage: `${label}-ok`,
    channelAttached: true,
    channelActive: true,
    accChannelsCount: 1,
    activeChannelId: `${label}-channel`,
    activeChannelTitle: `${label}-title`,
    hotelId: `${label}-hotel`,
  };
}

function buildFeedSnapshot(label: string): ChannexFeedHealthSnapshot {
  return {
    environment: "staging",
    externalPropertyId: `${label}-property`,
    lastPollAt: `${label}-poll`,
    lastSuccessfulPollAt: `${label}-success`,
    lastFeedSeenAt: `${label}-seen`,
    lastError: null,
    lastErrorAt: null,
    consecutiveFailures: 0,
    totalFetched: 3,
    matchedRevisionCount: 1,
    unmatchedRevisionCount: 2,
    storedRevisionCount: 1,
    insertedRevisionCount: 1,
    updatedRevisionCount: 0,
    unmatchedRoomCount: 0,
    accChannelsCount: 1,
    channelAttached: true,
    channelActive: true,
    activeChannelId: `${label}-channel`,
    activeChannelTitle: `${label}-title`,
    hotelId: `${label}-hotel`,
    attachedChannelIds: [`${label}-channel`],
    unackedRevisionsCount: 1,
    failedImportCount: 0,
    pendingApplyCount: 0,
    lastPollAction: "fetch_booking_feed",
  };
}

function buildRevision(otaProviderCode: string, uniqueId: string): Record<string, unknown> {
  return {
    ota_provider_code: otaProviderCode,
    unique_id: uniqueId,
    id: `${uniqueId}-rev`,
    attributes: {
      ota_provider_code: otaProviderCode,
      unique_id: uniqueId,
      ota_name: otaProviderCode,
    },
  };
}

test("MMT and Airbnb ARI resolve to provider-specific mapping codes", () => {
  assert.equal(resolveChannelStorageProviderCode("mmt"), "mmt");
  assert.equal(resolveChannelStorageProviderCode("airbnb"), "airbnb");
  assert.equal(resolveChannelStorageProviderCode("agoda"), "agoda");
  assert.equal(resolveChannelStorageProviderCode("expedia"), "expedia");
});

test("MMT and Airbnb feed revisions resolve to correct providers", () => {
  assert.equal(extractProviderKeyFromFeedRevision(buildRevision("mmt", "MMT-001")), "mmt");
  assert.equal(extractProviderKeyFromFeedRevision(buildRevision("airbnb", "ABB-001")), "airbnb");
});

test("MMT feed ignores Airbnb, Booking, Agoda, and Expedia revisions", () => {
  assert.equal(shouldIgnoreFeedRevisionForProvider("mmt", buildRevision("mmt", "MMT-001")), false);
  assert.equal(shouldIgnoreFeedRevisionForProvider("mmt", buildRevision("booking", "BDC-001")), true);
  assert.equal(shouldIgnoreFeedRevisionForProvider("mmt", buildRevision("airbnb", "ABB-001")), true);
  assert.equal(shouldIgnoreFeedRevisionForProvider("mmt", buildRevision("agoda", "AGO-001")), true);
  assert.equal(shouldIgnoreFeedRevisionForProvider("mmt", buildRevision("expedia", "EXP-001")), true);
});

test("Airbnb feed ignores MMT, Booking, Agoda, and Expedia revisions", () => {
  assert.equal(shouldIgnoreFeedRevisionForProvider("airbnb", buildRevision("airbnb", "ABB-001")), false);
  assert.equal(shouldIgnoreFeedRevisionForProvider("airbnb", buildRevision("booking", "BDC-001")), true);
  assert.equal(shouldIgnoreFeedRevisionForProvider("airbnb", buildRevision("mmt", "MMT-001")), true);
  assert.equal(shouldIgnoreFeedRevisionForProvider("airbnb", buildRevision("agoda", "AGO-001")), true);
  assert.equal(shouldIgnoreFeedRevisionForProvider("airbnb", buildRevision("expedia", "EXP-001")), true);
});

test("MMT and Airbnb ARI health write into provider-keyed metadata without overwriting each other", () => {
  const mmtSnapshot = buildAriSnapshot("mmt");
  const airbnbSnapshot = buildAriSnapshot("airbnb");

  const afterMmt = buildAriMetadataPatch(null, "mmt", mmtSnapshot) as Record<string, unknown>;
  const afterAirbnb = buildAriMetadataPatch(afterMmt, "airbnb", airbnbSnapshot) as Record<string, unknown>;
  const providerAriHealth = afterAirbnb.providerAriHealth as Record<string, unknown>;

  assert.deepEqual((providerAriHealth.mmt as Record<string, unknown>).hotelId, "mmt-hotel");
  assert.deepEqual((providerAriHealth.airbnb as Record<string, unknown>).hotelId, "airbnb-hotel");
});

test("MMT and Airbnb feed health write into channexProviderFeedHealth without overwriting each other", () => {
  const mmtSnapshot = buildFeedSnapshot("mmt");
  const airbnbSnapshot = buildFeedSnapshot("airbnb");

  const afterMmt = buildFeedMetadataPatch(null, "mmt", mmtSnapshot) as Record<string, unknown>;
  const afterAirbnb = buildFeedMetadataPatch(afterMmt, "airbnb", airbnbSnapshot) as Record<string, unknown>;
  const providerFeedHealth = afterAirbnb.channexProviderFeedHealth as Record<string, unknown>;

  assert.deepEqual((providerFeedHealth.mmt as Record<string, unknown>).hotelId, "mmt-hotel");
  assert.deepEqual((providerFeedHealth.airbnb as Record<string, unknown>).hotelId, "airbnb-hotel");
});

test("MMT and Airbnb stay assisted for go-live and never auto-activate", () => {
  const mmt = getChannelProviderCapabilities("mmt");
  const airbnb = getChannelProviderCapabilities("airbnb");
  const agoda = getChannelProviderCapabilities("agoda");
  const expedia = getChannelProviderCapabilities("expedia");

  assert.equal(mmt.supportsGoLiveReadiness, true);
  assert.equal(mmt.supportsAutoActivation, false);
  assert.equal(airbnb.supportsGoLiveReadiness, true);
  assert.equal(airbnb.supportsAutoActivation, false);
  assert.equal(agoda.supportsGoLiveReadiness, true);
  assert.equal(agoda.supportsAutoActivation, false);
  assert.equal(expedia.supportsGoLiveReadiness, true);
  assert.equal(expedia.supportsAutoActivation, false);
});

test("Agoda feed ignores non-Agoda provider revisions", () => {
  assert.equal(shouldIgnoreFeedRevisionForProvider("agoda", buildRevision("agoda", "AGO-001")), false);
  assert.equal(shouldIgnoreFeedRevisionForProvider("agoda", buildRevision("booking", "BDC-001")), true);
  assert.equal(shouldIgnoreFeedRevisionForProvider("agoda", buildRevision("mmt", "MMT-001")), true);
  assert.equal(shouldIgnoreFeedRevisionForProvider("agoda", buildRevision("airbnb", "ABB-001")), true);
  assert.equal(shouldIgnoreFeedRevisionForProvider("agoda", buildRevision("expedia", "EXP-001")), true);
});

test("Expedia feed ignores non-Expedia provider revisions", () => {
  assert.equal(shouldIgnoreFeedRevisionForProvider("expedia", buildRevision("expedia", "EXP-001")), false);
  assert.equal(shouldIgnoreFeedRevisionForProvider("expedia", buildRevision("booking", "BDC-001")), true);
  assert.equal(shouldIgnoreFeedRevisionForProvider("expedia", buildRevision("mmt", "MMT-001")), true);
  assert.equal(shouldIgnoreFeedRevisionForProvider("expedia", buildRevision("airbnb", "ABB-001")), true);
  assert.equal(shouldIgnoreFeedRevisionForProvider("expedia", buildRevision("agoda", "AGO-001")), true);
});

test("Agoda and Expedia ARI/feed health stay provider-scoped", () => {
  const agodaAri = buildAriMetadataPatch(null, "agoda", buildAriSnapshot("agoda")) as Record<string, unknown>;
  const agodaThenExpediaAri = buildAriMetadataPatch(agodaAri, "expedia", buildAriSnapshot("expedia")) as Record<string, unknown>;
  const providerAriHealth = agodaThenExpediaAri.providerAriHealth as Record<string, unknown>;

  assert.deepEqual((providerAriHealth.agoda as Record<string, unknown>).hotelId, "agoda-hotel");
  assert.deepEqual((providerAriHealth.expedia as Record<string, unknown>).hotelId, "expedia-hotel");

  const agodaFeed = buildFeedMetadataPatch(null, "agoda", buildFeedSnapshot("agoda")) as Record<string, unknown>;
  const agodaThenExpediaFeed = buildFeedMetadataPatch(agodaFeed, "expedia", buildFeedSnapshot("expedia")) as Record<string, unknown>;
  const providerFeedHealth = agodaThenExpediaFeed.channexProviderFeedHealth as Record<string, unknown>;

  assert.deepEqual((providerFeedHealth.agoda as Record<string, unknown>).hotelId, "agoda-hotel");
  assert.deepEqual((providerFeedHealth.expedia as Record<string, unknown>).hotelId, "expedia-hotel");
});

test("Agoda and Expedia selected-property sync is enabled on the shared lifecycle", () => {
  assert.equal(getChannelProviderCapabilities("agoda").supportsSelectedPropertySyncTest, true);
  assert.equal(getChannelProviderCapabilities("expedia").supportsSelectedPropertySyncTest, true);
});

test("Modification ingest is enabled provider-by-provider on shared OTA lifecycle", () => {
  assert.equal(getChannelProviderCapabilities("mmt").supportsModificationIngest, true);
  assert.equal(getChannelProviderCapabilities("airbnb").supportsModificationIngest, true);
  assert.equal(getChannelProviderCapabilities("agoda").supportsModificationIngest, true);
  assert.equal(getChannelProviderCapabilities("expedia").supportsModificationIngest, true);
  assert.equal(getChannelProviderCapabilities("google-hotel").supportsModificationIngest, false);
});

test("Inventory rate normalization preserves two-decimal manual overrides", () => {
  assert.equal(normalizeInventoryRateAmount(312.66), 312.66);
  assert.equal(normalizeInventoryRateAmount("312.664"), 312.66);
  assert.equal(normalizeInventoryRateAmount("312.665"), 312.67);
  assert.equal(normalizeInventoryRateAmount(-10), 0);
});

test("Bulk calendar room scope only allows one selected room unless all-room apply is explicitly confirmed", () => {
  assert.deepEqual(
    resolveBulkRoomScopePolicy({
      roomIds: ["room-double"],
      roomScope: "single",
      selectedRoomId: "room-double",
      applyToAllRooms: false,
    }),
    { ok: true, roomIds: ["room-double"] }
  );

  assert.deepEqual(
    resolveBulkRoomScopePolicy({
      roomIds: ["room-double", "room-twin"],
      roomScope: "single",
      selectedRoomId: "room-double",
      applyToAllRooms: false,
    }),
    { ok: false, error: "Bulk calendar update room scope did not match the selected room." }
  );

  assert.deepEqual(
    resolveBulkRoomScopePolicy({
      roomIds: ["room-double", "room-twin"],
      roomScope: "all",
      selectedRoomId: null,
      applyToAllRooms: false,
    }),
    { ok: false, error: "Confirm all-room bulk apply before updating every visible room." }
  );

  assert.deepEqual(
    resolveBulkRoomScopePolicy({
      roomIds: ["room-double", "room-twin"],
      roomScope: "all",
      selectedRoomId: null,
      applyToAllRooms: true,
    }),
    { ok: true, roomIds: ["room-double", "room-twin"] }
  );
});

test("Blocked inventory days push zero Channex availability even when physical units remain", () => {
  assert.equal(
    projectChannexAvailabilityValue({
      familyId: "family-1",
      stayUnitId: "room-1",
      date: "2026-11-21",
      timezone: "Asia/Kolkata",
      currency: "INR",
      baseRate: 100,
      effectiveRate: 100,
      rateSource: "manual_rate",
      isBlocked: true,
      blockReason: "manual_block",
      isSellable: false,
      availableUnits: 1,
      allotmentLimit: 1,
      confirmedUnits: 0,
      holdUnits: 0,
      cta: false,
      ctd: false,
      minStay: 1,
      minStayArrival: 1,
      maxStay: 30,
      stopSell: false,
      manualBlockPresent: true,
    }),
    0
  );
});

test("Webhook auth rejects missing secret configuration", () => {
  const rawBody = JSON.stringify({ property_id: "prop_1" });
  const request = new Request("https://famlo.test/api/webhooks/channex/bookings", {
    method: "POST",
    body: rawBody,
    headers: { "content-type": "application/json" },
  });

  const result = verifyChannexWebhookRequest({
    request,
    rawBody,
    env: { NODE_ENV: "test" },
  });

  assert.deepEqual(result, {
    ok: false,
    status: 503,
    error: "webhook not configured",
  });
});

test("Webhook auth rejects wrong secret", () => {
  const rawBody = JSON.stringify({ property_id: "prop_1" });
  const request = new Request("https://famlo.test/api/webhooks/channex/bookings", {
    method: "POST",
    body: rawBody,
    headers: {
      "content-type": "application/json",
      "x-channex-webhook-secret": "wrong-secret",
    },
  });

  const result = verifyChannexWebhookRequest({
    request,
    rawBody,
    env: { NODE_ENV: "test", CHANNEX_WEBHOOK_SECRET: "correct-secret" },
  });

  assert.deepEqual(result, {
    ok: false,
    status: 401,
    error: "Unauthorized",
  });
});

test("Webhook auth accepts correct secret", () => {
  const rawBody = JSON.stringify({ property_id: "prop_1" });
  const request = new Request("https://famlo.test/api/webhooks/channex/bookings", {
    method: "POST",
    body: rawBody,
    headers: {
      "content-type": "application/json",
      "x-channex-webhook-secret": "correct-secret",
    },
  });

  const result = verifyChannexWebhookRequest({
    request,
    rawBody,
    env: { NODE_ENV: "test", CHANNEX_WEBHOOK_SECRET: "correct-secret" },
  });

  assert.deepEqual(result, {
    ok: true,
    mode: "shared_secret",
  });
});

test("Host operation policy blocks activation and dry-run bypass", () => {
  const activationPolicy = resolveProviderOperationPolicy({
    actorRole: "host",
    operationType: "activate_provider",
    requestedDryRun: true,
  });
  assert.equal(activationPolicy.allowed, false);
  assert.equal(activationPolicy.status, 403);

  const writePolicy = resolveProviderOperationPolicy({
    actorRole: "host",
    operationType: "connect_provider",
    requestedDryRun: false,
  });
  assert.equal(writePolicy.allowed, false);
  assert.equal(writePolicy.status, 403);
});

test("Host operation policy allows request review in dry-run mode", () => {
  const reviewPolicy = resolveProviderOperationPolicy({
    actorRole: "host",
    operationType: "request_review",
    requestedDryRun: null,
  });

  assert.equal(reviewPolicy.allowed, true);
  assert.equal(reviewPolicy.effectiveDryRun, true);
});

test("Framework permission guard rejects host activation and allows admin activation", () => {
  assert.throws(
    () =>
      assertChannelProviderOperationPermission({
        actorRole: "host",
        operationType: "activate_provider",
        dryRun: true,
      }),
    (error: unknown) =>
      error instanceof ChannelProviderPermissionError &&
      error.message === "Operator access is required to activate a provider."
  );

  assert.doesNotThrow(() =>
    assertChannelProviderOperationPermission({
      actorRole: "admin",
      operationType: "activate_provider",
      dryRun: false,
    })
  );
});

test("Import preview route allows only clean not-acknowledged revisions and stays idempotent", () => {
  const eligible = assessImportPreviewEligibility({
    importStatus: "preview",
    ackStatus: "not_acknowledged",
    externalBookingId: "ext-booking-1",
    arrivalDate: "2026-05-20",
    departureDate: "2026-05-22",
    externalRoomTypeId: "room-1",
    amountNumber: 2500,
    currency: "INR",
    linkedBookingId: null,
  });
  assert.equal(eligible.ok, true);
  assert.equal(eligible.state, "eligible");

  const duplicate = assessImportPreviewEligibility({
    importStatus: "imported",
    ackStatus: "acknowledged",
    externalBookingId: "ext-booking-1",
    arrivalDate: "2026-05-20",
    departureDate: "2026-05-22",
    externalRoomTypeId: "room-1",
    amountNumber: 2500,
    currency: "INR",
    linkedBookingId: "booking-1",
  });
  assert.equal(duplicate.ok, false);
  assert.equal(duplicate.status, 409);
});

test("Modification apply route only allows reviewed revisions and blocks invalid payloads", () => {
  const eligible = assessModificationApplyEligibility({
    importStatus: "modified_pending_review",
    ackStatus: "not_acknowledged",
    linkedBookingId: "booking-1",
    externalBookingId: "ext-booking-1",
    externalRoomTypeId: "room-1",
    arrivalDate: "2026-05-20",
    departureDate: "2026-05-22",
    amountNumber: 3200,
    currency: "INR",
  });
  assert.equal(eligible.ok, true);
  assert.equal(eligible.state, "eligible");

  const invalid = assessModificationApplyEligibility({
    importStatus: "preview",
    ackStatus: "not_acknowledged",
    linkedBookingId: "booking-1",
    externalBookingId: "ext-booking-1",
    externalRoomTypeId: "room-1",
    arrivalDate: "2026-05-22",
    departureDate: "2026-05-20",
    amountNumber: 3200,
    currency: "INR",
  });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.status, 409);
});

test("Cancellation apply route requires a cancelled revision linked to a Famlo booking", () => {
  const eligible = assessCancellationApplyEligibility({
    revisionStatus: "cancelled",
    linkedBookingId: "booking-1",
  });
  assert.equal(eligible.ok, true);

  const blocked = assessCancellationApplyEligibility({
    revisionStatus: "modified",
    linkedBookingId: "booking-1",
  });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.status, 409);
});

test("Acknowledgement route only allows applied revisions after successful Famlo apply", () => {
  const imported = assessAcknowledgementEligibility({
    importStatus: "imported",
    ackStatus: "not_acknowledged",
    linkedBookingId: "booking-1",
    externalRevisionId: "revision-1",
    source: "booking_revision_feed",
  });
  assert.equal(imported.ok, true);

  const modified = assessAcknowledgementEligibility({
    importStatus: "modified_applied",
    ackStatus: "not_acknowledged",
    linkedBookingId: "booking-1",
    externalRevisionId: "revision-2",
    source: "booking_revision_feed",
  });
  assert.equal(modified.ok, true);

  const cancelled = assessAcknowledgementEligibility({
    importStatus: "cancelled_applied",
    ackStatus: "not_acknowledged",
    linkedBookingId: "booking-1",
    externalRevisionId: "revision-3",
    source: "booking_revision_feed",
  });
  assert.equal(cancelled.ok, true);

  const blocked = assessAcknowledgementEligibility({
    importStatus: "modified_pending_review",
    ackStatus: "not_acknowledged",
    linkedBookingId: "booking-1",
    externalRevisionId: "revision-4",
    source: "booking_revision_feed",
  });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.status, 409);
});

test("Stale Channex room mappings can be rebound to the current Famlo room by matching rate-plan title", () => {
  const candidate = findStaleMappingRebindCandidate(
    "Twin Room",
    ["ac04257c-b81a-4b69-b5a0-23a534b30328", "0faf57da-f72a-4e9e-89af-f136d5fe2640"],
    [
      {
        roomMappingId: "mapping-1",
        previousStayUnitId: "ed2cc187-9c3e-4ecc-b2e7-52aa386a7d99",
        externalRoomTypeId: "room-type-1",
        ratePlanIds: ["rate-plan-1"],
        ratePlanTitles: ["Standard Rate - Twin Room"],
      },
    ]
  );

  assert.equal(candidate?.roomMappingId, "mapping-1");
  assert.equal(candidate?.previousStayUnitId, "ed2cc187-9c3e-4ecc-b2e7-52aa386a7d99");
});

test("Active mapped rooms are not treated as stale rebind candidates", () => {
  const candidate = findStaleMappingRebindCandidate(
    "Twin Room",
    ["ed2cc187-9c3e-4ecc-b2e7-52aa386a7d99"],
    [
      {
        roomMappingId: "mapping-1",
        previousStayUnitId: "ed2cc187-9c3e-4ecc-b2e7-52aa386a7d99",
        externalRoomTypeId: "room-type-1",
        ratePlanIds: ["rate-plan-1"],
        ratePlanTitles: ["Standard Rate - Twin Room"],
      },
    ]
  );

  assert.equal(candidate, null);
});
