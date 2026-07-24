import type { HomeCardRecord } from "@/lib/discovery";

export const DESTINATION_SEARCH_MIN_LENGTH = 2;
export const DESTINATION_SEARCH_MAX_RESULTS = 8;

export type DestinationMatchKind = "exact" | "prefix" | "partial" | "fuzzy";

export type DestinationSuggestion = {
  name: string;
  slug: string;
  state: string | null;
  country: string;
  propertyCount: number;
  searchValue: string;
  matchKind?: DestinationMatchKind;
  similarityScore?: number;
};

type DiscoverySearchUrlInput = {
  query: string;
  selectedDestination?: DestinationSuggestion | null;
  checkInDate?: string;
  checkOutDate?: string;
  guestCount?: string;
  userCoords?: { lat: number; lng: number } | null;
};

function toTrimmedString(value?: string | null): string {
  return value?.trim() ?? "";
}

export function normalizeDestinationText(value?: string | null): string {
  return toTrimmedString(value)
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function createDestinationSlug(name: string, state?: string | null): string {
  return `${name}${state ? `-${state}` : ""}`
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function buildDestinationLabelParts(home: HomeCardRecord): [string | null, string | null] {
  const destinationName = toTrimmedString(home.city) || toTrimmedString(home.village) || null;
  const destinationState = toTrimmedString(home.state) || null;
  return [destinationName, destinationState];
}

function buildDestinationKey(name: string, state?: string | null): string {
  return `${normalizeDestinationText(name)}::${normalizeDestinationText(state)}`;
}

function buildDiceCoefficient(left: string, right: string): number {
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.length < 2 || right.length < 2) return 0;

  const leftPairs = new Map<string, number>();
  for (let index = 0; index < left.length - 1; index += 1) {
    const pair = left.slice(index, index + 2);
    leftPairs.set(pair, (leftPairs.get(pair) ?? 0) + 1);
  }

  let matches = 0;
  for (let index = 0; index < right.length - 1; index += 1) {
    const pair = right.slice(index, index + 2);
    const count = leftPairs.get(pair) ?? 0;
    if (count > 0) {
      leftPairs.set(pair, count - 1);
      matches += 1;
    }
  }

  return (2 * matches) / (left.length + right.length - 2);
}

export function buildDestinationSearchValue(name: string, state?: string | null): string {
  const trimmedName = toTrimmedString(name);
  const trimmedState = toTrimmedString(state);
  return trimmedState ? `${trimmedName}, ${trimmedState}` : trimmedName;
}

export function resolveDestinationSearchQuery(query: string, selectedDestination?: DestinationSuggestion | null): string {
  if (selectedDestination) {
    return buildDestinationSearchValue(selectedDestination.name, selectedDestination.state);
  }

  return toTrimmedString(query);
}

export function buildDiscoverySearchHref(input: DiscoverySearchUrlInput): string {
  const params = new URLSearchParams();
  const resolvedQuery = resolveDestinationSearchQuery(input.query, input.selectedDestination);
  const normalizedGuests = toTrimmedString(input.guestCount);

  if (resolvedQuery) {
    params.set("q", resolvedQuery);
  }

  if (input.checkInDate) {
    params.set("from", input.checkInDate);
  }

  if (input.checkOutDate) {
    params.set("to", input.checkOutDate);
  }

  if (normalizedGuests) {
    params.set("guests", normalizedGuests);
  }

  if (input.userCoords) {
    params.set("lat", input.userCoords.lat.toFixed(6));
    params.set("lng", input.userCoords.lng.toFixed(6));
  }

  return params.size > 0 ? `/homestays?${params.toString()}` : "/homestays";
}

export function getDestinationMatchKind(suggestion: DestinationSuggestion, query: string): DestinationMatchKind {
  const normalizedQuery = normalizeDestinationText(query);
  const normalizedName = normalizeDestinationText(suggestion.name);
  const normalizedState = normalizeDestinationText(suggestion.state);
  const combined = normalizeDestinationText(`${suggestion.name} ${suggestion.state ?? ""}`);

  if (!normalizedQuery) return suggestion.matchKind ?? "partial";
  if (normalizedName === normalizedQuery || combined === normalizedQuery) return "exact";
  if (
    normalizedName.startsWith(normalizedQuery) ||
    normalizedState.startsWith(normalizedQuery) ||
    combined.startsWith(normalizedQuery)
  ) {
    return "prefix";
  }
  if (combined.includes(normalizedQuery) || normalizedName.includes(normalizedQuery)) return "partial";
  return "fuzzy";
}

export function getDestinationFuzzyScore(suggestion: DestinationSuggestion, query: string): number {
  if (typeof suggestion.similarityScore === "number" && Number.isFinite(suggestion.similarityScore)) {
    return suggestion.similarityScore;
  }

  const normalizedQuery = normalizeDestinationText(query);
  const normalizedName = normalizeDestinationText(suggestion.name);
  const combined = normalizeDestinationText(`${suggestion.name} ${suggestion.state ?? ""}`);
  return Math.max(
    buildDiceCoefficient(normalizedName, normalizedQuery),
    buildDiceCoefficient(combined, normalizedQuery)
  );
}

export function rankDestinationSuggestions(
  suggestions: DestinationSuggestion[],
  query: string
): DestinationSuggestion[] {
  const uniqueSuggestions = new Map<string, DestinationSuggestion>();

  for (const suggestion of suggestions) {
    const key = buildDestinationKey(suggestion.name, suggestion.state);
    if (!uniqueSuggestions.has(key)) {
      uniqueSuggestions.set(key, suggestion);
    }
  }

  return [...uniqueSuggestions.values()]
    .map((suggestion) => ({
      ...suggestion,
      matchKind: getDestinationMatchKind(suggestion, query),
      similarityScore: getDestinationFuzzyScore(suggestion, query),
    }))
    .sort((left, right) => {
      const leftPriority = matchKindPriority(left.matchKind ?? "fuzzy");
      const rightPriority = matchKindPriority(right.matchKind ?? "fuzzy");
      if (leftPriority !== rightPriority) return rightPriority - leftPriority;

      if ((left.matchKind ?? "fuzzy") !== "fuzzy" && left.propertyCount !== right.propertyCount) {
        return right.propertyCount - left.propertyCount;
      }

      const leftSimilarity = left.similarityScore ?? 0;
      const rightSimilarity = right.similarityScore ?? 0;
      if (leftSimilarity !== rightSimilarity) return rightSimilarity - leftSimilarity;

      if (left.propertyCount !== right.propertyCount) {
        return right.propertyCount - left.propertyCount;
      }

      const nameOrder = left.name.localeCompare(right.name);
      if (nameOrder !== 0) return nameOrder;
      return (left.state ?? "").localeCompare(right.state ?? "");
    })
    .slice(0, DESTINATION_SEARCH_MAX_RESULTS);
}

function matchKindPriority(matchKind: DestinationMatchKind): number {
  if (matchKind === "exact") return 4;
  if (matchKind === "prefix") return 3;
  if (matchKind === "partial") return 2;
  return 1;
}

export function buildPopularDestinationSuggestions(homes: HomeCardRecord[]): DestinationSuggestion[] {
  const grouped = new Map<string, DestinationSuggestion>();

  for (const home of homes) {
    if (home.isActive === false || home.isAccepting === false) continue;
    const [name, state] = buildDestinationLabelParts(home);
    if (!name) continue;
    const key = buildDestinationKey(name, state);
    const existing = grouped.get(key);
    if (existing) {
      existing.propertyCount += 1;
      continue;
    }

    grouped.set(key, {
      name,
      slug: createDestinationSlug(name, state),
      state,
      country: "India",
      propertyCount: 1,
      searchValue: buildDestinationSearchValue(name, state),
    });
  }

  return [...grouped.values()]
    .filter((suggestion) => suggestion.propertyCount > 0)
    .sort((left, right) => {
      if (left.propertyCount !== right.propertyCount) {
        return right.propertyCount - left.propertyCount;
      }

      const nameOrder = left.name.localeCompare(right.name);
      if (nameOrder !== 0) return nameOrder;
      return (left.state ?? "").localeCompare(right.state ?? "");
    })
    .slice(0, DESTINATION_SEARCH_MAX_RESULTS);
}

export function getNextDestinationIndex(
  currentIndex: number,
  direction: 1 | -1,
  suggestionCount: number
): number {
  if (suggestionCount <= 0) return -1;
  if (currentIndex < 0 || currentIndex >= suggestionCount) {
    return direction > 0 ? 0 : suggestionCount - 1;
  }
  return (currentIndex + direction + suggestionCount) % suggestionCount;
}
