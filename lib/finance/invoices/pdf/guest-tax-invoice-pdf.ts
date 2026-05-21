import type { GuestTaxInvoiceArtifact } from "@/lib/finance/invoices/guest-tax-invoice-engine";
import { renderFinancePdf } from "@/lib/finance/invoices/pdf/renderer";

function formatMoney(value: number): string {
  return `INR ${value.toFixed(2)}`;
}

export async function renderGuestTaxInvoicePdf(
  artifact: GuestTaxInvoiceArtifact
): Promise<Buffer> {
  return renderFinancePdf({
    title: "Famlo Guest Tax Invoice",
    subtitle: "Accommodation GST invoice issued under Section 9(5).",
    documentNumber: artifact.invoiceNumber,
    documentDate: artifact.invoiceDate,
    supplier: {
      title: "Supplier / Issuer",
      lines: [
        artifact.famloLegalEntityName,
        `GSTIN: ${artifact.famloGstin}`,
        artifact.famloAddress,
        "SAC: 9963",
      ],
    },
    recipient: {
      title: "Recipient / Guest",
      lines: [
        artifact.guestName,
        artifact.guestGstin ? `GSTIN: ${artifact.guestGstin}` : "GSTIN: Not provided",
        `Property: ${artifact.propertyName}`,
        artifact.propertyAddress,
      ],
    },
    bookingMeta: [
      { label: "Booking ID", value: artifact.bookingId },
      { label: "Reservation ID", value: artifact.reservationId ?? "N/A" },
      { label: "Check-in", value: artifact.checkIn ?? "N/A" },
      { label: "Check-out", value: artifact.checkOut ?? "N/A" },
      { label: "Place of Supply", value: artifact.placeOfSupply },
    ],
    lineItems: artifact.lineItems.map((line) => ({
      description: line.description,
      quantity: "1",
      taxableAmount: line.roomBaseAmount,
      gstRate: `${(line.gstRateBps / 100).toFixed(2)}%`,
      gstAmount: line.gstAmount,
      totalAmount: line.totalAmount,
    })),
    totals: [
      { label: "Room Base Amount", value: formatMoney(artifact.roomBaseAmount) },
      { label: "Accommodation GST", value: formatMoney(artifact.gstAmount) },
      { label: "Total Invoice Amount", value: formatMoney(artifact.totalInvoiceAmount) },
    ],
    footerLines: [
      "This document is generated from Famlo finance records and should be reviewed with your booking confirmation.",
      "QR / digital signature integration is not enabled yet; placeholder shown below.",
    ],
    qrPlaceholder: "Reserved for future digital signature or verification QR.",
  });
}
