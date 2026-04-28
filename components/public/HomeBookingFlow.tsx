//components/public/HomeBookingFlow.tsx

"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bath,
  BedDouble,
  CalendarDays,
  ChevronDown,
  Coffee,
  Heart,
  Home as HomeIcon,
  IndianRupee,
  Lock,
  MapPin,
  MessageCircle,
  Minus,
  ParkingCircle,
  Plus,
  Share2,
  ShieldCheck,
  Snowflake,
  Sun,
  SunMoon,
  Sunrise,
  Sunset,
  Tv,
  Users,
  UtensilsCrossed,
  Wifi,
  Zap,
} from "lucide-react";

import { GuestVerificationForm } from "@/components/account/GuestVerificationForm";
import { AuthModal } from "@/components/auth/AuthModal";
import type { HomeCardRecord } from "@/lib/discovery";
import { getTodayInIndia } from "@/lib/booking-time";
import { recordHostInteractionEvent } from "@/lib/host-interactions";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import { buildHostStayOccupancy, type HostStayBookingRecord } from "@/lib/host-stay-availability";
import type { StayUnitRecord } from "@/lib/stay-units";

type BookingStep = "login" | "kyc" | "quarter" | "date" | "guests" | "confirm";

interface HomeBookingFlowProps {
  home: HomeCardRecord;
  existingBookings?: HostStayBookingRecord[];
  stayUnits?: StayUnitRecord[];
}

type QuarterOption = {
  id: "morning" | "afternoon" | "evening" | "fullday";
  label: string;
  time: string;
  meal: string;
  price: number;
  icon?: React.ReactNode;
};

type BookingReceipt = {
  bookingId: string;
  conversationId: string | null;
  paymentId: string | null;
  hostArea: string;
  listingName: string;
  quarterLabel: string;
  quarterTime: string;
  visitDateLabel: string;
  guestsLabel: string;
  totalLabel: string;
};

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

type QuoteState = {
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  totalPrice: number;
  partnerPayoutAmount: number;
  platformFee: number;
  couponCode: string | null;
};

const DEFAULT_ACTIVE_QUARTERS = ["morning", "afternoon", "evening", "fullday"];
const BOOKABLE_KYC_STATUSES = new Set(["auto_verified", "verified", "pending", "pending_review"]);

const QUARTERS: QuarterOption[] = [
  { id: "morning", label: "Morning", time: "7AM - 12PM", meal: "Breakfast included", price: 0, icon: <Sunrise size={18} strokeWidth={2.2} /> },
  { id: "afternoon", label: "Afternoon", time: "12PM - 5PM", meal: "Lunch included", price: 0, icon: <Sun size={18} strokeWidth={2.2} /> },
  { id: "evening", label: "Evening", time: "5PM - 10PM", meal: "Dinner included", price: 0, icon: <Sunset size={18} strokeWidth={2.2} /> },
  { id: "fullday", label: "Full Day", time: "7AM - 10PM", meal: "All meals included", price: 0, icon: <SunMoon size={18} strokeWidth={2.2} /> }
];

