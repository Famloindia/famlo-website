import type { SupabaseClient } from "@supabase/supabase-js";
import { getPaymentGatewayFeeConfig, getWithholdingConfig, isClientPricingFallbackEnabled } from "@/lib/finance/config";
import { computeFinanceContractV1 } from "@/lib/finance/engine";
import { resolveBookingUnitPrice } from "@/lib/finance/pricing";
import { resolveFinanceRules } from "@/lib/finance/rules";
import { calculateIndiaHostStayGst } from "@/lib/finance/stay-tax";
import { getTodayInIndia } from "@/lib/booking-time";
import { computeHoldExpiry, enforceInventoryRules } from "@/lib/booking-platform";
import { loadCanonicalCalendar } from "@/lib/calendar";
import { ensureHostProfileForFamily } from "@/lib/family-approval";
import { toPctFromBps } from "@/lib/finance/money";
import { buildHostStayOccupancy } from "@/lib/host-stay-availability";
import { resolvePrimaryStayUnitId } from "@/lib/stay-units";

type JsonRecord = Record<string, unknown>;

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

export type BookingIntentType = "host_stay" | "hommie_session";

export interface BookingQuoteInput {
  bookingType: BookingIntentType;
  userId: string;
  hostId?: string | null;
  hommieId?: string | null;
  legacyFamilyId?: string | null;
  legacyGuideId?: string | null;
  activityId?: string | null;
  stayUnitId?: string | null;
  quarterType?: string | null;
  quarterTime?: string | null;
  startDate: string;
  endDate?: string | null;
  guestsCount: number;
  unitPrice: number;
  commissionPct: number;
  couponCode?: string | null;
}

export interface BookingQuoteResult {
  subtotal: number;
  discountAmount: number;
  taxableAmount: number;
  taxAmount: number;
  totalPrice: number;
  platformFee: number;
  partnerPayoutAmount: number;
  appliedCoupon: {
    id: string;
    code: string;
    discountType: string;
    discountValue: number;
  } | null;
  pricingSnapshot: Record<string, unknown>;
}

export interface BookingCreateInput extends BookingQuoteInput {
  notes?: string | null;
  vibe?: string | null;
  guestName?: string | null;
  guestCity?: string | null;
  listingName?: string | null;
  hostArea?: string | null;
  hostUserId?: string | null;
  guideUserId?: string | null;
  welcomeMessage?: string | null;
  stayUnitId?: string | null;
}

export interface BookingCreateResult {
  bookingId: string;
  legacyBookingId: string | null;
  conversationId: string | null;
  paymentId: string | null;
  paymentStatus: string;
  totalPrice: number;
  partnerPayoutAmount: number;
  pricingSnapshot: Record<string, unknown>;
}

type CouponRow = {
  id: string;
  code: string;
  discount_type: string;
  discount_value: number;
  max_discount_amount: number | null;
  min_booking_amount: number | null;
  applies_to_type: string | null;
  starts_at: string | null;
  ends_at: string | null;
  usage_limit: number | null;
  per_user_limit: number | null;
  is_active: boolean;
  city: string | null;
  state: string | null;
  locality: string | null;
};

const SHOULD_MIRROR_LEGACY_BOOKINGS = process.env.ENABLE_LEGACY_BOOKING_MIRROR !== "false";

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function resolveStayUnitIdFromRecord(row: JsonRecord): string | null {
  const direct = asString(row.stay_unit_id);
  if (direct) {
    return direct;
  }

  const snapshot = (row.pricing_snapshot as JsonRecord | null) ?? null;
  return asString(snapshot?.stay_unit_id);
}

function inferLegacyStatus(status: string): string {
  if (status === "awaiting_payment") return "pending";
  return status;
}

function shouldMirrorLegacyBooking(input: {
  legacyFamilyId?: string | null;
  legacyGuideId?: string | null;
}): boolean {
  if (!SHOULD_MIRROR_LEGACY_BOOKINGS) {
    return false;
  }

  return Boolean(input.legacyFamilyId || input.legacyGuideId);
}

async function loadCoupon(
  supabase: SupabaseClient,
  code: string | null | undefined
): Promise<CouponRow | null> {
  if (!code) return null;

  const { data, error } = await supabase
    .from("coupons_v2")
    .select("*")
    .eq("code", code.trim().toUpperCase())
    .eq("is_active", true)
    .maybeSingle();

  if (error || !data) return null;
  return data as CouponRow;
}

async function countCouponRedemptions(
  supabase: SupabaseClient,
  couponId: string,
  userId: string
): Promise<{ total: number; byUser: number }> {
  const [{ count: total }, { count: byUser }] = await Promise.all([
    supabase
      .from("coupon_redemptions_v2")
      .select("id", { count: "exact", head: true })
      .eq("coupon_id", couponId),
    supabase
      .from("coupon_redemptions_v2")
      .select("id", { count: "exact", head: true })
      .eq("coupon_id", couponId)
      .eq("user_id", userId),
  ]);

  return {
    total: total ?? 0,
    byUser: byUser ?? 0,
  };
}

function couponMatchesType(coupon: CouponRow, input: BookingQuoteInput): boolean {
  const appliesTo = coupon.applies_to_type ?? "all";
  if (appliesTo === "all") return true;
  if (appliesTo === "host") return input.bookingType === "host_stay";
  if (appliesTo === "hommie") return input.bookingType === "hommie_session";
  if (appliesTo === "activity") return Boolean(input.activityId);
  return false;
}

async function loadHostCouponContext(
  supabase: SupabaseClient,
  input: Pick<BookingQuoteInput, "bookingType" | "hostId" | "legacyFamilyId">
): Promise<{ city: string | null; state: string | null; locality: string | null }> {
  if (input.bookingType !== "host_stay") {
    return { city: null, state: null, locality: null };
  }

  if (input.legacyFamilyId) {
    const { data } = await supabase
      .from("families")
      .select("city,state,village")
      .eq("id", input.legacyFamilyId)
      .maybeSingle();

    if (data) {
      return {
        city: asString(data.city),
        state: asString(data.state),
        locality: asString(data.village),
      };
    }
  }

  if (input.hostId) {
    const { data } = await supabase
      .from("hosts")
      .select("city,state,locality")
      .eq("id", input.hostId)
      .maybeSingle();

    if (data) {
      return {
        city: asString(data.city),
        state: asString(data.state),
        locality: asString(data.locality),
      };
    }
  }

  return { city: null, state: null, locality: null };
}

function couponMatchesLocation(
  coupon: CouponRow,
  context: { city: string | null; state: string | null; locality: string | null }
): boolean {
  const couponCity = asString(coupon.city)?.toLowerCase() ?? null;
  const couponState = asString(coupon.state)?.toLowerCase() ?? null;
  const couponLocality = asString(coupon.locality)?.toLowerCase() ?? null;

  if (!couponCity && !couponState && !couponLocality) {
    return true;
  }

  const city = context.city?.toLowerCase() ?? null;
  const state = context.state?.toLowerCase() ?? null;
  const locality = context.locality?.toLowerCase() ?? null;

  if (couponState && couponState !== state) return false;
  if (couponCity && couponCity !== city) return false;
  if (couponLocality && couponLocality !== locality) return false;
  return true;
}

function slotToken(dateStr: string, slotKey: string): string {
  return `${dateStr}::${slotKey}`;
}

function enumerateDates(from: string, to: string): string[] {
  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  const output: string[] = [];

  while (start <= end) {
    output.push(start.toISOString().split("T")[0] ?? from);
    start.setUTCDate(start.getUTCDate() + 1);
  }

  return output;
}

