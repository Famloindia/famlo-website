import type { NotificationDeliveryResult } from "@/lib/notifications/types";
import {
  getWhatsAppRuntimeConfig,
  normalizeMetaPhone,
  requireWhatsAppDeliveryConfig,
  type WhatsAppTemplateKind,
} from "@/lib/whatsapp-config";

const REQUEST_TIMEOUT_MS = 15_000;

type WhatsAppButton = {
  id: string;
  title: string;
};

type WhatsAppTemplateButton = {
  index: number;
  payload?: string;
  urlSuffix?: string;
  type?: "quick_reply" | "url";
};

type MetaErrorPayload = {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    error_data?: { details?: string };
    fbtrace_id?: string;
  };
  messages?: Array<{ id?: string }>;
};

export class WhatsAppProviderError extends Error {
  readonly code: string | null;
  readonly subcode: string | null;
  readonly category: string;
  readonly retryable: boolean;
  readonly httpStatus: number | null;

  constructor(input: {
    message: string;
    code?: string | null;
    subcode?: string | null;
    category: string;
    retryable: boolean;
    httpStatus?: number | null;
  }) {
    super(input.message);
    this.name = "WhatsAppProviderError";
    this.code = input.code ?? null;
    this.subcode = input.subcode ?? null;
    this.category = input.category;
    this.retryable = input.retryable;
    this.httpStatus = input.httpStatus ?? null;
  }
}

function isRetryableMetaError(status: number, code: number | null): boolean {
  return status === 408 || status === 429 || status >= 500 || [1, 2, 4, 17, 32, 613].includes(code ?? -1);
}

function sanitizeProviderMessage(message: string | null | undefined): string {
  return (message ?? "WhatsApp provider request failed.")
    .replace(/EA[A-Za-z0-9]+/g, "[redacted token]")
    .replace(/\+?\d[\d\s-]{7,}\d/g, "[redacted phone]")
    .slice(0, 500);
}

function resultFromError(error: unknown): NotificationDeliveryResult {
  if (error instanceof WhatsAppProviderError) {
    return {
      status: "failed",
      errorMessage: sanitizeProviderMessage(error.message),
      errorCode: error.code,
      errorCategory: error.category,
      retryable: error.retryable,
    };
  }
  if (
    error instanceof Error &&
    (error.message.includes("not configured") || error.message.includes("notifications are disabled"))
  ) {
    return {
      status: "failed",
      errorMessage: sanitizeProviderMessage(error.message),
      errorCode: "provider_not_configured",
      errorCategory: "configuration",
      retryable: false,
    };
  }
  const abort = error instanceof Error && error.name === "AbortError";
  return {
    status: "failed",
    errorMessage: abort ? "WhatsApp provider request timed out." : "WhatsApp provider network request failed.",
    errorCode: abort ? "request_timeout" : "network_error",
    errorCategory: "network",
    retryable: true,
  };
}

function validateRecipientForEnvironment(phone: string): void {
  const appEnv = process.env.APP_ENV?.trim().toLowerCase();
  if (appEnv !== "staging") return;
  const config = getWhatsAppRuntimeConfig();
  if (!config.stagingRealDeliveryAllowed || !config.stagingTesterPhone) {
    throw new WhatsAppProviderError({
      message: "Real WhatsApp delivery is not authorized for staging.",
      code: "staging_delivery_blocked",
      category: "configuration",
      retryable: false,
    });
  }
  if (phone !== config.stagingTesterPhone) {
    throw new WhatsAppProviderError({
      message: "Staging WhatsApp delivery is restricted to the approved tester.",
      code: "staging_recipient_blocked",
      category: "recipient",
      retryable: false,
    });
  }
}

