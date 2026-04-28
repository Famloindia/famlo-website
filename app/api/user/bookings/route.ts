import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { loadGuestBookingsCompatibility } from "@/lib/booking-compat";
import { getTodayInIndia } from "@/lib/booking-time";
import { getGuestCookieName, readGuestSessionToken } from "@/lib/guest-auth";
import { resolveAuthenticatedUser } from "@/lib/request-user";
import { createAdminSupabaseClient } from "@/lib/supabase";

type AuthenticatedUser = {
  id: string;
  email: string | null;
  phone?: string | null;
};

type AutoCheckoutBookingRow = {
  id: string;
  status: string | null;
  payment_status: string | null;
  start_date: string | null;
  end_date: string | null;
  legacy_booking_id: string | null;
};

function isAutoCheckoutEligible(row: AutoCheckoutBookingRow): boolean {
  const normalizedStatus = String(row.status ?? "").trim().toLowerCase();
  const normalizedPaymentStatus = String(row.payment_status ?? "").trim().toLowerCase();
  return (
    normalizedStatus === "confirmed" ||
    normalizedStatus === "checked_in" ||
    (normalizedStatus === "accepted" && normalizedPaymentStatus === "paid")
  );
}

function hasStayWindowEnded(row: AutoCheckoutBookingRow, todayInIndia: string): boolean {
  const checkoutDate = row.end_date ?? row.start_date;
  return Boolean(checkoutDate && checkoutDate < todayInIndia);
}

async function markElapsedBookingsCompleted(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  userId: string
): Promise<boolean> {
  const todayInIndia = getTodayInIndia();
  const { data, error } = await supabase
    .from("bookings_v2")
    .select("id,status,payment_status,start_date,end_date,legacy_booking_id")
    .eq("user_id", userId)
    .in("status", ["accepted", "confirmed", "checked_in"]);

  if (error) {
    console.error("[guest.bookings.route] auto_checkout:lookup_failed", error);
    return false;
  }

  const elapsedBookings = ((data ?? []) as AutoCheckoutBookingRow[]).filter(
    (booking) => isAutoCheckoutEligible(booking) && hasStayWindowEnded(booking, todayInIndia)
  );

  if (elapsedBookings.length === 0) return false;

  const now = new Date().toISOString();
  let changed = false;

  for (const booking of elapsedBookings) {
    const { error: updateError } = await supabase
      .from("bookings_v2")
      .update({
        status: "completed",
        checked_out_at: now,
        updated_at: now,
      } as never)
      .eq("id", booking.id);

    if (updateError) {
      console.error("[guest.bookings.route] auto_checkout:update_failed", {
        bookingId: booking.id,
        error: updateError,
      });
      continue;
    }

    changed = true;

    if (booking.legacy_booking_id) {
      const { error: legacyUpdateError } = await supabase
        .from("bookings")
        .update({ status: "completed", updated_at: now } as never)
        .eq("id", booking.legacy_booking_id);
      if (legacyUpdateError) {
        console.error("[guest.bookings.route] auto_checkout:legacy_update_failed", {
          bookingId: booking.id,
          legacyBookingId: booking.legacy_booking_id,
          error: legacyUpdateError,
        });
      }
    }

    const { error: historyError } = await supabase.from("booking_status_history_v2").insert({
      booking_id: booking.id,
      old_status: booking.status ?? null,
      new_status: "completed",
      changed_by_user_id: null,
      reason: "auto_checkout_after_stay_window",
      created_at: now,
    } as never);
    if (historyError) {
      console.error("[guest.bookings.route] auto_checkout:history_failed", {
        bookingId: booking.id,
        error: historyError,
      });
    }
  }

  return changed;
}

function normalizeEmail(value: string | null | undefined): string | null {
  const email = value?.trim().toLowerCase();
  return email && !email.endsWith("@phone.famlo.in") ? email : null;
}

function normalizePhone(value: string | null | undefined): string | null {
  const digits = value?.replace(/\D/g, "") ?? "";
  return digits.length >= 10 ? digits.slice(-10) : null;
}

