const DEFAULT_GRAPH_BASE_URL = "https://graph.facebook.com";
const DEFAULT_GRAPH_VERSION = "v22.0";
const DEFAULT_TEMPLATE_LANGUAGE = "en_US";

export const WHATSAPP_TEMPLATE_ENV = {
  verificationCode: {
    name: "WHATSAPP_VERIFICATION_CODE_TEMPLATE_NAME",
    language: "WHATSAPP_VERIFICATION_CODE_TEMPLATE_LANGUAGE",
  },
  setupConfirmation: {
    name: "WHATSAPP_SETUP_CONFIRMATION_TEMPLATE_NAME",
    language: "WHATSAPP_SETUP_CONFIRMATION_TEMPLATE_LANGUAGE",
  },
  bookingApproval: {
    name: "WHATSAPP_HOST_APPROVAL_TEMPLATE_NAME",
    language: "WHATSAPP_HOST_APPROVAL_TEMPLATE_LANGUAGE",
  },
  guestBookingPending: {
    name: "WHATSAPP_GUEST_BOOKING_PENDING_TEMPLATE_NAME",
    language: "WHATSAPP_GUEST_BOOKING_PENDING_TEMPLATE_LANGUAGE",
  },
  guestBookingConfirmed: {
    name: "WHATSAPP_GUEST_BOOKING_CONFIRMED_TEMPLATE_NAME",
    language: "WHATSAPP_GUEST_BOOKING_CONFIRMED_TEMPLATE_LANGUAGE",
  },
  guestBookingDeclined: {
    name: "WHATSAPP_GUEST_BOOKING_DECLINED_TEMPLATE_NAME",
    language: "WHATSAPP_GUEST_BOOKING_DECLINED_TEMPLATE_LANGUAGE",
  },
  guestRefundInitiated: {
    name: "WHATSAPP_GUEST_REFUND_INITIATED_TEMPLATE_NAME",
    language: "WHATSAPP_GUEST_REFUND_INITIATED_TEMPLATE_LANGUAGE",
  },
  guestCheckinReminder: {
    name: "WHATSAPP_GUEST_CHECKIN_REMINDER_TEMPLATE_NAME",
    language: "WHATSAPP_GUEST_CHECKIN_REMINDER_TEMPLATE_LANGUAGE",
  },
  guestCheckoutReminder: {
    name: "WHATSAPP_GUEST_CHECKOUT_REMINDER_TEMPLATE_NAME",
    language: "WHATSAPP_GUEST_CHECKOUT_REMINDER_TEMPLATE_LANGUAGE",
  },
  hostBookingCancelled: {
    name: "WHATSAPP_HOST_BOOKING_CANCELLED_TEMPLATE_NAME",
    language: "WHATSAPP_HOST_BOOKING_CANCELLED_TEMPLATE_LANGUAGE",
  },
  hostPayoutScheduled: {
    name: "WHATSAPP_HOST_PAYOUT_SCHEDULED_TEMPLATE_NAME",
    language: "WHATSAPP_HOST_PAYOUT_SCHEDULED_TEMPLATE_LANGUAGE",
  },
  hostPayoutProcessed: {
    name: "WHATSAPP_HOST_PAYOUT_PROCESSED_TEMPLATE_NAME",
    language: "WHATSAPP_HOST_PAYOUT_PROCESSED_TEMPLATE_LANGUAGE",
  },
  guestMessageReceivedHost: {
    name: "WHATSAPP_GUEST_MESSAGE_RECEIVED_HOST_TEMPLATE_NAME",
    language: "WHATSAPP_GUEST_MESSAGE_RECEIVED_HOST_TEMPLATE_LANGUAGE",
  },
  hostMessageReceivedGuest: {
    name: "WHATSAPP_HOST_MESSAGE_RECEIVED_GUEST_TEMPLATE_NAME",
    language: "WHATSAPP_HOST_MESSAGE_RECEIVED_GUEST_TEMPLATE_LANGUAGE",
  },
  proGraceWarningHost: {
    name: "WHATSAPP_PRO_GRACE_WARNING_HOST_TEMPLATE_NAME",
    language: "WHATSAPP_PRO_GRACE_WARNING_HOST_TEMPLATE_LANGUAGE",
  },
  proExpiredShiftedToFreeHost: {
    name: "WHATSAPP_PRO_EXPIRED_SHIFTED_TO_FREE_HOST_TEMPLATE_NAME",
    language: "WHATSAPP_PRO_EXPIRED_SHIFTED_TO_FREE_HOST_TEMPLATE_LANGUAGE",
  },
} as const;