async function sendWhatsAppPayload(
  input: {
    phone: string;
    templateKind: WhatsAppTemplateKind;
    templateName?: string | null;
  },
  payload: Record<string, unknown>
): Promise<NotificationDeliveryResult> {
  const phone = normalizeMetaPhone(input.phone);
  if (!phone) {
    return {
      status: "failed",
      errorMessage: "Recipient phone number is missing or invalid.",
      errorCode: "invalid_recipient",
      errorCategory: "recipient",
      retryable: false,
    };
  }

  try {
    const config = requireWhatsAppDeliveryConfig(input.templateKind);
    validateRecipientForEnvironment(phone);
    const endpoint =
      `${config.graphBaseUrl}/${encodeURIComponent(config.graphVersion)}` +
      `/${encodeURIComponent(config.phoneNumberId)}/messages`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: phone,
          ...payload,
        }),
        signal: controller.signal,
        cache: "no-store",
      });
    } finally {
      clearTimeout(timeout);
    }

    const responseText = await response.text().catch(() => "");
    let data: MetaErrorPayload | null = null;
    if (responseText) {
      try {
        data = JSON.parse(responseText) as MetaErrorPayload;
      } catch {
        data = null;
      }
    }
    if (!response.ok) {
      const code = data?.error?.code ?? null;
      throw new WhatsAppProviderError({
        message: sanitizeProviderMessage(data?.error?.message ?? `Meta API returned HTTP ${response.status}.`),
        code: code === null ? `http_${response.status}` : String(code),
        subcode: data?.error?.error_subcode === undefined ? null : String(data.error.error_subcode),
        category: data?.error?.type ?? "provider",
        retryable: isRetryableMetaError(response.status, code),
        httpStatus: response.status,
      });
    }

    const providerMessageId = data?.messages?.[0]?.id?.trim();
    if (!providerMessageId) {
      throw new WhatsAppProviderError({
        message: "Meta accepted the request without returning a message ID.",
        code: "missing_message_id",
        category: "provider_response",
        retryable: true,
        httpStatus: response.status,
      });
    }
    return {
      status: "processed",
      providerMessageId,
      providerStatus: "submitted",
      retryable: false,
    };
  } catch (error) {
    return resultFromError(error);
  }
}

export async function sendWhatsAppNotification(input: {
  phone: string;
  message: string;
  templateName?: string | null;
}): Promise<NotificationDeliveryResult> {
  return sendWhatsAppPayload(
    { phone: input.phone, templateKind: "test", templateName: input.templateName },
    { type: "text", text: { preview_url: false, body: input.message } }
  );
}

export async function sendWhatsAppInteractiveButtons(input: {
  phone: string;
  bodyText: string;
  buttons: WhatsAppButton[];
  templateName?: string | null;
}): Promise<NotificationDeliveryResult> {
  const buttons = input.buttons
    .filter((button) => button.id.trim() && button.title.trim())
    .slice(0, 3)
    .map((button) => ({
      type: "reply",
      reply: { id: button.id, title: button.title.slice(0, 20) },
    }));
  if (!buttons.length) {
    return {
      status: "failed",
      errorMessage: "Interactive WhatsApp message is missing buttons.",
      errorCode: "missing_buttons",
      errorCategory: "payload",
      retryable: false,
    };
  }
  return sendWhatsAppPayload(
    { phone: input.phone, templateKind: "bookingApproval", templateName: input.templateName },
    {
      type: "interactive",
      interactive: { type: "button", body: { text: input.bodyText }, action: { buttons } },
    }
  );
}

export async function sendWhatsAppTemplateNotification(input: {
  phone: string;
  templateKind: WhatsAppTemplateKind;
  templateName: string;
  languageCode?: string | null;
  bodyVariables?: string[];
  buttons?: WhatsAppTemplateButton[];
}): Promise<NotificationDeliveryResult> {
  const components: Array<Record<string, unknown>> = [];
  const bodyVariables = (input.bodyVariables ?? []).map((value) => value.trim());
  if (bodyVariables.length) {
    components.push({
      type: "body",
      parameters: bodyVariables.map((text) => ({ type: "text", text })),
    });
  }
  for (const button of input.buttons ?? []) {
    const type = button.type ?? "quick_reply";
    const value = type === "url" ? button.urlSuffix : button.payload;
    if (!value?.trim()) continue;
    components.push({
      type: "button",
      sub_type: type,
      index: String(button.index),
      parameters: [
        type === "url"
          ? { type: "text", text: value.trim() }
          : { type: "payload", payload: value.trim() },
      ],
    });
  }
  return sendWhatsAppPayload(
    { phone: input.phone, templateKind: input.templateKind, templateName: input.templateName },
    {
      type: "template",
      template: {
        name: input.templateName,
        language: { code: input.languageCode?.trim() || getWhatsAppRuntimeConfig().templateLanguage },
        ...(components.length ? { components } : {}),
      },
    }
  );
}
