import test from "node:test";
import assert from "node:assert/strict";

import {
  buildPlatformAgreementCompatibilityPatch,
  derivePlatformAgreementState,
  getHostReelAsset,
  isValidGstin,
  normalizeGstin,
} from "@/lib/host-onboarding-legal";

test("single platform agreement maps to legacy acceptance fields", () => {
  const acceptedAt = "2026-05-24T10:00:00.000Z";
  const patch = buildPlatformAgreementCompatibilityPatch(true, acceptedAt);

  assert.equal(patch.platformAgreementAccepted, true);
  assert.equal(patch.hostAgreementAccepted, true);
  assert.equal(patch.termsPrivacyAccepted, true);
  assert.equal(patch.commissionAgreementAccepted, true);
  assert.equal(patch.codeOfConductAccepted, true);
  assert.equal(patch.cancellationPolicyAccepted, true);
  assert.equal(patch.platformAgreementAcceptedAt, acceptedAt);
  assert.equal(patch.hostAgreementAcceptedAt, acceptedAt);
});

test("agreement state falls back from legacy booleans", () => {
  const state = derivePlatformAgreementState({
    hostAgreementAccepted: true,
    termsPrivacyAccepted: true,
    commissionAgreementAccepted: true,
    codeOfConductAccepted: true,
    cancellationPolicyAccepted: true,
    hostAgreementAcceptedAt: "2026-05-24T10:00:00.000Z",
  });

  assert.equal(state.accepted, true);
  assert.equal(state.acceptedAt, "2026-05-24T10:00:00.000Z");
});

test("GSTIN validation is optional but strict when provided", () => {
  assert.equal(normalizeGstin(" 27abcde1234f1z5 "), "27ABCDE1234F1Z5");
  assert.equal(isValidGstin(""), true);
  assert.equal(isValidGstin("27ABCDE1234F1Z5"), true);
  assert.equal(isValidGstin("INVALID-GST"), false);
});

test("host reel helper hides empty data and returns saved reels", () => {
  assert.equal(getHostReelAsset({ meta: {}, payload: {}, row: {} }), null);

  const reel = getHostReelAsset({
    meta: {},
    payload: {
      hostReelPublicUrl: "https://cdn.example.com/reel.mp4",
      hostReelStorageKey: "host-reels/draft-a/reel.mp4",
      hostReelMimeType: "video/mp4",
      hostReelSizeBytes: 1024,
      hostReelUploadedAt: "2026-05-24T10:00:00.000Z",
    },
    row: {},
  });

  assert.deepEqual(reel, {
    publicUrl: "https://cdn.example.com/reel.mp4",
    storageKey: "host-reels/draft-a/reel.mp4",
    mimeType: "video/mp4",
    sizeBytes: 1024,
    uploadedAt: "2026-05-24T10:00:00.000Z",
  });
});

test("host reel helper supports row-level snake_case fallback", () => {
  const reel = getHostReelAsset({
    meta: {},
    payload: {},
    row: {
      host_reel_public_url: "https://cdn.example.com/reel-row.mp4",
      host_reel_storage_key: "host-reels/draft-b/reel-row.mp4",
      host_reel_mime_type: "video/webm",
      host_reel_size_bytes: 2048,
      host_reel_uploaded_at: "2026-05-24T12:00:00.000Z",
    },
  });

  assert.deepEqual(reel, {
    publicUrl: "https://cdn.example.com/reel-row.mp4",
    storageKey: "host-reels/draft-b/reel-row.mp4",
    mimeType: "video/webm",
    sizeBytes: 2048,
    uploadedAt: "2026-05-24T12:00:00.000Z",
  });
});
