// app/api/admin/gst-export/download/route.ts
import { NextResponse } from "next/server";
import { hasValidAdminSession } from "@/lib/admin-auth";
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

    // Fetch full dataset for the CSV
    const { data: fees } = await supabase
      .from("platform_fees")
      .select("*")
      .gte("created_at", startDate)
      .lte("created_at", endDate);

    // Create CSV content
    const headers = ["Invoice Date", "HSN Code", "Taxable Value", "CGST (9%)", "SGST (9%)", "IGST (18%)", "Total"];
    const rows = (fees ?? []).map((fee: any) => [
      fee.created_at.split("T")[0],
      "9963",
      fee.amount,
      (fee.amount * 0.09).toFixed(2),
      (fee.amount * 0.09).toFixed(2),
      "0.00",
      (fee.amount * 1.18).toFixed(2),
    ]);

    const csvContent = [headers, ...rows].map((r) => r.join(",")).join("\n");

    return new Response(csvContent, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="famlo-gst-${startDate}-${endDate}.csv"`,
      },
    });
  } catch (err) {
    console.error("GST export download failed:", err);
    return NextResponse.json({ error: "Action failed" }, { status: 500 });
  }
}
