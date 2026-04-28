import type { SupabaseClient } from "@supabase/supabase-js";

import { addIndiaDays, getTodayInIndia } from "@/lib/booking-time";
import { createCalendarConflict, loadCanonicalCalendar, logCalendarSync, parseIcs, upsertCalendarEvent, toCalendarEventUid, type CanonicalCalendarEvent } from "@/lib/calendar";
import { renderBookingReceipt, renderCompliancePack, renderEmailTemplate, renderPayoutStatement } from "@/lib/document-templates";
import { escapeHtml, enumerateDateRange, asNumber, asString, type JsonRecord } from "@/lib/platform-utils";
import { sendEmail } from "@/lib/resend";

const HOLD_TTL_MINUTES = Number(process.env.FAMLO_HOLD_TTL_MINUTES ?? "20");

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

export function computeHoldExpiry(now = new Date()): string {
  return new Date(now.getTime() + HOLD_TTL_MINUTES * 60_000).toISOString();
}

export async function syncImportedCalendar(
  supabase: SupabaseClient,
  input: {
    ownerType: string;
    ownerId: string;
    provider: string;
    sourceLabel: string;
    externalUrl?: string | null;
    icsContent: string;
  }
): Promise<{ applied: number; conflicts: number; syncLogId: string | null }> {
  const connectionPayload = {
    owner_type: input.ownerType,
    owner_id: input.ownerId,
    provider: input.provider,
    source_label: input.sourceLabel,
    external_url: input.externalUrl ?? null,
    import_mode: "pull",
    export_enabled: true,
    updated_at: new Date().toISOString(),
  };

  const { data: connection, error: connectionError } = await supabase
    .from("calendar_connections")
    .upsert(connectionPayload, { onConflict: "owner_type,owner_id,provider,source_label" })
    .select("id")
    .single();
  if (connectionError) throw connectionError;

  const connectionId = asString(connection?.id);
  const imported = parseIcs(input.icsContent);
  const existing = await loadCanonicalCalendar(supabase, {
    ownerType: input.ownerType,
    ownerId: input.ownerId,
    from: imported.reduce((min, event) => (event.startDate < min ? event.startDate : min), imported[0]?.startDate ?? getTodayInIndia()),
    to: imported.reduce((max, event) => (event.endDate > max ? event.endDate : max), imported[0]?.endDate ?? addIndiaDays(getTodayInIndia(), 365)),
  });

  let applied = 0;
  let conflicts = 0;
  for (const event of imported) {
    const candidate: CanonicalCalendarEvent = {
      eventUid: event.uid,
      ownerType: input.ownerType,
      ownerId: input.ownerId,
      title: event.summary,
      startDate: event.startDate,
      endDate: event.endDate,
      status: "confirmed",
      sourceType: "external_import",
      sourceReference: input.sourceLabel,
      isBlocking: true,
      connectionId,
      payload: {
        provider: input.provider,
        source_label: input.sourceLabel,
      },
    };

    const overlappingBooking = existing.find((stored) => stored.sourceType !== "external_import" && stored.isBlocking && stored.status !== "cancelled" && eventRangesOverlap(stored, candidate));
    if (overlappingBooking) {
      conflicts += 1;
      await createCalendarConflict(supabase, {
        ownerType: input.ownerType,
        ownerId: input.ownerId,
        bookingId: overlappingBooking.bookingId ?? null,
        conflictType: "external_calendar_overlap",
        summary: `Imported ${input.provider} event overlaps an existing Famlo booking/hold.`,
        details: {
          imported_event: candidate,
          existing_event: overlappingBooking,
        },
      });
      continue;
    }

    await upsertCalendarEvent(supabase, candidate);
    applied += 1;
  }

  const syncLogId = await logCalendarSync(supabase, {
    connectionId,
    ownerType: input.ownerType,
    ownerId: input.ownerId,
    provider: input.provider,
    direction: "import",
    status: conflicts > 0 ? "partial" : "success",
    eventsSeen: imported.length,
    eventsApplied: applied,
    conflictsFound: conflicts,
    message: conflicts > 0 ? "Imported with conflicts recorded." : "Import completed successfully.",
    payload: {
      source_label: input.sourceLabel,
    },
  });

  await supabase
    .from("calendar_connections")
    .update({
      last_synced_at: new Date().toISOString(),
      last_sync_status: conflicts > 0 ? "partial" : "success",
      updated_at: new Date().toISOString(),
    } as never)
    .eq("id", connectionId ?? "");

  return { applied, conflicts, syncLogId };
}

