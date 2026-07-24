import assert from "node:assert/strict";
import test from "node:test";

import type { HomepageReelRecord } from "@/lib/discovery";
import { matchesPublicReelSearch } from "@/lib/public-reel-search";

function makeReel(overrides: Partial<HomepageReelRecord> = {}): HomepageReelRecord {
  return {
    id: "reel-1",
    familyId: "a2f31723-1e03-418a-93ae-42cfcd8b4168",
    videoUrl: "https://media.example/reel.mp4",
    thumbnailUrl: null,
    title: "A morning at home",
    hostName: "Ram",
    propertyName: "Ram home",
    location: "Near Ginger Hotel, Ahmdabad, Gujrat",
    locality: "Near Ginger Hotel",
    city: "Ahmdabad",
    state: "Gujrat",
    listingHref: "/homestay/ram-home/a2f31723-1e03-418a-93ae-42cfcd8b4168",
    viewCount: 8,
    isFeatured: false,
    source: "family_legacy_reel",
    ...overrides,
  };
}

test("reel search matches host names and property names", () => {
  const reel = makeReel();

  assert.equal(matchesPublicReelSearch(reel, "ram"), true);
  assert.equal(matchesPublicReelSearch(reel, "Ram home"), true);
});

test("reel search matches locality, city, and state", () => {
  const reel = makeReel();

  assert.equal(matchesPublicReelSearch(reel, "ginger"), true);
  assert.equal(matchesPublicReelSearch(reel, "ahmdabad"), true);
  assert.equal(matchesPublicReelSearch(reel, "gujrat"), true);
  assert.equal(matchesPublicReelSearch(reel, "hisar"), false);
});

test("an empty reel query keeps every reel visible", () => {
  assert.equal(matchesPublicReelSearch(makeReel(), "  "), true);
});
