import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { resolveHostDashboardHref } from "@/lib/host-pro-access";

const repoRoot = process.cwd();
const loginRoutePath = path.join(repoRoot, "app/api/partners/login/route.ts");
const sessionRoutePath = path.join(repoRoot, "app/api/app/session/route.ts");
const dashboardPagePath = path.join(repoRoot, "app/partnerslogin/home/dashboard/page.tsx");
const renderDashboardPath = path.join(repoRoot, "app/partnerslogin/home/pro/dashboard/render-dashboard.tsx");
const proNewPropertyPagePath = path.join(repoRoot, "app/partnerslogin/home/pro/properties/new/page.tsx");

const loginRouteSource = fs.readFileSync(loginRoutePath, "utf8");
const sessionRouteSource = fs.readFileSync(sessionRoutePath, "utf8");
const dashboardPageSource = fs.readFileSync(dashboardPagePath, "utf8");
const renderDashboardSource = fs.readFileSync(renderDashboardPath, "utf8");
const proNewPropertyPageSource = fs.readFileSync(proNewPropertyPagePath, "utf8");

test("active paid Pro hosts resolve to the Famlo Pro dashboard", () => {
  assert.equal(
    resolveHostDashboardHref({
      familyId: "fam-active",
      proDashboardEnabled: true,
      proAccess: { allowed: true },
      proSection: "properties-home",
    }),
    "/partnerslogin/home/pro/dashboard?family=fam-active&section=properties-home"
  );
});

test("grace Pro hosts resolve to the basic dashboard route", () => {
  assert.equal(
    resolveHostDashboardHref({
      familyId: "fam-grace",
      proDashboardEnabled: true,
      proAccess: { allowed: false },
      basicTab: "dashboard",
      proSection: "properties-home",
    }),
    "/partnerslogin/home/dashboard?family=fam-grace&tab=dashboard"
  );
});

test("expired-after-grace hosts stay on the basic dashboard route", () => {
  assert.equal(
    resolveHostDashboardHref({
      familyId: "fam-expired",
      proDashboardEnabled: true,
      proAccess: { allowed: false },
      basicTab: "dashboard",
      proSection: "properties-home",
    }),
    "/partnerslogin/home/dashboard?family=fam-expired&tab=dashboard"
  );
});

test("partner login, app session, and dashboard entry all use the shared pro redirect path", () => {
  assert.match(loginRouteSource, /resolveHostDashboardHref/);
  assert.match(sessionRouteSource, /resolveHostDashboardHref/);
  assert.match(dashboardPageSource, /redirect\(/);
  assert.match(dashboardPageSource, /proDashboardEnabled && currentFamilyProAccess\?\.allowed/);
});

test("expired or disabled pro access redirects out of the pro dashboard renderer", () => {
  assert.match(renderDashboardSource, /if \(!famloProEnabled \|\| !access\.allowed\) \{\s*redirect\(basicDashboardUrl\);/);
});

test("new Pro property page only allows creation during an active paid Pro period", () => {
  assert.match(proNewPropertyPageSource, /access\?\.allowed && access\.status === "active"/);
  assert.match(proNewPropertyPageSource, /blocked during grace/);
});
