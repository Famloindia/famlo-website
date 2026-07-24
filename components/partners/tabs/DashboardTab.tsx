import { useEffect, useMemo, useState } from "react";
import styles from "../dashboard.module.css";
import { 
  Users, Calendar, IndianRupee,
  Clock, CheckCircle2, User, Eye,
  Plus
} from "lucide-react";
import type { StayUnitRecord } from "@/lib/stay-units";
import { buildHomestayPath } from "@/lib/slug";
import HostRoomsManager, { type RoomFormState } from "../rooms/HostRoomsManager";
import { HostWhatsAppSettingsCard } from "../HostWhatsAppSettingsCard";

interface DashboardTabProps {
  profile: any;
  schedule: any;
  setSchedule: any;
  listing: any;
  setListing: any;
  totalStays: number;
  totalEarnings: number;
  globalCommission: number;
  onNavigate: (tab: string) => void;
  onSave: (options?: any) => Promise<void>;
  saving: boolean;
  familyId: string;
  bookingRows: any[];
  bookingDataLoading?: boolean;
  mounted?: boolean;
  viewMode?: "dashboard" | "rooms";
  homeLat?: number;
  homeLng?: number;
}

function hasText(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function hasListItems(value: unknown): boolean {
  return typeof value === "string" ? value.split(",").some((item) => item.trim().length > 0) : false;
}

function roomToForm(room: StayUnitRecord): RoomFormState {
  const photos = Array.isArray(room.photos) ? room.photos : [];
  const toiletTypes = Array.isArray(room.toiletTypes)
    ? room.toiletTypes
    : Array.isArray((room as StayUnitRecord & { toilet_types?: string[] }).toilet_types)
      ? (room as StayUnitRecord & { toilet_types?: string[] }).toilet_types ?? []
      : [];

  return {
    id: room.id,
    unitKey: room.unitKey,
    name: room.name,
    unitType: room.unitType || "private_room",
    description: room.description ?? "",
    maxGuests: String(room.maxGuests),
    bedInfo: room.bedInfo ?? "",
    bathroomType: room.bathroomType ?? "",
    toiletTypes: toiletTypes.join(", "),
    roomSizeSqm: room.roomSizeSqm === null ? "" : String(room.roomSizeSqm),
    lat: room.lat === null || room.lat === undefined ? "" : String(room.lat),
    lng: room.lng === null || room.lng === undefined ? "" : String(room.lng),
    priceMorning: String(room.priceMorning),
    priceAfternoon: String(room.priceAfternoon),
    priceEvening: String(room.priceEvening),
    priceFullday: String(room.priceFullday),
    quarterEnabled: Boolean(room.quarterEnabled),
    isActive: Boolean(room.isActive),
    isPrimary: Boolean(room.isPrimary),
    amenities: Array.isArray(room.amenities) ? room.amenities.join(", ") : "",
    photos: photos.join(", "),
    localityPhotos: Array.isArray(room.localityPhotos) ? room.localityPhotos.join(", ") : "",
    sortOrder: String(room.sortOrder ?? 0),
    source: room.source,
  };
}

function createBlankRoom(nextPrimary = false, fallbackTitle = "Private room"): RoomFormState {
  return {
    id: `temp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    unitKey: "",
    name: fallbackTitle,
    unitType: "private_room",
    description: "",
    maxGuests: "2",
    bedInfo: "1 bed",
    bathroomType: "",
    toiletTypes: "",
    roomSizeSqm: "",
    lat: "",
    lng: "",
    priceMorning: "0",
    priceAfternoon: "0",
    priceEvening: "0",
    priceFullday: "0",
    quarterEnabled: true,
    isActive: true,
    isPrimary: nextPrimary,
    amenities: "",
    photos: "",
    localityPhotos: "",
    sortOrder: "0",
    source: "fallback",
  };
}

export default function DashboardTab({
  profile,
  totalStays,
  totalEarnings,
  onNavigate,
  onSave,
  saving,
  schedule,
  listing,
  setListing,
  setSchedule,
  bookingRows,
  familyId,
  globalCommission,
  mounted,
  bookingDataLoading = false,
  viewMode = "dashboard",
  homeLat,
  homeLng,
}: DashboardTabProps) {
  const isRoomsView = viewMode === "rooms";
  const liveStatus = schedule.isActive ? "Listing Active" : "Listing Inactive";
  const [roomDrafts, setRoomDrafts] = useState<RoomFormState[]>([]);
  const [roomsLoading, setRoomsLoading] = useState(false);
  const [roomsLoadedOnce, setRoomsLoadedOnce] = useState(false);
  const [approvalLoading, setApprovalLoading] = useState(false);
  const [approvalError, setApprovalError] = useState<string | null>(null);

  const roomStats = useMemo(() => {
    const activeRooms = roomDrafts.filter((room) => room.isActive).length;
    const totalCapacity = roomDrafts.reduce((acc, room) => acc + Math.max(1, Number(room.maxGuests) || 0), 0);
    const activeCapacity = roomDrafts
      .filter((room) => room.isActive)
      .reduce((acc, room) => acc + Math.max(1, Number(room.maxGuests) || 0), 0);
    return { activeRooms, totalCapacity, activeCapacity };
  }, [roomDrafts]);
  const firstInactiveRoom = useMemo(() => roomDrafts.find((room) => !room.isActive) ?? null, [roomDrafts]);
  const listingPreviewUrl = buildHomestayPath(
    listing?.listingTitle || listing?.propertyName || profile?.hostDisplayName || "Homestay",
    profile?.cityNeighbourhood || null,
    profile?.city || null,
    familyId
  );

  const setupCompletion = useMemo(() => {
    const profileChecks = [
      hasText(profile?.hostDisplayName),
      hasText(profile?.city),
      hasText(profile?.state),
      hasText(profile?.hostSelfieUrl),
      hasText(profile?.mobileNumber),
      hasListItems(profile?.languages),
      hasText(profile?.familyComposition),
      hasText(profile?.hostCatchphrase),
    ];
    const listingChecks = [
      hasText(listing?.propertyName),
      hasText(listing?.hostBio),
      hasText(listing?.listingTitle),
      hasText(listing?.propertyAddress),
      hasListItems(listing?.amenities),
      hasListItems(listing?.houseRules),
      hasText(listing?.foodType),
      hasText(listing?.googleMapsLink),
      hasText(listing?.bathroomType),
    ];
    const scheduleChecks = [
      Boolean(schedule?.isActive),
      Boolean(schedule?.isAccepting),
      Boolean(schedule?.bookingRequiresHostApproval !== undefined),
      hasListItems(schedule?.activeQuarters),
      hasListItems(schedule?.blockedDates),
    ];
    const roomChecks = [
      roomDrafts.length > 0,
      roomStats.activeRooms > 0,
      roomStats.totalCapacity > 0,
      roomDrafts.some((room) => room.isPrimary),
      roomDrafts.some((room) => room.photos.trim().length > 0),
    ];
    const checks = [...profileChecks, ...listingChecks, ...scheduleChecks, ...roomChecks];
    const completed = checks.filter(Boolean).length;
    const total = checks.length;
    return {
      completed,
      total,
      percent: total > 0 ? Math.round((completed / total) * 100) : 0,
      missing: {
        profile: profileChecks.filter((item) => !item).length,
        listing: listingChecks.filter((item) => !item).length,
        schedule: scheduleChecks.filter((item) => !item).length,
        rooms: roomChecks.filter((item) => !item).length,
      },
    };
  }, [listing, profile, roomDrafts, roomStats.activeRooms, roomStats.totalCapacity, schedule]);

  const approvalReadiness = useMemo(() => {
    if (setupCompletion.percent >= 85 && schedule?.isActive && roomStats.activeRooms > 0 && roomStats.totalCapacity > 0) {
      return {
        label: "Ready for approval",
        tone: "ready" as const,
        description: "Profile, listing, schedule, and rooms are in a strong state for admin review.",
      };
    }

    return {
      label: "Still drafting",
      tone: "draft" as const,
      description: "Finish the missing pieces before asking for admin approval.",
    };
  }, [roomStats.activeRooms, roomStats.totalCapacity, schedule, setupCompletion.percent]);

  const missingSetupSummary = useMemo(() => {
    const summary = [
      setupCompletion.missing.profile > 0 ? `Profile (${setupCompletion.missing.profile})` : null,
      setupCompletion.missing.listing > 0 ? `Listing (${setupCompletion.missing.listing})` : null,
      setupCompletion.missing.schedule > 0 ? `Schedule (${setupCompletion.missing.schedule})` : null,
      setupCompletion.missing.rooms > 0 ? `Rooms (${setupCompletion.missing.rooms})` : null,
    ].filter((item): item is string => Boolean(item));

    return summary;
  }, [setupCompletion.missing.listing, setupCompletion.missing.profile, setupCompletion.missing.rooms, setupCompletion.missing.schedule]);

  useEffect(() => {
    let cancelled = false;
    let deferredLoadHandle: number | null = null;

    async function loadRooms(): Promise<void> {
      setRoomsLoading(true);
      try {
        const response = await fetch(`/api/host/stay-units?familyId=${encodeURIComponent(familyId)}`);
        const payload = (await response.json()) as { stayUnits?: StayUnitRecord[]; error?: string };
        if (!response.ok) {
          throw new Error(payload.error ?? "Failed to load rooms.");
        }

        if (!cancelled) {
          const nextRooms = Array.isArray(payload.stayUnits) ? payload.stayUnits.map(roomToForm) : [];
          setRoomDrafts(nextRooms.length > 0 ? nextRooms : [createBlankRoom(true)]);
          setRoomsLoadedOnce(true);
        }
      } catch (error) {
        if (!cancelled) {
          setRoomDrafts((current) => (current.length > 0 ? current : [createBlankRoom(true)]));
          setRoomsLoadedOnce(true);
        }
      } finally {
        if (!cancelled) {
          setRoomsLoading(false);
        }
      }
    }

    if (isRoomsView) {
      void loadRooms();
    } else {
      deferredLoadHandle = window.setTimeout(() => {
        void loadRooms();
      }, 250);
    }

    return () => {
      cancelled = true;
      if (deferredLoadHandle != null) {
        window.clearTimeout(deferredLoadHandle);
      }
    };
  }, [familyId, isRoomsView]);

  useEffect(() => {
    let cancelled = false;
    async function loadBookingApproval(): Promise<void> {
      setApprovalLoading(true);
      setApprovalError(null);
      try {
        const response = await fetch(`/api/host/booking-approval?familyId=${encodeURIComponent(familyId)}`, {
          cache: "no-store",
        });
        const payload = (await response.json()) as { bookingRequiresHostApproval?: boolean; error?: string };
        if (!response.ok || typeof payload.bookingRequiresHostApproval !== "boolean") {
          throw new Error(payload.error ?? "Unable to load booking approval setting.");
        }
        if (!cancelled) {
          setSchedule((current: typeof schedule) => ({
            ...current,
            bookingRequiresHostApproval: payload.bookingRequiresHostApproval,
          }));
        }
      } catch (loadError) {
        if (!cancelled) {
          setApprovalError(loadError instanceof Error ? loadError.message : "Unable to load booking approval setting.");
        }
      } finally {
        if (!cancelled) setApprovalLoading(false);
      }
    }
    void loadBookingApproval();
    return () => {
      cancelled = true;
    };
  }, [familyId, setSchedule]);

  const persistVisibility = async (patch: Partial<typeof schedule>) => {
    const updatedSchedule = { ...schedule, ...patch };
    setSchedule(updatedSchedule);
    await onSave({ updatedSchedule });
  };
  const toggleListingActive = async (nextActive: boolean) => {
    await persistVisibility({
      isActive: nextActive,
      isAccepting: nextActive,
    });
  };
  const toggleHostApproval = async (nextValue: boolean) => {
    const previousValue = Boolean(schedule.bookingRequiresHostApproval);
    setSchedule({ ...schedule, bookingRequiresHostApproval: nextValue });
    setApprovalLoading(true);
    setApprovalError(null);
    try {
      const response = await fetch("/api/host/booking-approval", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ familyId, enabled: nextValue }),
      });
      const payload = (await response.json()) as { bookingRequiresHostApproval?: boolean; error?: string };
      if (!response.ok || typeof payload.bookingRequiresHostApproval !== "boolean") {
        throw new Error(payload.error ?? "Unable to update booking approval setting.");
      }
      setSchedule({ ...schedule, bookingRequiresHostApproval: payload.bookingRequiresHostApproval });
    } catch (toggleError) {
      setSchedule({ ...schedule, bookingRequiresHostApproval: previousValue });
      setApprovalError(toggleError instanceof Error ? toggleError.message : "Unable to update booking approval setting.");
    } finally {
      setApprovalLoading(false);
    }
  };

  const toggleRoomActive = async (roomId: string, nextActive: boolean): Promise<void> => {
    const target = roomDrafts.find((room) => room.id === roomId);
    if (!target) return;
    setRoomDrafts((current) => current.map((room) => (room.id === roomId ? { ...room, isActive: nextActive } : room)));
  };

  const addRoom = (): void => {
    setRoomDrafts((current) => [...current, createBlankRoom(current.length === 0)]);
  };

  const activateRoom = (roomId: string): void => {
    setRoomDrafts((current) => current.map((room) => (room.id === roomId ? { ...room, isActive: true } : room)));
  };

  const scrollToDashboardSection = (sectionId: string): void => {
    if (typeof document === "undefined") return;
    document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const recommendedSetupAction = (() => {
    if (setupCompletion.missing.profile > 0 || setupCompletion.missing.listing > 0) {
      return {
        label: "Complete profile details",
        description: "Your host identity and home story are the fastest way to raise trust.",
        action: () => onNavigate("profile"),
      };
    }

    if (setupCompletion.missing.schedule > 0) {
      return {
        label: "Review availability settings",
        description: "Check active status, quarters, and approval behavior before going live.",
        action: () => onNavigate("calendar"),
      };
    }

    if (setupCompletion.missing.rooms > 0) {
      return {
        label: "Add or finish room cards",
        description: "Public booking works best when at least one active room is ready.",
        action: () => addRoom(),
      };
    }

    return {
      label: "Everything looks ready",
      description: "Your dashboard setup is complete enough for public discovery.",
      action: () => onNavigate("dashboard"),
    };
  })();
  
  // Sort ALL bookings by creation time for real-time feed visibility
  const recentBookings = [...bookingRows]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5);

  if (isRoomsView) {
    return (
      <HostRoomsManager
        familyId={familyId}
        homeLat={homeLat}
        homeLng={homeLng}
        title="Edit room details and availability"
        description="Update room details here, then use the public room page link to preview how guests will see it."
        propertyLabel="Changes here update your Famlo room inventory."
        showChannelManager
        viewRoomPage
      />
    );
  }

  return (
    <div className={`${styles.flexCol} ${styles.animateIn}`} style={{ gap: "32px" }}>
      
      {/* 1. APP VISIBILITY (Green Card) */}
      <div
        id="dashboard-visibility"
        className={styles.glassCard} 
        style={{ 
          borderLeft: '4px solid #10b981',
          padding: '40px',
          background: 'linear-gradient(to right, white, #f0fdf4)' 
        }}
      >
        <div className={styles.cardTitle} style={{ color: '#10b981', display: 'flex', alignItems: 'center', gap: '8px' }}>
           LIVE APP VISIBILITY
        </div>
        <h2 style={{ fontSize: '28px', fontWeight: 900, marginTop: '12px', marginBottom: '8px', color: '#0e2b57' }}>
          {liveStatus}
        </h2>
        <p style={{ fontSize: '14px', color: 'rgba(14,43,87,0.6)', marginBottom: '32px', fontWeight: 600 }}>
          {schedule.isActive
            ? "Guests can see your public home card and request bookings right now."
            : "Guests can still see the card in the listing feed, but it is greyed out and cannot be opened or booked."}
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center', marginBottom: '20px' }}>
          <span style={{ padding: '8px 12px', borderRadius: '999px', background: approvalReadiness.tone === "ready" ? '#ecfdf5' : '#fff7ed', color: approvalReadiness.tone === "ready" ? '#166534' : '#9a3412', fontSize: '11px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            {approvalReadiness.label}
          </span>
          <span style={{ fontSize: '12px', color: 'rgba(14,43,87,0.62)', fontWeight: 700 }}>
            {setupCompletion.percent}% setup complete
          </span>
        </div>

        <div style={{ background: '#f8fafc', padding: '20px 24px', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
           <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', flex: 1, minWidth: '280px' }}>
             <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
               <div>
                 <div style={{ fontSize: '11px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#0e2b57' }}>Listing active for guests</div>
                 <div style={{ fontSize: '12px', color: 'rgba(14,43,87,0.6)', fontWeight: 700 }}>Turn this off to mark the listing inactive. Guests will still see it in grey, but they cannot open or book it.</div>
               </div>
               <label className={styles.iosToggleLabel}>
                 <input
                   type="checkbox"
                   className={styles.iosToggleInput}
                   checked={Boolean(schedule.isActive)}
                   onChange={(event) => void toggleListingActive(event.target.checked)}
                   disabled={saving}
                 />
                 <div className={styles.iosToggleTrack}>
                   <div className={styles.iosToggleThumb} />
                 </div>
               </label>
              </div>
           </div>
        </div>

        <div style={{ marginTop: '16px', background: '#fff7ed', padding: '16px 20px', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', border: '1px solid rgba(251, 146, 60, 0.18)' }}>
           <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1, minWidth: '280px' }}>
             <div style={{ fontSize: '11px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#9a3412' }}>Booking approval</div>
             <div style={{ fontSize: '12px', color: 'rgba(154,52,18,0.8)', fontWeight: 700 }}>If enabled, new bookings stay pending until you accept them in the host dashboard.</div>
           </div>
           <label className={styles.iosToggleLabel}>
             <input
               type="checkbox"
               className={styles.iosToggleInput}
               checked={Boolean(schedule.bookingRequiresHostApproval)}
               onChange={(event) => void toggleHostApproval(event.target.checked)}
               disabled={approvalLoading}
               aria-label="Require host approval for new bookings"
             />
             <div className={styles.iosToggleTrack}>
             <div className={styles.iosToggleThumb} />
           </div>
         </label>
        </div>
        {approvalError ? (
          <p role="alert" style={{ margin: "8px 0 0", color: "#b91c1c", fontSize: "12px", fontWeight: 700 }}>
            {approvalError}
          </p>
        ) : null}

        <HostWhatsAppSettingsCard />

      </div>

      {/* 2. SUMMARY TILES */}
      <div className={styles.gridCols2}>
        <div id="dashboard-summary" className={styles.glassCard} style={{ background: "#0e2b57", color: "white" }}>
           <div style={{ display: 'flex', gap: '16px', alignItems: 'center', marginBottom: '20px' }}>
              <div style={{ padding: '10px', background: 'rgba(255,255,255,0.1)', borderRadius: '12px' }}>
                <IndianRupee size={20} />
              </div>
              <div style={{ fontSize: '11px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', opacity: 0.8 }}>Total Portfolio Revenue</div>
           </div>
           <div className={styles.cardValue} style={{ color: 'white' }}>
             {bookingDataLoading ? "Loading..." : `₹${totalEarnings.toLocaleString('en-IN')}`}
           </div>
        </div>

        <div className={styles.glassCard}>
           <div style={{ display: 'flex', gap: '16px', alignItems: 'center', marginBottom: '20px' }}>
              <div style={{ padding: '10px', background: '#f4f8ff', borderRadius: '12px', color: '#165dcc' }}>
                <Calendar size={20} />
              </div>
              <div style={{ fontSize: '11px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(14,43,87,0.5)' }}>Total Guest Stays</div>
           </div>
           <div className={styles.cardValue}>
             {bookingDataLoading ? "Loading..." : <>{totalStays} <span style={{ fontSize: '14px', opacity: 0.5 }}>Check-ins</span></>}
           </div>
        </div>
      </div>

      <div className={styles.glassCard} style={{ padding: '24px 28px', background: 'linear-gradient(180deg, #f8fbff, #ffffff)', border: '1px solid rgba(191, 219, 254, 0.7)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#1d4ed8' }}>Room capacity snapshot</div>
            <h3 style={{ margin: '6px 0 0', fontSize: '18px', fontWeight: 900, color: '#0f172a' }}>
              {!roomsLoadedOnce
                ? "Loading room capacity..."
                : roomStats.activeRooms > 0
                  ? `${roomStats.activeCapacity} guests can be hosted right now`
                  : "No active room capacity yet"}
            </h3>
            <p style={{ margin: '6px 0 0', fontSize: '13px', fontWeight: 600, color: 'rgba(15,23,42,0.68)' }}>
              {!roomsLoadedOnce
                ? "We are pulling your latest room setup now."
                : roomStats.activeRooms > 0
                  ? `You have ${roomStats.activeRooms} active room${roomStats.activeRooms === 1 ? "" : "s"} and ${roomStats.totalCapacity} guests of total room inventory.`
                  : "Turn on at least one room to make the listing guest-ready."}
            </p>
          </div>
          <div style={{ display: 'grid', gap: '8px', gridTemplateColumns: 'repeat(2, minmax(120px, 1fr))' }}>
            <div style={{ padding: '12px 14px', borderRadius: '14px', background: '#eff6ff', border: '1px solid rgba(59, 130, 246, 0.12)' }}>
              <div style={{ fontSize: '11px', fontWeight: 900, textTransform: 'uppercase', color: '#1d4ed8' }}>Active rooms</div>
              <div style={{ marginTop: '4px', fontSize: '18px', fontWeight: 900, color: '#0f172a' }}>{roomsLoadedOnce ? roomStats.activeRooms : "..."}</div>
            </div>
            <div style={{ padding: '12px 14px', borderRadius: '14px', background: '#ecfdf5', border: '1px solid rgba(16, 185, 129, 0.12)' }}>
              <div style={{ fontSize: '11px', fontWeight: 900, textTransform: 'uppercase', color: '#166534' }}>Active capacity</div>
              <div style={{ marginTop: '4px', fontSize: '18px', fontWeight: 900, color: '#0f172a' }}>{roomsLoadedOnce ? roomStats.activeCapacity : "..."}</div>
            </div>
          </div>
        </div>
        {roomsLoadedOnce && roomStats.activeCapacity === 0 && roomStats.totalCapacity > 0 ? (
          <div style={{ marginTop: '14px', display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              className={styles.secondaryBtn}
              onClick={() => {
                if (firstInactiveRoom) {
                  activateRoom(firstInactiveRoom.id);
                } else {
                  addRoom();
                }
              }}
              style={{ minWidth: 'auto', paddingInline: '14px' }}
            >
              {firstInactiveRoom ? `Activate ${firstInactiveRoom.name}` : "Add a room"}
            </button>
            <span style={{ fontSize: '12px', color: 'rgba(15,23,42,0.68)', fontWeight: 600 }}>
              {firstInactiveRoom
                ? `Turn on ${firstInactiveRoom.name} to make the listing bookable.`
                : "Create a room to start accepting guests."}
            </span>
          </div>
        ) : null}
      </div>

      {/* 4. QUICK ACTIONS */}
      <div className={styles.gridCols3}>
        <div className={styles.actionCard} onClick={() => onNavigate('profile')}>
           <div className={styles.actionIcon} style={{ background: '#fef3c7', color: '#d97706' }}>
             <User size={24} />
           </div>
           <div className={styles.actionContent}>
             <h4>Update Profile</h4>
             <p>Change your bio, hobbies, or selfie for guest trust.</p>
           </div>
        </div>
        
        <div className={styles.actionCard} onClick={() => onNavigate('calendar')}>
           <div className={styles.actionIcon} style={{ background: '#f0fdf4', color: '#16a34a' }}>
             <Calendar size={24} />
           </div>
           <div className={styles.actionContent}>
             <h4>Manage Dates</h4>
             <p>Block specific days if you are away or busy.</p>
           </div>
        </div>

        <div 
          className={styles.actionCard} 
          onClick={() => window.open(listingPreviewUrl, "_blank", "noopener,noreferrer")}
        >
           <div className={styles.actionIcon} style={{ background: '#eff6ff', color: '#2563eb' }}>
             <Eye size={24} />
           </div>
           <div className={styles.actionContent}>
             <h4>View Listing</h4>
             <p>See how guests see your home in the app.</p>
           </div>
        </div>
      </div>
    </div>
  );
}
