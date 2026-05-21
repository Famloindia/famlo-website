import { NextResponse } from "next/server";

import { hasValidAdminSession } from "@/lib/admin-auth";
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

    return NextResponse.json(
      {
        success: false,
        disabled: true,
        error: "GST export download remains disabled until a compliant export source is implemented.",
        taxDisplay: getSafeTaxDisplayState(settings),
      },
      { status: 409 }
    );
  } catch (err) {
    console.error("GST export download failed:", err);
    return NextResponse.json({ error: "Action failed" }, { status: 500 });
  }
}
