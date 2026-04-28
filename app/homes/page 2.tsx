import { HomeListingCard, type PublicHomeCardData } from "@/components/public/HomeListingCard";
import DiscoveryMap from "@/components/public/DiscoveryMap";
import HomesDiscoverySearchBar from "@/components/public/HomesDiscoverySearchBar";
import { getHomesDiscoveryData, type HomeCardRecord } from "@/lib/discovery";
import Link from "next/link";

interface HomesPageProps {
  searchParams?: Promise<{
    q?: string | string[];
    lat?: string | string[];
    lng?: string | string[];
  }>;
}

function toPublicHomeCard(home: HomeCardRecord): PublicHomeCardData & { lat: number | null; lng: number | null; areaLabel: string; radiusMeters: number } {
  const prices = [home.priceMorning, home.priceAfternoon, home.priceEvening, home.priceFullday]
    .filter((price) => price > 0)
    .sort((left, right) => left - right);

  const areaLabel = [home.village, home.city].filter(Boolean).join(", ") || home.state || "Approximate area";

  return {
    id: home.id,
    slug: home.id,
    name: home.name,
    listingTitle: home.listingTitle ?? home.name,
    hostName: home.name,
    city: home.city ?? "",
    state: home.state ?? "",
    locality: home.village ?? "",
    guests: home.maxGuests,
    quarterPrice: prices[0] ?? null,
    likedCount: home.totalReviews,
    storyCount: null,
    isActive: home.isActive,
    isAccepting: home.isAccepting,
    imageUrl: home.imageUrls[0] ?? "",
    imageUrls: home.imageUrls,
    hostPhotoUrl: home.hostPhotoUrl ?? "",
    lat: home.lat,
    lng: home.lng,
    areaLabel,
    radiusMeters: 500,
  };
}

function asSearchString(value: string | string[] | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function asSearchNumber(value: string | string[] | undefined): number | null {
  if (typeof value !== "string") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function haversine(la1: number, lo1: number, la2: number, lo2: number): number {
  const R = 6371;
  const dL = ((la2 - la1) * Math.PI) / 180;
  const dO = ((lo2 - lo1) * Math.PI) / 180;
  const a =
    Math.sin(dL / 2) ** 2 +
    Math.cos((la1 * Math.PI) / 180) * Math.cos((la2 * Math.PI) / 180) * Math.sin(dO / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export const dynamic = "force-dynamic";

export default async function HomesPage({ searchParams }: HomesPageProps): Promise<React.JSX.Element> {
  const params = (await searchParams) ?? {};
  const rawQuery = asSearchString(params.q);
  const query = rawQuery.toLowerCase();
  const searchLat = asSearchNumber(params.lat);
  const searchLng = asSearchNumber(params.lng);
  const isLocationSearch = searchLat != null && searchLng != null;

  const homes = await getHomesDiscoveryData();
  const cards = homes
    .map(toPublicHomeCard)
    .filter((home) => {
      if (isLocationSearch && (!query || query === "near me")) return true;
      if (!query) return true;
      const haystack = [
        home.listingTitle,
        home.name,
        home.locality,
        home.city,
        home.state,
        home.hostName,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    })
    .sort((left, right) => {
      const leftLive = left.isActive && left.isAccepting;
      const rightLive = right.isActive && right.isAccepting;

      if (leftLive !== rightLive) {
        return leftLive ? -1 : 1;
      }

      if (searchLat != null && searchLng != null && left.lat != null && left.lng != null && right.lat != null && right.lng != null) {
        return haversine(searchLat, searchLng, left.lat, left.lng) - haversine(searchLat, searchLng, right.lat, right.lng);
      }

      return left.listingTitle.localeCompare(right.listingTitle);
    });

  const homesWithCoords = cards
    .filter((home) => home.lat != null && home.lng != null)
    .map((home) => ({
      id: home.id,
      name: home.name,
      areaLabel: home.areaLabel,
      lat: home.lat!,
      lng: home.lng!,
      price: home.quarterPrice ?? 0,
      imageUrl: home.imageUrl,
      city: home.city,
      radiusMeters: home.radiusMeters,
    }));

  const mapCenter: [number, number] =
    searchLat != null && searchLng != null
      ? [searchLat, searchLng]
      : homesWithCoords.length > 0 && rawQuery
        ? [homesWithCoords[0].lat, homesWithCoords[0].lng]
      : homesWithCoords.length > 0
        ? [homesWithCoords[0].lat, homesWithCoords[0].lng]
        : [20.5937, 78.9629];

  const heading = isLocationSearch ? "Homes near you" : rawQuery ? `Homes near ${rawQuery}` : "Homes in India";
  const subcopy = rawQuery
    ? "Showing privacy-safe map results for your searched area."
    : "";

  return (
    <main className="shell-full homes-discovery-shell">
      <div className="homes-discovery-topbar">
        <div className="homes-discovery-brand">
          <Link href="/">Famlo</Link>
        </div>
        <HomesDiscoverySearchBar defaultQuery={rawQuery} />
      </div>

      <div className="homes-discovery-body scrollbar-hide">
        <header className="discovery-header">
          <span className="eyebrow">Discover Famlo</span>
          <h1>{heading}</h1>
          {subcopy ? <p className="text-slate-500 text-sm mt-1">{subcopy}</p> : null}
        </header>

        <div className="discovery-map-section discovery-map-section-stacked">
          <DiscoveryMap homes={homesWithCoords} center={mapCenter} zoom={rawQuery || (searchLat != null && searchLng != null) ? 12 : 5} />
        </div>

        {cards.length === 0 ? (
          <div className="panel detail-box mt-8">
            <h2>No matching Homes yet</h2>
            <p>
              {rawQuery
                ? `Try another city or locality instead of "${rawQuery}".`
                : "We could not load nearby homes right now. Try searching in another area or check back later."}
            </p>
          </div>
        ) : (
          <section className="discovery-results-section">
            <div className="discovery-results-head">
              <h2>{rawQuery ? `Homes in ${rawQuery}` : "Homes in India"}</h2>
              <p>{cards.length} stays with approximate map areas for privacy.</p>
            </div>
            <div className="discovery-grid">
              {cards.map((home) => (
                <HomeListingCard home={home} key={home.id} />
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
