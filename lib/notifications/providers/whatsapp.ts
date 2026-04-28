import type { NotificationDeliveryResult } from "@/lib/notifications/types";

function normalizeWhatsAppPhone(value: string): string | null {
  const digits = value.replace(/\D/g, "");
  if (digits.length < 10) return null;
  if (digits.length === 10) return `91${digits}`;
  return digits;
}

export async function sendWhatsAppNotification(input: {
  phone: string;
  message: string;
  templateName?: string | null;
}): Promise<NotificationDeliveryResult> {
  const enabled = String(process.env.FAMLO_ENABLE_WHATSAPP_NOTIFICATIONS ?? "").trim().toLowerCase() === "true";
  if (!enabled) {
    return {
      status: "skipped",
      errorMessage: "WhatsApp notifications are disabled.",
    };
  }

  const phone = normalizeWhatsAppPhone(input.phone);
  if (!phone) {
    return {
      status: "skipped",
      errorMessage: "Recipient phone number is missing or invalid.",
    };
  }

  const apiKey = process.env.WHATSAPP_API_KEY?.trim();
  const apiUrl = process.env.WHATSAPP_API_URL?.trim();
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();

  if (!apiKey || (!apiUrl && !phoneNumberId)) {
    const mockId = `mock-whatsapp-${Date.now()}`;
    console.warn("[notifications.whatsapp] mock_send", {
      phone,
      templateName: input.templateName ?? null,
      preview: input.message.slice(0, 120),
    });
    return {
      status: "processed",
      providerMessageId: mockId,
    };
  }

  const endpoint = apiUrl ?? `https://graph.facebook.com/v22.0/${phoneNumberId}/messages`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: phone,
      type: "text",
      text: {
        preview_url: false,
        body: input.message,
      },
    }),
  });

  const data = (await response.json().catch(() => null)) as
    | { messages?: Array<{ id?: string }>; error?: { message?: string } }
    | null;

  if (!response.ok) {
    return {
      status: "failed",
      errorMessage: data?.error?.message ?? `WhatsApp API request failed with status ${response.status}.`,
    };
  }

  return {
    status: "processed",
    providerMessageId: data?.messages?.[0]?.id ?? null,
  };
}
