import type { SupabaseClient } from "@supabase/supabase-js";
import { unstable_cache } from "next/cache";

import { getPublicListingProfile } from "@/lib/host-property-profile";
import { buildHomestayPath } from "@/lib/slug";
import { createAdminSupabaseClient } from "@/lib/supabase";

type JsonRecord = Record<string, unknown>;

export type HomeRouteKind =
  | "family"
  | "legacy-host"
  | "ambiguous-legacy-host"
  | "not-found";

export type ResolvedHomeRoute = {
  kind: HomeRouteKind;
  requestedId: string;
  legacyHostId: string | null;
  hostId: string | null;
  familyId: string | null;
  hostUserId: string | null;
  hostRow: JsonRecord | null;
  familyRow: JsonRecord | null;
  legacyPublicFamilyIds: string[];
};

export type HomeRouteRepository = {
  loadFamilyById: (familyId: string) => Promise<JsonRecord | null>;
  loadHostById: (hostId: string) => Promise<JsonRecord | null>;
  loadHostByFamilyId: (familyId: string) => Promise<JsonRecord | null>;
  loadPublicFamiliesByUserId: (userId: string) => Promise<JsonRecord[]>;
};

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function emptyResolution(requestedId: string): ResolvedHomeRoute {
  return {
    kind: "not-found",
    requestedId,
    legacyHostId: null,
    hostId: null,
    familyId: null,
    hostUserId: null,
    hostRow: null,
    familyRow: null,
    legacyPublicFamilyIds: [],
  };
}

function isPublicFamilyRow(row: JsonRecord): boolean {
  return row.is_active !== false && row.is_accepting !== false;
}

export function createHomeRouteRepository(supabase: SupabaseClient): HomeRouteRepository {
  const repository: HomeRouteRepository = {
    async loadFamilyById(familyId) {
      const { data, error } = await supabase
        .from("families")
        .select("*")
        .eq("id", familyId)
        .maybeSingle();

      if (error) {
        console.error("Failed to resolve family route id", error);
        return null;
      }
      return (data as JsonRecord | null) ?? null;
    },

    async loadHostById(hostId) {
      const { data, error } = await supabase
        .from("hosts")
        .select("*")
        .eq("id", hostId)
        .maybeSingle();

      if (error) {
        console.error("Failed to resolve legacy host route id", error);
        return null;
      }
      return (data as JsonRecord | null) ?? null;
    },

    async loadHostByFamilyId(familyId) {
      const { data, error } = await supabase
        .from("hosts")
        .select("*")
        .eq("legacy_family_id", familyId)
        .maybeSingle();

      if (error) {
        console.error("Failed to resolve host for family route", error);
        return null;
      }
      return (data as JsonRecord | null) ?? null;
    },

    async loadPublicFamiliesByUserId(userId) {
      // This view already applies marketplace approval and trust filtering. A host
      // UUID is allowed to redirect only when the owner's public property set is
      // unambiguous; legacy_family_id remains the family foreign key in the view.
      const { data, error } = await supabase
        .from("public_home_cards_v1")
        .select("legacy_family_id")
        .eq("user_id", userId)
        .eq("status", "published")
        .eq("is_accepting", true);

      if (error) {
        console.error("Failed to resolve public families for legacy host route", error);
        return [];
      }

      const familyIds = Array.from(
        new Set(
          ((data ?? []) as JsonRecord[])
            .map((row) => asString(row.legacy_family_id))
            .filter((value): value is string => Boolean(value))
        )
      );
      const families = await Promise.all(familyIds.map((familyId) => repository.loadFamilyById(familyId)));
      return families.filter((row): row is JsonRecord => Boolean(row && isPublicFamilyRow(row)));
    },
  };
  return repository;
}

