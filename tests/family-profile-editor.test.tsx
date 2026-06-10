import test from "node:test";
import assert from "node:assert/strict";
import {
  buildListingFromFamily,
  buildProfileFromFamily,
  saveFamilyProfileWorkspace,
  type FamilyComplianceDraft,
  type FamilyListingDraft,
  type FamilyPhotoItem,
  type FamilyProfileDraft,
  type FamilyScheduleDraft,
} from "@/lib/family-profile-editor";
import type { HostListingMeta } from "@/lib/host-listing-meta";

const profile: FamilyProfileDraft = {
  hostDisplayName: "Asha Host",
  email: "asha@example.com",
  hostHobbies: "Cooking, Travel",
  familyComposition: "",
  city: "Jaipur",
  state: "Rajasthan",
  cityNeighbourhood: "Bani Park",
  hostCatchphrase: "",
  hostSelfieUrl: "https://example.com/host.jpg",
  mobileNumber: "",
  languages: "",
};

const listing: FamilyListingDraft = {
  propertyName: "Sun Courtyard Villa",
  hostBio: "Warm hosting in the city center.",
  listingTitle: "Stay with a Jaipur family",
  culturalOffering: "Tea and local stories",
  journeyStory: "Started hosting in 2020.",
  specialExperience: "Courtyard dinners",
  localExperience: "Old city walks",
  interactionType: "Friendly and available",
  houseType: "Joint family",
  checkInTime: "12:00 PM",
  checkOutTime: "10:00 AM",
  bathroomType: "Private bathroom",
  propertyAddress: "Bani Park, Jaipur",
  commonAreas: "",
  amenities: "Wifi",
  includedItems: "Breakfast",
  houseRules: "No smoking",
  googleMapsLink: "https://maps.google.com/?q=jaipur",
  priceMorning: "",
  priceAfternoon: "",
  priceEvening: "",
  priceFullday: "",
  foodType: "Vegetarian",
};

const schedule: FamilyScheduleDraft = {
  isActive: true,
  isAccepting: true,
  bookingRequiresHostApproval: false,
  maxGuests: "4",
  activeQuarters: "",
  blockedDates: "",
};

const compliance: FamilyComplianceDraft = {
  pccFileName: "",
  propertyProofFileName: "",
  formCFileName: "",
  panCardUrl: "",
  propertyOwnershipUrl: "",
  nocUrl: "",
  policeVerificationUrl: "",
  fssaiRegistrationUrl: "",
  idDocumentType: "",
  idDocumentUrl: "",
  liveSelfieUrl: "",
  panNumber: "",
  panMasked: "",
  panLastFour: "",
  panHolderName: "",
  panDateOfBirth: "",
  panVerificationStatus: "pending",
  panVerificationProvider: "",
  panRiskFlag: false,
  panConsentGiven: false,
  isPanVerified: false,
  panVerifiedAt: "",
  gstin: "27ABCDE1234F1Z5",
  platformAgreementAcceptedAt: "2026-05-24T00:00:00.000Z",
  adminNotes: "",
};

const photos: FamilyPhotoItem[] = [
  {
    id: "photo-1",
    url: "https://example.com/cover.jpg",
    isPrimary: true,
    family_id: "family-a",
  },
];

test("Profile builders stay scoped to the selected family payload", () => {
  const meta: HostListingMeta = {
    hostDisplayName: "Property B Host",
    listingTitle: "Listing B",
    journeyStory: "Story B",
    specialExperience: "Special B",
    localExperience: "Local B",
    interactionType: "Quiet and helpful",
    houseType: "Solo host",
    hostHobbies: "Tea, Books",
  };
  const family = {
    id: "family-b",
    name: "Property B",
    city: "Udaipur",
    state: "Rajasthan",
    village: "Old Town",
    host_photo_url: "https://example.com/property-b-host.jpg",
    latest_onboarding_payload: {
      propertyName: "Lake View Haveli",
      hostBio: "Property B bio",
    },
  } satisfies Record<string, unknown>;

  const scopedProfile = buildProfileFromFamily(family, meta);
  const scopedListing = buildListingFromFamily(family, meta);

  assert.equal(scopedProfile.hostDisplayName, "Property B Host");
  assert.equal(scopedProfile.city, "Udaipur");
  assert.equal(scopedProfile.cityNeighbourhood, "Old Town");
  assert.equal(scopedListing.propertyName, "Property B");
  assert.equal(scopedListing.listingTitle, "Listing B");
  assert.equal(scopedListing.journeyStory, "Story B");
});

