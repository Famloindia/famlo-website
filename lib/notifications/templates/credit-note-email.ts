export function buildCreditNoteEmail(input: {
  creditNoteNumber: string;
  bookingId: string;
  totalReversalAmount: number;
  downloadUrl?: string | null;
}) {
  return {
    subject: `Famlo Credit Note ${input.creditNoteNumber}`,
    html: `
      <p>Hi,</p>
      <p>A Famlo credit note has been issued for booking <strong>${input.bookingId}</strong>.</p>
      <p>Total reversal amount: <strong>INR ${input.totalReversalAmount.toFixed(2)}</strong></p>
      ${
        input.downloadUrl
          ? `<p>Download credit note: <a href="${input.downloadUrl}">${input.downloadUrl}</a></p>`
          : `<p>The credit note PDF will be available once document delivery is enabled for this environment.</p>`
      }
      <p>Regards,<br/>Famlo Finance</p>
    `,
  };
}
