import type { SupabaseClient } from "@supabase/supabase-js";

import { clampMoney } from "@/lib/finance/money";
import { resolveSeasonalPrice } from "@/lib/booking-platform";

export type PricingAuthoritySource =
  | "hosts.price_quarter"
  | "stay_units_v2.price_quarter"
  | "hommie_profiles_v2.hourly_price"
  | "hommie_profiles_v2.nightly_price"
  | "activities_v2.price"
  | "client_fallback";

export type ResolvedBookingUnitPrice = {
  unitPrice: number;
  source: PricingAuthoritySource;
  warnings: string[];
  seasonalRuleCodes?: string[];
};

function isMissingColumnError(error: unknown, columnName: string): boolean {
  if (!error || typeof error !== "object") return false;
  const record = error as { code?: unknown; message?: unknown };
  const code = typeof record.code === "string" ? record.code : "";
  const message = typeof record.message === "string" ? record.message : "";
  return (
    (code === "42703" && message.includes(columnName)) ||
    (message.includes(columnName) && (message.includes("schema cache") || message.includes("does not exist"))) ||
    (columnName === "stay_unit_id" && message === "")
  );
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

export async function resolveBookingUnitPrice(
  supabase: SupabaseClient,
  input: {
    bookingType: "host_stay" | "hommie_session";
    hostId?: string | null;
    hommieId?: string | null;
    activityId?: string | null;
    stayUnitId?: string | null;
    startDate?: string | null;
    quarterType?: string | null;
    clientUnitPrice?: number | null;
    allowClientFallback: boolean;
  }
): Promise<ResolvedBookingUnitPrice> {
  const warnings: string[] = [];

  if (input.activityId) {
    const { data, error } = await supabase.from("activities_v2").select("id,price").eq("id", input.activityId).maybeSingle();
    if (error) throw error;
    const unitPrice = clampMoney(asNumber((data as any)?.price, 0));
    if (unitPrice > 0) {
      return { unitPrice, source: "activities_v2.price", warnings };
    }
    warnings.push("Activity price missing; falling back.");
  }

  if (input.bookingType === "host_stay") {
    const stayUnitId = asString(input.stayUnitId);
    if (stayUnitId) {
      const { data: room, error } = await supabase
        .from("stay_units_v2")
        .select("id,host_id,legacy_family_id,unit_type,price_morning,price_afternoon,price_evening,price_fullday,is_active,quarter_enabled")
        .eq("id", stayUnitId)
        .maybeSingle();
      if (error) throw error;

      if (room) {
        const quarter = asString(input.quarterType)?.toLowerCase() ?? "";
        const row = room as any;
        const quarterPriceMap: Record<string, number> = {
          morning: asNumber(row?.price_morning, 0),
          afternoon: asNumber(row?.price_afternoon, 0),
          evening: asNumber(row?.price_evening, 0),
          fullday: asNumber(row?.price_fullday, 0),
        };

        const hasDemandTiers =
          quarterPriceMap.morning > 0 ||
          quarterPriceMap.afternoon > 0 ||
          quarterPriceMap.evening > 0;

        let picked = quarterPriceMap.fullday ?? 0;

        if (quarter && quarter !== "auto" && quarter !== "fullday") {
          picked = quarterPriceMap[quarter] ?? quarterPriceMap.fullday ?? 0;
        } else if (hasDemandTiers) {
          const cutoff = new Date();
          cutoff.setDate(cutoff.getDate() - 30);
          const cutoffDate = cutoff.toISOString().split("T")[0] ?? "";
          const { count, error: demandError } = await supabase
            .from("bookings_v2")
            .select("id", { count: "exact", head: true })
            .eq("stay_unit_id", stayUnitId)
            .gte("start_date", cutoffDate)
            .neq("status", "cancelled")
            .neq("status", "cancelled_by_user")
            .neq("status", "rejected")
            .neq("status", "expired");

          if (demandError) {
            if (isMissingColumnError(demandError, "stay_unit_id")) {
              warnings.push("Room demand history is unavailable in the current schema, so listed room pricing was used.");
            } else {
              throw demandError;
            }
          }

          if (!demandError) {
            const demandCount = typeof count === "number" ? count : 0;
            const demandTier =
              demandCount >= 8 ? "high" : demandCount >= 3 ? "standard" : "low";

            picked =
              demandTier === "high"
                ? quarterPriceMap.evening || quarterPriceMap.fullday || quarterPriceMap.afternoon || quarterPriceMap.morning || 0
                : demandTier === "standard"
                  ? quarterPriceMap.afternoon || quarterPriceMap.fullday || quarterPriceMap.morning || quarterPriceMap.evening || 0
                  : quarterPriceMap.morning || quarterPriceMap.afternoon || quarterPriceMap.fullday || quarterPriceMap.evening || 0;
            warnings.push(`Smart pricing applied using ${demandTier} demand over the last 30 days.`);
          }
        }

        let unitPrice = clampMoney(picked);
        if (unitPrice > 0) {
          const seasonalResolution = await resolveSeasonalPrice(supabase, {
            ownerType: "stay_unit",
            ownerId: stayUnitId,
            date: asString(input.startDate) ?? new Date().toISOString().split("T")[0] ?? "",
            slotKey: quarter,
            basePrice: unitPrice,
          });
          unitPrice = clampMoney(seasonalResolution.finalPrice);
          if (seasonalResolution.appliedRules.length > 0) {
            warnings.push(
              `Room seasonal pricing applied: ${seasonalResolution.appliedRules.map((rule) => rule.code).join(", ")}.`
            );
          }
          return {
            unitPrice,
            source: "stay_units_v2.price_quarter",
            warnings,
            seasonalRuleCodes: seasonalResolution.appliedRules.map((rule) => rule.code),
          };
        }

        warnings.push("Room pricing is missing or zero; falling back to host pricing.");
      } else {
        warnings.push("stayUnitId missing or room not found; falling back to host pricing.");
      }
    }

    const hostId = asString(input.hostId);
    if (hostId) {
      const { data, error } = await supabase
        .from("hosts")
        .select("id,price_morning,price_afternoon,price_evening,price_fullday")
        .eq("id", hostId)
        .maybeSingle();
      if (error) throw error;

      const quarter = asString(input.quarterType)?.toLowerCase() ?? "fullday";
      const row = data as any;
      const quarterPriceMap: Record<string, number> = {
        morning: asNumber(row?.price_morning, 0),
        afternoon: asNumber(row?.price_afternoon, 0),
        evening: asNumber(row?.price_evening, 0),
        fullday: asNumber(row?.price_fullday, 0),
      };

      const picked = quarterPriceMap[quarter] ?? quarterPriceMap.fullday ?? 0;
      let unitPrice = clampMoney(picked);
      if (unitPrice > 0) {
        const seasonalResolution = await resolveSeasonalPrice(supabase, {
          ownerType: "host",
          ownerId: hostId,
          date: asString(input.startDate) ?? new Date().toISOString().split("T")[0] ?? "",
          slotKey: quarter,
          basePrice: unitPrice,
        });
        unitPrice = clampMoney(seasonalResolution.finalPrice);
        if (seasonalResolution.appliedRules.length > 0) {
          warnings.push(
            `Seasonal pricing applied: ${seasonalResolution.appliedRules.map((rule) => rule.code).join(", ")}.`
          );
        }
        return {
          unitPrice,
          source: "hosts.price_quarter",
          warnings,
          seasonalRuleCodes: seasonalResolution.appliedRules.map((rule) => rule.code),
        };
      }

      warnings.push("Host pricing is missing or zero; falling back.");
    } else {
      warnings.push("HostId missing; cannot resolve authoritative host price.");
    }
  }

  if (input.bookingType === "hommie_session") {
    const hommieId = asString(input.hommieId);
    if (hommieId) {
      const { data, error } = await supabase
        .from("hommie_profiles_v2")
        .select("id,hourly_price,nightly_price")
        .eq("id", hommieId)
        .maybeSingle();
      if (error) throw error;

      const row = data as any;
      const hourly = clampMoney(asNumber(row?.hourly_price, 0));
      if (hourly > 0) {
        return { unitPrice: hourly, source: "hommie_profiles_v2.hourly_price", warnings };
      }

      const nightly = clampMoney(asNumber(row?.nightly_price, 0));
      if (nightly > 0) {
        return { unitPrice: nightly, source: "hommie_profiles_v2.nightly_price", warnings };
      }

      warnings.push("Hommie pricing is missing or zero; falling back.");
    } else {
      warnings.push("hommieId missing; cannot resolve authoritative hommie price.");
    }
  }

  if (input.allowClientFallback) {
    const unitPrice = clampMoney(asNumber(input.clientUnitPrice, 0));
    if (unitPrice > 0) {
      warnings.push("Client unitPrice fallback used (FINANCE_ALLOW_CLIENT_PRICING_FALLBACK enabled).");
      return { unitPrice, source: "client_fallback", warnings };
    }
  }

  throw new Error("Unable to resolve authoritative unit price for this booking.");
}
