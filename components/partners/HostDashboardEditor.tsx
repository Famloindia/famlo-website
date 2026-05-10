"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import { parseHostListingMeta } from "@/lib/host-listing-meta";
import styles from "./dashboard.module.css";
import {
  Home, BookmarkCheck, Calendar as CalendarIcon, IndianRupee,
  UserCircle2, MessagesSquare, CheckCircle2, AlertCircle,
  BedDouble,
  MessageCircle, ShieldCheck, Sparkles
} from "lucide-react";
import DashboardTab from "./tabs/DashboardTab";

const BookingsTab = dynamic(() => import("./tabs/BookingsTab"));
const CalendarTab = dynamic(() => import("./tabs/CalendarTab"));
const EarningsTab = dynamic(() => import("./tabs/EarningsTab"));
const ProfileTab = dynamic(() => import("./tabs/ProfileTab"));
const MessagesTab = dynamic(() => import("./tabs/MessagesTab"));
const DocumentsTab = dynamic(() => import("./tabs/DocumentsTab"));
const SupportTab = dynamic(() => import("./tabs/SupportTab"));
const FamloPlusTab = dynamic(() => import("./tabs/FamloPlusTab"));

type HostProAccessSnapshot = {
  allowed: boolean;
  status: string;
  current_period_end: string | null;
  grace_until: string | null;
  reason: string;
};

interface HostDashboardEditorProps {
  family: Record<string, unknown>;
  allFamilies: Array<Record<string, unknown>>;
  familyPhotos: Array<Record<string, unknown>>;
  bookingRows: Array<Record<string, unknown>>;
  initialTab?: string;
  hostTaxDetails?: {
    pan_last_four?: string | null;
    pan_holder_name?: string | null;
    pan_image_url?: string | null;
    pan_date_of_birth?: string | null;
    verification_status?: string | null;
    verification_provider?: string | null;
    is_verified?: boolean | null;
    risk_flag?: boolean | null;
    consent_given?: boolean | null;
    verified_at?: string | null;
    updated_at?: string | null;
  } | null;
  hostUserId?: string;
  globalCommission: number;
  diagnostics?: {
    familyIds: string[];
    hostCode?: string;
    rawBookingCount: number;
    familyCount: number;
    photoCount: number;
  };
  famloPlusEnabled?: boolean;
  proDashboardEnabled?: boolean;
  proAccessByFamilyId?: Record<string, HostProAccessSnapshot>;
}

export interface PhotoItem {
  id: string;
  url: string;
  isPrimary: boolean;
  family_id?: string;
}

type BookingSummary = {
  totalStays: number;
  totalEarnings: number;
};

const ALLOWED_DASHBOARD_TABS = new Set([
  "dashboard",
  "rooms",
  "bookings",
  "messages",
  "calendar",
  "earnings",
  "profile",
  "compliance",
  "famlo-plus",
  "support",
]);

function normalizeDashboardTab(value: unknown): string {
  const normalized = String(value || "dashboard").trim().toLowerCase();
  return ALLOWED_DASHBOARD_TABS.has(normalized) ? normalized : "dashboard";
}

function normalizeFamilyId(value: unknown): string {
  return typeof value === "string" ? value.trim() : String(value ?? "").trim();
}

function getActiveRealtimeHostId(family: Record<string, unknown>): string | null {
  return typeof family.v2_host_id === "string" ? family.v2_host_id : null;
}

function joinList(values: unknown): string {
  if (Array.isArray(values)) return values.join(", ");
  if (typeof values === "string") return values;
  return "";
}

function pickObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function firstString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed.length > 0) return trimmed;
  }
  return "";
}

function firstListString(...values: unknown[]): string {
  for (const value of values) {
    if (Array.isArray(value) && value.length > 0) {
      return value
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean)
        .join(", ");
    }
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }
  return "";
}

function getPrimaryRoomDraft(payload: Record<string, unknown>): Record<string, unknown> {
  const rooms = Array.isArray(payload.rooms)
    ? payload.rooms.filter((room): room is Record<string, unknown> => Boolean(room && typeof room === "object" && !Array.isArray(room)))
    : [];

  return (
    rooms.find((room) => room.isPrimary === true) ??
    rooms[0] ??
    {}
  );
}

function parsePrice(value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? String(numeric) : "";
}

function parseCoordinate(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : undefined;
  }
  return undefined;
}

