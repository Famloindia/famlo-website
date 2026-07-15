import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { buildHostMobileLoginUrl } from "@/lib/site-url";
import {
  resolveHostMobileLegacyDashboardHref,
} from "@/lib/host-mobile-session";

const repoRoot = process.cwd();
const sessionRoutePath = path.join(repoRoot, "app/api/host/mobile/session/route.ts");
const hostEntryPagePath = path.join(repoRoot, "app/app/host/page.tsx");
const hostLoginPagePath = path.join(repoRoot, "app/app/host/login/page.tsx");
const partnerLoginRoutePath = path.join(repoRoot, "app/api/partners/login/route.ts");

const sessionRouteSource = fs.readFileSync(sessionRoutePath, "utf8");
const hostEntryPageSource = fs.readFileSync(hostEntryPagePath, "utf8");
const hostLoginPageSource = fs.readFileSync(hostLoginPagePath, "utf8");
const partnerLoginRouteSource = fs.readFileSync(partnerLoginRoutePath, "utf8");

function withEnv<T>(nextEnv: Record<string, string | undefined>, fn: () => T): T {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(nextEnv)) {
    previous.set(key, process.env[key]);
    if (typeof value === "undefined") delete process.env[key];
    else process.env[key] = value;
  }

  try {
    return fn();
  } finally {
    for (const [key, value] of previous.entries()) {
      if (typeof value === "undefined") delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("free host routes land on the free dashboard path", () => {
  assert.equal(
    resolveHostMobileLegacyDashboardHref({
      familyId: "fam-free",
      proAllowed: false,
      routeKey: "free",
    }),
    "/partnerslogin/home/dashboard?family=fam-free&tab=dashboard&appShell=1"
  );
});

test("active Pro host routes land on the Pro dashboard path", () => {
  assert.equal(
    resolveHostMobileLegacyDashboardHref({
      familyId: "fam-pro",
      proAllowed: true,
      routeKey: "pro",
    }),
    "/partnerslogin/home/pro/dashboard?family=fam-pro&section=dashboard&appShell=1"
  );
});

test("expired Pro host follows the existing renewal fallback behavior", () => {
  assert.equal(
    resolveHostMobileLegacyDashboardHref({
      familyId: "fam-expired",
      proAllowed: false,
      routeKey: "pro",
    }),
    "/partnerslogin/home/dashboard?family=fam-expired&tab=famlo-plus&appShell=1"
  );
});

test("grace Pro host follows the renewal fallback behavior on mobile", () => {
  assert.equal(
    resolveHostMobileLegacyDashboardHref({
      familyId: "fam-grace",
      proAllowed: false,
      routeKey: "pro",
    }),
    "/partnerslogin/home/dashboard?family=fam-grace&tab=famlo-plus&appShell=1"
  );
});

test("staging build uses the staging host app URL", () => {
  const url = withEnv(
    {
      NEXT_PUBLIC_SITE_URL: "https://staging.famlo.in",
    },
    () => buildHostMobileLoginUrl()
  );

  assert.equal(url, "https://staging.famlo.in/app/host/login");
});

test("production build uses the production host app URL", () => {
  const url = withEnv(
    {
      NEXT_PUBLIC_SITE_URL: "https://www.famlo.in",
    },
    () => buildHostMobileLoginUrl()
  );

  assert.equal(url, "https://www.famlo.in/app/host/login");
});

test("mobile host session route and entry pages use the shared resolver", () => {
  assert.match(sessionRouteSource, /resolveHostMobileSession/);
  assert.match(hostEntryPageSource, /redirect\(session\.defaultRoute\)/);
  assert.match(hostLoginPageSource, /redirect\(session\.defaultRoute\)/);
});

test("mobile session resolver falls back when older staging schemas lack property_name", () => {
  const source = fs.readFileSync(path.join(repoRoot, "lib/host-mobile-session.ts"), "utf8");

  assert.match(source, /isSchemaCompatibilityError/);
  assert.match(source, /select\("id,name,property_name"\)/);
  assert.match(source, /select\("id,name"\)/);
  assert.match(source, /defaultWorkspace/);
  assert.match(source, /proActionsAllowed/);
});

test("partner login keeps Pro access reads on the admin client after auth fallback", () => {
  assert.match(partnerLoginRouteSource, /createEphemeralPublicSupabaseClient/);
  assert.match(partnerLoginRouteSource, /authSupabase\.auth\.signInWithPassword/);
  assert.doesNotMatch(partnerLoginRouteSource, /supabase\.auth\.signInWithPassword/);
});
