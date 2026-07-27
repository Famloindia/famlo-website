export type HostWhatsAppTestSettings = {
  verified: boolean;
  enabled: boolean;
  optedIn: boolean;
  testMessageAvailable: boolean;
};

export function canSendHostWhatsAppTestMessage(
  settings: HostWhatsAppTestSettings
): boolean {
  return (
    settings.testMessageAvailable &&
    settings.verified &&
    settings.enabled &&
    settings.optedIn
  );
}

export async function queueHostWhatsAppTestMessage(
  fetcher: typeof fetch = fetch
): Promise<string> {
  const response = await fetcher("/api/host/whatsapp-settings/test", {
    method: "POST",
  });
  const payload = (await response.json()) as {
    message?: string;
    error?: string;
    status?: string;
  };
  if (!response.ok) {
    throw new Error(
      payload.message ?? payload.error ?? "Unable to send a test message."
    );
  }
  return payload.status === "queued"
    ? "Test message queued."
    : payload.message ?? "Test message queued.";
}

export function createSingleFlightGuard(): {
  isActive: () => boolean;
  run: <T>(action: () => Promise<T>) => Promise<
    { started: false } | { started: true; value: T }
  >;
} {
  let active = false;
  return {
    isActive: () => active,
    async run<T>(action: () => Promise<T>) {
      if (active) return { started: false };
      active = true;
      try {
        return { started: true, value: await action() };
      } finally {
        active = false;
      }
    },
  };
}
