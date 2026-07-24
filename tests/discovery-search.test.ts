import assert from "node:assert/strict";
import test from "node:test";

import type { HomeCardRecord } from "@/lib/discovery";
import { matchesDiscoveryStayFilter } from "@/lib/discovery-filters";
import {
  buildDestinationSuggestions,
  isHomeAvailableForDateRange,
  matchesDiscoveryQuery,
  resolveDiscoveryDateRange,
  supportsGuestCount,
} from "@/lib/discovery-search";

function makeHome(overrides: Partial<HomeCardRecord> = {}): HomeCardRecord {
  return {
    id: "home-1",
    href: "/homestays/home-1",
    hostId: "host-1",
    hostUserId: "user-1",
    legacyFamilyId: "family-1",
    name: "Mountain Nest",
    hostName: "Famlo Host",
    city: "Manali",
    state: "Himachal Pradesh",
    village: "Old Manali",
    description: "A calm mountain homestay",
    culturalOffering: "Local food experience",
    includedItems: [],
    houseRules: [],
    amenities: ["WiFi"],
    bathroomType: "Private bathroom",
    listingTitle: "Manali mountain stay",
    maxGuests: 4,
    roomCount: 2,
    startingRoomPrice: 2200,
    priceMorning: 0,
    priceAfternoon: 0,
    priceEvening: 0,
    priceFullday: 2200,
    rating: 4.8,
    totalReviews: 12,
    superhost: false,
    isActive: true,
    isAccepting: true,
    googleMapsLink: null,
    activeQuarters: ["fullday"],
    blockedDates: [],
    platformCommissionPct: 12,
    bookingRequiresHostApproval: false,
    checkInTime: null,
    checkOutTime: null,
    lat: 32.2396,
    lng: 77.1887,
    latExact: null,
    lngExact: null,
    landmarks: [],
    neighborhoodDesc: null,
    accessibilityDesc: null,
    imageUrls: [],
    roomImageUrls: [],
    hostPhotoUrl: null,
    featured: false,
    ...overrides,
  };
}

test("destination suggestions rank Manali for partial 'man' input", () => {
  const suggestions = buildDestinationSuggestions([makeHome()], "man");

  assert.equal(suggestions[0], "Manali");
});

test("discovery query matches place fields, not just exact title", () => {
  assert.equal(matchesDiscoveryQuery(makeHome({ state: "Haryana", city: "Gurugram" }), "haryana"), true);
  assert.equal(matchesDiscoveryQuery(makeHome({ village: "Kasol" }), "kaso"), true);
  assert.equal(matchesDiscoveryQuery(makeHome({ listingTitle: "Hidden orchard stay" }), "orchard"), true);
  assert.equal(
    matchesDiscoveryQuery(makeHome({ city: "Manali", state: "Himachal Pradesh" }), "manali, himachal pradesh"),
    true
  );
});

test("legacy homepage date params resolve to canonical from/to dates", () => {
  assert.deepEqual(
    resolveDiscoveryDateRange({
      date: "2026-08-05",
      date_to: "2026-08-07",
    }),
    {
      fromDate: "2026-08-05",
      toDate: "2026-08-07",
    }
  );
});

test("availability check blocks homes with blocked dates inside the requested range", () => {
  const home = makeHome({ blockedDates: ["2026-08-06"] });

  assert.equal(isHomeAvailableForDateRange(home, "2026-08-05", "2026-08-07"), false);
  assert.equal(isHomeAvailableForDateRange(home, "2026-08-08", "2026-08-10"), true);
});

test("guest filtering only allows homes with enough capacity", () => {
  const home = makeHome({ maxGuests: 3 });

  assert.equal(supportsGuestCount(home, 2), true);
  assert.equal(supportsGuestCount(home, 5), false);
});

test("discovery stay filters use reusable structured rules", () => {
  assert.equal(
    matchesDiscoveryStayFilter(
      makeHome({ amenities: ["Swimming pool", "WiFi"] }),
      "With pool"
    ),
    true
  );

  assert.equal(
    matchesDiscoveryStayFilter(
      makeHome({ amenities: ["Pet friendly", "WiFi"] }),
      "Pet stay"
    ),
    true
  );

  assert.equal(
    matchesDiscoveryStayFilter(
      makeHome({ city: "Goa", description: "Beach homestay right by the sea" }),
      "Beach stay"
    ),
    true
  );

  assert.equal(
    matchesDiscoveryStayFilter(
      makeHome({ startingRoomPrice: 2400 }),
      "Under ₹2500"
    ),
    true
  );

  assert.equal(
    matchesDiscoveryStayFilter(
      makeHome({ bookingRequiresHostApproval: true }),
      "Instant book"
    ),
    false
  );
});
