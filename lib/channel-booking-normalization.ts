import { resolveProviderFromRevision } from "@/lib/channel-providers/provider-capabilities";

export type NormalizedOtaSourceChannel =
  | "BOOKING_COM"
  | "AIRBNB"
  | "AGODA"
  | "MMT"
  | "EXPEDIA"
  | "CHANNEX"
  | "UNKNOWN_OTA";

export type OtaPaymentCollectMode = "FAMLO_COLLECT" | "OTA_COLLECT" | "PROPERTY_COLLECT" | "UNKNOWN";

function normalizeToken(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

export function resolveNormalizedOtaSourceChannel(input: {
  otaProviderCode?: string | null;
  otaName?: string | null;
  source?: string | null;
}): NormalizedOtaSourceChannel {
  const providerKey = resolveProviderFromRevision({
    otaProviderCode: input.otaProviderCode,
    otaName: input.otaName,
  });

  switch (providerKey) {
    case "booking":
      return "BOOKING_COM";
    case "airbnb":
      return "AIRBNB";
    case "agoda":
      return "AGODA";
    case "mmt":
      return "MMT";
    case "expedia":
      return "EXPEDIA";
    default: {
      const source = normalizeToken(input.source);
      if (source.includes("booking")) return "BOOKING_COM";
      if (source.includes("airbnb")) return "AIRBNB";
      if (source.includes("agoda")) return "AGODA";
      if (source.includes("mmt") || source.includes("makemytrip") || source.includes("goibibo")) return "MMT";
      if (source.includes("expedia")) return "EXPEDIA";
      if (source.includes("channex")) return "CHANNEX";
      return "UNKNOWN_OTA";
    }
  }
}

export function resolveOtaPaymentCollectMode(value: string | null | undefined): OtaPaymentCollectMode {
  const normalized = normalizeToken(value);
  if (!normalized) return "UNKNOWN";

  if (
    normalized.includes("ota") ||
    normalized.includes("online") ||
    normalized.includes("channel") ||
    normalized.includes("prepaid")
  ) {
    return "OTA_COLLECT";
  }

  if (
    normalized.includes("hotel") ||
    normalized.includes("property") ||
    normalized.includes("host") ||
    normalized.includes("cash") ||
    normalized.includes("pay_at_hotel")
  ) {
    return "PROPERTY_COLLECT";
  }

  if (
    normalized.includes("famlo") ||
    normalized.includes("platform") ||
    normalized.includes("direct")
  ) {
    return "FAMLO_COLLECT";
  }

  return "UNKNOWN";
}

export function isExternalOtaGuestIdentityMode(value: unknown): boolean {
  return normalizeToken(typeof value === "string" ? value : null) === "external_ota_guest";
}
