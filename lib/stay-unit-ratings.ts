import type { SupabaseClient } from "@supabase/supabase-js";

export type StayUnitRatingSummary = {
  averageRating: number | null;
  reviewCount: number;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : NaN;
  }
  return NaN;
}

function isMissingSchemaError(message: string): boolean {
  const lower = message.toLowerCase();
  return lower.includes("could not find the table") || lower.includes("does not exist") || lower.includes("schema cache");
}

export async function loadStayUnitRatingSummaries(
  supabase: SupabaseClient,
  stayUnitIds: string[]
): Promise<Map<string, StayUnitRatingSummary>> {
  const ids = [...new Set(stayUnitIds.map((value) => asString(value)).filter(Boolean))];
  if (ids.length === 0) {
    return new Map();
  }

  const { data, error } = await supabase
    .from("reviews_v2")
    .select("target_profile_id,rating")
    .eq("target_type", "stay_unit")
    .in("target_profile_id", ids);

  if (error) {
    if (!isMissingSchemaError(error.message ?? "")) {
      console.error("[stay-unit-ratings] load failed", error);
    }
    return new Map();
  }

  const totals = new Map<string, { sum: number; count: number }>();

  for (const row of (data ?? []) as Record<string, unknown>[]) {
    const roomId = asString(row.target_profile_id);
    const rating = asNumber(row.rating);
    if (!roomId || !Number.isFinite(rating) || rating < 1 || rating > 5) continue;

    const current = totals.get(roomId) ?? { sum: 0, count: 0 };
    current.sum += rating;
    current.count += 1;
    totals.set(roomId, current);
  }

  const summaryMap = new Map<string, StayUnitRatingSummary>();
  for (const [roomId, summary] of totals.entries()) {
    summaryMap.set(roomId, {
      averageRating: summary.count > 0 ? Math.round((summary.sum / summary.count) * 10) / 10 : null,
      reviewCount: summary.count,
    });
  }

  return summaryMap;
}
