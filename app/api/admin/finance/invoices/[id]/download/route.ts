import { NextRequest, NextResponse } from "next/server";

import { hasValidAdminSession } from "@/lib/admin-auth";
import { generateOrLoadFinancePdf, resolveFinanceDocumentById } from "@/lib/finance/invoices/pdf/document-service";
import { isTaxComplianceGuardError } from "@/lib/finance/tax-compliance-guard";
import { createAdminSupabaseClient } from "@/lib/supabase";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    if (!(await hasValidAdminSession())) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    const supabase = createAdminSupabaseClient();
    const document = await resolveFinanceDocumentById(supabase, id);
    if (!document) {
      return NextResponse.json({ error: "Invoice artifact not found." }, { status: 404 });
    }

    const file = await generateOrLoadFinancePdf(supabase, document, "admin");
    return new NextResponse(new Uint8Array(file.bytes), {
      status: 200,
      headers: {
        "Content-Type": file.mimeType,
        "Content-Disposition": `attachment; filename="${document.fileName}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    if (isTaxComplianceGuardError(error)) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to download finance document." },
      { status: 500 }
    );
  }
}
