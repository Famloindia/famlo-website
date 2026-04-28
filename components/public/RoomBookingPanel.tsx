"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import Script from "next/script";
import { CalendarDays, ChevronRight, IndianRupee, MapPin, ShieldCheck, Users } from "lucide-react";

import { AuthModal } from "@/components/auth/AuthModal";
import { useUser } from "@/components/auth/UserContext";
import { addIndiaDays, getTodayInIndia } from "@/lib/booking-time";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import type { StayUnitRecord } from "@/lib/stay-units";

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => {
      open: () => void;
      on: (event: "payment.failed", handler: (response: { error?: { description?: string; reason?: string } }) => void) => void;
    };
  }
}

type RoomBookingPanelProps = {
  home: {
    id: string;
    hostId: string | null;
    legacyFamilyId: string | null;
    hostUserId: string | null;
    name: string;
    listingTitle: string | null;
    city: string | null;
    state: string | null;
    googleMapsLink: string | null;
    platformCommissionPct: number;
    bookingRequiresHostApproval: boolean;
    isActive: boolean;
    isAccepting: boolean;
    checkInTime?: string | null;
    checkOutTime?: string | null;
  };
  room: StayUnitRecord;
  areaLabel: string;
};

type BookingReceipt = {
  bookingId: string;
  paymentId: string | null;
  totalLabel: string;
};

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseDateString(value: string): Date {
  return new Date(`${value}T00:00:00`);
}

function toDateString(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function compareDateStrings(a: string, b: string): number {
  const timeA = parseDateString(a).getTime();
  const timeB = parseDateString(b).getTime();
  if (timeA === timeB) return 0;
  return timeA < timeB ? -1 : 1;
}

function addMonths(date: Date, months: number): Date {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function monthLabel(date: Date): string {
  return new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric" }).format(date);
}

function buildMonthCells(monthDate: Date): Array<Date | null> {
  const firstDay = startOfMonth(monthDate);
  const firstWeekday = firstDay.getDay();
  const totalDays = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate();
  const cells: Array<Date | null> = [];

  for (let index = 0; index < firstWeekday; index += 1) {
    cells.push(null);
  }

  for (let day = 1; day <= totalDays; day += 1) {
    cells.push(new Date(monthDate.getFullYear(), monthDate.getMonth(), day));
  }

  while (cells.length % 7 !== 0) {
    cells.push(null);
  }

  return cells;
}

function formatRangeLabel(startDate: string, endDate: string): string {
  if (!startDate) return "Choose your stay dates";
  if (startDate === endDate) {
    return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(parseDateString(startDate));
  }

  const start = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short" }).format(parseDateString(startDate));
  const end = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(parseDateString(endDate));
  return `${start} → ${end}`;
}

function getRupeeLabel(value: number): string {
  return value.toLocaleString("en-IN");
}

function resolveRoomPrice(room: StayUnitRecord): number {
  if (room.quarterEnabled && room.priceAfternoon > 0) {
    return room.priceAfternoon;
  }

  return room.priceFullday > 0
    ? room.priceFullday
    : room.priceMorning > 0
      ? room.priceMorning
      : room.priceAfternoon > 0
        ? room.priceAfternoon
        : room.priceEvening > 0
          ? room.priceEvening
          : 0;
}

function normalizeBlockedDateToken(token: string): string {
  return token.split("::", 1)[0] ?? token;
}

function formatTimeLabel(value: string | null | undefined, fallback: string): string {
  const trimmed = asString(value);
  if (!trimmed) return fallback;
  return trimmed;
}

function ensureRazorpayCheckout(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.Razorpay) return Promise.resolve();

  return new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-razorpay-checkout="true"]');
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Failed to load Razorpay Checkout.")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.dataset.razorpayCheckout = "true";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Razorpay Checkout."));
    document.body.appendChild(script);
  });
}

