"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useUser } from "@/components/auth/UserContext";
import { createBrowserSupabaseClient } from "@/lib/supabase";

type BookingRow = {
  id: string;
  legacy_booking_id?: string | null;
  family_id: string | null;
  guide_id: string | null;
  status: string | null;
  quarter_type: string | null;
  quarter_time: string | null;
  date_from: string | null;
  date_to: string | null;
  guests_count: number | null;
  total_price: number | null;
  payment_status?: string | null;
  coupon_code?: string | null;
  created_at: string | null;
  vibe: string | null;
  conversation_id: string | null;
  families?: {
    id: string;
    name: string | null;
    host_name?: string | null;
    property_name?: string | null;
    city: string | null;
    state: string | null;
    village: string | null;
    host_photo_url: string | null;
  } | null;
  companions?: {
    id: string;
    name: string | null;
    city: string | null;
    state: string | null;
    avatar_url: string | null;
  } | null;
};

type SupportDraft = {
  mode: "support" | "emergency";
  subject: string;
  message: string;
  status: "idle" | "sending" | "sent" | "error";
  feedback: string | null;
};

type CancellationQuote = {
  refundableAmount: number;
  penaltyAmount: number;
  bookingAmount: number;
  penaltyPercent?: number;
  refundRule?: string;
};

type PendingCancellation = {
  booking: BookingRow;
  hostName: string;
  quote: CancellationQuote;
};

function getBookingStatusMeta(status: string | null, canLeaveStory: boolean): {
  label: string;
  background: string;
  color: string;
  nextStep: string;
} {
  switch (status) {
    case "pending":
      return {
        label: "Awaiting host review",
        background: "#EBF1FF",
        color: "#1A56DB",
        nextStep: "Your request is with the host right now. Chat and exact stay planning unlock after acceptance.",
      };
    case "accepted":
    case "confirmed":
      return {
        label: "Confirmed",
        background: "#1A56DB",
        color: "#FFFFFF",
        nextStep: "Your stay is confirmed. Use messages to coordinate details with the host before arrival.",
      };
    case "checked_in":
      return {
        label: "Checked in",
        background: "#DBEAFE",
        color: "#1E40AF",
        nextStep: "You are marked as checked in. If you need help during the stay, contact the host or Team Famlo from this card.",
      };
    case "completed":
      return {
        label: "Completed",
        background: "#F1F5F9",
        color: "#475569",
        nextStep: canLeaveStory
          ? "Your stay is complete. This is the right time to share your story if you’d like."
          : "Your stay is complete. Thanks for traveling with Famlo.",
      };
    case "rejected":
      return {
        label: "Not accepted",
        background: "#F8FAFC",
        color: "#64748B",
        nextStep: "This booking was not accepted. Team Famlo can help you find another live home if you want support.",
      };
    case "cancelled":
    case "cancelled_by_user":
      return {
        label: "Cancelled",
        background: "#FEF2F2",
        color: "#B91C1C",
        nextStep: "This booking has been cancelled. Team Famlo will review any refundable amount and contact you if action is needed.",
      };
    default:
      return {
        label: (status ?? "pending").replaceAll("_", " "),
        background: "#EBF1FF",
        color: "#1A56DB",
        nextStep: "You can open messages for updates or contact Team Famlo if you need help.",
      };
  }
}

function isChatUnlocked(status: string | null): boolean {
  return status === "accepted" || status === "confirmed" || status === "checked_in" || status === "completed";
}

function isPastBooking(booking: BookingRow): boolean {
  if (!booking.date_to && !booking.date_from) return false;
  const source = booking.date_to ?? booking.date_from ?? "";
  const end = new Date(`${source}T23:59:59`);
  return end.getTime() < Date.now();
}

function canGuestCancelBooking(booking: BookingRow): boolean {
  return ["awaiting_payment", "pending", "accepted", "confirmed"].includes(String(booking.status ?? ""));
}

function formatInr(amount: number): string {
  return `₹${Math.max(0, Math.round(amount)).toLocaleString("en-IN")}`;
}

function getCancellationHostName(booking: BookingRow): string {
  return booking.families?.host_name ?? booking.companions?.name ?? booking.families?.name ?? "Your host";
}

function formatCheckInCode(code: string): string {
  const normalized = code.replace(/\D/g, "").slice(0, 5).padStart(5, "0");
  return `${normalized.slice(0, 3)} ${normalized.slice(3)}`;
}

