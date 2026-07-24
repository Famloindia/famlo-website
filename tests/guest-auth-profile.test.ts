import assert from "node:assert/strict";
import test from "node:test";

import {
  getGuestPhoneLookupVariants,
  mergeGuestProfileCandidates,
  normalizeGuestEmail,
  normalizeGuestPhone,
  pickCanonicalGuestProfile,
} from "../lib/guest-identity";
import { createGuestSessionSnapshot } from "../lib/guest-session";
import { isGuestProfileComplete, mergeUserProfilePatch } from "../lib/user-profile";

test("guest identity normalization lowercases emails and canonicalizes Indian phones", () => {
  assert.equal(normalizeGuestEmail("  AryanKrishan143@Gmail.com "), "aryankrishan143@gmail.com");
  assert.equal(normalizeGuestPhone("74044 77395"), "+917404477395");
  assert.deepEqual(
    getGuestPhoneLookupVariants("+91 74044 77395"),
    ["+917404477395", "917404477395", "7404477395", "07404477395"]
  );
});

test("canonical guest selection prefers the most complete row", () => {
  const rows = [
    {
      id: "sparse",
      phone: "7404477395",
      email: null,
      name: "Aryan",
      updated_at: "2026-07-10T00:00:00.000Z",
      onboarding_completed: false,
    },
    {
      id: "complete",
      phone: "+91 7404477395",
      email: "aryankrishan143@gmail.com",
      name: "Aryan Krishan",
      city: "Hisar",
      state: "Haryana",
      about: "Guest profile",
      gender: "male",
      date_of_birth: "2000-01-01",
      updated_at: "2026-07-09T00:00:00.000Z",
      onboarding_completed: true,
    },
  ];

  assert.equal(pickCanonicalGuestProfile(rows)?.id, "complete");
});

test("merged guest profile preserves the best non-empty values across duplicates", () => {
  const merged = mergeGuestProfileCandidates(
    [
      {
        id: "left",
        email: "aryankrishan143@gmail.com",
        phone: "7404477395",
        name: "Aryan",
      },
      {
        id: "right",
        email: "aryankrishan143@gmail.com",
        phone: "+91 7404477395",
        city: "Hisar",
        state: "Haryana",
        about: "Returning guest",
        gender: "male",
        date_of_birth: "2000-01-01",
        onboarding_completed: true,
      },
    ],
    "right"
  );

  assert.equal(merged?.id, "right");
  assert.equal(merged?.phone, "+917404477395");
  assert.equal(merged?.city, "Hisar");
  assert.equal(merged?.about, "Returning guest");
});

test("profile patch merge preserves saved values during partial updates", () => {
  const merged = mergeUserProfilePatch(
    {
      id: "guest-1",
      name: "Aryan Krishan",
      phone: "+917404477395",
      email: "aryankrishan143@gmail.com",
      city: "Hisar",
      state: "Haryana",
      onboarding_completed: true,
      avatar_url: null,
      about: "Returning guest",
      date_of_birth: "2000-01-01",
      gender: "male",
      kyc_status: null,
      id_document_url: null,
      id_document_type: null,
    },
    {
      userId: "guest-1",
      city: "Gurugram",
    }
  );

  assert.equal(merged.name, "Aryan Krishan");
  assert.equal(merged.phone, "+917404477395");
  assert.equal(merged.city, "Gurugram");
  assert.equal(merged.about, "Returning guest");
});

test("guest profile completion uses one shared deterministic rule", () => {
  assert.equal(
    isGuestProfileComplete({
      id: "guest-1",
      name: "Aryan Krishan",
      phone: "+917404477395",
      email: "aryankrishan143@gmail.com",
      city: "Hisar",
      state: "Haryana",
      onboarding_completed: false,
      avatar_url: null,
      about: "Returning guest",
      date_of_birth: "2000-01-01",
      gender: "male",
      kyc_status: null,
      id_document_url: null,
      id_document_type: null,
    }),
    true
  );

  assert.equal(
    isGuestProfileComplete({
      id: "guest-2",
      name: "Aryan Krishan",
      phone: "+917404477395",
      email: null,
      city: "Hisar",
      state: "Haryana",
      onboarding_completed: false,
      avatar_url: null,
      about: null,
      date_of_birth: "2000-01-01",
      gender: "male",
      kyc_status: null,
      id_document_url: null,
      id_document_type: null,
    }),
    false
  );
});

test("guest session snapshot returns completion state from the canonical profile", () => {
  const snapshot = createGuestSessionSnapshot(
    {
      id: "guest-1",
      email: "aryankrishan143@gmail.com",
      phone: "+917404477395",
      provider: "google",
      authKind: "supabase",
    },
    {
      id: "guest-1",
      name: "Aryan Krishan",
      phone: "+917404477395",
      email: "aryankrishan143@gmail.com",
      city: "Hisar",
      state: "Haryana",
      onboarding_completed: false,
      avatar_url: null,
      about: "Returning guest",
      date_of_birth: "2000-01-01",
      gender: "male",
      kyc_status: null,
      id_document_url: null,
      id_document_type: null,
    }
  );

  assert.equal(snapshot.user?.provider, "google");
  assert.equal(snapshot.profileComplete, true);
});