export async function assertHostStayAvailability(
  supabase: SupabaseClient,
  input: Pick<
    BookingQuoteInput,
    "bookingType" | "hostId" | "legacyFamilyId" | "stayUnitId" | "quarterType" | "startDate" | "endDate" | "guestsCount"
  >,
  options?: {
    excludeBookingId?: string | null;
  }
): Promise<void> {
  if (input.bookingType !== "host_stay") {
    return;
  }

  const requestedStayUnitId = asString(input.stayUnitId);
  let hostId = asString(input.hostId);
  let legacyFamilyId = asString(input.legacyFamilyId);
  let roomRow:
    | {
        id: string | null;
        host_id: string | null;
        legacy_family_id: string | null;
        is_active: boolean | null;
        quarter_enabled: boolean | null;
        max_guests: number | null;
      }
    | null = null;

  if (requestedStayUnitId) {
    const { data, error } = await supabase
      .from("stay_units_v2")
      .select("id,host_id,legacy_family_id,is_active,quarter_enabled,max_guests")
      .eq("id", requestedStayUnitId)
      .maybeSingle();
    if (error) throw error;
    roomRow = data;
    if (!roomRow) {
      throw new Error("This room is not available for booking right now.");
    }
    const roomHostId = asString(roomRow.host_id);
    const roomFamilyId = asString(roomRow.legacy_family_id);
    if (hostId && roomHostId && roomHostId !== hostId) {
      throw new Error("This room does not belong to the selected host.");
    }
    if (legacyFamilyId && roomFamilyId && roomFamilyId !== legacyFamilyId) {
      throw new Error("This room does not belong to the selected listing.");
    }
    hostId = hostId ?? asString(roomRow.host_id);
    legacyFamilyId = legacyFamilyId ?? asString(roomRow.legacy_family_id);
    if (roomRow.is_active === false) {
      throw new Error("This room is closed right now.");
    }
  }

  let familyRow:
    | {
        is_active: boolean | null;
        is_accepting: boolean | null;
        active_quarters: string[] | null;
        blocked_dates: string[] | null;
        max_guests: number | null;
      }
    | null = null;

  if (legacyFamilyId) {
    const { data, error } = await supabase
      .from("families")
      .select("is_active,is_accepting,active_quarters,blocked_dates,max_guests")
      .eq("id", legacyFamilyId)
      .maybeSingle();
    if (error) throw error;
    familyRow = data;
  }

  if (!familyRow && hostId) {
    const { data: hostRow, error: hostError } = await supabase
      .from("hosts")
      .select("legacy_family_id,status,is_accepting,active_quarters,blocked_dates,max_guests")
      .eq("id", hostId)
      .maybeSingle();
    if (hostError) throw hostError;

    if (hostRow?.legacy_family_id && !legacyFamilyId) {
      legacyFamilyId = asString(hostRow.legacy_family_id);
      const { data, error } = await supabase
        .from("families")
        .select("is_active,is_accepting,active_quarters,blocked_dates,max_guests")
        .eq("id", legacyFamilyId ?? "")
        .maybeSingle();
      if (error) throw error;
      familyRow = data ?? null;
    }

    if (!familyRow && hostRow) {
      familyRow = {
        is_active: typeof hostRow.status === "string" ? hostRow.status === "published" : true,
        is_accepting: hostRow.is_accepting ?? true,
        active_quarters: Array.isArray(hostRow.active_quarters) ? hostRow.active_quarters : [],
        blocked_dates: Array.isArray(hostRow.blocked_dates) ? hostRow.blocked_dates : [],
        max_guests: typeof hostRow.max_guests === "number" ? hostRow.max_guests : null,
      };
    }
  }

  const activeQuarters =
    familyRow && Array.isArray(familyRow.active_quarters) && familyRow.active_quarters.length > 0
      ? familyRow.active_quarters
      : ["morning", "afternoon", "evening", "fullday"];
  const blockedDates = familyRow && Array.isArray(familyRow.blocked_dates) ? familyRow.blocked_dates : [];
  const endDate = input.endDate ?? input.startDate;
  const quarterType = asString(input.quarterType);
  const requestedGuests = Math.max(1, Math.trunc(input.guestsCount || 1));
  const maxGuests = requestedStayUnitId ? Math.max(1, Math.trunc(roomRow?.max_guests ?? 1)) : Math.max(1, Math.trunc(familyRow?.max_guests ?? 1));

  if (familyRow && (!familyRow.is_active || !familyRow.is_accepting)) {
    throw new Error("This Home listing is not accepting bookings right now.");
  }

  if (requestedStayUnitId && roomRow?.quarter_enabled === false && quarterType && quarterType !== "fullday") {
    throw new Error("This room is available for full-day bookings only.");
  }

  if (quarterType && !activeQuarters.includes(quarterType)) {
    throw new Error("This quarter is currently unavailable for this home.");
  }

  for (const date of enumerateDates(input.startDate, endDate)) {
    if (
      blockedDates.includes(date) ||
      blockedDates.includes(slotToken(date, "fullday")) ||
      (quarterType ? blockedDates.includes(slotToken(date, quarterType)) : false)
    ) {
      throw new Error("This date or quarter has been blocked by the host.");
    }
  }

  const activeBookingRows = await loadHostStayBookingRecordsCompatibility(supabase, {
    hostId,
    legacyFamilyId,
  });
  const excludedBookingId = asString(options?.excludeBookingId);
  const primaryStayUnitId = requestedStayUnitId ? await resolvePrimaryStayUnitId(supabase, { hostId, legacyFamilyId }) : null;
  const scopedBookingRows = requestedStayUnitId
    ? activeBookingRows.filter((row) => {
        if (excludedBookingId && row.bookingId === excludedBookingId) {
          return false;
        }
        if (row.stayUnitId) {
          return row.stayUnitId === requestedStayUnitId;
        }
        return primaryStayUnitId ? requestedStayUnitId === primaryStayUnitId : true;
      })
    : activeBookingRows.filter((row) => !excludedBookingId || row.bookingId !== excludedBookingId);
  const occupancy = buildHostStayOccupancy(scopedBookingRows);

  if (hostId) {
    await enforceInventoryRules(supabase, {
      ownerType: "host",
      ownerId: hostId,
      startDate: input.startDate,
      endDate,
    });

    const canonicalEvents = await loadCanonicalCalendar(supabase, {
      ownerType: "host",
      ownerId: hostId,
      from: input.startDate,
      to: endDate,
    });
    for (const event of canonicalEvents) {
      if (excludedBookingId && event.bookingId === excludedBookingId) continue;
      if (!event.isBlocking || event.status === "released" || event.status === "cancelled") continue;
      for (const date of enumerateDates(input.startDate, endDate)) {
        const overlapsDate = date >= event.startDate && date <= event.endDate;
        const overlapsSlot = !event.slotKey || !quarterType || event.slotKey === quarterType;
        if (overlapsDate && overlapsSlot) {
          throw new Error("This slot is blocked by Famlo calendar sync or an existing hold.");
        }
      }
    }
  }

  if (requestedStayUnitId) {
    await enforceInventoryRules(supabase, {
      ownerType: "stay_unit",
      ownerId: requestedStayUnitId,
      startDate: input.startDate,
      endDate,
    });

  const roomEvents = await loadCanonicalCalendar(supabase, {
      ownerType: "stay_unit",
      ownerId: requestedStayUnitId,
      from: input.startDate,
      to: endDate,
    });
    for (const event of roomEvents) {
      if (excludedBookingId && event.bookingId === excludedBookingId) continue;
      if (!event.isBlocking || event.status === "released" || event.status === "cancelled") continue;
      for (const date of enumerateDates(input.startDate, endDate)) {
        const overlapsDate = date >= event.startDate && date <= event.endDate;
        const overlapsSlot = true;
        if (overlapsDate && overlapsSlot) {
          throw new Error("This room is blocked by Famlo calendar sync or an existing hold.");
        }
      }
    }
  }

  for (const date of enumerateDates(input.startDate, endDate)) {
    const dayOccupancy = occupancy[date];
    if (!dayOccupancy) {
      continue;
    }

    if (requestedGuests > maxGuests) {
      throw new Error(`This Home currently allows up to ${maxGuests} guests per day.`);
    }

    if (dayOccupancy.anyBooking) {
      throw new Error(requestedStayUnitId ? "This room is already booked for this date. Please choose another date." : "This date is already booked. Please choose another date.");
    }
  }
}

