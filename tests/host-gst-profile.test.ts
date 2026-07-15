import test from "node:test";
import assert from "node:assert/strict";

import { mapHostGstProfileRow } from "@/lib/host-gst-profile";

test("GST profile mapper normalizes GSTIN and falls back to pending review when present", () => {
  const profile = mapHostGstProfileRow({
    id: "gst-1",
    host_id: "host-1",
    user_id: "user-1",
    family_id: "family-1",
    gstin: " 27abcde1234f1z5 ",
    verification_status: "",
    created_at: "2026-05-25T10:00:00.000Z",
    updated_at: "2026-05-25T11:00:00.000Z",
  });

  assert.equal(profile.gstin, "27ABCDE1234F1Z5");
  assert.equal(profile.verificationStatus, "pending_review");
  assert.equal(profile.hostId, "host-1");
});

test("GST profile mapper returns not_provided when GSTIN is empty", () => {
  const profile = mapHostGstProfileRow({
    id: "gst-2",
    host_id: "host-2",
    user_id: "user-2",
    family_id: "family-2",
    gstin: "",
    verification_status: "",
  });

  assert.equal(profile.gstin, "");
  assert.equal(profile.verificationStatus, "not_provided");
});
