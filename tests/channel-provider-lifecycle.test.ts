import test from "node:test";
import assert from "node:assert/strict";

import { buildAriMetadataPatch, type ChannexAriHealthSnapshot } from "@/lib/channex-ari-sync";
import {
  buildFeedMetadataPatch,
  extractProviderKeyFromFeedRevision,
  shouldIgnoreFeedRevisionForProvider,
  type ChannexFeedHealthSnapshot,
} from "@/lib/channex-booking-feed-sync";
import {
  getChannelProviderCapabilities,
  resolveChannelStorageProviderCode,
} from "@/lib/channel-providers/provider-capabilities";

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
