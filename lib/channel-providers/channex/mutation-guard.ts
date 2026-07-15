import { NextResponse } from "next/server";

import { getChannexMutationGuardSummary } from "@/lib/channel-providers/channex/client";
import { createAdminSupabaseClient } from "@/lib/supabase";

type MutationGuardInput = {
  supabase: ReturnType<typeof createAdminSupabaseClient>;
  familyId: string;
  action: string;
  route: string;
};

async function logBlockedProductionMutation(input: MutationGuardInput & { environment: "staging" | "production" }): Promise<void> {
  const { error } = await input.supabase.from("channel_sync_logs").insert({
    family_id: input.familyId,
    provider_code: "channex",
    action: "blocked_production_mutation",
    status: "failed",
    message: "Blocked Channex production mutation. Set FAMLO_CHANNEX_ALLOW_PRODUCTION_MUTATIONS=true to allow production mutations explicitly.",
    payload: {
      environment: input.environment,
      attempted_action: input.action,
      route: input.route,
      checked_by: "channex_mutation_guard",
    },
  } as never);

  if (error) {
    const message = String(error.message ?? "");
    if (!/relation|does not exist|schema cache/i.test(message)) {
      console.error("[channex.mutation-guard] log failed:", error);
    }
  }
}

export async function ensureChannexMutationAllowed(input: MutationGuardInput): Promise<NextResponse | null> {
  const summary = getChannexMutationGuardSummary();

  if (!summary.blockedProductionMutation) {
    return null;
  }

  await logBlockedProductionMutation({
    ...input,
    environment: summary.environment,
  });

  return NextResponse.json(
    {
      ok: false,
      status: "blocked_production_mutation",
      environment: summary.environment,
      message: "Blocked Channex production mutation. Set FAMLO_CHANNEX_ALLOW_PRODUCTION_MUTATIONS=true to allow production mutations explicitly.",
    },
    { status: 403 }
  );
}