function buildCancellationQuote(booking: BookingRow): CancellationQuote {
  const bookingAmount = Math.max(0, Math.round(Number(booking.total_price ?? 0)));
  const createdAt = booking.created_at ? new Date(booking.created_at) : new Date();
  const stayDate = booking.date_from || booking.date_to || null;
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

function formatDateRange(booking: BookingRow): string {
  if (!booking.date_from) return "Date pending";
  const start = new Date(booking.date_from).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  if (!booking.date_to || booking.date_to === booking.date_from) return start;
  const end = new Date(booking.date_to).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  return `${start} - ${end}`;
}

function BookingStoryForm({
  booking,
  userName,
  userCity,
  onSaved,
}: Readonly<{
  booking: BookingRow;
  userName: string;
  userCity: string;
  onSaved: (bookingId: string) => void;
}>): React.JSX.Element {
  const { user } = useUser();
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const userId = user?.id ?? null;
  const [liked, setLiked] = useState<boolean | null>(null);
  const [title, setTitle] = useState("");
  const [story, setStory] = useState("");
  const [notRecommendReason, setNotRecommendReason] = useState("");
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [consentToFeature, setConsentToFeature] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const getAuthHeaders = useCallback(async (): Promise<Record<string, string>> => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const headers: Record<string, string> = {};
    if (session?.access_token) {
      headers.Authorization = `Bearer ${session.access_token}`;
    }
    if (userId) {
      headers["x-famlo-user-id"] = userId;
    }
    return headers;
  }, [supabase, userId]);

  async function uploadStoryImage(file: File): Promise<string> {
    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch("/api/user/story/upload", {
      method: "POST",
      headers: await getAuthHeaders(),
      body: formData,
    });
    const payload = (await response.json()) as { error?: string; url?: string };
    if (!response.ok || payload.error || !payload.url) {
      throw new Error(payload.error ?? "Failed to upload image.");
    }
    return payload.url;
  }

  async function handleImageUpload(event: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const files = Array.from(event.target.files ?? []).filter((file) => file.type.startsWith("image/"));
    if (files.length === 0) return;

    setUploadingImages(true);
    setUploadMessage(null);
    try {
      const remainingSlots = Math.max(0, 3 - imageUrls.length);
      const selected = files.slice(0, remainingSlots);
      const uploaded: string[] = [];
      for (const file of selected) {
        uploaded.push(await uploadStoryImage(file));
      }
      setImageUrls((current) => Array.from(new Set([...current, ...uploaded])).slice(0, 3));
      setUploadMessage("Images added.");
    } catch (error) {
      setUploadMessage(error instanceof Error ? error.message : "Could not upload images.");
    } finally {
      setUploadingImages(false);
      event.target.value = "";
    }
  }

  function removeImage(url: string): void {
    setImageUrls((current) => current.filter((value) => value !== url));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const resolvedFamilyId = booking.family_id ?? booking.families?.id ?? null;
    if (!user || !resolvedFamilyId) return;

    setSaving(true);
    setMessage(null);

    try {
      const response = await fetch("/api/user/story", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await getAuthHeaders()) },
          body: JSON.stringify({
            userId: user.id,
            bookingId: booking.id,
            familyId: resolvedFamilyId,
            authorName: userName,
            fromCity: userCity,
            title,
            guestConsentToFeature: consentToFeature,
            storyText: story,
            liked,
            notRecommendReason: liked === false ? notRecommendReason : "",
            imageUrls,
          }),
      });

      const data = await response.json();
      if (!response.ok || data.error) {
        throw new Error(data.error ?? "Feedback submission failed.");
      }

      setMessage("Story submitted to Famlo.");
      onSaved(booking.id);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Feedback failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)} style={{ 
      display: "grid", 
      gap: 16, 
      marginTop: 20, 
      padding: 24, 
      borderRadius: 20, 
      background: "#F8FAFC", 
      border: "1px solid #E0E8F5" 
    }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 16 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => setLiked((current) => (current === true ? null : true))}
            style={{
              padding: "10px 18px",
              borderRadius: 999,
              border: liked === true ? "2px solid #1A56DB" : "1px solid #CBD5E1",
              background: liked === true ? "#EBF1FF" : "white",
              color: liked === true ? "#1A56DB" : "#64748B",
              fontWeight: 700,
              fontSize: 13,
              cursor: "pointer",
              transition: "all 0.15s ease"
            }}
          >
            👍 I liked it
          </button>
          <button
            type="button"
            onClick={() => setLiked((current) => (current === false ? null : false))}
            style={{
              padding: "10px 18px",
              borderRadius: 999,
              border: liked === false ? "2px solid #1A56DB" : "1px solid #CBD5E1",
              background: liked === false ? "#EBF1FF" : "white",
              color: liked === false ? "#1A56DB" : "#64748B",
              fontWeight: 700,
              fontSize: 13,
              cursor: "pointer",
              transition: "all 0.15s ease"
            }}
          >
            👎 I will not recommend it
          </button>
        </div>
      </div>
      <textarea
        className="text-input"
        rows={1}
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="Give your stay short headline"
        style={{ borderColor: "#E0E8F5", borderRadius: 12 }}
      />
      <textarea
        className="text-input"
        rows={4}
        value={story}
        onChange={(event) => setStory(event.target.value)}
        placeholder="Tell Famlo what this stay felt like"
        required
        style={{ borderColor: "#E0E8F5", borderRadius: 12 }}
      />
      {liked === false ? (
        <textarea
          className="text-input"
          rows={3}
          value={notRecommendReason}
          onChange={(event) => setNotRecommendReason(event.target.value)}
          placeholder="Tell us why"
          required
          style={{ borderColor: "#E0E8F5", borderRadius: 12 }}
        />
      ) : null}
      <div style={{ display: "grid", gap: 12, padding: 16, borderRadius: 16, border: "1px dashed #CBD5E1", background: "#fff" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 800, color: "#0F172A" }}>Add images</div>
            <div style={{ fontSize: 12, color: "#64748B" }}>Upload up to 3 stay photos to make the stay memorable.</div>
          </div>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 999, background: "#1A56DB", color: "#fff", fontWeight: 700, cursor: "pointer" }}>
            {uploadingImages ? "Uploading..." : "Insert image"}
            <input type="file" accept="image/*" multiple onChange={(event) => void handleImageUpload(event)} style={{ display: "none" }} />
          </label>
        </div>
        {imageUrls.length > 0 ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(96px, 1fr))", gap: 10 }}>
            {imageUrls.map((url) => (
              <div key={url} style={{ position: "relative", borderRadius: 14, overflow: "hidden", border: "1px solid #E2E8F0", background: "#F8FAFC" }}>
                <img src={url} alt="Story upload" style={{ width: "100%", height: 96, objectFit: "cover", display: "block" }} />
                <button
                  type="button"
                  onClick={() => removeImage(url)}
                  style={{
                    position: "absolute",
                    top: 8,
                    right: 8,
                    border: "none",
                    borderRadius: 999,
                    width: 24,
                    height: 24,
                    background: "rgba(15,23,42,0.8)",
                    color: "#fff",
                    cursor: "pointer",
                    fontSize: 14,
                    lineHeight: 1,
                  }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        ) : null}
        {uploadMessage ? <div style={{ fontSize: 13, color: uploadMessage.toLowerCase().includes("could not") || uploadMessage.toLowerCase().includes("failed") ? "#B91C1C" : "#047857", fontWeight: 700 }}>{uploadMessage}</div> : null}
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: 10, color: "#64748b", fontSize: 13, fontWeight: 500 }}>
        <input type="checkbox" checked={consentToFeature} onChange={(event) => setConsentToFeature(event.target.checked)} style={{ width: 16, height: 16 }} />
        Famlo can feature this story on the website after approval.
      </label>
      {message ? <div style={{ color: message.includes("failed") ? "#B91C1C" : "#059669", fontWeight: 700, fontSize: 14 }}>{message}</div> : null}
      <button 
        className="button-like" 
        disabled={saving} 
        type="submit"
        style={{ background: "#1A56DB", height: 48 }}
      >
        {saving ? "Submitting..." : "Submit story"}
      </button>
    </form>
  );
}