function buildProfileFromFamily(
  family: Record<string, unknown>,
  meta: ReturnType<typeof parseHostListingMeta>
) {
  const onboardingPayload = pickObject(family.latest_onboarding_payload);

  return {
    hostDisplayName: firstString(
      meta.hostDisplayName,
      onboardingPayload.hostName,
      family.primary_host_name,
      family.host_name
    ),
    hostHobbies: firstListString(meta.hostHobbies, onboardingPayload.hostHobbies, onboardingPayload.hobbies),
    familyComposition: String(meta.familyComposition ?? ""),
    city: firstString(onboardingPayload.city, family.city),
    state: firstString(onboardingPayload.state, family.state),
    cityNeighbourhood: firstString(onboardingPayload.cityNeighbourhood, family.village),
    hostCatchphrase: firstString(meta.hostCatchphrase, onboardingPayload.hostCatchphrase),
    hostSelfieUrl: firstString(family.host_photo_url, meta.hostSelfieUrl),
    mobileNumber: String(family.host_phone ?? ""),
    languages: joinList(family.languages_spoken ?? family.languages ?? []),
  };
}

function buildListingFromFamily(
  family: Record<string, unknown>,
  meta: ReturnType<typeof parseHostListingMeta>
) {
  const onboardingPayload = pickObject(family.latest_onboarding_payload);
  const primaryRoomDraft = getPrimaryRoomDraft(onboardingPayload);

  return {
    propertyName: firstString(onboardingPayload.propertyName, family.name),
    hostBio: firstString(onboardingPayload.hostBio, family.about, family.description),
    listingTitle: firstString(meta.listingTitle, onboardingPayload.listingTitle),
    culturalOffering: firstString(onboardingPayload.culturalActivity, family.famlo_experience, meta.culturalOffering),
    journeyStory: firstString(meta.journeyStory, onboardingPayload.journeyStory),
    specialExperience: firstString(meta.specialExperience, onboardingPayload.specialExperience),
    localExperience: firstString(meta.localExperience, onboardingPayload.localExperience),
    interactionType: firstString(meta.interactionType, onboardingPayload.interactionType),
    houseType: firstString(meta.houseType, onboardingPayload.houseType, meta.familyComposition),
    checkInTime: firstString(meta.checkInTime, onboardingPayload.checkInTime),
    checkOutTime: firstString(meta.checkOutTime, onboardingPayload.checkOutTime),
    bathroomType: firstString(
      family.bathroom_type,
      meta.bathroomType,
      onboardingPayload.bathroomType,
      primaryRoomDraft.bathroomType
    ),
    propertyAddress: firstString(onboardingPayload.propertyAddress, family.street_address, meta.propertyAddress),
    commonAreas: firstListString(onboardingPayload.commonAreas, family.common_areas, meta.commonAreas),
    amenities: firstListString(
      onboardingPayload.amenities,
      family.amenities,
      meta.amenities,
      primaryRoomDraft.amenities,
      primaryRoomDraft.roomAmenities
    ),
    includedItems: firstListString(
      onboardingPayload.includedItems,
      onboardingPayload.includedHighlights,
      meta.includedItems
    ),
    houseRules: firstListString(onboardingPayload.houseRules, onboardingPayload.houseRulesText, family.house_rules, meta.houseRules),
    googleMapsLink: firstString(meta.googleMapsLink, onboardingPayload.googleMapsLink, family.google_maps_link, meta.propertyAddress),
    priceMorning: parsePrice(family.price_morning),
    priceAfternoon: parsePrice(family.price_afternoon),
    priceEvening: parsePrice(family.price_evening),
    priceFullday: parsePrice(family.price_fullday),
    foodType: firstListString(onboardingPayload.foodType, family.food_type, meta.foodType),
  };
}

function buildScheduleFromFamily(family: Record<string, unknown>) {
  const onboardingPayload = pickObject(family.latest_onboarding_payload);
  const meta = parseHostListingMeta(typeof family.admin_notes === "string" ? family.admin_notes : null);
  return {
    isActive: Boolean(family.is_active),
    isAccepting: Boolean(family.is_accepting),
    bookingRequiresHostApproval:
      typeof family.booking_requires_host_approval === "boolean"
        ? family.booking_requires_host_approval
        : typeof onboardingPayload.bookingRequiresHostApproval === "boolean"
          ? onboardingPayload.bookingRequiresHostApproval
          : Boolean(meta.bookingRequiresHostApproval),
    maxGuests: String(family.max_guests ?? 3),
    activeQuarters: joinList(
      family.active_quarters ?? ["morning", "afternoon", "evening", "fullday"]
    ),
    blockedDates: joinList(family.blocked_dates),
  };
}