async function resolveHostBookingTarget(
  supabase: SupabaseClient,
  input: Pick<BookingCreateInput, "hostId" | "legacyFamilyId" | "hostUserId">
): Promise<{ hostId: string | null; hostUserId: string | null }> {
  const requestedHostId = asString(input.hostId);
  const legacyFamilyId = asString(input.legacyFamilyId);
  const requestedHostUserId = asString(input.hostUserId);

  if (requestedHostId) {
    const { data: directHost } = await supabase
      .from("hosts")
      .select("id,user_id,legacy_family_id")
      .eq("id", requestedHostId)
      .maybeSingle();

    if (directHost) {
      return {
        hostId: asString(directHost.id),
        hostUserId: asString(directHost.user_id) ?? requestedHostUserId,
      };
    }
  }

  const candidateFamilyId = legacyFamilyId ?? requestedHostId;
  if (candidateFamilyId) {
    await ensureHostProfileForFamily(supabase, candidateFamilyId);

    const { data: mappedHost } = await supabase
      .from("hosts")
      .select("id,user_id")
      .eq("legacy_family_id", candidateFamilyId)
      .maybeSingle();

    if (mappedHost) {
      return {
        hostId: asString(mappedHost.id),
        hostUserId: asString(mappedHost.user_id) ?? requestedHostUserId,
      };
    }
  }

  return {
    hostId: null,
    hostUserId: requestedHostUserId,
  };
}

export async function buildBookingQuote(
  supabase: SupabaseClient,
  input: BookingQuoteInput,
  options?: { skipAvailabilityCheck?: boolean }
): Promise<BookingQuoteResult> {
  if (input.bookingType === "host_stay" && input.startDate < getTodayInIndia()) {
    throw new Error("This booking date has already passed. Please select the next available date.");
  }

  if (!options?.skipAvailabilityCheck) {
    await assertHostStayAvailability(supabase, input);
  }

  const allowClientFallback = isClientPricingFallbackEnabled();

  const guestsCount = Math.max(1, Math.trunc(input.guestsCount || 1));
  const startDate = new Date(`${input.startDate}T00:00:00`);
  const endDateSource = input.endDate ?? input.startDate;
  const endDate = new Date(`${endDateSource}T00:00:00`);
  const dayCount =
    input.bookingType === "host_stay"
      ? Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / 86400000) + 1)
      : 1;

  const resolvedHostTarget =
    input.bookingType === "host_stay"
      ? await resolveHostBookingTarget(supabase, input)
      : { hostId: null, hostUserId: null as string | null };

  const resolvedHommieUserId =
    input.bookingType === "hommie_session" && input.hommieId
      ? await (async () => {
          const { data, error } = await supabase
            .from("hommie_profiles_v2")
            .select("user_id")
            .eq("id", input.hommieId ?? "")
            .maybeSingle();
          if (error) throw error;
          return asString((data as any)?.user_id);
        })()
      : null;

  const pricingResolution = await resolveBookingUnitPrice(supabase, {
    bookingType: input.bookingType,
    hostId: resolvedHostTarget.hostId ?? input.hostId ?? null,
    hommieId: input.hommieId ?? null,
    activityId: input.activityId ?? null,
    stayUnitId: input.stayUnitId ?? null,
    startDate: input.startDate,
    quarterType: input.quarterType ?? null,
    clientUnitPrice: typeof input.unitPrice === "number" ? input.unitPrice : null,
    allowClientFallback,
  });

  const subtotal = Math.max(
    0,
    Math.round(pricingResolution.unitPrice * dayCount)
  );

  let discountAmount = 0;
  let appliedCoupon: BookingQuoteResult["appliedCoupon"] = null;
  const couponLocationContext = await loadHostCouponContext(supabase, input);

  const coupon = await loadCoupon(supabase, input.couponCode);
  if (coupon) {
    const now = new Date();
    const startsAt = coupon.starts_at ? new Date(coupon.starts_at) : null;
    const endsAt = coupon.ends_at ? new Date(coupon.ends_at) : null;
    const minAmount = coupon.min_booking_amount ?? 0;

    if (
      couponMatchesType(coupon, input) &&
      couponMatchesLocation(coupon, couponLocationContext) &&
      subtotal >= minAmount &&
      (!startsAt || startsAt <= now) &&
      (!endsAt || endsAt >= now)
    ) {
      const redemptionCounts = await countCouponRedemptions(supabase, coupon.id, input.userId);
      const usageAvailable = coupon.usage_limit == null || redemptionCounts.total < coupon.usage_limit;
      const userAvailable = (coupon.per_user_limit ?? 1) > redemptionCounts.byUser;

      if (usageAvailable && userAvailable) {
        if (coupon.discount_type === "percentage") {
          discountAmount = Math.round(subtotal * (coupon.discount_value / 100));
        } else {
          discountAmount = Math.round(coupon.discount_value);
        }

        if (coupon.max_discount_amount != null) {
          discountAmount = Math.min(discountAmount, coupon.max_discount_amount);
        }

        discountAmount = Math.max(0, Math.min(discountAmount, subtotal));
        appliedCoupon = {
          id: coupon.id,
          code: coupon.code,
          discountType: coupon.discount_type,
          discountValue: coupon.discount_value,
        };
      }
    }
  }

  const effectiveAt = new Date().toISOString();
  const productType = input.activityId ? "activity" : input.bookingType;
  const taxableAccommodationAmount = Math.max(0, subtotal - discountAmount);
  const hostStayGst =
    input.bookingType === "host_stay"
      ? calculateIndiaHostStayGst({
          unitPrice: pricingResolution.unitPrice,
          taxableBase: taxableAccommodationAmount,
        })
      : null;
  const financeRules = await resolveFinanceRules(supabase, {
    effectiveAt,
    productType,
    hostUserId: resolvedHostTarget.hostUserId ?? resolvedHommieUserId ?? null,
    listingId: resolvedHostTarget.hostId ?? null,
    partnerProfileId: input.bookingType === "host_stay" ? resolvedHostTarget.hostId : input.hommieId ?? null,
  });

  const contract = computeFinanceContractV1({
    bookingAmount: subtotal,
    discountAmount,
    commissionRateBps: financeRules.commissionRateBps,
    gstRateBps: financeRules.gstRateBps,
    stayTaxAmount: hostStayGst?.amount ?? 0,
    payoutGatewayFeeBurden: financeRules.payoutGatewayFeeBurden,
    paymentGatewayFee: getPaymentGatewayFeeConfig(),
    withholding: getWithholdingConfig(),
    ruleSource: {
      ruleSetId: financeRules.ruleSetId,
      commissionRuleId: financeRules.commissionRuleId,
      taxRuleIds: financeRules.taxRuleIds,
      payoutRuleId: financeRules.payoutRuleId,
      overrideIds: financeRules.overrideIds,
      warnings: [...financeRules.warnings, ...pricingResolution.warnings],
    },
  });

  const taxableAmount = contract.amount_after_discount;
  const platformFee = contract.platform_fee;
  const taxAmount = contract.gst_on_platform_fee + contract.stay_tax_amount;
  const totalPrice = contract.guest_total;
  const partnerPayoutAmount = contract.host_payout;
  const commissionPct = toPctFromBps(contract.commission_rate_bps);

  const financeSnapshot: Record<string, unknown> = {
    booking_amount: contract.booking_amount,
    discount_amount: contract.discount_amount,
    taxable_base_for_service_fee: contract.amount_after_discount,
    platform_fee: contract.platform_fee,
    platform_fee_tax: contract.gst_on_platform_fee,
    stay_tax: contract.stay_tax_amount,
    guest_total: contract.guest_total,
    host_payout: contract.host_payout,
    gateway_fee_estimate: contract.platform_borne_pg_fee_amount,
    withholding_estimate: contract.tds_amount + contract.tcs_amount,
    rounding_adjustment: 0,
    net_platform_revenue: contract.famlo_net_revenue,
    total_tax_liability: contract.gst_on_platform_fee + contract.stay_tax_amount,
    applied_rule_ids: {
      ruleSetId: financeRules.ruleSetId,
      commissionRuleId: financeRules.commissionRuleId,
      taxRuleIds: financeRules.taxRuleIds,
      payoutRuleId: financeRules.payoutRuleId,
      overrideIds: financeRules.overrideIds,
    },
    calculation_mode: financeRules.calculationMode,
    warnings: [...financeRules.warnings, ...pricingResolution.warnings],
    tax_breakdown: {
      splitMode: "igst",
      platformFeeTaxRatePct: contract.gst_rate_bps / 100,
      platformFeeTaxAmount: contract.gst_on_platform_fee,
      stayTaxRatePct: (hostStayGst?.rateBps ?? 0) / 100,
      stayTaxAmount: contract.stay_tax_amount,
      cgstAmount: 0,
      sgstAmount: 0,
      igstAmount: contract.gst_on_platform_fee + contract.stay_tax_amount,
    },
    payout_breakdown: {
      pg_fee_borne_by: contract.pg_fee_borne_by,
      pg_fee_amount: contract.pg_fee_amount,
      tds_enabled: contract.tds_enabled,
      tds_rate_bps: contract.tds_rate_bps,
      tds_amount: contract.tds_amount,
      tcs_enabled: contract.tcs_enabled,
      tcs_rate_bps: contract.tcs_rate_bps,
      tcs_amount: contract.tcs_amount,
    },
    formulas: {
      mode: financeRules.calculationMode,
      commission_base: "amount_after_discount",
      gst_base: "platform_fee",
      stay_gst_base: "amount_after_discount",
      guest_total: "amount_after_discount + gst_on_platform_fee + stay_tax",
    },
    stay_gst: hostStayGst
      ? {
          country: "IN",
          product: "hotel_accommodation",
          taxable_base: hostStayGst.taxableBase,
          rate_bps: hostStayGst.rateBps,
          rate_pct: hostStayGst.rateBps / 100,
          amount: hostStayGst.amount,
          threshold_per_unit_per_day: hostStayGst.thresholdPerUnitPerDay,
          rate_basis: "resolved unit price per room per day",
          source_note:
            "GST Council/CBIC hotel accommodation slab: value of supply up to Rs. 7,500 per unit per day at 12%; above Rs. 7,500 at 18%.",
        }
      : null,
    contract_v1: contract,
  };

  return {
    subtotal,
    discountAmount,
    taxableAmount,
    taxAmount,
    totalPrice,
    platformFee,
    partnerPayoutAmount,
    appliedCoupon,
    pricingSnapshot: {
      stay_unit_id: input.stayUnitId ?? null,
      unit_price: pricingResolution.unitPrice,
      pricing_authority: {
        source: pricingResolution.source,
        seasonal_rule_codes: pricingResolution.seasonalRuleCodes ?? [],
        allow_client_fallback: allowClientFallback,
        client_unit_price_received: typeof input.unitPrice === "number" ? input.unitPrice : null,
        client_commission_pct_received: typeof input.commissionPct === "number" ? input.commissionPct : null,
      },
      guests_count: guestsCount,
      day_count: dayCount,
      subtotal,
      discount_amount: discountAmount,
      taxable_amount: taxableAmount,
      platform_fee: platformFee,
      tax_amount: taxAmount,
      total_price: totalPrice,
      partner_payout_amount: partnerPayoutAmount,
      commission_pct: commissionPct,
      commission_rate_bps: contract.commission_rate_bps,
      gst_rate_bps: contract.gst_rate_bps,
      coupon_code: appliedCoupon?.code ?? null,
      quarter_type: input.quarterType ?? null,
      quarter_time: input.quarterTime ?? null,
      finance_snapshot: financeSnapshot,
    },
  };
}

