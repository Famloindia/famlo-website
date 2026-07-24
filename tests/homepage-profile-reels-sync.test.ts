import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const source = (file: string): string => readFileSync(path.join(root, file), "utf8");

test("homepage cards overlay canonical family and host profile records", () => {
  const discovery = source("lib/discovery.ts");

  assert.match(discovery, /applyCanonicalHomeProfiles/);
  assert.match(discovery, /select\("id,user_id,listing_profile_version,property_name,listing_title,city,state,village"\)/);
  assert.match(discovery, /select\("id,name,avatar_url,host_profile_version"\)/);
  assert.match(discovery, /hostPhotoUrl: hostCanonical \? hostPhotoUrl : home\.hostPhotoUrl/);
  assert.match(discovery, /href: buildHomestayPath\([\s\S]*familyId/);
});

test("homepage reels include family-scoped dashboard metadata and rank by views", () => {
  const discovery = source("lib/discovery.ts");
  const homepage = source("components/public/DiscoveryHomepage.tsx");

  assert.match(discovery, /parseHostListingMeta\(asOptionalString\(family\.admin_notes\)\)/);
  assert.match(discovery, /meta\.hostReels/);
  assert.match(discovery, /from\("reel_view_counts"\)/);
  assert.match(discovery, /right\.viewCount - left\.viewCount/);
  assert.match(homepage, /Most viewed host reels/);
  assert.match(homepage, /titleHref="\/homestay-reel"/);
});

test("homepage hero accepts only admin banners and banner writes revalidate it", () => {
  const homepage = source("components/public/DiscoveryHomepage.tsx");
  assert.match(homepage, /const banners = safeHeroBanners/);
  assert.doesNotMatch(homepage, /const listingHeroImage/);

  for (const route of ["save", "toggle", "delete"]) {
    const api = source(`app/api/admin/banners/${route}/route.ts`);
    assert.match(api, /revalidateTag\("homepage-discovery", "max"\)/);
    assert.match(api, /revalidatePath\("\/"\)/);
  }
});

test("public reel index and family-scoped view counter are deployable", () => {
  const sitemap = source("app/sitemap.ts");
  const migration = source("supabase/migrations/20260722000002_public_reel_view_counts.sql");
  const viewRoute = source("app/api/public/reels/view/route.ts");

  assert.match(sitemap, /\/homestay-reel/);
  assert.match(migration, /primary key \(family_id, reel_key\)/i);
  assert.match(migration, /increment_reel_view_count/);
  assert.match(viewRoute, /resolvePublicPropertyMedia/);
  assert.match(viewRoute, /p_family_id: familyId/);
});
