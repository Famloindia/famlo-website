import { NextRequest, NextResponse } from "next/server";

import { hasValidAdminSession } from "@/lib/admin-auth";
import { loadTdsReport, TDS_REPORT_COLUMNS } from "@/lib/finance/reports/tds-report";
import {
  buildCsvResponse,
  buildJsonResponse,
  parseDateRangeFromRequest,
  parseReportFormat,
} from "@/lib/finance/reports/report-exporter";
import { createAdminSupabaseClient } from "@/lib/supabase";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    if (!(await hasValidAdminSession())) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const range = parseDateRangeFromRequest(request);
    const format = parseReportFormat(request);
    const supabase = createAdminSupabaseClient();
    const rows = await loadTdsReport(supabase, range);

    if (format === "json") {
      return buildJsonResponse(rows, range);
    }

    return buildCsvResponse(rows, TDS_REPORT_COLUMNS as any, `tds-report-${range.startDate}-${range.endDate}.csv`);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate TDS report." },
      { status: 500 }
    );
  }
}
