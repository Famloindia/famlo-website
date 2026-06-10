export function buildPayoutFailedEmail(input: {
  settlementId: string;
  amount: number;
  failureReason?: string | null;
}) {
  return {
    subject: `Famlo Payout Update for Settlement ${input.settlementId}`,
    html: `
      <p>Hi,</p>
      <p>The payout for settlement <strong>${input.settlementId}</strong> could not be completed.</p>
      <p>Amount: <strong>INR ${input.amount.toFixed(2)}</strong></p>
      <p>${input.failureReason ? `Reason: ${input.failureReason}` : "Famlo ops will review the payout and follow up."}</p>
      <p>Regards,<br/>Famlo Finance</p>
    `,
  };
}