export async function assertBookingSlotStillAvailableForPayment(
  supabase: SupabaseClient,
  bookingId: string
): Promise<void> {
  const normalizedBookingId = String(bookingId ?? "").trim();
  if (!normalizedBookingId) {
    throw new Error("bookingId is required.");
  }

  let bookingResult:
    | {
        data: Record<string, unknown> | null;
        error: unknown;
      }
    | undefined;

  try {
    bookingResult = await supabase
      .from("bookings_v2")
      .select("id,booking_type,user_id,host_id,stay_unit_id,start_date,end_date,quarter_type,guests_count,pricing_snapshot,hosts(legacy_family_id)")
      .eq("id", normalizedBookingId)
      .maybeSingle();
  } catch (error) {
    if (!isMissingColumnError(error, "stay_unit_id")) {
      throw error;
    }
  }

  if (!bookingResult || bookingResult.error) {
    bookingResult = await supabase
      .from("bookings_v2")
      .select("id,booking_type,user_id,host_id,start_date,end_date,quarter_type,guests_count,pricing_snapshot,hosts(legacy_family_id)")
      .eq("id", normalizedBookingId)
      .maybeSingle();
  }

  if (bookingResult.error) {
    throw bookingResult.error;
  }

  const booking = bookingResult.data as JsonRecord | null;
  if (!booking) {
    throw new Error("Booking not found.");
  }

  if (asString(booking.booking_type) !== "host_stay") {
    return;
  }

  const hostRelation = Array.isArray(booking.hosts) ? booking.hosts[0] : booking.hosts;

  await assertHostStayAvailability(
    supabase,
    {
      bookingType: "host_stay",
      hostId: asString(booking.host_id),
      legacyFamilyId: asString((hostRelation as JsonRecord | null)?.legacy_family_id),
      stayUnitId: resolveStayUnitIdFromRecord(booking),
      quarterType: asString(booking.quarter_type),
      startDate: asString(booking.start_date) ?? "",
      endDate: asString(booking.end_date),
      guestsCount: asNumber(booking.guests_count, 1),
    },
    {
      excludeBookingId: normalizedBookingId,
    }
  );
}

