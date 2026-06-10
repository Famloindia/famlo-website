"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Loader2,
  MapPin,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Upload,
} from "lucide-react";

import { compressImageListForUpload } from "@/lib/client-image-upload";
import { resolveSmartPricingUiState } from "@/lib/pro-room-editor-ui";
import { normalizeAmenityList, ROOM_AMENITY_OPTIONS } from "@/lib/room-amenities";
import type { StayUnitRecord } from "@/lib/stay-units";

import dashboardStyles from "../dashboard.module.css";
import ChannelManagerTab from "../tabs/ChannelManagerTab";

export type RoomFormState = {
  id: string;
  unitKey: string;
  name: string;
  unitType: string;
  description: string;
  maxGuests: string;
  bedInfo: string;
  bathroomType: string;
  toiletTypes: string;
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

const ROOM_TYPE_OPTIONS = [
  { value: "standard_room", label: "Standard room" },
  { value: "deluxe_room", label: "Deluxe room" },
  { value: "family_room", label: "Family room" },
  { value: "twin_room", label: "Twin room" },
  { value: "dorm_room", label: "Dorm" },
] as const;

const BED_INFO_OPTIONS = [
  "Single bed",
  "Twin bed",
  "Standard bed",
  "Queen bed",
  "King bed",
  "Bunk bed",
] as const;

const BATHROOM_TYPE_OPTIONS = [
  "Attached Bathroom",
  "Private External Bathroom",
  "Shared Bathroom",
  "Common Bathroom",
] as const;

const TOILET_TYPE_SELECT_OPTIONS = [
  { value: "", label: "Select toilet type" },
  { value: "Western Toilet", label: "Western Toilet" },
  { value: "Indian Toilet", label: "Indian Toilet" },
  { value: "Western Toilet, Indian Toilet", label: "Western + Indian Toilet" },
] as const;

type HostRoomsManagerProps = {
  familyId: string;
  homeLat?: number;
  homeLng?: number;
  title?: string;
  description?: string;
  propertyLabel?: string;
  viewRoomPage?: boolean;
  roomPageFamilyId?: string;
  showChannelManager?: boolean;
  emptyTitle?: string;
  emptyCopy?: string;
  selectedRoomId?: string | null;
  createMode?: boolean;
  compactMode?: boolean;
  focusSection?: "all" | "details" | "pricing";
  theme?: "default" | "pro-dark";
};

type AddonCheckoutPayload = {
  addonPaymentRequired?: boolean;
  addonQuote?: {
    baseMonthlyAmount: number;
    payableSubtotalAmount: number;
    payableGstAmount: number;
    payableTotalAmount: number;
    gstPct: number;
  };
  billingOrderId?: string;
  keyId?: string;
  order?: { id: string; amount: number; currency: string };
};

function confirmRoomAddonPayment(payload: AddonCheckoutPayload): boolean {
  const quote = payload.addonQuote;
  if (!quote || typeof window === "undefined") return true;

  return window.confirm(
    [
      "Adding this Famlo Pro room requires payment before creation.",
      "",
      `Room add-on: Rs ${quote.baseMonthlyAmount}/month`,
      `Subtotal: Rs ${quote.payableSubtotalAmount.toFixed(2)}`,
      `GST (${quote.gstPct}%): Rs ${quote.payableGstAmount.toFixed(2)}`,
      `Total payable: Rs ${quote.payableTotalAmount.toFixed(2)}`,
      "",
      "Click OK to Pay and add.",
    ].join("\n")
  );
}

async function loadRazorpayCheckoutScript(): Promise<void> {
  if (typeof window === "undefined" || window.Razorpay) return;

  await new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-razorpay-checkout="true"]');
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Failed to load Razorpay checkout.")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.dataset.razorpayCheckout = "true";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Razorpay checkout."));
    document.head.appendChild(script);
  });
}

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

function parseCsvList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function serializeCsvList(values: string[]): string {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).join(", ");
}