function eventRangesOverlap(left: CanonicalCalendarEvent, right: CanonicalCalendarEvent): boolean {
  const leftDates = new Set(enumerateDateRange(left.startDate, left.endDate));
  return enumerateDateRange(right.startDate, right.endDate).some((date) => {
    if (!leftDates.has(date)) return false;
    if (!left.slotKey || !right.slotKey) return true;
    return left.slotKey === right.slotKey;
  });
}

export async function expireBookingHolds(supabase: SupabaseClient): Promise<{ expiredCount: number }> {
  const now = new Date().toISOString();
  let rowsResult;
  try {
    rowsResult = await supabase
      .from("bookings_v2")
      .select("id,host_id,stay_unit_id,start_date,end_date,quarter_type")
      .eq("status", "awaiting_payment")
      .not("hold_expires_at", "is", null)
      .lte("hold_expires_at", now);
  } catch (error) {
    if (!isMissingColumnError(error, "stay_unit_id")) {
      throw error;
    }
    rowsResult = await supabase
      .from("bookings_v2")
      .select("id,host_id,start_date,end_date,quarter_type")
      .eq("status", "awaiting_payment")
      .not("hold_expires_at", "is", null)
      .lte("hold_expires_at", now);
  }

  if (rowsResult?.error && isMissingColumnError(rowsResult.error, "stay_unit_id")) {
    rowsResult = await supabase
      .from("bookings_v2")
      .select("id,host_id,start_date,end_date,quarter_type")
      .eq("status", "awaiting_payment")
      .not("hold_expires_at", "is", null)
      .lte("hold_expires_at", now);
  }

  if (rowsResult.error) throw rowsResult.error;
  const { data: rows } = rowsResult;

  let expiredCount = 0;
  for (const row of rows ?? []) {
    const bookingId = asString((row as JsonRecord).id);
    if (!bookingId) continue;
    const { error: updateError } = await supabase
      .from("bookings_v2")
      .update({
        status: "cancelled",
        payment_status: "expired",
        cancelled_at: now,
        cancellation_reason: "hold_expired",
        updated_at: now,
      } as never)
      .eq("id", bookingId);
    if (updateError) throw updateError;

    await supabase.from("booking_status_history_v2").insert({
      booking_id: bookingId,
      old_status: "awaiting_payment",
      new_status: "cancelled",
      changed_by_user_id: null,
      reason: "hold_expired",
      created_at: now,
    } as never);

    const hostId = asString((row as JsonRecord).host_id);
    if (hostId) {
      await upsertCalendarEvent(supabase, {
        eventUid: toCalendarEventUid("booking_hold", bookingId, asString((row as JsonRecord).start_date) ?? getTodayInIndia(), asString((row as JsonRecord).quarter_type)),
        ownerType: "host",
        ownerId: hostId,
        bookingId,
        title: "Expired Famlo booking hold",
        startDate: asString((row as JsonRecord).start_date) ?? getTodayInIndia(),
        endDate: asString((row as JsonRecord).end_date) ?? asString((row as JsonRecord).start_date) ?? getTodayInIndia(),
        slotKey: asString((row as JsonRecord).quarter_type),
        status: "released",
        sourceType: "booking_hold",
        sourceReference: bookingId,
        isBlocking: false,
        payload: {
          reason: "hold_expired",
        },
      });
    }

    const stayUnitId = asString((row as JsonRecord).stay_unit_id);
    if (stayUnitId) {
      await upsertCalendarEvent(supabase, {
        eventUid: toCalendarEventUid("booking_hold", bookingId, asString((row as JsonRecord).start_date) ?? getTodayInIndia(), asString((row as JsonRecord).quarter_type)),
        ownerType: "stay_unit",
        ownerId: stayUnitId,
        bookingId,
        title: "Expired Famlo booking hold",
        startDate: asString((row as JsonRecord).start_date) ?? getTodayInIndia(),
        endDate: asString((row as JsonRecord).end_date) ?? asString((row as JsonRecord).start_date) ?? getTodayInIndia(),
        slotKey: asString((row as JsonRecord).quarter_type),
        status: "released",
        sourceType: "booking_hold",
        sourceReference: bookingId,
        isBlocking: false,
        payload: {
          reason: "hold_expired",
        },
      });
    }

    await enqueueNotification(supabase, {
      eventType: "booking_hold_expired",
      channel: "email",
      bookingId,
      dedupeKey: `booking_hold_expired:${bookingId}`,
      payload: { booking_id: bookingId },
    });
    expiredCount += 1;
  }

  return { expiredCount };
}

