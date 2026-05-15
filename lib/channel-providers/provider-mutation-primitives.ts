import type { ChannelProviderKey } from "@/lib/channel-providers/provider-registry";

export type ProviderMutationPrimitiveAudit = {
  providerKey: ChannelProviderKey;
  capabilityStatus: "workspace_only" | "api_available" | "unavailable";
  createChannelApiAvailable: boolean;
  testConnectionApiAvailable: boolean;
  workspaceRequired: boolean;
  summary: string;
  missingPrimitive: string | null;
  nextAction: string;
  notes: string[];
};

export function getProviderMutationPrimitiveAudit(providerKey: ChannelProviderKey): ProviderMutationPrimitiveAudit {
  if (providerKey === "booking") {
    return {
      providerKey,
      capabilityStatus: "workspace_only",
      createChannelApiAvailable: false,
      testConnectionApiAvailable: false,
      workspaceRequired: true,
      summary: "Booking.com still relies on the real Channex workspace for provider-side channel create and connection test in this repo.",
      missingPrimitive: "Direct Booking.com provider-channel create/test mutation helper is not implemented as a server-side API primitive in this codebase.",
      nextAction: "Use the real Channex workspace, then refresh, verify, map, and continue with operator-only sync tools.",
      notes: [
        "Famlo already has stronger assisted execution for Booking.com after the channel exists.",
        "The missing primitive is specifically direct provider-channel mutation, not mapping or sync review.",
      ],
    };
  }

  const providerName =
    providerKey === "mmt"
      ? "MakeMyTrip / Goibibo"
      : providerKey === "airbnb"
        ? "Airbnb"
        : providerKey === "agoda"
          ? "Agoda"
          : providerKey === "expedia"
            ? "Expedia"
            : "Google Hotel";

  return {
    providerKey,
    capabilityStatus: "workspace_only",
    createChannelApiAvailable: false,
    testConnectionApiAvailable: false,
    workspaceRequired: true,
    summary: `${providerName} currently uses the real Channex workspace for channel creation and connection testing.`,
    missingPrimitive: `Direct server-side ${providerName} provider-channel create/test mutation helper is not implemented in this repo.`,
    nextAction: "Open the real Channex setup, complete provider create/test there, then return to Famlo for refresh, mapping, and structure verification.",
    notes: [
      "Famlo can read back attached channel state and mapped structure safely.",
      "Famlo must not fake create/test success without a real server-side mutation primitive.",
    ],
  };
}
