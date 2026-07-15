import { NextRequest, NextResponse } from "next/server";

import { resolveFinanceHostAccess } from "@/lib/finance/host-finance-access";
import { generateOrLoadFinancePdf, resolveFinanceDocumentById } from "@/lib/finance/invoices/pdf/document-service";
import { isTaxComplianceGuardError } from "@/lib/finance/tax-compliance-guard";
import { createAdminSupabaseClient } from "@/lib/supabase";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const supabase = createAdminSupabaseClient();
    const hostAccess = await resolveFinanceHostAccess(supabase, request);
    if (!hostAccess?.hostId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    const document = await resolveFinanceDocumentById(supabase, id);
    if (!document) {
      return NextResponse.json({ error: "Invoice artifact not found." }, { status: 404 });
    }
    const isAllowedHostDocument =
      ((document.kind === "platform_fee_invoice" || document.kind === "credit_note") &&
        document.hostId === hostAccess.hostId) ||
      (document.kind === "host_pro_invoice" &&
        document.hostUserId &&
        hostAccess.hostUserId &&
        document.hostUserId === hostAccess.hostUserId);
    if (!isAllowedHostDocument) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const file = await generateOrLoadFinancePdf(supabase, document, hostAccess.hostId);
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
      { error: error instanceof Error ? error.message : "Failed to download host finance document." },
      { status: 500 }
    );
  }
}