function mapV2BookingToLegacyRow(row: JsonRecord): JsonRecord {
  const pricing = (row.pricing_snapshot as JsonRecord | null) ?? {};
  const host = (row.hosts as JsonRecord | null) ?? null;
  const hostMedia = Array.isArray(row.host_media) ? (row.host_media as JsonRecord[]) : [];
  const hommie = (row.hommie_profiles_v2 as JsonRecord | null) ?? null;
  const hommieMedia = Array.isArray(row.hommie_media_v2) ? (row.hommie_media_v2 as JsonRecord[]) : [];

  return {
    id: String(row.id),
    booking_type: asString(row.booking_type),
    legacy_booking_id: asString(row.legacy_booking_id),
    family_id: asString(host?.legacy_family_id) ?? asString(row.host_id),
    guide_id: asString(row.hommie_id),
    status: asString(row.status),
    quarter_type: asString(row.quarter_type),
    quarter_time: asString(row.quarter_time),
    date_from: asString(row.start_date),
    date_to: asString(row.end_date),
    guests_count: asNumber(row.guests_count, 1),
    total_price: asNumber(row.total_price, 0),
    family_payout: asNumber(row.partner_payout_amount, 0),
    base_price: asNumber(pricing.base_price ?? pricing.unit_price, 0),
    platform_fee: asNumber(pricing.platform_fee, 0),
    gst_amount: asNumber(pricing.tax_amount ?? pricing.gst_amount, 0),
    created_at: asString(row.created_at),
    vibe: asString(row.notes),
    conversation_id: asString(row.conversation_id),
    payment_status: asString(row.payment_status),
    coupon_code: asString(pricing.coupon_code),
    users: row.users ?? null,
    families: host
      ? {
          id: asString(host.legacy_family_id) ?? String(host.id),
          name: asString(host.property_name) ?? asString(host.display_name),
          host_name: asString(host.host_name) ?? asString(host.display_name),
          property_name: asString(host.property_name) ?? asString(host.display_name),
          city: asString(host.city),
          state: asString(host.state),
          village: asString(host.village),
          host_photo_url: asString(hostMedia[0]?.media_url),
        }
      : null,
    companions: hommie
      ? {
          id: String(hommie.id),
          name: asString(hommie.display_name),
          city: asString(hommie.city),
          state: asString(hommie.state),
          avatar_url: asString(hommieMedia[0]?.media_url),
        }
      : null,
  };
}

export async function loadGuestBookingsCompatibility(
  supabase: SupabaseClient,
  userId: string
): Promise<JsonRecord[]> {
  console.info("[guest.bookings.compat] start", { userId });

  async function queryRows(
    label: string,
    queryFactory: () => any
  ): Promise<JsonRecord[]> {
    try {
      const result = await queryFactory();
      if (result.error) {
        console.error(`[guest.bookings.compat] ${label}:error`, {
          userId,
          errorMessage: result.error.message ?? "Unknown error",
          error: result.error,
        });
        return [];
      }
      const rows = (result.data ?? []) as JsonRecord[];
      console.info(`[guest.bookings.compat] ${label}:success`, {
        userId,
        count: rows.length,
      });
      return rows;
    } catch (error) {
      console.error(`[guest.bookings.compat] ${label}:throw`, {
        userId,
        errorMessage: error instanceof Error ? error.message : String(error),
        error,
      });
      return [];
    }
  }

  const v2Rows = await queryRows("bookings_v2", () =>
    supabase
      .from("bookings_v2")
      .select(`
        id,
        booking_type,
        legacy_booking_id,
        host_id,
        hommie_id,
        user_id,
        status,
        quarter_type,
        quarter_time,
        start_date,
        end_date,
        guests_count,
        total_price,
        partner_payout_amount,
        pricing_snapshot,
        created_at,
        notes,
        conversation_id,
        payment_status
      `)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
  );

  async function loadRelatedRows(rows: JsonRecord[]): Promise<{
    guestMap: Map<string, JsonRecord>;
    hostMap: Map<string, JsonRecord>;
    hommieMap: Map<string, JsonRecord>;
    familyMap: Map<string, JsonRecord>;
  }> {
    const guestIds = [...new Set(rows.map((row) => asString(row.user_id)).filter(Boolean))];
    const hostIds = [...new Set(rows.map((row) => asString(row.host_id)).filter(Boolean))];
    const hommieIds = [...new Set(rows.map((row) => asString(row.hommie_id)).filter(Boolean))];
    console.info("[guest.bookings.compat] ids", {
      userId,
      guestIdsCount: guestIds.length,
      hostIdsCount: hostIds.length,
      hommieIdsCount: hommieIds.length,
    });

    const guestRows = await queryRows("users", () =>
      guestIds.length > 0
        ? supabase.from("users").select("id,name,city,state,gender,about,kyc_status").in("id", guestIds)
        : Promise.resolve({ data: [], error: null })
    );

    const hostRows = await queryRows("hosts", () =>
      hostIds.length > 0
        ? supabase.from("hosts").select("id,legacy_family_id,display_name,city,state").in("id", hostIds)
        : Promise.resolve({ data: [], error: null })
    );

    const hommieRows = await queryRows("hommie_profiles_v2", () =>
      hommieIds.length > 0
        ? supabase.from("hommie_profiles_v2").select("id,display_name,city,state").in("id", hommieIds)
        : Promise.resolve({ data: [], error: null })
    );

    const hostFamilyIds = [...new Set(hostRows.map((host) => asString(host.legacy_family_id)).filter(Boolean))];
    const familyRows = await queryRows("families", () =>
      hostFamilyIds.length > 0
        ? supabase.from("families").select("id,name,city,state,village,host_photo_url").in("id", hostFamilyIds)
        : Promise.resolve({ data: [], error: null })
    );

    const guestMap = new Map<string, JsonRecord>();
    for (const guest of guestRows) {
      const guestId = asString(guest.id);
      if (guestId) guestMap.set(guestId, guest);
    }

    const hostMap = new Map<string, JsonRecord>();
    for (const host of hostRows) {
      const hostId = asString(host.id);
      if (hostId) hostMap.set(hostId, host);
    }

    const hommieMap = new Map<string, JsonRecord>();
    for (const hommie of hommieRows) {
      const hommieId = asString(hommie.id);
      if (hommieId) hommieMap.set(hommieId, hommie);
    }

    const familyMap = new Map<string, JsonRecord>();
    for (const family of familyRows) {
      const familyId = asString(family.id);
      if (familyId) familyMap.set(familyId, family);
    }

    return { guestMap, hostMap, hommieMap, familyMap };
  }

  function mapRows(
    rows: JsonRecord[],
    maps: {
      guestMap: Map<string, JsonRecord>;
      hostMap: Map<string, JsonRecord>;
      hommieMap: Map<string, JsonRecord>;
      familyMap: Map<string, JsonRecord>;
    }
  ): JsonRecord[] {
    const mappedRows: JsonRecord[] = [];

    for (const [index, row] of rows.entries()) {
      try {
        const host = row.host_id ? (maps.hostMap.get(String(row.host_id)) ?? null) : null;
        const family = host ? maps.familyMap.get(asString(host.legacy_family_id) ?? "") ?? null : null;
        const hommie = row.hommie_id ? (maps.hommieMap.get(String(row.hommie_id)) ?? null) : null;
        const guest = row.user_id ? (maps.guestMap.get(String(row.user_id)) ?? null) : null;

        mappedRows.push(
          mapV2BookingToLegacyRow({
            ...row,
            users: guest,
            hosts: family
              ? {
                  ...host,
                  host_name: asString(host?.display_name),
                  display_name: asString(family.name) ?? asString(host?.display_name),
                  property_name: asString(family.name) ?? asString(host?.display_name),
                  city: asString(family.city) ?? asString(host?.city),
                  state: asString(family.state) ?? asString(host?.state),
                  village: asString(family.village) ?? asString(host?.village),
                }
              : host,
            host_media: family ? [{ media_url: asString(family.host_photo_url) }] : [],
            hommie_profiles_v2: hommie,
            hommie_media_v2: [],
          })
        );
      } catch (error) {
        console.error("[guest.bookings.compat] mapping:row_throw", {
          userId,
          index,
          bookingId: asString(row.id),
          errorMessage: error instanceof Error ? error.message : String(error),
          error,
        });
      }
    }

    const filteredRows = mappedRows.filter((row) => asString(row.booking_type) === "host_stay" || !row.booking_type);
    console.info("[guest.bookings.compat] mapping:success", {
      userId,
      mappedCount: mappedRows.length,
      finalCount: filteredRows.length,
    });
    return filteredRows;
  }

  let v2MappedRows: JsonRecord[] = [];
  if ((v2Rows?.length ?? 0) > 0) {
    const maps = await loadRelatedRows(v2Rows);
    v2MappedRows = mapRows(v2Rows, maps);
    console.info("[guest.bookings.compat] v2:mapped", { userId, count: v2MappedRows.length });
  } else {
    console.info("[guest.bookings.compat] v2:empty", { userId });
  }

  console.info("[guest.bookings.compat] legacy:merge:start", { userId });
  const legacyRows = await queryRows("bookings_legacy", () =>
    supabase
      .from("bookings")
      .select(`
        id,
        user_id,
        family_id,
        guide_id,
        quarter_type,
        quarter_time,
        date_from,
        date_to,
        guests_count,
        total_price,
        family_payout,
        base_price,
        platform_fee,
        gst_amount,
        status,
        vibe,
        conversation_id,
        created_at
      `)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
  );

  if ((legacyRows?.length ?? 0) === 0) {
    console.info("[guest.bookings.compat] finish:v2_only", { userId, count: v2MappedRows.length });
    return v2MappedRows;
  }

  const legacyGuestIds = [...new Set(legacyRows.map((row) => asString(row.user_id)).filter(Boolean))];
  const legacyFamilyIds = [...new Set(legacyRows.map((row) => asString(row.family_id)).filter(Boolean))];
  const legacyGuideIds = [...new Set(legacyRows.map((row) => asString(row.guide_id)).filter(Boolean))];

  const [guestRows, familyRows, hommieRows] = await Promise.all([
    queryRows("users_legacy", () =>
      legacyGuestIds.length > 0
        ? supabase.from("users").select("id,name,city,state,gender,about,kyc_status").in("id", legacyGuestIds)
        : Promise.resolve({ data: [], error: null })
    ),
    queryRows("families_legacy", () =>
      legacyFamilyIds.length > 0
        ? supabase.from("families").select("id,name,city,state,village,host_photo_url").in("id", legacyFamilyIds)
        : Promise.resolve({ data: [], error: null })
    ),
    queryRows("hommie_profiles_v2_legacy", () =>
      legacyGuideIds.length > 0
        ? supabase.from("hommie_profiles_v2").select("id,display_name,city,state").in("id", legacyGuideIds)
        : Promise.resolve({ data: [], error: null })
    ),
  ]);

  const guestMap = new Map<string, JsonRecord>();
  for (const guest of guestRows) {
    const guestId = asString(guest.id);
    if (guestId) guestMap.set(guestId, guest);
  }

  const familyMap = new Map<string, JsonRecord>();
  for (const family of familyRows) {
    const familyId = asString(family.id);
    if (familyId) familyMap.set(familyId, family);
  }

  const hommieMap = new Map<string, JsonRecord>();
  for (const hommie of hommieRows) {
    const hommieId = asString(hommie.id);
    if (hommieId) hommieMap.set(hommieId, hommie);
  }

  const legacyMappedRows: JsonRecord[] = [];
  for (const [index, row] of legacyRows.entries()) {
    try {
      const family = row.family_id ? (familyMap.get(String(row.family_id)) ?? null) : null;
      const hommie = row.guide_id ? (hommieMap.get(String(row.guide_id)) ?? null) : null;
      const guest = row.user_id ? (guestMap.get(String(row.user_id)) ?? null) : null;
      legacyMappedRows.push(
        mapV2BookingToLegacyRow({
          id: row.id,
          booking_type: row.family_id ? "host_stay" : row.guide_id ? "hommie_session" : null,
          legacy_booking_id: row.id,
          host_id: row.family_id ?? null,
          hommie_id: row.guide_id ?? null,
          user_id: row.user_id ?? null,
          status: row.status,
          quarter_type: row.quarter_type,
          quarter_time: row.quarter_time,
          start_date: row.date_from,
          end_date: row.date_to,
          guests_count: row.guests_count,
          total_price: row.total_price,
          partner_payout_amount: row.family_payout,
          pricing_snapshot: {
            base_price: row.base_price,
            platform_fee: row.platform_fee,
            gst_amount: row.gst_amount,
          },
          created_at: row.created_at,
          notes: row.vibe,
          conversation_id: row.conversation_id,
          payment_status: null,
          users: guest,
          hosts: family
            ? {
                id: asString(family.id),
                legacy_family_id: asString(family.id),
                host_name: asString(family.name),
                display_name: asString(family.name),
                property_name: asString(family.name),
                city: asString(family.city),
                state: asString(family.state),
                village: asString(family.village),
              }
            : null,
          host_media: family ? [{ media_url: asString(family.host_photo_url) }] : [],
          hommie_profiles_v2: hommie,
          hommie_media_v2: [],
        })
      );
    } catch (error) {
      console.error("[guest.bookings.compat] legacy_mapping:row_throw", {
        userId,
        index,
        bookingId: asString(row.id),
        errorMessage: error instanceof Error ? error.message : String(error),
        error,
      });
    }
  }

  const filteredLegacyRows = legacyMappedRows.filter((row) => asString(row.booking_type) === "host_stay" || !row.booking_type);
  const mirroredLegacyIds = new Set(v2MappedRows.map((row) => asString(row.legacy_booking_id)).filter(Boolean));
  const legacyOnlyRows = filteredLegacyRows.filter((row) => !mirroredLegacyIds.has(asString(row.id)));
  const combinedRows = [...v2MappedRows, ...legacyOnlyRows].sort((left, right) => {
    const leftTime = new Date(asString(left.created_at) ?? "").getTime();
    const rightTime = new Date(asString(right.created_at) ?? "").getTime();
    return (Number.isNaN(rightTime) ? 0 : rightTime) - (Number.isNaN(leftTime) ? 0 : leftTime);
  });
  console.info("[guest.bookings.compat] legacy:success", {
    userId,
    mappedCount: legacyMappedRows.length,
    finalCount: combinedRows.length,
  });
  return combinedRows;
}

