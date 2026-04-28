import { createAdminSupabaseClient } from "@/lib/supabase";

type JsonRecord = Record<string, unknown>;

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(date: Date): string {
  return date.toLocaleDateString("en-IN", { month: "short", year: "2-digit", timeZone: "UTC" });
}

function toPercent(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((part / total) * 1000) / 10;
}

export type GrowthOverview = {
  headline: {
    totalBookings: number;
    paidBookings: number;
    completedBookings: number;
    totalGMV: number;
    currentMonthGMV: number;
    previousMonthGMV: number;
    monthOnMonthGMVPct: number;
    activeGuests: number;
    repeatGuests: number;
    repeatGuestRate: number;
    liveHosts: number;
    totalHosts: number;
    liveHostRate: number;
    publishedStories: number;
    pendingStories: number;
    averageStoryRating: number;
  };
  bookingMix: {
    hostStay: number;
    hommieSession: number;
  };
  funnel: {
    awaitingPayment: number;
    confirmed: number;
    active: number;
    completed: number;
    lost: number;
  };
  monthlyTrend: Array<{
    key: string;
    label: string;
    gmv: number;
    paidBookings: number;
  }>;
  cityPerformance: Array<{
    city: string;
    bookings: number;
    gmv: number;
    guests: number;
  }>;
  roadmapProgress: Array<{
    label: string;
    current: number;
    target: number;
    unit: string;
    percent: number;
  }>;
};

