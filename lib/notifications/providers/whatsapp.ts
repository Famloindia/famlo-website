import type { NotificationDeliveryResult } from "@/lib/notifications/types";

function normalizeWhatsAppPhone(value: string): string | null {
  const digits = value.replace(/\D/g, "");
  if (digits.length < 10) return null;
  if (digits.length === 10) return `91${digits}`;
  return digits;
}

type WhatsAppButton = {
  id: string;
  title: string;
};

type WhatsAppTemplateButton = {
  index: number;
  payload: string;
};

async function sendWhatsAppPayload(
  input: {
    phone: string;
    templateName?: string | null;
  },
  payload: Record<string, unknown>
): Promise<NotificationDeliveryResult> {
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
  const messageType = typeof payload.type === "string" ? payload.type : "text";

  console.info("[whatsapp-send] phoneNumberId present", Boolean(phoneNumberId));
  console.info("[whatsapp-send] tokenPresent", Boolean(apiKey));
  console.info("[whatsapp-send] to", phone);
  console.info("[whatsapp-send] messageType", messageType);

  if (!apiKey || (!apiUrl && !phoneNumberId)) {
    const mockId = `mock-whatsapp-${Date.now()}`;
    console.info("[whatsapp-send] metaStatus", "mock");
    console.info("[whatsapp-send] metaResponseBody", {
      reason: "missing_api_credentials",
      templateName: input.templateName ?? null,
    });
    console.warn("[notifications.whatsapp] mock_send", {
      phone,
      templateName: input.templateName ?? null,
      type: messageType,
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
      ...payload,
    }),
  });

  const responseText = await response.text().catch(() => "");
  const data = (() => {
    if (!responseText) return null;
    try {
      return JSON.parse(responseText) as { messages?: Array<{ id?: string }>; error?: { message?: string } };
    } catch {
      return null;
    }
  })() as
    | { messages?: Array<{ id?: string }>; error?: { message?: string } }
    | null;

  console.info("[whatsapp-send] metaStatus", response.status);
  console.info("[whatsapp-send] metaResponseBody", data ?? responseText ?? null);

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

export async function sendWhatsAppNotification(input: {
  phone: string;
  message: string;
  templateName?: string | null;
}): Promise<NotificationDeliveryResult> {
  return sendWhatsAppPayload(
    {
      phone: input.phone,
      templateName: input.templateName,
    },
    {
      type: "text",
      text: {
        preview_url: false,
        body: input.message,
      },
    }
  );
}

export async function sendWhatsAppInteractiveButtons(input: {
  phone: string;
  bodyText: string;
  buttons: WhatsAppButton[];
  templateName?: string | null;
}): Promise<NotificationDeliveryResult> {
  const buttons = input.buttons
    .map((button) => ({
      type: "reply",
      reply: {
        id: button.id,
        title: button.title.slice(0, 20),
      },
    }))
    .slice(0, 3);

  if (buttons.length === 0) {
    return {
      status: "skipped",
      errorMessage: "Interactive WhatsApp message is missing buttons.",
    };
  }

  return sendWhatsAppPayload(
    {
      phone: input.phone,
      templateName: input.templateName,
    },
    {
      type: "interactive",
      interactive: {
        type: "button",
        body: {
          text: input.bodyText,
        },
        action: {
          buttons,
        },
      },
    }
  );
}

export async function sendWhatsAppTemplateNotification(input: {
  phone: string;
  templateName: string;
  languageCode?: string | null;
  bodyVariables?: string[];
  quickReplyButtons?: WhatsAppTemplateButton[];
}): Promise<NotificationDeliveryResult> {
  const components: Array<Record<string, unknown>> = [];
  const bodyVariables = (input.bodyVariables ?? []).filter((value) => value.trim().length > 0);
  const quickReplyButtons = (input.quickReplyButtons ?? []).filter((button) => button.payload.trim().length > 0);

  if (bodyVariables.length > 0) {
    components.push({
      type: "body",
      parameters: bodyVariables.map((text) => ({
        type: "text",
        text,
      })),
    });
  }

  for (const button of quickReplyButtons) {
    components.push({
      type: "button",
      sub_type: "quick_reply",
      index: String(button.index),
      parameters: [
        {
          type: "payload",
          payload: button.payload,
        },
      ],
    });
  }

  return sendWhatsAppPayload(
    {
      phone: input.phone,
      templateName: input.templateName,
    },
    {
      type: "template",
      template: {
        name: input.templateName,
        language: {
          code: input.languageCode?.trim() || "en",
        },
        ...(components.length > 0 ? { components } : {}),
      },
    }
  );
}
