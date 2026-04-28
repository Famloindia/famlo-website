// app/api/admin/gst-export/route.ts
import { NextResponse } from "next/server";
import { hasValidAdminSession } from "@/lib/admin-auth";
import { createAdminSupabaseClient } from "@/lib/supabase";
import { logAuditAction } from "@/lib/audit";

export async function POST(request: Request) {
  try {
    if (!(await hasValidAdminSession())) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { startDate, endDate } = await request.json();
    const supabase = createAdminSupabaseClient();

    if (!startDate || !endDate) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Fetch commission data for the selected period
    // Fall back to empty array if no bookings or platform_fees table
    const { data: fees } = await supabase
      .from("platform_fees")
      .select("*")
      .gte("created_at", startDate)
      .lte("created_at", endDate)
      .limit(10); // Limit to 10 for preview

    // Map each fee record to GST-compatible row format
    const preview = (fees ?? []).map((fee: any) => ({
      "Invoice Date": fee.created_at.split("T")[0],
      "HSN Code": "9963", // Typical HSN for accommodation services
      "Taxable Value": fee.amount,
      "CGST (9%)": (fee.amount * 0.09).toFixed(2),
      "SGST (9%)": (fee.amount * 0.09).toFixed(2),
      "IGST (18%)": "0.00", // Simplified, logic for IGST vs CGST/SGST goes here
      "Total": (fee.amount * 1.18).toFixed(2),
    }));

    // Log the GST export action
    await logAuditAction({
      actorId: "system-admin",
      actorRole: "admin",
      actionType: "gst_export_generated",
      resourceType: "compliance",
      newValue: { startDate, endDate, count: preview.length }
    });

    return NextResponse.json({ success: true, preview });
  } catch (err) {
    console.error("GST export generation failed:", err);
    return NextResponse.json({ error: "Action failed" }, { status: 500 });
  }
}
