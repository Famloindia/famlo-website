import type { HomeCardRecord } from "@/lib/discovery";
import { normalizeAmenityList } from "@/lib/room-amenities";

export const DISCOVERY_STAY_FILTERS = [
  "All",
  "Homestay",
  "Beach stay",
  "With pool",
  "Pet stay",
  "Under ₹2500",
  "Instant book",
] as const;

export type DiscoveryStayFilter = (typeof DISCOVERY_STAY_FILTERS)[number];

function normalizeText(value?: string | null): string {
  return value?.trim().toLowerCase() ?? "";
}

function minPrice(home: HomeCardRecord): number {
  if (home.startingRoomPrice && home.startingRoomPrice > 0) return home.startingRoomPrice;
  return [home.priceMorning, home.priceAfternoon, home.priceEvening, home.priceFullday]
    .filter((price) => price > 0)
    .sort((left, right) => left - right)[0] ?? 0;
}

function getHomeSearchText(home: HomeCardRecord): string {
  return [
    home.name,
    home.listingTitle,
    home.city,
    home.state,
    home.village,
    home.description,
    home.culturalOffering,
    ...home.amenities,
    ...home.houseRules,
    ...home.includedItems,
  ]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join(" ")
    .toLowerCase();
}

function getNormalizedAmenitySet(home: HomeCardRecord): Set<string> {
  return new Set(normalizeAmenityList(home.amenities).map((value) => normalizeText(value)));
}

function isBeachStay(home: HomeCardRecord): boolean {
  const text = getHomeSearchText(home);
  return /\b(beach|beachside|sea|seaside|coast|coastal|ocean|shore)\b/.test(text);
}

function hasPool(home: HomeCardRecord): boolean {
  const amenities = getNormalizedAmenitySet(home);
  return amenities.has("swimming pool") || /\b(pool|swimming)\b/.test(getHomeSearchText(home));
}

function isPetStay(home: HomeCardRecord): boolean {
  const amenities = getNormalizedAmenitySet(home);
  if (amenities.has("pet friendly")) return true;

  const text = getHomeSearchText(home);
  if (/\bno pets\b/.test(text)) return false;
  return /\b(pet friendly|pets allowed|pet stay|dog friendly|cat friendly)\b/.test(text);
}

export function matchesDiscoveryStayFilter(home: HomeCardRecord, filter: DiscoveryStayFilter): boolean {
  if (filter === "All" || filter === "Homestay") return true;
  if (filter === "Beach stay") return isBeachStay(home);
  if (filter === "With pool") return hasPool(home);
  if (filter === "Pet stay") return isPetStay(home);
  if (filter === "Under ₹2500") {
    const price = minPrice(home);
    return price > 0 && price <= 2500;
  }
  if (filter === "Instant book") {
    return home.isActive !== false && home.isAccepting !== false && home.bookingRequiresHostApproval !== true;
  }
  return true;
}
