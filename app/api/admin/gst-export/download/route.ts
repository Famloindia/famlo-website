import { NextResponse } from "next/server";

import { hasValidAdminSession } from "@/lib/admin-auth";
import { loadCreditNoteReport } from "@/lib/finance/reports/credit-note-report";
import { loadGstAccommodationReport } from "@/lib/finance/reports/gst-accommodation-report";
import { loadPlatformFeeGstReport } from "@/lib/finance/reports/platform-fee-gst-report";
import { buildCombinedGstExportRows, COMBINED_GST_EXPORT_COLUMNS } from "@/lib/finance/reports/gst-export-bundle";
import { buildCsvResponse, parseDateRange } from "@/lib/finance/reports/report-exporter";
import { getFinanceSettings } from "@/lib/finance/settings";
import { assertGstExportAllowed, getSafeTaxDisplayState } from "@/lib/finance/tax-compliance-guard";
import { createAdminSupabaseClient } from "@/lib/supabase";

export async function GET(request: Request) {
  try {
    if (!(await hasValidAdminSession())) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get("start");
    const endDate = searchParams.get("end");

    if (!startDate || !endDate) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }
    const range = parseDateRange(startDate, endDate);

    const supabase = createAdminSupabaseClient();
    const settings = await getFinanceSettings({ scopeType: "GLOBAL", scopeId: null }, supabase);

    try {
      assertGstExportAllowed(settings);
    } catch (error) {
      return NextResponse.json(
        {
          success: false,
          disabled: true,
          error: error instanceof Error ? error.message : "GST export download is disabled.",
          taxDisplay: getSafeTaxDisplayState(settings),
        },
        { status: 403 }
      );
    }

    const [accommodation, platformFee, creditNotes] = await Promise.all([
      loadGstAccommodationReport(supabase, range),
      loadPlatformFeeGstReport(supabase, range),
      loadCreditNoteReport(supabase, range),
    ]);

    const rows = buildCombinedGstExportRows({
      accommodation,
      platformFee,
      creditNotes,
    });

    return buildCsvResponse(
      rows,
      COMBINED_GST_EXPORT_COLUMNS as any,
      `gst-export-${range.startDate}-${range.endDate}.csv`
    );
  } catch (err) {
    console.error("GST export download failed:", err);
    return NextResponse.json({ error: "Action failed" }, { status: 500 });
  }
}
