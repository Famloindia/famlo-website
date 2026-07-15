/// <reference types="styled-jsx" />
import { StoryRecord } from "@/lib/discovery";

interface StoryCardProps {
  story: StoryRecord;
}

export function StoryCard({ story }: StoryCardProps) {
  const coverImage = story.imageUrls?.[0] ?? "";
  return (
    <article className="story-card panel">
      {coverImage ? (
        <div className="story-image-wrap">
          <img src={coverImage} alt={story.authorName || "Famlo story"} className="story-image" />
        </div>
      ) : null}
      <div className="story-quote">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="quote-icon">
          <path d="M3 21c3 0 7-1 7-8V5c0-1.25-.75-2-2-2H5c-1.25 0-2 .75-2 2v3c0 1.25.75 2 2 2h3c0 4-4 4-4 4" />
          <path d="M15 21c3 0 7-1 7-8V5c0-1.25-.75-2-2-2h-3c-1.25 0-2 .75-2 2v3c0 1.25.75 2 2 2h3c0 4-4 4-4 4" />
        </svg>
      </div>
      
      <div className="story-rating">
        {"★".repeat(Math.max(1, Math.round(story.rating ?? 5)))}
      </div>

      <p className="story-text">
        {story.storyText || "A Famlo guest shared a memorable local stay story about authentic cultural connection."}
      </p>

      <div className="story-footer">
        <div className="author-info">
          <span className="author-name">{story.authorName || "Famlo Member"}</span>
          <span className="author-location">Stayed in {story.fromCity || "India"}</span>
        </div>
      </div>

      <style jsx>{`
        .story-card {
          flex: 0 0 300px;
          padding: 32px;
          display: flex;
          flex-direction: column;
          gap: 20px;
          background: #fff;
        }

        .story-image-wrap {
          width: 100%;
          border-radius: 18px;
          overflow: hidden;
          border: 1px solid #e2e8f0;
          background: #f8fafc;
        }

        .story-image {
          display: block;
          width: 100%;
          height: 180px;
          object-fit: cover;
        }

        .quote-icon {
          color: var(--accent-light);
          opacity: 0.8;
        }

        .story-rating {
          color: #FFB800;
          font-size: 14px;
          letter-spacing: 2px;
        }

        .story-text {
          font-size: 16px;
          line-height: 1.6;
          color: var(--text-primary);
          font-style: italic;
          margin: 0;
          flex: 1;
        }

        .story-footer {
          margin-top: auto;
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .author-info {
          display: flex;
          flex-direction: column;
        }

        .author-name {
          font-size: 14px;
          font-weight: 700;
          color: var(--text-primary);
        }

        .author-location {
          font-size: 12px;
          color: var(--text-secondary);
        }
      `}</style>
    </article>
  );
}
