"use client";

import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import { parseHostListingMeta } from "@/lib/host-listing-meta";
import styles from "./dashboard.module.css";
import {
  Home, BookmarkCheck, Calendar as CalendarIcon, IndianRupee,
  UserCircle2, MessagesSquare, CheckCircle2, AlertCircle,
  BedDouble,
  MessageCircle, ShieldCheck
} from "lucide-react";
import DashboardTab from "./tabs/DashboardTab";
import BookingsTab from "./tabs/BookingsTab";
import CalendarTab from "./tabs/CalendarTab";
import EarningsTab from "./tabs/EarningsTab";
import ProfileTab from "./tabs/ProfileTab";
import MessagesTab from "./tabs/MessagesTab";
import DocumentsTab from "./tabs/DocumentsTab";
import SupportTab from "./tabs/SupportTab";

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
}

export interface PhotoItem {
  id: string;
  url: string;
  isPrimary: boolean;
  family_id?: string;
}

function getActiveRealtimeHostId(family: Record<string, unknown>): string | null {
  return typeof family.v2_host_id === "string" ? family.v2_host_id : null;
}

function joinList(values: unknown): string {
  if (Array.isArray(values)) return values.join(", ");
  if (typeof values === "string") return values;
  return "";
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
  return {
    hostDisplayName: String(
      meta.hostDisplayName ?? family.primary_host_name ?? family.host_name ?? ""
    ),
    hostHobbies: String(meta.hostHobbies ?? ""),
    familyComposition: String(meta.familyComposition ?? ""),
    city: String(family.city ?? ""),
    state: String(family.state ?? ""),
    cityNeighbourhood: String(family.village ?? ""),
    hostCatchphrase: String(meta.hostCatchphrase ?? ""),
    hostSelfieUrl: String(family.host_photo_url ?? meta.hostSelfieUrl ?? ""),
    mobileNumber: String(family.host_phone ?? ""),
    languages: joinList(family.languages_spoken ?? family.languages ?? []),
  };
}

function buildListingFromFamily(
  family: Record<string, unknown>,
  meta: ReturnType<typeof parseHostListingMeta>
) {
  return {
    propertyName: String(family.name ?? ""),
    hostBio: String(family.about ?? family.description ?? ""),
    listingTitle: String(meta.listingTitle ?? ""),
    culturalOffering: String(family.famlo_experience ?? meta.culturalOffering ?? ""),
    journeyStory: String(meta.journeyStory ?? ""),
    specialExperience: String(meta.specialExperience ?? ""),
    localExperience: String(meta.localExperience ?? ""),
    interactionType: String(meta.interactionType ?? ""),
    houseType: String(meta.houseType ?? meta.familyComposition ?? ""),
    checkInTime: String(meta.checkInTime ?? ""),
    checkOutTime: String(meta.checkOutTime ?? ""),
    bathroomType: String(family.bathroom_type ?? meta.bathroomType ?? ""),
    propertyAddress: String(family.street_address ?? meta.propertyAddress ?? ""),
    commonAreas: joinList(family.common_areas ?? meta.commonAreas ?? []),
    amenities: joinList(family.amenities ?? meta.amenities ?? []),
    includedItems: joinList(meta.includedItems),
    houseRules: joinList(family.house_rules ?? meta.houseRules ?? []),
    googleMapsLink: String(meta.googleMapsLink ?? family.google_maps_link ?? meta.propertyAddress ?? ""),
    priceMorning: parsePrice(family.price_morning),
    priceAfternoon: parsePrice(family.price_afternoon),
    priceEvening: parsePrice(family.price_evening),
    priceFullday: parsePrice(family.price_fullday),
    foodType: String(family.food_type ?? meta.foodType ?? ""),
  };
}

