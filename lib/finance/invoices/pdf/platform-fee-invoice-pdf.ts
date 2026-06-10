import type { PlatformFeeInvoiceArtifact } from "@/lib/finance/invoices/platform-fee-invoice-engine";
import { renderFinancePdf } from "@/lib/finance/invoices/pdf/renderer";

function formatMoney(value: number): string {
  return `INR ${value.toFixed(2)}`;
}

export async function renderPlatformFeeInvoicePdf(
  artifact: PlatformFeeInvoiceArtifact,
  issuer: { legalName: string; gstin: string; address: string }
): Promise<Buffer> {
  return renderFinancePdf({
    title: "Famlo Platform Service Fee Invoice",
    subtitle: "Service invoice issued by Famlo to host.",
    documentNumber: artifact.invoiceNumber,
    documentDate: new Date().toISOString().slice(0, 10),
    supplier: {
      title: "Supplier / Famlo",
      lines: [
        issuer.legalName,
        `GSTIN: ${issuer.gstin}`,
        issuer.address,
      ],
    },
    recipient: {
      title: "Recipient / Host",
      lines: [
        artifact.hostLegalName,
        artifact.hostGstin ? `GSTIN: ${artifact.hostGstin}` : "GSTIN: Not provided",
        `Host ID: ${artifact.hostId}`,
      ],
    },
    bookingMeta: [
      { label: "Booking ID", value: artifact.bookingId },
      { label: "Reservation ID", value: artifact.reservationId ?? "N/A" },
      { label: "Calculation Version", value: artifact.calculationVersion },
    ],
    lineItems: [
      {
        description: artifact.serviceDescription,
        quantity: "1",
        taxableAmount: artifact.taxableValue,
        gstRate: "18.00%",
        gstAmount: artifact.gstAmount,
        totalAmount: artifact.totalAmount,
      },
    ],
    totals: [
      { label: "Taxable Value", value: formatMoney(artifact.taxableValue) },
      { label: "GST @18%", value: formatMoney(artifact.gstAmount) },
      { label: "Total Invoice Amount", value: formatMoney(artifact.totalAmount) },
    ],
    footerLines: [
      "Platform Service Fee is billed independently from accommodation GST.",
      "Gateway fees remain Famlo expense and are not deducted before platform GST calculation.",
    ],
    qrPlaceholder: "Reserved for future digital signature or verification QR.",
  });
}
