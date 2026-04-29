import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import styles from "../dashboard.module.css";
import { 
  Users, Calendar, IndianRupee,
  Clock, CheckCircle2, User, Eye,
  Plus, Trash2, RefreshCw, ShieldCheck, Upload, Check, Loader2, MapPin
} from "lucide-react";
import type { StayUnitRecord } from "@/lib/stay-units";
import { normalizeAmenityList, ROOM_AMENITY_OPTIONS } from "@/lib/room-amenities";
import { buildHomestayPath } from "@/lib/slug";
import ChannelManagerTab from "./ChannelManagerTab";

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
  mounted?: boolean;
  viewMode?: "dashboard" | "rooms";
  homeLat?: number;
  homeLng?: number;
}

type RoomFormState = {
  id: string;
  unitKey: string;
  name: string;
  unitType: string;
  description: string;
  maxGuests: string;
  bedInfo: string;
  bathroomType: string;
  roomSizeSqm: string;
  lat: string;
  lng: string;
  priceMorning: string;
  priceAfternoon: string;
  priceEvening: string;
  priceFullday: string;
  quarterEnabled: boolean;
  isActive: boolean;
  isPrimary: boolean;
  amenities: string;
  photos: string;
  localityPhotos: string;
  sortOrder: string;
  source: "database" | "fallback";
};

function parsePhotoList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function serializePhotoList(values: string[]): string {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).join(", ");
}

function formatUnitType(value: string): string {
  return (value || "private_room").replace(/_/g, " ");
}

function hasText(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function hasListItems(value: unknown): boolean {
  return typeof value === "string" ? value.split(",").some((item) => item.trim().length > 0) : false;
}

function parseCsvList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function serializeCsvList(values: string[]): string {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).join(", ");
}

function getSmartPricingMidpoint(priceMorning: string, priceEvening: string): string {
  const morning = Number(priceMorning);
  const evening = Number(priceEvening);

  if (!Number.isFinite(morning) || !Number.isFinite(evening)) {
    return "0";
  }

  return String(Math.round((Math.max(0, morning) + Math.max(0, evening)) / 2));
}

