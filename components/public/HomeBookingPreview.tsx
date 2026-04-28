//components/public/HomeBookingPreview.tsx

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronDown, Minus, Plus } from "lucide-react";
import { addIndiaDays, getTodayInIndia, isBookingSlotExpired } from "@/lib/booking-time";
import { GuestVerificationForm } from "@/components/account/GuestVerificationForm";
import { buildHostStayOccupancy, type HostStayBookingRecord } from "@/lib/host-stay-availability";
import { enumerateDateRange } from "@/lib/platform-utils";
import { hasGuestVerificationSubmission } from "@/lib/user-profile";

type QuarterOption = {
  id: string;
  label: string;
  time: string;
  meal: string;
  price: number;
  icon?: React.ReactNode;
};

interface HomeBookingPreviewProps {
  homeId: string;
  hostId?: string | null;
  legacyFamilyId?: string | null;
  hostUserId?: string | null;
  homeName: string;
  publicLocation: string;
  googleMapsLink?: string | null;
  maxGuests: number | null;
  platformCommissionPct?: number | null;
  quarterOptions: QuarterOption[];
  blockedDates?: string[];
  existingBookings?: HostStayBookingRecord[];
  sticky?: boolean;
}

import { useRouter } from "next/navigation";
import { useUser } from "@/components/auth/UserContext";
import { AuthModal } from "@/components/auth/AuthModal";
import { recordHostInteractionEvent } from "@/lib/host-interactions";
import { createBrowserSupabaseClient } from "@/lib/supabase";

type RazorpayOrderPayload = {
  provider: "razorpay";
  keyId: string;
  orderId: string;
  amount: number;
  currency: string;
  bookingId: string;
  paymentRowId: string;
};

type RazorpaySuccessResponse = {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
};

type RazorpayFailureResponse = {
  error?: {
    description?: string;
    reason?: string;
  };
};

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => {
      open: () => void;
      on: (event: "payment.failed", handler: (response: RazorpayFailureResponse) => void) => void;
    };
  }
}

const BOOKABLE_KYC_STATUSES = new Set(["auto_verified", "verified", "pending", "pending_review"]);