export async function loadGrowthOverview(): Promise<GrowthOverview> {
  const supabase = createAdminSupabaseClient();
  const [bookingsRes, paymentsRes, hostsRes, hommiesRes, storiesRes] = await Promise.all([
    supabase
      .from("bookings_v2")
      .select("id,user_id,booking_type,status,payment_status,total_price,host_id,hommie_id,guests_count,created_at"),
    supabase
      .from("payments_v2")
      .select("booking_id,amount_total,status,paid_at,created_at")
      .in("status", ["paid", "captured"]),
    supabase.from("hosts").select("id,city,status,is_accepting"),
    supabase.from("hommie_profiles_v2").select("id,city,status"),
    supabase.from("stories_v2").select("id,is_published,review_status,rating,created_at"),
  ]);

  if (bookingsRes.error) throw bookingsRes.error;
  if (paymentsRes.error) throw paymentsRes.error;
  if (hostsRes.error) throw hostsRes.error;
  if (hommiesRes.error) throw hommiesRes.error;
  if (storiesRes.error) throw storiesRes.error;

  const bookings = (bookingsRes.data ?? []) as JsonRecord[];
  const payments = (paymentsRes.data ?? []) as JsonRecord[];
  const hosts = (hostsRes.data ?? []) as JsonRecord[];
  const hommies = (hommiesRes.data ?? []) as JsonRecord[];
  const stories = (storiesRes.data ?? []) as JsonRecord[];

  const hostCityById = new Map<string, string>();
  const hommieCityById = new Map<string, string>();

  for (const host of hosts) {
    const id = asString(host.id);
    const city = asString(host.city);
    if (id && city) hostCityById.set(id, city);
  }

  for (const hommie of hommies) {
    const id = asString(hommie.id);
    const city = asString(hommie.city);
    if (id && city) hommieCityById.set(id, city);
  }

  const paymentByBookingId = new Map<string, JsonRecord>();
  for (const payment of payments) {
    const bookingId = asString(payment.booking_id);
    if (!bookingId || paymentByBookingId.has(bookingId)) continue;
    paymentByBookingId.set(bookingId, payment);
  }

  const sixMonths: Date[] = [];
  const now = new Date();
  const currentMonthDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  for (let index = 5; index >= 0; index -= 1) {
    sixMonths.push(new Date(Date.UTC(currentMonthDate.getUTCFullYear(), currentMonthDate.getUTCMonth() - index, 1)));
  }

  const monthlyAccumulator = new Map<string, { key: string; label: string; gmv: number; paidBookings: number }>();
  for (const month of sixMonths) {
    const key = monthKey(month);
    monthlyAccumulator.set(key, { key, label: monthLabel(month), gmv: 0, paidBookings: 0 });
  }

  const cityAccumulator = new Map<string, { city: string; bookings: number; gmv: number; guests: number }>();
  const guestBookingCounts = new Map<string, number>();

  let totalGMV = 0;
  let paidBookings = 0;
  let completedBookings = 0;
  let hostStay = 0;
  let hommieSession = 0;
  let awaitingPayment = 0;
  let confirmed = 0;
  let active = 0;
  let completed = 0;
  let lost = 0;

  for (const booking of bookings) {
    const bookingType = asString(booking.booking_type);
    if (bookingType === "host_stay") hostStay += 1;
    if (bookingType === "hommie_session") hommieSession += 1;

    const status = asString(booking.status) ?? "pending";
    const paymentStatus = asString(booking.payment_status) ?? "pending";

    if (status === "awaiting_payment" || paymentStatus === "pending") awaitingPayment += 1;
    if (["confirmed", "checked_in"].includes(status)) confirmed += 1;
    if (["checked_in"].includes(status)) active += 1;
    if (status === "completed") {
      completed += 1;
      completedBookings += 1;
    }
    if (["cancelled", "rejected", "expired"].includes(status)) lost += 1;

    const bookingId = asString(booking.id);
    const linkedPayment = bookingId ? paymentByBookingId.get(bookingId) : null;
    const isPaid = paymentStatus === "paid" || Boolean(linkedPayment);

    if (isPaid) {
      const amount = linkedPayment ? asNumber(linkedPayment.amount_total, asNumber(booking.total_price)) : asNumber(booking.total_price);
      totalGMV += amount;
      paidBookings += 1;

      const paidAtValue = asString(linkedPayment?.paid_at) ?? asString(linkedPayment?.created_at) ?? asString(booking.created_at);
      if (paidAtValue) {
        const paidAt = new Date(paidAtValue);
        const bucket = monthlyAccumulator.get(monthKey(new Date(Date.UTC(paidAt.getUTCFullYear(), paidAt.getUTCMonth(), 1))));
        if (bucket) {
          bucket.gmv += amount;
          bucket.paidBookings += 1;
        }
      }

      const userId = asString(booking.user_id);
      if (userId) {
        guestBookingCounts.set(userId, (guestBookingCounts.get(userId) ?? 0) + 1);
      }

      const city =
        hostCityById.get(asString(booking.host_id) ?? "") ??
        hommieCityById.get(asString(booking.hommie_id) ?? "") ??
        "Unknown";
      const current = cityAccumulator.get(city) ?? { city, bookings: 0, gmv: 0, guests: 0 };
      current.bookings += 1;
      current.gmv += amount;
      current.guests += asNumber(booking.guests_count, 1);
      cityAccumulator.set(city, current);
    }
  }

  const guestCounts = [...guestBookingCounts.values()];
  const activeGuests = guestCounts.length;
  const repeatGuests = guestCounts.filter((count) => count >= 2).length;

  const currentMonthKey = monthKey(currentMonthDate);
  const previousMonthDate = new Date(Date.UTC(currentMonthDate.getUTCFullYear(), currentMonthDate.getUTCMonth() - 1, 1));
  const previousMonthKey = monthKey(previousMonthDate);
  const currentMonthGMV = monthlyAccumulator.get(currentMonthKey)?.gmv ?? 0;
  const previousMonthGMV = monthlyAccumulator.get(previousMonthKey)?.gmv ?? 0;
  const monthOnMonthGMVPct =
    previousMonthGMV > 0 ? Math.round((((currentMonthGMV - previousMonthGMV) / previousMonthGMV) * 100) * 10) / 10 : currentMonthGMV > 0 ? 100 : 0;

  const publishedStories = stories.filter((story) => story.is_published === true).length;
  const pendingStories = stories.filter((story) => asString(story.review_status) === "pending").length;
  const ratedStories = stories.map((story) => asNumber(story.rating, -1)).filter((rating) => rating >= 0);
  const averageStoryRating =
    ratedStories.length > 0 ? Math.round((ratedStories.reduce((sum, rating) => sum + rating, 0) / ratedStories.length) * 10) / 10 : 0;

  const liveHosts = hosts.filter((host) => asString(host.status) === "published" && host.is_accepting !== false).length;
  const totalHosts = hosts.length;

  return {
    headline: {
      totalBookings: bookings.length,
      paidBookings,
      completedBookings,
      totalGMV,
      currentMonthGMV,
      previousMonthGMV,
      monthOnMonthGMVPct,
      activeGuests,
      repeatGuests,
      repeatGuestRate: toPercent(repeatGuests, activeGuests),
      liveHosts,
      totalHosts,
      liveHostRate: toPercent(liveHosts, totalHosts),
      publishedStories,
      pendingStories,
      averageStoryRating,
    },
    bookingMix: {
      hostStay,
      hommieSession,
    },
    funnel: {
      awaitingPayment,
      confirmed,
      active,
      completed,
      lost,
    },
    monthlyTrend: sixMonths
      .map((month) => monthlyAccumulator.get(monthKey(month)))
      .filter((value): value is { key: string; label: string; gmv: number; paidBookings: number } => Boolean(value)),
    cityPerformance: [...cityAccumulator.values()].sort((a, b) => b.gmv - a.gmv).slice(0, 8),
    roadmapProgress: [
      {
        label: "Bookings to 100",
        current: paidBookings,
        target: 100,
        unit: "bookings",
        percent: Math.min(100, toPercent(paidBookings, 100)),
      },
      {
        label: "Bookings to 500",
        current: paidBookings,
        target: 500,
        unit: "bookings",
        percent: Math.min(100, toPercent(paidBookings, 500)),
      },
      {
        label: "Monthly GMV to 10L",
        current: currentMonthGMV,
        target: 1_000_000,
        unit: "INR",
        percent: Math.min(100, toPercent(currentMonthGMV, 1_000_000)),
      },
      {
        label: "Retention to 40%",
        current: Math.round(toPercent(repeatGuests, activeGuests)),
        target: 40,
        unit: "%",
        percent: Math.min(100, toPercent(Math.round(toPercent(repeatGuests, activeGuests)), 40)),
      },
    ],
  };
}