function buildComplianceFromMeta(
  family: Record<string, unknown>,
  meta: ReturnType<typeof parseHostListingMeta>,
  hostTaxDetails?: HostDashboardEditorProps["hostTaxDetails"]
) {
  return {
    pccFileName: String(meta.pccFileName ?? ""),
    propertyProofFileName: String(meta.propertyProofFileName ?? ""),
    formCFileName: String(meta.formCFileName ?? ""),
    panCardUrl: String(meta.panCardUrl ?? ""),
    propertyOwnershipUrl: String(meta.propertyOwnershipUrl ?? ""),
    nocUrl: String(meta.nocUrl ?? ""),
    policeVerificationUrl: String(meta.policeVerificationUrl ?? ""),
    fssaiRegistrationUrl: String(meta.fssaiRegistrationUrl ?? ""),
    idDocumentType: String(family.id_document_type ?? meta.idDocumentType ?? ""),
    idDocumentUrl: String(family.id_document_url ?? meta.idDocumentUrl ?? meta.idDocumentPhotoUrl ?? ""),
    liveSelfieUrl: String(family.live_selfie_url ?? meta.liveSelfieUrl ?? ""),
    panNumber: "",
    panMasked: String(meta.panMasked ?? (hostTaxDetails?.pan_last_four ? `******${hostTaxDetails.pan_last_four}` : "")),
    panLastFour: String(meta.panLastFour ?? hostTaxDetails?.pan_last_four ?? ""),
    panHolderName: String(meta.panHolderName ?? hostTaxDetails?.pan_holder_name ?? ""),
    panDateOfBirth: String(meta.panDateOfBirth ?? hostTaxDetails?.pan_date_of_birth ?? ""),
    panVerificationStatus: String(meta.panVerificationStatus ?? hostTaxDetails?.verification_status ?? "pending"),
    panVerificationProvider: String(meta.panVerificationProvider ?? hostTaxDetails?.verification_provider ?? ""),
    panRiskFlag: Boolean(meta.panRiskFlag ?? hostTaxDetails?.risk_flag),
    panConsentGiven: Boolean(hostTaxDetails?.consent_given ?? false),
    isPanVerified: Boolean(hostTaxDetails?.is_verified ?? false),
    panVerifiedAt: String(hostTaxDetails?.verified_at ?? ""),
    adminNotes: String(meta.complianceNote ?? ""),
  };
}

function buildPhotosFromAllPhotos(
  allPhotos: Array<Record<string, unknown>>,
  familyId: string
): PhotoItem[] {
  return allPhotos
    .filter((p) => String(p.family_id) === familyId)
    .map((p) => ({
      id: String(p.id),
      url: String(p.url),
      isPrimary: Boolean(p.is_primary),
    }));
}

