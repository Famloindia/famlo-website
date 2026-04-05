"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { parseHostListingMeta } from "@/lib/hostListingMeta";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import type { FamilyProfile, HostOnboardingDraft } from "@/lib/types";

interface HomeHostDashboardProps {
  draft: HostOnboardingDraft | null;
  family: FamilyProfile | null;
  familyPhotos?: string[];
  hostBookings?: HostBooking[];
  initialSection?: "overview" | "financial" | "schedule" | "bookings" | "listing" | "profile" | "compliance";
  welcomeMode?: boolean;
}

type HostBooking = {
  id: string;
  status: string | null;
  date_from: string | null;
  date_to: string | null;
  quarter_type: string | null;
  guests_count: number | null;
  total_price: number | null;
  family_payout: number | null;
  user_id?: string | null;
  user_name?: string | null;
  user_city?: string | null;
};

type BookingMessage = {
  id: string;
  sender_id: string | null;
  sender_type: string | null;
  content: string | null;
  created_at: string | null;
  receiver_id?: string | null;
};

type DashboardSection =
  | "overview"
  | "financial"
  | "schedule"
  | "bookings"
  | "listing"
  | "profile"
  | "compliance";

type ComplianceState = {
  pccFileName: string;
  propertyProofFileName: string;
  formCAcknowledged: boolean;
  adminNotes: string;
};

const SLOT_CONFIG = [
  { key: "morning", label: "Morning", time: "7AM - 12PM" },
  { key: "afternoon", label: "Afternoon", time: "12PM - 5PM" },
  { key: "evening", label: "Evening", time: "5PM - 10PM" },
  { key: "fullday", label: "Full Day", time: "7AM - 10PM" }
] as const;

const INCLUDED_OPTIONS = [
  "Cultural home-cooked meal",
  "Family cultural talks",
  "Local knowledge & stories",
  "Night village tour option",
  "Safety verified stay",
  "Sunrise chai ritual",
  "Traditional cooking session",
  "Village market walk",
  "Terrace evening sitting"
] as const;

const HOUSE_RULE_OPTIONS = [
  "Respect the family home",
  "No alcohol or smoking",
  "Arrive at the selected time",
  "Quiet hours after 10 PM",
  "Shoes off in indoor spaces",
  "Ask before photography",
  "Keep shared spaces clean"
] as const;

const DEFAULT_ACTIVE_QUARTERS = SLOT_CONFIG.map((slot) => slot.key);

function joinList(values: string[] | null | undefined): string {
  return values?.join(", ") ?? "";
}

function parseStringList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function slotToken(dateStr: string, slotKey: string): string {
  return `${dateStr}::${slotKey}`;
}

function todayKey(date = new Date()): string {
  return date.toISOString().split("T")[0] ?? "";
}

function monthMatrix(month: number, year: number): Array<number | null> {
  const firstDay = new Date(year, month, 1).getDay();
  const totalDays = new Date(year, month + 1, 0).getDate();
  const cells: Array<number | null> = [];
  for (let index = 0; index < firstDay; index += 1) cells.push(null);
  for (let day = 1; day <= totalDays; day += 1) cells.push(day);
  return cells;
}