export async function resolveSeasonalPrice(
  supabase: SupabaseClient,
  input: {
    ownerType: string;
    ownerId: string;
    date: string;
    slotKey?: string | null;
    basePrice: number;
  }
): Promise<{
    finalPrice: number;
    appliedRules: Array<{ code: string; name: string; adjustmentType: string; adjustmentValue: number }>;
  }> {
  const weekday = new Date(`${input.date}T00:00:00`).getDay();
  const { data, error } = await supabase
    .from("seasonal_pricing_rules")
    .select("*")
    .eq("owner_type", input.ownerType)
    .eq("owner_id", input.ownerId)
    .eq("status", "active")
    .order("priority", { ascending: true });
  if (error) throw error;

  let price = Math.max(0, Math.round(input.basePrice));
  const appliedRules: Array<{ code: string; name: string; adjustmentType: string; adjustmentValue: number }> = [];

  for (const row of (data ?? []) as JsonRecord[]) {
    const startsOn = asString(row.starts_on);
    const endsOn = asString(row.ends_on);
    const weekdays = Array.isArray(row.weekdays) ? row.weekdays.map((value) => asNumber(value)) : [];
    const slotKey = asString(row.slot_key);
    if (startsOn && input.date < startsOn) continue;
    if (endsOn && input.date > endsOn) continue;
    if (weekdays.length > 0 && !weekdays.includes(weekday)) continue;
    if (slotKey && slotKey !== input.slotKey) continue;

    const adjustmentType = asString(row.adjustment_type) ?? "percentage";
    const adjustmentValue = asNumber(row.adjustment_value);
    if (adjustmentType === "percentage") {
      price = Math.round(price + (price * adjustmentValue) / 100);
    } else if (adjustmentType === "fixed_delta") {
      price = price + adjustmentValue;
    } else if (adjustmentType === "override") {
      price = adjustmentValue;
    }
    const minPrice = asNumber(row.min_price, 0);
    price = Math.max(minPrice, price);
    appliedRules.push({
      code: asString(row.code) ?? "unknown_rule",
      name: asString(row.name) ?? "Seasonal pricing rule",
      adjustmentType,
      adjustmentValue,
    });
  }

  return {
    finalPrice: Math.max(0, Math.round(price)),
    appliedRules,
  };
}

