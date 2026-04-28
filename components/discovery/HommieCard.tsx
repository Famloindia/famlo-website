/// <reference types="styled-jsx" />
import Link from "next/link";
import { CompanionRecord } from "@/lib/discovery";

interface HommieCardProps {
  companion: CompanionRecord;
  distance?: string;
  onClick?: () => void;
}

export function HommieCard({ companion, distance, onClick }: HommieCardProps) {
  return (
    <Link 
      href={companion.href} 
      className="hommie-card panel"
      onClick={onClick}
    >
      <div className="hommie-header">
        <div className="avatar-wrap">
          {companion.imageUrl ? (
            <img src={companion.imageUrl} alt={companion.title} className="avatar-img" />
          ) : (
            <div className="avatar-placeholder">{companion.title.charAt(0)}</div>
          )}
        </div>
        <div className="hommie-info">
          <h3 className="hommie-name">{companion.title}</h3>
          <span className="hommie-location">
            {[companion.locality, companion.city].filter(Boolean).join(", ")}
          </span>
        </div>
      </div>
      
      <p className="hommie-bio">
        {companion.description || "Trusted local guide helping you navigate the city with authentic local insights."}
      </p>

      <div className="hommie-footer">
        <span className="hommie-type">
          {companion.source === "hommies" ? "Hommie Partner" : "Verified Guide"}
        </span>
        {distance && <span className="hommie-distance">{distance}</span>}
      </div>

      <style jsx>{`
        .hommie-card {
          padding: 24px;
          display: flex;
          flex-direction: column;
          gap: 18px;
          text-decoration: none;
          color: inherit;
          min-height: 260px;
        }

        .hommie-header {
          display: flex;
          gap: 12px;
          align-items: center;
        }

        .avatar-wrap {
          width: 72px;
          height: 72px;
          border-radius: 22px;
          overflow: hidden;
          flex-shrink: 0;
          background: var(--accent-light);
          border: 1px solid var(--border-color);
        }

        .avatar-img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .avatar-placeholder {
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--accent-primary);
          font-weight: 700;
          font-size: 28px;
        }

        .hommie-info {
          display: flex;
          flex-direction: column;
          min-width: 0;
        }

        .hommie-name {
          font-family: var(--font-body) !important; /* Overriding display font for names if needed, but display looks good too */
          font-size: 18px;
          font-weight: 600;
          margin: 0;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .hommie-location {
          font-size: 13px;
          color: var(--text-secondary);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .hommie-bio {
          font-size: 15px;
          color: var(--text-secondary);
          line-height: 1.5;
          margin: 0;
          display: -webkit-box;
          -webkit-line-clamp: 3;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        .hommie-footer {
          margin-top: auto;
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding-top: 12px;
          border-top: 1px solid var(--border-color);
        }

        .hommie-type {
          font-size: 12px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--accent-primary);
        }

        .hommie-distance {
          font-size: 13px;
          color: var(--text-secondary);
        }
      `}</style>
    </Link>
  );
}
