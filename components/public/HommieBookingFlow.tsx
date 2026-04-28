"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { GuestVerificationForm } from "@/components/account/GuestVerificationForm";
import { AuthModal } from "@/components/auth/AuthModal";
import type { CompanionRecord } from "@/lib/discovery";
import { createBrowserSupabaseClient } from "@/lib/supabase";

type BookingStep = "login" | "kyc" | "need" | "date" | "guests" | "confirm";

interface HommieBookingFlowProps {
  companion: CompanionRecord;
}

const BOOKABLE_KYC_STATUSES = new Set(["auto_verified", "verified", "pending", "pending_review"]);

function getToday(): string {
  return new Date().toISOString().split("T")[0] ?? "";
}

function parseGuideReceiverId(companion: CompanionRecord): string | null {
  return companion.guideUserId ?? companion.guideId ?? null;
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

export function HommieBookingFlow({
  companion
}: Readonly<HommieBookingFlowProps>): React.JSX.Element {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const resumeStepRef = useRef<BookingStep>("need");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [guestName, setGuestName] = useState<string | null>(null);
  const [guestCity, setGuestCity] = useState<string | null>(null);
  const [kycStatus, setKycStatus] = useState<string | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [step, setStep] = useState<BookingStep>("login");
  const [authError, setAuthError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [couponCode, setCouponCode] = useState("");
  const [quote, setQuote] = useState<QuoteState | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const getAuthHeaders = useCallback(async (): Promise<Record<string, string>> => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const headers: Record<string, string> = {};
    if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
    if (currentUserId) headers["x-famlo-user-id"] = currentUserId;
    return headers;
  }, [currentUserId, supabase]);

  const options = useMemo(
    () =>
      companion.activities.length > 0
        ? companion.activities.slice(0, 6)
        : ["Local orientation", "City support", "Neighborhood walk"],
    [companion.activities]
  );

  const [selectedNeed, setSelectedNeed] = useState<string>(options[0] ?? "Local orientation");
  const [dateFrom, setDateFrom] = useState(getToday());
  const [guestCount, setGuestCount] = useState(1);
  const [vibe, setVibe] = useState<"cultural" | "quiet">("cultural");

  const guestLimit = Math.max(1, companion.maxGuests ?? 1);
  const publicLocation = [companion.locality, companion.city, companion.state].filter(Boolean).join(", ");
  const previewPrice = companion.hourlyPrice ?? companion.nightlyPrice ?? 0;
  const estimatedTotalPrice = previewPrice > 0 ? previewPrice * guestCount : 0;

  function resolveNextStep(userId: string | null, nextKycStatus: string | null): BookingStep {
    if (!userId) {
      return "login";
    }

    if (!BOOKABLE_KYC_STATUSES.has(nextKycStatus ?? "")) {
      return "kyc";
    }

    return "need";
  }

  const syncAuthState = useCallback(async (): Promise<{ userId: string | null; kycStatus: string | null }> => {
    setLoadingAuth(true);

    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      setCurrentUserId(null);
      setGuestName(null);
      setGuestCity(null);
      setKycStatus(null);
      setStep("login");
      setLoadingAuth(false);
      return { userId: null, kycStatus: null };
    }

    const { data: userRow } = await supabase
      .from("users")
      .select("name, city, kyc_status, id_document_url")
      .eq("id", user.id)
      .maybeSingle();

    const nextKycStatus =
      typeof userRow?.kyc_status === "string" && BOOKABLE_KYC_STATUSES.has(userRow.kyc_status)
        ? userRow.kyc_status
        : typeof userRow?.id_document_url === "string" && userRow.id_document_url.trim().length > 0
          ? "pending"
          : typeof userRow?.kyc_status === "string"
            ? userRow.kyc_status
            : null;
    setCurrentUserId(user.id);
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
    if (!selectedNeed && options[0]) {
      setSelectedNeed(options[0]);
    }
  }, [options, selectedNeed]);

  useEffect(() => {
    if (step !== "login" && step !== "kyc") {
      resumeStepRef.current = step;
    }
  }, [step]);

  useEffect(() => {
    if (!currentUserId || !companion.id || !dateFrom) {
      setQuote(null);
      return;
    }

    let cancelled = false;

    async function loadQuote(): Promise<void> {
      setQuoteLoading(true);
      try {
        const response = await fetch("/api/bookings/quote", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(await getAuthHeaders()) },
          body: JSON.stringify({
            bookingType: "hommie_session",
            userId: currentUserId,
            hommieId: companion.id,
            legacyGuideId: companion.guideId,
            quarterType: "hommie_help",
            quarterTime: selectedNeed,
            startDate: dateFrom,
            endDate: dateFrom,
            guestsCount: guestCount,
            unitPrice: previewPrice,
            commissionPct: 18,
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
  }, [companion.guideId, companion.id, couponCode, currentUserId, dateFrom, getAuthHeaders, guestCount, previewPrice, selectedNeed]);

  function goNext(): void {
    setBookingError(null);

    if (step === "need") {
      if (!selectedNeed) {
        setBookingError("Choose a help type first.");
        return;
      }
      setStep("date");
      return;
    }

    if (step === "date") {
      if (!dateFrom) {
        setBookingError("Choose a date first.");
        return;
      }
      setStep("guests");
      return;
    }

    if (step === "guests") {
      if (guestCount > guestLimit) {
        setBookingError(`This hommie currently allows up to ${guestLimit} guests.`);
        return;
      }
      setStep("confirm");
    }
  }

  function goBack(): void {
    setBookingError(null);

    if (step === "date") {
      setStep("need");
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
    if (!currentUserId || !companion.id || !dateFrom) {
      setBookingError("This hommie is not fully connected yet.");
      return;
    }

    if (!companion.isActive) {
      setBookingError("This hommie listing is not active right now.");
      return;
    }

    if (BOOKABLE_KYC_STATUSES.has(kycStatus ?? "") === false) {
      setBookingError("Submit your KYC once, then you can continue to booking and payment.");
      return;
    }

    if (guestCount > guestLimit) {
      setBookingError(`This hommie currently allows up to ${guestLimit} guests.`);
      return;
    }

    setSubmitting(true);
    setBookingError(null);

    try {
      const receiverId = parseGuideReceiverId(companion);
      const response = await fetch("/api/bookings/create", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await getAuthHeaders()) },
        body: JSON.stringify({
          bookingType: "hommie_session",
          userId: currentUserId,
          hommieId: companion.id,
          legacyGuideId: companion.guideId,
          quarterType: "hommie_help",
          quarterTime: selectedNeed,
          startDate: dateFrom,
          endDate: dateFrom,
          guestsCount: guestCount,
          unitPrice: previewPrice,
          commissionPct: 18,
          couponCode: couponCode.trim() || null,
          vibe,
          guestName,
          guestCity,
          listingName: companion.title,
          guideUserId: receiverId,
        }),
      });

      const payload = await response.json();
      if (!response.ok || payload.error) {
        throw new Error(payload.error ?? "Could not create hommie booking.");
      }

      setSuccessMessage(
        `Your request for ${selectedNeed.toLowerCase()} with ${companion.title} is now in the shared Famlo v2 booking and chat flow.`
      );
      setStep("confirm");
    } catch (error) {
      setBookingError(error instanceof Error ? error.message : "Booking failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="panel detail-page">
      <div className="detail-topbar">
        <Link href={`/hommies/${companion.id}`}>Back to listing</Link>
        <span className="status">App-connected hommie booking</span>
      </div>

      <div className="detail-grid single-accent">
        <div className="detail-copy">
          <span className="eyebrow">Famlo hommie booking</span>
          <h1>Connect with {companion.title}</h1>
          <p className="detail-subtitle">{publicLocation || "Location shared in connected flow"}</p>
          <p className="detail-description">
            This flow now follows the shared Famlo app-connected structure: login, KYC check, help type,
            date, guests, and shared writes into `bookings_v2`, `conversations`, and `messages`.
          </p>

          <div className="panel detail-box">
            <h2>Shared connection</h2>
            <ul>
              <li>Writes now go into shared `bookings_v2` first, with legacy guide compatibility preserved.</li>
              <li>Pricing is backend-owned and coupon-ready.</li>
              <li>Chat kickoff writes go into `conversations` and `messages`.</li>
              <li>Public page still keeps the exact private coordination inside the connected flow.</li>
              <li>No separate website-only request table is used.</li>
            </ul>
          </div>
        </div>

        <div className="detail-copy">
          {loadingAuth ? (
            <div className="panel detail-box">
              <h2>Loading booking state</h2>
              <p>Checking your Famlo account and KYC status.</p>
            </div>
          ) : null}

          {!loadingAuth && step === "login" ? (
            <div className="panel detail-box">
              <h2>Sign in to continue</h2>
              <p>Use the Famlo sign-in flow here. The same session then unlocks KYC, booking creation, and payment without switching flows.</p>
              {authError ? <div className="auth-error">{authError}</div> : null}
              <button
                className="button-like"
                onClick={() => {
                  setAuthError(null);
                  setShowAuthModal(true);
                }}
                type="button"
              >
                Sign in with Famlo
              </button>
            </div>
          ) : null}

          {!loadingAuth && step === "kyc" ? (
            <div className="panel detail-box">
              <h2>KYC required before continuing</h2>
              <p>
                Submit your KYC once here, then Famlo can let you continue while review stays in progress.
                Your current status is <strong>{kycStatus ?? "not_started"}</strong>.
              </p>
              <p>
                As soon as this becomes `pending`, `auto_verified`, or `verified`, this same flow can continue
                into the shared booking and chat tables.
              </p>
              <div style={{ marginTop: 20 }}>
                <GuestVerificationForm
                  compact
                  title="Submit guest verification"
                  description="Upload your booking profile and Aadhaar-with-face image. Team approval will unlock this hommie booking flow too."
                  buttonLabel="Submit KYC and continue"
                  onSuccess={async () => {
                    const nextState = await syncAuthState();
                    if (nextState.userId && BOOKABLE_KYC_STATUSES.has(nextState.kycStatus ?? "")) {
                      setBookingError(null);
                      setStep(resumeStepRef.current);
                    }
                  }}
                />
              </div>
            </div>
          ) : null}

          {!loadingAuth && BOOKABLE_KYC_STATUSES.has(kycStatus ?? "") ? (
            <div className="panel detail-box">
              <h2>Booking steps</h2>
              <div className="auth-pills">
                {["Need", "Date", "Guests", "Confirm"].map((label) => (
                  <div className={`panel auth-pill ${step === label.toLowerCase() ? "active-pill" : ""}`} key={label}>
                    {label}
                  </div>
                ))}
              </div>

              {step === "need" ? (
                <div className="booking-choices">
                  {options.map((option) => (
                    <button
                      className={`quarter-choice ${selectedNeed === option ? "active" : ""}`}
                      key={option}
                      onClick={() => setSelectedNeed(option)}
                      type="button"
                    >
                      <strong>{option}</strong>
                      <span>{publicLocation || "City support"}</span>
                      <span>
                        {previewPrice > 0 ? `From Rs. ${previewPrice.toLocaleString("en-IN")}` : "Price on contact"}
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}

              {step === "date" ? (
                <div className="dashboard-form-grid">
                  <label>
                    <span>Visit date</span>
                    <input
                      className="text-input"
                      min={getToday()}
                      onChange={(event) => setDateFrom(event.target.value)}
                      type="date"
                      value={dateFrom}
                    />
                  </label>
                </div>
              ) : null}

              {step === "guests" ? (
                <div className="dashboard-form-grid">
                  <label>
                    <span>Guests</span>
                    <select
                      className="text-input"
                      onChange={(event) => setGuestCount(Number(event.target.value))}
                      value={guestCount}
                    >
                      {Array.from({ length: guestLimit }, (_, index) => index + 1).map((count) => (
                        <option key={count} value={count}>
                          {count} guest{count > 1 ? "s" : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Visit vibe</span>
                    <select
                      className="text-input"
                      onChange={(event) => setVibe(event.target.value as "cultural" | "quiet")}
                      value={vibe}
                    >
                      <option value="cultural">Cultural</option>
                      <option value="quiet">Quiet</option>
                    </select>
                  </label>
                </div>
              ) : null}

              {step === "confirm" ? (
                <div className="booking-summary">
                  <div className="panel detail-box" style={{ display: "grid", gap: 12, marginBottom: 16 }}>
                    <strong>Pricing and coupon</strong>
                    <label>
                      <span>Coupon code</span>
                      <input
                        className="text-input"
                        onChange={(event) => setCouponCode(event.target.value.toUpperCase())}
                        placeholder="Optional coupon"
                        value={couponCode}
                      />
                    </label>
                    <div>Subtotal: Rs. {(quote?.subtotal ?? estimatedTotalPrice).toLocaleString("en-IN")}</div>
                    <div>Discount: Rs. {(quote?.discountAmount ?? 0).toLocaleString("en-IN")}</div>
                    <div>Tax: Rs. {(quote?.taxAmount ?? 0).toLocaleString("en-IN")}</div>
                    <div>Platform fee: Rs. {(quote?.platformFee ?? 0).toLocaleString("en-IN")}</div>
                    <div>Partner payout: Rs. {(quote?.partnerPayoutAmount ?? 0).toLocaleString("en-IN")}</div>
                    <div>Total: {quoteLoading ? "Updating..." : `Rs. ${(quote?.totalPrice ?? estimatedTotalPrice).toLocaleString("en-IN")}`}</div>
                  </div>
                  <div className="booking-summary-row">
                    <span>Hommie</span>
                    <strong>{companion.title}</strong>
                  </div>
                  <div className="booking-summary-row">
                    <span>Public city / area</span>
                    <strong>{publicLocation || "Shared in connected flow"}</strong>
                  </div>
                  <div className="booking-summary-row">
                    <span>Selected help type</span>
                    <strong>{selectedNeed}</strong>
                  </div>
                  <div className="booking-summary-row">
                    <span>Date</span>
                    <strong>{dateFrom}</strong>
                  </div>
                  <div className="booking-summary-row">
                    <span>Guests</span>
                    <strong>{guestCount}</strong>
                  </div>
                  <div className="booking-summary-row">
                    <span>Total preview</span>
                    <strong>{(quote?.totalPrice ?? estimatedTotalPrice) > 0 ? `Rs. ${(quote?.totalPrice ?? estimatedTotalPrice).toLocaleString("en-IN")}` : "Will be coordinated in chat"}</strong>
                  </div>
                  <div className="booking-summary-row">
                    <span>Coupon</span>
                    <strong>{quote?.couponCode ?? (couponCode.trim() || "None")}</strong>
                  </div>
                  {successMessage ? <div className="panel auth-pill">{successMessage}</div> : null}
                </div>
              ) : null}

              {bookingError ? <div className="auth-error">{bookingError}</div> : null}

              {step !== "confirm" ? (
                <div className="detail-actions">
                  {step !== "need" ? (
                    <button className="button-like secondary" onClick={goBack} type="button">
                      Back
                    </button>
                  ) : null}
                  <button className="button-like" onClick={goNext} type="button">
                    Continue
                  </button>
                </div>
              ) : (
                <div className="detail-actions">
                  <button className="button-like secondary" onClick={goBack} type="button">
                    Back
                  </button>
                  <button
                    className="button-like"
                    disabled={submitting || Boolean(successMessage)}
                    onClick={() => void handleBooking()}
                    type="button"
                  >
                    {submitting ? "Sending..." : successMessage ? "Sent" : "Confirm request"}
                  </button>
                </div>
              )}
            </div>
          ) : null}
        </div>
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