export async function enforceInventoryRules(
  supabase: SupabaseClient,
  input: {
    ownerType: string;
    ownerId: string;
    startDate: string;
    endDate: string;
  }
): Promise<void> {
  const { data, error } = await supabase
    .from("inventory_rules_v2")
    .select("*")
    .eq("owner_type", input.ownerType)
    .eq("owner_id", input.ownerId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return;

  const today = getTodayInIndia();
  const start = new Date(`${input.startDate}T00:00:00+05:30`);
  const now = new Date();
  const hoursUntilStart = Math.round((start.getTime() - now.getTime()) / 36_00_000);
  const stayLength = enumerateDateRange(input.startDate, input.endDate).length;
  const bookingWindowCutoff = addIndiaDays(today, asNumber((data as JsonRecord).booking_window_days, 365));

  if (input.startDate > bookingWindowCutoff) {
    throw new Error("This stay is outside the current booking window.");
  }
  if (hoursUntilStart < asNumber((data as JsonRecord).lead_time_hours, 0)) {
    throw new Error("This booking violates the minimum lead time configured by the host.");
  }
  if (stayLength < asNumber((data as JsonRecord).min_stay_days, 1)) {
    throw new Error(`This listing requires at least ${asNumber((data as JsonRecord).min_stay_days, 1)} day(s).`);
  }
  if (stayLength > asNumber((data as JsonRecord).max_stay_days, 30)) {
    throw new Error(`This listing allows up to ${asNumber((data as JsonRecord).max_stay_days, 30)} day(s) in one booking.`);
  }
}

export async function resolveCancellationQuote(
  supabase: SupabaseClient,
  bookingId: string
): Promise<{
  policyCode: string | null;
  refundableAmount: number;
  penaltyAmount: number;
  bookingAmount: number;
  penaltyPercent: number;
  refundRule: string;
}> {
  const { data: booking, error: bookingError } = await supabase
    .from("bookings_v2")
    .select("id,total_price,start_date,created_at,payment_status,host_id,cancellation_policy_code")
    .eq("id", bookingId)
    .maybeSingle();
  if (bookingError) throw bookingError;
  if (!booking) throw new Error("Booking not found.");

  const policyCode = asString((booking as JsonRecord).cancellation_policy_code) ?? "famlo_flexible_24h";
  const bookingAmount = asNumber((booking as JsonRecord).total_price);
  const checkIn = new Date(`${asString((booking as JsonRecord).start_date) ?? getTodayInIndia()}T00:00:00+05:30`);
  const createdAt = new Date(asString((booking as JsonRecord).created_at) ?? new Date().toISOString());
  const checkInTime = Number.isNaN(checkIn.getTime()) ? Date.now() : checkIn.getTime();
  const createdAtTime = Number.isNaN(createdAt.getTime()) ? Date.now() : createdAt.getTime();
  const hoursToCheckIn = Math.round((checkInTime - Date.now()) / 36_00_000);
  const hoursSinceBooking = Math.max(0, Math.round((Date.now() - createdAtTime) / 36_00_000));
  const paid = asString((booking as JsonRecord).payment_status) === "paid";
  const withinFreeWindow = hoursSinceBooking <= 24;
  const penaltyPercent = withinFreeWindow ? 0 : hoursToCheckIn <= 24 ? 20 : 10;
  const penaltyAmount = Math.round((bookingAmount * penaltyPercent) / 100);
  const refundableAmount = paid ? Math.max(0, Math.min(bookingAmount, bookingAmount - penaltyAmount)) : 0;
  const refundRule = withinFreeWindow
    ? "Free cancellation within 24 hours of booking."
    : hoursToCheckIn <= 24
      ? "20% service and owner preparation penalty because cancellation is within 24 hours of check-in."
      : "10% penalty because cancellation is after 24 hours of booking.";

  return {
    policyCode,
    refundableAmount,
    penaltyAmount,
    bookingAmount,
    penaltyPercent,
    refundRule,
  };
}

export async function createBookingModification(
  supabase: SupabaseClient,
  input: {
    bookingId: string;
    requestedByUserId?: string | null;
    oldSnapshot: JsonRecord;
    requestedSnapshot: JsonRecord;
    financialDelta: JsonRecord;
    reason?: string | null;
  }
): Promise<string | null> {
  const { data, error } = await supabase
    .from("booking_modifications_v2")
    .insert({
      booking_id: input.bookingId,
      requested_by_user_id: input.requestedByUserId ?? null,
      old_snapshot: input.oldSnapshot,
      requested_snapshot: input.requestedSnapshot,
      financial_delta: input.financialDelta,
      reason: input.reason ?? null,
    })
    .select("id")
    .single();
  if (error) throw error;
  return asString(data?.id);
}

export async function enqueueNotification(
  supabase: SupabaseClient,
  input: {
    eventType: string;
    channel: string;
    userId?: string | null;
    bookingId?: string | null;
    payoutId?: string | null;
    dedupeKey?: string | null;
    subject?: string | null;
    payload?: JsonRecord;
    scheduledFor?: string | null;
  }
): Promise<void> {
  const { error } = await supabase.from("notification_queue").insert({
    event_type: input.eventType,
    channel: input.channel,
    user_id: input.userId ?? null,
    booking_id: input.bookingId ?? null,
    payout_id: input.payoutId ?? null,
    dedupe_key: input.dedupeKey ?? null,
    subject: input.subject ?? null,
    payload: input.payload ?? {},
    scheduled_for: input.scheduledFor ?? new Date().toISOString(),
  });
  if (!error) {
    console.info("[notifications] enqueue:success", {
      eventType: input.eventType,
      channel: input.channel,
      userId: input.userId ?? null,
      bookingId: input.bookingId ?? null,
      payoutId: input.payoutId ?? null,
      dedupeKey: input.dedupeKey ?? null,
    });
  }
  if (error && !String(error.message).includes("notification_queue_dedupe_idx")) throw error;
  if (error && String(error.message).includes("notification_queue_dedupe_idx")) {
    console.info("[notifications] enqueue:deduped", {
      eventType: input.eventType,
      dedupeKey: input.dedupeKey ?? null,
    });
  }
}

export async function processNotificationQueue(supabase: SupabaseClient): Promise<{ processed: number; failed: number }> {
  const now = new Date().toISOString();
  const { data: rows, error } = await supabase
    .from("notification_queue")
    .select("id,event_type,channel,user_id,booking_id,payout_id,subject,payload")
    .eq("status", "pending")
    .lte("scheduled_for", now)
    .order("scheduled_for", { ascending: true })
    .limit(50);
  if (error) throw error;

  let processed = 0;
  let failed = 0;

  for (const row of (rows ?? []) as JsonRecord[]) {
    const id = asString(row.id);
    if (!id) continue;
    try {
      const payload = (row.payload as JsonRecord | null) ?? {};
      let emailTo = asString(payload.to);
      if (!emailTo && asString(row.user_id)) {
        const { data: user } = await supabase.from("users").select("email").eq("id", asString(row.user_id) ?? "").maybeSingle();
        emailTo = asString((user as JsonRecord | null)?.email);
      }
      if (asString(row.channel) === "email" && emailTo) {
        await sendEmail({
          to: emailTo,
          subject: asString(row.subject) ?? `Famlo update: ${asString(row.event_type) ?? "notification"}`,
          html: renderEmailTemplate({
            eyebrow: "Famlo Update",
            title: asString(row.subject) ?? "Famlo Notification",
            message: asString(payload.message) ?? "A Famlo event requires your attention.",
            ctaLabel: asString(payload.cta_label) ?? undefined,
            ctaUrl: asString(payload.cta_url) ?? undefined,
          }),
        });
      }
      await supabase.from("notification_queue").update({ status: "processed", processed_at: now } as never).eq("id", id);
      processed += 1;
    } catch (notificationError) {
      await supabase
        .from("notification_queue")
        .update({
          status: "failed",
          processed_at: now,
          error_message: notificationError instanceof Error ? notificationError.message : "Unknown notification error",
        } as never)
        .eq("id", id);
      failed += 1;
    }
  }

  return { processed, failed };
}

export async function buildBookingReceiptDocument(
  supabase: SupabaseClient,
  bookingId: string
): Promise<{ title: string; html: string; payload: JsonRecord }> {
  const { data: booking, error: bookingError } = await supabase
    .from("bookings_v2")
    .select("id,booking_type,start_date,end_date,quarter_type,guests_count,total_price,payment_status,pricing_snapshot,user_id,host_id,hommie_id,users!user_id(name,email),hosts!host_id(id,display_name,city,state,legacy_family_id),hommie_profiles_v2!hommie_id(display_name,city,state)")
    .eq("id", bookingId)
    .maybeSingle();
  if (bookingError) throw bookingError;
  if (!booking) throw new Error("Booking not found.");

  const user = Array.isArray((booking as any).users) ? (booking as any).users[0] : (booking as any).users;
  const host = Array.isArray((booking as any).hosts) ? (booking as any).hosts[0] : (booking as any).hosts;
  const hommie = Array.isArray((booking as any).hommie_profiles_v2) ? (booking as any).hommie_profiles_v2[0] : (booking as any).hommie_profiles_v2;
  const partner = host ?? hommie;
  const hostLegacyFamilyId = asString((host as JsonRecord | null)?.legacy_family_id);

  const [familyResult, paymentResult] = await Promise.all([
    hostLegacyFamilyId
      ? supabase.from("families").select("id,name,property_name,city,state").eq("id", hostLegacyFamilyId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase
      .from("payments_v2")
      .select("status,gateway,payment_method,created_at")
      .eq("booking_id", bookingId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (familyResult.error) throw familyResult.error;
  if (paymentResult.error) throw paymentResult.error;

  const family = familyResult.data as JsonRecord | null;
  const payment = paymentResult.data as JsonRecord | null;
  const propertyName = asString(family?.property_name) ?? asString(family?.name) ?? asString(partner?.display_name) ?? "Famlo Stay";
  const propertyLocation = [asString(family?.city) ?? asString(partner?.city), asString(family?.state) ?? asString(partner?.state)]
    .filter(Boolean)
    .join(", ");

  const payload: JsonRecord = {
    booking_id: asString((booking as JsonRecord).id),
    receipt_number: `FR-${asString((booking as JsonRecord).id)?.slice(0, 8).toUpperCase()}`,
    issued_at: new Date().toISOString(),
    booking_type: asString((booking as JsonRecord).booking_type),
    guest_name: asString(user?.name),
    guest_email: asString(user?.email),
    partner_name: asString(partner?.display_name),
    host_name: asString(partner?.display_name),
    property_name: propertyName,
    property_location: propertyLocation,
    stay_window: `${asString((booking as JsonRecord).start_date)} to ${asString((booking as JsonRecord).end_date)}`,
    check_in_date: asString((booking as JsonRecord).start_date),
    check_out_date: asString((booking as JsonRecord).end_date),
    guests_count: asNumber((booking as JsonRecord).guests_count, 1),
    slot_key: asString((booking as JsonRecord).quarter_type),
    total_price: asNumber((booking as JsonRecord).total_price),
    payment_status: asString(payment?.status) ?? asString((booking as JsonRecord).payment_status),
    payment_method: asString(payment?.payment_method) ?? asString(payment?.gateway) ?? "Online",
    transaction_date: asString(payment?.created_at),
    support_details: "Email support@famlo.in or use the Famlo app chat for immediate help.",
    cancellation_policy: "Refer to the Famlo cancellation policy attached to your booking. Refunds depend on booking timing and host policy.",
    pricing_snapshot: ((booking as JsonRecord).pricing_snapshot as JsonRecord | null) ?? {},
  };

  return {
    title: "Famlo Booking Receipt",
    html: renderBookingReceipt(payload),
    payload,
  };
}

export async function buildPayoutStatementDocument(
  supabase: SupabaseClient,
  payoutId: string
): Promise<{ title: string; html: string; payload: JsonRecord }> {
  const { data: payout, error } = await supabase
    .from("payouts_v2")
    .select("id,booking_id,partner_type,partner_user_id,amount,status,gross_booking_value,platform_fee,platform_fee_tax,gateway_fee_burden_amount,withholding_amount,hold_reason,created_at,paid_at")
    .eq("id", payoutId)
    .maybeSingle();
  if (error) throw error;
  if (!payout) throw new Error("Payout not found.");

  const bookingId = asString((payout as JsonRecord).booking_id);
  const [bookingResult, hostResult] = await Promise.all([
    bookingId
      ? supabase
          .from("bookings_v2")
          .select("id,host_id")
          .eq("id", bookingId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    asString((payout as JsonRecord).partner_user_id)
      ? supabase.from("hosts").select("display_name,legacy_family_id").eq("user_id", asString((payout as JsonRecord).partner_user_id) ?? "").maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (bookingResult.error) throw bookingResult.error;
  if (hostResult.error) throw hostResult.error;

  const booking = bookingResult.data as JsonRecord | null;
  const host = hostResult.data as JsonRecord | null;
  const familyId = asString(host?.legacy_family_id);
  const familyResult = familyId
    ? await supabase.from("families").select("property_name,name").eq("id", familyId).maybeSingle()
    : { data: null, error: null };

  if (familyResult.error) throw familyResult.error;

  const family = familyResult.data as JsonRecord | null;

  const payload: JsonRecord = {
    payout_id: asString((payout as JsonRecord).id),
    booking_id: bookingId,
    partner_type: asString((payout as JsonRecord).partner_type),
    amount: asNumber((payout as JsonRecord).amount),
    status: asString((payout as JsonRecord).status),
    gross_booking_value: asNumber((payout as JsonRecord).gross_booking_value),
    platform_fee: asNumber((payout as JsonRecord).platform_fee),
    platform_fee_tax: asNumber((payout as JsonRecord).platform_fee_tax),
    gateway_fee_burden_amount: asNumber((payout as JsonRecord).gateway_fee_burden_amount),
    withholding_amount: asNumber((payout as JsonRecord).withholding_amount),
    hold_reason: asString((payout as JsonRecord).hold_reason),
    host_name: asString(host?.display_name),
    property_name: asString(family?.property_name) ?? asString(family?.name),
    payout_date: asString((payout as JsonRecord).paid_at) ?? asString((payout as JsonRecord).created_at),
    host_id: asString(booking?.host_id),
  };

  return {
    title: "Famlo Payout Statement",
    html: renderPayoutStatement(payload),
    payload,
  };
}

export async function buildAnnualCompliancePack(
  supabase: SupabaseClient,
  input: {
    hostUserId: string;
    year: number;
  }
): Promise<{ title: string; html: string; payload: JsonRecord }> {
  const start = `${input.year}-01-01`;
  const end = `${input.year}-12-31`;
  const { data: host } = await supabase.from("hosts").select("id,display_name").eq("user_id", input.hostUserId).maybeSingle();
  const hostId = asString((host as JsonRecord | null)?.id);

  const [bookingsRes, payoutsRes] = await Promise.all([
    hostId
      ? supabase
          .from("bookings_v2")
          .select("id,total_price")
          .eq("host_id", hostId)
          .gte("start_date", start)
          .lte("start_date", end)
      : Promise.resolve({ data: [], error: null }),
    hostId
      ? supabase
          .from("payouts_v2")
          .select("amount,platform_fee_tax,gross_booking_value,status")
          .eq("partner_user_id", input.hostUserId)
          .gte("created_at", `${start}T00:00:00`)
          .lte("created_at", `${end}T23:59:59`)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (bookingsRes.error) throw bookingsRes.error;
  if (payoutsRes.error) throw payoutsRes.error;

  const payload: JsonRecord = {
    year: String(input.year),
    host_name: asString((host as JsonRecord | null)?.display_name) ?? "Famlo Host",
    booking_count: bookingsRes.data?.length ?? 0,
    gross_revenue: (bookingsRes.data ?? []).reduce((sum, row: any) => sum + asNumber(row.total_price), 0),
    net_payout: (payoutsRes.data ?? []).reduce((sum, row: any) => sum + asNumber(row.amount), 0),
    tax_liability: (payoutsRes.data ?? []).reduce((sum, row: any) => sum + asNumber(row.platform_fee_tax), 0),
    sections: [
      { label: "Bookings Summary", value: `${bookingsRes.data?.length ?? 0} bookings were attributed to this host in ${input.year}.` },
      { label: "Payout Summary", value: `${(payoutsRes.data ?? []).filter((row: any) => row.status === "paid").length} payouts were completed in the selected year.` },
      { label: "Tax Summary", value: `Platform-fee tax liability captured for this host: INR ${(payoutsRes.data ?? []).reduce((sum: number, row: any) => sum + asNumber(row.platform_fee_tax), 0)}.` },
    ],
  };

  return {
    title: `Famlo Annual Compliance Pack ${input.year}`,
    html: renderCompliancePack(payload),
    payload,
  };
}
