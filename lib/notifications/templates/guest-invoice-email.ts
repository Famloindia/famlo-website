import type { GuestTaxInvoiceArtifact } from "@/lib/finance/invoices/guest-tax-invoice-engine";

export function buildGuestInvoiceEmail(input: {
  artifact: GuestTaxInvoiceArtifact;
  downloadUrl?: string | null;
}) {
  return {
    subject: `Famlo GST Invoice ${input.artifact.invoiceNumber}`,
    html: `
      <p>Hi ${input.artifact.guestName},</p>
      <p>Your Famlo accommodation GST invoice is ready for booking <strong>${input.artifact.bookingId}</strong>.</p>
      <p>Total invoice amount: <strong>INR ${input.artifact.totalInvoiceAmount.toFixed(2)}</strong></p>
      ${
        input.downloadUrl
          ? `<p>You can download it here: <a href="${input.downloadUrl}">${input.downloadUrl}</a></p>`
          : `<p>Your invoice PDF is available in Famlo once document delivery is enabled for your environment.</p>`
      }
      <p>Regards,<br/>Famlo Finance</p>
    `,
  };
}