async function ensureRazorpayCheckout(): Promise<void> {
  if (typeof window === "undefined") return;
  if (window.Razorpay) return;

  await new Promise<void>((resolve, reject) => {
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

export function HomeBookingPreview({
  homeId,
  hostId,
  legacyFamilyId,
  hostUserId,
  homeName,
  publicLocation,
  googleMapsLink,
  maxGuests,
  platformCommissionPct = 18,
  quarterOptions,
  blockedDates = [],
  existingBookings = [],
  sticky = false
}: Readonly<HomeBookingPreviewProps>): React.JSX.Element {
  const router = useRouter();
  const { user, profile, loading, refreshProfile } = useUser();
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [showAuth, setShowAuth] = useState(false);
  const pendingContinueRef = useRef(false);
  const availableQuarters = quarterOptions.filter((quarter) => quarter.price > 0);
  const [selectedQuarterId, setSelectedQuarterId] = useState<string>(availableQuarters[0]?.id ?? "");
  const [guestCount, setGuestCount] = useState(1);
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedEndDate, setSelectedEndDate] = useState("");
  const dateInputRef = useRef<HTMLInputElement>(null);
  const endDateInputRef = useRef<HTMLInputElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "error" | "success"; text: string } | null>(null);
  const [showVerification, setShowVerification] = useState(false);
  const [verificationUnlocked, setVerificationUnlocked] = useState(false);
  const [resumeAfterVerification, setResumeAfterVerification] = useState(false);

  const selectedQuarter = availableQuarters.find((quarter) => quarter.id === selectedQuarterId) ?? null;
  const isFullDay = selectedQuarter?.id === "fullday";
  const today = getTodayInIndia();
  const occupancy = useMemo(() => buildHostStayOccupancy(existingBookings), [existingBookings]);
  const minimumDate =
    !selectedQuarter || !isBookingSlotExpired({ date: today, quarterType: selectedQuarter.id })
      ? today
      : addIndiaDays(today, 1);
  const effectiveDate = selectedDate || minimumDate;
  const effectiveEndDate = selectedEndDate || effectiveDate;
  const bookingDayCount = useMemo(() => {
    if (!isFullDay) return 1;
    return Math.max(1, enumerateDateRange(effectiveDate, effectiveEndDate).length);
  }, [effectiveDate, effectiveEndDate, isFullDay]);
  const total = selectedQuarter ? selectedQuarter.price * guestCount * bookingDayCount : 0;
  const guestLimit = Math.max(1, maxGuests ?? 1);
  const canBook = availableQuarters.length > 0;
  const hasSavedVerification =
    hasGuestVerificationSubmission(profile) || BOOKABLE_KYC_STATUSES.has(profile?.kyc_status ?? "");
  const verificationReady = verificationUnlocked || hasSavedVerification;
  const selectedDateHasExpired =
    Boolean(selectedDate) &&
    Boolean(selectedQuarter) &&
    isBookingSlotExpired({ date: selectedDate, quarterType: selectedQuarter?.id });
  const formatDisplayDate = (value: string): string => {
    if (!value) return "Select a date";
    try {
      return new Date(`${value}T00:00:00`).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    } catch {
      return value;
    }
  };
  const getDateConflictMessage = useCallback(
    (dateStr: string): string | null => {
      if (!dateStr) return null;

      if (blockedDates.includes(dateStr) || blockedDates.includes(`${dateStr}::fullday`)) {
        return "This date is blocked by the host.";
      }

      if (!selectedQuarter) {
        return null;
      }

      const dayOccupancy = occupancy[dateStr];
      if (!dayOccupancy) {
        return null;
      }

      if (selectedQuarter.id === "fullday") {
        return dayOccupancy.anyBooking ? "This day is already booked. Please choose another date." : null;
      }

      if (dayOccupancy.fullDayGuests > 0) {
        return "This day is already booked for a full-day stay.";
      }

      const bookedGuests = dayOccupancy.quarterGuests[selectedQuarter.id as "morning" | "afternoon" | "evening"] ?? 0;
      if (bookedGuests + guestCount > guestLimit) {
        return `This ${selectedQuarter.label.toLowerCase()} slot is full for this date.`;
      }

      return null;
    },
    [blockedDates, guestCount, guestLimit, occupancy, selectedQuarter]
  );
  const openPicker = (ref: React.RefObject<HTMLInputElement | null>) => {
    const input = ref.current;
    if (input && "showPicker" in input) {
      (input as HTMLInputElement & { showPicker?: () => void }).showPicker?.();
    } else {
      (input as HTMLInputElement | null)?.click();
    }
  };
  const handleContinue = useCallback(async (fromAuth = false) => {
    const bookingDate = selectedDate || minimumDate;
    const bookingEndDate = selectedQuarterId === "fullday" ? (selectedEndDate || bookingDate) : bookingDate;
    const conflictMessage = getDateConflictMessage(bookingDate);

    if (!selectedDate) {
      setSelectedDate(bookingDate);
    }
    if (selectedQuarterId === "fullday" && !selectedEndDate) {
      setSelectedEndDate(bookingEndDate);
    }

    if (conflictMessage) {
      setFeedback({ type: "error", text: conflictMessage });
      return;
    }

    if (!user) {
      pendingContinueRef.current = true;
      setShowAuth(true);
      return;
    }

    if (!selectedQuarter) {
      setFeedback({ type: "error", text: "Choose a visit slot first." });
      return;
    }

    if (selectedDateHasExpired) {
      setFeedback({ type: "error", text: "The selected date is no longer available. Please choose the next available date." });
      return;
    }

    if (!verificationReady) {
      setShowVerification(true);
      if (!fromAuth) {
        setFeedback({ type: "error", text: "Upload and submit your ID once, then you can pay and confirm the booking here." });
      }
      return;
    }

    setFeedback(null);
    setSubmitting(true);

    try {
      const welcomeMessage = `Hi ${profile?.name ?? "guest"},

Welcome to the Famlo family.

You are about to experience the real ${publicLocation || "India"}. We are thrilled to host your journey.

Your stay details:
Host area: ${publicLocation || "Shared after booking"}
Property: ${homeName}
Map pin: ${googleMapsLink || "Shared securely inside Famlo after confirmation"}

Safety first:
- Keep all payments and communication on Famlo
- Please avoid sharing personal contact details in chat
- Famlo may monitor chats for fraud prevention and safety

Need help during your stay? Use the Famlo assistance path from your booking thread. If it is urgent, open the emergency support option in your booking dashboard and our team can help right away.`;
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const authHeaders: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (session?.access_token) authHeaders.Authorization = `Bearer ${session.access_token}`;
      if (user.id) authHeaders["x-famlo-user-id"] = user.id;
      if (user.email) authHeaders["x-famlo-user-email"] = user.email;

      const bookingResponse = await fetch("/api/bookings/create", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          bookingType: "host_stay",
          userId: user.id,
          hostId: hostId ?? null,
          legacyFamilyId: legacyFamilyId ?? null,
          quarterType: selectedQuarter.id,
          quarterTime: selectedQuarter.time,
          startDate: bookingDate,
          endDate: bookingEndDate,
          guestsCount: guestCount,
          unitPrice: selectedQuarter.price,
          commissionPct: platformCommissionPct ?? 18,
          couponCode: null,
          vibe: "cultural",
          guestName: profile?.name ?? user.email ?? "Guest",
          guestCity: profile?.city ?? null,
          listingName: homeName,
          hostArea: publicLocation || "Shared after booking",
          hostUserId: hostUserId ?? null,
          welcomeMessage,
        }),
      });

      const bookingPayload = await bookingResponse.json();
      if (!bookingResponse.ok || bookingPayload.error) {
        throw new Error(bookingPayload.error ?? "Could not create booking.");
      }

      void recordHostInteractionEvent({
        eventType: "booking_request",
        hostId: hostId ?? null,
        legacyFamilyId: legacyFamilyId ?? null,
        pagePath: typeof window !== "undefined" ? window.location.pathname : null,
        metadata: {
          bookingId: typeof bookingPayload.bookingId === "string" ? bookingPayload.bookingId : null,
          homeId,
          guestCount,
          quarterType: selectedQuarter.id,
        },
      });

      const bookingSavedMessage = "Booking created and saved in Famlo. Opening secure payment now.";
      const paymentIntentResponse = await fetch("/api/payments/create-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookingId: bookingPayload.bookingId,
          gateway: "razorpay",
        }),
      });

      const paymentIntentPayload = await paymentIntentResponse.json();
      if (!paymentIntentResponse.ok || paymentIntentPayload.error) {
        setFeedback({
          type: "success",
          text: `${bookingSavedMessage} Payment setup needs one more retry, so please complete it from your bookings dashboard.`,
        });
        router.push("/bookings");
        return;
      }

      if (paymentIntentPayload.integrationStatus === "razorpay_ready" && paymentIntentPayload.order) {
        await ensureRazorpayCheckout();
        const order = paymentIntentPayload.order as RazorpayOrderPayload;
        const RazorpayCheckout = window.Razorpay;

        if (!RazorpayCheckout) {
          throw new Error("Razorpay Checkout is unavailable.");
        }

        const checkout = new RazorpayCheckout({
          key: order.keyId,
          amount: order.amount,
          currency: order.currency,
          name: "Famlo",
          description: `Booking for ${homeName}`,
          order_id: order.orderId,
          prefill: {
            name: profile?.name ?? undefined,
            email: profile?.email ?? user.email ?? undefined,
          },
          notes: {
            booking_id: order.bookingId,
            payment_row_id: order.paymentRowId,
          },
          handler: (paymentResponse: RazorpaySuccessResponse) => {
            void (async () => {
              try {
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

                void recordHostInteractionEvent({
                  eventType: "booking_confirmed",
                  hostId: hostId ?? null,
                  legacyFamilyId: legacyFamilyId ?? null,
                  pagePath: typeof window !== "undefined" ? window.location.pathname : null,
                  metadata: {
                    bookingId: order.bookingId,
                    paymentRowId: order.paymentRowId,
                    homeId,
                    quarterType: selectedQuarter.id,
                  },
                });

                setFeedback({
                  type: "success",
                  text: "Payment verified and booking confirmed. The host has been notified in Famlo.",
                });
                router.push("/bookings");
              } catch (verifyError) {
                setFeedback({
                  type: "error",
                  text: verifyError instanceof Error ? verifyError.message : "Payment verification failed.",
                });
              } finally {
                setSubmitting(false);
              }
            })();
          },
          modal: {
            ondismiss: () => {
              setSubmitting(false);
              setFeedback({
                type: "success",
                text: "Your booking was created. Complete the Razorpay payment from your bookings dashboard to confirm it.",
              });
            },
          },
          theme: {
            color: "#165dcc",
          },
        });

        checkout.on("payment.failed", (failureResponse) => {
          setSubmitting(false);
          setFeedback({
            type: "error",
            text:
              failureResponse.error?.description ??
              failureResponse.error?.reason ??
              "Payment failed. The booking was created but payment is still pending.",
          });
        });

        checkout.open();
        return;
      }

      setFeedback({
        type: "success",
        text: "Booking created. Live payment keys are not fully configured, so payment is pending for now.",
      });
    } catch (error) {
      setFeedback({
        type: "error",
        text: error instanceof Error ? error.message : "Booking failed.",
      });
    } finally {
      setSubmitting(false);
    }
  }, [
    guestCount,
    hostId,
    homeName,
    googleMapsLink,
    hostUserId,
    legacyFamilyId,
    minimumDate,
    platformCommissionPct,
    profile?.city,
    profile?.email,
    profile?.name,
    publicLocation,
    router,
    selectedDate,
    selectedDateHasExpired,
    selectedEndDate,
    selectedQuarter,
    selectedQuarterId,
    getDateConflictMessage,
    supabase,
    user,
    verificationReady,
  ]);

  useEffect(() => {
    if (!pendingContinueRef.current || loading || !user) {
      return;
    }

    pendingContinueRef.current = false;
    void handleContinue(true);
  }, [handleContinue, loading, user]);

  useEffect(() => {
    if (!resumeAfterVerification || !verificationUnlocked) {
      return;
    }

    setResumeAfterVerification(false);
    void handleContinue(true);
  }, [handleContinue, resumeAfterVerification, verificationUnlocked]);

  return (
    <div
      className="booking-preview famlo-preview-card"
      id="booking-panel"
      style={sticky ? { position: "sticky", top: 120 } : undefined}
    >
      <div className="famlo-preview-head">
        <h2>Choose your visit</h2>
        <p>Select a slot, date, and number of guests</p>
      </div>

      <div className="famlo-preview-slots">
        {availableQuarters.map((quarter) => (
          <button
            className={`famlo-preview-slot ${selectedQuarterId === quarter.id ? "is-selected" : ""}`}
            key={quarter.id}
            onClick={() => setSelectedQuarterId(quarter.id)}
            type="button"
          >
            <div className="famlo-preview-slot-icon">{quarter.icon}</div>
            <div className="famlo-preview-slot-copy">
              <strong>{quarter.label}</strong>
              <span>{quarter.time}</span>
              <small>{quarter.meal}</small>
            </div>
            <div className="famlo-preview-slot-price">
              <strong>₹{quarter.price.toLocaleString("en-IN")}</strong>
              <span>/ guest</span>
            </div>
            <div className="famlo-preview-slot-radio" />
          </button>
        ))}
      </div>

      <div className="famlo-preview-fields">
        <label className="famlo-preview-field">
          <span className="famlo-preview-label">{isFullDay ? "Visit date" : "Visit date"}</span>
          <input
            ref={dateInputRef}
            className="text-input booking-field-input"
            min={minimumDate}
            onChange={(event) => {
              const nextDate = event.target.value;
              setSelectedDate(nextDate);
              if (isFullDay && (!selectedEndDate || selectedEndDate < nextDate)) {
                setSelectedEndDate(nextDate);
              }
            }}
            type="date"
            value={selectedDate}
            style={{ position: "absolute", opacity: 0, pointerEvents: "none", width: 0, height: 0 }}
          />
          <button
            type="button"
            className="famlo-preview-picker"
            onClick={() => openPicker(dateInputRef)}
          >
            <CalendarDays size={16} />
            <span>{formatDisplayDate(effectiveDate)}</span>
            <ChevronDown size={16} />
          </button>
        </label>
        {selectedDate ? (
          <p className="booking-note" style={{ marginTop: 0 }}>
            {getDateConflictMessage(selectedDate) ?? "This date is available for the selected slot."}
          </p>
        ) : null}
        {isFullDay ? (
          <label className="famlo-preview-field">
            <span className="famlo-preview-label">Until</span>
            <input
              ref={endDateInputRef}
              className="text-input booking-field-input"
              min={selectedDate || minimumDate}
              onChange={(event) => setSelectedEndDate(event.target.value)}
              type="date"
              value={selectedEndDate}
              style={{ position: "absolute", opacity: 0, pointerEvents: "none", width: 0, height: 0 }}
            />
            <button
              type="button"
              className="famlo-preview-picker"
              onClick={() => openPicker(endDateInputRef)}
            >
              <CalendarDays size={16} />
              <span>{formatDisplayDate(effectiveEndDate)}</span>
              <ChevronDown size={16} />
            </button>
          </label>
        ) : null}
        <div className="famlo-preview-field">
          <span className="famlo-preview-label">Guests</span>
          <div className="famlo-preview-counter">
            <span>Guests</span>
            <div className="famlo-preview-counter-controls">
              <button onClick={() => setGuestCount((count) => Math.max(1, count - 1))} type="button">
                <Minus size={14} />
              </button>
              <strong>{guestCount}</strong>
              <button onClick={() => setGuestCount((count) => Math.min(guestLimit, count + 1))} type="button">
                <Plus size={14} />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="famlo-preview-total">
        <div>
          <small>
            Total for {guestCount} guest{guestCount > 1 ? "s" : ""}{isFullDay ? ` · ${bookingDayCount} day${bookingDayCount > 1 ? "s" : ""}` : ""}
          </small>
          <strong>₹{total.toLocaleString("en-IN")}</strong>
        </div>
        <div>
          <small>{isFullDay ? "per stay" : "per slot"}</small>
          <span>No hidden fees</span>
        </div>
      </div>

      <button className="famlo-preview-cta" disabled={!canBook || submitting} onClick={() => void handleContinue()}>
        {submitting ? "Processing..." : "Get it now"}
      </button>
      <div className="famlo-preview-certified">Famlo certified home</div>
      {feedback ? (
        <p
          style={{
            margin: "10px 18px 0",
            fontSize: 13,
            color: feedback.type === "error" ? "#b91c1c" : "#166534",
            fontWeight: 700,
          }}
        >
          {feedback.text}
        </p>
      ) : null}
      {!canBook ? (
        <p style={{ margin: "10px 0 0", fontSize: 13, color: "#b91c1c", fontWeight: 700 }}>
          Pricing is not configured for this home yet, so booking is temporarily unavailable.
        </p>
      ) : selectedDateHasExpired ? (
        <p style={{ margin: "10px 0 0", fontSize: 13, color: "#b45309", fontWeight: 700 }}>
          The selected date is no longer available for this slot in India time. Please pick the next available date.
        </p>
      ) : null}

      {showAuth ? (
        <AuthModal
          isOpen={showAuth}
          skipProfileStep
          onClose={() => {
            setShowAuth(false);
          }}
        />
      ) : null}

      {showVerification ? (
        <div style={{ padding: "18px" }}>
          <GuestVerificationForm
            compact
            title="Complete guest profile first"
            description="Add your booking profile and Aadhaar-with-face capture here. Once done, you can pay directly from this page."
            buttonLabel="Submit verification"
            onSuccess={async () => {
              await refreshProfile();
              setVerificationUnlocked(true);
              setShowVerification(false);
              setResumeAfterVerification(true);
              setFeedback({
                type: "success",
                text: "Profile submitted to admin/team review. Your document is saved, and payment can continue now.",
              });
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