test("Listing builder prefers saved family amenities and canonical reel fields", () => {
  const meta: HostListingMeta = {
    amenities: ["Legacy Amenity"],
    hostReelPublicUrl: "https://legacy.example.com/reel.mp4",
  };
  const family = {
    id: "family-canonical",
    amenities: ["Wifi", "Breakfast"],
    host_reel_public_url: "https://cdn.example.com/reel.mp4",
    host_reel_storage_key: "property-media/family-canonical/reels/reel.mp4",
    host_reel_mime_type: "video/mp4",
    host_reel_size_bytes: 2048,
    latest_onboarding_payload: {
      amenities: ["Draft Amenity"],
    },
  } satisfies Record<string, unknown>;

  const built = buildListingFromFamily(family, meta);

  assert.equal(built.amenities, "Wifi, Breakfast");
  assert.equal(built.hostReelPublicUrl, "https://cdn.example.com/reel.mp4");
  assert.equal(built.hostReelStorageKey, "property-media/family-canonical/reels/reel.mp4");
});


test("Shared profile save helper posts the selected family payload", async () => {
  const calls: Array<{ url: string; body: string }> = [];
  const originalFetch = global.fetch;

  global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({
      url: String(input),
      body: typeof init?.body === "string" ? init.body : "",
    });
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const result = await saveFamilyProfileWorkspace({
      familyId: "family-b",
      profile,
      listing,
      schedule,
      photos,
      compliance,
    });

    assert.equal(result.ok, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.url, "/api/onboarding/home/dashboard-save");

    const payload = JSON.parse(calls[0]?.body ?? "{}") as { familyId?: string; profile?: { hostDisplayName?: string } };
    assert.equal(payload.familyId, "family-b");
    assert.equal(payload.profile?.hostDisplayName, "Asha Host");
  } finally {
    global.fetch = originalFetch;
  }
});

test("Profile save helper preserves listing and profile fields for the selected family", async () => {
  const calls: Array<{ body: string }> = [];
  const originalFetch = global.fetch;

  global.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ body: typeof init?.body === "string" ? init.body : "" });
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  try {
    await saveFamilyProfileWorkspace({
      familyId: "family-c",
      profile,
      listing,
      schedule,
      photos,
      compliance,
    });

    const payload = JSON.parse(calls[0]?.body ?? "{}") as {
      familyId?: string;
      listing?: { propertyName?: string };
      profile?: { hostDisplayName?: string };
    };
    assert.equal(payload.familyId, "family-c");
    assert.equal(payload.listing?.propertyName, "Sun Courtyard Villa");
    assert.equal(payload.profile?.hostDisplayName, "Asha Host");
  } finally {
    global.fetch = originalFetch;
  }
});

test("Profile save helper includes optional GSTIN compliance details", async () => {
  const calls: Array<{ body: string }> = [];
  const originalFetch = global.fetch;

  global.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ body: typeof init?.body === "string" ? init.body : "" });
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  try {
    await saveFamilyProfileWorkspace({
      familyId: "family-gstin",
      profile,
      listing,
      schedule,
      photos,
      compliance,
    });

    const payload = JSON.parse(calls[0]?.body ?? "{}") as {
      compliancePatch?: { gstin?: string; platformAgreementAcceptedAt?: string };
    };
    assert.equal(payload.compliancePatch?.gstin, "27ABCDE1234F1Z5");
    assert.equal(payload.compliancePatch?.platformAgreementAcceptedAt, "2026-05-24T00:00:00.000Z");
  } finally {
    global.fetch = originalFetch;
  }
});
