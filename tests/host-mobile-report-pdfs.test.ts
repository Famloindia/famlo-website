import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { buildHostMobileReportDownloadHref } from "@/lib/host-mobile-report-pdfs";

const repoRoot = process.cwd();
const source = (file: string): string => readFileSync(path.join(repoRoot, file), "utf8");

test("single-report download href targets exactly one report key with PDF format", () => {
  const href = buildHostMobileReportDownloadHref({
    familyId: "family-123",
    reportKey: "monthly_revenue",
    preset: "month",
  });
  const url = new URL(`http://localhost:3000${href}`);

  assert.equal(url.pathname, "/api/host/mobile/reports/download");
  assert.equal(url.searchParams.get("familyId"), "family-123");
  assert.equal(url.searchParams.get("report"), "monthly_revenue");
  assert.equal(url.searchParams.get("preset"), "month");
  assert.equal(url.searchParams.get("format"), "pdf");
  assert.equal(url.searchParams.getAll("report").length, 1);
});

test("mobile report download route enforces host-safe PDF response contract", () => {
  const route = source("app/api/host/mobile/reports/download/route.ts");

  assert.match(route, /resolveAuthorizedHostResource/);
  assert.match(route, /createAdminSupabaseClient/);
  assert.match(route, /Only PDF format is supported/);
  assert.match(route, /Unknown report key/);
  assert.match(route, /Invalid report preset/);
  assert.match(route, /"Content-Type": file\.mimeType/);
  assert.match(route, /Content-Disposition/);
});

test("dashboard report cards expose only the phase-one PDFs as available", () => {
  const helper = source("lib/host-mobile-pro-dashboard.ts");

  assert.match(helper, /key: "monthly_revenue"[\s\S]*status: "available"[\s\S]*buildHostMobileReportDownloadHref/);
  assert.match(helper, /key: "booking_summary"[\s\S]*status: "available"[\s\S]*buildHostMobileReportDownloadHref/);
  assert.match(helper, /key: "famlo_payout"[\s\S]*status: "available"[\s\S]*buildHostMobileReportDownloadHref/);
  assert.match(helper, /key: "ota_performance"[\s\S]*status: "available"[\s\S]*buildHostMobileReportDownloadHref/);
  assert.match(helper, /key: "cancellation_refund"[\s\S]*status: "coming_soon"/);
  assert.match(helper, /key: "gst_report"[\s\S]*status: gstin \? "coming_soon" : "locked"/);
  assert.match(helper, /key: "custom_report"[\s\S]*status: "coming_soon"/);
});