function dayToDateKey(day: number, month: number, year: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parsePrice(value: string): number {
  return Math.max(0, Number(value || 0));
}

function calculateHostPayout(price: number, serviceFeePercent: number): number {
  const serviceFee = price * (serviceFeePercent / 100);
  const paymentGatewayFee = price * 0.02;
  const gstOnFees = (serviceFee + paymentGatewayFee) * 0.18;
  return Math.max(0, price - serviceFee - paymentGatewayFee - gstOnFees);
}

function statusCopy(status: HostOnboardingDraft["listing_status"] | "inactive"): {
  label: string;
  tone: string;
  progress: number;
} {
  switch (status) {
    case "active":
      return { label: "Live", tone: "bg-[#ecfdf3] text-[#166534] border-[#b7e5c4]", progress: 100 };
    case "conditional_pending":
      return { label: "Conditionally Approved", tone: "bg-[#fff7e6] text-[#92400e] border-[#efd39d]", progress: 88 };
    case "approved":
      return { label: "Inactive - Pending Document Verification", tone: "bg-[#fff7e6] text-[#92400e] border-[#efd39d]", progress: 80 };
    case "paused":
      return { label: "Paused", tone: "bg-[#fff1f2] text-[#9f1239] border-[#f9c7d2]", progress: 80 };
    default:
      return { label: "", tone: "", progress: 80 };
  }
}

export function HomeHostDashboard({
  draft,
  family,
  familyPhotos = [],
  hostBookings = [],
  initialSection = "overview",
  welcomeMode = false
}: Readonly<HomeHostDashboardProps>): JSX.Element {
  const router = useRouter();
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const payload = (draft?.payload ?? {}) as Record<string, unknown>;
  const initialCompliance = (draft?.compliance ?? {}) as Record<string, unknown>;
  const familyMeta = parseHostListingMeta(family?.admin_notes ?? null);
  const initialDate = new Date();

  const [section, setSection] = useState<DashboardSection>(initialSection);
  const [savingSection, setSavingSection] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [photoUploadMessage, setPhotoUploadMessage] = useState<string | null>(null);
  const [calMonth, setCalMonth] = useState(initialDate.getMonth());
  const [calYear, setCalYear] = useState(initialDate.getFullYear());
  const [selectedDate, setSelectedDate] = useState<string | null>(todayKey());
  const [selectedBooking, setSelectedBooking] = useState<string | null>(null);
  const [showGuestPreview, setShowGuestPreview] = useState(false);
  const [bookingMessages, setBookingMessages] = useState<BookingMessage[]>([]);
  const [bookingConversationId, setBookingConversationId] = useState<string | null>(null);
  const [bookingChatText, setBookingChatText] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatSending, setChatSending] = useState(false);
  const [profileForm, setProfileForm] = useState({
    fullName: String(payload.fullName ?? draft?.primary_host_name ?? ""),
    mobileNumber: String(payload.mobileNumber ?? draft?.mobile_number ?? family?.host_phone ?? ""),
    email: String(payload.email ?? ""),
    city: String(payload.city ?? family?.city ?? ""),
    state: String(payload.state ?? family?.state ?? ""),
    cityNeighbourhood: String(payload.cityNeighbourhood ?? familyMeta.neighbourhood ?? family?.village ?? ""),
    hostHobbies: String(payload.hostHobbies ?? familyMeta.hostHobbies ?? ""),
    familyComposition: String(payload.familyComposition ?? familyMeta.familyComposition ?? family?.about ?? ""),
    languages: String(payload.languages ?? joinList(family?.languages)),
    notes: String(familyMeta.complianceNote ?? "")
  });
  const [listingForm, setListingForm] = useState({
    propertyName: String(payload.propertyName ?? family?.name ?? ""),
    listingTitle: String(payload.listingTitle ?? familyMeta.listingTitle ?? family?.name ?? ""),
    hostBio: String(payload.hostBio ?? family?.about ?? family?.description ?? ""),
    culturalOffering: String(payload.culturalOffering ?? familyMeta.culturalOffering ?? ""),
    bathroomType: String(payload.bathroomType ?? familyMeta.bathroomType ?? ""),
    propertyAddress: String(payload.propertyAddress ?? familyMeta.propertyAddress ?? ""),
    amenities: String(payload.amenities ?? joinList(familyMeta.amenities)),
    includedItems: String(payload.includedItems ?? joinList(familyMeta.includedItems)),
    houseRules: String(payload.houseRules ?? joinList(familyMeta.houseRules)),
    photoUrls: String(payload.photoUrls ?? familyPhotos.join(", ")),
    googleMapsLink: String(payload.googleMapsLink ?? family?.google_maps_link ?? ""),
    priceMorning: String(payload.priceMorning ?? family?.price_morning ?? 0),
    priceAfternoon: String(payload.priceAfternoon ?? family?.price_afternoon ?? 0),
    priceEvening: String(payload.priceEvening ?? family?.price_evening ?? 0),
    priceFullday: String(payload.priceFullday ?? family?.price_fullday ?? 0)
  });
  const [scheduleForm, setScheduleForm] = useState({
    isActive: family?.is_active ?? false,
    isAccepting: family?.is_accepting ?? draft?.listing_status === "active",
    maxGuests: String(payload.maxGuests ?? family?.max_guests ?? 3),
    activeQuarters: String(payload.activeQuarters ?? joinList(family?.active_quarters ?? DEFAULT_ACTIVE_QUARTERS)),
    blockedDates: String(payload.blockedDates ?? joinList(family?.blocked_dates))
  });
  const [compliance, setCompliance] = useState<ComplianceState>({
    pccFileName:
      typeof initialCompliance.pccFileName === "string"
        ? initialCompliance.pccFileName
        : String(familyMeta.pccFileName ?? ""),
    propertyProofFileName:
      typeof initialCompliance.propertyProofFileName === "string"
        ? initialCompliance.propertyProofFileName
        : String(familyMeta.propertyProofFileName ?? ""),
    formCAcknowledged:
      Boolean(
        initialCompliance.formCAcknowledged !== undefined
          ? initialCompliance.formCAcknowledged
          : familyMeta.formCAcknowledged
      ),
    adminNotes: typeof initialCompliance.adminNotes === "string" ? initialCompliance.adminNotes : profileForm.notes
  });

  const status = statusCopy(scheduleForm.isActive ? draft?.listing_status ?? "active" : "inactive");
  const activeQuarterList = useMemo(() => parseStringList(scheduleForm.activeQuarters), [scheduleForm.activeQuarters]);
  const blockedTokens = useMemo(() => parseStringList(scheduleForm.blockedDates), [scheduleForm.blockedDates]);
  const maxGuests = Math.max(1, Number(scheduleForm.maxGuests || 1));
  const confirmedBookings = hostBookings.filter((booking) => booking.status === "confirmed" || booking.status === "completed");
  const currentMonthKey = new Date().toISOString().slice(0, 7);
  const monthlyBookings = confirmedBookings.filter((booking) => String(booking.date_from ?? "").slice(0, 7) === currentMonthKey);
  const monthlyEstimate = monthlyBookings.reduce(
    (sum, booking) => sum + Math.round(Number(booking.family_payout ?? booking.total_price ?? 0)),
    0
  );
  const totalStays = confirmedBookings.length;
  const monthlyStayCount = monthlyBookings.length;
  const serviceFee = totalStays >= 100 ? 12 : totalStays >= 50 ? 15 : 18;
  const transactions = useMemo(
    () =>
      hostBookings.map((booking) => {
        const bookingDate = booking.date_from ? new Date(booking.date_from) : new Date();
        const daysAgo = (Date.now() - bookingDate.getTime()) / (1000 * 60 * 60 * 24);
        return {
          id: booking.id,
          period: daysAgo <= 7 ? "Week" : "Month",
          label: booking.user_name || "Guest booking",
          slot: booking.quarter_type || "Stay",
          amount: Math.round(Number(booking.family_payout ?? booking.total_price ?? 0)),
          status: booking.status === "confirmed" || booking.status === "completed" ? "Paid" : booking.status || "Pending"
        };
      }),
    [hostBookings]
  );
  const [transactionPeriod, setTransactionPeriod] = useState<"week" | "month">("week");
  const filteredTransactions = transactions.filter((item) => item.period.toLowerCase() === transactionPeriod);
  const missingDocs = useMemo(
    () => [!compliance.pccFileName, !compliance.propertyProofFileName].filter(Boolean).length,
    [compliance.pccFileName, compliance.propertyProofFileName]
  );
  const previewAmenities = parseStringList(listingForm.amenities).slice(0, 3);
  const previewIncludedItems = parseStringList(listingForm.includedItems);
  const previewHouseRules = parseStringList(listingForm.houseRules);
  const previewLocation = [profileForm.cityNeighbourhood, profileForm.city, profileForm.state].filter(Boolean).join(", ");
  const previewImage = parseStringList(listingForm.photoUrls)[0];
  const photoGallery = parseStringList(listingForm.photoUrls).slice(0, 5);
  const liveBookingSummary = hostBookings.slice(0, 6);
  const selectedBookingDetail = useMemo(
    () => hostBookings.find((booking) => booking.id === selectedBooking) ?? null,
    [hostBookings, selectedBooking]
  );
  const quarterPrices = [
    { key: "morning", label: "Morning", price: parsePrice(listingForm.priceMorning) },
    { key: "afternoon", label: "Afternoon", price: parsePrice(listingForm.priceAfternoon) },
    { key: "evening", label: "Evening", price: parsePrice(listingForm.priceEvening) },
    { key: "fullday", label: "Full day", price: parsePrice(listingForm.priceFullday) }
  ];
  const activePriceRows = quarterPrices.filter((slot) => slot.price > 0);
  const lowestGuestPrice = activePriceRows.length > 0 ? Math.min(...activePriceRows.map((slot) => slot.price)) : 0;
  const featuredPrice = parsePrice(listingForm.priceFullday) || lowestGuestPrice;
  const featuredHostPayout = calculateHostPayout(featuredPrice, serviceFee);

  useEffect(() => {
    const timer = window.setInterval(() => {
      router.refresh();
    }, 10000);
    return () => window.clearInterval(timer);
  }, [router]);

  useEffect(() => {
    if (!selectedBooking) {
      setBookingMessages([]);
      setBookingConversationId(null);
      return;
    }

    let active = true;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const loadBookingMessages = async () => {
      setChatLoading(true);
      const conversationsTable = supabase.from("conversations") as any;
      const messagesTable = supabase.from("messages") as any;
      const { data: conversationRows } = await conversationsTable
        .select("id")
        .eq("booking_id", selectedBooking)
        .order("created_at", { ascending: false })
        .limit(1);

      const conversationId = conversationRows?.[0]?.id ?? null;
      if (active) {
        setBookingConversationId(conversationId);
      }

      if (!conversationId) {
        if (active) {
          setBookingMessages([]);
          setChatLoading(false);
        }
        return;
      }

      let query = messagesTable
        .select("id,sender_id,receiver_id,sender_type,content,created_at")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });

      if (family?.host_id) {
        query = query.or(`receiver_id.is.null,receiver_id.eq.${family.host_id},sender_id.eq.${family.host_id}`);
      }

      const { data } = await query;

      if (active) {
        setBookingMessages((data ?? []) as BookingMessage[]);
        setChatLoading(false);
      }
    };

    void loadBookingMessages();

    channel = supabase
      .channel(`web_host_booking_${selectedBooking}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages", filter: `booking_id=eq.${selectedBooking}` },
        () => {
          void loadBookingMessages();
        }
      )
      .subscribe();

    return () => {
      active = false;
      if (channel) supabase.removeChannel(channel);
    };
  }, [selectedBooking, family?.host_id, supabase]);

  async function saveDashboard(which: "profile" | "listing" | "schedule"): Promise<void> {
    setSavingSection(which);
    setSaveMessage(null);

    const response = await fetch("/api/onboarding/home/dashboard-save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        draftId: draft?.id,
        familyId: family?.id ?? draft?.family_id,
        profile: { ...profileForm, notes: compliance.adminNotes },
        listing: listingForm,
        schedule: scheduleForm
      })
    });

    const payloadResult = (await response.json()) as { error?: string };
    setSavingSection(null);
    setSaveMessage(response.ok ? `${which[0].toUpperCase()}${which.slice(1)} saved.` : payloadResult.error ?? "Unable to save.");
  }

  async function toggleListingLive(): Promise<void> {
    const nextActive = !scheduleForm.isActive;
    const nextSchedule = {
      ...scheduleForm,
      isActive: nextActive,
      isAccepting: nextActive
    };

    setScheduleForm(nextSchedule);
    setSavingSection("schedule");
    setSaveMessage(null);

    const response = await fetch("/api/onboarding/home/dashboard-save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        draftId: draft?.id,
        familyId: family?.id ?? draft?.family_id,
        profile: { ...profileForm, notes: compliance.adminNotes },
        listing: listingForm,
        schedule: nextSchedule
      })
    });

    const payloadResult = (await response.json()) as { error?: string };
    setSavingSection(null);
    if (!response.ok) {
      setScheduleForm((current) => ({
        ...current,
        isActive: !nextActive,
        isAccepting: !nextActive
      }));
      setSaveMessage(payloadResult.error ?? "Unable to update listing status.");
      return;
    }

    setSaveMessage(nextActive ? "Listing is now active everywhere." : "Listing is now inactive everywhere.");
  }

  async function saveCompliance(nextStatus?: HostOnboardingDraft["listing_status"]): Promise<void> {
    const response = await fetch("/api/onboarding/home/dashboard-save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        draftId: draft?.id,
        familyId: family?.id ?? draft?.family_id,
        profile: { ...profileForm, notes: compliance.adminNotes },
        listing: listingForm,
        schedule: scheduleForm,
        compliancePatch: {
          ...compliance,
          updatedAt: new Date().toISOString(),
          listingStatus: nextStatus ?? draft?.listing_status ?? "approved"
        }
      })
    });

    const payloadResult = (await response.json()) as { error?: string };
    setSaveMessage(response.ok ? "Compliance saved." : payloadResult.error ?? "Unable to save compliance.");
  }

  async function sendBookingMessage(): Promise<void> {
    if (!selectedBookingDetail || !family?.host_id) return;
    const content = bookingChatText.trim();
    if (!content) return;

    setChatSending(true);
    const conversationsTable = supabase.from("conversations") as any;
    const messagesTable = supabase.from("messages") as any;

    const { data: conversationRows } = await conversationsTable
      .select("id")
      .eq("booking_id", selectedBookingDetail.id)
      .order("created_at", { ascending: false })
      .limit(1);

    let conversationId = bookingConversationId || (conversationRows?.[0]?.id ?? null);

    if (!conversationId) {
      const { data: insertedConversation } = await conversationsTable
        .insert({
          family_id: family.id,
          booking_id: selectedBookingDetail.id,
          guest_id: selectedBookingDetail.user_id ?? null,
          host_id: family.host_id ?? null,
          host_unread: 0,
          guest_unread: 1,
          last_message: content,
          last_message_at: new Date().toISOString(),
          created_at: new Date().toISOString()
        })
        .select("id")
        .single();
      conversationId = insertedConversation?.id ?? null;
    }

    if (!conversationId) {
      setChatSending(false);
      return;
    }

    await messagesTable.insert({
      conversation_id: conversationId,
      booking_id: selectedBookingDetail.id,
      sender_id: family.host_id,
      receiver_id: null,
      sender_type: "host",
      content,
      created_at: new Date().toISOString()
    });

    await conversationsTable.update({
        last_message: content,
        last_message_at: new Date().toISOString()
      })
      .eq("id", conversationId);

    setBookingConversationId(conversationId);
    setBookingChatText("");
    setChatSending(false);
  }

  const navItems: Array<[DashboardSection, string]> = [
    ["overview", "Dashboard"],
    ["bookings", "Bookings"],
    ["schedule", "Calendar"],
    ["financial", "Earnings"],
    ["listing", "Edit Listing Info"],
    ["profile", "Profile"],
    ["compliance", "Compliance"]
  ];

  const calendarCells = monthMatrix(calMonth, calYear);
  const selectedDayBookings = selectedDate
    ? hostBookings.filter((booking) => {
        const bookingDate = String(booking.date_from ?? booking.date_to ?? "").slice(0, 10);
        return bookingDate === selectedDate;
      })
    : [];

  const isPast = (dateStr: string) => new Date(dateStr) < new Date(todayKey());
  const isGloballyOff = (slotKey: string) => !activeQuarterList.includes(slotKey);
  const isFullDayBlocked = (dateStr: string) =>
    blockedTokens.includes(dateStr) || blockedTokens.includes(slotToken(dateStr, "fullday"));
  const isSlotBlocked = (dateStr: string, slotKey: string) =>
    isFullDayBlocked(dateStr) || blockedTokens.includes(slotToken(dateStr, slotKey)) || isGloballyOff(slotKey);
  const isDayBooked = (dateStr: string) =>
    hostBookings.some((booking) => String(booking.date_from ?? booking.date_to ?? "").slice(0, 10) === dateStr);
  const isDayBlocked = (dateStr: string) =>
    isFullDayBlocked(dateStr) || SLOT_CONFIG.every((slot) => isSlotBlocked(dateStr, slot.key));

  const toggleDateBlock = (dateStr: string) => {
    const next = blockedTokens.includes(dateStr)
      ? blockedTokens.filter((item) => item !== dateStr && !item.startsWith(`${dateStr}::`))
      : [...blockedTokens.filter((item) => !item.startsWith(`${dateStr}::`)), dateStr];
    setScheduleForm((current) => ({ ...current, blockedDates: next.join(", ") }));
  };

  const toggleSlotBlock = (dateStr: string, slotKey: string) => {
    const token = slotToken(dateStr, slotKey);
    const next = blockedTokens.includes(token)
      ? blockedTokens.filter((item) => item !== token)
      : [...blockedTokens.filter((item) => item !== dateStr), token];
    setScheduleForm((current) => ({ ...current, blockedDates: next.join(", ") }));
  };

  const toggleGlobalQuarter = (slotKey: string) => {
    const next = activeQuarterList.includes(slotKey)
      ? activeQuarterList.filter((item) => item !== slotKey)
      : [...activeQuarterList, slotKey];
    setScheduleForm((current) => ({ ...current, activeQuarters: next.join(", ") }));
  };

  const toggleListChip = (field: "includedItems" | "houseRules" | "amenities", value: string) => {
    const currentItems = parseStringList(String(listingForm[field]));
    const nextItems = currentItems.includes(value)
      ? currentItems.filter((item) => item !== value)
      : [...currentItems, value];
    setListingForm((current) => ({ ...current, [field]: nextItems.join(", ") }));
  };

  async function uploadListingPhotos(event: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const files = Array.from(event.target.files ?? []);
    if (!family?.id) {
      setPhotoUploadMessage("Save the listing first so photos can attach to the right home.");
      return;
    }

    if (files.length === 0) return;
    setUploadingPhotos(true);
    setPhotoUploadMessage(null);

    try {
      const formData = new FormData();
      formData.append("familyId", family.id);
      files.slice(0, 5).forEach((file) => formData.append("photos", file));

      const response = await fetch("/api/onboarding/home/upload-photos", {
        method: "POST",
        body: formData
      });
      const payloadResult = (await response.json()) as { error?: string; photoUrls?: string[] };

      if (!response.ok) {
        setPhotoUploadMessage(payloadResult.error ?? "Could not upload listing photos.");
        return;
      }

      const nextPhotoUrls = (payloadResult.photoUrls ?? []).slice(0, 5);
      setListingForm((current) => ({ ...current, photoUrls: nextPhotoUrls.join(", ") }));
      setPhotoUploadMessage("Photos uploaded. Save listing if you want to refresh every connected preview immediately.");
    } catch (error) {
      setPhotoUploadMessage(error instanceof Error ? error.message : "Could not upload listing photos.");
    } finally {
      setUploadingPhotos(false);
      event.target.value = "";
    }
  }

  return (
    <section className="grid gap-6 lg:grid-cols-[250px_1fr]">
      <aside className="rounded-[32px] border border-white/70 bg-white/90 p-5 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#8a6a3d]">Partner Login</p>
        <div className="mt-5 space-y-2">
          {navItems.map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setSection(value)}
              className={`flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left text-sm ${section === value ? "bg-[#1f2937] text-white" : "bg-[#f7f5f1] text-[#374151]"}`}
            >
              <span>{label}</span>
              {value === "compliance" && missingDocs > 0 ? (
                <span className="rounded-full bg-white/20 px-2 py-1 text-xs">{missingDocs}</span>
              ) : null}
            </button>
          ))}
        </div>
      </aside>

      <div className="space-y-6">
        <section className="rounded-[32px] border border-white/70 bg-white/90 p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
          {welcomeMode ? (
            <div className="mb-5 rounded-[24px] border border-[#d6eadf] bg-[#f3fbf6] p-5 text-sm text-[#305744]">
              Your login is ready. This dashboard now stays connected to the mobile host app for prices, calendar, compliance, bookings, and listing details.
            </div>
          ) : null}
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#8a6a3d]">Famlo Homes dashboard</p>
              <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-[#1f2937]">{listingForm.propertyName || family?.name || "Your Famlo home"}</h1>
              <p className="mt-2 text-sm text-[#52606d]">
                {[profileForm.cityNeighbourhood, profileForm.city, profileForm.state].filter(Boolean).join(", ")} · hosted by {profileForm.fullName || "your family"}
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => router.refresh()}
                className="rounded-full border border-[#d1d5db] bg-white px-4 py-2 text-sm font-semibold text-[#52606d]"
              >
                Refresh live data
              </button>
              {status.label ? (
                <div className={`rounded-full border px-4 py-2 text-sm font-semibold ${status.tone}`}>{status.label}</div>
              ) : null}
              <button
                type="button"
                onClick={() => void toggleListingLive()}
                className={`rounded-full px-4 py-2 text-sm font-semibold ${scheduleForm.isActive ? "bg-[#1f2937] text-white" : "border border-[#d1d5db] bg-white text-[#52606d]"}`}
              >
                {scheduleForm.isActive ? "Active" : "Inactive"}
              </button>
            </div>
          </div>
        </section>

        {section === "overview" ? (
          <>
            <section className="grid gap-5 md:grid-cols-3">
              {[
                ["This month earnings", `Rs. ${monthlyEstimate.toLocaleString("en-IN")}`],
                ["Total stays this month", `${monthlyStayCount}`],
                ["Listing status", scheduleForm.isActive ? "Active" : "Inactive"]
              ].map(([label, value]) => (
                <article key={label} className="rounded-[28px] border border-white/70 bg-white/90 p-5 shadow-[0_18px_60px_rgba(15,23,42,0.05)]">
                  <p className="text-sm text-[#52606d]">{label}</p>
                  <p className="mt-3 text-2xl font-semibold text-[#1f2937]">{value}</p>
                </article>
              ))}
            </section>

            <section className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
              <article className="rounded-[32px] border border-white/70 bg-white/90 p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#8a6a3d]">Guest preview</p>
                <h2 className="mt-3 text-2xl font-semibold text-[#1f2937]">{listingForm.listingTitle || listingForm.propertyName || "Your Famlo home"}</h2>
                <p className="mt-2 text-sm text-[#52606d]">{previewLocation || "Add your home location"}</p>
                <p className="mt-4 text-sm leading-7 text-[#52606d]">
                  {listingForm.hostBio || "Your host story, pricing, and home details show here the same way they should feel in the app."}
                </p>
                <div className="mt-5 flex flex-wrap gap-2">
                  {(previewAmenities.length > 0 ? previewAmenities : ["Max guests", "Quarter pricing", "Calendar sync"]).map((item) => (
                    <span key={item} className="rounded-full bg-[#f7f5f1] px-3 py-2 text-xs font-semibold text-[#52606d]">
                      {item}
                    </span>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setShowGuestPreview((current) => !current)}
                  className="mt-6 rounded-full border border-[#1f2937] px-5 py-3 text-sm font-semibold text-[#1f2937]"
                >
                  {showGuestPreview ? "Hide guest view" : "View your listing"}
                </button>
              </article>

              <article className="overflow-hidden rounded-[32px] border border-white/70 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
                {previewImage ? (
                  <div
                    className="h-56 w-full bg-cover bg-center"
                    style={{ backgroundImage: `url(${previewImage})` }}
                  />
                ) : (
                  <div className="flex h-56 items-center justify-center bg-[linear-gradient(135deg,#efe2d0_0%,#f8fbfd_100%)] text-sm font-semibold text-[#8a6a3d]">
                    Add a home photo to preview your guest card
                  </div>
                )}
                <div className="p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xl font-semibold text-[#1f2937]">{listingForm.propertyName || "Famlo home"}</p>
                      <p className="mt-1 text-sm text-[#52606d]">{previewLocation || "Your location appears here"}</p>
                    </div>
                    <span className={`rounded-full px-3 py-2 text-xs font-semibold ${scheduleForm.isAccepting ? "bg-[#ecfdf3] text-[#166534]" : "bg-[#f3f4f6] text-[#52606d]"}`}>
                      {scheduleForm.isAccepting ? "Accepting" : "Reservations off"}
                    </span>
                  </div>
                <div className="mt-5 grid grid-cols-2 gap-3 text-sm text-[#52606d]">
                  <div className="rounded-[20px] bg-[#f7f5f1] px-4 py-3">Up to {maxGuests} guests</div>
                  <div className="rounded-[20px] bg-[#f7f5f1] px-4 py-3">
                    {lowestGuestPrice > 0 ? `From Rs. ${lowestGuestPrice.toLocaleString("en-IN")}` : "Add prices"}
                  </div>
                </div>
                {previewIncludedItems.length > 0 ? (
                    <div className="mt-5 flex flex-wrap gap-2">
                      {previewIncludedItems.slice(0, 4).map((item) => (
                        <span key={item} className="rounded-full bg-[#fff4e8] px-3 py-2 text-xs font-semibold text-[#8a6a3d]">
                          {item}
                        </span>
                    ))}
                  </div>
                ) : null}
                {photoGallery.length > 1 ? (
                  <div className="mt-5 grid grid-cols-4 gap-2">
                    {photoGallery.slice(1).map((photoUrl) => (
                      <div
                        key={photoUrl}
                        className="h-20 rounded-[18px] bg-cover bg-center"
                        style={{ backgroundImage: `url(${photoUrl})` }}
                      />
                    ))}
                  </div>
                ) : null}
              </div>
            </article>
          </section>

            {showGuestPreview ? (
              <section className="rounded-[32px] border border-white/70 bg-white/95 p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#8a6a3d]">Live guest preview</p>
                    <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-[#1f2937]">
                      {listingForm.listingTitle || listingForm.propertyName || "Your Famlo home"}
                    </h2>
                    <p className="mt-2 text-sm text-[#52606d]">{previewLocation || "Your location appears here for guests"}</p>
                  </div>
                  <div className="rounded-[24px] border border-[#e5e7eb] bg-[#faf7f2] px-5 py-4 text-sm text-[#52606d]">
                    <p>Guest pays</p>
                    <p className="mt-1 text-2xl font-semibold text-[#1f2937]">
                      {featuredPrice > 0 ? `Rs. ${featuredPrice.toLocaleString("en-IN")}` : "Add a quarter price"}
                    </p>
                    <p className="mt-2 text-xs text-[#8a6a3d]">
                      Host gets about Rs. {Math.round(featuredHostPayout).toLocaleString("en-IN")} after {serviceFee}% service fee, 2% gateway fee, and GST on fees.
                    </p>
                  </div>
                </div>

                <div className="mt-6 overflow-hidden rounded-[30px] border border-[#efe7dc] bg-[#fcfaf6]">
                  {previewImage ? (
                    <div className="h-72 w-full bg-cover bg-center" style={{ backgroundImage: `url(${previewImage})` }} />
                  ) : (
                    <div className="flex h-72 items-center justify-center bg-[linear-gradient(135deg,#efe2d0_0%,#f8fbfd_100%)] text-sm font-semibold text-[#8a6a3d]">
                      Add at least one listing photo to see the guest hero card
                    </div>
                  )}
                  <div className="grid gap-6 p-6 lg:grid-cols-[1.15fr_0.85fr]">
                    <div>
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-2xl font-semibold text-[#1f2937]">{listingForm.propertyName || "Famlo home"}</p>
                          <p className="mt-2 text-sm text-[#52606d]">{previewLocation || "Home location"}</p>
                        </div>
                        <span className={`rounded-full px-3 py-2 text-xs font-semibold ${scheduleForm.isAccepting ? "bg-[#ecfdf3] text-[#166534]" : "bg-[#f3f4f6] text-[#52606d]"}`}>
                          {scheduleForm.isAccepting ? "Accepting reservations" : "Reservations off"}
                        </span>
                      </div>
                      <p className="mt-5 text-sm leading-7 text-[#52606d]">
                        {listingForm.hostBio || "Your host story and listing description will show here exactly as guests read it."}
                      </p>
                      {previewIncludedItems.length > 0 ? (
                        <div className="mt-6">
                          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#8a6a3d]">What&apos;s included</p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {previewIncludedItems.map((item) => (
                              <span key={item} className="rounded-full bg-white px-3 py-2 text-xs font-semibold text-[#52606d]">
                                {item}
                              </span>
                            ))}
                          </div>
                        </div>
                      ) : null}
                      {previewHouseRules.length > 0 ? (
                        <div className="mt-6">
                          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#8a6a3d]">Things to know</p>
                          <div className="mt-3 space-y-2 text-sm text-[#52606d]">
                            {previewHouseRules.map((rule) => (
                              <p key={rule}>• {rule}</p>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>

                    <div className="space-y-4">
                      <div className="rounded-[24px] border border-[#e5e7eb] bg-white p-5">
                        <p className="text-sm font-semibold text-[#1f2937]">Quarter pricing</p>
                        <div className="mt-4 space-y-3">
                          {quarterPrices.map((slot) => {
                            const payout = calculateHostPayout(slot.price, serviceFee);
                            return (
                              <div key={slot.key} className="rounded-[20px] bg-[#faf7f2] px-4 py-4">
                                <div className="flex items-center justify-between gap-3">
                                  <div>
                                    <p className="font-semibold text-[#1f2937]">{slot.label}</p>
                                    <p className="text-xs text-[#8a6a3d]">
                                      Host gets about Rs. {Math.round(payout).toLocaleString("en-IN")}
                                    </p>
                                  </div>
                                  <p className="text-lg font-semibold text-[#1f2937]">
                                    {slot.price > 0 ? `Rs. ${slot.price.toLocaleString("en-IN")}` : "Not set"}
                                  </p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      <div className="rounded-[24px] border border-[#e5e7eb] bg-white p-5">
                        <p className="text-sm font-semibold text-[#1f2937]">Stay snapshot</p>
                        <div className="mt-4 grid grid-cols-2 gap-3 text-sm text-[#52606d]">
                          <div className="rounded-[18px] bg-[#faf7f2] px-4 py-3">Up to {maxGuests} guests</div>
                          <div className="rounded-[18px] bg-[#faf7f2] px-4 py-3">{activeQuarterList.length} active slots</div>
                        </div>
                        {photoGallery.length > 1 ? (
                          <div className="mt-4 grid grid-cols-4 gap-2">
                            {photoGallery.slice(1).map((photoUrl) => (
                              <div
                                key={photoUrl}
                                className="h-16 rounded-[16px] bg-cover bg-center"
                                style={{ backgroundImage: `url(${photoUrl})` }}
                              />
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            ) : null}

            <section className="rounded-[32px] border border-white/70 bg-white/90 p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-semibold text-[#1f2937]">Reservation controls</h2>
                  <p className="mt-2 text-sm text-[#52606d]">Changes here flow into the app dashboard and guest explore visibility. Turning off a time slot blocks that quarter across every day.</p>
                </div>
                <button type="button" onClick={() => void saveDashboard("schedule")} className="rounded-full bg-[#1f2937] px-5 py-3 text-sm font-semibold text-white">
                  {savingSection === "schedule" ? "Saving..." : "Save controls"}
                </button>
              </div>
              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <label className="grid gap-2 rounded-[24px] border border-[#e5e7eb] bg-[#faf7f2] px-5 py-4 text-sm text-[#52606d]">
                  Maximum guests at once
                  <input
                    value={scheduleForm.maxGuests}
                    onChange={(event) => setScheduleForm((current) => ({ ...current, maxGuests: event.target.value.replace(/[^0-9]/g, "") }))}
                    className="rounded-2xl border border-[#e5e7eb] bg-white px-4 py-3 text-[#1f2937] outline-none"
                  />
                </label>
              </div>
            </section>
          </>
        ) : null}

        {section === "listing" ? (
          <section className="rounded-[32px] border border-white/70 bg-white/90 p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-semibold text-[#1f2937]">Edit listing info</h2>
                <p className="mt-2 text-sm text-[#52606d]">This is connected to the mobile app edit listing screen and the guest card people see.</p>
              </div>
              <button type="button" onClick={() => void saveDashboard("listing")} className="rounded-full bg-[#1f2937] px-5 py-3 text-sm font-semibold text-white">
                {savingSection === "listing" ? "Saving..." : "Save listing"}
              </button>
            </div>
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {[
                ["Family / home name", "propertyName"],
                ["Listing title", "listingTitle"],
                ["Property address", "propertyAddress"],
                ["Bathroom type", "bathroomType"],
                ["Google Maps pin link", "googleMapsLink"]
              ].map(([label, key]) => (
                <label key={key} className="grid gap-2 text-sm text-[#52606d]">
                  {label}
                  <input
                    value={String(listingForm[key as keyof typeof listingForm])}
                    onChange={(event) => setListingForm((current) => ({ ...current, [key]: event.target.value }))}
                    className="rounded-2xl border border-[#e5e7eb] px-4 py-3 text-[#1f2937] outline-none"
                  />
                </label>
              ))}
              {[
                ["Morning price", "priceMorning"],
                ["Afternoon price", "priceAfternoon"],
                ["Evening price", "priceEvening"],
                ["Full day price", "priceFullday"]
              ].map(([label, key]) => (
                <label key={key} className="grid gap-2 text-sm text-[#52606d]">
                  {label}
                  <input
                    value={String(listingForm[key as keyof typeof listingForm])}
                    onChange={(event) => setListingForm((current) => ({ ...current, [key]: event.target.value.replace(/[^0-9]/g, "") }))}
                    className="rounded-2xl border border-[#e5e7eb] px-4 py-3 text-[#1f2937] outline-none"
                  />
                </label>
              ))}
            </div>
            <div className="mt-5 rounded-[24px] border border-[#e5e7eb] bg-[#faf7f2] p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-sm font-semibold text-[#1f2937]">Listing photos</p>
                  <p className="mt-1 text-sm text-[#52606d]">Upload up to 5 photos. These are shared with the mobile app listing too.</p>
                </div>
                <label className="inline-flex cursor-pointer items-center justify-center rounded-full bg-[#1f2937] px-4 py-3 text-sm font-semibold text-white">
                  {uploadingPhotos ? "Uploading..." : "Upload photos"}
                  <input type="file" accept="image/*" multiple className="hidden" onChange={(event) => void uploadListingPhotos(event)} />
                </label>
              </div>
              {photoUploadMessage ? <p className="mt-3 text-sm text-[#52606d]">{photoUploadMessage}</p> : null}
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                {photoGallery.map((photoUrl) => (
                  <div key={photoUrl} className="h-32 rounded-[22px] bg-cover bg-center" style={{ backgroundImage: `url(${photoUrl})` }} />
                ))}
                {photoGallery.length === 0 ? (
                  <div className="flex h-32 items-center justify-center rounded-[22px] border border-dashed border-[#d1d5db] bg-white text-sm text-[#52606d]">
                    No listing photos yet
                  </div>
                ) : null}
              </div>
            </div>
            <textarea
              value={listingForm.hostBio}
              onChange={(event) => setListingForm((current) => ({ ...current, hostBio: event.target.value }))}
              placeholder="About your family"
              className="mt-4 min-h-[120px] w-full rounded-3xl border border-[#e5e7eb] px-4 py-3 text-sm outline-none"
            />
            <textarea
              value={listingForm.culturalOffering}
              onChange={(event) => setListingForm((current) => ({ ...current, culturalOffering: event.target.value }))}
              placeholder="What cultural experience will you share?"
              className="mt-4 min-h-[110px] w-full rounded-3xl border border-[#e5e7eb] px-4 py-3 text-sm outline-none"
            />
            <textarea
              value={listingForm.amenities}
              onChange={(event) => setListingForm((current) => ({ ...current, amenities: event.target.value }))}
              placeholder="Amenities, comma separated"
              className="mt-4 min-h-[110px] w-full rounded-3xl border border-[#e5e7eb] px-4 py-3 text-sm outline-none"
            />
            <div className="mt-5 rounded-[24px] border border-[#e5e7eb] bg-[#faf7f2] p-5">
              <p className="text-sm font-semibold text-[#1f2937]">What&apos;s included</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {INCLUDED_OPTIONS.map((item) => {
                  const active = previewIncludedItems.includes(item);
                  return (
                    <button
                      key={item}
                      type="button"
                      onClick={() => toggleListChip("includedItems", item)}
                      className={`rounded-full px-4 py-2 text-xs font-semibold ${active ? "bg-[#1f2937] text-white" : "bg-white text-[#52606d]"}`}
                    >
                      {item}
                    </button>
                  );
                })}
              </div>
              <textarea
                value={listingForm.includedItems}
                onChange={(event) => setListingForm((current) => ({ ...current, includedItems: event.target.value }))}
                placeholder="Included items, comma separated"
                className="mt-4 min-h-[100px] w-full rounded-3xl border border-[#e5e7eb] px-4 py-3 text-sm outline-none"
              />
            </div>
            <div className="mt-5 rounded-[24px] border border-[#e5e7eb] bg-[#faf7f2] p-5">
              <p className="text-sm font-semibold text-[#1f2937]">Things to know and house rules</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {HOUSE_RULE_OPTIONS.map((item) => {
                  const active = previewHouseRules.includes(item);
                  return (
                    <button
                      key={item}
                      type="button"
                      onClick={() => toggleListChip("houseRules", item)}
                      className={`rounded-full px-4 py-2 text-xs font-semibold ${active ? "bg-[#1f2937] text-white" : "bg-white text-[#52606d]"}`}
                    >
                      {item}
                    </button>
                  );
                })}
              </div>
              <textarea
                value={listingForm.houseRules}
                onChange={(event) => setListingForm((current) => ({ ...current, houseRules: event.target.value }))}
                placeholder="House rules, comma separated"
                className="mt-4 min-h-[100px] w-full rounded-3xl border border-[#e5e7eb] px-4 py-3 text-sm outline-none"
              />
            </div>
          </section>
        ) : null}

        {section === "schedule" ? (
          <section className="rounded-[32px] border border-white/70 bg-white/90 p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-semibold text-[#1f2937]">Calendar</h2>
                  <p className="mt-2 text-sm text-[#52606d]">Quarter controls here match the mobile app calendar and booking logic. Global slot changes also affect every date.</p>
                </div>
              <button type="button" onClick={() => void saveDashboard("schedule")} className="rounded-full bg-[#1f2937] px-5 py-3 text-sm font-semibold text-white">
                {savingSection === "schedule" ? "Saving..." : "Save calendar"}
              </button>
            </div>

            <div className="mt-6 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="rounded-[28px] border border-[#e5e7eb] bg-[#f8fbfd] p-5">
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    className="rounded-full border border-[#e5e7eb] px-3 py-2 text-sm"
                    onClick={() => {
                      if (calMonth === 0) {
                        setCalMonth(11);
                        setCalYear((current) => current - 1);
                      } else {
                        setCalMonth((current) => current - 1);
                      }
                    }}
                  >
                    Prev
                  </button>
                  <p className="text-lg font-semibold text-[#1f2937]">
                    {new Date(calYear, calMonth, 1).toLocaleString("en-IN", { month: "long", year: "numeric" })}
                  </p>
                  <button
                    type="button"
                    className="rounded-full border border-[#e5e7eb] px-3 py-2 text-sm"
                    onClick={() => {
                      if (calMonth === 11) {
                        setCalMonth(0);
                        setCalYear((current) => current + 1);
                      } else {
                        setCalMonth((current) => current + 1);
                      }
                    }}
                  >
                    Next
                  </button>
                </div>

                <div className="mt-5 grid grid-cols-7 gap-2 text-center text-xs text-[#7b8591]">
                  {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((day) => (
                    <div key={day} className="py-2 font-semibold">{day}</div>
                  ))}
                  {calendarCells.map((day, index) => {
                    if (!day) return <div key={`empty-${index}`} className="h-12 rounded-2xl bg-transparent" />;
                    const dateStr = dayToDateKey(day, calMonth, calYear);
                    const active = selectedDate === dateStr;
                    const booked = isDayBooked(dateStr);
                    const blocked = isDayBlocked(dateStr);
                    const past = isPast(dateStr);
                    return (
                      <button
                        key={dateStr}
                        type="button"
                        onClick={() => setSelectedDate(dateStr)}
                        className={`h-12 rounded-2xl text-sm font-semibold ${active ? "border-2 border-[#1f2937] bg-white text-[#1f2937]" : booked ? "bg-[#fde7ea] text-[#9f1239]" : blocked ? "bg-[#eef0f3] text-[#6b7280]" : past ? "bg-[#f3f4f6] text-[#9ca3af]" : "bg-white text-[#1f2937]"}`}
                      >
                        {day}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-5">
                <div className="rounded-[28px] border border-[#e5e7eb] bg-white p-5">
                  <p className="text-sm font-semibold text-[#1f2937]">Selected date</p>
                  <p className="mt-2 text-lg font-semibold text-[#1f2937]">{selectedDate || "Pick a day"}</p>
                  <div className="mt-4 space-y-3">
                    {SLOT_CONFIG.map((slot) => {
                      const blocked = selectedDate ? isSlotBlocked(selectedDate, slot.key) : false;
                      const globallyOff = isGloballyOff(slot.key);
                      const stateLabel = globallyOff ? "Globally off" : blocked ? "Blocked" : "Available";
                      return (
                        <button
                          key={slot.key}
                          type="button"
                          disabled={!selectedDate}
                          onClick={() => selectedDate && toggleSlotBlock(selectedDate, slot.key)}
                          className={`flex w-full items-center justify-between rounded-[20px] border px-4 py-4 text-left ${blocked ? "border-[#f3c3cb] bg-[#fff5f7]" : "border-[#d7eadf] bg-[#f4fbf6]"}`}
                        >
                          <div>
                            <p className="font-semibold text-[#1f2937]">{slot.label}</p>
                            <p className="text-sm text-[#52606d]">{slot.time}</p>
                          </div>
                          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${blocked ? "bg-[#9f1239] text-white" : "bg-[#166534] text-white"}`}>{stateLabel}</span>
                        </button>
                      );
                    })}
                  </div>
                  <div className="mt-4 flex gap-3">
                    <button type="button" onClick={() => selectedDate && toggleDateBlock(selectedDate)} className="rounded-full border border-[#1f2937] px-4 py-2 text-sm font-semibold text-[#1f2937]">
                      {selectedDate && isFullDayBlocked(selectedDate) ? "Unblock full day" : "Block full day"}
                    </button>
                  </div>
                </div>

                <div className="rounded-[28px] border border-[#e5e7eb] bg-white p-5">
                  <p className="text-sm font-semibold text-[#1f2937]">Maximum guests at once</p>
                  <input
                    value={scheduleForm.maxGuests}
                    onChange={(event) => setScheduleForm((current) => ({ ...current, maxGuests: event.target.value.replace(/[^0-9]/g, "") }))}
                    className="mt-4 w-full rounded-2xl border border-[#e5e7eb] px-4 py-3 text-[#1f2937] outline-none"
                  />
                </div>

                <div className="rounded-[28px] border border-[#e5e7eb] bg-white p-5">
                  <p className="text-sm font-semibold text-[#1f2937]">Available time slots</p>
                  <div className="mt-4 space-y-3">
                    {SLOT_CONFIG.map((slot) => {
                      const active = activeQuarterList.includes(slot.key);
                      return (
                        <label key={slot.key} className="flex items-center justify-between rounded-[20px] border border-[#e5e7eb] px-4 py-4 text-sm text-[#1f2937]">
                          <span>{slot.label}</span>
                          <input type="checkbox" checked={active} onChange={() => toggleGlobalQuarter(slot.key)} />
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div className="rounded-[28px] border border-[#e5e7eb] bg-[#faf7f2] p-5">
                  <p className="text-sm font-semibold text-[#1f2937]">Bookings on selected day</p>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    <span className="rounded-full bg-[#fde7ea] px-3 py-1 font-semibold text-[#9f1239]">Booked</span>
                    <span className="rounded-full bg-[#eef0f3] px-3 py-1 font-semibold text-[#6b7280]">Blocked</span>
                    <span className="rounded-full bg-[#f4fbf6] px-3 py-1 font-semibold text-[#166534]">Available</span>
                  </div>
                  <div className="mt-4 space-y-3 text-sm text-[#52606d]">
                    {selectedDayBookings.length === 0 ? (
                      <p>No guest booking on this day yet.</p>
                    ) : (
                      selectedDayBookings.map((booking) => (
                        <button key={booking.id} type="button" onClick={() => setSelectedBooking(booking.id)} className="block w-full rounded-[18px] border border-[#e5e7eb] bg-white px-4 py-3 text-left">
                          {(booking.user_name || "Guest booking")} · {(booking.quarter_type || "Stay")} · {(booking.guests_count || 1)} guest{(booking.guests_count || 1) > 1 ? "s" : ""}
                        </button>
                      ))
                    )}
                  </div>
                  {selectedBookingDetail ? (
                    <div className="mt-4 rounded-[18px] border border-[#e5e7eb] bg-white px-4 py-4 text-sm text-[#52606d]">
                      <p className="font-semibold text-[#1f2937]">{selectedBookingDetail.user_name || "Guest"}</p>
                      <p className="mt-1">{selectedBookingDetail.quarter_type || "Stay"} · {selectedBookingDetail.guests_count || 1} guest</p>
                      {selectedBookingDetail.user_city ? <p className="mt-1 text-xs text-[#8a6a3d]">{selectedBookingDetail.user_city}</p> : null}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </section>
        ) : null}

        {section === "financial" ? (
          <section className="rounded-[32px] border border-white/70 bg-white/90 p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
            <h2 className="text-2xl font-semibold text-[#1f2937]">Earnings</h2>
            <div className="mt-6 grid gap-5 md:grid-cols-2">
              <div className="rounded-[28px] border border-[#e5e7eb] bg-[#f8fbfd] p-5">
                <p className="text-sm text-[#52606d]">This month earning</p>
                <p className="mt-2 text-3xl font-semibold text-[#1f2937]">Rs. {monthlyEstimate.toLocaleString("en-IN")}</p>
                <p className="mt-4 text-sm text-[#52606d]">Total stays this month: {monthlyStayCount}</p>
              </div>
              <div className="rounded-[28px] border border-[#e5e7eb] bg-[#fffaf2] p-5">
                <p className="text-sm font-semibold text-[#1f2937]">Service fee progress</p>
                <div className="mt-4 h-3 rounded-full bg-[#ece7de]">
                  <div className="h-full rounded-full bg-[#1f2937]" style={{ width: `${Math.min(totalStays, 100)}%` }} />
                </div>
                <div className="mt-4 grid grid-cols-3 gap-3 text-center text-sm">
                  {["18%", "15%", "12%"].map((value) => (
                    <div key={value} className={`rounded-2xl border px-3 py-4 ${serviceFee === Number(value.replace("%", "")) ? "border-[#1f2937] bg-white text-[#1f2937]" : "border-[#e5e7eb] bg-[#fffdf9] text-[#52606d]"}`}>
                      <p className="text-lg font-semibold">{value}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-6 rounded-[28px] border border-[#e5e7eb] bg-white p-5">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-[#1f2937]">Transactions</h3>
                <div className="flex gap-2">
                  {(["week", "month"] as const).map((period) => (
                    <button key={period} type="button" onClick={() => setTransactionPeriod(period)} className={`rounded-full px-4 py-2 text-sm font-semibold ${transactionPeriod === period ? "bg-[#1f2937] text-white" : "bg-[#f3f4f6] text-[#52606d]"}`}>
                      {period === "week" ? "Week" : "Month"}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mt-4 space-y-3">
                {filteredTransactions.length === 0 ? (
                  <div className="rounded-[18px] border border-dashed border-[#d1d5db] bg-[#faf7f2] px-4 py-6 text-sm text-[#52606d]">
                    No {transactionPeriod} transactions yet.
                  </div>
                ) : filteredTransactions.map((item) => (
                  <div key={item.id} className="flex items-center justify-between rounded-[18px] border border-[#e5e7eb] bg-[#faf7f2] px-4 py-4 text-sm">
                    <div>
                      <p className="font-semibold text-[#1f2937]">{item.label}</p>
                      <p className="text-[#52606d]">{item.slot}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-[#1f2937]">Rs. {item.amount.toLocaleString("en-IN")}</p>
                      <p className="text-[#52606d]">{item.status}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        {section === "bookings" ? (
          <section className="rounded-[32px] border border-white/70 bg-white/90 p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
            <h2 className="text-2xl font-semibold text-[#1f2937]">Bookings</h2>
            <div className="mt-6 space-y-4">
              {liveBookingSummary.length === 0 ? (
                <div className="rounded-[24px] border border-dashed border-[#d1d5db] bg-[#faf7f2] p-5 text-sm text-[#52606d]">
                  No home bookings yet. New guest reservations will appear here automatically.
                </div>
              ) : (
                liveBookingSummary.map((booking) => (
                  <div key={booking.id} className="flex flex-col gap-3 rounded-[24px] border border-[#e5e7eb] bg-[#faf7f2] p-5 text-sm text-[#52606d] lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <p className="font-semibold text-[#1f2937]">{booking.user_name || "Guest booking"}</p>
                      <p className="mt-1">
                        {booking.date_from || "Upcoming"} · {booking.quarter_type || "Stay"} · {booking.guests_count || 1} guest
                        {(booking.guests_count || 1) > 1 ? "s" : ""}
                      </p>
                      {booking.user_city ? <p className="mt-1 text-xs text-[#8a6a3d]">{booking.user_city}</p> : null}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full px-3 py-2 text-xs font-semibold ${booking.status === "confirmed" || booking.status === "completed" ? "bg-[#ecfdf3] text-[#166534]" : "bg-[#fff7e6] text-[#92400e]"}`}>
                        {booking.status || "pending"}
                      </span>
                      <button
                        type="button"
                        onClick={() => setSelectedBooking(booking.id)}
                        className="rounded-full border border-[#d1d5db] px-4 py-2 font-semibold text-[#52606d]"
                      >
                        Guest profile
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
            {selectedBookingDetail ? (
              <div className="mt-6 grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
                <div className="rounded-[24px] border border-[#e5e7eb] bg-[#fffdf9] p-5 text-sm text-[#52606d]">
                  <p className="text-lg font-semibold text-[#1f2937]">Guest profile</p>
                  <p className="mt-4 font-semibold text-[#1f2937]">{selectedBookingDetail.user_name || "Guest"}</p>
                  <p className="mt-1">{selectedBookingDetail.user_city || "City not added"}</p>
                  <p className="mt-3">{selectedBookingDetail.date_from || "Upcoming"} · {selectedBookingDetail.quarter_type || "Stay"}</p>
                  <p className="mt-1">{selectedBookingDetail.guests_count || 1} guest{(selectedBookingDetail.guests_count || 1) > 1 ? "s" : ""}</p>
                  <p className="mt-1">Payout: Rs. {Math.round(Number(selectedBookingDetail.family_payout ?? 0)).toLocaleString("en-IN")}</p>
                </div>

                <div className="rounded-[24px] border border-[#e5e7eb] bg-white p-5">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-lg font-semibold text-[#1f2937]">Chat with guest</p>
                    <span className="rounded-full bg-[#f7f5f1] px-3 py-1 text-xs font-semibold text-[#52606d]">
                      Shared with app
                    </span>
                  </div>
                  <div className="mt-4 max-h-[280px] space-y-3 overflow-y-auto rounded-[20px] bg-[#faf7f2] p-4">
                    {chatLoading ? (
                      <p className="text-sm text-[#52606d]">Loading chat…</p>
                    ) : bookingMessages.length === 0 ? (
                      <p className="text-sm text-[#52606d]">No messages yet. Start the conversation.</p>
                    ) : (
                      bookingMessages.map((message) => {
                        const mine = String(message.sender_type) === "host" && String(message.sender_id ?? "") === String(family?.host_id ?? "");
                        return (
                          <div key={message.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                            <div className={`max-w-[80%] rounded-[18px] px-4 py-3 text-sm ${mine ? "bg-[#1f2937] text-white" : "bg-white text-[#1f2937]"}`}>
                              <p>{message.content || ""}</p>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                  <div className="mt-4 flex gap-3">
                    <input
                      value={bookingChatText}
                      onChange={(event) => setBookingChatText(event.target.value)}
                      placeholder="Message the guest"
                      className="flex-1 rounded-2xl border border-[#e5e7eb] px-4 py-3 text-sm text-[#1f2937] outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => void sendBookingMessage()}
                      disabled={chatSending || bookingChatText.trim().length === 0}
                      className="rounded-full bg-[#1f2937] px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
                    >
                      {chatSending ? "Sending..." : "Send"}
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </section>
        ) : null}

        {section === "profile" ? (
          <section className="rounded-[32px] border border-white/70 bg-white/90 p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-semibold text-[#1f2937]">Profile</h2>
                <p className="mt-2 text-sm text-[#52606d]">These details are shared with the mobile app profile editor.</p>
              </div>
              <button type="button" onClick={() => void saveDashboard("profile")} className="rounded-full bg-[#1f2937] px-5 py-3 text-sm font-semibold text-white">
                {savingSection === "profile" ? "Saving..." : "Save profile"}
              </button>
            </div>
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {[
                ["Host name", "fullName"],
                ["Mobile number", "mobileNumber"],
                ["Email", "email"],
                ["City", "city"],
                ["Neighbourhood or village", "cityNeighbourhood"],
                ["State", "state"],
                ["Languages", "languages"],
                ["Host hobbies", "hostHobbies"]
              ].map(([label, key]) => (
                <label key={key} className="grid gap-2 text-sm text-[#52606d]">
                  {label}
                  <input
                    value={String(profileForm[key as keyof typeof profileForm])}
                    onChange={(event) => setProfileForm((current) => ({ ...current, [key]: event.target.value }))}
                    className="rounded-2xl border border-[#e5e7eb] px-4 py-3 text-[#1f2937] outline-none"
                  />
                </label>
              ))}
            </div>
            <textarea
              value={profileForm.familyComposition}
              onChange={(event) => setProfileForm((current) => ({ ...current, familyComposition: event.target.value }))}
              placeholder="Family composition"
              className="mt-4 min-h-[120px] w-full rounded-3xl border border-[#e5e7eb] px-4 py-3 text-sm outline-none"
            />
            <div className="mt-5 rounded-[24px] border border-[#e5e7eb] bg-[#faf7f2] p-5">
              <p className="text-sm font-semibold text-[#1f2937]">How guests see your listing</p>
              <p className="mt-2 text-sm text-[#52606d]">
                {listingForm.listingTitle || listingForm.propertyName || "Your listing title"} · {previewLocation || "Your home location"}
              </p>
              <p className="mt-3 text-sm leading-7 text-[#52606d]">
                {listingForm.hostBio || "Your host bio and listing story will appear here after you save profile and listing updates."}
              </p>
              {previewIncludedItems.length > 0 ? (
                <div className="mt-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#8a6a3d]">What&apos;s included</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {previewIncludedItems.slice(0, 4).map((item) => (
                      <span key={item} className="rounded-full bg-white px-3 py-2 text-xs font-semibold text-[#52606d]">
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
              {previewHouseRules.length > 0 ? (
                <div className="mt-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#8a6a3d]">House rules</p>
                  <ul className="mt-3 space-y-2 text-sm text-[#52606d]">
                    {previewHouseRules.slice(0, 4).map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </section>
        ) : null}

        {section === "compliance" ? (
          <section className="rounded-[32px] border border-white/70 bg-white/90 p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
            <div className="grid gap-4 lg:grid-cols-3">
              <label className="rounded-[24px] border border-[#e5e7eb] bg-[#faf7f2] p-5 text-sm text-[#52606d]">
                <span className="font-semibold text-[#1f2937]">Police clearance</span>
                <input
                  type="file"
                  className="mt-4 block w-full"
                  onChange={(event) => setCompliance((current) => ({ ...current, pccFileName: event.target.files?.[0]?.name ?? current.pccFileName }))}
                />
                <p className="mt-3">{compliance.pccFileName || "Upload police clearance"}</p>
              </label>
              <label className="rounded-[24px] border border-[#e5e7eb] bg-[#faf7f2] p-5 text-sm text-[#52606d]">
                <span className="font-semibold text-[#1f2937]">Property proof</span>
                <input
                  type="file"
                  className="mt-4 block w-full"
                  onChange={(event) => setCompliance((current) => ({ ...current, propertyProofFileName: event.target.files?.[0]?.name ?? current.propertyProofFileName }))}
                />
                <p className="mt-3">{compliance.propertyProofFileName || "Upload electricity bill or title deed"}</p>
              </label>
              <label className="rounded-[24px] border border-[#e5e7eb] bg-[#faf7f2] p-5 text-sm text-[#52606d]">
                <span className="font-semibold text-[#1f2937]">Form C and FRRO</span>
                <div className="mt-4 flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={compliance.formCAcknowledged}
                    onChange={(event) => setCompliance((current) => ({ ...current, formCAcknowledged: event.target.checked }))}
                  />
                  <span>I understand the Form C and FRRO responsibility for foreign guests.</span>
                </div>
              </label>
            </div>
            <textarea
              value={compliance.adminNotes}
              onChange={(event) => setCompliance((current) => ({ ...current, adminNotes: event.target.value }))}
              placeholder="Write any compliance note for the Famlo team"
              className="mt-5 min-h-[120px] w-full rounded-3xl border border-[#e5e7eb] px-4 py-3 text-sm outline-none"
            />
            <div className="mt-5 flex gap-3">
              <button type="button" onClick={() => void saveCompliance()} className="rounded-full bg-[#1f2937] px-5 py-3 text-sm font-semibold text-white">
                Save compliance
              </button>
            </div>
          </section>
        ) : null}

        {saveMessage ? <p className="text-sm text-[#52606d]">{saveMessage}</p> : null}
      </div>
    </section>
  );
}
