export interface RecentViewItem {
  id: string;
  type: "home" | "companion";
  title: string;
  image: string;
  timestamp: number;
  hostName?: string | null;
  hostPhotoUrl?: string | null;
  roomImageUrl?: string | null;
  priceLabel?: string | null;
  roomLabel?: string | null;
  subtitle?: string | null;
}

const RECENT_VIEW_LIMIT = 10;

function recentViewsKey(userId?: string | null): string {
  return `famlo_recent_views:${userId || "guest"}`;
}

export function readRecentViews(userId?: string | null): RecentViewItem[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(recentViewsKey(userId));
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed.filter((item): item is RecentViewItem => {
      return (
        item &&
        typeof item.id === "string" &&
        typeof item.type === "string" &&
        typeof item.title === "string" &&
        typeof item.image === "string" &&
        typeof item.timestamp === "number"
      );
    });
  } catch {
    return [];
  }
}

export function writeRecentView(item: RecentViewItem, userId?: string | null): RecentViewItem[] {
  if (typeof window === "undefined") return [];

  const next = [item, ...readRecentViews(userId).filter((entry) => !(entry.id === item.id && entry.type === item.type))]
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, RECENT_VIEW_LIMIT);

  try {
    window.localStorage.setItem(recentViewsKey(userId), JSON.stringify(next));
  } catch {
    return [];
  }

  return next;
}
