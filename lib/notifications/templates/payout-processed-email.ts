export function buildPayoutProcessedEmail(input: {
  settlementId: string;
  amount: number;
}) {
  return {
    subject: `Famlo Payout Processed for Settlement ${input.settlementId}`,
    html: `
      <p>Hi,</p>
      <p>Your payout for settlement <strong>${input.settlementId}</strong> has been processed.</p>
      <p>Payout amount: <strong>INR ${input.amount.toFixed(2)}</strong></p>
      <p>Regards,<br/>Famlo Finance</p>
    `,
  };
}
