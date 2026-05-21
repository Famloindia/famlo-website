import type { CreditNoteArtifact } from "@/lib/finance/invoices/credit-note-engine";
import { renderFinancePdf } from "@/lib/finance/invoices/pdf/renderer";

function formatMoney(value: number): string {
  return `INR ${value.toFixed(2)}`;
}

export async function renderCreditNotePdf(
  artifact: CreditNoteArtifact & { originalInvoiceNumber: string },
  issuer: { legalName: string; gstin: string; address: string }
): Promise<Buffer> {
  return renderFinancePdf({
    title: "Famlo Credit Note",
    subtitle: "Tax reversal document linked to the original Famlo invoice.",
    documentNumber: artifact.creditNoteNumber,
    documentDate: new Date().toISOString().slice(0, 10),
    supplier: {
      title: "Issuer / Famlo",
      lines: [issuer.legalName, `GSTIN: ${issuer.gstin}`, issuer.address],
    },
    recipient: {
      title: "Reference",
      lines: [
        `Original Invoice Type: ${artifact.originalInvoiceType}`,
        `Original Invoice Number: ${artifact.originalInvoiceNumber}`,
        `Booking ID: ${artifact.bookingId}`,
      ],
    },
    bookingMeta: [
      { label: "Reservation ID", value: artifact.reservationId ?? "N/A" },
      { label: "Reason", value: artifact.reason },
      { label: "Policy Case", value: artifact.policyCase },
      { label: "Calculation Version", value: artifact.calculationVersion },
    ],
    lineItems: [
      {
        description: "Taxable reversal",
        quantity: "1",
        taxableAmount: artifact.taxableReversalAmount,
        gstRate: "Varies",
        gstAmount: artifact.gstReversalAmount,
        totalAmount: artifact.totalReversalAmount,
      },
    ],
    totals: [
      { label: "Taxable Reversal", value: formatMoney(artifact.taxableReversalAmount) },
      { label: "GST Reversal", value: formatMoney(artifact.gstReversalAmount) },
      { label: "Total Credit Note Amount", value: formatMoney(artifact.totalReversalAmount) },
    ],
    footerLines: [
      "This credit note is valid only with the referenced original invoice.",
      "No-show cases do not generate credit notes under the current policy.",
    ],
    qrPlaceholder: "Reserved for future digital signature or verification QR.",
  });
}
