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
  const providerName =
    providerKey === "booking"
      ? "Booking.com"
      : providerKey === "mmt"
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
    capabilityStatus: "api_available",
    createChannelApiAvailable: true,
    testConnectionApiAvailable: true,
    workspaceRequired: false,
    summary: `${providerName} now has Famlo-owned provider operation primitives for create/connect/test/refresh/activate/deactivate over the Channex-backed framework.`,
    missingPrimitive: null,
    nextAction: "Run the provider operation API, verify mappings, keep dry-run enabled until operator review, then activate.",
    notes: [
      "The create primitive creates a Famlo-owned Channex setup session and ledger entry instead of sending operators away without state.",
      "The test and refresh primitives inspect real Channex channel state and write diagnostics, jobs, and an operation ledger.",
      "Activation remains guarded by connection, mapping, and dry-run safety checks.",
    ],
  };
}
