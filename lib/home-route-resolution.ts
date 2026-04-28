import type { SupabaseClient } from "@supabase/supabase-js";
import { getHomesDiscoveryData } from "@/lib/discovery";
import { buildListingSlug, slugify } from "@/lib/slug";
import { createAdminSupabaseClient } from "@/lib/supabase";
import { unstable_cache } from "next/cache";

type JsonRecord = Record<string, unknown>;

export type ResolvedHomeRoute = {
  hostId: string | null;
  familyId: string | null;
  hostUserId: string | null;
  hostRow: JsonRecord | null;
  familyRow: JsonRecord | null;
};

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

async function loadHostByRouteId(
  supabase: SupabaseClient,
  routeId: string
): Promise<JsonRecord | null> {
  const { data, error } = await supabase
    .from("hosts")
    .select("*")
    .or(`id.eq.${routeId},slug.eq.${routeId}`)
    .maybeSingle();

  if (error) {
    console.error("Failed to resolve host by route id", error);
    return null;
  }

  return (data as JsonRecord | null) ?? null;
}

async function loadFamilyByRouteId(
  supabase: SupabaseClient,
  routeId: string
): Promise<JsonRecord | null> {
  const { data, error } = await supabase
    .from("families")
    .select("*")
    .eq("id", routeId)
    .maybeSingle();

  if (error) {
    console.error("Failed to resolve family by route id", error);
    return null;
  }

  return (data as JsonRecord | null) ?? null;
}

async function loadHostById(
  supabase: SupabaseClient,
  hostId: string
): Promise<JsonRecord | null> {
  const { data, error } = await supabase
    .from("hosts")
    .select("*")
    .eq("id", hostId)
    .maybeSingle();

  if (error) {
    console.error("Failed to load host by id", error);
    return null;
  }

  return (data as JsonRecord | null) ?? null;
}

async function loadFamilyById(
  supabase: SupabaseClient,
  familyId: string
): Promise<JsonRecord | null> {
  const { data, error } = await supabase
    .from("families")
    .select("*")
    .eq("id", familyId)
    .maybeSingle();

  if (error) {
    console.error("Failed to load family by id", error);
    return null;
  }

  return (data as JsonRecord | null) ?? null;
}

function matchesGeneratedSlug(row: JsonRecord | null, routeId: string): boolean {
  if (!row) return false;

  const candidates = [
    typeof row.slug === "string" ? row.slug : null,
    typeof row.display_name === "string" ? slugify(row.display_name) : null,
    typeof row.name === "string" ? slugify(row.name) : null,
    typeof row.host_display_name === "string" ? slugify(row.host_display_name) : null,
    typeof row.display_name === "string"
      ? buildListingSlug(
          row.display_name,
          typeof row.locality === "string" ? row.locality : null,
          typeof row.city === "string" ? row.city : null
        )
      : null,
    typeof row.name === "string"
      ? buildListingSlug(
          row.name,
          typeof row.locality === "string" ? row.locality : null,
          typeof row.city === "string" ? row.city : null
        )
      : null,
  ].filter((value): value is string => Boolean(value));

  return candidates.includes(routeId);
}

function matchCachedHomeRoute(
  routeId: string,
  homes: Array<{
    id: string;
    href: string;
    hostId: string | null;
    legacyFamilyId: string | null;
    listingTitle: string | null;
    name: string;
    village: string | null;
    city: string | null;
  }>
): { hostId: string | null; familyId: string | null } | null {
  for (const home of homes) {
    const hrefParts = home.href.split("/").filter(Boolean);
    const hrefSlug = hrefParts[1] ?? null;
    const hrefCode = hrefParts[2] ?? null;
    const generatedSlug = buildListingSlug(
      home.listingTitle ?? home.name,
      home.village,
      home.city
    );

    const candidates = new Set(
      [
        home.id,
        home.hostId,
        home.legacyFamilyId,
        hrefSlug,
        hrefCode,
        generatedSlug,
      ].filter((value): value is string => Boolean(value && value.trim().length > 0))
    );

    if (!candidates.has(routeId)) continue;

    return {
      hostId: home.hostId,
      familyId: home.legacyFamilyId,
    };
  }

  return null;
}

export async function resolveHomeRoute(
  supabase: SupabaseClient,
  routeId: string
): Promise<ResolvedHomeRoute> {
  const directHost = await loadHostByRouteId(supabase, routeId);

  if (directHost) {
    const familyId = asString(directHost.legacy_family_id);
    let familyRow: JsonRecord | null = null;

    if (familyId) {
      familyRow = await loadFamilyById(supabase, familyId);
    }

    return {
      hostId: asString(directHost.id),
      familyId,
      hostUserId: asString(directHost.user_id) ?? asString(familyRow?.user_id),
      hostRow: directHost,
      familyRow,
    };
  }

  const cachedHomes = await getHomesDiscoveryData();
  const cachedMatch = matchCachedHomeRoute(routeId, cachedHomes);
  if (cachedMatch) {
    const hostRow = cachedMatch.hostId ? await loadHostById(supabase, cachedMatch.hostId) : null;
    const familyId = cachedMatch.familyId;
    let familyRow: JsonRecord | null = null;

    if (familyId) {
      familyRow = await loadFamilyById(supabase, familyId);
    }

    return {
      hostId: asString(hostRow?.id) ?? cachedMatch.hostId,
      familyId,
      hostUserId: asString(hostRow?.user_id) ?? asString(familyRow?.user_id),
      hostRow,
      familyRow,
    };
  }

  const { data: generatedHostRows, error: generatedHostError } = await supabase
    .from("hosts")
    .select("*");

  if (generatedHostError) {
    console.error("Failed to scan hosts for generated slug", generatedHostError);
  }

  const generatedHost = (generatedHostRows ?? []).find((row) => matchesGeneratedSlug(row as JsonRecord, routeId)) as JsonRecord | null | undefined;
  if (generatedHost) {
    const familyId = asString(generatedHost.legacy_family_id);
    const familyRow = familyId ? await loadFamilyById(supabase, familyId) : null;

    return {
      hostId: asString(generatedHost.id),
      familyId,
      hostUserId: asString(generatedHost.user_id) ?? asString(familyRow?.user_id),
      hostRow: generatedHost,
      familyRow,
    };
  }

  const familyRow = await loadFamilyByRouteId(supabase, routeId);
  if (!familyRow) {
    return {
      hostId: null,
      familyId: null,
      hostUserId: null,
      hostRow: null,
      familyRow: null,
    };
  }

  const { data: hostRowData, error: hostError } = await supabase
    .from("hosts")
    .select("*")
    .eq("legacy_family_id", routeId)
    .maybeSingle();

  if (hostError) {
    console.error("Failed to resolve host from legacy family id", hostError);
  }

  const hostRow = (hostRowData as JsonRecord | null) ?? null;

  return {
    hostId: asString(hostRow?.id),
    familyId: routeId,
    hostUserId: asString(hostRow?.user_id) ?? asString(familyRow.user_id),
    hostRow,
    familyRow,
  };
}

export const getCachedHomeRouteResolution = unstable_cache(
  async (routeId: string): Promise<ResolvedHomeRoute> => {
    const supabase = createAdminSupabaseClient();
    return resolveHomeRoute(supabase, routeId);
  },
  ["home-route-resolution"],
  { revalidate: 60, tags: ["home-route-resolution"] }
);
