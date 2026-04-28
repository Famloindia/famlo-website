"use client";

import { useEffect, useRef } from "react";

import { useUser } from "@/components/auth/UserContext";
import { recordHostInteractionEvent } from "@/lib/host-interactions";
import { readRecentViews, writeRecentView, type RecentViewItem } from "@/lib/recent-views";

interface RecentHomeViewTrackerProps {
  id: string;
  hostId?: string | null;
  legacyFamilyId?: string | null;
  title: string;
  image: string;
  hostName?: string | null;
  hostPhotoUrl?: string | null;
  roomImageUrl?: string | null;
  priceLabel?: string | null;
  roomLabel?: string | null;
  subtitle?: string | null;
}

export function RecentHomeViewTracker({
  id,
  hostId = null,
  legacyFamilyId = null,
  title,
  image,
  hostName = null,
  hostPhotoUrl = null,
  roomImageUrl = null,
  priceLabel = null,
  roomLabel = null,
  subtitle = null
}: Readonly<RecentHomeViewTrackerProps>): React.JSX.Element | null {
  const { user } = useUser();
  const lastTrackedKeyRef = useRef<string | null>(null);
  const trackerKey = `${id}|${hostId ?? ""}|${legacyFamilyId ?? ""}|${title}|${image}|${roomImageUrl ?? ""}|${priceLabel ?? ""}|${roomLabel ?? ""}|${hostName ?? ""}|${user?.id ?? ""}`;

  useEffect(() => {
    if (!id || !title) return;
    if (lastTrackedKeyRef.current === trackerKey) return;
    lastTrackedKeyRef.current = trackerKey;

    const previousView = readRecentViews(user?.id).find((entry: RecentViewItem) => entry.id === id && entry.type === "home");
    const now = Date.now();
    const repeatThresholdMs = 24 * 60 * 60 * 1000;

    writeRecentView(
      {
        id,
        type: "home",
        title,
        image: roomImageUrl || image,
        timestamp: Date.now(),
        hostName,
        hostPhotoUrl,
        roomImageUrl: roomImageUrl || image,
        priceLabel,
        roomLabel,
        subtitle,
      },
      user?.id
    );

    void recordHostInteractionEvent({
      eventType: "listing_view",
      hostId,
      legacyFamilyId,
      userId: user?.id ?? null,
      pagePath: typeof window !== "undefined" ? window.location.pathname : null,
      metadata: {
        title,
      },
    });

    if (previousView && now - previousView.timestamp >= repeatThresholdMs) {
      void recordHostInteractionEvent({
        eventType: "repeat_visit",
        hostId,
        legacyFamilyId,
        userId: user?.id ?? null,
        pagePath: typeof window !== "undefined" ? window.location.pathname : null,
        metadata: {
          title,
          previousViewedAt: new Date(previousView.timestamp).toISOString(),
        },
      });
    }
  }, [hostId, id, image, legacyFamilyId, title, trackerKey, user?.id]);

  return null;
}
