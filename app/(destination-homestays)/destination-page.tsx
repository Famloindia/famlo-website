import type { Metadata } from "next";
import Link from "next/link";

import { HomePageCard } from "@/components/public/HomePageCard";
import { getHomesDiscoveryData } from "@/lib/discovery";
import { getDestinationHomes, POPULAR_DESTINATIONS } from "@/lib/public-destinations";

export type DestinationSearchParams = {
  from?: string | string[];
  to?: string | string[];
  guests?: string | string[];
};

type DestinationHomestaysPageProps = {
  destinationName: string;
  searchParams?: Promise<DestinationSearchParams>;
};

function asSearchString(value: string | string[] | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function buildCanonicalUrl(slug: string): string {
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://famlo.in").replace(/\/+$/, "");
  return `${siteUrl}/${slug}`;
}

export function buildDestinationMetadata(destinationName: string, slug: string): Metadata {
  return {
    title: {
      absolute: `Homestays in ${destinationName} | Famlo`,
    },
    description: `Find and book verified homestays in ${destinationName} with Famlo.`,
    alternates: {
      canonical: buildCanonicalUrl(slug),
    },
    openGraph: {
      title: `Homestays in ${destinationName} | Famlo`,
      description: `Find and book verified homestays in ${destinationName} with Famlo.`,
      url: buildCanonicalUrl(slug),
    },
  };
}

export async function DestinationHomestaysPage({
  destinationName,
  searchParams,
}: DestinationHomestaysPageProps): Promise<React.JSX.Element> {
  const resolvedSearchParams: DestinationSearchParams = searchParams ? await searchParams : {};
  const homes = await getHomesDiscoveryData();
  const destinationHomes = getDestinationHomes(homes, destinationName);
  const fromDate = asSearchString(resolvedSearchParams.from);
  const toDate = asSearchString(resolvedSearchParams.to);
  const guests = asSearchString(resolvedSearchParams.guests);
  const relatedDestinations = POPULAR_DESTINATIONS.filter((destination) => destination.name !== destinationName);

  return (
    <main className="destination-page">
      <section className="destination-hero">
        <div className="destination-hero-copy">
          <span>Famlo stays</span>
          <h1>Homestays in {destinationName}</h1>
          <p>Book real homes, warm hosts, and local stays in {destinationName}.</p>
        </div>

        <form action="/homestays" className="destination-search" method="get">
          <label>
            <span>Destination</span>
            <input name="q" defaultValue={destinationName} type="search" />
          </label>
          <label>
            <span>Check-in</span>
            <input name="from" defaultValue={fromDate} type="date" />
          </label>
          <label>
            <span>Check-out</span>
            <input name="to" defaultValue={toDate} type="date" />
          </label>
          <label>
            <span>Guests</span>
            <input min={1} name="guests" defaultValue={guests} inputMode="numeric" type="number" />
          </label>
          <button type="submit">Search</button>
        </form>
      </section>

      <section className="destination-content">
        <div className="destination-section-head">
          <div>
            <h2>{destinationHomes.length} Famlo stay{destinationHomes.length === 1 ? "" : "s"} in {destinationName}</h2>
            <p>Active public homes that match this destination.</p>
          </div>
          <Link href="/homestays">Browse all stays</Link>
        </div>

        {destinationHomes.length > 0 ? (
          <div className="destination-grid">
            {destinationHomes.map((home) => (
              <HomePageCard key={home.id} home={home} />
            ))}
          </div>
        ) : (
          <div className="destination-empty">
            <h2>No Famlo stays available in {destinationName} yet.</h2>
            <p>New homes are added as hosts complete verification and publish their stay.</p>
            <Link href="/homestays">Browse all stays</Link>
          </div>
        )}
      </section>

      {relatedDestinations.length > 0 ? (
        <section className="related-destinations">
          <h2>Explore nearby destinations</h2>
          <div>
            {relatedDestinations.map((destination) => (
              <Link key={destination.slug} href={`/${destination.slug}`}>
                {destination.name}
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <style>{`
        .destination-page {
          min-height: 100vh;
          background: linear-gradient(180deg, #f8fbff 0%, #ffffff 42%, #eef6ff 100%);
          color: #0f172a;
        }

        .destination-hero {
          max-width: 1280px;
          margin: 0 auto;
          padding: clamp(28px, 6vw, 72px) clamp(16px, 4vw, 32px) 28px;
          display: grid;
          gap: 22px;
        }

        .destination-hero-copy {
          display: grid;
          gap: 10px;
          max-width: 760px;
        }

        .destination-hero-copy span {
          color: #1d4ed8;
          font-size: 12px;
          font-weight: 900;
          letter-spacing: 0.12em;
          text-transform: uppercase;
        }

        .destination-hero-copy h1 {
          margin: 0;
          font-size: clamp(34px, 6vw, 68px);
          line-height: 1;
          font-weight: 900;
          letter-spacing: 0;
        }

        .destination-hero-copy p {
          margin: 0;
          color: #475569;
          font-size: clamp(15px, 2vw, 18px);
          line-height: 1.6;
        }

        .destination-search {
          display: grid;
          grid-template-columns: minmax(220px, 1.6fr) repeat(3, minmax(140px, 1fr)) auto;
          gap: 10px;
          align-items: end;
          padding: 12px;
          border: 1px solid #dbeafe;
          border-radius: 8px;
          background: rgba(255,255,255,0.96);
          box-shadow: 0 18px 45px rgba(15, 23, 42, 0.08);
        }

        .destination-search label {
          display: grid;
          gap: 6px;
          min-width: 0;
        }

        .destination-search label span {
          color: #64748b;
          font-size: 11px;
          font-weight: 900;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .destination-search input {
          width: 100%;
          min-width: 0;
          border: 1px solid #dbeafe;
          border-radius: 8px;
          padding: 12px;
          color: #0f172a;
          font-size: 14px;
          font-weight: 700;
          background: #fff;
        }

        .destination-search button,
        .destination-empty a,
        .destination-section-head a {
          border: none;
          border-radius: 8px;
          background: linear-gradient(135deg, #1A56DB, #3B82F6);
          color: #fff;
          padding: 13px 18px;
          font-size: 14px;
          font-weight: 900;
          text-decoration: none;
          cursor: pointer;
          white-space: nowrap;
        }

        .destination-content,
        .related-destinations {
          max-width: 1280px;
          margin: 0 auto;
          padding: 18px clamp(16px, 4vw, 32px) 48px;
        }

        .destination-section-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          margin-bottom: 20px;
          flex-wrap: wrap;
        }

        .destination-section-head h2,
        .related-destinations h2,
        .destination-empty h2 {
          margin: 0;
          font-size: clamp(22px, 3vw, 32px);
          line-height: 1.1;
          font-weight: 900;
        }

        .destination-section-head p,
        .destination-empty p {
          margin: 7px 0 0;
          color: #64748b;
          line-height: 1.6;
          font-size: 14px;
        }

        .destination-grid {
          display: flex;
          flex-wrap: wrap;
          gap: 18px;
          align-items: stretch;
        }

        .destination-empty {
          border: 1px solid #dbeafe;
          border-radius: 8px;
          background: #fff;
          box-shadow: 0 14px 32px rgba(15, 23, 42, 0.06);
          padding: 28px;
          display: grid;
          gap: 14px;
          justify-items: start;
        }

        .related-destinations {
          padding-top: 0;
          display: grid;
          gap: 14px;
        }

        .related-destinations div {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
        }

        .related-destinations a {
          padding: 9px 13px;
          border-radius: 999px;
          border: 1px solid #bfdbfe;
          background: #eff6ff;
          color: #1d4ed8;
          font-size: 13px;
          font-weight: 900;
          text-decoration: none;
        }

        @media (max-width: 900px) {
          .destination-search {
            grid-template-columns: 1fr 1fr;
          }

          .destination-search button {
            grid-column: 1 / -1;
          }
        }

        @media (max-width: 640px) {
          .destination-search {
            grid-template-columns: 1fr;
            border-radius: 8px;
          }

          .destination-grid {
            overflow-x: auto;
            flex-wrap: nowrap;
            padding-bottom: 10px;
            scrollbar-width: none;
          }

          .destination-grid::-webkit-scrollbar {
            display: none;
          }
        }
      `}</style>
    </main>
  );
}
