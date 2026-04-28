import { NextRequest, NextResponse } from "next/server";

import { enqueueNotification } from "@/lib/booking-platform";
import { getErrorMessage } from "@/lib/error-utils";
import { appendLedgerEntryIfMissing } from "@/lib/finance/runtime";
import { computeRefundAllocationBreakdown } from "@/lib/finance/refunds";
import { resolveAuthenticatedUser } from "@/lib/request-user";
import { createAdminSupabaseClient } from "@/lib/supabase";

const CANCELLABLE_STATUSES = new Set(["awaiting_payment", "pending", "accepted", "confirmed"]);
const CANCELLED_STATUSES = new Set(["cancelled", "cancelled_by_user", "cancelled_by_partner"]);

type CancellationBookingRow = {
  id: string;
  user_id?: string | null;
  status?: string | null;
  payment_status?: string | null;
  host_id?: string | null;
  family_id?: string | null;
  legacy_booking_id?: string | null;
  total_price?: number | null;
  start_date?: string | null;
  date_from?: string | null;
  date_to?: string | null;
  created_at?: string | null;
};

type CancellationQuote = {
  refundableAmount: number;
  penaltyAmount: number;
  bookingAmount: number;
  penaltyPercent: number;
  refundRule: string;
};

type CancellationTarget = {
  source: "v2" | "legacy";
  booking: CancellationBookingRow;
};

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

function resolveStayDate(booking: CancellationBookingRow): string | null {
  return asString(booking.start_date) ?? asString(booking.date_from) ?? asString(booking.date_to);
}

function buildCancellationQuote(booking: CancellationBookingRow): CancellationQuote {
  const bookingAmount = Math.max(0, Math.round(asNumber(booking.total_price, 0)));
  const createdAt = booking.created_at ? new Date(booking.created_at) : new Date();
  const stayDate = resolveStayDate(booking);
  const checkInTime = stayDate ? new Date(`${stayDate}T00:00:00+05:30`).getTime() : Date.now();
  const createdAtTime = Number.isNaN(createdAt.getTime()) ? Date.now() : createdAt.getTime();
  const hoursToCheckIn = Math.round((checkInTime - Date.now()) / 36_00_000);
  const hoursSinceBooking = Math.max(0, Math.round((Date.now() - createdAtTime) / 36_00_000));
  const penaltyPercent = hoursSinceBooking <= 24 ? 0 : hoursToCheckIn <= 24 ? 20 : 10;
  const penaltyAmount = Math.round((bookingAmount * penaltyPercent) / 100);

  return {
    bookingAmount,
    penaltyAmount,
    refundableAmount: Math.max(0, bookingAmount - penaltyAmount),
    penaltyPercent,
    refundRule:
      hoursSinceBooking <= 24
        ? "Free cancellation within 24 hours of booking."
        : hoursToCheckIn <= 24
          ? "20% service and owner preparation penalty because cancellation is within 24 hours of check-in."
          : "10% penalty because cancellation is after 24 hours of booking.",
  };
}

function isCancelledStatus(status: string | null): boolean {
  return status !== null && CANCELLED_STATUSES.has(status);
}

function isCancellableStatus(status: string | null): boolean {
  return status !== null && CANCELLABLE_STATUSES.has(status);
}

async function loadCancellationTarget(supabase: ReturnType<typeof createAdminSupabaseClient>, bookingId: string): Promise<CancellationTarget | null> {
  const { data: v2Booking, error: v2BookingError } = await supabase
    .from("bookings_v2")
    .select("id,user_id,status,payment_status,host_id,legacy_booking_id,total_price,start_date,created_at")
    .or(`id.eq.${bookingId},legacy_booking_id.eq.${bookingId}`)
    .maybeSingle();
  if (v2BookingError) throw v2BookingError;
  if (v2Booking) {
    return {
      source: "v2",
      booking: v2Booking as CancellationBookingRow,
    };
  }

  const { data: legacyBooking, error: legacyBookingError } = await supabase
    .from("bookings")
    .select("id,user_id,status,total_price,date_from,date_to,created_at,family_id")
    .eq("id", bookingId)
    .maybeSingle();
  if (legacyBookingError) throw legacyBookingError;
  if (legacyBooking) {
    return {
      source: "legacy",
      booking: legacyBooking as CancellationBookingRow,
    };
  }

  return null;
}

