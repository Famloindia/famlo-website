import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

test("dashboard compatibility save delegates to the canonical profile API only", () => {
  const source = read("app/api/onboarding/home/dashboard-save/route.ts");
  assert.match(source, /listing-profile\/route/);
  assert.doesNotMatch(source, /host_onboarding_drafts/);
  assert.doesNotMatch(source, /stay_units_v2/);
  assert.doesNotMatch(source, /family_photos/);
});

test("public home uses the shared profile and never substitutes first-room amenities", () => {
  const source = read("app/homes/[id]/page.tsx");
  assert.match(source, /getPublicListingProfile/);
  assert.match(source, /amenities:\s*listingProfile\.property\.amenities/);
  assert.doesNotMatch(source, /primaryStayUnit\.amenities/);
  assert.match(source, /imageUrls\.length > 0[\s\S]*?<HostGalleryViewer/);
});

test("onboarding submission binds and verifies a selected family before canonical publish", () => {
  const source = read("app/api/onboarding/home/submit/route.ts");
  assert.match(source, /requestedFamilyId/);
  assert.match(source, /data\.user_id !== userId/);
  assert.match(source, /updateHostPropertyListingProfile/);
  assert.match(source, /syncSubmittedListingMedia/);
});

test("listing profile route authorizes the selected family and revalidates public routes", () => {
  const source = read("app/api/host/listing-profile/route.ts");
  assert.match(source, /resolveAuthorizedHostResource/);
  assert.match(source, /revalidateListing/);
  assert.match(source, /Cache-Control.*no-store/);
});

test("profile editor exposes canonical identity controls without property geolocation", () => {
  const profileTab = read("components/partners/tabs/ProfileTab.tsx");
  const propertyManager = read("components/partners/property/PropertyContentManager.tsx");

  assert.match(profileTab, /<select className=\{styles\.inputField\} value=\{profile\.state/);
  assert.match(profileTab, /Languages Spoken/);
  assert.match(profileTab, /customHobbies\.map/);
  assert.doesNotMatch(propertyManager, />Geolocation Data</);
  assert.match(propertyManager, /action: "update_metadata"/);
  assert.match(propertyManager, /Reel title/);
});

test("public profile shows state, listing title, and per-reel titles", () => {
  const source = read("app/homes/[id]/page.tsx");

  assert.match(source, /uniqueLocationParts\(\[home\.village, home\.city, home\.state\]\)/);
  assert.match(source, /home\.listingTitle \|\| home\.name/);
  assert.match(source, /reel\.title \|\| "Host reel"/);
});