function getToday(): string {
  return getTodayInIndia();
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

function compareDateStrings(left: string, right: string): number {
  return left.localeCompare(right);
}

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

export function HomeBookingFlow({ home, existingBookings = [], stayUnits = [] }: Readonly<HomeBookingFlowProps>): React.JSX.Element {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const searchParams = useSearchParams();
  const inlineWidgetRef = useRef<HTMLDivElement>(null);
  const resumeStepRef = useRef<BookingStep>("quarter");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);
  const [guestName, setGuestName] = useState<string | null>(null);
  const [guestCity, setGuestCity] = useState<string | null>(null);
  const [kycStatus, setKycStatus] = useState<string | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [step, setStep] = useState<BookingStep>("login");
  const [authError, setAuthError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [bookingReceipt, setBookingReceipt] = useState<BookingReceipt | null>(null);
  const [couponCode, setCouponCode] = useState("");
  const [quote, setQuote] = useState<QuoteState | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [saved, setSaved] = useState(false);
  const [aboutExpanded, setAboutExpanded] = useState(false);
  const requestedStep = searchParams.get("step");
  const requestedEntry = searchParams.get("entry");
  const requestedStayUnitId = searchParams.get("stay_unit_id");

  const activeStayUnits = useMemo(() => stayUnits.filter((unit) => unit.isActive), [stayUnits]);
  const activeStayUnitCount = activeStayUnits.length;
  const hasAnyActiveStayUnits = activeStayUnitCount > 0;
  const hasClosedRooms = stayUnits.some((unit) => !unit.isActive);
  const primaryStayUnitId = useMemo(
    () => stayUnits.find((unit) => unit.isPrimary)?.id ?? stayUnits[0]?.id ?? null,
    [stayUnits]
  );
  const [selectedStayUnitId, setSelectedStayUnitId] = useState<string>(activeStayUnits[0]?.id ?? stayUnits[0]?.id ?? "");
  const selectedStayUnit = useMemo(
    () => activeStayUnits.find((unit) => unit.id === selectedStayUnitId) ?? activeStayUnits[0] ?? null,
    [activeStayUnits, selectedStayUnitId]
  );
  const effectiveBlockedDates = useMemo(
    () => Array.from(new Set([...(home.blockedDates ?? []), ...(selectedStayUnit?.blockedDates ?? [])])),
    [home.blockedDates, selectedStayUnit?.blockedDates]
  );
  const getAuthHeaders = useCallback(async (): Promise<Record<string, string>> => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const headers: Record<string, string> = {};
    if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
    if (currentUserId) headers["x-famlo-user-id"] = currentUserId;
    if (currentUserEmail) headers["x-famlo-user-email"] = currentUserEmail;
    return headers;
  }, [currentUserEmail, currentUserId, supabase]);

  useEffect(() => {
    if (requestedStayUnitId && stayUnits.some((unit) => unit.id === requestedStayUnitId && unit.isActive)) {
      setSelectedStayUnitId(requestedStayUnitId);
      return;
    }

    if (!selectedStayUnitId && activeStayUnits[0]) {
      setSelectedStayUnitId(activeStayUnits[0].id);
      return;
    }

    if (selectedStayUnitId && !stayUnits.some((unit) => unit.id === selectedStayUnitId && unit.isActive) && activeStayUnits[0]) {
      setSelectedStayUnitId(activeStayUnits[0].id);
    }
  }, [activeStayUnits, requestedStayUnitId, selectedStayUnitId, stayUnits]);

  const quarterOptions = useMemo(() => {
    const activeQuarters = home.activeQuarters.length > 0 ? home.activeQuarters : DEFAULT_ACTIVE_QUARTERS;
    const quarterPriceMap = {
      morning: selectedStayUnit?.priceMorning && selectedStayUnit.priceMorning > 0 ? selectedStayUnit.priceMorning : home.priceMorning,
      afternoon: selectedStayUnit?.priceAfternoon && selectedStayUnit.priceAfternoon > 0 ? selectedStayUnit.priceAfternoon : home.priceAfternoon,
      evening: selectedStayUnit?.priceEvening && selectedStayUnit.priceEvening > 0 ? selectedStayUnit.priceEvening : home.priceEvening,
      fullday: selectedStayUnit?.priceFullday && selectedStayUnit.priceFullday > 0 ? selectedStayUnit.priceFullday : home.priceFullday
    };

    return QUARTERS.map((quarter) => ({
      ...quarter,
      price: quarterPriceMap[quarter.id]
    })).filter((quarter) => activeQuarters.includes(quarter.id) && quarter.price > 0);
  }, [home, selectedStayUnit]);

  const [selectedQuarterId, setSelectedQuarterId] = useState<string>(quarterOptions[0]?.id ?? "");
  const [dateFrom, setDateFrom] = useState(getToday());
  const [dateTo, setDateTo] = useState(getToday());
  const dateFromRef = useRef<HTMLInputElement>(null);
  const dateToRef = useRef<HTMLInputElement>(null);
  const [guestCount, setGuestCount] = useState(1);
  const [vibe, setVibe] = useState<"cultural" | "quiet">("cultural");
  const occupancyRows = useMemo(() => {
    if (!selectedStayUnit) {
      return existingBookings;
    }

    return existingBookings.filter((booking) => {
      if (booking.stayUnitId) {
        return booking.stayUnitId === selectedStayUnit.id;
      }

      return primaryStayUnitId ? selectedStayUnit.id === primaryStayUnitId : true;
    });
  }, [existingBookings, primaryStayUnitId, selectedStayUnit]);
  const occupancy = useMemo(() => buildHostStayOccupancy(occupancyRows), [occupancyRows]);

  const selectedQuarter = useMemo(
    () => quarterOptions.find((quarter) => quarter.id === selectedQuarterId) ?? null,
    [quarterOptions, selectedQuarterId]
  );
  const guestFitStayUnits = useMemo(
    () =>
      activeStayUnits
        .filter((unit) => unit.maxGuests >= guestCount)
        .sort((left, right) => left.maxGuests - right.maxGuests || left.priceFullday - right.priceFullday || left.sortOrder - right.sortOrder),
    [activeStayUnits, guestCount]
  );
  const selectedRoomTooSmall = Boolean(selectedStayUnit && guestCount > selectedStayUnit.maxGuests);
  const earliestSelectableDate = useMemo(() => getToday(), []);

  const isFullDayBooking = selectedQuarter?.id === "fullday";
  const guestLimit = Math.max(1, selectedStayUnit?.maxGuests ?? home.maxGuests ?? 1);
  const publicLocation = [home.village, home.city, home.state].filter(Boolean).join(", ");
  const bookingDays = isFullDayBooking ? enumerateDates(dateFrom, dateTo) : [dateFrom];
  const estimatedTotalPrice = selectedQuarter ? selectedQuarter.price * Math.max(1, bookingDays.length) : 0;
  const bookingDayLabel = isFullDayBooking
    ? `${Math.max(1, bookingDays.length)} day${Math.max(1, bookingDays.length) > 1 ? "s" : ""}`
    : "slot";
  const hostDisplayName = home.name.replace(/'s Home$/i, "").trim() || home.listingTitle || "Famlo host";
  const hostInitial = hostDisplayName.charAt(0).toUpperCase() || "F";
  const heroImages = (home.imageUrls.length > 0 ? home.imageUrls : [home.hostPhotoUrl ?? ""]).filter(Boolean).slice(0, 3);
  const displayImages = heroImages.length >= 3 ? heroImages : Array.from({ length: 3 }, (_, index) => heroImages[index] ?? heroImages[0] ?? "");
  const aboutParagraphs = [
    home.description ||
      "Tucked into a warm neighborhood, this Famlo stay is designed for guests who want comfort, local connection, and a calm place to reset between journeys.",
    home.culturalOffering ||
      home.neighborhoodDesc ||
      "Expect a deeply local rhythm here, with familiar food, everyday stories, and a stay that feels more human than transactional.",
  ];
  const experienceCards = [
    {
      title: "Genuine connections",
      body: "Meet real hosts, not faceless inventory. Every stay is shaped by the family and neighborhood around it.",
      icon: <Users size={20} />,
    },
    {
      title: "Home-cooked nutrition",
      body: "Quarter stays can include familiar meals and a softer, more affordable rhythm than hotel bookings.",
      icon: <UtensilsCrossed size={20} />,
    },
    {
      title: "Verified and safe",
      body: "Famlo keeps host identity, booking, and support flows inside the platform for safer travel.",
      icon: <ShieldCheck size={20} />,
    },
    {
      title: "Truly affordable",
      body: "Choose the exact part of the day you need instead of paying for more time than your trip requires.",
      icon: <IndianRupee size={20} />,
    },
  ];
  const amenityIconMap = new Map<string, () => React.JSX.Element>([
    ["wifi", () => <Wifi size={18} />],
    ["air conditioning", () => <Snowflake size={18} />],
    ["ac", () => <Snowflake size={18} />],
    ["hot shower", () => <Bath size={18} />],
    ["charging points", () => <Zap size={18} />],
    ["secure room", () => <Lock size={18} />],
    ["chai included", () => <Coffee size={18} />],
    ["parking", () => <ParkingCircle size={18} />],
    ["near metro", () => <MapPin size={18} />],
    ["common tv", () => <Tv size={18} />],
    ["fresh linen", () => <BedDouble size={18} />],
    ["24 hr water", () => <Bath size={18} />],
  ]);
  const amenityItems = (home.amenities.length > 0
    ? home.amenities
    : [
        "Wi-Fi",
        "Air conditioning",
        "Hot shower",
        "Charging points",
        "Secure room",
        "Chai included",
        "Fresh linen",
        "24 hr water",
        "Common TV",
        "Near metro",
        "Toiletries",
        "Parking",
      ]).slice(0, 12);
  const includedItems = home.includedItems.length > 0 ? home.includedItems : ["Breakfast", "Tea", "Snacks", "Fresh linen"];
  const houseRules = home.houseRules.length > 0
    ? home.houseRules
    : [
        "Please keep the stay calm and respectful after evening hours.",
        "Outside visitors are allowed only with host approval.",
        "Smoking should stay outside the room and shared indoor areas.",
        "Use water and electricity thoughtfully during your stay.",
        "Exact address and host details are shared only after confirmed booking.",
        "Famlo support is available if anything feels unclear or unsafe.",
      ];
  const stories = [
    ["Arjun M.", "Mumbai", "Hospitality", "The stay felt personal in the best way. I came tired and left feeling looked after."],
    ["Sneha R.", "Chennai", "Safety + food", "I booked for a short window and still felt fully settled. The food and warmth made the difference."],
    ["Kiran P.", "Bengaluru", "Great value", "Quarter booking was perfect for my travel schedule. I paid only for the time I really needed."],
  ];
  const setupRows = [
    { title: "Private bedroom", body: "Cozy sleeping space for your stay", icon: BedDouble, badge: "Private" },
    { title: home.bathroomType || "Bathroom access", body: "Comfortable and practical for short stays", icon: Bath, badge: "Shared" },
    { title: "Home kitchen", body: "Meals and refreshments are host-led", icon: UtensilsCrossed, badge: "Host-run" },
    { title: "Common living area", body: "Warm shared corners for rest and conversation", icon: HomeIcon, badge: "Shared" },
  ];
  const requiresHostApproval = Boolean(home.bookingRequiresHostApproval);
  const selectedRoomLabel = selectedStayUnit?.name ?? home.listingTitle ?? home.name;

  useEffect(() => {
    void recordHostInteractionEvent({
      eventType: "booking_page_open",
      hostId: home.hostId ?? null,
      legacyFamilyId: home.legacyFamilyId ?? null,
      pagePath: typeof window !== "undefined" ? window.location.pathname : null,
      metadata: {
        homeId: home.id,
        listingName: home.listingTitle ?? home.name,
      },
    });
  }, [home.hostId, home.id, home.legacyFamilyId, home.listingTitle, home.name]);

  function formatDisplayDate(value: string): string {
    if (!value) return "Select date";
    try {
      return new Date(`${value}T00:00:00`).toLocaleDateString("en-IN", {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    } catch {
      return value;
    }
  }

  function openDatePicker(ref: React.RefObject<HTMLInputElement | null>): void {
    const input = ref.current;
    if (input && "showPicker" in input) {
      (input as HTMLInputElement & { showPicker?: () => void }).showPicker?.();
    } else {
      (input as HTMLInputElement | null)?.click();
    }
  }

  function renderWidget(showInline = false): React.JSX.Element {
    return (
      <div className={`famlo-booking-widget ${showInline ? "famlo-booking-widget-inline" : ""}`} ref={showInline ? inlineWidgetRef : undefined}>
        {loadingAuth ? (
          <div className="famlo-state-card">
            <h3>Loading booking state</h3>
            <p>Checking your Famlo account and booking access.</p>
          </div>
        ) : null}

        {!loadingAuth && step === "login" ? (
          <div className="famlo-state-card">
            <h3>Sign in to continue</h3>
            <p>Use the same Famlo login flow. Your booking, payment, and messages will stay connected.</p>
            {authError ? <div className="auth-error">{authError}</div> : null}
            <button
              className="famlo-cta-button"
              onClick={() => {
                setAuthError(null);
                setShowAuthModal(true);
              }}
              type="button"
            >
              Get it now
            </button>
          </div>
        ) : null}

        {!loadingAuth && step === "kyc" ? (
          <div className="famlo-state-card">
            <h3>Verification needed</h3>
            <p>
              Your current status is <strong>{kycStatus ?? "not_started"}</strong>.
              {kycStatus === "pending" || kycStatus === "pending_review"
                ? " Your ID was already submitted, and Famlo is reviewing it."
                : " Submit once and continue."}
            </p>
            <GuestVerificationForm
              compact
              title="Submit guest verification"
              description="Add your booking profile and Aadhaar-with-face capture here."
              buttonLabel="Submit verification"
              onSuccess={async () => {
                const nextState = await syncAuthState();
                if (nextState.userId && BOOKABLE_KYC_STATUSES.has(nextState.kycStatus ?? "")) {
                  setBookingError(null);
                  setStep(resumeStepRef.current);
                }
              }}
            />
          </div>
        ) : null}

        {!loadingAuth && BOOKABLE_KYC_STATUSES.has(kycStatus ?? "") ? (
          <div className="booking-widget-shell famlo-booking-shell">
            <div className="famlo-widget-head">
              <span className="famlo-section-label">Choose your visit</span>
              <h2>Select a slot, date, and number of guests</h2>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
                <span className="famlo-setup-badge">
                  {activeStayUnitCount > 0 ? `${activeStayUnitCount} active room${activeStayUnitCount === 1 ? "" : "s"}` : `${stayUnits.length} room${stayUnits.length === 1 ? "" : "s"} inactive`}
                </span>
                <span className="famlo-setup-badge">
                  {stayUnits.length > 0 ? `${stayUnits.length} total room${stayUnits.length === 1 ? "" : "s"}` : "No room cards yet"}
                </span>
              </div>
            </div>
            {hasClosedRooms ? (
              <div className="famlo-state-card" style={{ marginBottom: 16, borderColor: "rgba(220, 38, 38, 0.2)", background: "linear-gradient(180deg, #fff1f2, #fff7ed)" }}>
                <h3>Rooms are closed right now</h3>
                <p>
                  The host has temporarily closed every room on this listing. Public room cards disappear while closed, and booking will return when at least one room is reopened.
                </p>
              </div>
            ) : (
            <>
            {requiresHostApproval ? (
              <div className="famlo-state-card" style={{ marginBottom: 16, borderColor: "rgba(234, 179, 8, 0.35)", background: "linear-gradient(180deg, #fffbeb, #fff7ed)" }}>
                <h3>Host approval required</h3>
                <p>
                  This stay may be confirmed after the host reviews your booking request. Payment still stays inside Famlo, and the host will be notified immediately.
                </p>
              </div>
            ) : null}

            {step === "quarter" ? (
              quarterOptions.length > 0 ? (
                <div className="famlo-slot-list">
                  {quarterOptions.map((quarter) => (
                    <button
                      className={`famlo-slot-card ${selectedQuarterId === quarter.id ? "is-selected" : ""}`}
                      key={quarter.id}
                      onClick={() => setSelectedQuarterId(quarter.id)}
                      type="button"
                    >
                      <span className="famlo-slot-icon">{quarter.icon}</span>
                      <span className="famlo-slot-copy">
                        <strong>{quarter.label}</strong>
                        <small>{quarter.time}</small>
                        <em>{quarter.meal}</em>
                      </span>
                      <span className="famlo-slot-price">Rs. {quarter.price.toLocaleString("en-IN")}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <p>No active room pricing is available for this Home right now.</p>
              )
            ) : null}

            {step === "date" ? (
              <div className="famlo-widget-fields">
                <label className="famlo-picker-field">
                  <span>Visit date</span>
                  <input
                    ref={dateFromRef}
                    className="text-input"
                    min={earliestSelectableDate}
                    onChange={(event) => setDateFrom(event.target.value)}
                    type="date"
                    value={dateFrom}
                    style={{ position: "absolute", opacity: 0, pointerEvents: "none", width: 0, height: 0 }}
                  />
                  <button className="famlo-picker-button" onClick={() => openDatePicker(dateFromRef)} type="button">
                    <CalendarDays size={18} />
                    <span>{formatDisplayDate(dateFrom)}</span>
                    <ChevronDown size={16} />
                  </button>
                </label>
                {dateFrom ? (
                  <p style={{ margin: "-8px 0 0", fontSize: 12, fontWeight: 700, color: isUnavailableDate(dateFrom) ? "#b91c1c" : "#166534" }}>
                    {isUnavailableDate(dateFrom)
                      ? "This date is already booked for the selected slot."
                      : "This date is open for the selected slot."}
                  </p>
                ) : null}

                {isFullDayBooking ? (
                  <label className="famlo-picker-field">
                    <span>Until</span>
                    <input
                      ref={dateToRef}
                      className="text-input"
                      min={dateFrom}
                      onChange={(event) => setDateTo(event.target.value)}
                      type="date"
                      value={dateTo}
                      style={{ position: "absolute", opacity: 0, pointerEvents: "none", width: 0, height: 0 }}
                    />
                    <button className="famlo-picker-button" onClick={() => openDatePicker(dateToRef)} type="button">
                      <CalendarDays size={18} />
                      <span>{formatDisplayDate(dateTo)}</span>
                      <ChevronDown size={16} />
                    </button>
                  </label>
                ) : null}
              </div>
            ) : null}

            {step === "guests" ? (
              <div className="famlo-widget-fields">
                <div className="famlo-counter-field">
                  <span>Guests</span>
                  <div className="famlo-counter-controls">
                    <button onClick={() => setGuestCount((value) => Math.max(1, value - 1))} type="button">
                      <Minus size={16} />
                    </button>
                    <strong>{guestCount}</strong>
                    <button onClick={() => setGuestCount((value) => Math.min(guestLimit, value + 1))} type="button">
                      <Plus size={16} />
                    </button>
                  </div>
                </div>
                <label className="famlo-picker-field">
                  <span>Stay vibe</span>
                  <select className="famlo-select-field" onChange={(event) => setVibe(event.target.value as "cultural" | "quiet")} value={vibe}>
                    <option value="cultural">Cultural</option>
                    <option value="quiet">Quiet</option>
                  </select>
                </label>
              </div>
            ) : null}

            {step === "confirm" ? (
              <div className="booking-summary famlo-booking-summary">
                <div className="booking-summary-row"><span>Staying with</span><strong>{home.listingTitle ?? home.name}</strong></div>
                <div className="booking-summary-row"><span>Room</span><strong>{selectedRoomLabel}</strong></div>
                <div className="booking-summary-row"><span>Slot</span><strong>{selectedQuarter ? `${selectedQuarter.label} · ${selectedQuarter.time}` : "Choose a booking slot"}</strong></div>
                <div className="booking-summary-row"><span>Date</span><strong>{isFullDayBooking ? `${dateFrom} to ${dateTo}` : dateFrom}</strong></div>
                <div className="booking-summary-row"><span>Guests</span><strong>{guestCount}</strong></div>
                <div className="booking-summary-row"><span>Coupon</span><strong>{quote?.couponCode ?? (couponCode.trim() || "None")}</strong></div>
                {quote ? (
                  <>
                    <div className="booking-summary-row"><span>Room amount</span><strong>Rs. {quote.subtotal.toLocaleString("en-IN")}</strong></div>
                    {quote.discountAmount > 0 ? (
                      <div className="booking-summary-row"><span>Discount</span><strong>- Rs. {quote.discountAmount.toLocaleString("en-IN")}</strong></div>
                    ) : null}
                    <div className="booking-summary-row"><span>GST and taxes</span><strong>Rs. {quote.taxAmount.toLocaleString("en-IN")}</strong></div>
                  </>
                ) : null}
                <label className="famlo-picker-field">
                  <span>Coupon code</span>
                  <input className="famlo-select-field" onChange={(event) => setCouponCode(event.target.value.toUpperCase())} placeholder="Optional coupon" value={couponCode} />
                </label>
                {successMessage ? <div className="panel auth-pill">{successMessage}</div> : null}
              </div>
            ) : null}

            {bookingError ? <div className="auth-error">{bookingError}</div> : null}

            <div className="famlo-widget-footer">
              <div>
                <small>{isFullDayBooking ? `Total for ${bookingDayLabel}` : "Total for booking"}</small>
                <strong>Rs. {(quote?.totalPrice ?? estimatedTotalPrice).toLocaleString("en-IN")}</strong>
              </div>
              <span>{quoteLoading ? "Updating..." : quote ? "GST included" : "Taxes calculated at checkout"}</span>
            </div>

            {step !== "confirm" ? (
              <div className="detail-actions famlo-widget-actions">
                {step !== "quarter" ? (
                  <button className="button-like secondary" onClick={goBack} type="button">Back</button>
                ) : null}
                <button className="famlo-cta-button" onClick={goNext} type="button">Get it now</button>
              </div>
            ) : (
              <div className="detail-actions famlo-widget-actions">
                {!successMessage ? (
                  <button className="button-like secondary" onClick={goBack} type="button">Back</button>
                ) : null}
                <button className="famlo-cta-button" disabled={submitting || Boolean(successMessage)} onClick={() => void handleBooking()} type="button">
                  {submitting ? "Booking..." : successMessage ? "Booking confirmed" : "Get it now"}
                </button>
              </div>
            )}

            <div className="famlo-certified-line">
              <span className="famlo-certified-dot" />
              <span>Famlo certified home</span>
            </div>

            {bookingReceipt ? (
              <div className="panel booking-confirmation-card">
                <div className="booking-confirmation-head">
                  <span className="eyebrow">What happens next</span>
                  <strong>{requiresHostApproval ? "Your host has been notified." : "Your booking is confirmed."}</strong>
                </div>
                <ul className="booking-confirmation-list">
                  <li>Your booking reference is <strong>{bookingReceipt.bookingId}</strong>.</li>
                  {bookingReceipt.paymentId ? <li>Your payment reference is <strong>{bookingReceipt.paymentId}</strong>.</li> : null}
                  {requiresHostApproval ? (
                    <li>
                      We have notified <strong>{home.hostName ?? home.listingTitle ?? home.name}</strong> about you. They will approve soon as possible, and you can track updates in My Bookings.
                    </li>
                  ) : (
                    <li>
                      Check it out on the booking page and then open My Bookings for the full stay details.
                    </li>
                  )}
                </ul>
                <div className="detail-actions">
                  <Link className="button-like secondary" href={`/bookings?bookingId=${encodeURIComponent(bookingReceipt.bookingId)}`} target="_blank" rel="noreferrer">
                    Check booking page
                  </Link>
                  <Link className="button-like" href="/bookings">
                    My Bookings
                  </Link>
                </div>
              </div>
            ) : null}
            </>
            )}
          </div>
        ) : null}
      </div>
    );
  }

  function resolveNextStep(userId: string | null, nextKycStatus: string | null): BookingStep {
    if (!userId) {
      return "login";
    }

    if (!BOOKABLE_KYC_STATUSES.has(nextKycStatus ?? "")) {
      return "kyc";
    }

    return "quarter";
  }

  function isUnavailableDate(dateStr: string): boolean {
    if (!dateStr) {
      return false;
    }

    if (effectiveBlockedDates.includes(dateStr) || effectiveBlockedDates.includes(slotToken(dateStr, "fullday"))) {
      return true;
    }

    if (!selectedQuarter) {
      return false;
    }

    if (compareDateStrings(dateStr, getTodayInIndia()) < 0) {
      return true;
    }

    if (effectiveBlockedDates.includes(slotToken(dateStr, selectedQuarter.id))) {
      return true;
    }

    const dayOccupancy = occupancy[dateStr];
    if (!dayOccupancy) {
      return false;
    }

    return dayOccupancy.anyBooking;
  }

  const syncAuthState = useCallback(async (): Promise<{ userId: string | null; kycStatus: string | null }> => {
    setLoadingAuth(true);

    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      setCurrentUserId(null);
      setCurrentUserEmail(null);
      setGuestName(null);
      setGuestCity(null);
      setKycStatus(null);
      setStep("login");
      setLoadingAuth(false);
      return { userId: null, kycStatus: null };
    }

    const { data: userRow } = await supabase
      .from("users")
      .select("name, city, kyc_status, kyc_submitted_at, id_document_url")
      .eq("id", user.id)
      .maybeSingle();

    const nextKycStatus =
      typeof userRow?.kyc_status === "string" && BOOKABLE_KYC_STATUSES.has(userRow.kyc_status)
        ? userRow.kyc_status
        : (typeof userRow?.id_document_url === "string" && userRow.id_document_url.trim().length > 0) ||
            typeof userRow?.kyc_submitted_at === "string"
          ? "pending"
          : typeof userRow?.kyc_status === "string"
            ? userRow.kyc_status
            : null;
    setCurrentUserId(user.id);
    setCurrentUserEmail(user.email ?? null);
    setGuestName(typeof userRow?.name === "string" ? userRow.name : null);
    setGuestCity(typeof userRow?.city === "string" ? userRow.city : null);
    setKycStatus(nextKycStatus);
    setStep(resolveNextStep(user.id, nextKycStatus));
    setLoadingAuth(false);
    return { userId: user.id, kycStatus: nextKycStatus };
  }, [supabase]);

  useEffect(() => {
    void syncAuthState();

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange(() => {
      void syncAuthState();
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [supabase, syncAuthState]);

  useEffect(() => {
    if (!selectedQuarterId && quarterOptions[0]) {
      setSelectedQuarterId(quarterOptions[0].id);
    }
  }, [quarterOptions, selectedQuarterId]);

  useEffect(() => {
    setGuestCount((value) => Math.max(1, Math.min(value, guestLimit)));
  }, [guestLimit]);

  useEffect(() => {
    if (dateFrom < earliestSelectableDate) {
      setDateFrom(earliestSelectableDate);
      if (!isFullDayBooking) {
        setDateTo(earliestSelectableDate);
      }
    }
  }, [dateFrom, earliestSelectableDate, isFullDayBooking]);

  useEffect(() => {
    const requestedQuarter = searchParams.get("quarter");
    const requestedDate = searchParams.get("date");
    const requestedDateTo = searchParams.get("date_to");
    const requestedGuests = Number(searchParams.get("guests"));

    if (requestedQuarter && quarterOptions.some((quarter) => quarter.id === requestedQuarter)) {
      setSelectedQuarterId(requestedQuarter);
    }

    if (requestedDate) {
      setDateFrom(requestedDate);
      setDateTo(requestedDateTo || requestedDate);
    }

    if (Number.isFinite(requestedGuests) && requestedGuests > 0) {
      setGuestCount(Math.min(Math.max(1, requestedGuests), guestLimit));
    }
  }, [guestLimit, quarterOptions, searchParams]);

  useEffect(() => {
    if (loadingAuth || requestedStep !== "confirm" || requestedEntry !== "listing") {
      return;
    }

    if (!currentUserId) {
      setStep("login");
      return;
    }

    if (!BOOKABLE_KYC_STATUSES.has(kycStatus ?? "")) {
      setStep("kyc");
      return;
    }

    if (selectedQuarter && dateFrom) {
      setStep("confirm");
    }
  }, [currentUserId, dateFrom, kycStatus, loadingAuth, requestedEntry, requestedStep, selectedQuarter]);

  useEffect(() => {
    if (step !== "login" && step !== "kyc") {
      resumeStepRef.current = step;
    }
  }, [step]);

  useEffect(() => {
    if (hasClosedRooms || !currentUserId || !selectedQuarter || !dateFrom) {
      setQuote(null);
      return;
    }

    let cancelled = false;

    async function loadQuote(): Promise<void> {
      if (!selectedQuarter) {
        setQuote(null);
        setQuoteLoading(false);
        return;
      }
      setQuoteLoading(true);
      try {
        const response = await fetch("/api/bookings/quote", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(await getAuthHeaders()) },
          body: JSON.stringify({
            bookingType: "host_stay",
            userId: currentUserId,
            hostId: home.hostId ?? home.id,
            legacyFamilyId: home.legacyFamilyId,
            stayUnitId: selectedStayUnit?.id ?? null,
            quarterType: selectedQuarter.id,
            quarterTime: selectedQuarter.time,
            startDate: dateFrom,
            endDate: isFullDayBooking ? dateTo : dateFrom,
            guestsCount: guestCount,
            unitPrice: selectedQuarter.price,
            commissionPct: home.platformCommissionPct,
            couponCode: couponCode.trim() || null,
          }),
        });

        const data = await response.json();
        if (!response.ok || data.error) {
          throw new Error(data.error ?? "Failed to calculate total.");
        }

        if (!cancelled) {
          setQuote({
            subtotal: data.subtotal ?? 0,
            discountAmount: data.discountAmount ?? 0,
            taxAmount: data.taxAmount ?? 0,
            totalPrice: data.totalPrice ?? 0,
            partnerPayoutAmount: data.partnerPayoutAmount ?? 0,
            platformFee: data.platformFee ?? 0,
            couponCode: data.appliedCoupon?.code ?? null,
          });
        }
      } catch {
        if (!cancelled) {
          setQuote(null);
        }
      } finally {
        if (!cancelled) {
          setQuoteLoading(false);
        }
      }
    }

    void loadQuote();

    return () => {
      cancelled = true;
    };
  }, [
    couponCode,
    currentUserId,
    dateFrom,
    dateTo,
    guestCount,
    getAuthHeaders,
    hasClosedRooms,
    home.hostId,
    home.id,
    home.legacyFamilyId,
    home.platformCommissionPct,
    isFullDayBooking,
    selectedStayUnit?.id,
    selectedQuarter,
  ]);

  function goNext(): void {
    setBookingError(null);

    if (hasClosedRooms) {
      setBookingError("This home currently has no open rooms.");
      return;
    }

    if (step === "quarter") {
      if (!selectedQuarter) {
        setBookingError("No bookable quarter is available for this Home right now.");
        return;
      }
      setStep("date");
      return;
    }

    if (step === "date") {
      if (!dateFrom) {
        setBookingError("Choose a visit date first.");
        return;
      }

      if (isFullDayBooking && dateTo < dateFrom) {
        setBookingError("End date must be on or after the start date.");
        return;
      }

      if (bookingDays.some((date) => isUnavailableDate(date))) {
        setBookingError("One or more selected dates are unavailable or the booking time has already passed.");
        return;
      }

      setStep("guests");
      return;
    }

    if (step === "guests") {
      setStep("confirm");
    }
  }

  function goBack(): void {
    setBookingError(null);

    if (step === "date") {
      setStep("quarter");
      return;
    }

    if (step === "guests") {
      setStep("date");
      return;
    }

    if (step === "confirm") {
      setStep("guests");
    }
  }

  async function handleBooking(): Promise<void> {
    if (hasClosedRooms || !currentUserId || !selectedQuarter || !dateFrom) {
      return;
    }

    if (!home.isActive || !home.isAccepting) {
      setBookingError("This Home listing is not accepting bookings right now.");
      return;
    }

    if (BOOKABLE_KYC_STATUSES.has(kycStatus ?? "") === false) {
      setBookingError("Submit your document once, then you can continue to payment and booking.");
      return;
    }

    if (guestCount > guestLimit) {
      setBookingError(`This room currently allows up to ${guestLimit} guests.`);
      return;
    }

    if (bookingDays.some((date) => isUnavailableDate(date))) {
      setBookingError("One or more selected dates are unavailable or the booking time has already passed.");
      return;
    }

    setSubmitting(true);
    setBookingError(null);

    const dateToValue = isFullDayBooking ? dateTo : dateFrom;

    try {
      const welcomeMessage = `Hi ${guestName ?? "guest"},

Welcome to the Famlo family.

You are about to experience the real ${home.city ?? "India"}. We are thrilled to host your journey.

Your stay details:
Host area: ${publicLocation || "Shared after booking"}
Property: ${home.listingTitle ?? home.name}
Map pin: ${home.googleMapsLink || "Shared securely inside Famlo after confirmation"}

Safety first:
- Keep all payments and communication on Famlo
- Please avoid sharing personal contact details in chat
- Famlo may monitor chats for fraud prevention and safety

Need help during your stay? Use the Famlo assistance path from your booking thread. If it is urgent, open the emergency support option in your booking dashboard and our team can help right away.`;

      const response = await fetch("/api/bookings/create", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await getAuthHeaders()) },
        body: JSON.stringify({
          bookingType: "host_stay",
          userId: currentUserId,
          hostId: home.hostId ?? null,
          legacyFamilyId: home.legacyFamilyId,
          stayUnitId: selectedStayUnit?.id ?? null,
          quarterType: selectedQuarter.id,
          quarterTime: selectedQuarter.time,
          startDate: dateFrom,
          endDate: dateToValue,
          guestsCount: guestCount,
          unitPrice: selectedQuarter.price,
          commissionPct: home.platformCommissionPct,
          couponCode: couponCode.trim() || null,
          vibe,
          guestName,
          guestCity,
          listingName: home.listingTitle ?? home.name,
          hostArea: publicLocation || "Shared after booking",
          hostUserId: home.hostUserId,
          welcomeMessage,
        }),
      });

      const payload = await response.json();
      if (!response.ok || payload.error) {
        throw new Error(payload.error ?? "Could not create booking.");
      }

      void recordHostInteractionEvent({
        eventType: "booking_request",
        hostId: home.hostId ?? null,
        legacyFamilyId: home.legacyFamilyId ?? null,
        pagePath: typeof window !== "undefined" ? window.location.pathname : null,
        metadata: {
          bookingId: typeof payload.bookingId === "string" ? payload.bookingId : null,
          listingName: home.listingTitle ?? home.name,
          stayUnitId: selectedStayUnit?.id ?? null,
          roomName: selectedRoomLabel,
          guestCount,
          quarterType: selectedQuarter.id,
        },
      });

      let paymentMessage =
        `Your ${selectedQuarter.label.toLowerCase()} stay with ${home.name} is now created in the new Famlo booking system.`;

      if (payload.bookingId) {
        const paymentIntentResponse = await fetch("/api/payments/create-intent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            bookingId: payload.bookingId,
            gateway: "razorpay",
          }),
        });

        const paymentIntentPayload = await paymentIntentResponse.json();
        if (!paymentIntentResponse.ok || paymentIntentPayload.error) {
          paymentMessage =
            `Your ${selectedQuarter.label.toLowerCase()} stay with ${home.name} is saved in Famlo, but payment setup needs one more retry. You can complete it from your bookings dashboard.`;
        } else if (paymentIntentPayload.integrationStatus === "razorpay_ready" && paymentIntentPayload.order) {
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
            description: `Booking for ${home.listingTitle ?? home.name}`,
            order_id: order.orderId,
            prefill: {
              name: guestName ?? undefined,
              email: currentUserEmail ?? undefined,
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
                    hostId: home.hostId ?? null,
                    legacyFamilyId: home.legacyFamilyId ?? null,
                    pagePath: typeof window !== "undefined" ? window.location.pathname : null,
                    metadata: {
                      bookingId: order.bookingId,
                      paymentRowId: order.paymentRowId,
                      stayUnitId: selectedStayUnit?.id ?? null,
                      roomName: selectedRoomLabel,
                      quarterType: selectedQuarter.id,
                    },
                  });

                  const bookingPageUrl = `/bookings?bookingId=${encodeURIComponent(order.bookingId)}`;
                  const bookingTab = window.open(bookingPageUrl, "_blank", "noopener,noreferrer");
                  if (!bookingTab) {
                    window.location.href = bookingPageUrl;
                  }

                  const hostLabel = home.hostName ?? home.listingTitle ?? home.name;
                  setSuccessMessage(
                    requiresHostApproval
                      ? `We have notified ${hostLabel} about you. They will approve soon as possible, and you can see the update in My Bookings.`
                      : `Your booking is confirmed. Check it out on the booking page, then open My Bookings for the full details.`
                  );
                } catch (verifyError) {
                  setBookingError(
                    verifyError instanceof Error ? verifyError.message : "Payment verification failed."
                  );
                }
              })();
            },
            modal: {
              ondismiss: () => {
                setSuccessMessage(
                  `Your ${selectedQuarter.label.toLowerCase()} stay with ${home.name} is created, but payment is still pending. You can retry from your bookings dashboard.`
                );
              },
            },
            theme: {
              color: "#165dcc",
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
          paymentMessage = `Your ${selectedQuarter.label.toLowerCase()} stay with ${home.name} is created. Complete payment in the Razorpay window to confirm it in Famlo.`;
        } else {
          paymentMessage =
            "Your booking is created and the payment record is ready, but live Razorpay keys are not configured yet.";
        }
      }

      setBookingReceipt({
        bookingId: payload.bookingId,
        conversationId: payload.conversationId ?? null,
        paymentId: payload.paymentId ?? null,
        hostArea: publicLocation || "Shared after booking",
        listingName: home.listingTitle ?? home.name,
        quarterLabel: selectedQuarter.label,
        quarterTime: selectedQuarter.time,
        visitDateLabel: isFullDayBooking ? `${dateFrom} to ${dateToValue}` : dateFrom,
        guestsLabel: `${guestCount} guest${guestCount > 1 ? "s" : ""}`,
        totalLabel: `Rs. ${Number(payload.totalPrice ?? quote?.totalPrice ?? estimatedTotalPrice).toLocaleString("en-IN")}`
      });
      setSuccessMessage(paymentMessage);
      setStep("confirm");
    } catch (error) {
      setBookingError(error instanceof Error ? error.message : "Booking failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="famlo-booking-page">
      <nav className="famlo-booking-nav">
        <div className="famlo-booking-nav-side">
          <Link href={home.href} className="famlo-nav-link">
            <span>←</span>
            <span>Back</span>
          </Link>
        </div>
        <div className="famlo-booking-logo" aria-label="Famlo">
          <span>fam</span><span>lo</span>
        </div>
        <div className="famlo-booking-nav-side famlo-booking-nav-actions">
          <button className="famlo-nav-icon" onClick={() => setSaved((value) => !value)} type="button">
            <Heart size={16} fill={saved ? "#E53E3E" : "none"} />
            <span>Save</span>
          </button>
          <button className="famlo-nav-icon" type="button">
            <Share2 size={16} />
            <span>Share</span>
          </button>
        </div>
      </nav>

      <div className="famlo-booking-hero">
        <div className="famlo-hero-main">
          {displayImages[0] ? <img src={displayImages[0]} alt={home.listingTitle ?? home.name} /> : <div className="booking-hero-fallback" />}
          <div className="famlo-hero-overlay">
            <span>Living room</span>
            <button type="button">View all photos</button>
          </div>
        </div>
        <div className="famlo-hero-side">
          {displayImages.slice(1, 3).map((image, index) => (
            <div className="famlo-hero-side-card" key={`${image}-${index}`}>
              {image ? <img src={image} alt={`${home.listingTitle ?? home.name} ${index + 2}`} /> : <div className="booking-hero-fallback" />}
              <span>{index === 0 ? "Bedroom" : "Kitchen"}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="famlo-booking-layout">
        <div className="famlo-booking-main">
          <section className="famlo-host-section famlo-reveal-block">
            <div className="famlo-host-row">
              <div className="famlo-avatar-wrap">
                <div className="famlo-avatar-ring" />
                <div className="famlo-avatar">{hostInitial}</div>
              </div>
              <div className="famlo-host-copy">
                <h1>{hostDisplayName}</h1>
                <p>Hosting on Famlo • Stay Human</p>
                <div className="famlo-host-meta">
                  <span><MapPin size={14} /> {publicLocation || "Approximate area shown"}</span>
                  <span className="famlo-verified-badge"><ShieldCheck size={14} /> Verified host</span>
                </div>
                <div className="famlo-language-row">
                  {["Hindi", "English", home.city ?? "Local tips"].slice(0, 4).map((item) => (
                    <span key={item}>{item}</span>
                  ))}
                </div>
              </div>
            </div>
            <div className="famlo-stats-grid">
              <div><Heart size={18} /><strong>{Math.max(12, home.totalReviews ?? 18)}</strong><span>Liked by guests</span></div>
              <div><Users size={18} /><strong>{guestLimit}</strong><span>Guests allowed</span></div>
              <div><MessageCircle size={18} /><strong>{Math.max(6, home.totalReviews ?? 14)}</strong><span>Stories shared</span></div>
            </div>
          </section>

          {stayUnits.length > 0 ? (
            <>
              <div className="famlo-divider" />
              <section className="famlo-reveal-block">
                <span className="famlo-section-label">Rooms</span>
                <h2 className="famlo-section-title">Pick your stay unit</h2>
                <p className="famlo-section-body" style={{ marginBottom: 18 }}>
                  Choose the room you want to book. We keep the first version simple: one selected room drives the booking capacity and pricing.
                </p>
                {!hasAnyActiveStayUnits ? (
                  <div style={{ marginBottom: 16, padding: 12, borderRadius: 14, background: "#fff7ed", border: "1px solid #fed7aa", color: "#9a3412" }}>
                    <div style={{ fontSize: 11, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em" }}>Rooms are inactive</div>
                    <p style={{ margin: "6px 0 0", fontSize: 13, lineHeight: 1.55, fontWeight: 600 }}>
                      These rooms are currently not active for live booking. Closed rooms stay visible in gray, and the host needs to turn at least one room on before this stay is ready to book.
                    </p>
                  </div>
                ) : null}
                <div style={{ display: "grid", gap: 12 }}>
                  {stayUnits.map((unit) => {
                    const isSelected = unit.id === selectedStayUnitId;
                    const roomPrice = unit.priceFullday || unit.priceMorning || unit.priceAfternoon || unit.priceEvening;
                    const photoCount = unit.photos.length;
                    const isActive = unit.isActive;
                    return (
                      <button
                        key={unit.id}
                        type="button"
                        onClick={() => {
                          if (!isActive) return;
                          setSelectedStayUnitId(unit.id);
                        }}
                        disabled={!isActive}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr auto",
                          gap: 12,
                          width: "100%",
                          textAlign: "left",
                          borderRadius: 18,
                          border: isSelected ? "1px solid #0F172A" : "1px solid #E2E8F0",
                          background: isActive ? (isSelected ? "#F8FAFC" : "#FFFFFF") : "#F8FAFC",
                          padding: 16,
                          boxShadow: isSelected ? "0 10px 24px rgba(15, 23, 42, 0.08)" : "none",
                          opacity: isActive ? 1 : 0.58,
                          cursor: isActive ? "pointer" : "not-allowed",
                        }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 6 }}>
                            <strong style={{ color: "#0F172A", fontSize: 15 }}>{unit.name}</strong>
                            {isSelected ? <span className="famlo-setup-badge">Selected</span> : null}
                            {unit.isPrimary ? <span className="famlo-setup-badge">Primary</span> : null}
                            <span className="famlo-setup-badge">{isActive ? "Active" : "Inactive"}</span>
                          </div>
                          <p style={{ margin: 0, fontSize: 13, color: "#475569", lineHeight: 1.55 }}>
                            {unit.description || "A simple room option for your stay."}
                          </p>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
                            <span className="famlo-setup-badge">Up to {unit.maxGuests} guests</span>
                            {unit.bedInfo ? <span className="famlo-setup-badge">{unit.bedInfo}</span> : null}
                            {unit.bathroomType ? <span className="famlo-setup-badge">{unit.bathroomType}</span> : null}
                            <span className="famlo-setup-badge">
                              {photoCount > 0 ? `${photoCount} photo${photoCount === 1 ? "" : "s"}` : "No photos yet"}
                            </span>
                            <span className="famlo-setup-badge">
                              {photoCount > 0 ? "Cover ready" : "Add cover photo"}
                            </span>
                          </div>
                        </div>
                        <div style={{ textAlign: "right", display: "grid", gap: 6, alignContent: "start" }}>
                          <strong style={{ color: "#0F172A", fontSize: 18 }}>
                            {roomPrice > 0 ? `₹${roomPrice.toLocaleString("en-IN")}` : "Price set by host"}
                          </strong>
                          <span style={{ fontSize: 12, color: "#64748B", fontWeight: 600 }}>{isActive ? (unit.quarterEnabled ? "Smart pricing on" : "Standard pricing only") : "Closed room"}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
                <div className="famlo-state-card" style={{ marginTop: 16 }}>
                  <h3 style={{ marginBottom: 6 }}>Selected room</h3>
                  <p style={{ margin: 0 }}>
                    {selectedRoomLabel} · up to {guestLimit} guests
                  </p>
                  {selectedRoomTooSmall ? (
                    <div style={{ marginTop: 12, padding: 12, borderRadius: 14, background: "#fff7ed", border: "1px solid #fed7aa" }}>
                      <strong style={{ display: "block", marginBottom: 6, color: "#9a3412" }}>
                        This room is too small for {guestCount} guests
                      </strong>
                      <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55, color: "#9a3412" }}>
                        Pick a room that can hold your group, or adjust guest count to continue with this room.
                      </p>
                      {guestFitStayUnits.length > 0 ? (
                        <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
                          {guestFitStayUnits.slice(0, 3).map((unit) => {
                            const roomPrice = unit.priceFullday || unit.priceMorning || unit.priceAfternoon || unit.priceEvening;
                            const isCurrentRoom = unit.id === selectedStayUnitId;
                            return (
                              <button
                                key={`suggested-${unit.id}`}
                                type="button"
                                onClick={() => setSelectedStayUnitId(unit.id)}
                                style={{
                                  display: "flex",
                                  justifyContent: "space-between",
                                  alignItems: "center",
                                  gap: 12,
                                  width: "100%",
                                  borderRadius: 12,
                                  border: isCurrentRoom ? "1px solid #0F172A" : "1px solid #fed7aa",
                                  background: isCurrentRoom ? "#ffffff" : "#fffaf5",
                                  padding: "10px 12px",
                                  textAlign: "left",
                                }}
                              >
                                <span style={{ minWidth: 0 }}>
                                  <strong style={{ display: "block", color: "#0F172A", fontSize: 13 }}>{unit.name}</strong>
                                  <span style={{ display: "block", marginTop: 2, fontSize: 12, color: "#7c2d12" }}>
                                    Up to {unit.maxGuests} guests
                                  </span>
                                </span>
                                <span style={{ fontSize: 12, fontWeight: 800, color: "#7c2d12", whiteSpace: "nowrap" }}>
                                  {roomPrice > 0 ? `₹${roomPrice.toLocaleString("en-IN")}` : "Price set by host"}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </section>
            </>
          ) : null}

          <div className="famlo-divider" />

          <section className="famlo-reveal-block">
            <span className="famlo-section-label">About</span>
            <h2 className="famlo-section-title">A home with <em>real stories</em></h2>
            <p className="famlo-section-body">{aboutParagraphs[0]}</p>
            {aboutExpanded ? <p className="famlo-section-body">{aboutParagraphs[1]}</p> : null}
            <button className="famlo-inline-link" onClick={() => setAboutExpanded((value) => !value)} type="button">
              {aboutExpanded ? "Show less" : "Read more"}
            </button>
          </section>

          <div className="famlo-divider" />

          <section className="famlo-reveal-block">
            <span className="famlo-section-label">What sets us apart</span>
            <h2 className="famlo-section-title">The Famlo experience</h2>
            <div className="famlo-experience-grid">
              {experienceCards.map((card) => (
                <article className="famlo-experience-card" key={card.title}>
                  <div className="famlo-experience-icon">{card.icon}</div>
                  <h3>{card.title}</h3>
                  <p>{card.body}</p>
                </article>
              ))}
            </div>
          </section>

          <div className="famlo-divider" />

          <section className="famlo-reveal-block">
            <span className="famlo-section-label">Facilities</span>
            <h2 className="famlo-section-title">Amenities</h2>
            <div className="famlo-amenities-grid">
              {amenityItems.map((item) => (
                <div className="famlo-amenity-item" key={item}>
                  {(amenityIconMap.get(item.trim().toLowerCase()) ?? (() => <HomeIcon size={18} />))()}
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </section>

          <div className="famlo-divider" />

          <section className="famlo-reveal-block">
            <span className="famlo-section-label">Space</span>
            <h2 className="famlo-section-title">Home setup</h2>
            <div className="famlo-setup-list">
              {setupRows.map((row) => {
                const Icon = row.icon;
                return (
                <div className="famlo-setup-row" key={row.title}>
                  <div className="famlo-setup-icon"><Icon size={18} /></div>
                  <div className="famlo-setup-copy">
                    <strong>{row.title}</strong>
                    <p>{row.body}</p>
                  </div>
                  <span className="famlo-setup-badge">{row.badge}</span>
                </div>
              )})}
            </div>
          </section>

          <div className="famlo-divider" />

          <section className="famlo-reveal-block">
            <span className="famlo-section-label">Included</span>
            <h2 className="famlo-section-title">What is included</h2>
            <div className="famlo-included-banner">
              <div className="famlo-included-icon"><UtensilsCrossed size={26} /></div>
              <div>
                <h3>Meals, care, and a stay that feels human</h3>
                <p>{home.culturalOffering || "Depending on the quarter you choose, your visit can include food, conversation, and a softer local rhythm."}</p>
              </div>
            </div>
            <div className="famlo-food-grid">
              <article className="famlo-food-card"><span>Vegetarian</span><h3>Home-style plates</h3><p>Fresh meals prepared around the flow of the household and your booking slot.</p></article>
              <article className="famlo-food-card"><span>Comfort</span><h3>Tea and small extras</h3><p>Simple hospitality, from chai to familiar comforts that make a short stay easier.</p></article>
              <article className="famlo-food-card"><span>Cultural</span><h3>Local rhythm</h3><p>A stay designed around people, neighborhood pace, and the feeling of being welcomed in.</p></article>
            </div>
            <div className="famlo-extra-tags">
              {includedItems.map((item) => <span key={item}>{item}</span>)}
            </div>
          </section>

          <div className="famlo-divider" />

          <section className="famlo-reveal-block">
            <span className="famlo-section-label">Policies</span>
            <h2 className="famlo-section-title">House rules</h2>
            <div className="famlo-rules-list">
              {houseRules.map((rule, index) => (
                <div className="famlo-rule-row" key={`${rule}-${index}`}>
                  <span>{index + 1}</span>
                  <p>{rule}</p>
                </div>
              ))}
            </div>
          </section>

          <div className="famlo-divider famlo-mobile-only" />
          <div className="famlo-mobile-only">{renderWidget(true)}</div>

          <div className="famlo-divider" />

          <section className="famlo-reveal-block">
            <span className="famlo-section-label">Guest stories</span>
            <h2 className="famlo-section-title">Voices. No stars — <em>just words.</em></h2>
            <div className="famlo-story-grid">
              {stories.map(([name, city, tag, quoteText]) => (
                <article className="famlo-story-card" key={name}>
                  <div className="famlo-story-head">
                    <div className="famlo-story-avatar">{String(name).charAt(0)}</div>
                    <div>
                      <strong>{name}</strong>
                      <span>{city}</span>
                    </div>
                  </div>
                  <blockquote>{quoteText}</blockquote>
                  <span className="famlo-story-tag">{tag}</span>
                </article>
              ))}
            </div>
          </section>
        </div>

        <aside className="famlo-booking-side">
          {renderWidget(false)}
        </aside>
      </div>

      <div className="famlo-mobile-cta">
        <div>
          <small>{isFullDayBooking ? `Total for ${bookingDayLabel}` : "Total for booking"}</small>
          <strong>Rs. {(quote?.totalPrice ?? estimatedTotalPrice).toLocaleString("en-IN")}</strong>
        </div>
        <button
          className="famlo-cta-button"
          onClick={() => inlineWidgetRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
          type="button"
        >
          Get it now
        </button>
      </div>
      {showAuthModal ? (
        <AuthModal
          isOpen={showAuthModal}
          skipProfileStep
          onClose={() => {
            setShowAuthModal(false);
            void syncAuthState();
          }}
        />
      ) : null}
    </section>
  );
}
