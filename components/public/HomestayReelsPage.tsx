"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Eye, MapPin, Play, Search, X } from "lucide-react";

import type { HomepageReelRecord } from "@/lib/discovery";
import { matchesPublicReelSearch } from "@/lib/public-reel-search";
import { recordPublicReelView } from "@/lib/public-reel-view";
import styles from "./HomestayReelsPage.module.css";

function formatViews(count: number): string {
  if (count === 1) return "1 view";
  return `${count.toLocaleString("en-IN")} views`;
}

export default function HomestayReelsPage({ reels }: Readonly<{ reels: HomepageReelRecord[] }>): React.JSX.Element {
  const [query, setQuery] = useState("");
  const [selectedReel, setSelectedReel] = useState<HomepageReelRecord | null>(null);
  const filteredReels = useMemo(() => reels.filter((reel) => matchesPublicReelSearch(reel, query)), [query, reels]);

  return (
    <main className={styles.reelsPage}>
      <section className={styles.reelsToolbar}>
        <div>
          <h1>Homestay reels</h1>
          <p>Real homes, hosts, and local moments from across Famlo.</p>
        </div>
        <div className={styles.reelsActions}>
          <label className={styles.reelsSearch}>
            <Search size={19} aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search host or place"
              aria-label="Search reels by host or place"
            />
          </label>
          <Link href="/homestays" className={styles.browseHomesLink}>Browse homes</Link>
        </div>
      </section>

      {filteredReels.length > 0 ? (
        <section className={styles.reelsGrid} aria-label="Homestay reels">
          {filteredReels.map((reel) => (
            <article className={styles.reelCard} key={`${reel.familyId}:${reel.id}`}>
              <button type="button" className={styles.reelMedia} onClick={() => setSelectedReel(reel)} aria-label={`Play ${reel.title}`}>
                <video src={reel.videoUrl} poster={reel.thumbnailUrl ?? undefined} muted playsInline preload="metadata" />
                <span className={styles.reelShade} />
                <span className={styles.reelPlay}><Play size={22} fill="currentColor" /></span>
                <span className={styles.reelViews}><Eye size={13} /> {formatViews(reel.viewCount)}</span>
              </button>
              <div className={styles.reelCopy}>
                <strong>{reel.title}</strong>
                <span>{reel.hostName}</span>
                {reel.location ? <small><MapPin size={13} /> {reel.location}</small> : null}
                <Link href={reel.listingHref}>View homestay</Link>
              </div>
            </article>
          ))}
        </section>
      ) : (
        <div className={styles.reelsEmpty}>No reels match “{query.trim()}”.</div>
      )}

      {selectedReel ? (
        <div className={styles.reelModal} role="dialog" aria-modal="true" aria-label={selectedReel.title}>
          <button type="button" className={styles.reelBackdrop} onClick={() => setSelectedReel(null)} aria-label="Close reel" />
          <div className={styles.reelDialog}>
            <button type="button" className={styles.reelClose} onClick={() => setSelectedReel(null)} aria-label="Close reel"><X size={20} /></button>
            <video
              src={selectedReel.videoUrl}
              poster={selectedReel.thumbnailUrl ?? undefined}
              controls
              autoPlay
              playsInline
              preload="metadata"
              onPlay={() => void recordPublicReelView(selectedReel)}
            />
            <div className={styles.reelDialogCopy}>
              <strong>{selectedReel.title}</strong>
              <span>{selectedReel.hostName}{selectedReel.location ? ` · ${selectedReel.location}` : ""}</span>
              <Link href={selectedReel.listingHref}>View homestay</Link>
            </div>
          </div>
        </div>
      ) : null}

    </main>
  );
}
