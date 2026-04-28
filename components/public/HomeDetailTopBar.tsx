"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Heart, Share2 } from "lucide-react";
import { useUser } from "@/components/auth/UserContext";
import { recordHostInteractionEvent } from "@/lib/host-interactions";

interface HomeDetailTopBarProps {
  homeHref: string;
  homeId: string;
  hostId?: string | null;
  legacyFamilyId?: string | null;
  title: string;
  imageUrl?: string | null;
}

type SavedHomeRecord = {
  id: string;
  href: string;
  title: string;
  imageUrl: string | null;
  savedAt: string;
};

export function HomeDetailTopBar({
  homeHref,
  homeId,
  hostId = null,
  legacyFamilyId = null,
  title,
  imageUrl = null,
}: Readonly<HomeDetailTopBarProps>): React.JSX.Element {
  const { user } = useUser();
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  const storageKey = useMemo(
    () => (user?.id ? `famlo-saved-homes:${user.id}` : null),
    [user?.id]
  );

  useEffect(() => {
    if (!storageKey || typeof window === "undefined") {
      queueMicrotask(() => setSaved(false));
      return;
    }

    try {
      const raw = window.localStorage.getItem(storageKey);
      const savedHomes = raw ? (JSON.parse(raw) as SavedHomeRecord[]) : [];
      queueMicrotask(() => setSaved(savedHomes.some((item) => item.id === homeId)));
    } catch {
      queueMicrotask(() => setSaved(false));
    }
  }, [storageKey, homeId]);

  const persistSavedHome = () => {
    if (!storageKey || typeof window === "undefined") {
      return;
    }

    let savedHomes: SavedHomeRecord[] = [];
    try {
      const raw = window.localStorage.getItem(storageKey);
      savedHomes = raw ? (JSON.parse(raw) as SavedHomeRecord[]) : [];
    } catch {
      savedHomes = [];
    }

    const exists = savedHomes.some((item) => item.id === homeId);
    const nextHomes = exists
      ? savedHomes.filter((item) => item.id !== homeId)
      : [
          {
            id: homeId,
            href: homeHref,
            title,
            imageUrl,
            savedAt: new Date().toISOString(),
          },
          ...savedHomes,
      ];

    window.localStorage.setItem(storageKey, JSON.stringify(nextHomes.slice(0, 50)));
    setSaved(!exists);

    if (!exists) {
      void recordHostInteractionEvent({
        eventType: "wishlist_add",
        hostId,
        legacyFamilyId,
        userId: user?.id ?? null,
        pagePath: typeof window !== "undefined" ? window.location.pathname : null,
        metadata: {
          homeId,
          title,
        },
      });
    }
  };

  async function handleShare(): Promise<void> {
    const shareUrl = typeof window !== "undefined" ? window.location.href : homeHref;

    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({
          title,
          url: shareUrl,
        });
      } else if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(shareUrl);
      }

      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      try {
        await navigator.clipboard.writeText(shareUrl);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1800);
      } catch {
        // ignore clipboard failures
      }
    }
  }

  return (
    <nav className="famlo-booking-nav">
      <div className="famlo-booking-nav-side">
        <Link className="famlo-nav-link" href="/homestays">
          <span>←</span>
          <span>Back</span>
        </Link>
      </div>
      <div className="famlo-booking-nav-spacer" />
      <div className="famlo-booking-nav-side famlo-booking-nav-actions">
        {copied ? <span className="famlo-copy-toast">Link copied</span> : null}
        <button className="famlo-nav-icon" onClick={() => persistSavedHome()} type="button">
          <Heart size={16} fill={saved ? "#2357e8" : "none"} />
          <span>{saved ? "Saved" : "Save"}</span>
        </button>
        <button className="famlo-nav-icon" onClick={() => void handleShare()} type="button">
          <Share2 size={16} />
          <span>Share</span>
        </button>
      </div>
    </nav>
  );
}