function buildScheduleFromFamily(family: Record<string, unknown>) {
  return {
    isActive: Boolean(family.is_active),
    isAccepting: Boolean(family.is_accepting),
    bookingRequiresHostApproval: Boolean(family.booking_requires_host_approval),
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
}: Readonly<HostDashboardEditorProps>): React.JSX.Element {
  const router = useRouter();

  const [activeFamilyId, setActiveFamilyId] = useState(String(initialFamily.id));

  const activeFamily = useMemo(
    () => allFamilies.find((f) => String(f.id) === activeFamilyId) ?? initialFamily,
    [allFamilies, activeFamilyId, initialFamily]
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

  const [activeTab, setActiveTab] = useState(initialTab);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    const normalized = String(initialTab || "dashboard").trim().toLowerCase();
    const allowedTabs = new Set(["dashboard", "rooms", "bookings", "messages", "calendar", "earnings", "profile", "compliance", "support"]);
    setActiveTab(allowedTabs.has(normalized) ? normalized : "dashboard");
  }, [initialTab]);

  // ✅ Shared client — only initialized once per component lifecycle
  const supabaseClient = useMemo(() => createBrowserSupabaseClient(), []);

  useEffect(() => {
    const realtimeHostId = getActiveRealtimeHostId(activeFamily);
    if (!realtimeHostId) return;
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
          router.refresh();
        }
      )
      .subscribe();

    return () => {
      client.removeChannel(channel);
    };
  }, [activeFamily, router, supabaseClient]);

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
      bookingRows.filter(
        (b) =>
          b.payment_status === "paid" ||
          b.status === "confirmed" ||
          b.status === "completed" ||
          b.status === "checked_in" ||
          b.status === "accepted"
      ),
    [bookingRows]
  );

  const totalStays = revenueBookings.length;

  const totalEarnings = useMemo(
    () =>
      revenueBookings.reduce((acc, b) => {
        const payout = Number(b.family_payout);
        if (payout > 0) return acc + payout;

        // Fallback: Apply commission to total_price if payout isn't record
        const gross = Number(b.total_price) || 0;
        const commissionFactor = (100 - globalCommission) / 100;
        return acc + (gross * commissionFactor);
      }, 0),
    [revenueBookings, globalCommission]
  );

  const debugSnapshot = useMemo(() => {
    if (!mounted || process.env.NODE_ENV !== "development") return null;
    const first = bookingRows[0];
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
  }, [mounted, activeFamilyId, bookingRows, diagnostics]);

  const navigateTab = (tab: string) => {
    setActiveTab(tab);
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
    window.scrollTo(0, 0);
  };

  const handleListingSwitch = (nextId: string) => {
    setActiveFamilyId(nextId);
    document.cookie = `famlo_host_family_id=${nextId}; path=/; max-age=${60 * 60 * 24 * 30}`;
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
              {allFamilies.map((f: any) => (
                <option key={String(f.id)} value={String(f.id)}>
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
            { id: "support",    label: "Contact Famlo", icon: <MessagesSquare size={20} /> },
          ].map((tab) => (
            <button
              key={tab.id}
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
              {activeTab === "support" ? "Contact Support" : activeTab === "rooms" ? "Rooms" : activeTab}
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

        <div className={styles.contentArea}>
          {activeTab === "dashboard" && (
            <>
              {/* ✅ activeFamily removed — not in DashboardTab props */}
              <DashboardTab
                profile={profile}
                bookingRows={bookingRows}
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
                homeLat={parseCoordinate(activeFamily.lat)}
                homeLng={parseCoordinate(activeFamily.lng)}
              />


            </>
          )}

          {activeTab === "rooms" && (
            <DashboardTab
              profile={profile}
              bookingRows={bookingRows}
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
              homeLat={parseCoordinate(activeFamily.lat)}
              homeLng={parseCoordinate(activeFamily.lng)}
            />
          )}

          {activeTab === "bookings" && (
            <BookingsTab bookingRows={bookingRows} onOpenChat={handleOpenChat} />
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
              bookingRows={bookingRows}
              onSave={handleSave}
              saving={saving}
              hostId={String(activeFamily.v2_host_id ?? activeFamily.host_id ?? "")}
            />
          )}

          {activeTab === "earnings" && (
            <EarningsTab
              totalStays={totalStays}
              totalEarnings={totalEarnings}
              bookingRows={bookingRows}
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
