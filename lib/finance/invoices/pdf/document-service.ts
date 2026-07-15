import type { SupabaseClient } from "@supabase/supabase-js";

import { isInvoicePdfGenerationEnabled } from "@/lib/finance/feature-flags";
import type { CreditNoteArtifact } from "@/lib/finance/invoices/credit-note-engine";
import type { GuestTaxInvoiceArtifact } from "@/lib/finance/invoices/guest-tax-invoice-engine";
import {
  loadStoredFinancePdf,
  persistFinancePdfFile,
  type FinanceDocumentArtifactType,
} from "@/lib/finance/invoices/pdf/pdf-storage";
import { renderCreditNotePdf } from "@/lib/finance/invoices/pdf/credit-note-pdf";
import { renderGuestTaxInvoicePdf } from "@/lib/finance/invoices/pdf/guest-tax-invoice-pdf";
import { renderHostProTaxInvoicePdf } from "@/lib/finance/invoices/pdf/host-pro-tax-invoice-pdf";
import { renderPlatformFeeInvoicePdf } from "@/lib/finance/invoices/pdf/platform-fee-invoice-pdf";
import type { PlatformFeeInvoiceArtifact } from "@/lib/finance/invoices/platform-fee-invoice-engine";
import type { HostProInvoicePayload } from "@/lib/pro-billing/invoice";
import { getFinanceSettings } from "@/lib/finance/settings";
import {
  assertGstInvoiceAllowed,
  assertTaxArtifactAllowed,
} from "@/lib/finance/tax-compliance-guard";

type JsonRecord = Record<string, unknown>;

export type ResolvedFinanceDocument =
  | {
      kind: "guest_tax_invoice";
      artifactId: string;
      fileName: string;
      payload: GuestTaxInvoiceArtifact;
      bookingId: string;
      guestId: string | null;
      hostId: string | null;
    }
  | {
      kind: "platform_fee_invoice";
      artifactId: string;
      fileName: string;
      payload: PlatformFeeInvoiceArtifact;
      bookingId: string;
      hostId: string | null;
    }
  | {
      kind: "credit_note";
      artifactId: string;
      fileName: string;
      payload: CreditNoteArtifact & { originalInvoiceNumber: string };
      bookingId: string;
      hostId: string | null;
      hostUserId?: string | null;
    }
  | {
      kind: "host_pro_invoice";
      artifactId: string;
      fileName: string;
      payload: HostProInvoicePayload;
      bookingId: string;
      hostId: string | null;
      hostUserId: string | null;
    };

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function requireIssuerEnv(): { legalName: string; gstin: string; address: string } {
  const legalName = process.env.FAMLO_LEGAL_ENTITY_NAME?.trim();
  const gstin = process.env.FAMLO_GSTIN?.trim();
  const address = process.env.FAMLO_LEGAL_ADDRESS?.trim();
  if (!legalName || !gstin || !address) {
    throw new Error("Famlo issuer profile is incomplete for PDF generation.");
  }
  return { legalName, gstin, address };
}

async function resolveHostIdForBooking(supabase: SupabaseClient, bookingId: string): Promise<string | null> {
  const { data } = await supabase.from("bookings_v2").select("host_id").eq("id", bookingId).maybeSingle();
  return asString((data as JsonRecord | null)?.host_id);
}

