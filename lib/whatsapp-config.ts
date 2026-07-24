const DEFAULT_GRAPH_BASE_URL = "https://graph.facebook.com";
const DEFAULT_GRAPH_VERSION = "v22.0";
const DEFAULT_TEMPLATE_LANGUAGE = "en_US";

export type WhatsAppTemplateKind = "bookingApproval" | "test" | "guestMessage";

export type WhatsAppRuntimeConfig = {
  enabled: boolean;
  accessToken: string | null;
  phoneNumberId: string | null;
  appSecret: string | null;
  webhookVerifyToken: string | null;
  graphBaseUrl: string;
  graphVersion: string;
  templateLanguage: string;
  templates: Record<WhatsAppTemplateKind, string | null>;
  siteUrl: string | null;
  cronSecret: string | null;
  stagingTesterPhone: string | null;
  stagingRealDeliveryAllowed: boolean;
};

function value(name: string): string | null {
  const resolved = process.env[name]?.trim();
  return resolved ? resolved : null;
}

function firstValue(...names: string[]): string | null {
  for (const name of names) {
    const resolved = value(name);
    if (resolved) return resolved;
  }
  return null;
}

function enabled(name: string): boolean {
  return value(name)?.toLowerCase() === "true";
}

function firstEnabled(...names: string[]): boolean {
  const configuredName = names.find((name) => value(name) !== null);
  return configuredName ? enabled(configuredName) : false;
}

export function normalizeMetaPhone(valueToNormalize: string | null | undefined): string | null {
  if (!valueToNormalize) return null;
  const digits = valueToNormalize.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15 || digits.startsWith("0")) return null;
  return digits.length === 10 ? `91${digits}` : digits;
}

export function getWhatsAppRuntimeConfig(): WhatsAppRuntimeConfig {
  const graphBaseUrl = value("WHATSAPP_GRAPH_BASE_URL") ?? DEFAULT_GRAPH_BASE_URL;
  let parsedGraphUrl: URL;
  try {
    parsedGraphUrl = new URL(graphBaseUrl);
  } catch {
    throw new Error("WHATSAPP_GRAPH_BASE_URL must be a valid HTTPS URL.");
  }
  if (parsedGraphUrl.protocol !== "https:") {
    throw new Error("WHATSAPP_GRAPH_BASE_URL must use HTTPS.");
  }

  const testerPhones = [
    ...new Set(
      (firstValue("WHATSAPP_STAGING_TESTER_ALLOWLIST", "WHATSAPP_STAGING_TESTER_PHONE") ?? "")
        .split(",")
        .map((phone) => normalizeMetaPhone(phone.trim()))
        .filter((phone): phone is string => Boolean(phone))
    ),
  ];

  return {
    enabled: enabled("FAMLO_ENABLE_WHATSAPP_NOTIFICATIONS"),
    accessToken: firstValue("WHATSAPP_API_KEY", "WHATSAPP_ACCESS_TOKEN"),
    phoneNumberId: value("WHATSAPP_PHONE_NUMBER_ID"),
    appSecret: value("WHATSAPP_APP_SECRET"),
    webhookVerifyToken: value("WHATSAPP_WEBHOOK_VERIFY_TOKEN"),
    graphBaseUrl: parsedGraphUrl.origin + parsedGraphUrl.pathname.replace(/\/$/, ""),
    graphVersion: value("WHATSAPP_GRAPH_API_VERSION") ?? DEFAULT_GRAPH_VERSION,
    templateLanguage:
      firstValue("WHATSAPP_HOST_APPROVAL_TEMPLATE_LANGUAGE", "WHATSAPP_TEMPLATE_LANGUAGE") ??
      DEFAULT_TEMPLATE_LANGUAGE,
    templates: {
      bookingApproval: firstValue(
        "WHATSAPP_HOST_APPROVAL_TEMPLATE_NAME",
        "WHATSAPP_BOOKING_APPROVAL_TEMPLATE"
      ),
      test: firstValue("WHATSAPP_TEST_TEMPLATE_NAME", "WHATSAPP_TEST_TEMPLATE"),
      guestMessage: firstValue(
        "WHATSAPP_GUEST_MESSAGE_TEMPLATE_NAME",
        "WHATSAPP_GUEST_MESSAGE_TEMPLATE"
      ),
    },
    siteUrl: value("NEXT_PUBLIC_SITE_URL"),
    cronSecret: value("CRON_SECRET"),
    stagingTesterPhone: testerPhones.length === 1 ? testerPhones[0] : null,
    stagingRealDeliveryAllowed: firstEnabled(
      "WHATSAPP_ALLOW_STAGING_DELIVERY",
      "FAMLO_ALLOW_STAGING_WHATSAPP_DELIVERY"
    ),
  };
}

export function requireWhatsAppDeliveryConfig(kind: WhatsAppTemplateKind): WhatsAppRuntimeConfig & {
  accessToken: string;
  phoneNumberId: string;
  templateName: string;
} {
  const config = getWhatsAppRuntimeConfig();
  if (!config.enabled) throw new Error("WhatsApp notifications are disabled.");
  if (!config.accessToken) throw new Error("WHATSAPP_API_KEY is not configured.");
  if (!config.phoneNumberId) throw new Error("WHATSAPP_PHONE_NUMBER_ID is not configured.");
  const templateName = config.templates[kind];
  if (!templateName) throw new Error(`WhatsApp ${kind} template is not configured.`);
  return { ...config, accessToken: config.accessToken, phoneNumberId: config.phoneNumberId, templateName };
}

export function getBookingTemplateParameterOrder(): string[] {
  const configured = value("WHATSAPP_BOOKING_APPROVAL_PARAMETER_ORDER");
  return (configured ??
    "property_name,booking_reference,check_in,check_out,nights,days,guest_count,booking_amount,decision_deadline")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

export function validateWhatsAppEnvironment(): {
  ready: boolean;
  missing: string[];
  stagingTesterRestricted: boolean;
} {
  const config = getWhatsAppRuntimeConfig();
  const required: Array<[string, string | null]> = [
    ["WHATSAPP_API_KEY", config.accessToken],
    ["WHATSAPP_PHONE_NUMBER_ID", config.phoneNumberId],
    ["WHATSAPP_APP_SECRET", config.appSecret],
    ["WHATSAPP_WEBHOOK_VERIFY_TOKEN", config.webhookVerifyToken],
    ["WHATSAPP_HOST_APPROVAL_TEMPLATE_NAME", config.templates.bookingApproval],
    ["WHATSAPP_TEST_TEMPLATE_NAME", config.templates.test],
    ["WHATSAPP_GUEST_MESSAGE_TEMPLATE_NAME", config.templates.guestMessage],
    ["WHATSAPP_HOST_APPROVAL_TEMPLATE_LANGUAGE", config.templateLanguage],
    ["NEXT_PUBLIC_SITE_URL", config.siteUrl],
    ["CRON_SECRET", config.cronSecret],
  ];
  const missing = required.filter(([, configured]) => !configured).map(([name]) => name);
  const stagingTesterRestricted =
    process.env.APP_ENV?.trim().toLowerCase() !== "staging" ||
    (config.stagingRealDeliveryAllowed && Boolean(config.stagingTesterPhone));
  if (!stagingTesterRestricted) {
    if (!config.stagingTesterPhone) missing.push("WHATSAPP_STAGING_TESTER_ALLOWLIST");
    if (!config.stagingRealDeliveryAllowed) missing.push("WHATSAPP_ALLOW_STAGING_DELIVERY");
  }
  return { ready: config.enabled && missing.length === 0, missing: [...new Set(missing)], stagingTesterRestricted };
}