export type WhatsAppTemplateKind = keyof typeof WHATSAPP_TEMPLATE_ENV;

export type WhatsAppRuntimeConfig = {
  enabled: boolean;
  accessToken: string | null;
  phoneNumberId: string | null;
  businessAccountId: string | null;
  appSecret: string | null;
  webhookVerifyToken: string | null;
  graphBaseUrl: string;
  graphVersion: string;
  templateLanguage: string;
  templates: Record<WhatsAppTemplateKind, string | null>;
  templateLanguages: Record<WhatsAppTemplateKind, string>;
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

function templateName(kind: WhatsAppTemplateKind): string | null {
  const canonical = WHATSAPP_TEMPLATE_ENV[kind].name;
  if (kind === "setupConfirmation") {
    return firstValue(canonical, "WHATSAPP_TEST_TEMPLATE_NAME", "WHATSAPP_TEST_TEMPLATE");
  }
  if (kind === "bookingApproval") {
    return firstValue(canonical, "WHATSAPP_BOOKING_APPROVAL_TEMPLATE");
  }
  if (kind === "guestMessageReceivedHost") {
    return firstValue(canonical, "WHATSAPP_GUEST_MESSAGE_TEMPLATE_NAME", "WHATSAPP_GUEST_MESSAGE_TEMPLATE");
  }
  return value(canonical);
}

function templateLanguage(kind: WhatsAppTemplateKind): string {
  if (kind === "verificationCode") {
    return value(WHATSAPP_TEMPLATE_ENV[kind].language) ?? "";
  }
  return value(WHATSAPP_TEMPLATE_ENV[kind].language) ?? DEFAULT_TEMPLATE_LANGUAGE;
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

  const graphVersion = value("WHATSAPP_GRAPH_API_VERSION") ?? DEFAULT_GRAPH_VERSION;
  if (!/^v\d+\.\d+$/.test(graphVersion)) {
    throw new Error("WHATSAPP_GRAPH_API_VERSION must use a value such as v22.0.");
  }

  const testerPhones = [
    ...new Set(
      (firstValue("WHATSAPP_STAGING_TESTER_ALLOWLIST", "WHATSAPP_STAGING_TESTER_PHONE") ?? "")
        .split(",")
        .map((phone) => normalizeMetaPhone(phone.trim()))
        .filter((phone): phone is string => Boolean(phone))
    ),
  ];
  const templateKinds = Object.keys(WHATSAPP_TEMPLATE_ENV) as WhatsAppTemplateKind[];
  const templates = Object.fromEntries(
    templateKinds.map((kind) => [kind, templateName(kind)])
  ) as Record<WhatsAppTemplateKind, string | null>;
  const templateLanguages = Object.fromEntries(
    templateKinds.map((kind) => [kind, templateLanguage(kind)])
  ) as Record<WhatsAppTemplateKind, string>;

  return {
    enabled: enabled("FAMLO_ENABLE_WHATSAPP_NOTIFICATIONS"),
    accessToken: firstValue("WHATSAPP_API_KEY", "WHATSAPP_ACCESS_TOKEN"),
    phoneNumberId: value("WHATSAPP_PHONE_NUMBER_ID"),
    businessAccountId: value("WHATSAPP_BUSINESS_ACCOUNT_ID"),
    appSecret: value("WHATSAPP_APP_SECRET"),
    webhookVerifyToken: value("WHATSAPP_WEBHOOK_VERIFY_TOKEN"),
    graphBaseUrl: parsedGraphUrl.origin + parsedGraphUrl.pathname.replace(/\/$/, ""),
    graphVersion,
    templateLanguage:
      firstValue("WHATSAPP_HOST_APPROVAL_TEMPLATE_LANGUAGE", "WHATSAPP_TEMPLATE_LANGUAGE") ??
      DEFAULT_TEMPLATE_LANGUAGE,
    templates,
    templateLanguages,
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

export function requireWhatsAppVerificationDeliveryConfig(): WhatsAppRuntimeConfig & {
  accessToken: string;
  phoneNumberId: string;
  templateName: string;
  templateLanguage: string;
} {
  const config = getWhatsAppRuntimeConfig();
  const stagingOverride =
    process.env.APP_ENV?.trim().toLowerCase() === "staging" &&
    config.stagingRealDeliveryAllowed &&
    Boolean(config.stagingTesterPhone);
  if (!config.enabled && !stagingOverride) {
    throw new Error("WhatsApp verification delivery is disabled.");
  }
  if (!config.accessToken) throw new Error("WHATSAPP_API_KEY is not configured.");
  if (!config.phoneNumberId) throw new Error("WHATSAPP_PHONE_NUMBER_ID is not configured.");
  const templateName = config.templates.verificationCode;
  if (!templateName) throw new Error("WhatsApp verification code template is not configured.");
  const templateLanguage = config.templateLanguages.verificationCode;
  if (!templateLanguage) throw new Error("WhatsApp verification code template language is not configured.");
  return {
    ...config,
    accessToken: config.accessToken,
    phoneNumberId: config.phoneNumberId,
    templateName,
    templateLanguage,
  };
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
    ["WHATSAPP_BUSINESS_ACCOUNT_ID", config.businessAccountId],
    ["WHATSAPP_APP_SECRET", config.appSecret],
    ["WHATSAPP_WEBHOOK_VERIFY_TOKEN", config.webhookVerifyToken],
    [WHATSAPP_TEMPLATE_ENV.verificationCode.name, config.templates.verificationCode],
    [
      WHATSAPP_TEMPLATE_ENV.verificationCode.language,
      value(WHATSAPP_TEMPLATE_ENV.verificationCode.language),
    ],
    [WHATSAPP_TEMPLATE_ENV.setupConfirmation.name, config.templates.setupConfirmation],
    [WHATSAPP_TEMPLATE_ENV.setupConfirmation.language, value(WHATSAPP_TEMPLATE_ENV.setupConfirmation.language)],
    [WHATSAPP_TEMPLATE_ENV.bookingApproval.name, config.templates.bookingApproval],
    [WHATSAPP_TEMPLATE_ENV.bookingApproval.language, value(WHATSAPP_TEMPLATE_ENV.bookingApproval.language)],
    [WHATSAPP_TEMPLATE_ENV.guestBookingPending.name, config.templates.guestBookingPending],
    [WHATSAPP_TEMPLATE_ENV.guestBookingPending.language, value(WHATSAPP_TEMPLATE_ENV.guestBookingPending.language)],
    [WHATSAPP_TEMPLATE_ENV.guestBookingConfirmed.name, config.templates.guestBookingConfirmed],
    [WHATSAPP_TEMPLATE_ENV.guestBookingConfirmed.language, value(WHATSAPP_TEMPLATE_ENV.guestBookingConfirmed.language)],
    [WHATSAPP_TEMPLATE_ENV.guestBookingDeclined.name, config.templates.guestBookingDeclined],
    [WHATSAPP_TEMPLATE_ENV.guestBookingDeclined.language, value(WHATSAPP_TEMPLATE_ENV.guestBookingDeclined.language)],
    [WHATSAPP_TEMPLATE_ENV.guestRefundInitiated.name, config.templates.guestRefundInitiated],
    [WHATSAPP_TEMPLATE_ENV.guestRefundInitiated.language, value(WHATSAPP_TEMPLATE_ENV.guestRefundInitiated.language)],
    [WHATSAPP_TEMPLATE_ENV.guestMessageReceivedHost.name, config.templates.guestMessageReceivedHost],
    [WHATSAPP_TEMPLATE_ENV.guestMessageReceivedHost.language, value(WHATSAPP_TEMPLATE_ENV.guestMessageReceivedHost.language)],
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