function BookingRoomRatingForm({
  booking,
  stayName,
  getAuthHeaders,
}: Readonly<{
  booking: BookingRow;
  stayName: string;
  getAuthHeaders: () => Promise<Record<string, string>>;
}>): React.JSX.Element {
  const [rating, setRating] = useState(5);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSaving(true);
    setMessage(null);

    try {
      const response = await fetch("/api/user/bookings/room-rating", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(await getAuthHeaders()),
        },
        body: JSON.stringify({
          bookingId: booking.id,
          rating,
        }),
      });

      const data = (await response.json()) as { error?: string };
      if (!response.ok || data.error) {
        throw new Error(data.error ?? "Could not save room rating.");
      }

      setMessage("Room rating saved. You can update it any time from this stay.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save room rating.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={(event) => void handleSubmit(event)}
      style={{
        display: "grid",
        gap: 14,
        marginTop: 20,
        padding: 20,
        borderRadius: 20,
        background: "#F8FAFC",
        border: "1px solid #E0E8F5",
      }}
    >
      <div style={{ display: "grid", gap: 4 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: "#0F1F3D" }}>Rate this room</div>
        <p style={{ margin: 0, color: "#64748B", fontSize: 13, lineHeight: 1.5 }}>
          Only guests who completed this stay can rate <strong>{stayName}</strong>.
        </p>
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            onClick={() => setRating(star)}
            style={{
              width: 42,
              height: 42,
              borderRadius: 12,
              border: rating === star ? "2px solid #1A56DB" : "1px solid #CBD5E1",
              background: rating === star ? "#EBF1FF" : "#FFFFFF",
              color: rating === star ? "#1A56DB" : "#94A3B8",
              fontSize: 20,
              fontWeight: 900,
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
            aria-label={`${star} star${star === 1 ? "" : "s"}`}
          >
            ★
          </button>
        ))}
      </div>

      <button
        className="button-like"
        type="submit"
        disabled={saving}
        style={{
          background: "#1A56DB",
          height: 46,
          width: "fit-content",
          paddingInline: 20,
        }}
      >
        {saving ? "Saving..." : "Save room rating"}
      </button>

      {message ? <div style={{ color: message.includes("Could not") ? "#B91C1C" : "#059669", fontWeight: 700, fontSize: 13 }}>{message}</div> : null}
    </form>
  );
}