function roomToForm(room: StayUnitRecord): RoomFormState {
  const amenities = normalizeAmenityList(Array.isArray(room.amenities) ? room.amenities : []);
  const photos = Array.isArray(room.photos) ? room.photos : [];
  const localityPhotos = Array.isArray(room.localityPhotos) ? room.localityPhotos : [];

  return {
    id: room.id,
    unitKey: room.unitKey,
    name: room.name,
    unitType: room.unitType || "private_room",
    description: room.description ?? "",
    maxGuests: String(room.maxGuests),
    bedInfo: room.bedInfo ?? "",
    bathroomType: room.bathroomType ?? "",
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
    amenities: amenities.join(", "),
    photos: photos.join(", "),
    localityPhotos: localityPhotos.join(", "),
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
  viewMode = "dashboard",
  homeLat,
  homeLng,
}: DashboardTabProps) {
  const isRoomsView = viewMode === "rooms";
  const liveStatus = schedule.isActive ? "Listing Active" : "Listing Inactive";
  const [roomDrafts, setRoomDrafts] = useState<RoomFormState[]>([]);
  const [roomsLoading, setRoomsLoading] = useState(false);
  const [roomsSaving, setRoomsSaving] = useState(false);
  const [roomsMessage, setRoomsMessage] = useState<string | null>(null);
  const [customAmenityDrafts, setCustomAmenityDrafts] = useState<Record<string, string>>({});
  const [detectingRoomLocationId, setDetectingRoomLocationId] = useState<string>("");

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
    profile?.hostDisplayName || listing?.propertyName || listing?.listingTitle || "Homestay",
    profile?.locality || listing?.locality || null,
    profile?.city || listing?.city || null,
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

    async function loadRooms(): Promise<void> {
      setRoomsLoading(true);
      setRoomsMessage(null);
      try {
        const response = await fetch(`/api/host/stay-units?familyId=${encodeURIComponent(familyId)}`);
        const payload = (await response.json()) as { stayUnits?: StayUnitRecord[]; error?: string };
        if (!response.ok) {
          throw new Error(payload.error ?? "Failed to load rooms.");
        }

        if (!cancelled) {
          const nextRooms = Array.isArray(payload.stayUnits) ? payload.stayUnits.map(roomToForm) : [];
          setRoomDrafts(nextRooms.length > 0 ? nextRooms : [createBlankRoom(true)]);
        }
      } catch (error) {
        if (!cancelled) {
          setRoomDrafts((current) => (current.length > 0 ? current : [createBlankRoom(true)]));
          setRoomsMessage(error instanceof Error ? error.message : "Failed to load rooms.");
        }
      } finally {
        if (!cancelled) {
          setRoomsLoading(false);
        }
      }
    }

    void loadRooms();

    return () => {
      cancelled = true;
    };
  }, [familyId]);

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
    await persistVisibility({
      bookingRequiresHostApproval: nextValue,
    });
  };

  const updateRoomField = (roomId: string, field: keyof RoomFormState, value: string | boolean): void => {
    setRoomDrafts((current) =>
      current.map((room) => {
        if (room.id !== roomId) return room;

        const nextRoom = { ...room, [field]: value } as RoomFormState;
        if (nextRoom.quarterEnabled && (field === "priceMorning" || field === "priceEvening" || field === "quarterEnabled")) {
          nextRoom.priceAfternoon = getSmartPricingMidpoint(nextRoom.priceMorning, nextRoom.priceEvening);
        }

        return nextRoom;
      })
    );
  };

  const toggleRoomActive = async (roomId: string, nextActive: boolean): Promise<void> => {
    const target = roomDrafts.find((room) => room.id === roomId);
    if (!target) return;

    const nextRoom = { ...target, isActive: nextActive };
    setRoomDrafts((current) => current.map((room) => (room.id === roomId ? nextRoom : room)));
    await saveRoom(nextRoom);
  };

  const updateRoomAmenities = (roomId: string, nextAmenities: string[]): void => {
    const nextValue = serializeCsvList(normalizeAmenityList(nextAmenities));
    updateRoomField(roomId, "amenities", nextValue);
  };

  const setRoomLocationFromHome = (roomId: string): void => {
    if (!Number.isFinite(homeLat) || !Number.isFinite(homeLng)) return;
    updateRoomField(roomId, "lat", String(homeLat));
    updateRoomField(roomId, "lng", String(homeLng));
  };

  const detectRoomLocation = (roomId: string): void => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setRoomsMessage("Auto-detect location is not available in this browser.");
      return;
    }

    setDetectingRoomLocationId(roomId);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        updateRoomField(roomId, "lat", String(position.coords.latitude));
        updateRoomField(roomId, "lng", String(position.coords.longitude));
        setRoomsMessage("Room location detected from your device.");
        setDetectingRoomLocationId("");
      },
      () => {
        setRoomsMessage("Could not detect location. Please allow location access.");
        setDetectingRoomLocationId("");
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  };

  const toggleAmenity = (roomId: string, amenity: string): void => {
    const currentRoom = roomDrafts.find((room) => room.id === roomId);
    if (!currentRoom) return;

    const currentAmenities = parseCsvList(currentRoom.amenities);
    const normalized = amenity.trim();
    const nextAmenities = currentAmenities.includes(normalized)
      ? currentAmenities.filter((item) => item !== normalized)
      : [...currentAmenities, normalized];
    updateRoomAmenities(roomId, nextAmenities);
  };

  const addCustomAmenity = (roomId: string): void => {
    const draft = customAmenityDrafts[roomId]?.trim();
    if (!draft) return;

    const currentRoom = roomDrafts.find((room) => room.id === roomId);
    if (!currentRoom) return;

    const currentAmenities = parseCsvList(currentRoom.amenities);
    if (!currentAmenities.includes(draft)) {
      updateRoomAmenities(roomId, [...currentAmenities, draft]);
    }

    setCustomAmenityDrafts((current) => ({ ...current, [roomId]: "" }));
  };

  const addRoom = (): void => {
    setRoomDrafts((current) => [...current, createBlankRoom(current.length === 0)]);
    setRoomsMessage(null);
  };

  const removeRoom = async (roomId: string): Promise<void> => {
    const target = roomDrafts.find((room) => room.id === roomId);
    if (!target) return;

    if (target.id.startsWith("temp-")) {
      setRoomDrafts((current) => current.filter((room) => room.id !== roomId));
      return;
    }

    if (roomDrafts.length <= 1) {
      setRoomsMessage("Keep at least one room card in the dashboard.");
      return;
    }

    setRoomsSaving(true);
    setRoomsMessage(null);
    try {
      const response = await fetch("/api/host/stay-units", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ familyId, unitId: roomId }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to delete room.");
      }
      setRoomDrafts((current) => current.filter((room) => room.id !== roomId));
    } catch (error) {
      setRoomsMessage(error instanceof Error ? error.message : "Failed to delete room.");
    } finally {
      setRoomsSaving(false);
    }
  };

  const saveRoom = async (room: RoomFormState): Promise<void> => {
    setRoomsSaving(true);
    setRoomsMessage(null);
    try {
      const normalizedAmenities = normalizeAmenityList(parseCsvList(room.amenities));
      const normalizedPhotos = parseCsvList(room.photos);
      const normalizedLocalityPhotos = parseCsvList(room.localityPhotos);
      const normalizedPriceAfternoon = room.quarterEnabled
        ? getSmartPricingMidpoint(room.priceMorning, room.priceEvening)
        : room.priceAfternoon;
      const normalizedLat = room.lat.trim().length > 0 ? Number(room.lat) : null;
      const normalizedLng = room.lng.trim().length > 0 ? Number(room.lng) : null;

      const response = await fetch("/api/host/stay-units", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          familyId,
          clientId: room.id,
          unit: {
            id: room.id.startsWith("temp-") ? undefined : room.id,
            unitKey: room.unitKey,
            name: room.name,
            unitType: room.unitType,
            description: room.description,
            maxGuests: room.maxGuests,
            bedInfo: room.bedInfo,
            bathroomType: room.bathroomType,
            roomSizeSqm: room.roomSizeSqm,
            lat: normalizedLat,
            lng: normalizedLng,
            priceMorning: room.priceMorning,
            priceAfternoon: normalizedPriceAfternoon,
            priceEvening: room.priceEvening,
            priceFullday: room.priceFullday,
            quarterEnabled: room.quarterEnabled,
            isActive: room.isActive,
            isPrimary: room.isPrimary,
            amenities: normalizedAmenities,
            photos: normalizedPhotos,
            localityPhotos: normalizedLocalityPhotos,
            sortOrder: room.sortOrder,
          },
        }),
      });

      const payload = (await response.json()) as { stayUnit?: StayUnitRecord; clientId?: string; error?: string };
      if (!response.ok || !payload.stayUnit) {
        throw new Error(payload.error ?? "Failed to save room.");
      }

      const previousId = payload.clientId ?? room.id;
      setRoomDrafts((current) =>
        current.map((item) =>
          item.id === previousId
            ? roomToForm(payload.stayUnit as StayUnitRecord)
            : payload.stayUnit?.isPrimary && item.id !== room.id
              ? { ...item, isPrimary: false }
              : item
        )
      );
      setRoomsMessage("Room saved.");
    } catch (error) {
      setRoomsMessage(error instanceof Error ? error.message : "Failed to save room.");
    } finally {
      setRoomsSaving(false);
    }
  };

  const uploadRoomPhotos = async (roomId: string, files: FileList | null): Promise<void> => {
    if (!files || files.length === 0) return;
    if (roomId.startsWith("temp-")) {
      setRoomsMessage("Save the room once before uploading photos.");
      return;
    }

    setRoomsSaving(true);
    setRoomsMessage(null);

    try {
      const formData = new FormData();
      formData.append("familyId", familyId);
      formData.append("unitId", roomId);
      formData.append("kind", "room");
      Array.from(files).forEach((file) => formData.append("photos", file));

      const response = await fetch("/api/host/stay-units/upload-photos", {
        method: "POST",
        body: formData,
      });

      const payload = (await response.json()) as { stayUnit?: StayUnitRecord; photoUrls?: string[]; error?: string };
      if (!response.ok || !payload.stayUnit) {
        throw new Error(payload.error ?? "Failed to upload room photos.");
      }

      setRoomDrafts((current) =>
        current.map((room) =>
          room.id === roomId
            ? {
                ...roomToForm(payload.stayUnit as StayUnitRecord),
                photos: (payload.photoUrls ?? []).join(", "),
              }
            : room
        )
      );
      setRoomsMessage("Room photos uploaded.");
    } catch (error) {
      setRoomsMessage(error instanceof Error ? error.message : "Failed to upload room photos.");
    } finally {
      setRoomsSaving(false);
    }
  };

  const uploadLocalityPhotos = async (roomId: string, files: FileList | null): Promise<void> => {
    if (!files || files.length === 0) return;
    if (roomId.startsWith("temp-")) {
      setRoomsMessage("Save the room once before uploading locality photos.");
      return;
    }

    setRoomsSaving(true);
    setRoomsMessage(null);

    try {
      const formData = new FormData();
      formData.append("familyId", familyId);
      formData.append("unitId", roomId);
      formData.append("kind", "locality");
      Array.from(files).forEach((file) => formData.append("photos", file));

      const response = await fetch("/api/host/stay-units/upload-photos", {
        method: "POST",
        body: formData,
      });

      const payload = (await response.json()) as { stayUnit?: StayUnitRecord; photoUrls?: string[]; error?: string };
      if (!response.ok || !payload.stayUnit) {
        throw new Error(payload.error ?? "Failed to upload locality photos.");
      }

      setRoomDrafts((current) =>
        current.map((room) =>
          room.id === roomId
            ? {
                ...roomToForm(payload.stayUnit as StayUnitRecord),
                localityPhotos: (payload.photoUrls ?? []).join(", "),
              }
            : room
        )
      );
      setRoomsMessage("Locality photos uploaded.");
    } catch (error) {
      setRoomsMessage(error instanceof Error ? error.message : "Failed to upload locality photos.");
    } finally {
      setRoomsSaving(false);
    }
  };

  const promoteRoomPhoto = async (roomId: string, photo: string): Promise<void> => {
    const normalizedPhoto = photo.trim();
    if (!normalizedPhoto) return;

    const currentRoom = roomDrafts.find((room) => room.id === roomId);
    if (!currentRoom) return;

    const nextPhotos = [normalizedPhoto, ...parsePhotoList(currentRoom.photos).filter((item) => item !== normalizedPhoto)];
    const nextRoom = { ...currentRoom, photos: serializePhotoList(nextPhotos) };

    setRoomDrafts((current) =>
      current.map((room) => (room.id === roomId ? nextRoom : room))
    );
    await saveRoom(nextRoom);
  };

  const removeRoomPhoto = async (roomId: string, photo: string, kind: "room" | "locality" = "room"): Promise<void> => {
    const normalizedPhoto = photo.trim();
    if (!normalizedPhoto) return;

    const currentRoom = roomDrafts.find((room) => room.id === roomId);
    if (!currentRoom) return;

    const nextPhotos = kind === "locality"
      ? parsePhotoList(currentRoom.localityPhotos).filter((item) => item !== normalizedPhoto)
      : parsePhotoList(currentRoom.photos).filter((item) => item !== normalizedPhoto);
    const nextRoom = kind === "locality"
      ? { ...currentRoom, localityPhotos: serializePhotoList(nextPhotos) }
      : { ...currentRoom, photos: serializePhotoList(nextPhotos) };

    setRoomDrafts((current) =>
      current.map((room) => (room.id === roomId ? nextRoom : room))
    );

    if (roomId.startsWith("temp-")) {
      return;
    }

    await saveRoom(nextRoom);
  };

  const setPrimaryRoom = (roomId: string): void => {
    setRoomDrafts((current) => current.map((room) => ({ ...room, isPrimary: room.id === roomId })));
  };

  const activateRoom = (roomId: string): void => {
    setRoomDrafts((current) => current.map((room) => (room.id === roomId ? { ...room, isActive: true } : room)));
    setRoomsMessage(null);
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
      <div className={`${styles.flexCol} ${styles.animateIn}`} style={{ gap: "32px" }}>
        <section className={styles.glassCard} style={{ padding: "36px", borderRadius: "28px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "16px", flexWrap: "wrap" }}>
            <div style={{ display: "grid", gap: "8px" }}>
              <div className={styles.cardTitle} style={{ margin: 0, color: "#0e2b57" }}>ROOM EDITOR</div>
              <h2 style={{ margin: 0, fontSize: "30px", fontWeight: 900, color: "#0f172a" }}>Edit room details and availability</h2>
              <p style={{ margin: 0, maxWidth: "720px", fontSize: "14px", lineHeight: 1.7, color: "rgba(14,43,87,0.7)", fontWeight: 600 }}>
                Update room details here, then use the public room page link to preview how guests will see it.
              </p>
            </div>
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <div style={{ fontSize: "12px", fontWeight: 800, color: "#0e2b57", background: "#eff6ff", padding: "10px 14px", borderRadius: "999px" }}>
                {roomStats.activeRooms} open
              </div>
              <div style={{ fontSize: "12px", fontWeight: 800, color: "#0e2b57", background: "#f8fafc", padding: "10px 14px", borderRadius: "999px" }}>
                {roomDrafts.length} total
              </div>
              <button
                type="button"
                className={styles.primaryBtn}
                style={{ width: "auto", minWidth: "auto", padding: "10px 16px", borderRadius: "14px", background: "#f8fafc", color: "#0f172a" }}
                onClick={() => void (async () => {
                  setRoomsLoading(true);
                  try {
                    const response = await fetch(`/api/host/stay-units?familyId=${encodeURIComponent(familyId)}`);
                    const payload = (await response.json()) as { stayUnits?: StayUnitRecord[]; error?: string };
                    if (!response.ok) throw new Error(payload.error ?? "Failed to load rooms.");
                    setRoomDrafts(Array.isArray(payload.stayUnits) && payload.stayUnits.length > 0 ? payload.stayUnits.map(roomToForm) : [createBlankRoom(true)]);
                  } catch (error) {
                    setRoomsMessage(error instanceof Error ? error.message : "Failed to load rooms.");
                  } finally {
                    setRoomsLoading(false);
                  }
                })()}
                disabled={roomsSaving}
              >
                <RefreshCw size={16} />
                Refresh
              </button>
              <button
                type="button"
                className={styles.primaryBtn}
                style={{ width: "auto", minWidth: "auto", padding: "10px 16px", borderRadius: "14px" }}
                onClick={addRoom}
                disabled={roomsSaving}
              >
                <Plus size={16} />
                Add room
              </button>
            </div>
          </div>

          {roomsMessage ? (
            <div style={{ marginTop: "18px", fontSize: "13px", fontWeight: 700, color: roomsMessage === "Room saved." ? "#166534" : "#b91c1c", background: roomsMessage === "Room saved." ? "#f0fdf4" : "#fef2f2", padding: "10px 14px", borderRadius: "12px" }}>
              {roomsMessage}
            </div>
          ) : null}
        </section>

        <section id="dashboard-rooms" className={styles.glassCard} style={{ padding: "32px" }}>
          {roomsLoading && roomDrafts.length === 0 ? (
            <div style={{ fontSize: "14px", color: "rgba(14,43,87,0.68)", fontWeight: 700 }}>Loading rooms...</div>
          ) : null}

        <div style={{ display: 'grid', gap: '20px', minWidth: 0 }}>
          {roomDrafts.map((room, index) => {
            const roomPhotos = parseCsvList(room.photos);
            const localityPhotos = parseCsvList(room.localityPhotos);
            const amenityValues = parseCsvList(room.amenities);
            const customAmenityValues = amenityValues.filter(
              (amenity) => !ROOM_AMENITY_OPTIONS.includes(amenity as (typeof ROOM_AMENITY_OPTIONS)[number])
            );
            const customAmenityValue = customAmenityDrafts[room.id] ?? "";
            const hasRoomLocation = room.lat.trim().length > 0 && room.lng.trim().length > 0;
            const smartPriceMidpoint = getSmartPricingMidpoint(room.priceMorning, room.priceEvening);
            const canManageRoomCalendar = !room.id.startsWith("temp-");

            return (
              <article key={room.id} style={{ border: '1px solid #e2e8f0', borderRadius: '24px', background: '#fff', overflow: 'hidden', boxShadow: '0 4px 24px rgba(15,23,42,0.07)', minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', padding: '16px 20px', minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', minWidth: 0 }}>
                    <span style={{ fontSize: '12px', fontWeight: 900, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#64748b' }}>Room {index + 1}</span>
                    <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#0f172a', minWidth: 0, wordBreak: 'break-word' }}>{room.name || 'Untitled room'}</h4>
                    {room.isPrimary ? <span style={{ fontSize: '11px', fontWeight: 900, textTransform: 'uppercase', background: '#ecfdf5', color: '#166534', padding: '3px 10px', borderRadius: '999px' }}>Primary</span> : null}
                    {room.isActive ? <span style={{ fontSize: '11px', fontWeight: 900, textTransform: 'uppercase', background: '#eff6ff', color: '#1d4ed8', padding: '3px 10px', borderRadius: '999px' }}>Open</span> : <span style={{ fontSize: '11px', fontWeight: 900, textTransform: 'uppercase', background: '#fef2f2', color: '#b91c1c', padding: '3px 10px', borderRadius: '999px' }}>Closed</span>}
                    <span style={{ fontSize: '11px', fontWeight: 900, textTransform: 'uppercase', background: room.quarterEnabled ? '#ecfeff' : '#f8fafc', color: room.quarterEnabled ? '#0f766e' : '#475569', padding: '3px 10px', borderRadius: '999px' }}>
                      {room.quarterEnabled ? 'Smart pricing on' : 'Smart pricing off'}
                    </span>
                    <span style={{ fontSize: '11px', fontWeight: 900, textTransform: 'uppercase', background: hasRoomLocation ? '#ecfdf5' : '#fff7ed', color: hasRoomLocation ? '#166534' : '#9a3412', padding: '3px 10px', borderRadius: '999px' }}>
                      {hasRoomLocation ? 'Location set' : 'No room location'}
                    </span>
                    <span style={{ fontSize: '11px', fontWeight: 900, textTransform: 'uppercase', background: roomPhotos.length > 0 ? '#ecfdf5' : '#fff7ed', color: roomPhotos.length > 0 ? '#166534' : '#9a3412', padding: '3px 10px', borderRadius: '999px' }}>
                      {roomPhotos.length > 0 ? `${roomPhotos.length} photos` : 'No photos yet'}
                    </span>
                    {localityPhotos.length > 0 ? <span style={{ fontSize: '11px', fontWeight: 900, textTransform: 'uppercase', background: '#f5f3ff', color: '#6d28d9', padding: '3px 10px', borderRadius: '999px' }}>{localityPhotos.length} locality</span> : null}
                  </div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', minWidth: 0 }}>
                    <button type="button" className={styles.secondaryBtn} onClick={() => setPrimaryRoom(room.id)} disabled={roomsSaving} style={{ background: '#ecfdf5', color: '#166534', borderColor: 'rgba(22,163,74,0.16)', width: 'auto', minWidth: 'auto', padding: '9px 14px', borderRadius: '999px' }}>
                      <ShieldCheck size={14} />
                      Make primary
                    </button>
                    <button type="button" className={styles.secondaryBtn} onClick={() => void toggleRoomActive(room.id, !room.isActive)} disabled={roomsSaving} style={{ background: room.isActive ? '#ecfdf5' : '#fff7ed', color: room.isActive ? '#166534' : '#9a3412', borderColor: room.isActive ? 'rgba(22,163,74,0.16)' : 'rgba(249,115,22,0.18)', width: 'auto', minWidth: 'auto', padding: '9px 14px', borderRadius: '999px' }}>
                      {room.isActive ? 'Turn off' : 'Turn on'}
                    </button>
                  </div>
                </div>

                <div style={{ padding: '22px', display: 'grid', gap: '24px', minWidth: 0, overflow: 'hidden' }}>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                    <Link
                      href={`/host/${familyId}/room/${room.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className={styles.secondaryBtn}
                      style={{ width: 'auto', minWidth: 'auto', padding: '9px 14px', borderRadius: '999px', textDecoration: 'none' }}
                    >
                      View room page
                    </Link>
                    <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 700 }}>
                      {formatUnitType(room.unitType)} · {roomPhotos.length} photos · {amenityValues.length} amenities
                    </span>
                  </div>

                  <div style={{ display: 'grid', gap: '14px', minWidth: 0 }}>
                    <div style={{ fontSize: '11px', fontWeight: 900, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#1d4ed8' }}>Room identity</div>
                    <div className={styles.gridCols2} style={{ gap: '14px', minWidth: 0 }}>
                      <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: 0 }}>
                        <span style={{ fontSize: '11px', fontWeight: 900, color: 'rgba(14,43,87,0.6)', textTransform: 'uppercase' }}>Room name</span>
                        <input className={styles.inputField} value={room.name} onChange={(event) => updateRoomField(room.id, 'name', event.target.value)} />
                      </label>
                      <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: 0 }}>
                        <span style={{ fontSize: '11px', fontWeight: 900, color: 'rgba(14,43,87,0.6)', textTransform: 'uppercase' }}>Room type</span>
                        <select className={styles.inputField} value={room.unitType} onChange={(event) => updateRoomField(room.id, 'unitType', event.target.value)}>
                          <option value="private_room">Private room</option>
                          <option value="deluxe_room">Deluxe room</option>
                          <option value="standard_room">Standard room</option>
                          <option value="family_room">Family room</option>
                          <option value="entire_home">Entire home</option>
                        </select>
                      </label>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gap: '14px', minWidth: 0 }}>
                    <div style={{ fontSize: '11px', fontWeight: 900, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#1d4ed8' }}>Room details</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '14px', minWidth: 0 }}>
                      <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: 0 }}>
                        <span style={{ fontSize: '11px', fontWeight: 900, color: 'rgba(14,43,87,0.6)', textTransform: 'uppercase' }}>Max guests</span>
                        <input className={styles.inputField} type="number" min="1" value={room.maxGuests} onChange={(event) => updateRoomField(room.id, 'maxGuests', event.target.value)} />
                      </label>
                      <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: 0 }}>
                        <span style={{ fontSize: '11px', fontWeight: 900, color: 'rgba(14,43,87,0.6)', textTransform: 'uppercase' }}>Bed info</span>
                        <input className={styles.inputField} value={room.bedInfo} onChange={(event) => updateRoomField(room.id, 'bedInfo', event.target.value)} />
                      </label>
                      <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: 0 }}>
                        <span style={{ fontSize: '11px', fontWeight: 900, color: 'rgba(14,43,87,0.6)', textTransform: 'uppercase' }}>Bathroom type</span>
                        <input className={styles.inputField} value={room.bathroomType} onChange={(event) => updateRoomField(room.id, 'bathroomType', event.target.value)} />
                      </label>
                      <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: 0 }}>
                        <span style={{ fontSize: '11px', fontWeight: 900, color: 'rgba(14,43,87,0.6)', textTransform: 'uppercase' }}>Room size (sqm)</span>
                        <input className={styles.inputField} type="number" min="0" value={room.roomSizeSqm} onChange={(event) => updateRoomField(room.id, 'roomSizeSqm', event.target.value)} />
                      </label>
                    </div>

                    <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: 0 }}>
                      <span style={{ fontSize: '11px', fontWeight: 900, color: 'rgba(14,43,87,0.6)', textTransform: 'uppercase' }}>Description</span>
                      <textarea className={styles.inputField} rows={3} value={room.description} onChange={(event) => updateRoomField(room.id, 'description', event.target.value)} style={{ wordBreak: 'break-word' }} />
                    </label>
                  </div>

                  <div style={{ display: 'grid', gap: '10px', minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', minWidth: 0 }}>
                      <MapPin size={14} color="#1d4ed8" />
                      <span style={{ fontSize: '11px', fontWeight: 900, color: '#1d4ed8', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Room location</span>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: '#64748b' }}>Approximate only. Used for the room map.</span>
                    </div>
                    <div className={styles.gridCols2} style={{ gap: '14px', minWidth: 0 }}>
                      <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: 0 }}>
                        <span style={{ fontSize: '11px', fontWeight: 900, color: 'rgba(14,43,87,0.6)', textTransform: 'uppercase' }}>Latitude</span>
                        <input className={styles.inputField} inputMode="decimal" placeholder="28.613939" value={room.lat} onChange={(event) => updateRoomField(room.id, 'lat', event.target.value)} />
                      </label>
                      <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: 0 }}>
                        <span style={{ fontSize: '11px', fontWeight: 900, color: 'rgba(14,43,87,0.6)', textTransform: 'uppercase' }}>Longitude</span>
                        <input className={styles.inputField} inputMode="decimal" placeholder="77.209021" value={room.lng} onChange={(event) => updateRoomField(room.id, 'lng', event.target.value)} />
                      </label>
                    </div>
                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center', minWidth: 0 }}>
                      <button
                        type="button"
                        className={styles.secondaryBtn}
                        onClick={() => setRoomLocationFromHome(room.id)}
                        disabled={roomsSaving || !Number.isFinite(homeLat) || !Number.isFinite(homeLng)}
                        style={{ width: 'auto', minWidth: 'auto', padding: '12px 16px', borderRadius: '14px' }}
                      >
                        Use home location
                      </button>
                      <button
                        type="button"
                        className={styles.secondaryBtn}
                        onClick={() => void detectRoomLocation(room.id)}
                        disabled={roomsSaving || detectingRoomLocationId === room.id}
                        style={{ width: 'auto', minWidth: 'auto', padding: '12px 16px', borderRadius: '14px' }}
                      >
                        {detectingRoomLocationId === room.id ? <Loader2 size={14} className="animate-spin" /> : <MapPin size={14} />}
                        {detectingRoomLocationId === room.id ? 'Detecting...' : 'Auto detect location'}
                      </button>
                      <button
                        type="button"
                        className={styles.secondaryBtn}
                        onClick={() => {
                          updateRoomField(room.id, 'lat', '');
                          updateRoomField(room.id, 'lng', '');
                        }}
                        disabled={roomsSaving}
                        style={{ width: 'auto', minWidth: 'auto', padding: '12px 16px', borderRadius: '14px', background: '#fff', color: '#475569' }}
                      >
                        Clear location
                      </button>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gap: '14px', minWidth: 0 }}>
                    <div style={{ fontSize: '11px', fontWeight: 900, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#1d4ed8' }}>Room calendar & OTA sync</div>
                    {canManageRoomCalendar ? (
                      <div style={{ border: '1px solid #e2e8f0', borderRadius: '18px', padding: '18px', background: '#f8fafc', minWidth: 0 }}>
                        <ChannelManagerTab
                          ownerType="stay_unit"
                          ownerId={room.id}
                          title={`${room.name || `Room ${index + 1}`} Calendar`}
                          description="Connect Airbnb, Booking.com, Google Calendar, or any ICS feed for this room only. Imports and exports stay attached to this room calendar."
                        />
                      </div>
                    ) : (
                      <div style={{ padding: '14px 16px', borderRadius: '14px', background: '#fff7ed', color: '#9a3412', fontSize: '13px', fontWeight: 700 }}>
                        Save this room once to unlock its separate iCal and OTA sync links.
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'grid', gap: '10px', minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', minWidth: 0 }}>
                      <span style={{ fontSize: '11px', fontWeight: 900, color: 'rgba(14,43,87,0.6)', textTransform: 'uppercase' }}>Amenities</span>
                      <span style={{ fontSize: '12px', fontWeight: 800, color: '#0f172a' }}>{amenityValues.length} selected</span>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', minWidth: 0 }}>
                      {ROOM_AMENITY_OPTIONS.map((amenity) => {
                        const active = amenityValues.includes(amenity);
                        return (
                          <button
                            key={amenity}
                            type="button"
                            onClick={() => toggleAmenity(room.id, amenity)}
                            disabled={roomsSaving}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              padding: '8px 12px',
                              borderRadius: '999px',
                              border: `1px solid ${active ? 'rgba(22,93,204,0.26)' : 'rgba(14,43,87,0.08)'}`,
                              background: active ? '#eff6ff' : '#f8fafc',
                              color: active ? '#165dcc' : '#334155',
                              fontSize: '12px',
                              fontWeight: 800,
                              cursor: roomsSaving ? 'not-allowed' : 'pointer',
                              minWidth: 0,
                            }}
                          >
                            {active ? <Check size={12} /> : null}
                            {amenity}
                          </button>
                        );
                      })}
                    </div>
                    {customAmenityValues.length > 0 ? (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', minWidth: 0 }}>
                        {customAmenityValues.map((amenity) => (
                          <button
                            key={`${room.id}-${amenity}`}
                            type="button"
                            onClick={() => toggleAmenity(room.id, amenity)}
                            disabled={roomsSaving}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              padding: '8px 12px',
                              borderRadius: '999px',
                              border: '1px solid rgba(124,58,237,0.18)',
                              background: '#faf5ff',
                              color: '#7c3aed',
                              fontSize: '12px',
                              fontWeight: 800,
                              cursor: roomsSaving ? 'not-allowed' : 'pointer',
                              minWidth: 0,
                            }}
                          >
                            <Check size={12} />
                            {amenity}
                          </button>
                        ))}
                      </div>
                    ) : null}
                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', minWidth: 0 }}>
                      <input
                        className={styles.inputField}
                        value={customAmenityValue}
                        onChange={(event) => setCustomAmenityDrafts((current) => ({ ...current, [room.id]: event.target.value }))}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            addCustomAmenity(room.id);
                          }
                        }}
                        placeholder="Add custom amenity"
                        style={{ flex: '1 1 240px', minWidth: 0 }}
                      />
                      <button type="button" className={styles.secondaryBtn} onClick={() => addCustomAmenity(room.id)} disabled={roomsSaving} style={{ width: 'auto', minWidth: 'auto', padding: '14px 16px', borderRadius: '14px' }}>
                        Add custom
                      </button>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gap: '14px', minWidth: 0 }}>
                    <div style={{ fontSize: '11px', fontWeight: 900, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#1d4ed8' }}>Room photos</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', minWidth: 0 }}>
                      <label
                        htmlFor={`room-photo-upload-${room.id}`}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '12px 16px',
                          borderRadius: '14px',
                          background: '#165dcc',
                          color: '#fff',
                          fontSize: '13px',
                          fontWeight: 800,
                          cursor: roomsSaving ? 'not-allowed' : 'pointer',
                        }}
                      >
                        <Upload size={14} />
                        Upload room photos
                      </label>
                      <input id={`room-photo-upload-${room.id}`} accept="image/*" multiple onChange={(event) => void uploadRoomPhotos(room.id, event.target.files)} type="file" style={{ display: 'none' }} />
                      <label
                        htmlFor={`room-locality-upload-${room.id}`}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '12px 16px',
                          borderRadius: '14px',
                          background: '#f8fafc',
                          color: '#0f172a',
                          border: '1px solid #e2e8f0',
                          fontSize: '13px',
                          fontWeight: 800,
                          cursor: roomsSaving ? 'not-allowed' : 'pointer',
                        }}
                      >
                        <Upload size={14} />
                        Upload locality photos
                      </label>
                      <input id={`room-locality-upload-${room.id}`} accept="image/*" multiple onChange={(event) => void uploadLocalityPhotos(room.id, event.target.files)} type="file" style={{ display: 'none' }} />
                    </div>

                    {roomPhotos.length > 0 ? (
                      <div style={{ display: 'grid', gap: '12px', minWidth: 0 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, 150px)', gap: '12px', minWidth: 0, justifyContent: 'flex-start' }}>
                          {roomPhotos.slice(0, 8).map((photo, photoIndex) => (
                            <div key={photo} style={{ borderRadius: '16px', overflow: 'hidden', border: photoIndex === 0 ? '2px solid #0f172a' : '1px solid #e2e8f0', background: '#f8fafc', aspectRatio: '4 / 3', position: 'relative', minWidth: 0 }}>
                              <img src={photo} alt={room.name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                              <div style={{ position: 'absolute', bottom: 8, left: 8, right: 8, display: 'flex', gap: '6px', flexWrap: 'wrap', minWidth: 0 }}>
                                <button type="button" onClick={() => void promoteRoomPhoto(room.id, photo)} disabled={roomsSaving} style={{ padding: '4px 8px', borderRadius: 999, background: photoIndex === 0 ? '#0f172a' : 'rgba(15,23,42,0.82)', color: '#fff', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', border: 'none', cursor: roomsSaving ? 'not-allowed' : 'pointer' }}>
                                  {photoIndex === 0 ? 'Thumbnail' : 'Set thumbnail'}
                                </button>
                                <button type="button" onClick={() => void removeRoomPhoto(room.id, photo)} disabled={roomsSaving} style={{ padding: '4px 8px', borderRadius: 999, background: 'rgba(255,255,255,0.92)', color: '#991b1b', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', border: 'none', cursor: roomsSaving ? 'not-allowed' : 'pointer' }}>
                                  Remove
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                        <p style={{ margin: 0, fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>First photo is the thumbnail shown to guests.</p>
                      </div>
                    ) : null}

                    {localityPhotos.length > 0 ? (
                      <div style={{ display: 'grid', gap: '10px', minWidth: 0 }}>
                        <div style={{ fontSize: '11px', fontWeight: 900, color: '#7c3aed', textTransform: 'uppercase', paddingTop: '12px', borderTop: '1px dashed #e2e8f0' }}>Locality photos</div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, 150px)', gap: '12px', minWidth: 0, justifyContent: 'flex-start' }}>
                          {localityPhotos.slice(0, 8).map((photo) => (
                            <div key={photo} style={{ borderRadius: '16px', overflow: 'hidden', border: '1px solid #e2e8f0', background: '#faf5ff', aspectRatio: '4 / 3', position: 'relative', minWidth: 0 }}>
                              <img src={photo} alt={`${room.name} locality`} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                              <div style={{ position: 'absolute', bottom: 8, left: 8, right: 8 }}>
                                <button type="button" onClick={() => void removeRoomPhoto(room.id, photo, 'locality')} disabled={roomsSaving} style={{ padding: '4px 8px', borderRadius: 999, background: 'rgba(255,255,255,0.92)', color: '#7c3aed', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', border: 'none', cursor: roomsSaving ? 'not-allowed' : 'pointer' }}>
                                  Remove
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <div style={{ display: 'grid', gap: '14px', minWidth: 0 }}>
                    <div style={{ fontSize: '11px', fontWeight: 900, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#1d4ed8' }}>Smart pricing</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '14px', minWidth: 0 }}>
                      <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: 0 }}>
                        <span style={{ fontSize: '11px', fontWeight: 900, color: 'rgba(14,43,87,0.6)', textTransform: 'uppercase' }}>Public room price</span>
                        <input className={styles.inputField} type="number" min="0" value={room.priceFullday} onChange={(event) => updateRoomField(room.id, 'priceFullday', event.target.value)} />
                      </label>
                      <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: 0 }}>
                        <span style={{ fontSize: '11px', fontWeight: 900, color: 'rgba(14,43,87,0.6)', textTransform: 'uppercase' }}>Lower-demand backup</span>
                        <input className={styles.inputField} type="number" min="0" value={room.priceMorning} onChange={(event) => updateRoomField(room.id, 'priceMorning', event.target.value)} />
                      </label>
                      <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: 0 }}>
                        <span style={{ fontSize: '11px', fontWeight: 900, color: 'rgba(14,43,87,0.6)', textTransform: 'uppercase' }}>Higher-demand backup</span>
                        <input className={styles.inputField} type="number" min="0" value={room.priceEvening} onChange={(event) => updateRoomField(room.id, 'priceEvening', event.target.value)} />
                      </label>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', padding: '14px 16px', borderRadius: '16px', background: '#eff6ff', border: '1px solid rgba(37,99,235,0.12)', minWidth: 0 }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: '11px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#1d4ed8' }}>Enable Smart Pricing</div>
                        <div style={{ marginTop: '4px', fontSize: '12px', fontWeight: 700, color: 'rgba(29,78,216,0.78)' }}>
                          We keep a suggested midpoint for reference, but public booking uses the room price first.
                        </div>
                      </div>
                      <label className={styles.iosToggleLabel}>
                        <input type="checkbox" className={styles.iosToggleInput} checked={room.quarterEnabled} onChange={(event) => updateRoomField(room.id, 'quarterEnabled', event.target.checked)} />
                        <div className={styles.iosToggleTrack}>
                          <div className={styles.iosToggleThumb} />
                        </div>
                      </label>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', padding: '14px 16px', borderRadius: '16px', background: '#f8fafc', border: '1px solid #e2e8f0', minWidth: 0 }}>
                      <div>
                        <div style={{ fontSize: '11px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#475569' }}>Suggested midpoint</div>
                        <div style={{ marginTop: '4px', fontSize: '13px', fontWeight: 800, color: '#0f172a' }}>For pricing guidance only</div>
                      </div>
                      <div style={{ fontSize: '18px', fontWeight: 900, color: '#165dcc' }}>₹{smartPriceMidpoint}</div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap', paddingTop: '4px', borderTop: '1px solid #f1f5f9', minWidth: 0 }}>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: 'rgba(14,43,87,0.62)' }}>
                      Save updates the room, while delete removes it from the host dashboard.
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                      {index === roomDrafts.length - 1 ? (
                        <button type="button" className={styles.primaryBtn} style={{ width: 'auto', minWidth: 'auto', padding: '10px 16px', borderRadius: '12px', background: '#f8fafc', color: '#0f172a', fontSize: '13px' }} onClick={addRoom} disabled={roomsSaving}>
                          <Plus size={14} />
                          Add room
                        </button>
                      ) : null}
                      <button type="button" className={styles.primaryBtn} style={{ width: 'auto', minWidth: 'auto', padding: '10px 16px', borderRadius: '12px', fontSize: '13px' }} onClick={() => void saveRoom(room)} disabled={roomsSaving}>
                        {roomsSaving ? 'Saving...' : 'Save'}
                      </button>
                      <button type="button" className={styles.primaryBtn} style={{ width: 'auto', minWidth: 'auto', padding: '10px 16px', borderRadius: '12px', background: '#dc2626', color: '#fff', fontSize: '13px' }} onClick={() => void removeRoom(room.id)} disabled={roomsSaving}>
                        <Trash2 size={14} />
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
        </section>
      </div>
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
               disabled={saving}
             />
             <div className={styles.iosToggleTrack}>
             <div className={styles.iosToggleThumb} />
           </div>
         </label>
        </div>

        <div style={{ marginTop: '16px', background: 'linear-gradient(180deg, #eff6ff, #f8fbff)', padding: '16px 20px', borderRadius: '16px', border: '1px solid rgba(37, 99, 235, 0.14)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ fontSize: '11px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#1d4ed8' }}>Host setup progress</div>
              <div style={{ fontSize: '12px', color: 'rgba(29,78,216,0.78)', fontWeight: 700 }}>
                Profile, listing, schedule, and room details that are already in place.
              </div>
            </div>
            <div style={{ fontSize: '24px', fontWeight: 900, color: '#0f172a' }}>{setupCompletion.percent}%</div>
          </div>
          <div style={{ marginTop: '10px', display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '8px 12px', borderRadius: '999px', background: approvalReadiness.tone === "ready" ? '#ecfdf5' : '#fff7ed', color: approvalReadiness.tone === "ready" ? '#166534' : '#9a3412', fontSize: '11px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            {approvalReadiness.label}
          </div>
          <p style={{ margin: '8px 0 0', fontSize: '12px', color: 'rgba(15,23,42,0.68)', fontWeight: 600 }}>
            {approvalReadiness.description}
          </p>
          {approvalReadiness.tone !== "ready" && missingSetupSummary.length > 0 ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '10px' }}>
              {missingSetupSummary.map((item) => (
                <span
                  key={item}
                  style={{
                    padding: '6px 10px',
                    borderRadius: '999px',
                    background: '#ffffff',
                    border: '1px solid rgba(251, 146, 60, 0.18)',
                    color: '#9a3412',
                    fontSize: '11px',
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                  }}
                >
                  {item}
                </span>
              ))}
            </div>
          ) : null}
          <div style={{ marginTop: '12px', height: '10px', borderRadius: '999px', background: 'rgba(191, 219, 254, 0.7)', overflow: 'hidden' }}>
            <div style={{ width: `${setupCompletion.percent}%`, height: '100%', borderRadius: '999px', background: 'linear-gradient(90deg, #2563eb, #10b981)' }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px', marginTop: '12px' }}>
            {[
              { label: "Profile", missing: setupCompletion.missing.profile, sectionId: "dashboard-visibility" },
              { label: "Listing", missing: setupCompletion.missing.listing, sectionId: "dashboard-summary" },
              { label: "Schedule", missing: setupCompletion.missing.schedule, sectionId: "dashboard-pricing" },
              { label: "Rooms", missing: setupCompletion.missing.rooms, sectionId: "dashboard-rooms" },
            ].map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => scrollToDashboardSection(item.sectionId)}
                style={{ padding: '10px 12px', borderRadius: '12px', background: '#ffffff', border: '1px solid rgba(191, 219, 254, 0.65)', textAlign: 'left', cursor: 'pointer' }}
              >
                <div style={{ fontSize: '11px', fontWeight: 900, textTransform: 'uppercase', color: '#1d4ed8' }}>{item.label}</div>
                <div style={{ marginTop: '4px', fontSize: '12px', fontWeight: 700, color: '#0f172a' }}>
                  {item.missing === 0 ? "Complete" : `${item.missing} item${item.missing === 1 ? "" : "s"} left`}
                </div>
              </button>
            ))}
          </div>
          <div style={{ marginTop: '12px', padding: '12px 14px', borderRadius: '14px', background: '#ffffff', border: '1px solid rgba(191, 219, 254, 0.75)', display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '11px', fontWeight: 900, textTransform: 'uppercase', color: '#1d4ed8' }}>Recommended next step</div>
              <div style={{ marginTop: '4px', fontSize: '13px', fontWeight: 800, color: '#0f172a' }}>{recommendedSetupAction.label}</div>
              <div style={{ marginTop: '4px', fontSize: '12px', color: 'rgba(15,23,42,0.68)', fontWeight: 600 }}>{recommendedSetupAction.description}</div>
            </div>
            <button
              type="button"
              className={styles.secondaryBtn}
              onClick={recommendedSetupAction.action}
              style={{ minWidth: 'auto', paddingInline: '14px' }}
            >
              Take action
            </button>
          </div>
        </div>
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
           <div className={styles.cardValue} style={{ color: 'white' }}>₹{totalEarnings.toLocaleString('en-IN')}</div>
        </div>

        <div className={styles.glassCard}>
           <div style={{ display: 'flex', gap: '16px', alignItems: 'center', marginBottom: '20px' }}>
              <div style={{ padding: '10px', background: '#f4f8ff', borderRadius: '12px', color: '#165dcc' }}>
                <Calendar size={20} />
              </div>
              <div style={{ fontSize: '11px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(14,43,87,0.5)' }}>Total Guest Stays</div>
           </div>
           <div className={styles.cardValue}>
             {totalStays} <span style={{ fontSize: '14px', opacity: 0.5 }}>Check-ins</span>
           </div>
        </div>
      </div>

      <div className={styles.glassCard} style={{ padding: '24px 28px', background: 'linear-gradient(180deg, #f8fbff, #ffffff)', border: '1px solid rgba(191, 219, 254, 0.7)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#1d4ed8' }}>Room capacity snapshot</div>
            <h3 style={{ margin: '6px 0 0', fontSize: '18px', fontWeight: 900, color: '#0f172a' }}>
              {roomStats.activeRooms > 0 ? `${roomStats.activeCapacity} guests can be hosted right now` : "No active room capacity yet"}
            </h3>
            <p style={{ margin: '6px 0 0', fontSize: '13px', fontWeight: 600, color: 'rgba(15,23,42,0.68)' }}>
              {roomStats.activeRooms > 0
                ? `You have ${roomStats.activeRooms} active room${roomStats.activeRooms === 1 ? "" : "s"} and ${roomStats.totalCapacity} guests of total room inventory.`
                : "Turn on at least one room to make the listing guest-ready."}
            </p>
          </div>
          <div style={{ display: 'grid', gap: '8px', gridTemplateColumns: 'repeat(2, minmax(120px, 1fr))' }}>
            <div style={{ padding: '12px 14px', borderRadius: '14px', background: '#eff6ff', border: '1px solid rgba(59, 130, 246, 0.12)' }}>
              <div style={{ fontSize: '11px', fontWeight: 900, textTransform: 'uppercase', color: '#1d4ed8' }}>Active rooms</div>
              <div style={{ marginTop: '4px', fontSize: '18px', fontWeight: 900, color: '#0f172a' }}>{roomStats.activeRooms}</div>
            </div>
            <div style={{ padding: '12px 14px', borderRadius: '14px', background: '#ecfdf5', border: '1px solid rgba(16, 185, 129, 0.12)' }}>
              <div style={{ fontSize: '11px', fontWeight: 900, textTransform: 'uppercase', color: '#166534' }}>Active capacity</div>
              <div style={{ marginTop: '4px', fontSize: '18px', fontWeight: 900, color: '#0f172a' }}>{roomStats.activeCapacity}</div>
            </div>
          </div>
        </div>
        {roomStats.activeCapacity === 0 && roomStats.totalCapacity > 0 ? (
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
