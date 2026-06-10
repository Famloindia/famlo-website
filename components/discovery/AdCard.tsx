/// <reference types="styled-jsx" />
interface AdCardProps {
  ad: {
    title: string;
    label: string;
    description: string | null;
    image_url: string;
    cta_text: string;
    cta_url: string;
  };
}

export function AdCard({ ad }: AdCardProps) {
  // Security check: simple protocol validation
  const isSafeUrl = ad.cta_url.startsWith("http://") || ad.cta_url.startsWith("https://") || ad.cta_url.startsWith("/");
  const safeUrl = isSafeUrl ? ad.cta_url : "#";

  return (
    <div className="ad-card panel">
      <div className="ad-content">
        <span className="ad-label">{ad.label}</span>
        <h2 className="ad-title">{ad.title}</h2>
        {ad.description && <p className="ad-description">{ad.description}</p>}
        <a href={safeUrl} className="btn-primary ad-cta" target="_blank" rel="noopener noreferrer">
          {ad.cta_text}
        </a>
      </div>
      <div className="ad-image-wrap">
        <img src={ad.image_url} alt={ad.title} className="ad-image" />
      </div>

      <style jsx>{`
        .ad-card {
          display: grid;
          grid-template-columns: 1fr 1.2fr;
          overflow: hidden;
          background: #fff;
          margin: 40px 0;
          min-height: 320px;
        }

        @media (max-width: 768px) {
          .ad-card {
            grid-template-columns: 1fr;
          }
          .ad-image-wrap {
            order: -1;
            height: 200px;
          }
        }

        .ad-content {
          padding: 48px;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: flex-start;
        }

        .ad-label {
          font-size: 12px;
          font-weight: 700;
          color: var(--accent-primary);
          text-transform: uppercase;
          letter-spacing: 0.1em;
          margin-bottom: 16px;
        }

        .ad-title {
          font-size: 36px;
          line-height: 1.1;
          margin-bottom: 16px;
        }

        .ad-description {
          font-size: 16px;
          color: var(--text-secondary);
          margin-bottom: 32px;
          max-width: 400px;
        }

        .ad-cta {
          display: inline-block;
          text-decoration: none;
        }

        .ad-image-wrap {
          position: relative;
          background: #f0f2f5;
        }

        .ad-image {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
      `}</style>
    </div>
  );
}
