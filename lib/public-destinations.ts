import type { HomeCardRecord } from "@/lib/discovery";

export const POPULAR_DESTINATIONS = [
  { name: "Manali", slug: "manali-homestays", gradient: ["#0f766e", "#38bdf8"] },
  { name: "Goa", slug: "goa-homestays", gradient: ["#0369a1", "#f59e0b"] },
  { name: "Jodhpur", slug: "jodhpur-homestays", gradient: ["#1d4ed8", "#f97316"] },
  { name: "Kerala", slug: "kerala-homestays", gradient: ["#047857", "#84cc16"] },
  { name: "Shimla", slug: "shimla-homestays", gradient: ["#475569", "#93c5fd"] },
  { name: "Jaipur", slug: "jaipur-homestays", gradient: ["#be123c", "#fbbf24"] },
  { name: "Udaipur", slug: "udaipur-homestays", gradient: ["#0f766e", "#2563eb"] },
  { name: "Rishikesh", slug: "rishikesh-homestays", gradient: ["#15803d", "#06b6d4"] },
] as const;

export type PopularDestination = (typeof POPULAR_DESTINATIONS)[number];

export type PopularDestinationCard = PopularDestination & {
  count: number;
  imageUrl: string | null;
};

export function getValidHomeRating(home: HomeCardRecord): number | null {
  const rating = home.rating;
  return typeof rating === "number" && Number.isFinite(rating) && rating > 0 ? rating : null;
}

export function normalizeDestinationText(value?: string | null): string {
  return value?.trim().toLowerCase() ?? "";
}

export function homeMatchesDestination(home: HomeCardRecord, destinationName: string): boolean {
  const query = normalizeDestinationText(destinationName);
  if (!query) return false;

  const haystack = [
    home.city,
    home.state,
    home.village,
    home.name,
    home.listingTitle,
    home.description,
    home.culturalOffering,
  ]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join(" ")
    .toLowerCase();

  return haystack.includes(query);
}

export function getDestinationImage(home?: HomeCardRecord | null): string | null {
  return home?.roomImageUrls?.[0] || home?.imageUrls?.[0] || null;
}

export function getDestinationHomes(homes: HomeCardRecord[], destinationName: string): HomeCardRecord[] {
  const seen = new Set<string>();

  return homes
    .filter((home) => home.isActive !== false && home.isAccepting !== false)
    .filter((home) => homeMatchesDestination(home, destinationName))
    .filter((home) => {
      const key = home.legacyFamilyId ?? home.hostId ?? home.id;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((left, right) => {
      const leftRating = getValidHomeRating(left);
      const rightRating = getValidHomeRating(right);
      if (leftRating != null || rightRating != null) {
        if (leftRating == null) return 1;
        if (rightRating == null) return -1;
        if (leftRating !== rightRating) return rightRating - leftRating;
      }

      return (left.listingTitle ?? left.name).localeCompare(right.listingTitle ?? right.name);
    });
}

export function buildPopularDestinationCards(homes: HomeCardRecord[]): PopularDestinationCard[] {
  return POPULAR_DESTINATIONS.map((destination) => {
    const matchingHomes = getDestinationHomes(homes, destination.name);
    return {
      ...destination,
      count: matchingHomes.length,
      imageUrl: getDestinationImage(matchingHomes[0] ?? null),
    };
  });
}
