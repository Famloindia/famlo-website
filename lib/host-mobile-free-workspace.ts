import type { SupabaseClient } from "@supabase/supabase-js";

import {
  buildComplianceFromFamily,
  buildListingFromFamily,
  buildProfileFromFamily,
  buildScheduleFromFamily,
  parseFamilyMeta,
} from "@/lib/family-profile-editor";
import { loadHostFinanceSummary } from "@/lib/finance/host-finance-ui";
import { listHostPayouts } from "@/lib/finance/payout-admin";
import { resolveHostDisplayProfile } from "@/lib/host/resolve-host-display-profile";
import { resolvePublicPropertyMedia } from "@/lib/property-public-media";
import { buildHomestayPath } from "@/lib/slug";
import { loadStayUnitsForSelector } from "@/lib/stay-units";

type JsonRecord = Record<string, unknown>;

function createDevTrace(label: string, context: Record<string, string | number | null | undefined>) {
  const enabled = process.env.NODE_ENV !== "production";
  const startedAt = Date.now();
  let lastAt = startedAt;
  const steps: string[] = [];
  return {
    mark(step: string): void {
      if (!enabled) return;
      const now = Date.now();
      steps.push(`${step}=${now - lastAt}ms`);
      lastAt = now;
    },
    end(extra: Record<string, string | number | null | undefined> = {}): void {
      if (!enabled) return;
      const fields = { ...context, ...extra };
      const meta = Object.entries(fields)
        .filter(([, value]) => value != null)
        .map(([key, value]) => `${key}=${value}`)
        .join(" ");
      console.info(`${label} total=${Date.now() - startedAt}ms ${steps.join(" ")}${meta ? ` ${meta}` : ""}`);
    },
  };
}

type FreeWorkspaceBookingRow = {
  id: string;
  status: string;
  payment_status: string;
  created_at: string | null;
  start_date: string | null;
  end_date: string | null;
  total_price: number;
  partner_payout_amount: number;
  stay_unit_id: string | null;
  user_id: string | null;
  notes?: string | null;
  pricing_snapshot: JsonRecord | null;
  users:
    | {
        name?: string | null;
        city?: string | null;
        state?: string | null;
      }
    | Array<{
        name?: string | null;
        city?: string | null;
        state?: string | null;
      }>
    | null;
};

function bookingUser(row: FreeWorkspaceBookingRow): {
    name?: string | null;
    city?: string | null;
    state?: string | null;
  } | null {
  if (Array.isArray(row.users)) {
    return row.users[0] ?? null;
  }
  return row.users ?? null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0);
}

function asNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function joinUniqueLocationParts(values: Array<string | null>): string {
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const value of values) {
    const next = asString(value);
    if (!next) continue;
    const key = next.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    parts.push(next);
  }
  return parts.join(", ");
}

function normalizeToken(value: unknown): string {
  return asString(value)?.toLowerCase().replace(/[\s-]+/g, "_") ?? "";
}

function isMissingColumnError(error: unknown, columnName: string): boolean {
  if (!error || typeof error !== "object") return false;
  const record = error as { code?: unknown; message?: unknown };
  const message = typeof record.message === "string" ? record.message : "";
  return (
    record.code === "42703" &&
    (
      message.includes(`.${columnName}`) ||
      message.includes(`'${columnName}'`) ||
      message.includes(` ${columnName} `)
    )
  );
}

function errorCode(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const record = value as Record<string, unknown>;
  return typeof record.code === "string" ? record.code : "";
}

function documentUrl(
  documents: Array<{ kind: string; url: string | null }>,
  kinds: string[]
): string | null {
  const wanted = new Set(kinds);
  return documents.find((item) => wanted.has(item.kind) && asString(item.url))?.url ?? null;
}

