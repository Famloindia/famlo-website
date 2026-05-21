import { NextResponse } from "next/server";

import { hasValidAdminSession } from "@/lib/admin-auth";
import { getFinanceSettings } from "@/lib/finance/settings";
import { assertGstExportAllowed, getSafeTaxDisplayState } from "@/lib/finance/tax-compliance-guard";
import { createAdminSupabaseClient } from "@/lib/supabase";

export async function POST(request: Request) {
  try {
    if (!(await hasValidAdminSession())) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as { startDate?: string; endDate?: string };
    const startDate = String(body.startDate ?? "").trim();
    const endDate = String(body.endDate ?? "").trim();
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
          error: error instanceof Error ? error.message : "GST export is disabled.",
          preview: [],
          taxDisplay: getSafeTaxDisplayState(settings),
        },
        { status: 403 }
      );
    }

    return NextResponse.json({
      success: true,
      disabled: false,
      preview: [],
      taxDisplay: getSafeTaxDisplayState(settings),
      message: "GST export remains intentionally empty until a compliant export source is implemented.",
    });
  } catch (err) {
    console.error("GST export generation failed:", err);
    return NextResponse.json({ error: "Action failed" }, { status: 500 });
  }
}
