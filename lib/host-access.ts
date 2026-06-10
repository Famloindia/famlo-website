import type { SupabaseClient } from "@supabase/supabase-js";

import { hasValidAdminSession } from "@/lib/admin-auth";
import { resolveAuthorizedHostSession, type AuthorizedHostSession } from "@/lib/chat-access";

type JsonRecord = Record<string, unknown>;

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

type HostLookup = {
  hostId: string | null;
  familyId: string | null;
  hostUserId: string | null;
  stayUnitId: string | null;
};

export type AuthorizedHostResource = HostLookup & {
  isAdmin: boolean;
  hostSession: AuthorizedHostSession | null;
};

async function safeHasAdminSession(): Promise<boolean> {
  try {
    return await hasValidAdminSession();
  } catch {
    return false;
  }
}

async function lookupByFamilyId(
  supabase: SupabaseClient,
  familyId: string
): Promise<HostLookup> {
  const [{ data: host }, { data: family }] = await Promise.all([
    supabase.from("hosts").select("id,user_id,legacy_family_id").eq("legacy_family_id", familyId).maybeSingle(),
    supabase.from("families").select("id,user_id").eq("id", familyId).maybeSingle(),
  ]);

  return {
    hostId: asString((host as JsonRecord | null)?.id),
    familyId,
    hostUserId: asString((host as JsonRecord | null)?.user_id) ?? asString((family as JsonRecord | null)?.user_id),
    stayUnitId: null,
  };
}

async function lookupByHostId(
  supabase: SupabaseClient,
  hostId: string
): Promise<HostLookup> {
  const { data: host } = await supabase
    .from("hosts")
    .select("id,user_id,legacy_family_id")
    .eq("id", hostId)
    .maybeSingle();

  return {
    hostId: asString((host as JsonRecord | null)?.id) ?? hostId,
    familyId: asString((host as JsonRecord | null)?.legacy_family_id),
    hostUserId: asString((host as JsonRecord | null)?.user_id),
    stayUnitId: null,
  };
}

async function lookupByStayUnitId(
  supabase: SupabaseClient,
  stayUnitId: string
): Promise<HostLookup> {
  const { data: stayUnit } = await supabase
    .from("stay_units_v2")
    .select("id,host_id,legacy_family_id")
    .eq("id", stayUnitId)
    .maybeSingle();

  const hostId = asString((stayUnit as JsonRecord | null)?.host_id);
  const familyId = asString((stayUnit as JsonRecord | null)?.legacy_family_id);
  const hostLookup = hostId ? await lookupByHostId(supabase, hostId) : familyId ? await lookupByFamilyId(supabase, familyId) : null;

  return {
    hostId: hostLookup?.hostId ?? hostId,
    familyId: hostLookup?.familyId ?? familyId,
    hostUserId: hostLookup?.hostUserId ?? null,
    stayUnitId,
  };
}

async function resolveLookup(
  supabase: SupabaseClient,
  params: {
    familyId?: string | null;
    hostId?: string | null;
    ownerId?: string | null;
    ownerType?: string | null;
  }
): Promise<HostLookup> {
  const familyId = asString(params.familyId);
  if (familyId) {
    return lookupByFamilyId(supabase, familyId);
  }

  const hostId = asString(params.hostId);
  if (hostId) {
    return lookupByHostId(supabase, hostId);
  }

  const ownerType = asString(params.ownerType) ?? "host";
  const ownerId = asString(params.ownerId);
  if (!ownerId) {
    return {
      hostId: null,
      familyId: null,
      hostUserId: null,
      stayUnitId: null,
    };
  }

  if (ownerType === "stay_unit") {
    return lookupByStayUnitId(supabase, ownerId);
  }

  const byHostId = await lookupByHostId(supabase, ownerId);
  if (byHostId.hostUserId || byHostId.familyId) {
    return byHostId;
  }

  return lookupByFamilyId(supabase, ownerId);
}

function matchesHostSession(
  hostSession: AuthorizedHostSession | null,
  lookup: HostLookup
): boolean {
  if (!hostSession) return false;

  if (hostSession.hostUserId && lookup.hostUserId) {
    return hostSession.hostUserId === lookup.hostUserId;
  }

  if (hostSession.familyId && lookup.familyId) {
    return hostSession.familyId === lookup.familyId;
  }

  return false;
}

export async function resolveAuthorizedHostResource(
  supabase: SupabaseClient,
  request: Request,
  params: {
    familyId?: string | null;
    hostId?: string | null;
    ownerId?: string | null;
    ownerType?: string | null;
  }
): Promise<AuthorizedHostResource | null> {
  const lookup = await resolveLookup(supabase, params);
  const isAdmin = await safeHasAdminSession();

  if (isAdmin) {
    return {
      ...lookup,
      isAdmin: true,
      hostSession: null,
    };
  }

  const hostSession = await resolveAuthorizedHostSession(supabase, request);
  if (!matchesHostSession(hostSession, lookup)) {
    return null;
  }

  return {
    ...lookup,
    isAdmin: false,
    hostSession,
  };
}
