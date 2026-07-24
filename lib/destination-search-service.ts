import type { SupabaseClient } from "@supabase/supabase-js";

import {
  DESTINATION_SEARCH_MAX_RESULTS,
  DESTINATION_SEARCH_MIN_LENGTH,
  buildDestinationSearchValue,
  normalizeDestinationText,
  rankDestinationSuggestions,
  type DestinationMatchKind,
  type DestinationSuggestion,
} from "@/lib/destination-autocomplete";

type DestinationSearchRpcRow = {
  name?: unknown;
  slug?: unknown;
  state?: unknown;
  country?: unknown;
  property_count?: unknown;
  match_kind?: unknown;
  similarity_score?: unknown;
};

function asTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asOptionalString(value: unknown): string | null {
  const normalized = asTrimmedString(value);
  return normalized || null;
}

function asPositiveInteger(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.trunc(parsed));
}

function asOptionalNumber(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function asMatchKind(value: unknown): DestinationMatchKind | undefined {
  if (value === "exact" || value === "prefix" || value === "partial" || value === "fuzzy") {
    return value;
  }
  return undefined;
}

function normalizeDestinationRpcRows(rows: DestinationSearchRpcRow[]): DestinationSuggestion[] {
  const suggestions: DestinationSuggestion[] = [];

  for (const row of rows) {
    const name = asTrimmedString(row.name);
    const state = asOptionalString(row.state);
    const country = asTrimmedString(row.country) || "India";
    const propertyCount = asPositiveInteger(row.property_count);
    if (!name || propertyCount <= 0) continue;

    suggestions.push({
      name,
      slug:
        asTrimmedString(row.slug) ||
        normalizeDestinationText(`${name}-${state ?? ""}`)
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, ""),
      state,
      country,
      propertyCount,
      searchValue: buildDestinationSearchValue(name, state),
      matchKind: asMatchKind(row.match_kind),
      similarityScore: asOptionalNumber(row.similarity_score),
    });
  }

  return suggestions;
}

export async function searchPublicDestinations(
  supabase: SupabaseClient,
  rawQuery: string,
  limit = DESTINATION_SEARCH_MAX_RESULTS
): Promise<DestinationSuggestion[]> {
  const query = asTrimmedString(rawQuery);
  if (query.length < DESTINATION_SEARCH_MIN_LENGTH) {
    return [];
  }

  const { data, error } = await supabase.rpc("search_public_destinations", {
    search_query: query,
    result_limit: Math.max(1, Math.min(limit, DESTINATION_SEARCH_MAX_RESULTS)),
  });

  if (error) {
    throw new Error("Destination search failed.");
  }

  return rankDestinationSuggestions(normalizeDestinationRpcRows((data ?? []) as DestinationSearchRpcRow[]), query);
}
