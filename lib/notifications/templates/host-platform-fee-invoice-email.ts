import type { PlatformFeeInvoiceArtifact } from "@/lib/finance/invoices/platform-fee-invoice-engine";

export function buildHostPlatformFeeInvoiceEmail(input: {
  artifact: PlatformFeeInvoiceArtifact;
  downloadUrl?: string | null;
}) {
  return {
    subject: `Famlo Platform Service Fee Invoice ${input.artifact.invoiceNumber}`,
    html: `
      <p>Hi ${input.artifact.hostLegalName},</p>
      <p>Your platform service fee invoice for booking <strong>${input.artifact.bookingId}</strong> is ready.</p>
      <p>Total invoice amount: <strong>INR ${input.artifact.totalAmount.toFixed(2)}</strong></p>
      ${
        input.downloadUrl
          ? `<p>Download invoice: <a href="${input.downloadUrl}">${input.downloadUrl}</a></p>`
          : `<p>The invoice PDF will be available once document delivery is enabled for this environment.</p>`
      }
      <p>Regards,<br/>Famlo Finance</p>
    `,
  };
}
