import type { SupabaseClient } from "@supabase/supabase-js";

import { resolveVerifiedHostSession } from "@/lib/host-session";

export type HostSettingsSession = {
  hostUserId: string;
  familyId: string;
};

export async function requireHostSettingsSession(
  supabase: SupabaseClient,
  request: Request
): Promise<HostSettingsSession> {
  const session = await resolveVerifiedHostSession(request);
  if (!session) {
    throw Object.assign(new Error("Please sign in to the Host Dashboard again."), { code: "unauthorized" });
  }

  const [{ data: user, error: userError }, { data: family, error: familyError }] = await Promise.all([
    supabase.from("users").select("id,role").eq("id", session.hostUserId).maybeSingle(),
    supabase.from("families").select("id,user_id").eq("id", session.familyId).maybeSingle(),
  ]);
  if (userError) throw userError;
  if (familyError) throw familyError;
  if (
    !user ||
    !family ||
    String((family as { user_id?: string | null }).user_id ?? "") !== session.hostUserId
  ) {
    throw Object.assign(new Error("Host session is not authorized."), { code: "unauthorized" });
  }

  return { hostUserId: session.hostUserId, familyId: session.familyId };
}
export async function requireOwnedFamily(
  supabase: SupabaseClient,
  session: HostSettingsSession,
  familyId: string
): Promise<{ familyId: string; hostUserId: string; hostId: string | null }> {
  const [{ data: family, error: familyError }, { data: host, error: hostError }] = await Promise.all([
    supabase.from("families").select("id,user_id").eq("id", familyId).maybeSingle(),
    supabase.from("hosts").select("id,user_id,legacy_family_id").eq("legacy_family_id", familyId).maybeSingle(),
  ]);
  if (familyError) throw familyError;
  if (hostError) throw hostError;
  const familyUserId = String((family as { user_id?: string | null } | null)?.user_id ?? "");
  const hostUserId = String((host as { user_id?: string | null } | null)?.user_id ?? "");
  if (!family || (familyUserId !== session.hostUserId && hostUserId !== session.hostUserId)) {
    throw Object.assign(new Error("You cannot manage this property."), { code: "forbidden" });
  }
  return {
    familyId,
    hostUserId: session.hostUserId,
    hostId: typeof (host as { id?: unknown } | null)?.id === "string" ? String((host as { id: string }).id) : null,
  };
}
