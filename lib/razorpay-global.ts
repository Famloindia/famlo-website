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
    Cashfree?: (options: { mode: "sandbox" | "production" }) => {
      checkout: (options: {
        paymentSessionId: string;
        redirectTarget?: "_self" | "_blank" | "_top" | "_modal" | HTMLElement;
      }) => Promise<{
        error?: unknown;
        redirect?: boolean;
        paymentDetails?: { paymentMessage?: string };
      }> | void;
    };
  }
}

export {};
