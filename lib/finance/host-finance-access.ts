import type { SupabaseClient } from "@supabase/supabase-js";

import { resolveAuthorizedHostSession } from "@/lib/chat-access";
import { asString } from "@/lib/platform-utils";

export type FinanceHostAccess = {
  hostId: string;
  hostUserId: string | null;
  familyId: string | null;
  displayName: string | null;
};

export async function resolveFinanceHostAccess(
  supabase: SupabaseClient,
  request?: Request
): Promise<FinanceHostAccess | null> {
  const session = await resolveAuthorizedHostSession(supabase, request);
  if (!session) return null;

  let hostQuery = supabase.from("hosts").select("id,user_id,legacy_family_id,display_name");
  if (session.hostUserId) {
    hostQuery = hostQuery.eq("user_id", session.hostUserId);
  } else if (session.familyId) {
    hostQuery = hostQuery.eq("legacy_family_id", session.familyId);
  } else {
    return null;
  }

  const { data: host, error } = await hostQuery.maybeSingle();
  if (error || !host?.id) return null;

  return {
    hostId: host.id,
    hostUserId: asString(host.user_id),
    familyId: asString(host.legacy_family_id),
    displayName: asString(host.display_name),
  };
}
