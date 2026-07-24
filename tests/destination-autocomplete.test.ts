import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import type { HomeCardRecord } from "@/lib/discovery";
import {
  buildDiscoverySearchHref,
  buildPopularDestinationSuggestions,
  getNextDestinationIndex,
  rankDestinationSuggestions,
  resolveDestinationSearchQuery,
  type DestinationSuggestion,
} from "@/lib/destination-autocomplete";
import { searchPublicDestinations } from "@/lib/destination-search-service";

const repoRoot = process.cwd();
const componentPath = path.join(repoRoot, "components/public/DestinationAutocomplete.tsx");
const migrationPath = path.join(repoRoot, "supabase/migrations/20260720000002_public_destination_search.sql");
const componentSource = fs.readFileSync(componentPath, "utf8");
const migrationSource = fs.readFileSync(migrationPath, "utf8");

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

function makeSuggestion(overrides: Partial<DestinationSuggestion> = {}): DestinationSuggestion {
  return {
    name: "Manali",
    slug: "manali-himachal-pradesh",
    state: "Himachal Pradesh",
    country: "India",
    propertyCount: 48,
    searchValue: "Manali, Himachal Pradesh",
    ...overrides,
  };
}

test("destination ranking returns Manali first for 'man' and remains case-insensitive", () => {
  const ranked = rankDestinationSuggestions(
    [
      makeSuggestion(),
      makeSuggestion({
        name: "Mandi",
        slug: "mandi-himachal-pradesh",
        propertyCount: 12,
        searchValue: "Mandi, Himachal Pradesh",
      }),
      makeSuggestion({
        name: "Udaipur",
        slug: "udaipur-rajasthan",
        state: "Rajasthan",
        propertyCount: 30,
        searchValue: "Udaipur, Rajasthan",
      }),
    ],
    "MAN"
  );

  assert.equal(ranked[0]?.name, "Manali");
});

test("destination ranking still surfaces Manali for typo input like 'manli'", () => {
  const ranked = rankDestinationSuggestions(
    [
      makeSuggestion(),
      makeSuggestion({
        name: "Munnar",
        slug: "munnar-kerala",
        state: "Kerala",
        propertyCount: 20,
        searchValue: "Munnar, Kerala",
      }),
    ],
    "manli"
  );

  assert.equal(ranked[0]?.name, "Manali");
});

test("popular destination suggestions group duplicate city records and count active public homes", () => {
  const suggestions = buildPopularDestinationSuggestions([
    makeHome({ id: "home-1", hostId: "host-1", legacyFamilyId: "family-1", city: "Manali" }),
    makeHome({ id: "home-2", hostId: "host-2", legacyFamilyId: "family-2", city: "manali" }),
    makeHome({ id: "home-3", hostId: "host-3", legacyFamilyId: "family-3", city: "Udaipur", state: "Rajasthan" }),
    makeHome({ id: "home-4", hostId: "host-4", legacyFamilyId: "family-4", city: "Shimla", isAccepting: false }),
  ]);

  assert.equal(suggestions[0]?.name, "Manali");
  assert.equal(suggestions[0]?.propertyCount, 2);
  assert.equal(suggestions.some((suggestion) => suggestion.name === "Shimla"), false);
});

test("destination search route helper preserves dates, guests, and coordinates for selected destinations", () => {
  const href = buildDiscoverySearchHref({
    query: "man",
    selectedDestination: makeSuggestion(),
    checkInDate: "2026-08-10",
    checkOutDate: "2026-08-12",
    guestCount: "3",
    userCoords: { lat: 32.2396, lng: 77.1887 },
  });

  assert.equal(
    href,
    "/homestays?q=Manali%2C+Himachal+Pradesh&from=2026-08-10&to=2026-08-12&guests=3&lat=32.239600&lng=77.188700"
  );
  assert.equal(resolveDestinationSearchQuery("man", makeSuggestion()), "Manali, Himachal Pradesh");
});

test("short destination queries return no server results", async () => {
  let rpcCalls = 0;
  const supabase = {
    rpc: async () => {
      rpcCalls += 1;
      return { data: [], error: null };
    },
  };

  const results = await searchPublicDestinations(supabase as never, "m");
  assert.deepEqual(results, []);
  assert.equal(rpcCalls, 0);
});

test("server destination search normalizes RPC rows and filters zero-count destinations", async () => {
  const supabase = {
    rpc: async () => ({
      data: [
        {
          name: "Manali",
          slug: "manali-himachal-pradesh",
          state: "Himachal Pradesh",
          country: "India",
          property_count: 48,
          match_kind: "prefix",
          similarity_score: 0.91,
        },
        {
          name: "Draft City",
          slug: "draft-city-state",
          state: "State",
          country: "India",
          property_count: 0,
          match_kind: "prefix",
          similarity_score: 0.99,
        },
      ],
      error: null,
    }),
  };

  const results = await searchPublicDestinations(supabase as never, "man");
  assert.equal(results.length, 1);
  assert.equal(results[0]?.name, "Manali");
  assert.equal(results[0]?.propertyCount, 48);
});

test("keyboard navigation helper cycles through suggestions", () => {
  assert.equal(getNextDestinationIndex(-1, 1, 3), 0);
  assert.equal(getNextDestinationIndex(0, 1, 3), 1);
  assert.equal(getNextDestinationIndex(0, -1, 3), 2);
});

test("autocomplete component wires combobox accessibility and keyboard selection controls", () => {
  assert.match(componentSource, /role="combobox"/);
  assert.match(componentSource, /role="listbox"/);
  assert.match(componentSource, /role="option"/);
  assert.match(componentSource, /event\.key === "ArrowDown"/);
  assert.match(componentSource, /event\.key === "ArrowUp"/);
  assert.match(componentSource, /event\.key === "Enter"/);
  assert.match(componentSource, /event\.key === "Escape"/);
});

test("destination migration enables trigram search and keeps only public approved inventory", () => {
  assert.match(migrationSource, /create extension if not exists pg_trgm;/i);
  assert.match(migrationSource, /create or replace function public\.search_public_destinations/i);
  assert.match(migrationSource, /property_marketplace_status = 'approved'/);
  assert.match(migrationSource, /trust_status <> 'blocked'/);
  assert.match(migrationSource, /coalesce\(is_accepting, true\) = true/);
  assert.match(migrationSource, /coalesce\(room_count, 0\) > 0/);
  assert.match(migrationSource, /coalesce\(starting_room_price, 0\) > 0/);
});
