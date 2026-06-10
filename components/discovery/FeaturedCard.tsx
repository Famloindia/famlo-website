/// <reference types="styled-jsx" />
/// <reference types="styled-jsx" />
import Link from "next/link";
import { HomeCardRecord } from "@/lib/discovery";

interface FeaturedCardProps {
  home: HomeCardRecord;
  distance?: string;
  onClick?: () => void;
}

export function FeaturedCard({ home, distance, onClick }: FeaturedCardProps) {
  const price = [home.priceMorning, home.priceAfternoon, home.priceEvening, home.priceFullday]
    .filter((p) => p > 0)
    .sort((a, b) => a - b)[0] ?? 0;

  return (
    <Link 
      href={home.href} 
      className="featured-card panel"
      onClick={onClick}
    >
      <div className="card-image-wrap">
        {home.imageUrls[0] ? (
          <img src={home.imageUrls[0]} alt={home.name} className="card-image" />
        ) : (
          <div className="card-image-placeholder" />
        )}
        <div className="card-badges">
          {home.superhost && <span className="badge-premium">Superhost</span>}
          <span className={`badge-status ${home.isAccepting ? "active" : "paused"}`}>
            {home.isAccepting ? "Open" : "Paused"}
          </span>
        </div>
      </div>
      <div className="card-content">
        <div className="card-meta">
          <span className="card-location">{home.city}, {home.state}</span>
          <span className="card-rating">{home.rating ? `${home.rating.toFixed(1)}★` : "New"}</span>
        </div>
        <h3 className="card-title">{home.listingTitle || home.name}</h3>
        <p className="card-description">{home.culturalOffering || home.description}</p>
        <div className="card-footer">
          <span className="card-price">From <span className="price-val">Rs. {price}</span></span>
          {distance && <span className="card-distance">{distance}</span>}
        </div>
      </div>

      <style jsx>{`
        .featured-card {
          flex: 0 0 320px;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          text-decoration: none;
          color: inherit;
        }

        .card-image-wrap {
          position: relative;
          height: 200px;
          width: 100%;
          background: #f0f2f5;
        }

        .card-image {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .card-image-placeholder {
          width: 100%;
          height: 100%;
          background: linear-gradient(135deg, #eef2f7 0%, #dae2ed 100%);
        }

        .card-badges {
          position: absolute;
          top: 12px;
          left: 12px;
          display: flex;
          gap: 6px;
        }

        .badge-premium {
          background: #0F1F3D;
          color: #fff;
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          padding: 4px 8px;
          border-radius: 4px;
        }

        .badge-status {
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          padding: 4px 8px;
          border-radius: 4px;
        }

        .badge-status.active { background: #EBF1FF; color: #1A56DB; }
        .badge-status.paused { background: #FEE2E2; color: #991B1B; }

        .card-content {
          padding: 16px;
          display: flex;
          flex-direction: column;
          flex: 1;
        }

        .card-meta {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
        }

        .card-location {
          font-size: 12px;
          font-weight: 600;
          color: var(--text-secondary);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .card-rating {
          font-size: 12px;
          font-weight: 700;
          color: var(--text-primary);
        }

        .card-title {
          font-family: var(--font-display);
          font-size: 20px;
          margin-bottom: 8px;
          line-height: 1.2;
        }

        .card-description {
          font-size: 14px;
          color: var(--text-secondary);
          line-height: 1.5;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
          margin-bottom: 16px;
        }

        .card-footer {
          margin-top: auto;
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding-top: 12px;
          border-top: 1px solid var(--border-color);
        }

        .card-price {
          font-size: 13px;
          color: var(--text-secondary);
        }

        .price-val {
          font-weight: 700;
          color: var(--text-primary);
        }

        .card-distance {
          font-size: 12px;
          color: var(--accent-primary);
          font-weight: 500;
        }
      `}</style>
    </Link>
  );
}