export async function loadHostStayBookingRecordsCompatibility(
  supabase: SupabaseClient,
  input: {
    hostId?: string | null;
    legacyFamilyId?: string | null;
  }
): Promise<Array<{
  bookingId?: string | null;
  legacyBookingId?: string | null;
  stayUnitId?: string | null;
  startDate: string;
  endDate: string;
  quarterType: string | null;
  guestsCount: number;
  status: string | null;
  paymentStatus: string | null;
  holdExpiresAt?: string | null;
  source: "legacy" | "v2";
  }>> {
  const v2SelectWithRoom =
    "id,legacy_booking_id,stay_unit_id,start_date,end_date,quarter_type,guests_count,status,payment_status,hold_expires_at,pricing_snapshot";
  const v2SelectWithoutRoom =
    "id,legacy_booking_id,start_date,end_date,quarter_type,guests_count,status,payment_status,hold_expires_at,pricing_snapshot";

  let v2Result: { data: unknown[] | null; error: unknown } | null = null;
  if (input.hostId) {
    try {
      v2Result = await supabase
        .from("bookings_v2")
        .select(v2SelectWithRoom)
        .eq("host_id", input.hostId);
    } catch (error) {
      if (!isMissingColumnError(error, "stay_unit_id")) {
        throw error;
      }
    }

    if (!v2Result || v2Result.error) {
      v2Result = await supabase
        .from("bookings_v2")
        .select(v2SelectWithoutRoom)
        .eq("host_id", input.hostId);
    }
  }

  const legacyQueries = input.legacyFamilyId
    ? supabase
        .from("bookings")
        .select("date_from,date_to,quarter_type,guests_count,status")
        .eq("family_id", input.legacyFamilyId)
    : null;

  const legacyResult = await legacyQueries;

  if (v2Result?.error) throw v2Result.error;
  if (legacyResult?.error) throw legacyResult.error;

  const v2Rows = ((v2Result?.data ?? []) as JsonRecord[]).map((row) => ({
    bookingId: asString(row.id),
    legacyBookingId: asString(row.legacy_booking_id),
    stayUnitId: resolveStayUnitIdFromRecord(row),
    startDate: asString(row.start_date) ?? "",
    endDate: asString(row.end_date) ?? asString(row.start_date) ?? "",
    quarterType: asString(row.quarter_type),
    guestsCount: asNumber(row.guests_count, 1),
    status: asString(row.status),
    paymentStatus: asString(row.payment_status),
    holdExpiresAt: asString(row.hold_expires_at),
    source: "v2" as const,
  }));

  const legacyRows = ((legacyResult?.data ?? []) as JsonRecord[]).map((row) => ({
    bookingId: asString(row.id),
    legacyBookingId: asString(row.id),
    stayUnitId: null,
    startDate: asString(row.date_from) ?? "",
    endDate: asString(row.date_to) ?? asString(row.date_from) ?? "",
    quarterType: asString(row.quarter_type),
    guestsCount: asNumber(row.guests_count, 1),
    status: asString(row.status),
    paymentStatus: asString(row.status),
    holdExpiresAt: null,
    source: "legacy" as const,
  }));

  return [...v2Rows, ...legacyRows].filter((row) => Boolean(row.startDate));
}