export function RoomBookingPanel({ home, room, areaLabel }: Readonly<RoomBookingPanelProps>): React.JSX.Element {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const { user, profile, loading, refreshProfile } = useUser();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [checkIn, setCheckIn] = useState(() => addIndiaDays(getTodayInIndia(), 1));
  const [checkOut, setCheckOut] = useState(() => addIndiaDays(getTodayInIndia(), 1));
  const [anchorMonth, setAnchorMonth] = useState(() => startOfMonth(parseDateString(addIndiaDays(getTodayInIndia(), 1))));
  const [calendarTouched, setCalendarTouched] = useState(false);
  const [guests, setGuests] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<BookingReceipt | null>(null);
  const [scriptReady, setScriptReady] = useState(false);
  const [bookHovered, setBookHovered] = useState(false);
  const [optimisticBlockedDates, setOptimisticBlockedDates] = useState<string[]>([]);

  const price = resolveRoomPrice(room);
  const blockedDateTokens = useMemo(
    () => new Set([...(room.blockedDates ?? []), ...optimisticBlockedDates].filter((value) => value.length > 0)),
    [optimisticBlockedDates, room.blockedDates]
  );
  const blockedDateSet = useMemo(
    () => new Set(Array.from(blockedDateTokens).flatMap((token) => [token, normalizeBlockedDateToken(token)])),
    [blockedDateTokens]
  );

  const guestLimit = Math.max(1, room.maxGuests || 1);
  const guestOptions = useMemo(
    () => Array.from({ length: guestLimit }, (_, index) => index + 1),
    [guestLimit]
  );
  const selectedStartDate = checkIn;
  const selectedEndDate = checkOut || checkIn;
  const selectedBookingDates = useMemo(
    () => {
      const startTime = parseDateString(selectedStartDate).getTime();
      const endTime = parseDateString(selectedEndDate).getTime();
      const dates: string[] = [];
      const cursor = new Date(startTime);
      while (cursor.getTime() <= endTime) {
        dates.push(toDateString(cursor));
        cursor.setDate(cursor.getDate() + 1);
      }
      return dates;
    },
    [selectedStartDate, selectedEndDate]
  );
  const selectedDays = Math.max(
    1,
    Math.round((parseDateString(selectedEndDate).getTime() - parseDateString(selectedStartDate).getTime()) / 86400000) + 1
  );
  const estimatedTotal = price * selectedDays;
  const isSelectedDateBookable = compareDateStrings(selectedStartDate, getTodayInIndia()) >= 0;
  const hasBlockedSelection = selectedBookingDates.some((date) => blockedDateSet.has(date) || blockedDateSet.has(`${date}::fullday`));
  const hasUser = Boolean(user);
  const verified = Boolean(profile?.kyc_status && ["pending", "verified", "auto_verified", "pending_review"].includes(profile.kyc_status));
  const profileName = asString(profile?.name) || user?.email || "Guest";
  const profileCity = asString(profile?.city) || asString(profile?.last_location_label) || home.city || "";
  const rangeLabel = formatRangeLabel(selectedStartDate, selectedEndDate);
  const monthOne = anchorMonth;

  const selectedGuests = Math.min(Math.max(1, guests), guestLimit);

  function pickDate(dateString: string): void {
    const today = getTodayInIndia();
    if (compareDateStrings(dateString, today) < 0) return;

    if (!calendarTouched) {
      setCheckIn(dateString);
      setCheckOut(dateString);
      setCalendarTouched(true);
      return;
    }

    if (compareDateStrings(dateString, selectedStartDate) < 0) {
      setCheckIn(dateString);
      setCheckOut(dateString);
      return;
    }

    if (selectedStartDate === selectedEndDate && compareDateStrings(dateString, selectedStartDate) > 0) {
      setCheckOut(dateString);
      return;
    }

    if (compareDateStrings(dateString, selectedStartDate) < 0 || compareDateStrings(dateString, selectedEndDate) > 0) {
      setCheckIn(dateString);
      setCheckOut(dateString);
      return;
    }

    if (compareDateStrings(dateString, selectedStartDate) === 0) {
      setCheckOut(selectedStartDate);
      return;
    }

    if (compareDateStrings(dateString, selectedEndDate) === 0) {
      return;
    }

    setCheckOut(dateString);
  }

  function isSelectedDay(dateString: string): boolean {
    return dateString === selectedStartDate || dateString === selectedEndDate;
  }

  function isInRange(dateString: string): boolean {
    return compareDateStrings(dateString, selectedStartDate) > 0 && compareDateStrings(dateString, selectedEndDate) < 0;
  }

  function isBlockedDay(dateString: string): boolean {
    return blockedDateSet.has(dateString) || blockedDateSet.has(`${dateString}::fullday`);
  }

  function renderCalendar(monthDate: Date): React.JSX.Element {
    const monthCells = buildMonthCells(monthDate);

    return (
      <div style={{ borderRadius: 20, border: "1px solid rgba(24,144,255,0.12)", background: "#fff", padding: 14, display: "grid", gap: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <button
            type="button"
            onClick={() => setAnchorMonth((current) => addMonths(current, -1))}
            style={{
              border: "1px solid rgba(14,43,87,0.12)",
              background: "#fff",
              borderRadius: 12,
              padding: "8px 10px",
              cursor: "pointer",
              fontWeight: 800,
              color: "#0f172a",
            }}
          >
            ←
          </button>
          <div style={{ fontSize: 15, fontWeight: 900, color: "#0f172a" }}>{monthLabel(monthDate)}</div>
          <button
            type="button"
            onClick={() => setAnchorMonth((current) => addMonths(current, 1))}
            style={{
              border: "1px solid rgba(14,43,87,0.12)",
              background: "#fff",
              borderRadius: 12,
              padding: "8px 10px",
              cursor: "pointer",
              fontWeight: 800,
              color: "#0f172a",
            }}
          >
            →
          </button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 6, fontSize: 11, fontWeight: 900, color: "#64748b" }}>
          {WEEKDAY_LABELS.map((label) => (
            <div key={label} style={{ textAlign: "center" }}>{label}</div>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 6 }}>
          {monthCells.map((cell, index) => {
            if (!cell) {
              return <div key={`empty-${index}`} style={{ aspectRatio: "1 / 1", borderRadius: 12, background: "transparent" }} />;
            }

            const dateString = toDateString(cell);
            const beforeToday = compareDateStrings(dateString, getTodayInIndia()) < 0;
            const selected = isSelectedDay(dateString);
            const inRange = isInRange(dateString);
            const blocked = isBlockedDay(dateString);

            return (
              <button
                key={dateString}
                type="button"
                onClick={() => pickDate(dateString)}
                disabled={beforeToday || blocked}
                style={{
                  aspectRatio: "1 / 1",
                  borderRadius: 14,
                  border: selected
                    ? "1px solid #1890ff"
                    : blocked
                      ? "1px solid rgba(220,38,38,0.22)"
                      : "1px solid rgba(14,43,87,0.10)",
                  background: selected
                    ? "#1890ff"
                    : blocked
                      ? "linear-gradient(180deg, #fff1f2, #ffe4e6)"
                      : inRange
                        ? "rgba(24,144,255,0.12)"
                        : beforeToday
                          ? "#f8fafc"
                          : "#fff",
                  color: selected ? "#fff" : blocked ? "#991b1b" : beforeToday ? "#cbd5e1" : "#0f172a",
                  fontWeight: selected ? 900 : 700,
                  cursor: beforeToday || blocked ? "not-allowed" : "pointer",
                  boxShadow: selected ? "0 8px 18px rgba(24,144,255,0.24)" : "none",
                  display: "grid",
                  placeItems: "center",
                }}
                title={blocked ? "Booked" : undefined}
              >
                <span style={{ display: "grid", gap: 3, justifyItems: "center", lineHeight: 1 }}>
                  <span>{cell.getDate()}</span>
                  {blocked ? <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase" }}>Booked</span> : null}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  async function handleBooking(): Promise<void> {
    if (!hasUser) {
      setShowAuthModal(true);
      return;
    }

    if (!verified) {
      setBookingError("Complete guest verification in your profile first so admin can approve the booking.");
      return;
    }

    if (!home.isActive || !home.isAccepting) {
      setBookingError("This host is not accepting bookings right now.");
      return;
    }

    if (!room.isActive) {
      setBookingError("This room is currently closed by the host.");
      return;
    }

    if (!isSelectedDateBookable) {
      setBookingError("This booking date has already passed. Please choose another date.");
      return;
    }

    if (hasBlockedSelection) {
      setBookingError("This room is already booked for one or more selected dates.");
      return;
    }

    setSubmitting(true);
    setBookingError(null);

    try {
      const { data: session } = await supabase.auth.getUser();
      const currentUserId = session.user?.id ?? user?.id;
      if (!currentUserId) {
        setShowAuthModal(true);
        return;
      }
      const {
        data: { session: authSession },
      } = await supabase.auth.getSession();
      const authHeaders: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (authSession?.access_token) authHeaders.Authorization = `Bearer ${authSession.access_token}`;
      if (user?.id) authHeaders["x-famlo-user-id"] = user.id;
      if (user?.email) authHeaders["x-famlo-user-email"] = user.email;

      const response = await fetch("/api/bookings/create", {
        method: "POST",
        headers: authHeaders,
          body: JSON.stringify({
            bookingType: "host_stay",
            userId: currentUserId,
            hostId: home.hostId,
            legacyFamilyId: home.legacyFamilyId,
            stayUnitId: room.id,
            quarterType: "fullday",
            quarterTime: "Full day",
            startDate: selectedStartDate,
            endDate: selectedEndDate,
            guestsCount: selectedGuests,
            unitPrice: price,
            commissionPct: home.platformCommissionPct,
            guestName: profileName,
            guestCity: profileCity || null,
            listingName: home.listingTitle ?? home.name,
            hostArea: areaLabel,
            hostUserId: home.hostUserId,
            welcomeMessage: `Welcome to ${home.listingTitle ?? home.name}. Booking created from the room page.`,
            requestPaymentIntent: true,
            gateway: "razorpay",
        }),
      });

      const payload = await response.json();
      if (!response.ok || payload.error) {
        throw new Error(payload.error ?? "Could not create booking.");
      }

      if (payload.bookingId) {
        setOptimisticBlockedDates((current) => Array.from(new Set([...current, ...selectedBookingDates])));
        const paymentIntentPayload = payload.paymentIntent;
        if (!paymentIntentPayload) {
          setReceipt({
            bookingId: payload.bookingId,
            paymentId: payload.paymentId ?? null,
            totalLabel: `₹${getRupeeLabel(Number(payload.totalPrice ?? price))}`,
          });
          setSuccessMessage("Your booking is created, but payment setup needs one more retry from the same page.");
        } else if (paymentIntentPayload.integrationStatus === "razorpay_ready" && paymentIntentPayload.order) {
          await ensureRazorpayCheckout();
          if (!window.Razorpay) {
            throw new Error("Razorpay Checkout is unavailable.");
          }

          const order = paymentIntentPayload.order as {
            keyId: string;
            orderId: string;
            amount: number;
            currency: string;
            bookingId: string;
            paymentRowId: string;
          };

          const checkout = new window.Razorpay({
            key: order.keyId,
            amount: order.amount,
            currency: order.currency,
            name: "Famlo",
            description: `Booking for ${home.listingTitle ?? home.name}`,
            order_id: order.orderId,
            prefill: {
              name: profileName,
              email: profile?.email ?? user?.email ?? undefined,
            },
            notes: {
              booking_id: order.bookingId,
              payment_row_id: order.paymentRowId,
            },
            handler: (paymentResponse: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) => {
              void (async () => {
                const verifyResponse = await fetch("/api/payments/verify", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    bookingId: order.bookingId,
                    paymentRowId: order.paymentRowId,
                    razorpay_payment_id: paymentResponse.razorpay_payment_id,
                    razorpay_order_id: paymentResponse.razorpay_order_id,
                    razorpay_signature: paymentResponse.razorpay_signature,
                  }),
                });

                const verifyPayload = await verifyResponse.json();
                if (!verifyResponse.ok || verifyPayload.error) {
                  throw new Error(verifyPayload.error ?? "Payment verification failed.");
                }

                setReceipt({
                  bookingId: order.bookingId,
                  paymentId: order.paymentRowId,
                  totalLabel: `₹${getRupeeLabel(order.amount / 100)}`,
                });
                setSuccessMessage(
                  home.bookingRequiresHostApproval
                    ? "Your booking is under approval. Check it out on My Bookings."
                    : "Your booking is confirmed. Check it out on My Bookings."
                );
                void refreshProfile();
              })().catch((error) => {
                setBookingError(error instanceof Error ? error.message : "Payment verification failed.");
              });
            },
            modal: {
              ondismiss: () => {
                setSuccessMessage("Your booking is created. Payment remains pending until you complete the checkout.");
              },
            },
            theme: {
              color: "#1890ff",
            },
          });

          checkout.on("payment.failed", (failureResponse) => {
            setBookingError(
              failureResponse.error?.description ??
                failureResponse.error?.reason ??
                "Payment failed. The booking remains created but unpaid."
            );
          });

          checkout.open();
          setReceipt({
            bookingId: payload.bookingId,
            paymentId: paymentIntentPayload.order.paymentRowId,
            totalLabel: `₹${getRupeeLabel(Number(payload.totalPrice ?? price))}`,
          });
          setSuccessMessage("Booking created. Complete payment in the Razorpay window that opened on this page.");
        } else {
          setReceipt({
            bookingId: payload.bookingId,
            paymentId: payload.paymentId ?? null,
            totalLabel: `₹${getRupeeLabel(Number(payload.totalPrice ?? price))}`,
          });
          setSuccessMessage("Booking created. Payment setup is pending on the server.");
        }
      }
    } catch (error) {
      setBookingError(error instanceof Error ? error.message : "Booking failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      {submitting ? (
        <div className="famlo-booking-loader" role="status" aria-live="polite" aria-label="Opening booking checkout">
          <div className="famlo-booking-loader-card">
            <div className="famlo-booking-loader-logo-wrap">
              <img className="famlo-booking-loader-logo" src="/logo-blue.png" alt="Famlo" />
              <div className="famlo-booking-loader-wave" />
            </div>
            <div className="famlo-booking-loader-title">Opening your booking</div>
            <div className="famlo-booking-loader-copy">
              We are preparing your room and payment checkout.
            </div>
          </div>
        </div>
      ) : null}

      <section
        style={{
          background: "rgba(255,255,255,0.96)",
          borderRadius: 24,
          border: "1px solid rgba(24,144,255,0.16)",
          padding: 20,
          boxShadow: "0 16px 35px rgba(15,23,42,0.08)",
          display: "grid",
          gap: 16,
          position: "sticky",
          top: 104,
          alignSelf: "start",
          maxHeight: "calc(100vh - 128px)",
          overflowY: "auto",
          zIndex: 4,
        }}
      >
        <Script src="https://checkout.razorpay.com/v1/checkout.js" onLoad={() => setScriptReady(true)} />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div style={{ display: "grid", gap: 4 }}>
          <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", color: "#1890ff" }}>
            Booking
          </div>
          <h3 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: "#0f172a" }}>Book this room here</h3>
        </div>
        <div style={{ padding: "8px 12px", borderRadius: 999, background: "#eff6ff", color: "#165dcc", fontSize: 11, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase" }}>
          Stay here
        </div>
      </div>

        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ display: "grid", gap: 8 }}>
            <div style={{ display: "grid", gap: 6, gridTemplateColumns: "1fr 1fr" }}>
            <div style={{ borderRadius: 16, border: "1px solid rgba(14,43,87,0.16)", padding: "12px 14px", background: "#fff" }}>
              <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", color: "#0e2b57", marginBottom: 6 }}>
                Check-in time
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <CalendarDays size={18} color="#1890ff" />
                <div style={{ fontSize: 15, fontWeight: 800, color: "#0f172a" }}>{formatTimeLabel(home.checkInTime, "11:00 AM")}</div>
              </div>
            </div>
            <div style={{ borderRadius: 16, border: "1px solid rgba(14,43,87,0.16)", padding: "12px 14px", background: "#fff" }}>
              <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", color: "#0e2b57", marginBottom: 6 }}>
                Check-out time
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <CalendarDays size={18} color="#1890ff" />
                <div style={{ fontSize: 15, fontWeight: 800, color: "#0f172a" }}>{formatTimeLabel(home.checkOutTime, "1:00 PM")}</div>
              </div>
            </div>
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(15,23,42,0.68)", lineHeight: 1.6 }}>
            {rangeLabel}. Booked dates are blocked for this specific room.
          </div>
        </div>

        {renderCalendar(monthOne)}

        <label style={{ display: "grid", gap: 8, fontSize: 11, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", color: "#0e2b57" }}>
          <span>Guests</span>
          <div style={{ display: "flex", alignItems: "center", gap: 10, borderRadius: 16, border: "1px solid rgba(14,43,87,0.16)", padding: "12px 14px" }}>
            <Users size={18} color="#1890ff" />
            <select
              aria-label={`Guests, up to ${guestLimit}`}
              value={selectedGuests}
              onChange={(event) => setGuests(Math.max(1, Math.min(guestLimit, Number(event.target.value) || 1)))}
              style={{
                border: "none",
                outline: "none",
                width: "100%",
                fontSize: 15,
                fontWeight: 700,
                color: "#0f172a",
                background: "transparent",
                appearance: "none",
                cursor: "pointer",
              }}
            >
              {guestOptions.map((count) => (
                <option key={count} value={count}>
                  {count} guest{count === 1 ? "" : "s"}
                </option>
              ))}
            </select>
          </div>
          <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(15,23,42,0.6)", textTransform: "none", letterSpacing: 0 }}>
            Up to {guestLimit} guest{guestLimit === 1 ? "" : "s"} allowed for this room. Guests do not change room price.
          </div>
        </label>
      </div>

      <div style={{ display: "grid", gap: 8, background: "#f8fbff", border: "1px solid rgba(24,144,255,0.12)", borderRadius: 18, padding: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 12, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", color: "#0e2b57" }}>
            Estimated total
          </span>
          <span style={{ fontSize: 18, fontWeight: 900, color: "#165dcc" }}>
            <IndianRupee size={16} style={{ display: "inline", verticalAlign: "-2px" }} />
            {getRupeeLabel(estimatedTotal)}
          </span>
        </div>
        <div style={{ display: "grid", gap: 8, fontSize: 12, fontWeight: 700, color: "rgba(15,23,42,0.68)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
            <span>Room price per day</span>
            <span>₹{getRupeeLabel(price)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
            <span>Stay dates</span>
            <span>{rangeLabel}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
            <span>Selected days</span>
            <span>{selectedDays}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
            <span>Guests</span>
            <span>{selectedGuests}</span>
          </div>
          {hasBlockedSelection ? (
            <div style={{ color: "#b91c1c", fontWeight: 800 }}>
              One or more selected dates are already booked for this room.
            </div>
          ) : null}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, fontSize: 12, fontWeight: 700, color: "rgba(15,23,42,0.68)" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <MapPin size={14} color="#1890ff" />
            {areaLabel}
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <ShieldCheck size={14} color="#1890ff" />
            {home.isAccepting ? "Accepting bookings" : "Closed"}
          </span>
        </div>
      </div>

      {bookingError ? (
        <div style={{ borderRadius: 16, padding: "12px 14px", background: "#fef2f2", color: "#991b1b", fontSize: 13, fontWeight: 700, lineHeight: 1.6 }}>
          {bookingError}
        </div>
      ) : null}

      {successMessage ? (
        <div style={{ borderRadius: 16, padding: "12px 14px", background: "#ecfdf5", color: "#166534", fontSize: 13, fontWeight: 700, lineHeight: 1.6 }}>
          {successMessage}
          {receipt ? (
            <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
              <div style={{ fontSize: 12, opacity: 0.9 }}>
                Booking #{receipt.bookingId.slice(0, 8)} • Total {receipt.totalLabel}
              </div>
              <Link
                href="/bookings"
                style={{
                  display: "inline-flex",
                  width: "fit-content",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "10px 14px",
                  borderRadius: 12,
                  background: "#166534",
                  color: "#fff",
                  textDecoration: "none",
                  fontSize: 13,
                  fontWeight: 800,
                }}
              >
                My Bookings
              </Link>
            </div>
          ) : null}
        </div>
      ) : null}

      {!hasUser ? (
        <button
          type="button"
          onClick={() => setShowAuthModal(true)}
          style={{
            border: "none",
            borderRadius: 16,
            background: "linear-gradient(135deg, #0e2b57, #1890ff)",
            color: "#fff",
            padding: "14px 16px",
            fontSize: 16,
            fontWeight: 900,
            cursor: "pointer",
            boxShadow: "0 10px 24px rgba(24, 144, 255, 0.28)",
          }}
        >
          Sign in to book
        </button>
      ) : (
        <button
          type="button"
          onClick={() => void handleBooking()}
          onMouseEnter={() => setBookHovered(true)}
          onMouseLeave={() => setBookHovered(false)}
          disabled={submitting || loading || !room.isActive}
          style={{
            border: "none",
            borderRadius: 16,
            background: submitting
              ? "linear-gradient(135deg, #93c5fd, #60a5fa)"
              : "linear-gradient(120deg, #0e2b57 0%, #1890ff 50%, #0e2b57 100%)",
            backgroundSize: "220% 100%",
            backgroundPosition: bookHovered ? "100% 0" : "0% 0",
            color: "#fff",
            padding: "14px 16px",
            fontSize: 16,
            fontWeight: 900,
            cursor: submitting ? "not-allowed" : "pointer",
            boxShadow: "0 10px 24px rgba(24, 144, 255, 0.28)",
            display: "inline-flex",
            justifyContent: "center",
            alignItems: "center",
            gap: 8,
            transition: "background-position 220ms ease, transform 180ms ease, box-shadow 180ms ease",
          }}
        >
          {submitting ? "Creating booking..." : room.isActive ? "Book Now" : "Room closed"}
          <ChevronRight size={18} />
        </button>
      )}

        <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} skipProfileStep />
      </section>

      <style jsx>{`
        .famlo-booking-loader {
          position: fixed;
          inset: 0;
          z-index: 1200;
          display: grid;
          place-items: center;
          background: rgba(255, 255, 255, 0.76);
          backdrop-filter: blur(10px);
        }

        .famlo-booking-loader-card {
          width: min(360px, calc(100vw - 32px));
          border-radius: 28px;
          padding: 28px 24px;
          background: linear-gradient(180deg, rgba(255,255,255,0.98), rgba(239,246,255,0.96));
          border: 1px solid rgba(24, 144, 255, 0.16);
          box-shadow: 0 24px 64px rgba(14, 43, 87, 0.18);
          display: grid;
          justify-items: center;
          gap: 14px;
          text-align: center;
        }

        .famlo-booking-loader-logo-wrap {
          position: relative;
          overflow: hidden;
          border-radius: 18px;
          padding: 14px 22px;
          background: linear-gradient(180deg, rgba(255,255,255,0.92), rgba(219,234,254,0.76));
        }

        .famlo-booking-loader-logo {
          position: relative;
          z-index: 1;
          height: 44px;
          width: auto;
          display: block;
          filter: saturate(1.08);
        }

        .famlo-booking-loader-wave {
          position: absolute;
          inset: 0;
          transform: translateX(-120%);
          background: linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.18) 28%, rgba(255,255,255,0.92) 52%, rgba(255,255,255,0.18) 74%, rgba(255,255,255,0) 100%);
          animation: famloLoaderWave 1.45s ease-in-out infinite;
        }

        .famlo-booking-loader-title {
          font-size: 22px;
          font-weight: 900;
          color: #0f172a;
          letter-spacing: -0.03em;
        }

        .famlo-booking-loader-copy {
          font-size: 13px;
          line-height: 1.7;
          font-weight: 700;
          color: rgba(15, 23, 42, 0.68);
          max-width: 260px;
        }

        @keyframes famloLoaderWave {
          0% {
            transform: translateX(-120%);
          }
          100% {
            transform: translateX(120%);
          }
        }
      `}</style>
    </>
  );
}
