import type { SupabaseClient } from "@supabase/supabase-js";

import { asNumber, asString } from "@/lib/platform-utils";

export async function generateHostPricingSuggestions(
  supabase: SupabaseClient,
  hostId: string
): Promise<Array<{
  slotKey: string;
  suggestedPrice: number;
  currentPrice: number;
  confidence: "low" | "medium" | "high";
  reason: string;
}>> {
  const [{ data: host, error: hostError }, { data: bookings, error: bookingsError }] = await Promise.all([
    supabase
      .from("hosts")
      .select("id,price_morning,price_afternoon,price_evening,price_fullday,max_guests")
      .eq("id", hostId)
      .maybeSingle(),
    supabase
      .from("bookings_v2")
      .select("quarter_type,total_price,status,start_date")
      .eq("host_id", hostId)
      .in("status", ["confirmed", "completed", "checked_in"])
      .order("start_date", { ascending: false })
      .limit(120),
  ]);
  if (hostError) throw hostError;
  if (bookingsError) throw bookingsError;
  if (!host) return [];

  const slotMap: Record<string, { current: number; totals: number[] }> = {
    morning: { current: asNumber((host as any).price_morning), totals: [] },
    afternoon: { current: asNumber((host as any).price_afternoon), totals: [] },
    evening: { current: asNumber((host as any).price_evening), totals: [] },
    fullday: { current: asNumber((host as any).price_fullday), totals: [] },
  };

  for (const booking of bookings ?? []) {
    const slotKey = asString((booking as any).quarter_type) ?? "fullday";
    if (!slotMap[slotKey]) continue;
    slotMap[slotKey].totals.push(asNumber((booking as any).total_price));
  }

  return Object.entries(slotMap)
    .filter(([, row]) => row.current > 0)
    .map(([slotKey, row]) => {
      const avg = row.totals.length > 0 ? row.totals.reduce((sum, value) => sum + value, 0) / row.totals.length : row.current;
      const occupancyPressure = row.totals.length >= 10 ? 1.12 : row.totals.length >= 4 ? 1.06 : 0.97;
      const suggestedPrice = Math.max(0, Math.round(avg * occupancyPressure));
      const delta = suggestedPrice - row.current;
      return {
        slotKey,
        currentPrice: row.current,
        suggestedPrice,
        confidence: row.totals.length >= 10 ? "high" : row.totals.length >= 4 ? "medium" : "low",
        reason:
          delta > 0
            ? `Demand trend suggests increasing this slot by INR ${delta}.`
            : delta < 0
              ? `Recent conversion trend suggests reducing this slot by INR ${Math.abs(delta)}.`
              : "Current price is aligned with recent demand.",
      };
    });
}
