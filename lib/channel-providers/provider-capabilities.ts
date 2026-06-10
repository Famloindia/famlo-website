import type { ChannelProviderKey } from "@/lib/channel-providers/provider-registry";

export type ChannelProviderMode = "self_serve" | "assisted_beta" | "feed_only" | "disabled";

export type ChannelProviderCapabilities = {
  providerKey: ChannelProviderKey;
  displayStatus: string;
  mode: ChannelProviderMode;
  channexChannelCode: string | null;
  supportsChannexIframe: boolean;
  supportsStructureVerification: boolean;
  supportsAriSync: boolean;
  supportsSelectedPropertySyncTest: boolean;
  supportsBookingIngest: boolean;
  supportsModificationIngest: boolean;
  supportsCancellationIngest: boolean;
  supportsGoLiveReadiness: boolean;
  supportsAutoActivation: boolean;
};

export function resolveChannelStorageProviderCode(providerKey: ChannelProviderKey): string {
  return providerKey === "booking" ? "channex" : providerKey;
}

const PROVIDER_CAPABILITIES: Record<ChannelProviderKey, ChannelProviderCapabilities> = {
  booking: {
    providerKey: "booking",
    displayStatus: "Self-serve / live",
    mode: "self_serve",
    channexChannelCode: "BDC",
    supportsChannexIframe: true,
    supportsStructureVerification: true,
    supportsAriSync: true,
    supportsSelectedPropertySyncTest: true,
    supportsBookingIngest: true,
    supportsModificationIngest: true,
    supportsCancellationIngest: true,
    supportsGoLiveReadiness: true,
    supportsAutoActivation: true,
  },
  mmt: {
    providerKey: "mmt",
    displayStatus: "Assisted / verification required",
    mode: "assisted_beta",
    channexChannelCode: null,
    supportsChannexIframe: true,
    supportsStructureVerification: true,
    supportsAriSync: true,
    supportsSelectedPropertySyncTest: true,
    supportsBookingIngest: true,
    supportsModificationIngest: true,
    supportsCancellationIngest: true,
    supportsGoLiveReadiness: true,
    supportsAutoActivation: false,
  },
  airbnb: {
    providerKey: "airbnb",
    displayStatus: "Authorization required",
    mode: "assisted_beta",
    channexChannelCode: "ABB",
    supportsChannexIframe: true,
    supportsStructureVerification: true,
    supportsAriSync: true,
    supportsSelectedPropertySyncTest: true,
    supportsBookingIngest: true,
    supportsModificationIngest: true,
    supportsCancellationIngest: true,
    supportsGoLiveReadiness: true,
    supportsAutoActivation: false,
  },
  agoda: {
    providerKey: "agoda",
    displayStatus: "Assisted / verification required",
    mode: "assisted_beta",
    channexChannelCode: "AGO",
    supportsChannexIframe: true,
    supportsStructureVerification: true,
    supportsAriSync: true,
    supportsSelectedPropertySyncTest: true,
    supportsBookingIngest: true,
    supportsModificationIngest: true,
    supportsCancellationIngest: true,
    supportsGoLiveReadiness: true,
    supportsAutoActivation: false,
  },
  expedia: {
    providerKey: "expedia",
    displayStatus: "Assisted / verification required",
    mode: "assisted_beta",
    channexChannelCode: "EXP",
    supportsChannexIframe: true,
    supportsStructureVerification: true,
    supportsAriSync: true,
    supportsSelectedPropertySyncTest: true,
    supportsBookingIngest: true,
    supportsModificationIngest: true,
    supportsCancellationIngest: true,
    supportsGoLiveReadiness: true,
    supportsAutoActivation: false,
  },
  "google-hotel": {
    providerKey: "google-hotel",
    displayStatus: "Feed-driven / not self-serve",
    mode: "feed_only",
    channexChannelCode: "GHA",
    supportsChannexIframe: false,
    supportsStructureVerification: true,
    supportsAriSync: true,
    supportsSelectedPropertySyncTest: false,
    supportsBookingIngest: false,
    supportsModificationIngest: false,
    supportsCancellationIngest: false,
    supportsGoLiveReadiness: true,
    supportsAutoActivation: false,
  },
};

function normalizeValue(value: string | null | undefined): string {
  return String(value ?? "").trim();
}

function normalizeLower(value: string | null | undefined): string {
  return normalizeValue(value).toLowerCase();
}

export function getChannelProviderCapabilities(providerKey: ChannelProviderKey): ChannelProviderCapabilities {
  return PROVIDER_CAPABILITIES[providerKey];
}

export function resolveProviderFromChannexUniqueId(uniqueId: string | null | undefined): ChannelProviderKey | null {
  const normalized = normalizeValue(uniqueId).toUpperCase();
  if (normalized.length < 3) return null;
  const prefix = normalized.slice(0, 3);

  if (prefix === "BDC") return "booking";
  if (prefix === "ABB") return "airbnb";
  if (prefix === "AGO") return "agoda";
  if (prefix === "EXP") return "expedia";
  if (prefix === "GHA") return "google-hotel";
  return null;
}

export function resolveProviderFromOtaName(value: string | null | undefined): ChannelProviderKey | null {
  const normalized = normalizeLower(value);
  if (!normalized) return null;

  if (/airbnb/.test(normalized)) return "airbnb";
  if (/agoda|ycs/.test(normalized)) return "agoda";
  if (/expedia/.test(normalized)) return "expedia";
  if (/google/.test(normalized)) return "google-hotel";
  if (/make.?my.?trip|goibibo|\bmmt\b/.test(normalized)) return "mmt";
  if (/booking/.test(normalized)) return "booking";
  return null;
}

export function resolveProviderFromRevision(input: {
  otaProviderCode?: string | null;
  otaName?: string | null;
}): ChannelProviderKey | null {
  const direct = resolveProviderFromOtaName(input.otaProviderCode);
  if (direct) return direct;
  return resolveProviderFromOtaName(input.otaName);
}
