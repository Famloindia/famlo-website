import { NextRequest, NextResponse } from "next/server";

import { resolveAuthorizedHostResource } from "@/lib/host-access";
import {
  generateHostMobileReportPdf,
  HostMobileReportError,
  type HostMobileReportKey,
  type HostMobileReportPreset,
} from "@/lib/host-mobile-report-pdfs";
import { createAdminSupabaseClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const REPORT_KEYS = new Set<HostMobileReportKey>([
  "monthly_revenue",
  "booking_summary",
  "famlo_payout",
  "ota_performance",
  "cancellation_refund",
  "gst_report",
  "custom_report",
]);

const REPORT_PRESETS = new Set<HostMobileReportPreset>(["today", "week", "month", "year", "custom"]);

function logDuration(label: string, startedAt: number, status: number, familyId: string, report: string): void {
  if (process.env.NODE_ENV === "production") return;
  console.info(`${label} ${status} ${Date.now() - startedAt}ms familyId=${familyId} report=${report}`);
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isReportKey(value: string): value is HostMobileReportKey {
  return REPORT_KEYS.has(value as HostMobileReportKey);
}

function isReportPreset(value: string): value is HostMobileReportPreset {
  return REPORT_PRESETS.has(value as HostMobileReportPreset);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const startedAt = Date.now();
  try {
    const familyId = asString(request.nextUrl.searchParams.get("familyId"));
    const report = asString(request.nextUrl.searchParams.get("report"));
    const preset = asString(request.nextUrl.searchParams.get("preset")) || "month";
    const format = asString(request.nextUrl.searchParams.get("format")) || "pdf";
    const from = asString(request.nextUrl.searchParams.get("from")) || null;
    const to = asString(request.nextUrl.searchParams.get("to")) || null;

    if (!familyId) {
      const response = NextResponse.json({ error: "familyId is required." }, { status: 400 });
      logDuration("[host.mobile.reports.download]", startedAt, 400, "", report);
      return response;
    }
    if (!report) {
      const response = NextResponse.json({ error: "report is required." }, { status: 400 });
      logDuration("[host.mobile.reports.download]", startedAt, 400, familyId, "");
      return response;
    }
    if (!isReportKey(report)) {
      const response = NextResponse.json({ error: "Unknown report key." }, { status: 400 });
      logDuration("[host.mobile.reports.download]", startedAt, 400, familyId, report);
      return response;
    }
    if (!isReportPreset(preset)) {
      const response = NextResponse.json({ error: "Invalid report preset." }, { status: 400 });
      logDuration("[host.mobile.reports.download]", startedAt, 400, familyId, report);
      return response;
    }
    if (format.toLowerCase() !== "pdf") {
      const response = NextResponse.json({ error: "Only PDF format is supported." }, { status: 400 });
      logDuration("[host.mobile.reports.download]", startedAt, 400, familyId, report);
      return response;
    }

    const supabase = createAdminSupabaseClient();
    const hostAccess = await resolveAuthorizedHostResource(supabase, request, { familyId });
    if (!hostAccess?.familyId || hostAccess.familyId !== familyId) {
      const response = NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      logDuration("[host.mobile.reports.download]", startedAt, 401, familyId, report);
      return response;
    }

    const file = await generateHostMobileReportPdf(supabase, {
      familyId,
      hostId: hostAccess.hostId,
      hostUserId: hostAccess.hostUserId,
      reportKey: report,
      preset,
      from,
      to,
    });

    const response = new NextResponse(new Uint8Array(file.bytes), {
      status: 200,
      headers: {
        "Content-Type": file.mimeType,
        "Content-Disposition": `attachment; filename="${file.fileName}"`,
        "Cache-Control": "private, no-store",
      },
    });
    logDuration("[host.mobile.reports.download]", startedAt, 200, familyId, report);
    return response;
  } catch (error) {
    if (error instanceof HostMobileReportError) {
      const response = NextResponse.json({ error: error.message }, { status: error.status });
      logDuration("[host.mobile.reports.download]", startedAt, error.status, "unknown", "report_error");
      return response;
    }
    const response = NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate host mobile report PDF." },
      { status: 500 }
    );
    logDuration("[host.mobile.reports.download]", startedAt, 500, "unknown", "unknown");
    return response;
  }
}
