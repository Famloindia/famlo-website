import test from "node:test";
import assert from "node:assert/strict";

import {
  formatListingTime,
  normalizeListingTime,
  normalizeProfileList,
  toPublicListingProfile,
  type HostPropertyListingProfile,
} from "@/lib/host-property-profile";

test("listing times normalize old 12-hour and database formats", () => {
  assert.equal(normalizeListingTime("12:00 PM"), "12:00");
  assert.equal(normalizeListingTime("10:00 AM"), "10:00");
  assert.equal(normalizeListingTime("00:30:00"), "00:30");
  assert.equal(formatListingTime("12:00:00"), "12:00 PM");
  assert.equal(formatListingTime("10:00"), "10:00 AM");
  assert.equal(normalizeListingTime("29:00"), "");
});

test("profile lists preserve order while removing casing duplicates", () => {
  assert.deepEqual(
    normalizeProfileList("No smoking, No Smoking\nQuiet after 10 PM, no SMOKING"),
    ["No smoking", "Quiet after 10 PM"]
  );
});

test("public listing projection never exposes address or exact coordinates", () => {
  const profile = {
    identity: {
      userId: "user-a",
      displayName: "Asha",
      profilePhotoUrl: "https://example.com/host.jpg",
      hobbies: ["Cooking"],
      languages: ["Hindi"],
      biography: "Host bio",
    },
    property: {
      familyId: "family-a",
      hostId: "host-a",
      propertyName: "Asha Home",
      listingTitle: "Courtyard stay",
      hostBio: "Host bio",
      city: "Jaipur",
      state: "Rajasthan",
      locality: "Bani Park",
      journeyStory: "",
      specialExperience: "",
      localExperience: "",
      culturalOffering: "",
      homeType: "Independent home",
      interactionType: "Available when needed",
      houseRules: ["No smoking"],
      amenities: ["Wifi"],
      foodTypes: ["Vegetarian"],
      includedItems: ["Breakfast"],
      bathroomType: "Private",
      checkInTime: "12:00",
      checkOutTime: "10:00",
      commonAreas: ["Courtyard"],
      streetAddress: "Private exact address",
      googleMapsLink: "https://maps.example/exact",
      exactLatitude: 26.9124,
      exactLongitude: 75.7873,
      publicLatitude: 26.91,
      publicLongitude: 75.78,
      nearbyPlaces: [{ name: "City Palace", distance: "2", unit: "km", latitude: 26.9, exactAddress: "private" }],
      neighborhoodDescription: "Central neighborhood",
      accessibilityDescription: "",
      pincode: "302016",
      familyType: "Joint family",
    },
    photos: [],
    reels: [],
  } satisfies HostPropertyListingProfile;

  const publicProfile = toPublicListingProfile(profile);
  assert.equal("streetAddress" in publicProfile.property, false);
  assert.equal("googleMapsLink" in publicProfile.property, false);
  assert.equal("exactLatitude" in publicProfile.property, false);
  assert.equal("exactLongitude" in publicProfile.property, false);
  assert.equal("pincode" in publicProfile.property, false);
  assert.equal("userId" in publicProfile.identity, false);
  assert.notEqual(publicProfile.property.publicLatitude, profile.property.exactLatitude);
  assert.deepEqual(publicProfile.property.nearbyPlaces, [{ name: "City Palace", distance: "2", unit: "km" }]);
  assert.equal(publicProfile.property.locality, "Bani Park");
});