function normalizeEditorUnitType(value: string): string {
  const raw = value.trim().toLowerCase();
  if (!raw) return "standard_room";
  if (raw === "private_room" || raw === "entire_home") return "standard_room";
  if (raw === "shared_room") return "dorm_room";
  return raw;
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
    unitType: normalizeEditorUnitType(room.unitType || "standard_room"),
    description: room.description ?? "",
    maxGuests: String(room.maxGuests),
    bedInfo: room.bedInfo ?? "",
    bathroomType: room.bathroomType ?? "",
    toiletTypes: Array.isArray(room.toiletTypes) ? room.toiletTypes.join(", ") : "",
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

function createBlankRoom(nextPrimary = false, fallbackTitle = "Standard room"): RoomFormState {
  return {
    id: `temp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    unitKey: "",
    name: fallbackTitle,
    unitType: "standard_room",
    description: "",
    maxGuests: "2",
    bedInfo: "Queen bed",
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

export default function HostRoomsManager({
  familyId,
  homeLat,
  homeLng,
  title = "Rooms",
  description = "Manage rooms for this selected property.",
  propertyLabel,
  viewRoomPage = true,
  roomPageFamilyId,
  showChannelManager = true,
  emptyTitle = "No rooms yet",
  emptyCopy = "Create the first room for this property to start building your Famlo inventory.",
  selectedRoomId = null,
  createMode = false,
  compactMode = false,
  focusSection = "all",
  theme = "default",
}: HostRoomsManagerProps) {
  const smartPricingUi = resolveSmartPricingUiState(false);
  const isProDark = theme === "pro-dark";
  const surfaceBackground = isProDark ? "linear-gradient(180deg, rgba(10, 18, 34, 0.96), rgba(4, 11, 24, 0.94))" : "#fff";
  const surfaceBorder = isProDark ? "1px solid rgba(148, 163, 184, 0.16)" : "1px solid #e2e8f0";
  const headerBackground = isProDark ? "rgba(15, 23, 42, 0.78)" : "#f8fafc";
  const headlineColor = isProDark ? "#f8fafc" : "#0f172a";
  const copyColor = isProDark ? "rgba(226, 232, 240, 0.72)" : "rgba(14,43,87,0.7)";
  const fieldLabelColor = isProDark ? "rgba(226, 232, 240, 0.72)" : "rgba(14,43,87,0.6)";
  const infoBackground = isProDark ? "rgba(30, 41, 59, 0.82)" : "#eff6ff";
  const infoTextColor = isProDark ? "#bfdbfe" : "#1d4ed8";
  const subtleBackground = isProDark ? "rgba(15, 23, 42, 0.72)" : "#f8fafc";
  const subtleBorder = isProDark ? "1px solid rgba(148, 163, 184, 0.16)" : "1px solid #e2e8f0";
  const mutedTextColor = isProDark ? "rgba(226, 232, 240, 0.68)" : "rgba(14,43,87,0.62)";
  const softButtonBackground = isProDark ? "rgba(15, 23, 42, 0.92)" : "#f8fafc";
  const softButtonText = isProDark ? "#e2e8f0" : "#0f172a";
  const softButtonBorder = isProDark ? "1px solid rgba(148, 163, 184, 0.2)" : "1px solid #e2e8f0";
  const successPillBackground = isProDark ? "rgba(22, 163, 74, 0.16)" : "#ecfdf5";
  const successPillText = isProDark ? "#bbf7d0" : "#166534";
  const warningPillBackground = isProDark ? "rgba(249, 115, 22, 0.18)" : "#fff7ed";
  const warningPillText = isProDark ? "#fdba74" : "#9a3412";
  const accentPillBackground = isProDark ? "rgba(59, 130, 246, 0.18)" : "#eff6ff";
  const accentPillText = isProDark ? "#bfdbfe" : "#1d4ed8";
  const violetPillBackground = isProDark ? "rgba(109, 40, 217, 0.18)" : "#f5f3ff";
  const violetPillText = isProDark ? "#ddd6fe" : "#6d28d9";
  const roomFieldStyle = {
    background: isProDark ? "linear-gradient(180deg, rgba(15, 23, 42, 0.84), rgba(15, 23, 42, 0.72))" : "#fdfdfd",
    border: isProDark ? "1px solid rgba(148, 163, 184, 0.18)" : "1px solid rgba(14, 43, 87, 0.1)",
    color: isProDark ? "#f8fafc" : "#0e2b57",
    borderRadius: "18px",
    padding: "14px 16px",
    minHeight: "54px",
    height: "54px",
    width: "100%",
    appearance: "none" as const,
    WebkitAppearance: "none" as const,
    MozAppearance: "none" as const,
    backdropFilter: isProDark ? "blur(18px)" : undefined,
    boxShadow: isProDark ? "inset 0 1px 0 rgba(255,255,255,0.03), 0 10px 28px rgba(2, 6, 23, 0.16)" : undefined,
  } as const;
  const roomTextAreaStyle = {
    ...roomFieldStyle,
    minHeight: "120px",
    resize: "vertical" as const,
    lineHeight: 1.6,
  };
  const roomLabelStackStyle = {
    display: "flex",
    flexDirection: "column" as const,
    gap: "8px",
    minWidth: 0,
  };
  const roomFieldLabelStyle = {
    fontSize: "11px",
    fontWeight: 900,
    color: fieldLabelColor,
    textTransform: "uppercase" as const,
    letterSpacing: "0.08em",
  };
  const roomSectionHeadingStyle = {
    fontSize: "11px",
    fontWeight: 900,
    letterSpacing: "0.14em",
    textTransform: "uppercase" as const,
    color: isProDark ? "#93c5fd" : infoTextColor,
  };
  const roomSectionPanelStyle = {
    display: "grid",
    gap: "16px",
    minWidth: 0,
    padding: "18px",
    borderRadius: "22px",
    background: isProDark ? "linear-gradient(180deg, rgba(8, 15, 29, 0.78), rgba(15, 23, 42, 0.58))" : "#ffffff",
    border: isProDark ? "1px solid rgba(148, 163, 184, 0.12)" : "1px solid rgba(14, 43, 87, 0.08)",
    boxShadow: isProDark ? "0 18px 40px rgba(2, 6, 23, 0.18)" : "0 10px 24px rgba(15, 23, 42, 0.06)",
    backdropFilter: isProDark ? "blur(24px)" : undefined,
  } as const;
  const statusBadgeStyle = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "30px",
    padding: "0 12px",
    borderRadius: "999px",
    fontSize: "11px",
    fontWeight: 900,
    textTransform: "uppercase" as const,
    letterSpacing: "0.06em",
    whiteSpace: "nowrap" as const,
  };
  const headerActionButtonStyle = {
    width: "auto",
    minWidth: "auto",
    minHeight: "40px",
    padding: "0 14px",
    borderRadius: "14px",
    justifyContent: "center",
  };
  const sectionToolbarButtonStyle = {
    width: "auto",
    minWidth: "auto",
    minHeight: "42px",
    padding: "0 14px",
    borderRadius: "14px",
    justifyContent: "center",
  };
  const darkUtilityButtonStyle = {
    minWidth: 0,
    width: "100%",
    height: "54px",
    padding: "0 16px",
    borderRadius: "18px",
    justifyContent: "center",
    background: isProDark ? "linear-gradient(180deg, rgba(15, 23, 42, 0.94), rgba(8, 15, 29, 0.88))" : "#f8fafc",
    color: isProDark ? "#dbeafe" : "#0f172a",
    border: isProDark ? "1px solid rgba(148, 163, 184, 0.18)" : "1px solid rgba(14, 43, 87, 0.1)",
    boxShadow: isProDark ? "0 10px 24px rgba(2, 6, 23, 0.16), inset 0 1px 0 rgba(255,255,255,0.03)" : "0 8px 20px rgba(15, 23, 42, 0.06)",
  } as const;
  const responsiveIdentityGridStyle = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
    gap: "16px",
    alignItems: "end",
    minWidth: 0,
  } as const;
  const responsiveDetailsGridStyle = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: "16px",
    alignItems: "end",
    minWidth: 0,
  } as const;
  const responsiveLocationGridStyle = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: "16px",
    alignItems: "end",
    minWidth: 0,
  } as const;
  const photoActionButtonStyle = {
    minHeight: "28px",
    padding: "0 10px",
    borderRadius: "999px",
    fontSize: "10px",
    fontWeight: 800,
    textTransform: "uppercase" as const,
    border: "none",
    cursor: "pointer",
  };
  const footerBarStyle = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "12px",
    flexWrap: "wrap" as const,
    paddingTop: "18px",
    borderTop: isProDark ? "1px solid rgba(148, 163, 184, 0.12)" : "1px solid #f1f5f9",
    marginTop: "4px",
    minWidth: 0,
  };
  const [roomDrafts, setRoomDrafts] = useState<RoomFormState[]>([]);
  const [roomsLoading, setRoomsLoading] = useState(false);
  const [roomsSaving, setRoomsSaving] = useState(false);
  const [roomsMessage, setRoomsMessage] = useState<string | null>(null);
  const [customAmenityDrafts, setCustomAmenityDrafts] = useState<Record<string, string>>({});
  const [detectingRoomLocationId, setDetectingRoomLocationId] = useState<string>("");
  const [openCalendars, setOpenCalendars] = useState<Record<string, boolean>>({});
  const [loadedPersistedRooms, setLoadedPersistedRooms] = useState(false);
  const [createDraftId, setCreateDraftId] = useState<string | null>(null);

  const roomStats = useMemo(() => {
    const activeRooms = roomDrafts.filter((room) => room.isActive).length;
    const totalCapacity = roomDrafts.reduce((acc, room) => acc + Math.max(1, Number(room.maxGuests) || 0), 0);
    const activeCapacity = roomDrafts
      .filter((room) => room.isActive)
      .reduce((acc, room) => acc + Math.max(1, Number(room.maxGuests) || 0), 0);
    return { activeRooms, totalCapacity, activeCapacity };
  }, [roomDrafts]);
  const showDetailsSections = focusSection === "all" || focusSection === "details";
  const showPricingSection = focusSection === "all" || focusSection === "pricing";

  useEffect(() => {
    let cancelled = false;

    async function loadRooms(): Promise<void> {
      if (!familyId) return;
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
          setLoadedPersistedRooms(nextRooms.length > 0);
          setRoomDrafts(nextRooms.length > 0 ? nextRooms : [createBlankRoom(true)]);
        }
      } catch (error) {
        if (!cancelled) {
          setLoadedPersistedRooms(false);
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

  useEffect(() => {
    if (!createMode) {
      setCreateDraftId(null);
      return;
    }

    if (createDraftId && roomDrafts.some((room) => room.id === createDraftId)) {
      return;
    }

    const blankRoom = createBlankRoom(roomDrafts.length === 0);
    setCreateDraftId(blankRoom.id);
    setRoomDrafts((current) => [...current, blankRoom]);
  }, [createDraftId, createMode, roomDrafts]);

  const visibleRoomDrafts = useMemo(() => {
    if (createMode) {
      return createDraftId ? roomDrafts.filter((room) => room.id === createDraftId) : [];
    }

    if (selectedRoomId) {
      const selectedRoom = roomDrafts.find((room) => room.id === selectedRoomId);
      return selectedRoom ? [selectedRoom] : [];
    }

    return roomDrafts;
  }, [createDraftId, createMode, roomDrafts, selectedRoomId]);

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

  const addRoom = (): void => {
    setRoomDrafts((current) => [...current, createBlankRoom(current.length === 0)]);
    setRoomsMessage(null);
  };

  const saveRoom = async (room: RoomFormState, addonOrderId?: string): Promise<void> => {
    async function verifyAddonPayment(
      billingOrderId: string,
      payment: { orderId: string; paymentId: string; signature: string }
    ): Promise<void> {
      const response = await fetch("/api/host/pro/addons/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          billingOrderId,
          razorpay_order_id: payment.orderId,
          razorpay_payment_id: payment.paymentId,
          razorpay_signature: payment.signature,
        }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to verify room add-on payment.");
      }
    }

    async function openAddonCheckout(payload: AddonCheckoutPayload): Promise<string> {
      if (!payload.billingOrderId || !payload.keyId || !payload.order?.id || !payload.order.amount || !payload.order.currency) {
        throw new Error("Room add-on checkout is missing billing details.");
      }

      await loadRazorpayCheckoutScript();
      const RazorpayCtor = window.Razorpay;
      if (!RazorpayCtor) {
        throw new Error("Razorpay checkout is unavailable.");
      }

      return await new Promise<string>((resolve, reject) => {
        const razorpay = new RazorpayCtor({
          key: payload.keyId,
          order_id: payload.order?.id,
          amount: payload.order?.amount,
          currency: payload.order?.currency,
          name: "Famlo Pro",
          description: "Famlo Pro room add-on",
          handler: async (result: Record<string, unknown>) => {
            try {
              await verifyAddonPayment(payload.billingOrderId!, {
                orderId: String(result.razorpay_order_id ?? ""),
                paymentId: String(result.razorpay_payment_id ?? ""),
                signature: String(result.razorpay_signature ?? ""),
              });
              resolve(payload.billingOrderId!);
            } catch (error) {
              reject(error);
            }
          },
          modal: {
            ondismiss: () => reject(new Error("Room add-on payment was cancelled.")),
          },
        });

        razorpay.open();
      });
    }

    setRoomsSaving(true);
    setRoomsMessage(null);
    try {
      const normalizedAmenities = normalizeAmenityList(parseCsvList(room.amenities));
      const normalizedPhotos = parseCsvList(room.photos);
      const normalizedLocalityPhotos = parseCsvList(room.localityPhotos);
      const normalizedToiletTypes = parseCsvList(room.toiletTypes);
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
          addonOrderId,
          unit: {
            id: room.id.startsWith("temp-") ? undefined : room.id,
            unitKey: room.unitKey,
            name: room.name,
            unitType: room.unitType,
            description: room.description,
            maxGuests: room.maxGuests,
            bedInfo: room.bedInfo,
            bathroomType: room.bathroomType,
            toiletTypes: normalizedToiletTypes,
            toiletType: normalizedToiletTypes.join(", "),
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

      const payload = (await response.json()) as {
        stayUnit?: StayUnitRecord;
        clientId?: string;
        occupancySync?: {
          status?: "not_mapped" | "queued" | "synced" | "failed";
          message?: string;
        } | null;
        error?: string;
        addonPaymentRequired?: boolean;
        addonQuote?: {
          baseMonthlyAmount: number;
          payableSubtotalAmount: number;
          payableGstAmount: number;
          payableTotalAmount: number;
          gstPct: number;
        };
        billingOrderId?: string;
        keyId?: string;
        order?: { id: string; amount: number; currency: string };
      };
      if (response.status === 402 && payload.addonPaymentRequired) {
        if (!confirmRoomAddonPayment(payload)) {
          throw new Error("Room add-on payment is required before this room can be created.");
        }
        const paidAddonOrderId = await openAddonCheckout(payload);
        await saveRoom(room, paidAddonOrderId);
        return;
      }
      if (!response.ok || !payload.stayUnit) {
        throw new Error(payload.error ?? "Failed to save room.");
      }

      const previousId = payload.clientId ?? room.id;
      setLoadedPersistedRooms(true);
      setRoomDrafts((current) =>
        current.map((item) =>
          item.id === previousId
            ? roomToForm(payload.stayUnit as StayUnitRecord)
            : payload.stayUnit?.isPrimary && item.id !== previousId
              ? { ...item, isPrimary: false }
              : item
        )
      );
      const occupancySyncStatus = payload.occupancySync?.status ?? null;
      if (occupancySyncStatus === "synced") {
        setRoomsMessage("Room saved. Channex occupancy sync success.");
      } else if (occupancySyncStatus === "failed") {
        setRoomsMessage(
          `Room saved. Channex occupancy sync failed.${payload.occupancySync?.message ? ` ${payload.occupancySync.message}` : ""}`
        );
      } else if (occupancySyncStatus === "not_mapped" || occupancySyncStatus === "queued") {
        setRoomsMessage("Room saved. Channex occupancy sync pending.");
      } else {
        setRoomsMessage("Room saved.");
      }
    } catch (error) {
      setRoomsMessage(error instanceof Error ? error.message : "Failed to save room.");
    } finally {
      setRoomsSaving(false);
    }
  };

  const removeRoom = async (roomId: string): Promise<void> => {
    const target = roomDrafts.find((room) => room.id === roomId);
    if (!target) return;

    if (target.id.startsWith("temp-")) {
      const nextRooms = roomDrafts.filter((room) => room.id !== roomId);
      setRoomDrafts(nextRooms.length > 0 ? nextRooms : [createBlankRoom(true)]);
      return;
    }

    if (roomDrafts.length <= 1) {
      setRoomsMessage("Keep at least one room card in the dashboard.");
      return;
    }

    if (typeof window !== "undefined") {
      const confirmed = window.confirm(
        `Delete ${target.name || "this room"} from the selected property? This only removes the Famlo room inventory entry.`
      );
      if (!confirmed) {
        return;
      }
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

  const toggleRoomActive = async (roomId: string, nextActive: boolean): Promise<void> => {
    const target = roomDrafts.find((room) => room.id === roomId);
    if (!target) return;

    const nextRoom = { ...target, isActive: nextActive };
    setRoomDrafts((current) => current.map((room) => (room.id === roomId ? nextRoom : room)));
    await saveRoom(nextRoom);
  };

  const setPrimaryRoom = async (roomId: string): Promise<void> => {
    const currentRoom = roomDrafts.find((room) => room.id === roomId);
    if (!currentRoom) return;

    setRoomDrafts((current) => current.map((room) => ({ ...room, isPrimary: room.id === roomId })));
    await saveRoom({ ...currentRoom, isPrimary: true });
  };

  const updateRoomAmenities = (roomId: string, nextAmenities: string[]): void => {
    const nextValue = serializeCsvList(normalizeAmenityList(nextAmenities));
    updateRoomField(roomId, "amenities", nextValue);
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

  const uploadPhotos = async (roomId: string, files: FileList | null, kind: "room" | "locality"): Promise<void> => {
    if (!files || files.length === 0) return;
    if (roomId.startsWith("temp-")) {
      setRoomsMessage(`Save the room once before uploading ${kind === "room" ? "photos" : "locality photos"}.`);
      return;
    }

    setRoomsSaving(true);
    setRoomsMessage(null);
    try {
      const optimizedFiles = await compressImageListForUpload(Array.from(files));
      const formData = new FormData();
      formData.append("familyId", familyId);
      formData.append("unitId", roomId);
      formData.append("kind", kind);
      optimizedFiles.forEach((file) => formData.append("photos", file));

      const response = await fetch("/api/host/stay-units/upload-photos", {
        method: "POST",
        body: formData,
      });

      const payload = (await response.json()) as { stayUnit?: StayUnitRecord; photoUrls?: string[]; error?: string };
      if (!response.ok || !payload.stayUnit) {
        throw new Error(payload.error ?? `Failed to upload ${kind === "room" ? "room photos" : "locality photos"}.`);
      }

      setRoomDrafts((current) =>
        current.map((room) =>
          room.id === roomId
            ? {
                ...roomToForm(payload.stayUnit as StayUnitRecord),
                [kind === "room" ? "photos" : "localityPhotos"]: (payload.photoUrls ?? []).join(", "),
              }
            : room
        )
      );
      setRoomsMessage(kind === "room" ? "Room photos uploaded." : "Locality photos uploaded.");
    } catch (error) {
      setRoomsMessage(error instanceof Error ? error.message : `Failed to upload ${kind === "room" ? "room photos" : "locality photos"}.`);
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

    setRoomDrafts((current) => current.map((room) => (room.id === roomId ? nextRoom : room)));
    await saveRoom(nextRoom);
  };

  const removeRoomPhoto = async (roomId: string, photo: string, kind: "room" | "locality" = "room"): Promise<void> => {
    const normalizedPhoto = photo.trim();
    if (!normalizedPhoto) return;

    const currentRoom = roomDrafts.find((room) => room.id === roomId);
    if (!currentRoom) return;

    const nextPhotos =
      kind === "locality"
        ? parsePhotoList(currentRoom.localityPhotos).filter((item) => item !== normalizedPhoto)
        : parsePhotoList(currentRoom.photos).filter((item) => item !== normalizedPhoto);
    const nextRoom =
      kind === "locality"
        ? { ...currentRoom, localityPhotos: serializePhotoList(nextPhotos) }
        : { ...currentRoom, photos: serializePhotoList(nextPhotos) };

    setRoomDrafts((current) => current.map((room) => (room.id === roomId ? nextRoom : room)));

    if (roomId.startsWith("temp-")) {
      return;
    }

    await saveRoom(nextRoom);
  };

  const refreshRooms = async (): Promise<void> => {
    if (!familyId) return;
    setRoomsLoading(true);
    setRoomsMessage(null);
    try {
      const response = await fetch(`/api/host/stay-units?familyId=${encodeURIComponent(familyId)}`);
      const payload = (await response.json()) as { stayUnits?: StayUnitRecord[]; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Failed to load rooms.");
      const nextRooms = Array.isArray(payload.stayUnits) ? payload.stayUnits.map(roomToForm) : [];
      setLoadedPersistedRooms(nextRooms.length > 0);
      setRoomDrafts(nextRooms.length > 0 ? nextRooms : [createBlankRoom(true)]);
    } catch (error) {
      setRoomsMessage(error instanceof Error ? error.message : "Failed to load rooms.");
    } finally {
      setRoomsLoading(false);
    }
  };

  if (!familyId) {
    return (
      <div className={`${dashboardStyles.flexCol} ${dashboardStyles.animateIn} ${isProDark ? dashboardStyles.proRoomTheme : ""}`} style={{ gap: "24px" }}>
        <section className={dashboardStyles.glassCard} style={{ padding: "28px", borderRadius: "24px" }}>
          <div className={dashboardStyles.cardTitle} style={{ marginBottom: 12 }}>ROOMS</div>
          <h3 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: headlineColor }}>Selected property missing</h3>
          <p style={{ margin: "10px 0 0", fontSize: 14, lineHeight: 1.7, color: copyColor, fontWeight: 600 }}>
            Choose a property first so Famlo can load the correct room inventory.
          </p>
        </section>
      </div>
    );
  }

  return (
    <div className={`${dashboardStyles.flexCol} ${dashboardStyles.animateIn} ${isProDark ? dashboardStyles.proRoomTheme : ""}`} style={{ gap: compactMode ? "20px" : "32px" }}>
      {!compactMode ? (
      <section className={dashboardStyles.glassCard} style={{ padding: "36px", borderRadius: "28px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "16px", flexWrap: "wrap" }}>
          <div style={{ display: "grid", gap: "8px" }}>
            <div className={dashboardStyles.cardTitle} style={{ margin: 0, color: isProDark ? "#93c5fd" : "#0e2b57" }}>{title.toUpperCase()}</div>
            <h2 style={{ margin: 0, fontSize: "30px", fontWeight: 900, color: headlineColor }}>{title}</h2>
            <p style={{ margin: 0, maxWidth: "760px", fontSize: "14px", lineHeight: 1.7, color: copyColor, fontWeight: 600 }}>
              {description}
            </p>
            {propertyLabel ? (
              <div style={{ fontSize: 12, fontWeight: 800, color: mutedTextColor, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                {propertyLabel}
              </div>
            ) : null}
          </div>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <div style={{ fontSize: "12px", fontWeight: 800, color: isProDark ? "#dbeafe" : "#0e2b57", background: infoBackground, padding: "10px 14px", borderRadius: "999px" }}>
              {roomStats.activeRooms} open
            </div>
            <div style={{ fontSize: "12px", fontWeight: 800, color: isProDark ? "#e2e8f0" : "#0e2b57", background: subtleBackground, border: subtleBorder, padding: "10px 14px", borderRadius: "999px" }}>
              {roomDrafts.length} total
            </div>
            <button
              type="button"
              className={dashboardStyles.primaryBtn}
              style={{ width: "auto", minWidth: "auto", padding: "10px 16px", borderRadius: "14px", background: softButtonBackground, color: softButtonText, border: softButtonBorder }}
              onClick={() => void refreshRooms()}
              disabled={roomsSaving}
            >
              <RefreshCw size={16} />
              Refresh
            </button>
            <button
              type="button"
              className={dashboardStyles.primaryBtn}
              style={{ width: "auto", minWidth: "auto", padding: "10px 16px", borderRadius: "14px" }}
              onClick={addRoom}
              disabled={roomsSaving}
            >
              <Plus size={16} />
              Add room
            </button>
          </div>
        </div>

      </section>
      ) : null}

      <section id="dashboard-rooms" className={dashboardStyles.glassCard} style={{ padding: compactMode ? "20px" : "32px" }}>
        {roomsLoading && visibleRoomDrafts.length === 0 ? (
          <div style={{ fontSize: "14px", color: "rgba(14,43,87,0.68)", fontWeight: 700 }}>Loading rooms...</div>
        ) : null}

        {!loadedPersistedRooms && !roomsLoading && !selectedRoomId && !createMode ? (
          <div style={{ marginBottom: 20, padding: "16px 18px", borderRadius: 16, background: infoBackground, color: infoTextColor, fontSize: 13, fontWeight: 700 }}>
            <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>{emptyTitle}</div>
            <div>{emptyCopy}</div>
          </div>
        ) : null}

        {!roomsLoading && visibleRoomDrafts.length === 0 && (selectedRoomId || createMode) ? (
          <div style={{ marginBottom: 20, padding: "16px 18px", borderRadius: 16, background: infoBackground, color: infoTextColor, fontSize: 13, fontWeight: 700 }}>
            <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>
              {createMode ? "Create room" : "Selected room"}
            </div>
            <div>
              {createMode
                ? "Preparing a new room draft for this property."
                : "The selected room could not be loaded yet. Refresh and try again."}
            </div>
          </div>
        ) : null}

        {loadedPersistedRooms && roomStats.activeRooms === 0 ? (
          <div style={{ marginBottom: 20, padding: "16px 18px", borderRadius: 16, background: "#fff7ed", color: "#9a3412", fontSize: 13, fontWeight: 700 }}>
            <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>All rooms inactive</div>
            <div>Turn on at least one room to make this property bookable on Famlo.</div>
          </div>
        ) : null}

        <div style={{ display: "grid", gap: "20px", minWidth: 0 }}>
          {visibleRoomDrafts.map((room, index) => {
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
            const roomPageFamilyScope = roomPageFamilyId ?? familyId;

            return (
              <article key={room.id} style={{ border: surfaceBorder, borderRadius: "24px", background: surfaceBackground, overflow: "hidden", boxShadow: isProDark ? "0 24px 60px rgba(2, 6, 23, 0.34)" : "0 4px 24px rgba(15,23,42,0.07)", minWidth: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "14px", flexWrap: "wrap", background: headerBackground, borderBottom: surfaceBorder, padding: "18px 20px", minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", minWidth: 0, flex: "1 1 540px" }}>
                    <h4 style={{ margin: 0, fontSize: "15px", fontWeight: 800, color: headlineColor, minWidth: 0, wordBreak: "break-word" }}>{room.name || "Untitled room"}</h4>
                    {room.isPrimary ? <span style={{ ...statusBadgeStyle, background: successPillBackground, color: successPillText }}>Primary</span> : null}
                    {room.isActive ? <span style={{ ...statusBadgeStyle, background: accentPillBackground, color: accentPillText }}>Open</span> : <span style={{ ...statusBadgeStyle, background: warningPillBackground, color: warningPillText }}>Closed</span>}
                    <span style={{ ...statusBadgeStyle, background: room.quarterEnabled ? (isProDark ? "rgba(20, 184, 166, 0.18)" : "#ecfeff") : softButtonBackground, color: room.quarterEnabled ? (isProDark ? "#99f6e4" : "#0f766e") : mutedTextColor }}>
                      {room.quarterEnabled ? "Smart pricing on" : "Smart pricing off"}
                    </span>
                    <span style={{ ...statusBadgeStyle, background: hasRoomLocation ? successPillBackground : warningPillBackground, color: hasRoomLocation ? successPillText : warningPillText }}>
                      {hasRoomLocation ? "Location set" : "No room location"}
                    </span>
                    <span style={{ ...statusBadgeStyle, background: roomPhotos.length > 0 ? successPillBackground : warningPillBackground, color: roomPhotos.length > 0 ? successPillText : warningPillText }}>
                      {roomPhotos.length > 0 ? `${roomPhotos.length} photos` : "No photos yet"}
                    </span>
                    {localityPhotos.length > 0 ? <span style={{ ...statusBadgeStyle, background: violetPillBackground, color: violetPillText }}>{localityPhotos.length} locality</span> : null}
                  </div>
                  <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap", minWidth: 0, padding: isProDark ? "6px" : "0", borderRadius: "18px", background: isProDark ? "rgba(8, 15, 29, 0.42)" : "transparent", border: isProDark ? "1px solid rgba(148, 163, 184, 0.12)" : "none" }}>
                    <button type="button" className={dashboardStyles.secondaryBtn} onClick={() => void setPrimaryRoom(room.id)} disabled={roomsSaving} style={{ ...headerActionButtonStyle, background: successPillBackground, color: successPillText, borderColor: isProDark ? "rgba(74, 222, 128, 0.24)" : "rgba(22,163,74,0.16)" }}>
                      <ShieldCheck size={14} />
                      Make primary
                    </button>
                    <button type="button" className={dashboardStyles.secondaryBtn} onClick={() => void toggleRoomActive(room.id, !room.isActive)} disabled={roomsSaving} style={{ ...headerActionButtonStyle, background: room.isActive ? warningPillBackground : successPillBackground, color: room.isActive ? warningPillText : successPillText, borderColor: room.isActive ? (isProDark ? "rgba(251, 146, 60, 0.24)" : "rgba(249,115,22,0.18)") : (isProDark ? "rgba(74, 222, 128, 0.24)" : "rgba(22,163,74,0.16)") }}>
                      {room.isActive ? "Turn off" : "Turn on"}
                    </button>
                  </div>
                </div>

                <div style={{ padding: "22px", display: "grid", gap: "20px", minWidth: 0, overflow: "hidden" }}>
                  <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center", minWidth: 0 }}>
                    {viewRoomPage ? (
                      <Link
                        href={`/host/${roomPageFamilyScope}/room/${room.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className={dashboardStyles.secondaryBtn}
                        style={{ ...sectionToolbarButtonStyle, textDecoration: "none" }}
                      >
                        View room page
                      </Link>
                    ) : null}
                    <span style={{ fontSize: "12px", color: mutedTextColor, fontWeight: 700 }}>
                      {formatUnitType(room.unitType)} · {roomPhotos.length} photos · {amenityValues.length} amenities
                    </span>
                  </div>

                  {showDetailsSections ? (
                  <div style={roomSectionPanelStyle}>
                    <div style={roomSectionHeadingStyle}>Room identity</div>
                    <div style={responsiveIdentityGridStyle}>
                      <label style={roomLabelStackStyle}>
                        <span style={roomFieldLabelStyle}>Room name</span>
                        <input className={dashboardStyles.inputField} style={roomFieldStyle} value={room.name} onChange={(event) => updateRoomField(room.id, "name", event.target.value)} />
                      </label>
                      <label style={roomLabelStackStyle}>
                        <span style={roomFieldLabelStyle}>Room type</span>
                        <select className={dashboardStyles.inputField} style={roomFieldStyle} value={room.unitType} onChange={(event) => updateRoomField(room.id, "unitType", event.target.value)}>
                          {ROOM_TYPE_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  </div>
                  ) : null}

                  {showDetailsSections ? (
                  <div style={roomSectionPanelStyle}>
                    <div style={roomSectionHeadingStyle}>Room details</div>
                    <div style={responsiveDetailsGridStyle}>
                      <label style={roomLabelStackStyle}>
                        <span style={roomFieldLabelStyle}>Max guests</span>
                        <select className={dashboardStyles.inputField} style={roomFieldStyle} value={room.maxGuests} onChange={(event) => updateRoomField(room.id, "maxGuests", event.target.value)}>
                          {Array.from({ length: 10 }, (_, optionIndex) => String(optionIndex + 1)).map((guestCount) => (
                            <option key={guestCount} value={guestCount}>
                              {guestCount}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label style={roomLabelStackStyle}>
                        <span style={roomFieldLabelStyle}>Bed info</span>
                        <select className={dashboardStyles.inputField} style={roomFieldStyle} value={room.bedInfo} onChange={(event) => updateRoomField(room.id, "bedInfo", event.target.value)}>
                          <option value="">Select bed type</option>
                          {BED_INFO_OPTIONS.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label style={roomLabelStackStyle}>
                        <span style={roomFieldLabelStyle}>Bathroom type</span>
                        <select className={dashboardStyles.inputField} style={roomFieldStyle} value={room.bathroomType} onChange={(event) => updateRoomField(room.id, "bathroomType", event.target.value)}>
                          <option value="">Select bathroom type</option>
                          {BATHROOM_TYPE_OPTIONS.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label style={roomLabelStackStyle}>
                        <span style={roomFieldLabelStyle}>Room size (sqm)</span>
                        <input className={dashboardStyles.inputField} style={roomFieldStyle} type="number" min="0" value={room.roomSizeSqm} onChange={(event) => updateRoomField(room.id, "roomSizeSqm", event.target.value)} />
                      </label>
                      <label style={roomLabelStackStyle}>
                        <span style={roomFieldLabelStyle}>Toilet type</span>
                        <select
                          className={dashboardStyles.inputField}
                          style={roomFieldStyle}
                          value={serializeCsvList(parseCsvList(room.toiletTypes))}
                          onChange={(event) => updateRoomField(room.id, "toiletTypes", event.target.value)}
                        >
                          {TOILET_TYPE_SELECT_OPTIONS.map((option) => (
                            <option key={option.value || "empty"} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>

                    <label style={roomLabelStackStyle}>
                      <span style={roomFieldLabelStyle}>Description</span>
                      <textarea className={dashboardStyles.inputField} rows={3} value={room.description} onChange={(event) => updateRoomField(room.id, "description", event.target.value)} style={{ ...roomTextAreaStyle, wordBreak: "break-word" }} />
                    </label>
                  </div>
                  ) : null}

                  {showDetailsSections ? (
                  <div style={roomSectionPanelStyle}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", minWidth: 0 }}>
                      <MapPin size={14} color={isProDark ? "#93c5fd" : "#1d4ed8"} />
                      <span style={roomSectionHeadingStyle}>Room location</span>
                      <span style={{ fontSize: "12px", fontWeight: 700, color: mutedTextColor }}>Approximate only. Used for the room map.</span>
                    </div>
                    <div style={responsiveLocationGridStyle}>
                      <label style={roomLabelStackStyle}>
                        <span style={roomFieldLabelStyle}>Latitude</span>
                        <input className={dashboardStyles.inputField} style={roomFieldStyle} inputMode="decimal" placeholder="28.613939" value={room.lat} onChange={(event) => updateRoomField(room.id, "lat", event.target.value)} />
                      </label>
                      <label style={roomLabelStackStyle}>
                        <span style={roomFieldLabelStyle}>Longitude</span>
                        <input className={dashboardStyles.inputField} style={roomFieldStyle} inputMode="decimal" placeholder="77.209021" value={room.lng} onChange={(event) => updateRoomField(room.id, "lng", event.target.value)} />
                      </label>
                      <button
                        type="button"
                        className={dashboardStyles.secondaryBtn}
                        onClick={() => setRoomLocationFromHome(room.id)}
                        disabled={roomsSaving || !Number.isFinite(homeLat) || !Number.isFinite(homeLng)}
                        style={{ ...darkUtilityButtonStyle, opacity: !Number.isFinite(homeLat) || !Number.isFinite(homeLng) ? 0.45 : 1 }}
                      >
                        Use home location
                      </button>
                      <button
                        type="button"
                        className={dashboardStyles.secondaryBtn}
                        onClick={() => void detectRoomLocation(room.id)}
                        disabled={roomsSaving || detectingRoomLocationId === room.id}
                        style={{ ...darkUtilityButtonStyle, opacity: detectingRoomLocationId === room.id ? 0.78 : 1 }}
                      >
                        {detectingRoomLocationId === room.id ? <Loader2 size={14} className="animate-spin" /> : <MapPin size={14} />}
                        {detectingRoomLocationId === room.id ? "Detecting..." : "Detect location"}
                      </button>
                      <button
                        type="button"
                        className={dashboardStyles.secondaryBtn}
                        onClick={() => {
                          updateRoomField(room.id, "lat", "");
                          updateRoomField(room.id, "lng", "");
                        }}
                        disabled={roomsSaving}
                        style={{ ...darkUtilityButtonStyle, opacity: roomsSaving ? 0.56 : 1 }}
                      >
                        Clear location
                      </button>
                    </div>
                  </div>
                  ) : null}

                  {showDetailsSections ? (
                  <div style={roomSectionPanelStyle}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", minWidth: 0 }}>
                      <span style={roomFieldLabelStyle}>Amenities</span>
                      <span style={{ fontSize: "12px", fontWeight: 800, color: headlineColor }}>{amenityValues.length} selected</span>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "10px", minWidth: 0 }}>
                      {ROOM_AMENITY_OPTIONS.map((amenity) => {
                        const active = amenityValues.includes(amenity);
                        return (
                          <button
                            key={amenity}
                            type="button"
                            onClick={() => toggleAmenity(room.id, amenity)}
                            disabled={roomsSaving}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              gap: "6px",
                              padding: "0 14px",
                              minHeight: "52px",
                              width: "100%",
                              borderRadius: "16px",
                              border: `1px solid ${active ? (isProDark ? "rgba(96, 165, 250, 0.28)" : "rgba(22,93,204,0.26)") : (isProDark ? "rgba(148, 163, 184, 0.18)" : "rgba(14,43,87,0.08)")}`,
                              background: active ? "linear-gradient(180deg, rgba(37, 99, 235, 0.28), rgba(30, 64, 175, 0.2))" : softButtonBackground,
                              color: active ? accentPillText : softButtonText,
                              fontSize: "12px",
                              fontWeight: 800,
                              cursor: roomsSaving ? "not-allowed" : "pointer",
                              minWidth: 0,
                              boxShadow: active ? "0 14px 28px rgba(37, 99, 235, 0.14)" : "0 10px 24px rgba(2, 6, 23, 0.08)",
                            }}
                          >
                            {active ? <Check size={12} /> : null}
                            {amenity}
                          </button>
                        );
                      })}
                    </div>
                    {customAmenityValues.length > 0 ? (
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "10px", minWidth: 0 }}>
                        {customAmenityValues.map((amenity) => (
                          <button
                            key={`${room.id}-${amenity}`}
                            type="button"
                            onClick={() => toggleAmenity(room.id, amenity)}
                            disabled={roomsSaving}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              gap: "6px",
                              padding: "0 14px",
                              minHeight: "52px",
                              width: "100%",
                              borderRadius: "16px",
                              border: `1px solid ${isProDark ? "rgba(196, 181, 253, 0.22)" : "rgba(124,58,237,0.18)"}`,
                              background: violetPillBackground,
                              color: violetPillText,
                              fontSize: "12px",
                              fontWeight: 800,
                              cursor: roomsSaving ? "not-allowed" : "pointer",
                              minWidth: 0,
                              boxShadow: "0 10px 24px rgba(2, 6, 23, 0.08)",
                            }}
                          >
                            <Check size={12} />
                            {amenity}
                          </button>
                        ))}
                      </div>
                    ) : null}
                    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 180px", gap: "16px", alignItems: "stretch", minWidth: 0 }}>
                      <input
                        className={dashboardStyles.inputField}
                        value={customAmenityValue}
                        onChange={(event) => setCustomAmenityDrafts((current) => ({ ...current, [room.id]: event.target.value }))}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            addCustomAmenity(room.id);
                          }
                        }}
                        placeholder="Add custom amenity"
                        style={{ ...roomFieldStyle, minWidth: 0, height: "54px" }}
                      />
                      <button type="button" className={dashboardStyles.secondaryBtn} onClick={() => addCustomAmenity(room.id)} disabled={roomsSaving} style={{ ...darkUtilityButtonStyle, opacity: roomsSaving ? 0.56 : 1 }}>
                        Add custom
                      </button>
                    </div>
                  </div>
                  ) : null}

                  {showDetailsSections ? (
                  <div style={roomSectionPanelStyle}>
                    <div style={roomSectionHeadingStyle}>Room photos</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", minWidth: 0 }}>
                      <label
                        htmlFor={`room-photo-upload-${room.id}`}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "8px",
                          minHeight: "44px",
                          padding: "0 16px",
                          borderRadius: "14px",
                          background: "#165dcc",
                          color: "#fff",
                          fontSize: "13px",
                          fontWeight: 800,
                          cursor: roomsSaving ? "not-allowed" : "pointer",
                        }}
                      >
                        <Upload size={14} />
                        Upload room photos
                      </label>
                      <input id={`room-photo-upload-${room.id}`} accept="image/*" multiple onChange={(event) => void uploadPhotos(room.id, event.target.files, "room")} type="file" style={{ display: "none" }} />
                      <label
                        htmlFor={`room-locality-upload-${room.id}`}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "8px",
                          minHeight: "44px",
                          padding: "0 16px",
                          borderRadius: "14px",
                          background: softButtonBackground,
                          color: softButtonText,
                          border: softButtonBorder,
                          fontSize: "13px",
                          fontWeight: 800,
                          cursor: roomsSaving ? "not-allowed" : "pointer",
                        }}
                      >
                        <Upload size={14} />
                        Upload locality photos
                      </label>
                      <input id={`room-locality-upload-${room.id}`} accept="image/*" multiple onChange={(event) => void uploadPhotos(room.id, event.target.files, "locality")} type="file" style={{ display: "none" }} />
                    </div>

                    {roomPhotos.length > 0 ? (
                      <div style={{ display: "grid", gap: "12px", minWidth: 0 }}>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 150px))", gap: "14px", minWidth: 0, justifyContent: "flex-start" }}>
                          {roomPhotos.slice(0, 8).map((photo, photoIndex) => (
                            <div key={photo} style={{ display: "grid", gap: "10px", padding: "10px", borderRadius: "18px", border: photoIndex === 0 ? (isProDark ? "1px solid rgba(191, 219, 254, 0.44)" : "1px solid #0f172a") : (isProDark ? "1px solid rgba(148, 163, 184, 0.16)" : "1px solid #e2e8f0"), background: isProDark ? "rgba(15, 23, 42, 0.64)" : "#fff", minWidth: 0 }}>
                              <div style={{ borderRadius: "14px", overflow: "hidden", aspectRatio: "4 / 3", minWidth: 0 }}>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={photo} alt={room.name} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                              </div>
                              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", minWidth: 0 }}>
                                <button type="button" onClick={() => void promoteRoomPhoto(room.id, photo)} disabled={roomsSaving} style={{ ...photoActionButtonStyle, background: photoIndex === 0 ? "#0f172a" : "rgba(15,23,42,0.82)", color: "#fff" }}>
                                  {photoIndex === 0 ? "Thumbnail" : "Set thumbnail"}
                                </button>
                                <button type="button" onClick={() => void removeRoomPhoto(room.id, photo)} disabled={roomsSaving} style={{ ...photoActionButtonStyle, background: "rgba(255,255,255,0.92)", color: "#991b1b" }}>
                                  Remove
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                        <p style={{ margin: 0, fontSize: 11, color: mutedTextColor, fontWeight: 700 }}>The first photo is used as the public thumbnail shown to guests.</p>
                      </div>
                    ) : null}

                    {localityPhotos.length > 0 ? (
                      <div style={{ display: "grid", gap: "10px", minWidth: 0 }}>
                        <div style={{ fontSize: "11px", fontWeight: 900, color: isProDark ? "#c4b5fd" : "#7c3aed", textTransform: "uppercase", letterSpacing: "0.08em", paddingTop: "12px", borderTop: isProDark ? "1px dashed rgba(148, 163, 184, 0.18)" : "1px dashed #e2e8f0" }}>Locality photos</div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 150px))", gap: "14px", minWidth: 0, justifyContent: "flex-start" }}>
                          {localityPhotos.slice(0, 8).map((photo) => (
                            <div key={photo} style={{ display: "grid", gap: "10px", padding: "10px", borderRadius: "18px", border: isProDark ? "1px solid rgba(196, 181, 253, 0.18)" : "1px solid #e2e8f0", background: isProDark ? "rgba(24, 24, 50, 0.5)" : violetPillBackground, minWidth: 0 }}>
                              <div style={{ borderRadius: "14px", overflow: "hidden", aspectRatio: "4 / 3", minWidth: 0 }}>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={photo} alt={`${room.name} locality`} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                              </div>
                              <div style={{ display: "flex", minWidth: 0 }}>
                                <button type="button" onClick={() => void removeRoomPhoto(room.id, photo, "locality")} disabled={roomsSaving} style={{ ...photoActionButtonStyle, background: "rgba(255,255,255,0.92)", color: "#7c3aed" }}>
                                  Remove
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                  ) : null}

                  {showPricingSection ? (
                  <div style={roomSectionPanelStyle}>
                    <div style={roomSectionHeadingStyle}>Manual pricing</div>
                    {focusSection === "pricing" ? (
                      <div style={{ padding: "12px 14px", borderRadius: "14px", background: infoBackground, color: infoTextColor, fontSize: "13px", lineHeight: 1.65, fontWeight: 700 }}>
                        {smartPricingUi.manualPricingLabel}. Smart Pricing is still coming soon and does not currently drive checkout, calendar, or channel rates.
                      </div>
                    ) : null}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "14px", minWidth: 0 }}>
                      <label style={{ display: "flex", flexDirection: "column", gap: "6px", minWidth: 0 }}>
                        <span style={roomFieldLabelStyle}>Public room price</span>
                        <input className={dashboardStyles.inputField} style={roomFieldStyle} type="number" min="0" value={room.priceFullday} onChange={(event) => updateRoomField(room.id, "priceFullday", event.target.value)} />
                      </label>
                      <label style={{ display: "flex", flexDirection: "column", gap: "6px", minWidth: 0 }}>
                        <span style={roomFieldLabelStyle}>Lower-demand reference</span>
                        <input className={dashboardStyles.inputField} style={{ ...roomFieldStyle, opacity: 0.76 }} type="number" min="0" value={room.priceMorning} disabled readOnly aria-disabled="true" />
                      </label>
                      <label style={{ display: "flex", flexDirection: "column", gap: "6px", minWidth: 0 }}>
                        <span style={roomFieldLabelStyle}>Higher-demand reference</span>
                        <input className={dashboardStyles.inputField} style={{ ...roomFieldStyle, opacity: 0.76 }} type="number" min="0" value={room.priceEvening} disabled readOnly aria-disabled="true" />
                      </label>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", padding: "14px 16px", borderRadius: "16px", background: infoBackground, border: isProDark ? "1px solid rgba(96, 165, 250, 0.16)" : "1px solid rgba(37,99,235,0.12)", minWidth: 0 }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: "11px", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em", color: infoTextColor }}>Smart Pricing</div>
                        <div style={{ marginTop: "4px", fontSize: "12px", fontWeight: 700, color: isProDark ? "rgba(191, 219, 254, 0.76)" : "rgba(29,78,216,0.78)" }}>
                          {smartPricingUi.smartPricingLabel}. These reference values are not auto-applied to calendar or channel pricing yet.
                        </div>
                      </div>
                      <label className={dashboardStyles.iosToggleLabel}>
                        <input type="checkbox" className={dashboardStyles.iosToggleInput} checked={false} disabled aria-disabled="true" readOnly />
                        <div className={dashboardStyles.iosToggleTrack}>
                          <div className={dashboardStyles.iosToggleThumb} />
                        </div>
                      </label>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", padding: "14px 16px", borderRadius: "16px", background: subtleBackground, border: subtleBorder, minWidth: 0 }}>
                      <div>
                        <div style={{ fontSize: "11px", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em", color: isProDark ? "rgba(148, 163, 184, 0.88)" : "#475569" }}>Suggested midpoint</div>
                        <div style={{ marginTop: "4px", fontSize: "13px", fontWeight: 800, color: headlineColor }}>For pricing guidance only</div>
                      </div>
                      <div style={{ fontSize: "18px", fontWeight: 900, color: "#165dcc" }}>₹{smartPriceMidpoint}</div>
                    </div>
                  </div>
                  ) : null}

                  {showChannelManager ? (
                    <div style={{ display: "grid", gap: "10px", minWidth: 0, marginTop: "12px" }}>
                      <button
                        type="button"
                        onClick={() => setOpenCalendars((prev) => ({ ...prev, [room.id]: !prev[room.id] }))}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          background: "none",
                          border: "none",
                          padding: "0",
                          cursor: "pointer",
                          color: "#1d4ed8",
                          fontSize: "11px",
                          fontWeight: 900,
                          textTransform: "uppercase",
                          letterSpacing: "0.1em",
                        }}
                      >
                        Room calendar & OTA sync
                        {openCalendars[room.id] ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </button>
                      {openCalendars[room.id] && (
                        <div style={{ display: "grid", gap: "14px", minWidth: 0, marginTop: "8px", marginBottom: "12px" }}>
                          {canManageRoomCalendar ? (
                            <div style={{ border: softButtonBorder, borderRadius: "18px", padding: "18px", background: softButtonBackground, minWidth: 0 }}>
                              <ChannelManagerTab
                                ownerType="stay_unit"
                                ownerId={room.id}
                                title={`${room.name || `Room ${index + 1}`} Calendar`}
                                description="Connect Airbnb, Booking.com, Google Calendar, or any ICS feed for this room only. Imports and exports stay attached to this room calendar."
                              />
                            </div>
                          ) : (
                            <div style={{ padding: "14px 16px", borderRadius: "14px", background: "#fff7ed", color: "#9a3412", fontSize: "13px", fontWeight: 700 }}>
                              Save this room once to unlock its separate iCal and OTA sync links.
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ) : null}

                  <div style={footerBarStyle}>
                    <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                      <button type="button" className={dashboardStyles.primaryBtn} style={{ width: "auto", minWidth: "auto", minHeight: "44px", padding: "0 18px", borderRadius: "14px", fontSize: "13px", fontWeight: 800 }} onClick={() => void saveRoom(room)} disabled={roomsSaving}>
                        {roomsSaving ? "Saving..." : "Save"}
                      </button>
                      {roomsMessage ? (
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            minHeight: "32px",
                            padding: "0 10px",
                            borderRadius: "999px",
                            fontSize: "12px",
                            fontWeight: 700,
                            color: roomsMessage === "Room saved." ? (isProDark ? "#bbf7d0" : "#166534") : (isProDark ? "#fecaca" : "#b91c1c"),
                            background: roomsMessage === "Room saved." ? (isProDark ? "rgba(20, 83, 45, 0.28)" : "#f0fdf4") : (isProDark ? "rgba(127, 29, 29, 0.26)" : "#fef2f2"),
                            border: roomsMessage === "Room saved." ? (isProDark ? "1px solid rgba(74, 222, 128, 0.16)" : "1px solid rgba(34, 197, 94, 0.12)") : (isProDark ? "1px solid rgba(248, 113, 113, 0.16)" : "1px solid rgba(239, 68, 68, 0.12)"),
                          }}
                        >
                          {roomsMessage}
                        </span>
                      ) : null}
                      <button type="button" className={dashboardStyles.primaryBtn} style={{ width: "auto", minWidth: "auto", minHeight: "44px", padding: "0 18px", borderRadius: "14px", background: "#b91c1c", color: "#fff", fontSize: "13px", fontWeight: 800 }} onClick={() => void removeRoom(room.id)} disabled={roomsSaving}>
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