function BookingSupportCard({
  booking,
  userId,
  userName,
  getAuthHeaders,
}: Readonly<{
  booking: BookingRow;
  userId: string;
  userName: string;
  getAuthHeaders: () => Promise<Record<string, string>>;
}>): React.JSX.Element {
  const [draft, setDraft] = useState<SupportDraft>({
    mode: "support",
    subject: `Help with booking ${booking.id.slice(0, 8)}`,
    message: "",
    status: "idle",
    feedback: null,
  });

  async function createTicket(withLocation: boolean): Promise<void> {
    if (!draft.subject.trim() || !draft.message.trim()) {
      setDraft((current) => ({
        ...current,
        status: "error",
        feedback: "Please add both a subject and a short message.",
      }));
      return;
    }

    setDraft((current) => ({ ...current, status: "sending", feedback: null }));

    try {
      let location: { lat: number; lng: number } | null = null;

      if (withLocation && typeof navigator !== "undefined" && "geolocation" in navigator) {
        location = await new Promise<{ lat: number; lng: number } | null>((resolve) => {
          navigator.geolocation.getCurrentPosition(
            (position) =>
              resolve({
                lat: position.coords.latitude,
                lng: position.coords.longitude,
              }),
            () => resolve(null),
            { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
          );
        });
      }

      const response = await fetch("/api/user/support", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await getAuthHeaders()) },
        body: JSON.stringify({
          userId,
          userName,
          bookingId: booking.id,
          subject: draft.subject,
          message: draft.message,
          emergency: draft.mode === "emergency",
          location,
        }),
      });

      const data = await response.json();
      if (!response.ok || data.error) {
        throw new Error(data.error ?? "Failed to contact Team Famlo.");
      }

      setDraft((current) => ({
        ...current,
        message: "",
        status: "sent",
        feedback:
          current.mode === "emergency"
            ? "Emergency alert shared with Team Famlo. They now have your booking and live location details."
            : "Support request sent to Team Famlo.",
      }));
    } catch (error) {
      setDraft((current) => ({
        ...current,
        status: "error",
        feedback: error instanceof Error ? error.message : "Support request failed.",
      }));
    }
  }

  return (
    <div style={{ 
      display: "grid", 
      gap: 16, 
      marginTop: 20, 
      padding: 24, 
      borderRadius: 20, 
      background: "#F8FAFC", 
      border: "1px solid #E0E8F5" 
    }}>
      <div style={{ display: "grid", gap: 6 }}>
        <div style={{ fontWeight: 800, color: "#0F1F3D", fontSize: 16 }}>Get assistance from Team Famlo</div>
        <p style={{ margin: 0, color: "#64748B", fontSize: 14, lineHeight: 1.5 }}>
          Use support for questions about your stay. Use emergency only if you need urgent help and want to share your live location.
        </p>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={() =>
            setDraft((current) => ({
              ...current,
              mode: "support",
              subject: current.subject || `Help with booking ${booking.id.slice(0, 8)}`,
              feedback: null,
            }))
          }
          style={{
            padding: "10px 18px",
            borderRadius: 999,
            border: draft.mode === "support" ? "2px solid #1A56DB" : "1px solid #CBD5E1",
            background: draft.mode === "support" ? "#EBF1FF" : "#FFF",
            color: draft.mode === "support" ? "#1A56DB" : "#64748B",
            fontWeight: 700,
            fontSize: 13,
            cursor: "pointer",
            transition: "all 0.15s ease"
          }}
        >
          General Support
        </button>
        <button
          type="button"
          onClick={() =>
            setDraft((current) => ({
              ...current,
              mode: "emergency",
              subject: current.subject || `Emergency for booking ${booking.id.slice(0, 8)}`,
              feedback: null,
            }))
          }
          style={{
            padding: "10px 18px",
            borderRadius: 999,
            border: draft.mode === "emergency" ? "2px solid #DC2626" : "1px solid #FEE2E2",
            background: draft.mode === "emergency" ? "#FEF2F2" : "#FFF",
            color: draft.mode === "emergency" ? "#B91C1C" : "#991B1B",
            fontWeight: 700,
            fontSize: 13,
            cursor: "pointer",
            transition: "all 0.15s ease"
          }}
        >
          Emergency Help
        </button>
      </div>

      <input
        className="text-input"
        value={draft.subject}
        onChange={(event) => setDraft((current) => ({ ...current, subject: event.target.value, feedback: null, status: "idle" }))}
        placeholder="What do you need help with?"
        style={{ borderColor: "#E0E8F5", borderRadius: 12 }}
      />
      <textarea
        className="text-input"
        rows={4}
        value={draft.message}
        onChange={(event) => setDraft((current) => ({ ...current, message: event.target.value, feedback: null, status: "idle" }))}
        placeholder={
          draft.mode === "emergency"
            ? "Tell Team Famlo what is happening right now..."
            : "Describe the issue..."
        }
        style={{ borderColor: "#E0E8F5", borderRadius: 12 }}
      />

      {draft.feedback ? (
        <div style={{ color: draft.status === "error" ? "#B91C1C" : "#059669", fontWeight: 700, fontSize: 14 }}>{draft.feedback}</div>
      ) : null}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button
          className="button-like"
          type="button"
          disabled={draft.status === "sending"}
          onClick={() => void createTicket(draft.mode === "emergency")}
          style={{ 
            background: draft.mode === "emergency" ? "#DC2626" : "#1A56DB",
            height: 48
          }}
        >
          {draft.status === "sending"
            ? "Sending..."
            : draft.mode === "emergency"
              ? "Share emergency alert"
              : "Send to Team Famlo"}
        </button>
      </div>
    </div>
  );
}