export async function createBookingCompatibility(
  supabase: SupabaseClient,
  input: BookingCreateInput
): Promise<BookingCreateResult> {
  console.info("[booking.create] start", {
    bookingType: input.bookingType,
    userId: input.userId,
    startDate: input.startDate,
    endDate: input.endDate ?? input.startDate,
    quarterType: input.quarterType ?? null,
    legacyFamilyId: input.legacyFamilyId ?? null,
    hostId: input.hostId ?? null,
  });

  if (input.bookingType === "host_stay" && input.startDate < getTodayInIndia()) {
    throw new Error("This booking date has already passed. Please choose another date.");
  }

  await assertHostStayAvailability(supabase, input);

  const quote = await buildBookingQuote(supabase, input, { skipAvailabilityCheck: true });

  const resolvedHostTarget =
    input.bookingType === "host_stay"
      ? await resolveHostBookingTarget(supabase, input)
      : { hostId: null, hostUserId: asString(input.hostUserId) };
  const resolvedHostId = resolvedHostTarget.hostId;
  const resolvedHostUserId = resolvedHostTarget.hostUserId;
  const resolvedStayUnitId =
    input.bookingType === "host_stay"
      ? asString(input.stayUnitId) ??
        (await resolvePrimaryStayUnitId(supabase, {
          hostId: resolvedHostId,
          legacyFamilyId: input.legacyFamilyId ?? null,
        }))
      : null;

  let resolvedHommieId = input.hommieId ?? null;
  if (input.bookingType === "hommie_session" && !resolvedHommieId && input.legacyGuideId) {
    const { data: hommieRow } = await supabase
      .from("hommie_profiles_v2")
      .select("id")
      .or(`legacy_city_guide_id.eq.${input.legacyGuideId},legacy_hommie_id.eq.${input.legacyGuideId}`)
      .maybeSingle();
    resolvedHommieId = typeof hommieRow?.id === "string" ? hommieRow.id : null;
  }

  const recipientType = input.bookingType === "host_stay" ? "host" : "hommie";
  const recipientId = input.bookingType === "host_stay" ? resolvedHostId : resolvedHommieId;
  const productType = input.activityId
    ? "activity"
    : input.bookingType === "host_stay"
      ? "host_listing"
      : "hommie_listing";
  const productId = input.activityId ?? (input.bookingType === "host_stay" ? resolvedHostId : resolvedHommieId);

  if (!recipientId || !productId) {
    throw new Error("This home is not linked to an active host profile in the new booking system yet.");
  }

  const v2Status = input.bookingType === "host_stay" ? "awaiting_payment" : "pending";

  const bookingPayload: JsonRecord = {
    user_id: input.userId,
    booking_type: input.bookingType,
    recipient_type: recipientType,
    recipient_id: recipientId,
    product_type: productType,
    product_id: productId,
    host_id: resolvedHostId,
    hommie_id: resolvedHommieId,
    activity_id: input.activityId ?? null,
    status: v2Status,
    hold_expires_at: input.bookingType === "host_stay" ? computeHoldExpiry() : null,
    start_date: input.startDate,
    end_date: input.endDate ?? input.startDate,
    quarter_type: input.quarterType ?? null,
    quarter_time: input.quarterTime ?? null,
    guests_count: Math.max(1, input.guestsCount),
    notes: input.notes ?? input.vibe ?? null,
    pricing_snapshot: quote.pricingSnapshot,
    total_price: quote.totalPrice,
    partner_payout_amount: quote.partnerPayoutAmount,
    payment_status: input.bookingType === "host_stay" ? "pending" : "not_required",
    cancellation_policy_code: "famlo_flexible_24h",
  };
  if (resolvedStayUnitId) {
    bookingPayload.stay_unit_id = resolvedStayUnitId;
  }

  let v2Result;
  try {
    v2Result = await supabase.from("bookings_v2").insert(bookingPayload).select("id").single();
  } catch (error) {
    if (!isMissingColumnError(error, "stay_unit_id") || !("stay_unit_id" in bookingPayload)) {
      throw error;
    }
    const { stay_unit_id: _ignored, ...fallbackPayload } = bookingPayload;
    v2Result = await supabase.from("bookings_v2").insert(fallbackPayload).select("id").single();
  }

  if (v2Result?.error && isMissingColumnError(v2Result.error, "stay_unit_id") && "stay_unit_id" in bookingPayload) {
    const { stay_unit_id: _ignored, ...fallbackPayload } = bookingPayload;
    v2Result = await supabase.from("bookings_v2").insert(fallbackPayload).select("id").single();
  }

  const { data: v2Booking, error: v2Error } = v2Result;

  if (v2Error || !v2Booking) {
    throw v2Error ?? new Error("Could not create booking in v2.");
  }

  let legacyBookingId: string | null = null;
  const legacyInsert =
    shouldMirrorLegacyBooking(input)
      ? await supabase
          .from("bookings")
          .insert({
            user_id: input.userId,
            family_id: input.legacyFamilyId ?? null,
            guide_id: input.legacyGuideId ?? null,
            quarter_type: input.quarterType ?? null,
            quarter_time: input.quarterTime ?? null,
            date_from: input.startDate,
            date_to: input.endDate ?? input.startDate,
            guests_count: Math.max(1, input.guestsCount),
            total_price: quote.totalPrice,
            family_payout: quote.partnerPayoutAmount,
            base_price: quote.subtotal,
            platform_fee: quote.platformFee,
            gst_amount: quote.taxAmount,
            status: inferLegacyStatus(v2Status),
            vibe: input.vibe ?? null,
          })
          .select("id")
          .single()
      : { data: null, error: null };

  if (legacyInsert.error) {
    throw legacyInsert.error;
  }

  legacyBookingId =
    legacyInsert.data && typeof (legacyInsert.data as JsonRecord).id === "string"
      ? String((legacyInsert.data as JsonRecord).id)
      : null;

  const { error: bookingPatchError } = await supabase
    .from("bookings_v2")
    .update({ legacy_booking_id: legacyBookingId } as never)
    .eq("id", v2Booking.id);

  if (bookingPatchError) {
    console.error("Failed to patch legacy booking id onto bookings_v2", bookingPatchError);
  }

  const receiverId = input.bookingType === "host_stay" ? resolvedHostUserId : input.guideUserId;
  const conversationHostProfileId = input.bookingType === "host_stay" ? recipientId : receiverId ?? recipientId;
  const conversationHostUserId = input.bookingType === "host_stay" ? resolvedHostUserId ?? receiverId ?? null : receiverId ?? null;
  let conversationRow: { id: string } | null = null;

  if (legacyBookingId) {
    const { data: existingConversation } = await supabase
      .from("conversations")
      .select("id")
      .eq("booking_id", legacyBookingId)
      .maybeSingle();

    if (existingConversation?.id) {
      conversationRow = { id: existingConversation.id };
      console.info("[booking.create] conversation:found_by_legacy_booking", {
        bookingId: v2Booking.id,
        legacyBookingId,
        conversationId: existingConversation.id,
      });
    }
  }

  if (!conversationRow && input.bookingType === "host_stay" && input.legacyFamilyId && resolvedHostUserId) {
    const { data: existingConversation } = await supabase
      .from("conversations")
      .select("id")
      .eq("guest_id", input.userId)
      .eq("family_id", input.legacyFamilyId)
      .eq("host_user_id", resolvedHostUserId)
      .order("last_message_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingConversation?.id) {
      conversationRow = { id: existingConversation.id };
      console.info("[booking.create] conversation:found_by_participants", {
        bookingId: v2Booking.id,
        legacyBookingId,
        conversationId: existingConversation.id,
      });
    }
  }

  let conversationError: Error | null = null;
  if (!conversationRow) {
    const insertResult = await supabase
      .from("conversations")
      .insert({
        booking_id: legacyBookingId,
        guest_id: input.userId,
        family_id: input.legacyFamilyId ?? null,
        host_id: conversationHostProfileId,
        host_user_id: conversationHostUserId,
        guest_unread: 0,
        host_unread: 1,
        last_message:
          input.bookingType === "host_stay"
            ? `Booking request for ${input.listingName ?? "Famlo stay"}`
            : `Booking request for ${input.quarterTime ?? "Famlo help"}`,
        last_message_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    conversationRow = insertResult.data;
    conversationError = insertResult.error;
    if (insertResult.data?.id) {
      console.info("[booking.create] conversation:created", {
        bookingId: v2Booking.id,
        legacyBookingId,
        conversationId: insertResult.data.id,
      });
    }
  }

  if (conversationError) {
    console.error("Conversation insert warning", conversationError);
  }

  if (conversationRow?.id) {
    const conversationPatch: JsonRecord = {
      booking_id: legacyBookingId,
      guest_id: input.userId,
      family_id: input.legacyFamilyId ?? null,
      host_id: conversationHostProfileId,
      host_user_id: conversationHostUserId,
    };

    const { error: conversationPatchError } = await supabase
      .from("conversations")
      .update(conversationPatch as never)
      .eq("id", conversationRow.id);

    if (conversationPatchError) {
      console.error("Conversation patch warning", conversationPatchError);
    }

    await supabase
      .from("bookings_v2")
      .update({ conversation_id: conversationRow.id } as never)
      .eq("id", v2Booking.id);

    if (legacyBookingId && SHOULD_MIRROR_LEGACY_BOOKINGS) {
      await supabase
        .from("bookings")
        .update({ conversation_id: conversationRow.id } as never)
        .eq("id", legacyBookingId);
    }

    const messageRows = [
      {
        conversation_id: conversationRow.id,
        booking_id: legacyBookingId,
        sender_id: input.userId,
        receiver_id: resolvedHostUserId ?? receiverId ?? null,
        sender_type: "guest",
        text:
          input.bookingType === "host_stay"
            ? `Booking request for ${input.listingName ?? "Famlo stay"} on ${input.startDate}${input.guestCity ? ` · from ${input.guestCity}` : ""}.`
            : `Booking request for ${input.quarterTime ?? "Famlo help"} on ${input.startDate}${input.guestCity ? ` · from ${input.guestCity}` : ""}.`,
      },
    ];

    if (input.welcomeMessage) {
      messageRows.push({
        conversation_id: conversationRow.id,
        booking_id: legacyBookingId,
        sender_id: resolvedHostUserId ?? receiverId ?? recipientId,
        receiver_id: input.userId,
        sender_type: "host",
        text: input.welcomeMessage,
      });
    }

    const { error: messageError } = await supabase.from("messages").insert(messageRows);
    if (messageError) {
      console.error("Message insert warning", messageError);
    } else {
      console.info("[booking.create] messages:inserted", {
        bookingId: v2Booking.id,
        legacyBookingId,
        conversationId: conversationRow.id,
        insertedCount: messageRows.length,
        includesWelcomeMessage: Boolean(input.welcomeMessage),
      });
    }
  }

  let paymentId: string | null = null;
  if (input.bookingType === "host_stay") {
    const { data: payment, error: paymentError } = await supabase
      .from("payments_v2")
      .insert({
        booking_id: v2Booking.id,
        gateway: "pending_gateway",
        amount_total: quote.totalPrice,
        platform_fee: quote.platformFee,
        tax_amount: quote.taxAmount,
        partner_payout_amount: quote.partnerPayoutAmount,
        status: "created",
        raw_response: {
          coupon_code: quote.appliedCoupon?.code ?? null,
        },
      })
      .select("id,status")
      .single();

    if (paymentError) {
      throw paymentError;
    }

    paymentId = payment.id;

    await supabase
      .from("bookings_v2")
      .update({ payment_id: payment.id } as never)
      .eq("id", v2Booking.id);
  }

  if (quote.appliedCoupon) {
    await supabase.from("coupon_redemptions_v2").insert({
      coupon_id: quote.appliedCoupon.id,
      booking_id: v2Booking.id,
      user_id: input.userId,
      discount_amount: quote.discountAmount,
    });
  }

  console.info("[booking.create] success", {
    bookingId: v2Booking.id,
    legacyBookingId,
    conversationId: conversationRow?.id ?? null,
    paymentId,
  });

  return {
    bookingId: v2Booking.id,
    legacyBookingId,
    conversationId:
      conversationRow && typeof (conversationRow as JsonRecord).id === "string"
        ? String((conversationRow as JsonRecord).id)
        : null,
    paymentId,
    paymentStatus: input.bookingType === "host_stay" ? "created" : "not_required",
    totalPrice: quote.totalPrice,
    partnerPayoutAmount: quote.partnerPayoutAmount,
    pricingSnapshot: quote.pricingSnapshot,
  };
}

export async function updateHostBookingStatusCompatibility(
  supabase: SupabaseClient,
  params: {
    bookingId: string;
    familyId?: string | null;
    hostId?: string | null;
    status: string;
  }
): Promise<JsonRecord | null> {
  const { bookingId, familyId, hostId, status } = params;
  const now = new Date().toISOString();

  const { data: v2Booking } = await supabase
    .from("bookings_v2")
    .select("id,legacy_booking_id,host_id,conversation_id,user_id")
    .or(`id.eq.${bookingId},legacy_booking_id.eq.${bookingId}`)
    .maybeSingle();

  if (v2Booking) {
    if (hostId && String(v2Booking.host_id ?? "") !== hostId) {
      throw new Error("Booking not found for this listing.");
    }

    const { data: updated, error } = await supabase
      .from("bookings_v2")
      .update({ status, updated_at: now } as never)
      .eq("id", v2Booking.id)
      .select("id,status,updated_at")
      .maybeSingle();

    if (error) throw error;

    return (updated as JsonRecord | null) ?? null;
  }

  if (!SHOULD_MIRROR_LEGACY_BOOKINGS) {
    throw new Error("Legacy booking mirror is disabled and this booking is not available in v2.");
  }

  const { data: updated, error } = await supabase
    .from("bookings")
    .update({ status: inferLegacyStatus(status), updated_at: now } as never)
    .eq("id", bookingId)
    .eq("family_id", familyId ?? "")
    .select("id,status,updated_at")
    .maybeSingle();

  if (error) throw error;
  return (updated as JsonRecord | null) ?? null;
}
