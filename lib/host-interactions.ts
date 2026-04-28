import type { SupabaseClient } from "@supabase/supabase-js";

export const HOST_INTERACTION_EVENT_TYPES = [
  "listing_view",
  "profile_click",
  "gallery_open",
  "wishlist_add",
  "message_start",
  "booking_page_open",
  "booking_request",
  "booking_confirmed",
  "story_read",
  "repeat_visit",
] as const;

export type HostInteractionEventType = (typeof HOST_INTERACTION_EVENT_TYPES)[number];

export const HOST_INTERACTION_WEIGHTS: Record<HostInteractionEventType, number> = {
  listing_view: 1,
  profile_click: 2,
  gallery_open: 2,
  wishlist_add: 4,
  message_start: 6,
  booking_page_open: 5,
  booking_request: 7,
  booking_confirmed: 12,
  story_read: 2,
  repeat_visit: 3,
};

export type HostInteractionScore = {
  hostId: string;
  score7d: number;
  score30d: number;
  scoreAllTime: number;
  finalScore: number;
};

type HostInteractionRow = {
  host_id: string | null;
  event_type: string | null;
};

type HostInteractionEventPayload = {
  eventType: HostInteractionEventType;
  hostId?: string | null;
  legacyFamilyId?: string | null;
  userId?: string | null;
  pagePath?: string | null;
  metadata?: Record<string, unknown>;
};

const VISITOR_ID_KEY = "famlo-host-interactions:visitor-id";
const SESSION_ID_KEY = "famlo-host-interactions:session-id";
const MOST_INTERACTED_ENABLED = process.env.NEXT_PUBLIC_ENABLE_MOST_INTERACTED_HOSTS === "true";

function safeRandomId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function getOrCreateVisitorId(): string {
  if (typeof window === "undefined") return "";

  try {
    const existing = window.localStorage.getItem(VISITOR_ID_KEY);
    if (existing) return existing;

    const next = safeRandomId();
    window.localStorage.setItem(VISITOR_ID_KEY, next);
    return next;
  } catch {
    return "";
  }
}

export function getOrCreateSessionId(): string {
  if (typeof window === "undefined") return "";

  try {
    const existing = window.sessionStorage.getItem(SESSION_ID_KEY);
    if (existing) return existing;

    const next = safeRandomId();
    window.sessionStorage.setItem(SESSION_ID_KEY, next);
    return next;
  } catch {
    return "";
  }
}

export function getHostInteractionEventBucket(
  eventType: HostInteractionEventType,
  recordedAt = new Date()
): string {
  const dayBucket = recordedAt.toISOString().slice(0, 10);
  if (eventType === "repeat_visit") {
    return dayBucket;
  }

  return dayBucket;
}

export function getHostInteractionWindowStart(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

export async function recordHostInteractionEvent(payload: HostInteractionEventPayload): Promise<void> {
  if (typeof window === "undefined") return;

  const hostId = payload.hostId ?? payload.legacyFamilyId ?? null;
  if (!hostId) return;

  const visitorId = getOrCreateVisitorId();
  if (!visitorId) return;

  const sessionId = getOrCreateSessionId();
  const body = JSON.stringify({
    ...payload,
    hostId,
    visitorId,
    sessionId: sessionId || null,
    recordedAt: new Date().toISOString(),
  });

  try {
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      navigator.sendBeacon(
        "/api/host-interactions",
        new Blob([body], { type: "application/json" })
      );
      return;
    }
  } catch {
    // Fall back to fetch below.
  }

  try {
    await fetch("/api/host-interactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    });
  } catch {
    // Interaction tracking must never block the user journey.
  }
}

function accumulateScore(
  rows: HostInteractionRow[] | null | undefined,
  scoreMap: Map<string, HostInteractionScore>,
  windowKey: "score7d" | "score30d" | "scoreAllTime"
): void {
  for (const row of rows ?? []) {
    const hostId = row.host_id;
    const eventType = row.event_type as HostInteractionEventType | null;
    if (!hostId || !eventType || !(eventType in HOST_INTERACTION_WEIGHTS)) continue;

    const current =
      scoreMap.get(hostId) ??
      ({
        hostId,
        score7d: 0,
        score30d: 0,
        scoreAllTime: 0,
        finalScore: 0,
      } as HostInteractionScore);

    current[windowKey] += HOST_INTERACTION_WEIGHTS[eventType];
    scoreMap.set(hostId, current);
  }
}

export async function getMostInteractedHostScores(
  supabase: SupabaseClient,
  hostIds: string[]
): Promise<Map<string, HostInteractionScore>> {
  if (!MOST_INTERACTED_ENABLED) {
    return new Map<string, HostInteractionScore>();
  }

  const ids = hostIds.filter((id): id is string => typeof id === "string" && id.trim().length > 0);
  const scoreMap = new Map<string, HostInteractionScore>();

  if (ids.length === 0) {
    return scoreMap;
  }

  const [sevenDayResult, thirtyDayResult, allTimeResult] = await Promise.all([
    supabase
      .from("host_interaction_events_v2")
      .select("host_id,event_type")
      .in("host_id", ids)
      .gte("created_at", getHostInteractionWindowStart(7)),
    supabase
      .from("host_interaction_events_v2")
      .select("host_id,event_type")
      .in("host_id", ids)
      .gte("created_at", getHostInteractionWindowStart(30)),
    supabase
      .from("host_interaction_events_v2")
      .select("host_id,event_type")
      .in("host_id", ids),
  ]);

  if (sevenDayResult.error || thirtyDayResult.error || allTimeResult.error) {
    if (sevenDayResult.error) {
      console.warn("[host-interactions] 7d score query failed", sevenDayResult.error);
    }
    if (thirtyDayResult.error) {
      console.warn("[host-interactions] 30d score query failed", thirtyDayResult.error);
    }
    if (allTimeResult.error) {
      console.warn("[host-interactions] all-time score query failed", allTimeResult.error);
    }
    return scoreMap;
  }

  accumulateScore((sevenDayResult.data ?? []) as HostInteractionRow[], scoreMap, "score7d");
  accumulateScore((thirtyDayResult.data ?? []) as HostInteractionRow[], scoreMap, "score30d");
  accumulateScore((allTimeResult.data ?? []) as HostInteractionRow[], scoreMap, "scoreAllTime");

  for (const score of scoreMap.values()) {
    score.finalScore = score.score7d * 0.5 + score.score30d * 0.3 + score.scoreAllTime * 0.2;
  }

  return scoreMap;
}

export function getHostInteractionScore(
  scoreMap: Map<string, HostInteractionScore>,
  hostId?: string | null
): HostInteractionScore | null {
  if (!hostId) return null;
  return scoreMap.get(hostId) ?? null;
}