async function resolveRelatedGuestUserIds(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  authUser: AuthenticatedUser,
  requestedUserId: string
): Promise<string[]> {
  const { data: currentProfile } = await supabase
    .from("users")
    .select("id,email,phone,role")
    .eq("id", requestedUserId)
    .maybeSingle();

  const targetEmails = new Set(
    [normalizeEmail(authUser.email), normalizeEmail((currentProfile as { email?: string | null } | null)?.email)].filter(
      (value): value is string => Boolean(value)
    )
  );
  const targetPhones = new Set(
    [normalizePhone(authUser.phone), normalizePhone((currentProfile as { phone?: string | null } | null)?.phone)].filter(
      (value): value is string => Boolean(value)
    )
  );

  if (targetEmails.size === 0 && targetPhones.size === 0) return [];

  const { data: guestProfiles, error } = await supabase
    .from("users")
    .select("id,email,phone,role")
    .eq("role", "guest")
    .limit(1000);

  if (error) {
    console.error("[guest.bookings.route] related_users:error", error);
    return [];
  }

  return (guestProfiles ?? [])
    .filter((profile) => {
      const email = normalizeEmail(profile.email);
      const phone = normalizePhone(profile.phone);
      return (email && targetEmails.has(email)) || (phone && targetPhones.has(phone));
    })
    .map((profile) => profile.id)
    .filter((id): id is string => Boolean(id) && id !== requestedUserId);
}

export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const requestedUserId = searchParams.get("userId");
  const headerUserId = request.headers.get("x-famlo-user-id")?.trim() || null;
  const bearerToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() || null;

  console.info("[guest.bookings.route] request:received", {
    url: request.url,
    requestedUserId,
    headerUserId,
  });

  try {
    const supabase = createAdminSupabaseClient();
    const authUser = await resolveAuthenticatedUser(supabase, request);
    if (!authUser) {
      return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
    }
    if (requestedUserId && requestedUserId !== authUser.id) {
      return NextResponse.json({ error: "You can only load your own bookings." }, { status: 403 });
    }
    if (bearerToken && headerUserId && headerUserId !== authUser.id) {
      return NextResponse.json({ error: "You can only load your own bookings." }, { status: 403 });
    }

    const cookieStore = await cookies();
    const guestSession = readGuestSessionToken(cookieStore.get(getGuestCookieName())?.value);
    const effectiveAuthUser = guestSession
      ? { ...authUser, id: guestSession.userId, phone: guestSession.phone }
      : authUser;
    const bookingsUserId = requestedUserId ?? (bearerToken ? authUser.id : guestSession?.userId) ?? headerUserId ?? authUser.id;

    console.info("[guest.bookings.route] load:before_compatibility", {
      url: request.url,
      userId: bookingsUserId,
    });
    await markElapsedBookingsCompleted(supabase, bookingsUserId);
    let bookings = await loadGuestBookingsCompatibility(supabase, bookingsUserId);

    if ((bookings?.length ?? 0) === 0) {
      const relatedUserIds = await resolveRelatedGuestUserIds(supabase, effectiveAuthUser, bookingsUserId);
      for (const relatedUserId of relatedUserIds) {
        await markElapsedBookingsCompleted(supabase, relatedUserId);
        const relatedBookings = await loadGuestBookingsCompatibility(supabase, relatedUserId);
        if ((relatedBookings?.length ?? 0) > 0) {
          bookings = relatedBookings;
          break;
        }
      }
    }
    console.info("[guest.bookings.route] load:success", {
      userId: bookingsUserId,
      count: Array.isArray(bookings) ? bookings.length : 0,
    });

    return NextResponse.json(bookings ?? [], {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        Pragma: "no-cache",
        Expires: "0",
      },
    });
  } catch (error) {
    console.error("[guest.bookings.route] load:error", {
      url: request.url,
      requestedUserId,
      errorMessage: error instanceof Error ? error.message : String(error),
      error,
    });
    return NextResponse.json({ error: "Failed to load bookings." }, { status: 500 });
  }
}