export function HostDashboardEditor({
  family: initialFamily,
  allFamilies,
  familyPhotos: allPhotos,
  bookingRows,
  initialTab = "dashboard",
  hostTaxDetails,
  hostUserId,
  globalCommission,
  diagnostics,
  famloPlusEnabled = false,
  proDashboardEnabled = false,
  proAccessByFamilyId = {},
}: Readonly<HostDashboardEditorProps>): React.JSX.Element {
  const supabaseClient = useMemo(() => createBrowserSupabaseClient(), []);
  const workspaceFamilies = useMemo(
    () =>
      allFamilies.filter((family): family is Record<string, unknown> => normalizeFamilyId(family.id).length > 0),
    [allFamilies]
  );
  const initialFamilyId = useMemo(() => normalizeFamilyId(initialFamily.id), [initialFamily.id]);
  const fallbackFamilyId = useMemo(
    () => workspaceFamilies.map((family) => normalizeFamilyId(family.id)).find(Boolean) ?? initialFamilyId,
    [initialFamilyId, workspaceFamilies]
  );
  const resolveAccessibleFamilyId = useCallback(
    (candidate: unknown): string => {
      const normalizedCandidate = normalizeFamilyId(candidate);
      if (normalizedCandidate && workspaceFamilies.some((family) => normalizeFamilyId(family.id) === normalizedCandidate)) {
        return normalizedCandidate;
      }
      return fallbackFamilyId;
    },
    [fallbackFamilyId, workspaceFamilies]
  );

  const [activeFamilyId, setActiveFamilyId] = useState(() => resolveAccessibleFamilyId(initialFamily.id));

  const activeFamily = useMemo(
    () =>
      workspaceFamilies.find((family) => normalizeFamilyId(family.id) === activeFamilyId) ??
      workspaceFamilies[0] ??
      initialFamily,
    [workspaceFamilies, activeFamilyId, initialFamily]
  );

  const meta = useMemo(
    () =>
      parseHostListingMeta(
        typeof activeFamily.admin_notes === "string" ? activeFamily.admin_notes : null
      ),
    [activeFamily.admin_notes]
  );

  const [profile, setProfile] = useState(() =>
    buildProfileFromFamily(initialFamily, parseHostListingMeta(
      typeof initialFamily.admin_notes === "string" ? initialFamily.admin_notes : null
    ))
  );
  const [listing, setListing] = useState(() =>
    buildListingFromFamily(initialFamily, parseHostListingMeta(
      typeof initialFamily.admin_notes === "string" ? initialFamily.admin_notes : null
    ))
  );
  const [schedule, setSchedule] = useState(() => buildScheduleFromFamily(initialFamily));
  const [compliance, setCompliance] = useState(() =>
    buildComplianceFromMeta(initialFamily, parseHostListingMeta(
      typeof initialFamily.admin_notes === "string" ? initialFamily.admin_notes : null
    ), hostTaxDetails)
  );
  const [photos, setPhotos] = useState<PhotoItem[]>(() =>
    buildPhotosFromAllPhotos(allPhotos, String(initialFamily.id))
  );

  // FIX 1 + 2 + 6 — reset ALL state when active listing changes or props refresh
  useEffect(() => {
    setProfile(buildProfileFromFamily(activeFamily, meta));
    setListing(buildListingFromFamily(activeFamily, meta));
    setSchedule(buildScheduleFromFamily(activeFamily));
    setCompliance(buildComplianceFromMeta(activeFamily, meta, hostTaxDetails));
    setPhotos(buildPhotosFromAllPhotos(allPhotos, activeFamilyId));
  }, [activeFamilyId, activeFamily, meta, allPhotos, hostTaxDetails]); 

  const [activeTab, setActiveTab] = useState(() => normalizeDashboardTab(initialTab));
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [localBookingRows, setLocalBookingRows] = useState<Array<Record<string, unknown>>>(bookingRows);
  const [bookingRowsLoading, setBookingRowsLoading] = useState(false);
  const [bookingRowsRequestedForFamilyId, setBookingRowsRequestedForFamilyId] = useState<string | null>(
    bookingRows.length > 0 ? String(initialFamily.id) : null
  );
  const [bookingSummary, setBookingSummary] = useState<BookingSummary | null>(null);
  const [bookingSummaryLoading, setBookingSummaryLoading] = useState(false);
  const [bookingLoadError, setBookingLoadError] = useState<string | null>(null);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    const nextFamilyId = resolveAccessibleFamilyId(activeFamilyId || initialFamily.id);
    if (nextFamilyId !== activeFamilyId) {
      setActiveFamilyId(nextFamilyId);
    }
  }, [activeFamilyId, initialFamily.id, resolveAccessibleFamilyId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const searchParams = new URLSearchParams(window.location.search);
    const tabFromUrl = searchParams.get("tab");
    setActiveTab(normalizeDashboardTab(tabFromUrl || initialTab));
  }, [initialTab]);

  const syncDashboardUrl = useCallback((nextTab: string, nextFamilyId?: string) => {
    if (typeof window === "undefined") return;
    const resolvedFamilyId = resolveAccessibleFamilyId(nextFamilyId ?? activeFamilyId);
    if (!resolvedFamilyId) return;
    const url = new URL(window.location.href);
    url.searchParams.set("tab", normalizeDashboardTab(nextTab));
    url.searchParams.set("family", resolvedFamilyId);
    window.history.replaceState({}, "", url.toString());
  }, [activeFamilyId, resolveAccessibleFamilyId]);

  useEffect(() => {
    if (typeof window === "undefined" || !activeFamilyId) return;
    const url = new URL(window.location.href);
    const urlFamilyId = normalizeFamilyId(url.searchParams.get("family"));
    const urlTab = normalizeDashboardTab(url.searchParams.get("tab") || initialTab);
    if (urlFamilyId !== activeFamilyId || urlTab !== activeTab) {
      syncDashboardUrl(activeTab, activeFamilyId);
    }
  }, [activeFamilyId, activeTab, initialTab, syncDashboardUrl]);

  const needsDetailedBookingRows = useMemo(
    () => new Set(["bookings", "calendar", "earnings"]).has(activeTab),
    [activeTab]
  );
  const needsBookingSummary = activeTab === "dashboard";

  const loadBookingRows = useCallback(
    async (familyIdToLoad: string, options?: { silent?: boolean }): Promise<void> => {
      const silent = options?.silent ?? false;
      if (!familyIdToLoad) return;

      try {
        if (!silent) {
          setBookingRowsLoading(true);
        }
        setBookingRowsRequestedForFamilyId(familyIdToLoad);
        setBookingLoadError(null);
        const response = await fetch(`/api/host/dashboard-bookings?familyId=${encodeURIComponent(familyIdToLoad)}`, {
          cache: "no-store",
        });
        const payload = (await response.json()) as Array<Record<string, unknown>> | { error?: string };
        if (!response.ok || !Array.isArray(payload)) {
          throw new Error((!Array.isArray(payload) && payload.error) || "Failed to load booking rows.");
        }
        setLocalBookingRows(payload);
      } catch (error) {
        console.error("Failed to load booking rows:", error);
        setBookingLoadError(error instanceof Error ? error.message : "Failed to load booking rows.");
      } finally {
        if (!silent) {
          setBookingRowsLoading(false);
        }
      }
    },
    []
  );

  useEffect(() => {
    if (
      !needsDetailedBookingRows ||
      bookingRowsLoading ||
      localBookingRows.length > 0 ||
      bookingRowsRequestedForFamilyId === activeFamilyId
    ) {
      return;
    }
    void loadBookingRows(activeFamilyId);
  }, [
    activeFamilyId,
    bookingRowsLoading,
    bookingRowsRequestedForFamilyId,
    loadBookingRows,
    localBookingRows.length,
    needsDetailedBookingRows,
  ]);

  const loadBookingSummary = useCallback(
    async (familyIdToLoad: string, options?: { silent?: boolean }): Promise<void> => {
      const silent = options?.silent ?? false;
      if (!familyIdToLoad) return;

      try {
        if (!silent) {
          setBookingSummaryLoading(true);
        }
        setBookingLoadError(null);
        const response = await fetch(
          `/api/host/dashboard-bookings?familyId=${encodeURIComponent(familyIdToLoad)}&summary=1`,
          { cache: "no-store" }
        );
        const payload = (await response.json()) as BookingSummary | { error?: string };
        if (
          !response.ok ||
          typeof (payload as BookingSummary).totalStays !== "number" ||
          typeof (payload as BookingSummary).totalEarnings !== "number"
        ) {
          throw new Error(("error" in payload && payload.error) || "Failed to load dashboard summary.");
        }
        setBookingSummary(payload as BookingSummary);
      } catch (error) {
        console.error("Failed to load dashboard summary:", error);
        setBookingLoadError(error instanceof Error ? error.message : "Failed to load dashboard summary.");
      } finally {
        if (!silent) {
          setBookingSummaryLoading(false);
        }
      }
    },
    []
  );

  useEffect(() => {
    if (!needsBookingSummary || bookingSummaryLoading || bookingSummary) return;
    void loadBookingSummary(activeFamilyId);
  }, [activeFamilyId, bookingSummary, bookingSummaryLoading, loadBookingSummary, needsBookingSummary]);

  useEffect(() => {
    const realtimeHostId = getActiveRealtimeHostId(activeFamily);
    if (!realtimeHostId || (!needsDetailedBookingRows && !needsBookingSummary)) return;
    const client = supabaseClient;
    const channelName = `web_bookings_v2_${realtimeHostId}`;

    const channel = client
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "bookings_v2",
          filter: `host_id=eq.${realtimeHostId}`,
        },
        () => {
          void loadBookingRows(activeFamilyId, { silent: true });
          if (needsBookingSummary) {
            void loadBookingSummary(activeFamilyId, { silent: true });
          }
        }
      )
      .subscribe();

    return () => {
      client.removeChannel(channel);
    };
  }, [activeFamily, activeFamilyId, loadBookingRows, loadBookingSummary, needsBookingSummary, needsDetailedBookingRows, supabaseClient]);

  const complianceRef = useRef(compliance);
  useEffect(() => { complianceRef.current = compliance; }, [compliance]);

  const handleSave = useCallback(
    async (options?: {
      updatedSchedule?: typeof schedule;
      updatedListing?: typeof listing;
      updatedProfile?: typeof profile;
      updatedPhotos?: PhotoItem[];
      updatedCompliance?: typeof compliance;
    }) => {
      setSaving(true);
      setMessage(null);

      try {
        const finalPhotos = options?.updatedPhotos ?? photos;
        const finalSchedule = options?.updatedSchedule ?? schedule;
        const finalListing = options?.updatedListing ?? listing;
        const finalProfile = options?.updatedProfile ?? profile;
        const finalCompliance = options?.updatedCompliance ?? complianceRef.current;

        const photosPayload: Array<{ url: string; isPrimary: boolean }> = [
          ...finalPhotos.filter((p) => p.isPrimary),
          ...finalPhotos.filter((p) => !p.isPrimary),
        ].map((p) => ({ url: p.url, isPrimary: p.isPrimary }));

        const response = await fetch("/api/onboarding/home/dashboard-save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            familyId: activeFamilyId,
            profile: finalProfile,
            listing: finalListing,
            schedule: finalSchedule,
            photos: photosPayload,
            compliancePatch: {
              pccFileName: finalCompliance.pccFileName,
              propertyProofFileName: finalCompliance.propertyProofFileName,
              formCFileName: finalCompliance.formCFileName,
              panCardUrl: finalCompliance.panCardUrl,
              propertyOwnershipUrl: finalCompliance.propertyOwnershipUrl,
              nocUrl: finalCompliance.nocUrl,
              policeVerificationUrl: finalCompliance.policeVerificationUrl,
              fssaiRegistrationUrl: finalCompliance.fssaiRegistrationUrl,
              idDocumentType: finalCompliance.idDocumentType,
              idDocumentUrl: finalCompliance.idDocumentUrl,
              liveSelfieUrl: finalCompliance.liveSelfieUrl,
              panNumber: finalCompliance.panNumber,
              panHolderName: finalCompliance.panHolderName,
              panDateOfBirth: finalCompliance.panDateOfBirth,
              panConsentGiven: finalCompliance.panConsentGiven,
              adminNotes: finalCompliance.adminNotes,
            },
          }),
        });

        const resData = await response.json();

        if (response.ok) {
          setMessage({ type: "success", text: "Listing updated live!" });
          if (options?.updatedSchedule) setSchedule(options.updatedSchedule);
          if (options?.updatedListing) setListing(options.updatedListing);
          if (options?.updatedProfile) setProfile(options.updatedProfile);
          if (options?.updatedPhotos) setPhotos(options.updatedPhotos);
          if (options?.updatedCompliance) setCompliance(options.updatedCompliance);
        } else {
          setMessage({ type: "error", text: resData.error ?? "Sync failed. Connection error." });
        }
      } catch (err) {
        console.error("Sync error:", err);
        setMessage({ type: "error", text: "Database connection lost. Please reload." });
      } finally {
        setSaving(false);
        setTimeout(() => setMessage(null), 5000);
      }
    },
    [activeFamilyId, photos, schedule, listing, profile]
  );

  const revenueBookings = useMemo(
    () =>
      localBookingRows.filter(
        (b) =>
          b.payment_status === "paid" ||
          b.status === "confirmed" ||
          b.status === "completed" ||
          b.status === "checked_in" ||
          b.status === "accepted"
      ),
    [localBookingRows]
  );

  const computedBookingSummary = useMemo(
    () => ({
      totalStays: revenueBookings.length,
      totalEarnings: revenueBookings.reduce((acc, b) => {
        const payout = Number(b.family_payout);
        if (payout > 0) return acc + payout;

        const gross = Number(b.total_price) || 0;
        const commissionFactor = (100 - globalCommission) / 100;
        return acc + (gross * commissionFactor);
      }, 0),
    }),
    [globalCommission, revenueBookings]
  );

  const totalStays = localBookingRows.length > 0 ? computedBookingSummary.totalStays : (bookingSummary?.totalStays ?? 0);
  const totalEarnings = localBookingRows.length > 0 ? computedBookingSummary.totalEarnings : (bookingSummary?.totalEarnings ?? 0);
  const dashboardMetricsLoading = needsBookingSummary && bookingSummaryLoading && localBookingRows.length === 0;
  const activeProAccess = proAccessByFamilyId[activeFamilyId] ?? {
    allowed: false,
    status: "inactive",
    current_period_end: null,
    grace_until: null,
    reason: "no_subscription",
  };

  const debugSnapshot = useMemo(() => {
    if (!mounted || process.env.NODE_ENV !== "development") return null;
    const first = localBookingRows[0];
    return {
      activeFamilyId,
      hostCode: diagnostics?.hostCode,
      linkedCount: diagnostics?.familyCount,
      rawStatus: diagnostics?.rawBookingCount,
      firstBooking: first
        ? {
            id: first.id,
            status: first.status,
            link_id: first.family_id ?? first.host_id,
            casing:
              (first.family_id ?? first.host_id) === diagnostics?.hostCode
                ? "Exact Match"
                : "Case Variation",
          }
        : "No bookings found",
    };
  }, [mounted, activeFamilyId, localBookingRows, diagnostics]);

  const navigateTab = (tab: string) => {
    const normalizedTab = normalizeDashboardTab(tab);
    setActiveTab(normalizedTab);
    syncDashboardUrl(normalizedTab);
    if (tab !== "messages") setActiveConversationId(null);
    window.scrollTo(0, 0);
  };

  const handleOpenChat = async (referenceId: string) => {
    const cleanReference = referenceId.trim();
    if (!cleanReference) return;

    try {
      const response = await fetch(`/api/conversations/resolve?referenceId=${encodeURIComponent(cleanReference)}`);
      const payload = (await response.json()) as { conversationId?: string; error?: string };
      if (response.ok && typeof payload.conversationId === "string" && payload.conversationId.length > 0) {
        setActiveConversationId(payload.conversationId);
      } else {
        setActiveConversationId(cleanReference);
      }
    } catch {
      setActiveConversationId(cleanReference);
    }

    setActiveTab("messages");
    syncDashboardUrl("messages");
    window.scrollTo(0, 0);
  };

  const handleListingSwitch = (nextId: string) => {
    const resolvedFamilyId = resolveAccessibleFamilyId(nextId);
    if (!resolvedFamilyId) return;
    setActiveFamilyId(resolvedFamilyId);
    setLocalBookingRows([]);
    setBookingRowsRequestedForFamilyId(null);
    setBookingSummary(null);
    setBookingLoadError(null);
    document.cookie = `famlo_host_family_id=${resolvedFamilyId}; path=/; max-age=${60 * 60 * 24 * 30}`;
    syncDashboardUrl(activeTab, resolvedFamilyId);
  };

  return (
    <div className={styles.dashboardLayout}>
      <aside className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          <h2 className={styles.sidebarTitle}>Partner Portal</h2>

          <div className={styles.listingSwitcher}>
            <select
              className={styles.switcherSelect}
              value={activeFamilyId}
              onChange={(e) => handleListingSwitch(e.target.value)}
            >
              {workspaceFamilies.map((f: any) => (
                <option key={normalizeFamilyId(f.id)} value={normalizeFamilyId(f.id)}>
                  {f.property_name || f.name || `Listing ${f.id}`}
                </option>
              ))}
            </select>
          </div>
        </div>

        <nav className={styles.navMenu}>
          {[
            { id: "dashboard",  label: "Dashboard",    icon: <Home size={20} /> },
            { id: "bookings",   label: "Booking",       icon: <BookmarkCheck size={20} /> },
            { id: "messages",   label: "Messages",      icon: <MessageCircle size={20} /> },
            { id: "rooms",      label: "Room",          icon: <BedDouble size={20} /> },
            { id: "calendar",   label: "Calendar",      icon: <CalendarIcon size={20} /> },
            { id: "earnings",   label: "Earnings",      icon: <IndianRupee size={20} /> },
            { id: "profile",    label: "Profile",       icon: <UserCircle2 size={20} /> },
            { id: "compliance", label: "Documents",     icon: <ShieldCheck size={20} /> },
            ...(famloPlusEnabled
              ? [{ id: "famlo-plus", label: "Famlo Pro", icon: <Sparkles size={20} /> }]
              : []),
            { id: "support",    label: "Contact Famlo", icon: <MessagesSquare size={20} /> },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => navigateTab(tab.id)}
              className={`${styles.navItem} ${activeTab === tab.id ? styles.active : ""}`}
            >
              <span className={styles.navItemIcon}>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </nav>
      </aside>

      <main className={styles.mainContent}>
        <header className={styles.topHeader}>
          <div className={styles.brandSideLeft}>
            <h1 className={styles.pageTitle}>
              {activeTab === "support"
                ? "Support & Resolution"
                : activeTab === "rooms"
                  ? "Rooms"
                  : activeTab === "famlo-plus"
                    ? "Famlo Pro"
                    : activeTab}
            </h1>
          </div>
      <div className={styles.brandSideRight}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <div style={{ fontSize: "14px", fontWeight: 700, color: "#475569" }}>
                  Partner ID: {diagnostics?.hostCode || activeFamilyId}
                </div>
              <div className={styles.hostStatus}>
                ● {schedule.isActive && schedule.isAccepting ? "Live" : schedule.isActive ? "Paused" : "Hidden"}
              </div>
            </div>
          </div>
        </header>

        {message && (
          <div
            className={`${styles.toast} ${
              message.type === "success" ? styles.toastSuccess : styles.toastError
            }`}
          >
            {message.type === "success" ? (
              <CheckCircle2 size={16} />
            ) : (
              <AlertCircle size={16} />
            )}
            <span>{message.text}</span>
          </div>
        )}

        {bookingLoadError ? (
          <div
            className={`${styles.toast} ${styles.toastError}`}
            style={{ marginBottom: "12px" }}
          >
            <AlertCircle size={16} />
            <span>{bookingLoadError}</span>
          </div>
        ) : null}

        <div className={styles.contentArea}>
          {activeTab === "dashboard" && (
            <>
              {/* ✅ activeFamily removed — not in DashboardTab props */}
              <DashboardTab
                profile={profile}
                bookingRows={localBookingRows}
                totalStays={totalStays}
                totalEarnings={totalEarnings}
                globalCommission={globalCommission}
                familyId={activeFamilyId}
                onNavigate={setActiveTab}
                onSave={handleSave}
                saving={saving}
                listing={listing}
                setListing={setListing}
                schedule={schedule}
                setSchedule={setSchedule}
                mounted={mounted}
                bookingDataLoading={dashboardMetricsLoading}
                homeLat={parseCoordinate(activeFamily.lat)}
                homeLng={parseCoordinate(activeFamily.lng)}
              />


            </>
          )}

          {activeTab === "rooms" && (
            <DashboardTab
              profile={profile}
              bookingRows={localBookingRows}
              totalStays={totalStays}
              totalEarnings={totalEarnings}
              globalCommission={globalCommission}
              familyId={activeFamilyId}
              onNavigate={setActiveTab}
              onSave={handleSave}
              saving={saving}
              listing={listing}
              setListing={setListing}
              schedule={schedule}
              setSchedule={setSchedule}
              mounted={mounted}
              viewMode="rooms"
              bookingDataLoading={dashboardMetricsLoading}
              homeLat={parseCoordinate(activeFamily.lat)}
              homeLng={parseCoordinate(activeFamily.lng)}
            />
          )}

          {activeTab === "bookings" && (
            <BookingsTab bookingRows={localBookingRows} onOpenChat={handleOpenChat} loading={bookingRowsLoading} />
          )}

          {activeTab === "messages" && (
            <MessagesTab
              familyId={activeFamilyId}
              hostUserId={hostUserId ?? String(activeFamily.host_id ?? "")}
              activeFamily={activeFamily}
              initialConversationId={activeConversationId}
              setActiveConversationId={setActiveConversationId}
            />
          )}

          {activeTab === "calendar" && (
            <CalendarTab
              schedule={schedule}
              setSchedule={setSchedule}
              bookingRows={localBookingRows}
              onSave={handleSave}
              saving={saving}
              hostId={String(activeFamily.v2_host_id ?? activeFamily.host_id ?? "")}
            />
          )}

          {activeTab === "famlo-plus" && (
            <FamloPlusTab
              familyId={activeFamilyId}
              familyName={String(activeFamily.property_name ?? activeFamily.name ?? "Famlo Home")}
              famloPlusEnabled={famloPlusEnabled}
              proDashboardEnabled={proDashboardEnabled}
              access={activeProAccess}
              proDashboardUrl={`/partnerslogin/home/pro/dashboard?family=${encodeURIComponent(activeFamilyId)}`}
              onNavigate={navigateTab}
            />
          )}

          {activeTab === "earnings" && (
            <EarningsTab
              totalStays={totalStays}
              totalEarnings={totalEarnings}
              bookingRows={localBookingRows}
              loading={bookingRowsLoading}
              hostId={String(activeFamily.v2_host_id ?? activeFamily.host_id ?? "")}
            />
          )}

          {activeTab === "profile" && (
            <ProfileTab
              profile={profile}
              setProfile={setProfile}
              listing={listing}
              setListing={setListing}
              photos={photos}
              setPhotos={setPhotos}
              compliance={compliance}
              setCompliance={setCompliance}
              schedule={schedule}
              setSchedule={setSchedule}
              familyId={activeFamilyId}
              onSave={handleSave}
              saving={saving}
            />
          )}

          {activeTab === "compliance" && (
            <DocumentsTab
              compliance={compliance}
              setCompliance={setCompliance}
              onSave={handleSave}
              saving={saving}
            />
          )}

          {activeTab === "support" && (
            <SupportTab
              hostCode={String(activeFamily.host_id ?? "")}
              hostName={String(activeFamily.name ?? activeFamily.primary_host_name ?? "Partner")}
              familyId={activeFamilyId}
            />
          )}
        </div>
      </main>
    </div>
  );
}
