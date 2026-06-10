import { NextRequest, NextResponse } from "next/server";

import { hasValidAdminSession } from "@/lib/admin-auth";
import { loadCreditNoteReport, CREDIT_NOTE_REPORT_COLUMNS } from "@/lib/finance/reports/credit-note-report";
import { loadGstAccommodationReport, GST_ACCOMMODATION_REPORT_COLUMNS } from "@/lib/finance/reports/gst-accommodation-report";
import { loadPlatformFeeGstReport, PLATFORM_FEE_GST_REPORT_COLUMNS } from "@/lib/finance/reports/platform-fee-gst-report";
import {
  buildCsvResponse,
  buildJsonResponse,
  parseDateRangeFromRequest,
  parseReportFormat,
} from "@/lib/finance/reports/report-exporter";
import { getFinanceSettings } from "@/lib/finance/settings";
import { assertGstExportAllowed, getSafeTaxDisplayState, isTaxComplianceGuardError } from "@/lib/finance/tax-compliance-guard";
import { createAdminSupabaseClient } from "@/lib/supabase";

type GstReportType = "accommodation" | "platform-fee" | "credit-notes";

function parseReportType(request: NextRequest): GstReportType {
  const raw = request.nextUrl.searchParams.get("type");
  switch (raw) {
    case "platform-fee":
    case "credit-notes":
      return raw;
    default:
      return "accommodation";
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    if (!(await hasValidAdminSession())) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const range = parseDateRangeFromRequest(request);
    const format = parseReportFormat(request);
    const reportType = parseReportType(request);
    const supabase = createAdminSupabaseClient();
    const settings = await getFinanceSettings({ scopeType: "GLOBAL", scopeId: null }, supabase);

    try {
      assertGstExportAllowed(settings);
    } catch (error) {
      if (isTaxComplianceGuardError(error)) {
        return NextResponse.json(
          {
            ok: false,
            error: error.message,
            taxDisplay: getSafeTaxDisplayState(settings),
          },
          { status: 403 }
        );
      }
      throw error;
    }

    if (reportType === "platform-fee") {
      const rows = await loadPlatformFeeGstReport(supabase, range);
      if (format === "json") {
        return buildJsonResponse(rows, range, { reportType });
      }
      return buildCsvResponse(rows, PLATFORM_FEE_GST_REPORT_COLUMNS as any, `platform-fee-gst-${range.startDate}-${range.endDate}.csv`);
    }

    if (reportType === "credit-notes") {
      const rows = await loadCreditNoteReport(supabase, range);
      if (format === "json") {
        return buildJsonResponse(rows, range, { reportType });
      }
      return buildCsvResponse(rows, CREDIT_NOTE_REPORT_COLUMNS as any, `gst-credit-notes-${range.startDate}-${range.endDate}.csv`);
    }

    const rows = await loadGstAccommodationReport(supabase, range);
    if (format === "json") {
      return buildJsonResponse(rows, range, { reportType });
    }
    return buildCsvResponse(rows, GST_ACCOMMODATION_REPORT_COLUMNS as any, `gst-accommodation-${range.startDate}-${range.endDate}.csv`);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate GST report." },
      { status: 500 }
    );
  }
}