export async function resolveFinanceDocumentById(
  supabase: SupabaseClient,
  invoiceId: string
): Promise<ResolvedFinanceDocument | null> {
  const guestRes = await supabase
    .from("guest_tax_invoices")
    .select("id,booking_id,guest_id,status,payload")
    .eq("id", invoiceId)
    .maybeSingle();
  if (guestRes.data?.id) {
    const payload = guestRes.data.payload as GuestTaxInvoiceArtifact;
    return {
      kind: "guest_tax_invoice",
      artifactId: String(guestRes.data.id),
      fileName: `${payload.invoiceNumber}.pdf`,
      payload,
      bookingId: String(guestRes.data.booking_id),
      guestId: asString(guestRes.data.guest_id),
      hostId: await resolveHostIdForBooking(supabase, String(guestRes.data.booking_id)),
    };
  }

  const platformRes = await supabase
    .from("platform_fee_invoices")
    .select("id,booking_id,host_id,status,payload")
    .eq("id", invoiceId)
    .maybeSingle();
  if (platformRes.data?.id) {
    const payload = platformRes.data.payload as PlatformFeeInvoiceArtifact;
    return {
      kind: "platform_fee_invoice",
      artifactId: String(platformRes.data.id),
      fileName: `${payload.invoiceNumber}.pdf`,
      payload,
      bookingId: String(platformRes.data.booking_id),
      hostId: asString(platformRes.data.host_id),
    };
  }

  const creditNoteRes = await supabase
    .from("credit_notes")
    .select("id,booking_id,original_invoice_id,original_invoice_type,status,payload")
    .eq("id", invoiceId)
    .maybeSingle();
  if (creditNoteRes.data?.id) {
    const payload = (creditNoteRes.data.payload as CreditNoteArtifact | null) ?? ({} as CreditNoteArtifact);
    const originalInvoiceNumber = payload.originalInvoiceType === "platform_fee_invoice"
      ? asString(
          (
            await supabase
              .from("platform_fee_invoices")
              .select("invoice_number")
              .eq("id", creditNoteRes.data.original_invoice_id)
              .maybeSingle()
          ).data?.invoice_number
        )
      : asString(
          (
            await supabase
              .from("guest_tax_invoices")
              .select("invoice_number")
              .eq("id", creditNoteRes.data.original_invoice_id)
              .maybeSingle()
          ).data?.invoice_number
        );

    return {
      kind: "credit_note",
      artifactId: String(creditNoteRes.data.id),
      fileName: `${payload.creditNoteNumber ?? `credit-note-${creditNoteRes.data.id}`}.pdf`,
      payload: {
        ...payload,
        originalInvoiceNumber: originalInvoiceNumber ?? "UNKNOWN",
      },
      bookingId: String(creditNoteRes.data.booking_id),
      hostId: await resolveHostIdForBooking(supabase, String(creditNoteRes.data.booking_id)),
    };
  }

  const hostProRes = await supabase
    .from("host_pro_invoices")
    .select("id,host_user_id,payload,invoice_number")
    .eq("id", invoiceId)
    .maybeSingle();
  if (hostProRes.data?.id) {
    const payload = hostProRes.data.payload as HostProInvoicePayload;
    return {
      kind: "host_pro_invoice",
      artifactId: String(hostProRes.data.id),
      fileName: `${payload.invoiceNumber ?? hostProRes.data.invoice_number ?? `famlo-pro-invoice-${hostProRes.data.id}`}.pdf`,
      payload,
      bookingId: String(hostProRes.data.id),
      hostId: null,
      hostUserId: asString(hostProRes.data.host_user_id),
    };
  }

  return null;
}

export async function generateOrLoadFinancePdf(
  supabase: SupabaseClient,
  document: ResolvedFinanceDocument,
  generatedBy?: string | null
): Promise<{ bytes: Buffer; mimeType: string; metadataId: string | null }> {
  const settings = await getFinanceSettings({}, supabase);
  if (!isInvoicePdfGenerationEnabled() && document.kind !== "host_pro_invoice") {
    throw new Error("Invoice PDF generation is disabled by feature flag.");
  }
  if (document.kind === "credit_note" && document.payload.status !== "issued") {
    throw new Error("PDF generation is only allowed for issued credit notes.");
  }
  if (
    (document.kind === "guest_tax_invoice" || document.kind === "platform_fee_invoice") &&
    document.payload.invoiceStatus !== "issued"
  ) {
    throw new Error("PDF generation is only allowed for issued invoice artifacts.");
  }

  if (document.kind === "guest_tax_invoice") {
    assertGstInvoiceAllowed(settings);
  } else if (document.kind === "platform_fee_invoice") {
    assertTaxArtifactAllowed(settings, "CREATE_TAX_INVOICE");
  } else if (document.kind === "credit_note") {
    assertTaxArtifactAllowed(settings, "CREATE_CREDIT_NOTE");
  }

  const existing = await loadStoredFinancePdf(supabase, document.kind, document.artifactId);
  if (existing) {
    return {
      bytes: existing.bytes,
      mimeType: existing.metadata.mime_type,
      metadataId: existing.metadata.id,
    };
  }

  const issuer = requireIssuerEnv();
  const bytes =
    document.kind === "guest_tax_invoice"
      ? await renderGuestTaxInvoicePdf(document.payload)
      : document.kind === "platform_fee_invoice"
        ? await renderPlatformFeeInvoicePdf(document.payload, issuer)
        : document.kind === "host_pro_invoice"
          ? await renderHostProTaxInvoicePdf(document.payload)
        : await renderCreditNotePdf(document.payload, issuer);

  const metadata = await persistFinancePdfFile(supabase, {
    artifactType: document.kind as FinanceDocumentArtifactType,
    artifactId: document.artifactId,
    fileName: document.fileName,
    bytes,
    generatedBy,
  });

  return {
    bytes,
    mimeType: metadata.mime_type,
    metadataId: metadata.id,
  };
}
