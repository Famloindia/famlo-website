import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const repoRoot = process.cwd();
const shellPath = path.join(repoRoot, "components/partners/pro/FamloProDashboardShell.tsx");
const hostProfileCenterPath = path.join(repoRoot, "components/partners/pro/ProHostProfileCenter.tsx");
const documentsTabPath = path.join(repoRoot, "components/partners/tabs/DocumentsTab.tsx");
const hostDashboardEditorPath = path.join(repoRoot, "components/partners/HostDashboardEditor.tsx");
const gstProfileRoutePath = path.join(repoRoot, "app/api/host/gst-profile/route.ts");
const renderDashboardPath = path.join(repoRoot, "app/partnerslogin/home/pro/dashboard/render-dashboard.tsx");
const verifyRoutePath = path.join(repoRoot, "app/api/host/pro/billing/verify/route.ts");

const shellSource = fs.readFileSync(shellPath, "utf8");
const hostProfileCenterSource = fs.readFileSync(hostProfileCenterPath, "utf8");
const documentsTabSource = fs.readFileSync(documentsTabPath, "utf8");
const hostDashboardEditorSource = fs.readFileSync(hostDashboardEditorPath, "utf8");
const gstProfileRouteSource = fs.readFileSync(gstProfileRoutePath, "utf8");
const renderDashboardSource = fs.readFileSync(renderDashboardPath, "utf8");
const verifyRouteSource = fs.readFileSync(verifyRoutePath, "utf8");
const roomCardSectionSource = shellSource.slice(
  shellSource.indexOf("propertiesRoomShowcaseGrid"),
  shellSource.indexOf("addRoomShowcaseCard")
);

test("post-payment redirect still lands on the active Famlo Pro dashboard route", () => {
  assert.match(renderDashboardSource, /FamloProDashboardShell/);
  assert.match(verifyRouteSource, /\/partnerslogin\/home\/pro\/dashboard\?family=.*section=properties-home/);
});

test("support view uses the host-facing support and resolution shell", () => {
  assert.match(shellSource, /Support &amp; Resolution/);
  assert.match(shellSource, /Need help with a booking, payout, OTA connection, or Famlo Pro setup\? Message Team Famlo directly\./);
  assert.doesNotMatch(shellSource, /Support \+ Billing/);
});

test("settings view includes appearance controls for light and dark mode", () => {
  assert.match(shellSource, /Appearance/);
  assert.match(shellSource, /Light mode/);
  assert.match(shellSource, /Dark mode/);
  assert.match(shellSource, /famlo-pro-theme/);
  assert.match(shellSource, /famlo-pro-dashboard-appearance/);
});

test("revenue view promotes revenue by source and removes the old hero", () => {
  assert.doesNotMatch(shellSource, /shouldUseRevenueDemo/);
  assert.doesNotMatch(shellSource, /demoRevenueRows/);
  assert.match(shellSource, /Revenue by source/);
  assert.doesNotMatch(shellSource, /Famlo helped you earn/);
  assert.match(shellSource, /No completed earnings in this period yet/);
});

test("reports view removes the pilot snapshot and supports booking revenue graph switching", () => {
  assert.doesNotMatch(shellSource, /Pilot performance snapshot/);
  assert.match(shellSource, /Booking trend/);
  assert.match(shellSource, /Revenue generated/);
  assert.match(shellSource, /Show revenue graph/);
  assert.match(shellSource, /Show booking graph/);
});

test("room cards replace noisy room tags with a single edit and connect CTA", () => {
  assert.match(roomCardSectionSource, /Edit and connect/);
  assert.match(roomCardSectionSource, /propertyRoomShowcaseAction/);
  assert.doesNotMatch(roomCardSectionSource, /maxGuests\} guests/);
  assert.doesNotMatch(roomCardSectionSource, /bedInfo/);
  assert.doesNotMatch(roomCardSectionSource, /bathroomType/);
  assert.doesNotMatch(roomCardSectionSource, /Ready for edit/);
  assert.doesNotMatch(roomCardSectionSource, /photoStatus/);
  assert.doesNotMatch(roomCardSectionSource, /providerMappingLabel/);
  assert.doesNotMatch(roomCardSectionSource, /channelStatus/);
  assert.doesNotMatch(roomCardSectionSource, /Primary room/);
});

test("active pro header no longer shows a back to basic dashboard link", () => {
  assert.doesNotMatch(shellSource, /Back to Basic Dashboard/);
});

test("pro status chip folds the active-until date into the main status label", () => {
  assert.match(renderDashboardSource, /Famlo Pro active till/);
  assert.doesNotMatch(renderDashboardSource, /Active until/);
});

test("pro host profile suppresses the duplicate workspace wrapper header", () => {
  assert.match(shellSource, /activeSection !== "host-profile"/);
  assert.doesNotMatch(shellSource, /eyebrow: "Workspace"/);
  assert.doesNotMatch(shellSource, /status: "Property profile"/);
});

test("pro host profile card keeps the main host profile section and adds documents CTA", () => {
  assert.match(hostProfileCenterSource, /PROPERTY PROFILE/);
  assert.match(hostProfileCenterSource, /Host Profile/);
  assert.match(hostProfileCenterSource, /Manage the host identity, story, gallery, documents, and listing details shown for this property\./);
  assert.match(hostProfileCenterSource, /Edit host profile/);
  assert.match(hostProfileCenterSource, />\s*Documents\s*</);
  assert.match(hostProfileCenterSource, /documentsHref/);
  assert.doesNotMatch(hostProfileCenterSource, /proProfileStatusPill/);
});

test("pro documents view reuses the existing basic dashboard documents component", () => {
  assert.match(shellSource, /const DocumentsTab = dynamic\(\(\) => import\("@\/components\/partners\/tabs\/DocumentsTab"\)\)/);
  assert.match(shellSource, /activeSection === "documents"/);
  assert.match(shellSource, /<DocumentsTab/);
  assert.match(hostDashboardEditorSource, /<DocumentsTab/);
  assert.match(documentsTabSource, /Documents & Verification/);
});

test("documents reuse keeps selected family context and existing auth guard", () => {
  assert.match(hostProfileCenterSource, /documentsHref/);
  assert.match(shellSource, /family=\$\{encodeURIComponent\(familyId\)\}&section=documents/);
  assert.match(documentsTabSource, /new URLSearchParams\(window\.location\.search\)\.get\("family"\)/);
  assert.match(shellSource, /saveFamilyProfileWorkspace\(\{/);
  assert.match(shellSource, /familyId,/);
  assert.match(gstProfileRouteSource, /resolveAuthorizedHostResource/);
});

test("shared support tab reuses the existing ticket table and exposes guide and query actions", () => {
  assert.match(supportTabSource(), /support_tickets/);
  assert.match(supportTabSource(), /Raise New Query/);
  assert.match(supportTabSource(), /Famlo Pro Guide/);
  assert.match(supportTabSource(), /How to use Famlo Pro/);
  assert.match(supportTabSource(), /Search booking, calendar, OTA, payout, property/);
  assert.match(supportTabSource(), /Your query has been sent to Team Famlo\./);
  assert.match(supportTabSource(), /No support queries yet\./);
});

function supportTabSource(): string {
  return fs.readFileSync(path.join(repoRoot, "components/partners/tabs/SupportTab.tsx"), "utf8");
}