export function BookingsDashboard(): React.JSX.Element {
  const { user, profile, loading } = useUser();
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [loadingBookings, setLoadingBookings] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedFeedback, setExpandedFeedback] = useState<string | null>(null);
  const [expandedRoomRating, setExpandedRoomRating] = useState<string | null>(null);
  const [expandedSupport, setExpandedSupport] = useState<string | null>(null);
  const [submittedStories, setSubmittedStories] = useState<string[]>([]);
  const [checkInCodeByBookingId, setCheckInCodeByBookingId] = useState<Record<string, string>>({});
  const [checkInMessageByBookingId, setCheckInMessageByBookingId] = useState<Record<string, string>>({});
  const [checkInLoadingByBookingId, setCheckInLoadingByBookingId] = useState<Record<string, boolean>>({});
  const [receiptLoadingByBookingId, setReceiptLoadingByBookingId] = useState<Record<string, boolean>>({});
  const [cancelLoadingByBookingId, setCancelLoadingByBookingId] = useState<Record<string, boolean>>({});
  const [cancelMessageByBookingId, setCancelMessageByBookingId] = useState<Record<string, { type: "success" | "error"; text: string }>>({});
  const [pendingCancellation, setPendingCancellation] = useState<PendingCancellation | null>(null);

  const getAuthHeaders = useCallback(async (): Promise<Record<string, string>> => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const accessToken = session?.access_token;
    const headers: Record<string, string> = {};
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
    if (user?.id) headers["x-famlo-user-id"] = user.id;
    if (profile?.email) headers["x-famlo-user-email"] = profile.email;
    return headers;
  }, [profile?.email, supabase, user?.id]);

  useEffect(() => {
    if (!user) {
      setBookings([]);
      setLoadingBookings(false);
      return;
    }

    const userId = user.id;

    let cancelled = false;

    async function load(): Promise<void> {
      setLoadingBookings(true);
      setError(null);
      try {
        const response = await fetch("/api/user/bookings", {
          cache: "no-store",
          headers: await getAuthHeaders(),
        });
        const data = await response.json();
        if (!response.ok || data.error) {
          throw new Error(data.error ?? "Failed to load bookings.");
        }
        if (!cancelled) {
          setBookings(data as BookingRow[]);
        }
      } catch (nextError) {
        if (!cancelled) {
          setError(nextError instanceof Error ? nextError.message : "Failed to load bookings.");
        }
      } finally {
        if (!cancelled) {
          setLoadingBookings(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [getAuthHeaders, user]);

  const upcoming = useMemo(() => bookings.filter((booking) => !isPastBooking(booking)), [bookings]);
  const past = useMemo(() => bookings.filter((booking) => isPastBooking(booking)), [bookings]);

  async function requestGuestCheckInCode(booking: BookingRow): Promise<void> {
    if (!user) return;

    setCheckInLoadingByBookingId((current) => ({ ...current, [booking.id]: true }));
    setCheckInMessageByBookingId((current) => ({ ...current, [booking.id]: "" }));

    try {
      const response = await fetch("/api/user/bookings/check-in-code", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(await getAuthHeaders()),
        },
        body: JSON.stringify({
          bookingId: booking.id,
        }),
      });

      const payload = (await response.json()) as { error?: string; displayCode?: string; code?: string; message?: string };
      if (!response.ok || payload.error) {
        throw new Error(payload.error ?? "Could not load your check-in code.");
      }

      setCheckInCodeByBookingId((current) => ({
        ...current,
        [booking.id]: payload.displayCode ?? (payload.code ? formatCheckInCode(payload.code) : ""),
      }));
      setCheckInMessageByBookingId((current) => ({
        ...current,
        [booking.id]: payload.message ?? "Tell this code to your host to confirm check-in.",
      }));
    } catch (error) {
      setCheckInMessageByBookingId((current) => ({
        ...current,
        [booking.id]: error instanceof Error ? error.message : "Could not load your check-in code.",
      }));
    } finally {
      setCheckInLoadingByBookingId((current) => ({ ...current, [booking.id]: false }));
    }
  }

  async function cancelBooking(booking: BookingRow): Promise<void> {
    if (!canGuestCancelBooking(booking)) return;
    setCancelMessageByBookingId((current) => {
      const next = { ...current };
      delete next[booking.id];
      return next;
    });
    setPendingCancellation({
      booking,
      hostName: getCancellationHostName(booking),
      quote: buildCancellationQuote(booking),
    });
  }

  async function confirmCancelBooking(): Promise<void> {
    if (!pendingCancellation) return;

    const { booking, quote } = pendingCancellation;
    setCancelLoadingByBookingId((current) => ({ ...current, [booking.id]: true }));

    try {
      const cancelResponse = await fetch("/api/bookings/cancel", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(await getAuthHeaders()),
        },
        body: JSON.stringify({ bookingId: booking.id, action: "cancel" }),
      });
      const cancelPayload = (await cancelResponse.json()) as { error?: string; quote?: CancellationQuote };
      if (!cancelResponse.ok || cancelPayload.error) {
        throw new Error(cancelPayload.error ?? "Could not cancel booking.");
      }

      setBookings((current) =>
        current.map((row) => (row.id === booking.id ? { ...row, status: "cancelled_by_user" } : row))
      );
      setCancelMessageByBookingId((current) => ({
        ...current,
        [booking.id]: {
          type: "success",
          text: `Booking cancelled. Refund review amount: ${formatInr(cancelPayload.quote?.refundableAmount ?? quote.refundableAmount)}.`,
        },
      }));
      setPendingCancellation(null);
    } catch (error) {
      setCancelMessageByBookingId((current) => ({
        ...current,
        [booking.id]: {
          type: "error",
          text: error instanceof Error ? error.message : "Could not cancel booking.",
        },
      }));
    } finally {
      setCancelLoadingByBookingId((current) => ({ ...current, [booking.id]: false }));
    }
  }

  async function downloadReceipt(bookingId: string): Promise<void> {
    setReceiptLoadingByBookingId((current) => ({ ...current, [bookingId]: true }));
    try {
      const response = await fetch(`/api/bookings/receipt?bookingId=${encodeURIComponent(bookingId)}&download=1`, {
        headers: await getAuthHeaders(),
      });

      if (!response.ok) {
        let message = "Could not download receipt.";
        try {
          const payload = (await response.json()) as { error?: string };
          message = payload.error ?? message;
        } catch {
          // Keep fallback message when the error payload is not JSON.
        }
        throw new Error(message);
      }

      const html = await response.text();
      const blob = new Blob([html], { type: "text/html;charset=utf-8" });
      const objectUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = `famlo-receipt-${bookingId}.html`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(objectUrl);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not download receipt.");
    } finally {
      setReceiptLoadingByBookingId((current) => {
        const next = { ...current };
        delete next[bookingId];
        return next;
      });
    }
  }

  if (loading || loadingBookings) {
    return (
      <main className="shell account-page-shell" style={{ paddingTop: "40px", paddingBottom: "60px" }}>
        <section className="panel detail-box account-page-panel">
          <h1>My Bookings</h1>
          <p>Loading your Famlo trips.</p>
        </section>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="shell account-page-shell" style={{ paddingTop: "40px", paddingBottom: "60px" }}>
        <section className="panel detail-box account-page-panel">
          <h1>My Bookings</h1>
          <p>Sign in with your Famlo account to see your bookings, stories, and chats.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="shell account-page-shell" style={{ paddingTop: "40px", paddingBottom: "60px" }}>
      <section className="panel account-page-panel" style={{ display: "grid", gap: 24, padding: "clamp(24px, 4vw, 40px)" }}>
        <div className="account-page-header" style={{ display: "grid", gap: 8, marginBottom: 12 }}>
          <span className="eyebrow" style={{ color: "#1A56DB", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", fontSize: 12 }}>Account</span>
          <h1 style={{ margin: 0, fontSize: "clamp(32px, 5vw, 48px)", fontWeight: 800 }}>My Bookings</h1>
          <p style={{ margin: 0, color: "#64748b", maxWidth: "60ch", fontSize: 16 }}>
            Track your upcoming stays, reopen conversations with hosts, and leave a story after your trip ends.
          </p>
        </div>

        {error ? <div style={{ color: "#b91c1c", fontWeight: 700, padding: 12, background: "#FEF2F2", borderRadius: 12 }}>{error}</div> : null}

        {[{ title: "Upcoming and active", items: upcoming }, { title: "Past stays", items: past }].map((section) => (
          <div key={section.title} style={{ display: "grid", gap: 20 }}>
            <h2 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: "#0F1F3D" }}>{section.title}</h2>
            {section.items.length === 0 ? (
              <div className="panel detail-box" style={{ padding: 24, textAlign: "center", background: "#F8FAFC" }}>
                <p style={{ margin: 0, color: "#64748B" }}>No bookings here yet.</p>
              </div>
            ) : (
              section.items.map((booking) => {
                const stayName = booking.families?.property_name ?? booking.families?.name ?? booking.companions?.name ?? "Famlo booking";
                const location = [booking.families?.city ?? booking.companions?.city, booking.families?.state ?? booking.companions?.state].filter(Boolean).join(", ");
                const canLeaveStory =
                  Boolean(booking.family_id || booking.families?.id) &&
                  booking.status === "completed" &&
                  !submittedStories.includes(booking.id);
                const statusMeta = getBookingStatusMeta(booking.status, canLeaveStory);
                const canOpenChat = Boolean(booking.conversation_id) && isChatUnlocked(booking.status);
                const canCancel = canGuestCancelBooking(booking);

                return (
                  <article key={booking.id} className="panel" style={{ 
                    display: "grid", 
                    gap: 20, 
                    padding: "clamp(20px, 3vw, 32px)", 
                    border: "1px solid #E0E8F5",
                    boxShadow: "0 10px 15px -3px rgba(15, 31, 61, 0.04)",
                    transition: "all 0.2s ease"
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center", flexWrap: "wrap", borderBottom: "1px solid #F1F5F9", paddingBottom: 16 }}>
                      <div>
                        <h3 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: "#0F1F3D", letterSpacing: "-0.01em" }}>{stayName}</h3>
                        <p style={{ margin: "4px 0 0", color: "#64748B", fontSize: 13, display: "flex", alignItems: "center", gap: 6, fontWeight: 500 }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
                          {location || "Location shared after booking"}
                        </p>
                      </div>
                      <span style={{ 
                        padding: "6px 16px", 
                        borderRadius: 999, 
                        background: statusMeta.background, 
                        color: statusMeta.color, 
                        fontSize: 12,
                        fontWeight: 800,
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                        border: `1px solid ${statusMeta.color}15`
                      }}>
                        {statusMeta.label}
                      </span>
                    </div>

                    <div style={{ 
                      display: "grid", 
                      gridTemplateColumns: "repeat(5, 1fr)", 
                      gap: 20,
                      background: "#F8FAFC",
                      padding: "20px 24px",
                      borderRadius: 16,
                      border: "1px solid #F1F5F9"
                    }} className="booking-details-grid">
                      <div style={{ display: "grid", gap: 6 }}>
                        <span style={{ fontSize: 10, fontWeight: 800, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.05em" }}>Dates</span>
                        <span style={{ fontSize: 14, fontWeight: 700, color: "#1E293B" }}>{formatDateRange(booking)}</span>
                      </div>
                      <div style={{ display: "grid", gap: 6 }}>
                        <span style={{ fontSize: 10, fontWeight: 800, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.05em" }}>Guests</span>
                        <span style={{ fontSize: 14, fontWeight: 700, color: "#1E293B" }}>{booking.guests_count ?? 1} {Number(booking.guests_count) === 1 ? 'Guest' : 'Guests'}</span>
                      </div>
                      <div style={{ display: "grid", gap: 6 }}>
                        <span style={{ fontSize: 10, fontWeight: 800, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.05em" }}>Stay</span>
                        <span style={{ fontSize: 14, fontWeight: 700, color: "#1E293B", textTransform: "capitalize" }}>{booking.quarter_type ?? booking.quarter_time ?? "Planned"}</span>
                      </div>
                      <div style={{ display: "grid", gap: 6 }}>
                        <span style={{ fontSize: 10, fontWeight: 800, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.05em" }}>Total Price</span>
                        <span style={{ fontSize: 14, fontWeight: 700, color: "#1E293B" }}>{typeof booking.total_price === "number" ? formatInr(booking.total_price) : "—"}</span>
                      </div>
                      <div style={{ display: "grid", gap: 6 }}>
                        <span style={{ fontSize: 10, fontWeight: 800, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.05em" }}>Payment</span>
                        <span style={{ 
                          fontSize: 14, 
                          fontWeight: 700, 
                          color: booking.payment_status === "paid" ? "#059669" : "#1A56DB",
                          textTransform: "capitalize"
                        }}>
                          {booking.payment_status?.replaceAll("_", " ") ?? "Pending"}
                        </span>
                      </div>
                    </div>

                    <div
                      style={{
                        padding: "16px 20px",
                        borderRadius: 16,
                        background: "linear-gradient(135deg, #1A56DB08, #1A56DB03)",
                        border: "1px solid #1A56DB10",
                        color: "#334155",
                        lineHeight: 1.5,
                        fontSize: 14
                      }}
                    >
                      <strong style={{ color: "#1A56DB", fontWeight: 700 }}>Next steps:</strong> {statusMeta.nextStep}
                    </div>

                    {booking.status === "confirmed" || booking.status === "accepted" ? (
                      <div
                        style={{
                          display: "grid",
                          gap: 14,
                          padding: "20px",
                          borderRadius: "16px",
                          background: "linear-gradient(135deg, #1A56DB, #1E40AF)",
                          boxShadow: "0 10px 15px -3px rgba(26, 86, 219, 0.2)",
                          color: "#FFFFFF"
                        }}
                      >
                        <div style={{ display: "grid", gap: 4 }}>
                          <div style={{ fontSize: "11px", fontWeight: 900, color: "rgba(255,255,255,0.8)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                            Arrived at property?
                          </div>
                          <p style={{ margin: 0, color: "#FFFFFF", fontSize: "14px", fontWeight: 500, lineHeight: 1.4 }}>
                            Tap below to show your secret check-in code to the host.
                          </p>
                        </div>
                        <button
                          type="button"
                          className="button-like"
                          onClick={() => void requestGuestCheckInCode(booking)}
                          disabled={Boolean(checkInLoadingByBookingId[booking.id])}
                          style={{ 
                            width: "fit-content", 
                            background: "#FFFFFF", 
                            color: "#1A56DB",
                            border: "none",
                            padding: "0 24px"
                          }}
                        >
                          {checkInLoadingByBookingId[booking.id] ? "Loading..." : "Show Check-in Code"}
                        </button>
                        {checkInCodeByBookingId[booking.id] ? (
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 12,
                              flexWrap: "wrap",
                              padding: "16px",
                              borderRadius: "12px",
                              background: "rgba(255,255,255,0.1)",
                              backdropFilter: "blur(4px)",
                              border: "1px solid rgba(255,255,255,0.2)"
                            }}
                          >
                            <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.9)", fontWeight: 700 }}>YOUR CODE</span>
                            <span style={{ fontSize: "24px", fontWeight: 900, letterSpacing: "0.2em", color: "#FFFFFF" }}>
                              {checkInCodeByBookingId[booking.id]}
                            </span>
                          </div>
                        ) : null}
                        {checkInMessageByBookingId[booking.id] ? (
                          <div style={{ fontSize: "13px", fontWeight: 600, color: "rgba(255,255,255,0.9)" }}>
                            {checkInMessageByBookingId[booking.id]}
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    <div className="account-booking-actions" style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 4 }}>
                      <Link href="/messages" className="button-like" style={{ 
                        textDecoration: "none", 
                        background: "#1A56DB",
                        padding: "0 28px",
                        fontSize: 14,
                        fontWeight: 700,
                        height: 48,
                        borderRadius: 14,
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center"
                      }}>
                        Open inbox
                      </Link>
                      <button className="btn-ghost" style={{ 
                        textDecoration: "none", 
                        borderColor: "#E2E8F0",
                        color: "#475569",
                        fontSize: 14,
                        padding: "0 20px",
                        height: 48,
                        borderRadius: 14,
                        background: "#FFFFFF",
                        fontWeight: 600,
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center"
                      }} type="button" onClick={() => void downloadReceipt(booking.id)} disabled={Boolean(receiptLoadingByBookingId[booking.id])}>
                        {receiptLoadingByBookingId[booking.id] ? "Preparing receipt..." : "Download receipt"}
                      </button>
                      {canCancel ? (
                        <button
                          className="btn-ghost"
                          style={{
                            textDecoration: "none",
                            borderColor: "#FECACA",
                            color: "#B91C1C",
                            fontSize: 14,
                            padding: "0 20px",
                            height: 48,
                            borderRadius: 14,
                            background: "#FEF2F2",
                            fontWeight: 700,
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center"
                          }}
                          type="button"
                          onClick={() => void cancelBooking(booking)}
                          disabled={Boolean(cancelLoadingByBookingId[booking.id])}
                        >
                          {cancelLoadingByBookingId[booking.id] ? "Cancelling..." : "Cancel booking"}
                        </button>
                      ) : null}
                      {canOpenChat ? (
                        <Link href={`/messages?conversation=${booking.conversation_id}`} className="btn-ghost" style={{ 
                          textDecoration: "none",
                          borderColor: "#E2E8F0",
                          color: "#475569",
                          fontSize: 14,
                          padding: "0 20px",
                          height: 48,
                          borderRadius: 14,
                          background: "#FFFFFF",
                          fontWeight: 600,
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center"
                        }}>
                          Open booking chat
                        </Link>
                      ) : null}
                      <button
                        type="button"
                        className="btn-ghost"
                        style={{ 
                          borderColor: "#E2E8F0",
                          color: "#475569",
                          fontSize: 14,
                          padding: "0 20px",
                          height: 48,
                          borderRadius: 14,
                          background: "#FFFFFF",
                          fontWeight: 600,
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center"
                        }}
                        onClick={() => setExpandedSupport((current) => (current === booking.id ? null : booking.id))}
                      >
                        {expandedSupport === booking.id ? "Hide assistance" : "Get assistance"}
                      </button>
                      {canLeaveStory ? (
                        <button
                          type="button"
                          className="btn-ghost"
                          style={{ 
                            borderColor: "#E2E8F0",
                            color: "#475569",
                            fontSize: 14,
                            padding: "0 20px",
                            height: 48,
                            borderRadius: 14,
                            background: "#FFFFFF",
                            fontWeight: 600,
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center"
                          }}
                          onClick={() => setExpandedFeedback((current) => (current === booking.id ? null : booking.id))}
                        >
                          {expandedFeedback === booking.id ? "Hide story form" : "Write your story"}
                        </button>
                      ) : null}
                      {booking.status === "completed" ? (
                        <button
                          type="button"
                          className="btn-ghost"
                          style={{
                            borderColor: "#E2E8F0",
                            color: "#475569",
                            fontSize: 14,
                            padding: "0 20px",
                            height: 48,
                            borderRadius: 14,
                            background: "#FFFFFF",
                            fontWeight: 600,
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                          onClick={() => setExpandedRoomRating((current) => (current === booking.id ? null : booking.id))}
                        >
                          {expandedRoomRating === booking.id ? "Hide room rating" : "Rate room"}
                        </button>
                      ) : null}
                    </div>

                    {cancelMessageByBookingId[booking.id] ? (
                      <div
                        style={{
                          color: cancelMessageByBookingId[booking.id].type === "error" ? "#B91C1C" : "#047857",
                          fontWeight: 700,
                          fontSize: 14,
                          padding: "12px 14px",
                          borderRadius: 12,
                          background: cancelMessageByBookingId[booking.id].type === "error" ? "#FEF2F2" : "#ECFDF5",
                          border: `1px solid ${cancelMessageByBookingId[booking.id].type === "error" ? "#FECACA" : "#BBF7D0"}`
                        }}
                      >
                        {cancelMessageByBookingId[booking.id].text}
                      </div>
                    ) : null}

                    {expandedSupport === booking.id ? (
                      <BookingSupportCard booking={booking} userId={user.id} userName={profile?.name ?? "Famlo guest"} getAuthHeaders={getAuthHeaders} />
                    ) : null}

                    {expandedFeedback === booking.id && canLeaveStory ? (
                      <BookingStoryForm
                        booking={booking}
                        userName={profile?.name ?? "Famlo guest"}
                        userCity={profile?.city ?? ""}
                        onSaved={(bookingId) => {
                          setSubmittedStories((current) => [...current, bookingId]);
                          setExpandedFeedback(null);
                        }}
                      />
                    ) : null}

                    {expandedRoomRating === booking.id && booking.status === "completed" ? (
                      <BookingRoomRatingForm
                        booking={booking}
                        stayName={stayName}
                        getAuthHeaders={getAuthHeaders}
                      />
                    ) : null}
                  </article>
                );
              })
            )}
          </div>
        ))}
      </section>
      {pendingCancellation ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="cancel-booking-title"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 50,
            display: "grid",
            placeItems: "center",
            padding: 20,
            background: "rgba(15, 23, 42, 0.45)",
          }}
        >
          <div
            className="panel"
            style={{
              width: "min(520px, 100%)",
              display: "grid",
              gap: 18,
              padding: "clamp(22px, 4vw, 32px)",
              border: "1px solid #FECACA",
              boxShadow: "0 24px 70px rgba(15, 23, 42, 0.28)",
            }}
          >
            <div style={{ display: "grid", gap: 8 }}>
              <h2 id="cancel-booking-title" style={{ margin: 0, fontSize: 22, fontWeight: 900, color: "#0F1F3D" }}>
                Cancel booking?
              </h2>
              <p style={{ margin: 0, color: "#334155", fontSize: 15, lineHeight: 1.6 }}>
                {pendingCancellation.hostName} is preparing for your stay and planning for you. Do you really want to cancel?
              </p>
            </div>
            <div
              style={{
                display: "grid",
                gap: 8,
                padding: 14,
                borderRadius: 12,
                background: "#FEF2F2",
                border: "1px solid #FECACA",
                color: "#7F1D1D",
                fontSize: 14,
                fontWeight: 700,
              }}
            >
              <span>{pendingCancellation.quote.refundRule ?? "Famlo will calculate the cancellation amount."}</span>
              <span>Penalty: {pendingCancellation.quote.penaltyPercent ?? 0}% ({formatInr(pendingCancellation.quote.penaltyAmount)})</span>
              <span>Refundable amount: {formatInr(pendingCancellation.quote.refundableAmount)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, flexWrap: "wrap" }}>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => setPendingCancellation(null)}
                disabled={Boolean(cancelLoadingByBookingId[pendingCancellation.booking.id])}
                style={{ height: 46, padding: "0 18px", borderRadius: 12, background: "#FFFFFF" }}
              >
                No, keep booking
              </button>
              <button
                type="button"
                className="button-like"
                onClick={() => void confirmCancelBooking()}
                disabled={Boolean(cancelLoadingByBookingId[pendingCancellation.booking.id])}
                style={{ height: 46, padding: "0 20px", borderRadius: 12, background: "#DC2626" }}
              >
                {cancelLoadingByBookingId[pendingCancellation.booking.id] ? "Cancelling..." : "Yes, cancel booking"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