async function cancelV2Booking(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  booking: CancellationBookingRow,
  now: string
): Promise<void> {
  const bookingUpdatePayload = {
    status: "cancelled_by_user",
    cancelled_at: now,
    cancellation_reason: "user_cancelled",
    hold_expires_at: null,
    updated_at: now,
  } as never;

  let updateResult = await supabase
    .from("bookings_v2")
    .update(bookingUpdatePayload)
    .eq("id", booking.id)
    .select("id,user_id,host_id,legacy_booking_id,status,payment_status,total_price,start_date,created_at")
    .maybeSingle();

  if (updateResult.error) {
    const missingOptionalColumn =
      isMissingColumnError(updateResult.error, "cancelled_at") ||
      isMissingColumnError(updateResult.error, "cancellation_reason") ||
      isMissingColumnError(updateResult.error, "hold_expires_at");
    if (!missingOptionalColumn) {
      throw updateResult.error;
    }

    updateResult = await supabase
      .from("bookings_v2")
      .update({
        status: "cancelled_by_user",
        updated_at: now,
      } as never)
      .eq("id", booking.id)
      .select("id,user_id,host_id,legacy_booking_id,status,payment_status,total_price,start_date,created_at")
      .maybeSingle();

    if (updateResult.error) {
      throw updateResult.error;
    }
  }

  if (!updateResult.data?.id) {
    throw new Error("Booking update did not return a row.");
  }

  await supabase.from("booking_status_history_v2").insert({
    booking_id: booking.id,
    old_status: asString(booking.status) ?? "unknown",
    new_status: "cancelled_by_user",
    changed_by_user_id: updateResult.data.user_id ?? null,
    reason: "user_cancelled",
    created_at: now,
  } as never);

  const legacyBookingId = asString(updateResult.data.legacy_booking_id);
  if (legacyBookingId) {
    const legacyUpdate = await supabase
      .from("bookings")
      .update(
        {
          status: "cancelled_by_user",
          updated_at: now,
        } as never
      )
      .eq("id", legacyBookingId);

    if (legacyUpdate.error && isMissingColumnError(legacyUpdate.error, "updated_at")) {
      const legacyStatusOnlyUpdate = await supabase
        .from("bookings")
        .update(
          {
            status: "cancelled_by_user",
          } as never
        )
        .eq("id", legacyBookingId);

      if (legacyStatusOnlyUpdate.error) {
        console.error("[bookings.cancel] legacy mirror update failed:", legacyStatusOnlyUpdate.error);
      }
    } else if (legacyUpdate.error) {
      console.error("[bookings.cancel] legacy mirror update failed:", legacyUpdate.error);
    }
  }

  await supabase
    .from("calendar_events")
    .update({
      status: "released",
      is_blocking: false,
      payload: {
        reason: "user_cancelled",
        released_at: now,
      },
      updated_at: now,
    } as never)
    .eq("booking_id", booking.id)
    .in("source_type", ["internal_booking", "booking_hold"]);
}

async function cancelLegacyBooking(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  booking: CancellationBookingRow,
  now: string
): Promise<void> {
  const legacyUpdate = await supabase
    .from("bookings")
    .update(
      {
        status: "cancelled_by_user",
        updated_at: now,
      } as never
    )
    .eq("id", booking.id)
    .select("id")
    .maybeSingle();

  if (legacyUpdate.error) {
    if (isMissingColumnError(legacyUpdate.error, "updated_at")) {
      const statusOnlyUpdate = await supabase
        .from("bookings")
        .update(
          {
            status: "cancelled_by_user",
          } as never
        )
        .eq("id", booking.id)
        .select("id")
        .maybeSingle();
      if (statusOnlyUpdate.error) {
        throw statusOnlyUpdate.error;
      }
      return;
    }

    throw legacyUpdate.error;
  }

  if (!legacyUpdate.data?.id) {
    throw new Error("Legacy booking update did not return a row.");
  }
}

