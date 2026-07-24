import type { HomeCardRecord } from "@/lib/discovery";
import { POPULAR_DESTINATIONS } from "@/lib/public-destinations";
import { enumerateDateRange } from "@/lib/platform-utils";

function normalizeSearchText(value?: string | null): string {
  return value?.trim().toLowerCase() ?? "";
}

function tokenizeSearchText(value?: string | null): string[] {
  const normalized = normalizeSearchText(value);
  return normalized ? normalized.split(/[^a-z0-9]+/).filter(Boolean) : [];
}

function dedupeStrings(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const trimmed = value?.trim();
    if (!trimmed) continue;
    const normalized = normalizeSearchText(trimmed);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(trimmed);
  }

  return result;
}

function buildHomeSearchValues(home: HomeCardRecord): string[] {
  const cityState = [home.city, home.state].filter((value): value is string => typeof value === "string" && value.trim().length > 0);
  const villageCity = [home.village, home.city].filter((value): value is string => typeof value === "string" && value.trim().length > 0);
  const cityStateCountry = [...cityState, "India"];

  return dedupeStrings([
    home.listingTitle,
    home.name,
    home.village,
    home.city,
    home.state,
    cityState.join(", "),
    cityState.join(" "),
    villageCity.join(", "),
    villageCity.join(" "),
    cityStateCountry.join(", "),
    cityStateCountry.join(" "),
    home.hostName,
    home.description,
    home.culturalOffering,
    ...home.amenities,
    ...home.houseRules,
    ...home.includedItems,
  ]);
}

function getCandidateScore(value: string, query: string): number {
  const normalizedValue = normalizeSearchText(value);
  if (!normalizedValue || !query) return 0;
  if (normalizedValue === query) return 500;
  if (normalizedValue.startsWith(query)) return 400;
  if (normalizedValue.split(/\s+/).some((part) => part.startsWith(query))) return 300;
  if (normalizedValue.includes(query)) return 200;
  return 0;
}

export function matchesDiscoveryQuery(home: HomeCardRecord, query: string): boolean {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return true;

  return buildHomeSearchValues(home).some((value) => getCandidateScore(value, normalizedQuery) > 0);
}

export function getDiscoveryQueryScore(home: HomeCardRecord, query: string): number {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return 0;

  const values = buildHomeSearchValues(home);
  const bestCandidateScore = values.reduce<number>((best, value) => Math.max(best, getCandidateScore(value, normalizedQuery)), 0);
  const tokenBoost = tokenizeSearchText(query).reduce<number>((sum, token) => {
    if (!token) return sum;
    return sum + values.reduce<number>((best, value) => Math.max(best, getCandidateScore(value, token)), 0);
  }, 0);

  return bestCandidateScore + tokenBoost;
}

export function buildDestinationSuggestions(homes: HomeCardRecord[], query: string): string[] {
  const candidates = dedupeStrings([
    ...POPULAR_DESTINATIONS.map((destination) => destination.name),
    ...homes.flatMap((home) => [home.city, home.state, home.village, home.listingTitle, home.name]),
  ]);

  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return candidates.slice(0, 8);

  return candidates
    .map((value) => ({ value, score: getCandidateScore(value, normalizedQuery) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => {
      if (left.score !== right.score) return right.score - left.score;
      if (left.value.length !== right.value.length) return left.value.length - right.value.length;
      return left.value.localeCompare(right.value);
    })
    .map((entry) => entry.value)
    .slice(0, 8);
}

export function resolveDiscoveryDateRange(params: {
  from?: string | string[];
  to?: string | string[];
  date?: string | string[];
  date_to?: string | string[];
}): { fromDate: string; toDate: string } {
  const readString = (value: string | string[] | undefined): string => (typeof value === "string" ? value.trim() : "");
  return {
    fromDate: readString(params.from) || readString(params.date),
    toDate: readString(params.to) || readString(params.date_to),
  };
}

export function supportsGuestCount(home: HomeCardRecord, guests: number | null): boolean {
  if (guests == null) return true;
  const maxGuests = typeof home.maxGuests === "number" && Number.isFinite(home.maxGuests) ? Math.max(0, Math.trunc(home.maxGuests)) : 0;
  return maxGuests >= guests;
}

export function isHomeAvailableForDateRange(home: HomeCardRecord, fromDate: string, toDate: string): boolean {
  if (!fromDate) return true;
  const endDate = toDate || fromDate;
  if (endDate < fromDate) return false;

  for (const date of enumerateDateRange(fromDate, endDate)) {
    if (
      home.blockedDates.includes(date) ||
      home.blockedDates.includes(`${date}::fullday`) ||
      home.blockedDates.some((slot) => slot.startsWith(`${date}::`))
    ) {
      return false;
    }
  }

  return true;
}
