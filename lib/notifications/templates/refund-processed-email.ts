export function buildRefundProcessedEmail(input: {
  bookingId: string;
  amount: number;
}) {
  return {
    subject: `Famlo Refund Processed for ${input.bookingId}`,
    html: `
      <p>Hi,</p>
      <p>Your refund for booking <strong>${input.bookingId}</strong> has been processed.</p>
      <p>Refund amount: <strong>INR ${input.amount.toFixed(2)}</strong></p>
      <p>Regards,<br/>Famlo Finance</p>
    `,
  };
}