export async function resolveHomeRouteWithRepository(
  repository: HomeRouteRepository,
  routeId: string
): Promise<ResolvedHomeRoute> {
  const requestedId = routeId.trim();
  if (!requestedId) return emptyResolution(requestedId);

  const familyRow = await repository.loadFamilyById(requestedId);
  if (familyRow) {
    const hostRow = await repository.loadHostByFamilyId(requestedId);
    return {
      kind: "family",
      requestedId,
      legacyHostId: null,
      hostId: asString(hostRow?.id),
      familyId: requestedId,
      hostUserId: asString(hostRow?.user_id) ?? asString(familyRow.user_id),
      hostRow,
      familyRow,
      legacyPublicFamilyIds: [],
    };
  }

  const legacyHostRow = await repository.loadHostById(requestedId);
  if (!legacyHostRow) return emptyResolution(requestedId);

  const userId = asString(legacyHostRow.user_id);
  if (!userId) return emptyResolution(requestedId);

  const publicFamilies = await repository.loadPublicFamiliesByUserId(userId);
  const publicFamilyIds = Array.from(
    new Set(
      publicFamilies
        .map((row) => asString(row.id))
        .filter((value): value is string => Boolean(value))
    )
  ).sort();

  if (publicFamilyIds.length !== 1) {
    return {
      ...emptyResolution(requestedId),
      kind: publicFamilyIds.length > 1 ? "ambiguous-legacy-host" : "not-found",
      legacyHostId: requestedId,
      hostUserId: userId,
      legacyPublicFamilyIds: publicFamilyIds,
    };
  }

  const canonicalFamilyId = publicFamilyIds[0];
  const canonicalFamilyRow =
    publicFamilies.find((row) => asString(row.id) === canonicalFamilyId) ?? null;
  if (!canonicalFamilyRow) return emptyResolution(requestedId);

  const canonicalHostRow = await repository.loadHostByFamilyId(canonicalFamilyId);
  return {
    kind: "legacy-host",
    requestedId,
    legacyHostId: requestedId,
    hostId: asString(canonicalHostRow?.id),
    familyId: canonicalFamilyId,
    hostUserId: asString(canonicalHostRow?.user_id) ?? asString(canonicalFamilyRow.user_id) ?? userId,
    hostRow: canonicalHostRow,
    familyRow: canonicalFamilyRow,
    legacyPublicFamilyIds: publicFamilyIds,
  };
}

export async function resolveHomeRoute(
  supabase: SupabaseClient,
  routeId: string
): Promise<ResolvedHomeRoute> {
  return resolveHomeRouteWithRepository(createHomeRouteRepository(supabase), routeId);
}

export async function getCanonicalHomestayPath(
  supabase: SupabaseClient,
  resolved: ResolvedHomeRoute
): Promise<string | null> {
  if (!resolved.familyId || !resolved.familyRow) return null;

  const profile = await getPublicListingProfile(supabase, {
    familyId: resolved.familyId,
    familyRow: resolved.familyRow,
    hostRow: resolved.hostRow,
  });
  const title =
    profile.property.listingTitle ||
    profile.property.propertyName ||
    profile.identity.displayName ||
    resolved.familyId;

  return buildHomestayPath(
    title,
    profile.property.locality,
    profile.property.city,
    resolved.familyId
  );
}

export function getHomestayCanonicalRedirect(
  resolved: ResolvedHomeRoute,
  requestedSlug: string,
  canonicalPath: string
): string | null {
  const canonicalSlug = canonicalPath.split("/").filter(Boolean)[1] ?? "";
  return resolved.kind === "legacy-host" || requestedSlug !== canonicalSlug
    ? canonicalPath
    : null;
}

export const getCachedHomeRouteResolution = unstable_cache(
  async (routeId: string): Promise<ResolvedHomeRoute> => {
    const supabase = createAdminSupabaseClient();
    return resolveHomeRoute(supabase, routeId);
  },
  ["home-route-resolution-v2-family-canonical"],
  { revalidate: 60, tags: ["home-route-resolution"] }
);