function startOfDay(date: Date): Date {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function endOfDay(date: Date): Date {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function firstDayOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function firstDayOfYear(date: Date): Date {
  return new Date(date.getFullYear(), 0, 1);
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function bookingStart(row: FreeWorkspaceBookingRow): string {
  return asString(row.start_date) ?? "";
}

function bookingEnd(row: FreeWorkspaceBookingRow): string {
  return asString(row.end_date) ?? bookingStart(row);
}

function bookingGross(row: FreeWorkspaceBookingRow): number {
  return asNumber(row.total_price);
}

function bookingNetEarnings(row: FreeWorkspaceBookingRow, commissionPct: number): number {
  const payout = asNumber(row.partner_payout_amount);
  if (payout > 0) return payout;
  return Math.round(bookingGross(row) * ((100 - commissionPct) / 100));
}

function bookingSource(row: FreeWorkspaceBookingRow): "manual" | "famlo" | "ota" {
  const pricing = row.pricing_snapshot ?? {};
  const sourceChannel = normalizeToken((pricing as JsonRecord).source_channel);
  const channelProvider = normalizeToken((pricing as JsonRecord).channel_provider);
  if (sourceChannel === "pms_manual" || sourceChannel === "manual" || sourceChannel === "walk_in") {
    return "manual";
  }
  if (channelProvider === "channex") {
    return "ota";
  }
  return "famlo";
}

function bookingSourceLabel(row: FreeWorkspaceBookingRow): string {
  const pricing = row.pricing_snapshot ?? {};
  const providerName =
    asString((pricing as JsonRecord).channel_name) ??
    asString((pricing as JsonRecord).provider_name) ??
    asString((pricing as JsonRecord).source_label);
  const source = bookingSource(row);
  if (source === "manual") return "Manual";
  if (source === "ota") return providerName ?? "OTA / iCal";
  return "Famlo";
}

function bookingGuestName(row: FreeWorkspaceBookingRow): string {
  return asString(bookingUser(row)?.name) ?? "Famlo guest";
}

function isCancelledStatus(status: string): boolean {
  return ["cancelled", "cancelled_by_user", "cancelled_by_partner", "rejected"].includes(status);
}

function isPendingApprovalStatus(status: string): boolean {
  return status === "pending_host_approval" || status === "pending";
}

function isConfirmedStatus(row: FreeWorkspaceBookingRow): boolean {
  const status = normalizeToken(row.status);
  if (["accepted", "confirmed", "completed", "checked_in"].includes(status)) return true;
  return normalizeToken(row.payment_status) === "paid" && !isCancelledStatus(status);
}

function isReviewStatus(row: FreeWorkspaceBookingRow): boolean {
  return normalizeToken(row.status).includes("review");
}

function inRange(value: string, from: Date, to: Date): boolean {
  if (!value) return false;
  const parsed = new Date(`${value}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return false;
  return parsed >= from && parsed <= to;
}

function buildSnapshotRange(preset: "today" | "week" | "month" | "year"): { from: Date; to: Date; label: string } {
  const now = new Date();
  if (preset === "today") {
    return { from: startOfDay(now), to: endOfDay(now), label: "Today" };
  }
  if (preset === "week") {
    const start = startOfDay(now);
    return { from: start, to: endOfDay(addDays(start, 6)), label: "This Week" };
  }
  if (preset === "year") {
    const start = firstDayOfYear(now);
    return { from: start, to: endOfDay(now), label: "This Year" };
  }
  const start = firstDayOfMonth(now);
  return { from: start, to: endOfDay(now), label: "This Month" };
}

function toMobileBookingRow(row: FreeWorkspaceBookingRow, roomName: string | null, familyId: string): Record<string, unknown> {
  const sourceCategory = bookingSource(row);
  const status = normalizeToken(row.status);
  return {
    id: row.id,
    bookingId: row.id,
    status,
    payment_status: normalizeToken(row.payment_status),
    paymentStatus: normalizeToken(row.payment_status),
    createdAt: row.created_at,
    startDate: bookingStart(row),
    endDate: bookingEnd(row),
    total_price: bookingGross(row),
    family_payout: asNumber(row.partner_payout_amount),
    stay_unit_id: row.stay_unit_id,
    roomName,
    sourceLabel: bookingSourceLabel(row),
    sourceCategory,
    isOta: sourceCategory === "ota",
    isReviewOnly: isReviewStatus(row),
    guestDisplayName: bookingGuestName(row),
    guestEmail: null,
    guestPhone: null,
    users: bookingUser(row),
    family_id: familyId,
  };
}

type FreeWorkspaceRoomSummary = {
  id: string;
  name: string;
  unitType: string;
  maxGuests: number;
  priceFullday: number;
  isActive: boolean;
};

async function loadCompactFreeWorkspaceRooms(
  supabase: SupabaseClient,
  input: { familyId: string; hostId: string | null }
): Promise<FreeWorkspaceRoomSummary[]> {
  let query = supabase
    .from("stay_units_v2")
    .select("id,name,unit_type,max_guests,price_fullday,is_active,is_primary,sort_order,updated_at")
    .order("is_primary", { ascending: false })
    .order("sort_order", { ascending: true })
    .order("updated_at", { ascending: false })
    .limit(200);

  query = input.hostId ? query.eq("host_id", input.hostId) : query.eq("legacy_family_id", input.familyId);
  const { data, error } = await query;
  if (error) {
    return loadStayUnitsForSelector(supabase, { hostId: input.hostId, legacyFamilyId: input.familyId }).then((rows) =>
      rows.map((row) => ({
        id: row.id,
        name: row.name,
        unitType: row.unitType,
        maxGuests: row.maxGuests,
        priceFullday: row.priceFullday,
        isActive: row.isActive !== false,
      }))
    );
  }

  const compactRows = ((data ?? []) as JsonRecord[]).map((row) => ({
    id: asString(row.id) ?? "",
    name: asString(row.name) ?? "Room",
    unitType: asString(row.unit_type) ?? "private_room",
    maxGuests: Math.max(1, asNumber(row.max_guests) || 1),
    priceFullday: asNumber(row.price_fullday),
    isActive: row.is_active !== false,
  })).filter((row) => row.id);

  return compactRows.length > 0
    ? compactRows
    : loadStayUnitsForSelector(supabase, { hostId: input.hostId, legacyFamilyId: input.familyId }).then((rows) =>
        rows.map((row) => ({
          id: row.id,
          name: row.name,
          unitType: row.unitType,
          maxGuests: row.maxGuests,
          priceFullday: row.priceFullday,
          isActive: row.isActive !== false,
        }))
      );
}

async function loadFreeWorkspaceBookingRows(
  supabase: SupabaseClient,
  hostId: string
): Promise<{ data: FreeWorkspaceBookingRow[]; error: unknown | null }> {
  const selectWithStayUnit =
    "id,status,payment_status,created_at,start_date,end_date,total_price,partner_payout_amount,user_id,stay_unit_id,pricing_snapshot,users!user_id(name)";
  const selectFallback =
    "id,status,payment_status,created_at,start_date,end_date,total_price,partner_payout_amount,user_id,pricing_snapshot,users!user_id(name)";
  const primaryResult = await supabase
    .from("bookings_v2")
    .select(selectWithStayUnit)
    .eq("host_id", hostId)
    .order("start_date", { ascending: false })
    .limit(200);

  if (primaryResult.error && isMissingColumnError(primaryResult.error, "stay_unit_id")) {
    const fallbackResult = await supabase
      .from("bookings_v2")
      .select(selectFallback)
      .eq("host_id", hostId)
      .order("start_date", { ascending: false })
      .limit(200);
    return {
      data: ((fallbackResult.data ?? []) as JsonRecord[]).map((row) => ({
        ...row,
        stay_unit_id: asString(row.stay_unit_id) ?? asString(asRecord(row.pricing_snapshot).stay_unit_id),
      })) as FreeWorkspaceBookingRow[],
      error: fallbackResult.error,
    };
  }

  return {
    data: ((primaryResult.data ?? []) as FreeWorkspaceBookingRow[]) ?? [],
    error: primaryResult.error,
  };
}

export async function loadHostMobileFreeWorkspace(
  supabase: SupabaseClient,
  input: {
    familyId: string;
    hostId: string | null;
    hostUserId: string | null;
    hostDisplayName: string | null;
    view?: "critical" | "full";
  }
): Promise<Record<string, unknown>> {
  const { familyId, hostId, hostUserId } = input;
  const view = input.view === "critical" ? "critical" : "full";
  const trace = createDevTrace("[host.mobile.free-workspace:helper]", { familyId, hostId });

  const familyResult = await supabase
    .from("families")
    .select(
      view === "critical"
        ? "id,name,village,city,state,is_active,is_accepting,booking_requires_host_approval,max_guests,active_quarters,blocked_dates,platform_commission_pct"
        : "*"
    )
    .eq("id", familyId)
    .maybeSingle();
  if (familyResult.error) throw familyResult.error;
  const family = (familyResult.data ?? null) as JsonRecord | null;
  if (!family) {
    throw new Error("Selected Famlo host property could not be found.");
  }
  trace.mark("family");

  const [hostResult, stayUnits, bookingResult, draftResult] = await Promise.all([
    hostId
      ? supabase
          .from("hosts")
          .select(view === "critical" ? "id,display_name" : "*")
          .eq("id", hostId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    view === "critical"
      ? loadCompactFreeWorkspaceRooms(supabase, { familyId, hostId })
      : loadStayUnitsForSelector(supabase, { hostId, legacyFamilyId: familyId }),
    hostId
      ? loadFreeWorkspaceBookingRows(supabase, hostId)
      : Promise.resolve({ data: [], error: null }),
    view === "full"
      ? supabase
          .from("host_onboarding_drafts")
          .select("*")
          .eq("family_id", familyId)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (hostResult.error) throw hostResult.error;
  if (bookingResult.error) throw bookingResult.error;
  if (draftResult.error) throw draftResult.error;
  trace.mark("base_parallel");

  const hostTaxDetailsRow = null;
  const latestDraft = (draftResult.data ?? null) as JsonRecord | null;
  const draftPayload = asRecord(latestDraft?.payload);
  const draftCompliance = asRecord(latestDraft?.compliance);
  const draftGallery = view === "full"
    ? [
        ...asStringArray(latestDraft?.images),
        ...asStringArray(draftPayload.hostGalleryPhotos),
        ...asStringArray(draftPayload.photos),
        ...asStringArray(draftPayload.images),
      ]
    : [];
  const familyForProfile: JsonRecord = view === "full"
    ? {
        ...family,
        latest_onboarding_payload: {
          ...draftPayload,
          idDocumentUrl:
            asString(draftPayload.idDocumentUrl) ??
            asString(draftPayload.idDocumentPhotoUrl) ??
            asString(draftCompliance.idDocumentUrl) ??
            asString(draftCompliance.idDocumentPhotoUrl),
          idDocumentPhotoUrl:
            asString(draftPayload.idDocumentPhotoUrl) ??
            asString(draftPayload.idDocumentUrl) ??
            asString(draftCompliance.idDocumentPhotoUrl) ??
            asString(draftCompliance.idDocumentUrl),
          liveSelfieUrl:
            asString(draftPayload.liveSelfieUrl) ??
            asString(draftCompliance.liveSelfieUrl) ??
            asString(latestDraft?.live_selfie_url),
          propertyOwnershipProofUrl:
            asString(draftPayload.propertyOwnershipProofUrl) ??
            asString(draftPayload.propertyOwnershipUrl) ??
            asString(draftCompliance.propertyOwnershipProofUrl) ??
            asString(draftCompliance.propertyOwnershipUrl) ??
            asString(latestDraft?.property_ownership_proof_url),
          panCardUrl: asString(draftPayload.panCardUrl) ?? asString(draftCompliance.panCardUrl),
          nocDocumentUrl: asString(draftPayload.nocDocumentUrl) ?? asString(draftCompliance.nocDocumentUrl),
          hostGalleryPhotos: draftGallery,
          hostReelPublicUrl:
            asString(draftPayload.hostReelPublicUrl) ??
            asString(draftCompliance.hostReelPublicUrl) ??
            asString(latestDraft?.host_reel_public_url) ??
            asString(family.host_reel_public_url),
          hostReelStorageKey:
            asString(draftPayload.hostReelStorageKey) ??
            asString(draftCompliance.hostReelStorageKey) ??
            asString(latestDraft?.host_reel_storage_key) ??
            asString(family.host_reel_storage_key),
          hostReelMimeType:
            asString(draftPayload.hostReelMimeType) ??
            asString(draftCompliance.hostReelMimeType) ??
            asString(latestDraft?.host_reel_mime_type) ??
            asString(family.host_reel_mime_type),
          hostReelSizeBytes:
            asNumber(draftPayload.hostReelSizeBytes) ||
            asNumber(draftCompliance.hostReelSizeBytes) ||
            asNumber(latestDraft?.host_reel_size_bytes) ||
            asNumber(family.host_reel_size_bytes) ||
            null,
          hostReelUploadedAt:
            asString(draftPayload.hostReelUploadedAt) ??
            asString(draftCompliance.hostReelUploadedAt) ??
            asString(latestDraft?.host_reel_uploaded_at),
        },
        host_photo_url: asString(family.host_photo_url) ?? asString(latestDraft?.host_photo_url),
        id_document_url:
          asString(latestDraft?.id_document_photo_url) ??
          asString(draftPayload.idDocumentPhotoUrl) ??
          asString(draftPayload.idDocumentUrl) ??
          asString(draftCompliance.idDocumentPhotoUrl) ??
          asString(draftCompliance.idDocumentUrl),
        live_selfie_url:
          asString(latestDraft?.live_selfie_url) ??
          asString(draftPayload.liveSelfieUrl) ??
          asString(draftCompliance.liveSelfieUrl),
        gstin: asString(latestDraft?.gstin) ?? asString(draftPayload.gstin) ?? asString(draftCompliance.gstin),
      }
    : family;
  const propertyMedia = view === "full"
    ? await resolvePublicPropertyMedia(supabase, {
        familyId,
        hostId,
        debugContext: "host-mobile-free-workspace",
      })
    : { gallery: [], reels: [] };
  trace.mark(view === "full" ? "property_media" : "property_media_skipped");
  const fallbackGallery = Array.from(new Set(draftGallery)).map((url, index) => ({
    id: `draft-gallery-${index + 1}`,
    url,
    isPrimary: index === 0,
    createdAt: asString(latestDraft?.updated_at) ?? "",
    source: "family_photos" as const,
  }));
  const gallery = propertyMedia.gallery.length > 0 ? propertyMedia.gallery : fallbackGallery;
  const onboardingPayloadRecord = asRecord(familyForProfile.latest_onboarding_payload);
  const fallbackReelPublicUrl =
    asString(onboardingPayloadRecord.hostReelPublicUrl) ??
    asString(family.host_reel_public_url);
  const fallbackReels = fallbackReelPublicUrl
    ? [
        {
          id: "draft-reel-1",
          publicUrl: fallbackReelPublicUrl,
          storageKey: asString(onboardingPayloadRecord.hostReelStorageKey),
          mimeType: asString(onboardingPayloadRecord.hostReelMimeType) ?? "video/mp4",
          sizeBytes: asNumber(onboardingPayloadRecord.hostReelSizeBytes) || null,
          durationSeconds: null,
          width: null,
          height: null,
          isFeatured: true,
          createdAt: asString(onboardingPayloadRecord.hostReelUploadedAt) ?? asString(latestDraft?.updated_at) ?? "",
          updatedAt: asString(onboardingPayloadRecord.hostReelUploadedAt) ?? asString(latestDraft?.updated_at) ?? "",
          source: "family_legacy_reel" as const,
        },
      ]
    : [];
  const reels = propertyMedia.reels.length > 0 ? propertyMedia.reels : fallbackReels;

  const displayProfile = view === "full"
    ? await resolveHostDisplayProfile(supabase, {
        hostUserId,
        familyId,
        hostRow: (hostResult.data as JsonRecord | null) ?? null,
        familyRow: familyForProfile,
        onboardingPayload: familyForProfile.latest_onboarding_payload,
        rooms: stayUnits,
        gallery: gallery.map((item) => ({ url: item.url, source: item.source })),
        reel: reels[0] ? { publicUrl: reels[0].publicUrl, source: reels[0].source } : null,
        proStatus: "inactive",
      })
    : ({
        hostName: null,
        hostEmail: null,
        hostPhone: null,
        city: null,
        state: null,
        profilePhoto: null,
        preferredLanguage: null,
        reel: null,
        propertyName: null,
        propertyAddress: null,
        gstin: null,
        gallery: [],
        rooms: [],
        proStatus: "inactive",
        channelMappingStatus: "unmapped",
        documents: [],
        sources: {},
      } as unknown as Awaited<ReturnType<typeof resolveHostDisplayProfile>>);
  trace.mark(view === "full" ? "display_profile" : "display_profile_skipped");

  const meta = parseFamilyMeta(familyForProfile.admin_notes);
  const profile = buildProfileFromFamily(familyForProfile, meta);
  const listing = buildListingFromFamily(familyForProfile, meta);
  const schedule = buildScheduleFromFamily(family);
  const compliance = buildComplianceFromFamily(
    familyForProfile,
    meta,
    hostTaxDetailsRow
  );
  const displayDocuments = displayProfile.documents;
  const enrichedProfile = {
    ...profile,
    hostDisplayName: profile.hostDisplayName || displayProfile.hostName,
    email: profile.email || displayProfile.hostEmail,
    mobileNumber: profile.mobileNumber || displayProfile.hostPhone,
    city: profile.city || displayProfile.city,
    state: profile.state || displayProfile.state,
    hostSelfieUrl: profile.hostSelfieUrl || displayProfile.profilePhoto || "",
    languages: profile.languages || displayProfile.preferredLanguage,
    syncSources: displayProfile.sources,
  };
  const enrichedListing = {
    ...listing,
    propertyName: listing.propertyName || displayProfile.propertyName,
    propertyAddress: listing.propertyAddress || displayProfile.propertyAddress,
    hostReelPublicUrl: listing.hostReelPublicUrl || displayProfile.reel || "",
  };
  const enrichedCompliance = {
    ...compliance,
    propertyOwnershipUrl: compliance.propertyOwnershipUrl || documentUrl(displayDocuments, ["property_ownership_proof"]) || "",
    liveSelfieUrl: compliance.liveSelfieUrl || documentUrl(displayDocuments, ["live_selfie"]) || "",
    idDocumentUrl: compliance.idDocumentUrl || documentUrl(displayDocuments, ["id_proof"]) || "",
    panCardUrl: compliance.panCardUrl || documentUrl(displayDocuments, ["pan_card"]) || "",
    nocUrl: compliance.nocUrl || documentUrl(displayDocuments, ["noc_permission"]) || "",
    displayDocuments,
    documentSource: displayProfile.sources.documents,
  };

  const roomNameById = new Map(stayUnits.map((room) => [room.id, room.name]));
  const activeRooms = stayUnits.filter((room) => room.isActive !== false);
  const totalCapacity = stayUnits.reduce((sum, room) => sum + Math.max(0, Number(room.maxGuests ?? 0)), 0);
  const activeCapacity = activeRooms.reduce((sum, room) => sum + Math.max(0, Number(room.maxGuests ?? 0)), 0);

  const commissionPct = Math.max(0, Math.min(100, asNumber(family.platform_commission_pct) || 16));
  const bookingRows = ((bookingResult.data ?? []) as FreeWorkspaceBookingRow[]).filter((row) => {
    const status = normalizeToken(row.status);
    return status.length > 0;
  });
  const nonCancelledBookings = bookingRows.filter((row) => !isCancelledStatus(normalizeToken(row.status)));
  const pendingApprovalRows = bookingRows.filter((row) => isPendingApprovalStatus(normalizeToken(row.status)));
  const totalGrossBookingValue = nonCancelledBookings.reduce((sum, row) => sum + bookingGross(row), 0);
  const totalEarnings = nonCancelledBookings.reduce((sum, row) => sum + bookingNetEarnings(row, commissionPct), 0);
  const now = new Date();
  const checkInsToday = nonCancelledBookings.filter((row) => bookingStart(row) === isoDate(now)).length;
  const checkOutsToday = nonCancelledBookings.filter((row) => bookingEnd(row) === isoDate(now)).length;

  const snapshots = (["today", "week", "month", "year"] as const).map((preset) => {
    const range = buildSnapshotRange(preset);
    const rows = bookingRows.filter((row) => inRange(bookingStart(row), range.from, range.to));
    const liveRows = rows.filter((row) => !isCancelledStatus(normalizeToken(row.status)));
    return {
      key: preset,
      label: range.label,
      from: isoDate(range.from),
      to: isoDate(range.to),
      totalBookings: rows.length,
      confirmedCount: rows.filter(isConfirmedStatus).length,
      pendingCount: rows.filter((row) => isPendingApprovalStatus(normalizeToken(row.status))).length,
      cancelledCount: rows.filter((row) => isCancelledStatus(normalizeToken(row.status))).length,
      reviewCount: rows.filter(isReviewStatus).length,
      grossAmount: liveRows.reduce((sum, row) => sum + bookingGross(row), 0),
      earningsAmount: liveRows.reduce((sum, row) => sum + bookingNetEarnings(row, commissionPct), 0),
    };
  });

  const financeAccess = hostId
    ? {
        hostId,
        hostUserId,
        familyId,
        displayName: input.hostDisplayName,
      }
    : null;
  let financeSummary: Record<string, unknown> | null = null;
  if (financeAccess && view === "full") {
    try {
      financeSummary = (await loadHostFinanceSummary(supabase, financeAccess)) as Record<string, unknown>;
    } catch (error) {
      console.warn("[host.mobile.free-workspace] finance summary fallback", {
        familyId,
        hostId,
        code: errorCode(error),
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
  trace.mark(view === "full" ? "finance_summary" : "finance_summary_skipped");
  let payoutsRaw: Record<string, unknown>[] = [];
  if (hostId && view === "full") {
    try {
      payoutsRaw = await listHostPayouts(supabase, hostId);
    } catch (error) {
      console.warn("[host.mobile.free-workspace] payouts fallback", {
        familyId,
        hostId,
        code: errorCode(error),
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
  trace.mark(view === "full" ? "payouts" : "payouts_skipped");
  const payouts = payoutsRaw.map((row) => ({
    id: asString(row.id) ?? "",
    settlementId: asString(row.settlementId) ?? "",
    settlementCode: asString(row.settlementCode) ?? "",
    amount: asNumber(row.amount),
    status: asString(row.status) ?? "",
    expectedOrProcessedDate: asString(row.expectedOrProcessedDate),
    failureReason: asString(row.failureReason),
    destinationMasked: asString(row.destinationMasked) ?? "",
  }));

  const response = {
    ok: true,
    detailLevel: view,
    familyId,
    property: {
      familyId,
      name: asString(family.name) ?? "Property",
      displayName: asString(family.name) ?? "Property",
      ownerName:
        enrichedProfile.hostDisplayName ||
        displayProfile.hostName ||
        input.hostDisplayName ||
        asString(family.primary_host_name) ||
        asString(family.host_name) ||
        "Famlo host",
      locationLabel: joinUniqueLocationParts([asString(family.village), asString(family.city), asString(family.state)]) || "Location pending",
      isActive: schedule.isActive,
      isAccepting: schedule.isAccepting,
      bookingRequiresHostApproval: schedule.bookingRequiresHostApproval,
      listingPreviewHref: buildHomestayPath(
        asString(family.name) ?? "Homestay",
        asString(family.village) ?? asString(family.locality),
        asString(family.city),
        familyId
      ),
      commissionPct,
      totalRooms: stayUnits.length,
      activeRooms: activeRooms.length,
      totalCapacity,
      activeCapacity,
    },
    hostProfile: view === "full" ? enrichedProfile : {},
    hostPropertyContent: view === "full" ? enrichedListing : {},
    hostProfileCompliance: view === "full" ? enrichedCompliance : {},
    schedule,
    dashboard: {
      checkInsToday,
      checkOutsToday,
      pendingApprovalCount: pendingApprovalRows.length,
      totalBookings: nonCancelledBookings.length,
      confirmedCount: bookingRows.filter(isConfirmedStatus).length,
      cancelledCount: bookingRows.filter((row) => isCancelledStatus(normalizeToken(row.status))).length,
      reviewCount: bookingRows.filter(isReviewStatus).length,
      totalGrossBookingValue,
      totalEarnings,
      activeRooms: activeRooms.length,
      activeCapacity,
      pendingApprovals: pendingApprovalRows.slice(0, 8).map((row) =>
        toMobileBookingRow(row, roomNameById.get(asString(row.stay_unit_id) ?? "") ?? null, familyId)
      ),
      snapshots,
      payouts: view === "full" ? payouts : [],
      financeSummary: view === "full" ? financeSummary : null,
    },
    propertyMedia: view === "full" ? gallery.map((photo) => ({
      id: photo.id,
      url: photo.url,
      isPrimary: Boolean(photo.isPrimary),
      familyId,
      source: photo.source,
      createdAt: photo.createdAt,
    })) : [],
    propertyReels: view === "full" ? reels.map((reel) => ({
      id: reel.id,
      familyId,
      publicUrl: reel.publicUrl,
      storageKey: reel.storageKey,
      mimeType: reel.mimeType,
      sizeBytes: reel.sizeBytes || null,
      isFeatured: Boolean(reel.isFeatured),
      status: "active",
      createdAt: reel.createdAt,
      updatedAt: reel.updatedAt,
    })) : [],
    support: {
      contactEmail: "support@famlo.in",
      faqKeys: ["listing_active", "booking_approval", "documents", "join_pro"],
    },
  };
  trace.end({
    rooms: stayUnits.length,
    bookings: bookingRows.length,
    gallery: gallery.length,
    reels: reels.length,
    view,
  });
  return response;
}