async function ensurePendingRefundForPaidCancellation(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  input: {
    bookingId: string;
    actorUserId: string | null;
    quote: CancellationQuote;
    now: string;
  }
): Promise<string | null> {
  if (input.quote.refundableAmount <= 0) {
    return null;
  }

  const { data: payment, error: paymentError } = await supabase
    .from("payments_v2")
    .select("id,booking_id,amount_total,platform_fee,tax_amount,gateway,refund_status,status")
    .eq("booking_id", input.bookingId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (paymentError) throw paymentError;
  if (!payment || String(payment.status ?? "").toLowerCase() !== "paid") {
    return null;
  }

  const paymentAmount = Math.max(0, Math.round(asNumber(payment.amount_total, 0)));
  const refundAmount = Math.min(input.quote.refundableAmount, paymentAmount);
  if (refundAmount <= 0) {
    return null;
  }

  const { data: existingRefund, error: existingRefundError } = await supabase
    .from("refunds_v2")
    .select("id")
    .eq("booking_id", input.bookingId)
    .order("initiated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingRefundError) throw existingRefundError;

  let refundId = asString(existingRefund?.id);
  if (!refundId) {
    const { data: refund, error: refundError } = await supabase
      .from("refunds_v2")
      .insert({
        booking_id: input.bookingId,
        payment_id: payment.id,
        provider: payment.gateway || "manual",
        provider_refund_id: null,
        amount_total: refundAmount,
        reason_code: "user_cancelled",
        status: "pending",
        initiated_by_user_id: input.actorUserId,
        initiated_at: input.now,
        metadata: {
          requested_via: "guest_cancellation",
          refund_rule: input.quote.refundRule,
          penalty_amount: input.quote.penaltyAmount,
          penalty_percent: input.quote.penaltyPercent,
          gateway_execution: "manual_admin_review",
        },
      })
      .select("id")
      .single();

    if (refundError) throw refundError;
    refundId = asString(refund?.id);
    if (!refundId) {
      throw new Error("Refund review row was not created.");
    }

    const { data: snapshot } = await supabase
      .from("booking_financial_snapshots")
      .select("guest_total,taxable_base_for_service_fee,platform_fee,platform_fee_tax,stay_tax")
      .eq("booking_id", input.bookingId)
      .eq("snapshot_kind", "checkout")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const guestTotal = asNumber((snapshot as Record<string, unknown> | null)?.guest_total, paymentAmount);
    const amountAfterDiscount = asNumber(
      (snapshot as Record<string, unknown> | null)?.taxable_base_for_service_fee,
      Math.max(0, paymentAmount - asNumber(payment.tax_amount, 0))
    );
    const platformFee = asNumber((snapshot as Record<string, unknown> | null)?.platform_fee, asNumber(payment.platform_fee, 0));
    const platformFeeTax = asNumber((snapshot as Record<string, unknown> | null)?.platform_fee_tax, asNumber(payment.tax_amount, 0));
    const stayTaxAmount = asNumber((snapshot as Record<string, unknown> | null)?.stay_tax, 0);

    const breakdown = computeRefundAllocationBreakdown({
      refundAmount,
      guestTotal,
      amountAfterDiscount,
      platformFee,
      platformFeeTax,
      stayTaxAmount,
    });

    const allocations = [
      { allocation_type: "guest_principal", amount: breakdown.guest_principal },
      { allocation_type: "platform_fee_reversal", amount: breakdown.platform_fee_reversal },
      { allocation_type: "platform_tax_reversal", amount: breakdown.platform_tax_reversal },
    ]
      .filter((row) => row.amount > 0)
      .map((row) => ({
        refund_id: refundId,
        allocation_type: row.allocation_type,
        amount: row.amount,
        metadata: {
          source_payment_id: payment.id,
          breakdown: breakdown.metadata,
        },
      }));

    if (allocations.length > 0) {
      await supabase.from("refund_allocations_v2").insert(allocations);
    }

    await appendLedgerEntryIfMissing(supabase, {
      bookingId: input.bookingId,
      paymentId: payment.id,
      refundId,
      entryType: "refund_initiated",
      accountCode: "guest_refunds_payable",
      direction: "credit",
      amount: refundAmount,
      referenceType: "guest_cancellation",
      referenceId: refundId,
      metadata: {
        reason: "user_cancelled",
        refundRule: input.quote.refundRule,
      },
    });
  }

  await supabase
    .from("payments_v2")
    .update({ refund_status: "pending" } as never)
    .eq("id", payment.id);

  await supabase
    .from("bookings_v2")
    .update({ payment_status: "refund_pending", updated_at: input.now } as never)
    .eq("id", input.bookingId);

  return refundId;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = (await request.json()) as { bookingId?: string; action?: "quote" | "cancel" };
    const bookingId = String(body.bookingId ?? "").trim();
    const action = body.action === "cancel" ? "cancel" : "quote";

    if (!bookingId) {
      return NextResponse.json({ error: "bookingId is required." }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();
    const authUser = await resolveAuthenticatedUser(supabase, request);
    if (!authUser) {
      return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
    }

    const target = await loadCancellationTarget(supabase, bookingId);
    if (!target) {
      return NextResponse.json({ error: "Booking not found." }, { status: 404 });
    }

    const ownerId = asString(target.booking.user_id);
    if (!ownerId || ownerId !== authUser.id) {
      return NextResponse.json({ error: "You can only manage your own bookings." }, { status: 403 });
    }

    const bookingStatus = asString(target.booking.status);
    const quote = buildCancellationQuote(target.booking);

    if (action === "quote") {
      return NextResponse.json({ success: true, quote });
    }

    if (isCancelledStatus(bookingStatus)) {
      const refundId =
        target.source === "v2"
          ? await ensurePendingRefundForPaidCancellation(supabase, {
              bookingId: target.booking.id,
              actorUserId: authUser.id,
              quote,
              now: new Date().toISOString(),
            })
          : null;
      return NextResponse.json({
        success: true,
        alreadyCancelled: true,
        bookingId,
        quote,
        bookingStatus,
        refundId,
      });
    }

    if (!isCancellableStatus(bookingStatus)) {
      return NextResponse.json(
        {
          error: `This booking cannot be cancelled from its current state: ${bookingStatus ?? "unknown"}.`,
          quote,
        },
        { status: 409 }
      );
    }

    const now = new Date().toISOString();

    if (target.source === "v2") {
      await cancelV2Booking(supabase, target.booking, now);
      await ensurePendingRefundForPaidCancellation(supabase, {
        bookingId: target.booking.id,
        actorUserId: authUser.id,
        quote,
        now,
      });
    } else {
      await cancelLegacyBooking(supabase, target.booking, now);
    }

    let hostUserId = target.source === "v2" ? asString(target.booking.host_id) : null;
    if (!hostUserId && target.source === "legacy") {
      const familyId = asString(target.booking.family_id);
      if (familyId) {
        const { data: hostRecord, error: hostLookupError } = await supabase
          .from("hosts")
          .select("user_id")
          .eq("legacy_family_id", familyId)
          .maybeSingle();
        if (hostLookupError) {
          console.error("[bookings.cancel] legacy host lookup failed:", hostLookupError);
        } else {
          hostUserId = asString(hostRecord?.user_id);
        }
      }
    }
    if (hostUserId) {
      void enqueueNotification(supabase, {
        eventType: "booking_cancelled_by_guest",
        channel: "email",
        userId: hostUserId,
        bookingId,
        dedupeKey: `booking_cancelled_by_guest:host:${bookingId}`,
        subject: "A guest cancelled their Famlo booking",
        payload: {
          message: `Booking ${bookingId} was cancelled by the guest. The room is open again for new bookings.`,
        },
      }).catch((notificationError) => {
        console.error("[bookings.cancel] host notification failed:", notificationError);
      });
    }

    const adminMessage = [
      `Guest cancellation for booking ${bookingId}.`,
      `Booking amount: INR ${quote.bookingAmount}.`,
      `Penalty: ${quote.penaltyPercent}% / INR ${quote.penaltyAmount}.`,
      `Amount Famlo should return to guest: INR ${quote.refundableAmount}.`,
      quote.refundRule,
    ].join(" ");

    void enqueueNotification(supabase, {
      eventType: "booking_cancelled",
      channel: "email",
      userId: ownerId,
      bookingId,
      dedupeKey: `booking_cancelled:${bookingId}`,
      subject: "Your Famlo booking cancellation was processed",
      payload: {
        message: `Your cancellation has been recorded. ${quote.refundRule} Refundable amount: INR ${quote.refundableAmount}.`,
      },
    }).catch((notificationError) => {
      console.error("[bookings.cancel] guest notification failed:", notificationError);
    });

    void Promise.allSettled(
      ["admin@famlo.in", "support@famlo.in"].map((recipient) =>
        enqueueNotification(supabase, {
          eventType: "booking_cancellation_refund_review",
          channel: "email",
          bookingId,
          dedupeKey: `booking_cancellation_refund_review:${bookingId}:${recipient}`,
          subject: "Cancellation refund review needed",
          payload: {
            to: recipient,
            message: adminMessage,
          },
        })
      )
    ).then((results) => {
      for (const result of results) {
        if (result.status === "rejected") {
          console.error("[bookings.cancel] refund review notification failed:", result.reason);
        }
      }
    });

    return NextResponse.json({ success: true, quote, bookingId });
  } catch (error) {
    console.error("[bookings.cancel] failed:", error);
    return NextResponse.json(
      { error: getErrorMessage(error, "Failed to cancel booking.") },
      { status: 500 }
    );
  }
}
