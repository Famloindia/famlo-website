import type { ChannelProviderOperationType } from "@/lib/channel-provider-framework";

const HOST_ALLOWED_OPERATION_TYPES = new Set<ChannelProviderOperationType>([
  "create_provider",
  "connect_provider",
  "verify_mappings",
  "request_review",
]);

export function resolveProviderOperationPolicy(input: {
  actorRole: "admin" | "host";
  operationType: ChannelProviderOperationType;
  requestedDryRun: boolean | null;
}): {
  allowed: boolean;
  status: 200 | 403;
  error: string | null;
  effectiveDryRun: boolean;
} {
  const requestedDryRun = input.requestedDryRun ?? true;
  if (input.actorRole === "admin") {
    return {
      allowed: true,
      status: 200,
      error: null,
      effectiveDryRun: requestedDryRun,
    };
  }

  if (input.operationType === "activate_provider") {
    return {
      allowed: false,
      status: 403,
      error: "Operator access is required to activate a provider.",
      effectiveDryRun: true,
    };
  }

  if (input.operationType === "deactivate_provider") {
    return {
      allowed: false,
      status: 403,
      error: "Operator access is required to deactivate a provider.",
      effectiveDryRun: true,
    };
  }

  if (requestedDryRun === false) {
    return {
      allowed: false,
      status: 403,
      error: "Host-scoped provider operations must stay in dry-run mode.",
      effectiveDryRun: true,
    };
  }

  if (!HOST_ALLOWED_OPERATION_TYPES.has(input.operationType)) {
    return {
      allowed: false,
      status: 403,
      error: "This provider operation requires operator access.",
      effectiveDryRun: true,
    };
  }

  return {
    allowed: true,
    status: 200,
    error: null,
    effectiveDryRun: true,
  };
}
