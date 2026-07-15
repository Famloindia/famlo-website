declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => {
      open: () => void;
      on?: (
        event: "payment.failed",
        handler: (response: {
          error?: {
            description?: string;
            reason?: string;
          };
        }) => void
      ) => void;
    };
  }
}

export {};
