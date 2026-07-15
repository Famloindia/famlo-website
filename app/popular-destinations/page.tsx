import type { Metadata } from "next";
import Link from "next/link";

import { getHomesDiscoveryData } from "@/lib/discovery";
import { buildPopularDestinationCards } from "@/lib/public-destinations";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Popular destinations",
  description: "Explore Famlo stays across India’s favourite destinations.",
};

export default async function PopularDestinationsPage(): Promise<React.JSX.Element> {
  const homes = await getHomesDiscoveryData();
  const destinations = buildPopularDestinationCards(homes);

  return (
    <main className="popular-page">
      <section className="popular-hero">
        <div>
          <span>Famlo destinations</span>
          <h1>Popular destinations</h1>
          <p>Explore Famlo stays across India’s favourite destinations.</p>
        </div>
        <Link href="/homestays">Browse all stays</Link>
      </section>

      <section className="popular-grid" aria-label="Popular destinations">
        {destinations.map((destination) => (
          <Link
            key={destination.slug}
            href={`/${destination.slug}`}
            className="popular-card"
            style={{
              background: destination.imageUrl
                ? `linear-gradient(180deg, rgba(15,23,42,0.08), rgba(15,23,42,0.76)), url(${destination.imageUrl}) center 42% / cover`
                : `linear-gradient(135deg, ${destination.gradient[0]}, ${destination.gradient[1]})`,
            }}
          >
            <span>{destination.name}</span>
            <strong>
              {destination.count} stay{destination.count === 1 ? "" : "s"}
            </strong>
          </Link>
        ))}
      </section>

      <style>{`
        .popular-page {
          min-height: 100vh;
          background: linear-gradient(180deg, #f8fbff 0%, #f6f8fb 56%, #ffffff 100%);
          color: #0f172a;
          padding: clamp(28px, 5vw, 58px) 0 clamp(46px, 7vw, 82px);
        }

        .popular-hero,
        .popular-grid {
          width: min(94vw, 1560px);
          margin: 0 auto;
          padding-left: 24px;
          padding-right: 24px;
        }

        .popular-hero {
          display: flex;
          align-items: end;
          justify-content: space-between;
          gap: 18px;
          margin-bottom: 26px;
        }

        .popular-hero div {
          display: grid;
          gap: 8px;
          max-width: 760px;
        }

        .popular-hero span {
          color: #1A56DB;
          font-size: 12px;
          font-weight: 900;
          letter-spacing: 0;
          text-transform: uppercase;
        }

        .popular-hero h1 {
          margin: 0;
          color: #0f172a;
          font-size: clamp(34px, 5vw, 62px);
          line-height: 1;
          font-weight: 900;
          letter-spacing: 0;
        }

        .popular-hero p {
          margin: 0;
          color: #64748b;
          font-size: clamp(15px, 2vw, 18px);
          line-height: 1.55;
        }

        .popular-hero > a {
          flex-shrink: 0;
          border-radius: 16px;
          background: linear-gradient(135deg, #1688f0, #1A56DB);
          box-shadow: 0 12px 26px rgba(22,136,240,0.22);
          color: #fff;
          padding: 13px 18px;
          text-decoration: none;
          font-size: 14px;
          font-weight: 900;
        }

        .popular-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 20px;
        }

        .popular-card {
          min-height: 220px;
          border-radius: 24px;
          padding: 20px;
          display: flex;
          flex-direction: column;
          justify-content: flex-end;
          gap: 8px;
          color: #fff;
          text-decoration: none;
          box-shadow: 0 18px 42px rgba(15,23,42,0.12);
          overflow: hidden;
          position: relative;
          isolation: isolate;
          transition: transform 180ms ease, box-shadow 180ms ease;
        }

        .popular-card::after {
          content: "";
          position: absolute;
          inset: 0;
          background: linear-gradient(180deg, rgba(15,23,42,0.04) 0%, rgba(15,23,42,0.58) 100%);
          z-index: -1;
        }

        .popular-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 24px 50px rgba(15,23,42,0.18);
        }

        .popular-card span {
          font-size: clamp(24px, 3vw, 34px);
          line-height: 1;
          font-weight: 900;
          text-shadow: 0 2px 16px rgba(0,0,0,0.24);
        }

        .popular-card strong {
          width: fit-content;
          padding: 7px 11px;
          border-radius: 999px;
          background: rgba(255,255,255,0.24);
          color: #fff;
          font-size: 12px;
          font-weight: 850;
          backdrop-filter: blur(8px);
        }

        @media (max-width: 980px) {
          .popular-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }

        @media (max-width: 640px) {
          .popular-page {
            padding-top: 24px;
          }

          .popular-hero,
          .popular-grid {
            width: 100%;
            padding-left: 16px;
            padding-right: 16px;
          }

          .popular-hero {
            display: grid;
            align-items: start;
          }

          .popular-hero > a {
            width: 100%;
            text-align: center;
          }

          .popular-grid {
            grid-template-columns: 1fr;
            gap: 14px;
          }

          .popular-card {
            min-height: 170px;
            border-radius: 20px;
          }
        }
      `}</style>
    </main>
  );
}
