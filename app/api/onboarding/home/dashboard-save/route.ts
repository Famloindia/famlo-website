//app/api/onboarding/home/dashboard-save/route.ts

// app/api/onboarding/home/dashboard-save/route.ts
import { revalidatePath, revalidateTag } from "next/cache";
import { NextResponse } from "next/server";

import { getPanLastFour, isValidPanNumber, maskPanNumber, normalizePanNumber } from "@/lib/host-tax";
import { parseHostListingMeta, serializeHostListingMeta } from "@/lib/host-listing-meta";
import { maskCoordinates } from "@/lib/location-utils";
import { syncPrimaryStayUnitForFamily } from "@/lib/stay-units";
import { createAdminSupabaseClient } from "@/lib/supabase";

type JsonRecord = Record<string, unknown>;

function parseStringList(value: unknown): string[] {
  if (typeof value !== "string") {
    return [];
  }

  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toTrimmedString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function toStringListPatch(value: unknown): string[] | undefined {
  if (typeof value !== "string") return undefined;
  const items = parseStringList(value);
  return items.length > 0 ? items : undefined;
}

function toPositiveNumberPatch(value: unknown): number | undefined {
  const parsed = parseNullableNumber(value);
  return parsed != null && parsed > 0 ? parsed : undefined;
}

function cleanPatch<T extends JsonRecord>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, entryValue]) => entryValue !== undefined)
  ) as Partial<T>;
}

function extractMissingColumnFromSchemaError(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const message = "message" in error && typeof error.message === "string" ? error.message : "";
  const match = message.match(/Could not find the '([^']+)' column/i);
  return match?.[1] ?? null;
}

async function updateWithSchemaFallback(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  table: string,
  patch: JsonRecord,
  matchColumn: string,
  matchValue: string
): Promise<{ error: unknown; strippedColumns: string[] }> {
  const workingPatch: JsonRecord = { ...patch };
  const strippedColumns: string[] = [];

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const { error } = await supabase
      .from(table)
      .update(workingPatch as never)
      .eq(matchColumn, matchValue);

    if (!error) {
      return { error: null, strippedColumns };
    }

    const missingColumn = extractMissingColumnFromSchemaError(error);
    if (!missingColumn || !(missingColumn in workingPatch)) {
      return { error, strippedColumns };
    }

    delete workingPatch[missingColumn];
    strippedColumns.push(missingColumn);
  }

  return { error: new Error(`Schema fallback exhausted for ${table}`), strippedColumns };
}

function normalizePhotoUrlsFromList(listingPhotoUrls: unknown, photos: unknown): string[] {
  const fromPhotos =
    Array.isArray(photos)
      ? photos
          .map((item) => {
            if (!item || typeof item !== "object") {
              return null;
            }

            const row = item as JsonRecord;
            const url = typeof row.url === "string" ? row.url.trim() : "";
            const isPrimary = Boolean(row.isPrimary);
            return url.length > 0 ? { url, isPrimary } : null;
          })
          .filter((item): item is { url: string; isPrimary: boolean } => item !== null)
      : [];

  if (fromPhotos.length > 0) {
    const primaryIndex = fromPhotos.findIndex((item) => item.isPrimary);
    if (primaryIndex > 0) {
      const [primary] = fromPhotos.splice(primaryIndex, 1);
      fromPhotos.unshift(primary);
    }
    return fromPhotos.map((item) => item.url);
  }

  return parseStringList(listingPhotoUrls);
}

export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as {
    familyId?: string;
    profile?: Record<string, unknown>;
    listing?: Record<string, unknown>;
    schedule?: Record<string, unknown>;
    photos?: Array<Record<string, unknown>>;
    compliancePatch?: Record<string, unknown>;
  };

  if (!body.familyId) {
    return NextResponse.json({ error: "Missing family ID." }, { status: 400 });
  }

  const supabase = createAdminSupabaseClient();
  const warnings: string[] = [];

  try {
    console.info("[dashboard-save] start", {
      familyId: body.familyId,
      hasProfile: Boolean(body.profile),
      hasListing: Boolean(body.listing),
      hasSchedule: Boolean(body.schedule),
      hasPhotos: Array.isArray(body.photos) ? body.photos.length : 0,
    });
    const { data: family, error: familyLoadError } = await supabase
      .from("families")
      .select("admin_notes")
      .eq("id", body.familyId)
      .maybeSingle();

    if (familyLoadError) {
      throw familyLoadError;
    }

    const currentMeta = parseHostListingMeta(
      (family as { admin_notes?: string | null } | null)?.admin_notes ?? null
    );
    const panInput =
      typeof body.compliancePatch?.panNumber === "string"
        ? normalizePanNumber(body.compliancePatch.panNumber)
        : "";
    const panHolderName =
      typeof body.compliancePatch?.panHolderName === "string"
        ? body.compliancePatch.panHolderName.trim()
        : currentMeta.panHolderName ?? "";
    const panDateOfBirth =
      typeof body.compliancePatch?.panDateOfBirth === "string"
        ? body.compliancePatch.panDateOfBirth.trim() || null
        : currentMeta.panDateOfBirth ?? null;
    const panConsentGiven =
      typeof body.compliancePatch?.panConsentGiven === "boolean"
        ? body.compliancePatch.panConsentGiven
        : false;
    const panMasked =
      panInput && isValidPanNumber(panInput)
        ? maskPanNumber(panInput)
        : currentMeta.panMasked ?? "";
    const panLastFour =
      panInput && isValidPanNumber(panInput)
        ? getPanLastFour(panInput)
        : currentMeta.panLastFour ?? "";
    const panVerificationStatus = currentMeta.panVerificationStatus ?? "optional";
    const panVerificationProvider = currentMeta.panVerificationProvider ?? "";
    const panRiskFlag = Boolean(currentMeta.panRiskFlag);

    const photoUrls = normalizePhotoUrlsFromList(body.listing?.photoUrls, body.photos);
    const exactLat = parseNullableNumber(body.listing?.latitude);
    const exactLng = parseNullableNumber(body.listing?.longitude);
    const publicCoords =
      exactLat != null && exactLng != null
        ? maskCoordinates(exactLat, exactLng, body.familyId)
        : null;

    const nextMeta = {
      ...currentMeta,
      complianceNote: toTrimmedString(body.compliancePatch?.adminNotes) ?? currentMeta.complianceNote,
      pccFileName: toTrimmedString(body.compliancePatch?.pccFileName) ?? currentMeta.pccFileName,
      propertyProofFileName: toTrimmedString(body.compliancePatch?.propertyProofFileName) ?? currentMeta.propertyProofFileName,
      formCFileName: toTrimmedString(body.compliancePatch?.formCFileName) ?? currentMeta.formCFileName,
      hostHobbies: toTrimmedString(body.profile?.hostHobbies) ?? currentMeta.hostHobbies,
      hostCatchphrase: toTrimmedString(body.profile?.hostCatchphrase) ?? currentMeta.hostCatchphrase,
      hostDisplayName: toTrimmedString(body.profile?.hostDisplayName) ?? currentMeta.hostDisplayName,
      journeyStory: toTrimmedString(body.listing?.journeyStory) ?? currentMeta.journeyStory,
      specialExperience: toTrimmedString(body.listing?.specialExperience) ?? currentMeta.specialExperience,
      localExperience: toTrimmedString(body.listing?.localExperience) ?? currentMeta.localExperience,
      interactionType: toTrimmedString(body.listing?.interactionType) ?? currentMeta.interactionType,
      houseType: toTrimmedString(body.listing?.houseType) ?? currentMeta.houseType,
      hostSelfieUrl: toTrimmedString(body.profile?.hostSelfieUrl) ?? currentMeta.hostSelfieUrl,
      familyComposition: toTrimmedString(body.profile?.familyComposition) ?? currentMeta.familyComposition,
      culturalOffering: toTrimmedString(body.listing?.culturalOffering) ?? currentMeta.culturalOffering,
      bathroomType: toTrimmedString(body.listing?.bathroomType) ?? currentMeta.bathroomType,
      propertyAddress: toTrimmedString(body.listing?.propertyAddress) ?? currentMeta.propertyAddress,
      neighbourhood: toTrimmedString(body.profile?.cityNeighbourhood) ?? currentMeta.neighbourhood,
      listingTitle: toTrimmedString(body.listing?.listingTitle) ?? currentMeta.listingTitle,
      amenities: toStringListPatch(body.listing?.amenities) ?? currentMeta.amenities,
      commonAreas: toStringListPatch(body.listing?.commonAreas) ?? currentMeta.commonAreas,
      includedItems: toStringListPatch(body.listing?.includedItems) ?? currentMeta.includedItems,
      houseRules: toStringListPatch(body.listing?.houseRules) ?? currentMeta.houseRules,
      googleMapsLink: toTrimmedString(body.listing?.googleMapsLink) ?? currentMeta.googleMapsLink,

      // Only overwrite photos when the dashboard explicitly sent them
      photoUrls: photoUrls.length > 0 ? photoUrls : currentMeta.photoUrls,

      // New Onboarding Fields Sync
      panCardUrl: toTrimmedString(body.compliancePatch?.panCardUrl) ?? currentMeta.panCardUrl,
      panMasked,
      panLastFour,
      panHolderName: panHolderName || currentMeta.panHolderName,
      panDateOfBirth: panDateOfBirth ?? currentMeta.panDateOfBirth,
      panVerificationStatus,
      panVerificationProvider,
      panRiskFlag,
      propertyOwnershipUrl: toTrimmedString(body.compliancePatch?.propertyOwnershipUrl) ?? currentMeta.propertyOwnershipUrl,
      nocUrl: toTrimmedString(body.compliancePatch?.nocUrl) ?? currentMeta.nocUrl,
      policeVerificationUrl: toTrimmedString(body.compliancePatch?.policeVerificationUrl) ?? currentMeta.policeVerificationUrl,
      fssaiRegistrationUrl: toTrimmedString(body.compliancePatch?.fssaiRegistrationUrl) ?? currentMeta.fssaiRegistrationUrl,
      foodType: toTrimmedString(body.listing?.foodType) ?? currentMeta.foodType,
      checkInTime: toTrimmedString(body.listing?.checkInTime) ?? currentMeta.checkInTime,
      checkOutTime: toTrimmedString(body.listing?.checkOutTime) ?? currentMeta.checkOutTime,
      idDocumentType: toTrimmedString(body.compliancePatch?.idDocumentType) ?? currentMeta.idDocumentType,
      idDocumentUrl: toTrimmedString(body.compliancePatch?.idDocumentUrl) ?? currentMeta.idDocumentUrl,
      liveSelfieUrl: toTrimmedString(body.compliancePatch?.liveSelfieUrl) ?? currentMeta.liveSelfieUrl,
    };

    // ── Build families row patch (only real schema columns) ───────────────
    const familyPatch = cleanPatch({
      name:
        toTrimmedString(body.listing?.propertyName),
      host_phone:
        toTrimmedString(body.profile?.mobileNumber),
      host_photo_url:
        toTrimmedString(body.profile?.hostSelfieUrl),
      street_address:
        toTrimmedString(body.listing?.propertyAddress),
      village:
        toTrimmedString(body.profile?.cityNeighbourhood),
      city:
        toTrimmedString(body.profile?.city),
      state:
        toTrimmedString(body.profile?.state),
      // Write to both `about` and `about_story` so mobile app reads correctly
      about:
        toTrimmedString(body.listing?.hostBio),
      about_story:
        toTrimmedString(body.listing?.hostBio) ?? toTrimmedString(body.profile?.familyComposition),
      description:
        toTrimmedString(body.listing?.hostBio),
      famlo_experience:
        toTrimmedString(body.listing?.culturalOffering),
      family_composition:
        toTrimmedString(body.profile?.familyComposition),
      languages:
        toStringListPatch(body.profile?.languages),
      languages_spoken:
        toStringListPatch(body.profile?.languages),
      bathroom_type:
        toTrimmedString(body.listing?.bathroomType),
      common_areas:
        toStringListPatch(body.listing?.commonAreas),
      amenities:
        toStringListPatch(body.listing?.amenities),
      house_rules:
        toStringListPatch(body.listing?.houseRules),
      max_guests: body.schedule
        ? toPositiveNumberPatch(body.schedule.maxGuests)
        : undefined,
      is_active:
        typeof body.schedule?.isActive === "boolean"
          ? body.schedule.isActive
          : undefined,
      is_accepting:
        typeof body.schedule?.isAccepting === "boolean"
          ? body.schedule.isAccepting
          : undefined,
      booking_requires_host_approval:
        typeof body.schedule?.bookingRequiresHostApproval === "boolean"
          ? body.schedule.bookingRequiresHostApproval
          : undefined,
      active_quarters:
        toStringListPatch(body.schedule?.activeQuarters),
      blocked_dates:
        toStringListPatch(body.schedule?.blockedDates),
      google_maps_link:
        toTrimmedString(body.listing?.googleMapsLink),
      price_morning: parseNullableNumber(body.listing?.priceMorning),
      price_afternoon: parseNullableNumber(body.listing?.priceAfternoon),
      price_evening: parseNullableNumber(body.listing?.priceEvening),
      price_fullday: parseNullableNumber(body.listing?.priceFullday),
      lat: publicCoords?.lat,
      lng: publicCoords?.lng,
      lat_exact: exactLat,
      lng_exact: exactLng,
      landmarks: Array.isArray(body.listing?.landmarks) ? body.listing.landmarks : undefined,
      neighborhood_desc:
        toTrimmedString(body.listing?.neighborhoodDesc),
      accessibility_desc:
        toTrimmedString(body.listing?.accessibilityDesc),
      pincode:
        toTrimmedString(body.listing?.pincode),
      admin_notes: serializeHostListingMeta(nextMeta),
    });

    const {
      error: familyUpdateError,
      strippedColumns: strippedFamilyColumns,
    } = await updateWithSchemaFallback(
      supabase,
      "families",
      familyPatch as JsonRecord,
      "id",
      body.familyId
    );

    if (strippedFamilyColumns.length > 0) {
      warnings.push(`Family schema fallback: ${strippedFamilyColumns.join(", ")}`);
      console.warn("[dashboard-save] family:schema-fallback", {
        familyId: body.familyId,
        strippedColumns: strippedFamilyColumns,
      });
    }

    if (familyUpdateError) {
      console.error("[dashboard-save] family:update:error", {
        familyId: body.familyId,
        errorMessage: familyUpdateError instanceof Error ? familyUpdateError.message : String(familyUpdateError),
        error: familyUpdateError,
      });
      throw familyUpdateError;
    }

    console.info("[dashboard-save] family:update:success", { familyId: body.familyId });

    const hostPatch = cleanPatch({
      display_name:
        toTrimmedString(body.profile?.hostDisplayName) ?? toTrimmedString(body.listing?.propertyName),
      city:
        toTrimmedString(body.profile?.city),
      state:
        toTrimmedString(body.profile?.state),
      locality:
        toTrimmedString(body.profile?.cityNeighbourhood),
      address_private:
        toTrimmedString(body.listing?.propertyAddress),
      about:
        toTrimmedString(body.listing?.hostBio),
      family_story:
        toTrimmedString(body.listing?.culturalOffering),
      family_composition:
        toTrimmedString(body.profile?.familyComposition),
      languages:
        toStringListPatch(body.profile?.languages),
      amenities:
        toStringListPatch(body.listing?.amenities),
      house_rules:
        toStringListPatch(body.listing?.houseRules),
      bathroom_type:
        toTrimmedString(body.listing?.bathroomType),
      max_guests: body.schedule
        ? toPositiveNumberPatch(body.schedule.maxGuests)
        : undefined,
      price_morning: parseNullableNumber(body.listing?.priceMorning),
      price_afternoon: parseNullableNumber(body.listing?.priceAfternoon),
      price_evening: parseNullableNumber(body.listing?.priceEvening),
      price_fullday: parseNullableNumber(body.listing?.priceFullday),
      lat: publicCoords?.lat,
      lng: publicCoords?.lng,
      lat_exact: exactLat,
      lng_exact: exactLng,
      landmarks: Array.isArray(body.listing?.landmarks) ? body.listing.landmarks : undefined,
      neighborhood_desc:
        toTrimmedString(body.listing?.neighborhoodDesc),
      accessibility_desc:
        toTrimmedString(body.listing?.accessibilityDesc),
      pincode:
        toTrimmedString(body.listing?.pincode),
      platform_commission_pct: undefined,
      upi_id: undefined,
      status:
        typeof body.schedule?.isActive === "boolean"
          ? (body.schedule.isActive ? "published" : "draft")
          : undefined,
      is_accepting:
        typeof body.schedule?.isAccepting === "boolean"
          ? body.schedule.isAccepting
          : undefined,
      booking_requires_host_approval:
        typeof body.schedule?.bookingRequiresHostApproval === "boolean"
          ? body.schedule.bookingRequiresHostApproval
          : undefined,
    });

    const {
      error: hostUpdateError,
      strippedColumns: strippedHostColumns,
    } = await updateWithSchemaFallback(
      supabase,
      "hosts",
      hostPatch as JsonRecord,
      "legacy_family_id",
      body.familyId
    );

    if (strippedHostColumns.length > 0) {
      warnings.push(`Host schema fallback: ${strippedHostColumns.join(", ")}`);
      console.warn("[dashboard-save] host:schema-fallback", {
        familyId: body.familyId,
        strippedColumns: strippedHostColumns,
      });
    }

    if (hostUpdateError) {
      console.error("[dashboard-save] host:update:warning", {
        familyId: body.familyId,
        errorMessage: hostUpdateError instanceof Error ? hostUpdateError.message : String(hostUpdateError),
        error: hostUpdateError,
      });
      warnings.push(`Host sync skipped: ${hostUpdateError instanceof Error ? hostUpdateError.message : "unknown error"}`);
    } else {
      console.info("[dashboard-save] host:update:success", { familyId: body.familyId });
      try {
        await syncPrimaryStayUnitForFamily(supabase, { familyId: body.familyId });
      } catch (roomSyncError) {
        console.warn("[dashboard-save] stay-unit sync warning:", roomSyncError);
        warnings.push(`Room sync skipped: ${roomSyncError instanceof Error ? roomSyncError.message : "unknown error"}`);
      }
    }

    const { data: latestDraft, error: draftLookupError } = await supabase
      .from("host_onboarding_drafts")
      .select("id,payload,compliance,current_step,listing_status")
      .eq("family_id", body.familyId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (draftLookupError) {
      warnings.push(`Draft sync skipped: ${draftLookupError.message}`);
      console.warn("[dashboard-save] draft:lookup:warning", {
        familyId: body.familyId,
        errorMessage: draftLookupError.message,
      });
    } else if (latestDraft?.id) {
      const existingPayload =
        latestDraft.payload && typeof latestDraft.payload === "object" && !Array.isArray(latestDraft.payload)
          ? (latestDraft.payload as JsonRecord)
          : {};
      const nextDraftPayload = {
        ...existingPayload,
        propertyName: toTrimmedString(body.listing?.propertyName) ?? existingPayload.propertyName,
        hostName: toTrimmedString(body.profile?.hostDisplayName) ?? existingPayload.hostName,
        hostBio: toTrimmedString(body.listing?.hostBio) ?? existingPayload.hostBio,
        culturalActivity: toTrimmedString(body.listing?.culturalOffering) ?? existingPayload.culturalActivity,
        journeyStory: toTrimmedString(body.listing?.journeyStory) ?? existingPayload.journeyStory,
        specialExperience: toTrimmedString(body.listing?.specialExperience) ?? existingPayload.specialExperience,
        localExperience: toTrimmedString(body.listing?.localExperience) ?? existingPayload.localExperience,
        interactionType: toTrimmedString(body.listing?.interactionType) ?? existingPayload.interactionType,
        houseType: toTrimmedString(body.listing?.houseType) ?? existingPayload.houseType,
        listingTitle: toTrimmedString(body.listing?.listingTitle) ?? existingPayload.listingTitle,
        city: toTrimmedString(body.profile?.city) ?? existingPayload.city,
        state: toTrimmedString(body.profile?.state) ?? existingPayload.state,
        cityNeighbourhood: toTrimmedString(body.profile?.cityNeighbourhood) ?? existingPayload.cityNeighbourhood,
        propertyAddress: toTrimmedString(body.listing?.propertyAddress) ?? existingPayload.propertyAddress,
        checkInTime: toTrimmedString(body.listing?.checkInTime) ?? existingPayload.checkInTime,
        checkOutTime: toTrimmedString(body.listing?.checkOutTime) ?? existingPayload.checkOutTime,
        hostHobbies: toTrimmedString(body.profile?.hostHobbies) ?? existingPayload.hostHobbies,
        hostCatchphrase: toTrimmedString(body.profile?.hostCatchphrase) ?? existingPayload.hostCatchphrase,
        amenities: toStringListPatch(body.listing?.amenities) ?? existingPayload.amenities,
        commonAreas: toStringListPatch(body.listing?.commonAreas) ?? existingPayload.commonAreas,
        includedItems: toStringListPatch(body.listing?.includedItems) ?? existingPayload.includedItems,
        houseRules: toStringListPatch(body.listing?.houseRules) ?? existingPayload.houseRules,
        foodType: toTrimmedString(body.listing?.foodType) ?? existingPayload.foodType,
        bathroomType: toTrimmedString(body.listing?.bathroomType) ?? existingPayload.bathroomType,
        googleMapsLink: toTrimmedString(body.listing?.googleMapsLink) ?? existingPayload.googleMapsLink,
        neighborhoodDesc: toTrimmedString(body.listing?.neighborhoodDesc) ?? existingPayload.neighborhoodDesc,
        accessibilityDesc: toTrimmedString(body.listing?.accessibilityDesc) ?? existingPayload.accessibilityDesc,
        pincode: toTrimmedString(body.listing?.pincode) ?? existingPayload.pincode,
        landmarks: Array.isArray(body.listing?.landmarks) ? body.listing.landmarks : existingPayload.landmarks,
      };

      const { error: draftUpdateError } = await supabase
        .from("host_onboarding_drafts")
        .update({
          ...cleanPatch({
            primary_host_name: toTrimmedString(body.profile?.hostDisplayName) ?? toTrimmedString(body.listing?.propertyName),
            mobile_number: toTrimmedString(body.profile?.mobileNumber),
            city_neighbourhood: toTrimmedString(body.profile?.cityNeighbourhood),
            street_address: toTrimmedString(body.listing?.propertyAddress),
            state: toTrimmedString(body.profile?.state),
            family_composition: toTrimmedString(body.profile?.familyComposition),
            host_bio: toTrimmedString(body.listing?.hostBio),
            famlo_experience: toTrimmedString(body.listing?.culturalOffering),
            bathroom_type: toTrimmedString(body.listing?.bathroomType),
            common_areas: toStringListPatch(body.listing?.commonAreas),
            amenities: toStringListPatch(body.listing?.amenities),
            upi_id: undefined,
            neighborhood_desc: toTrimmedString(body.listing?.neighborhoodDesc),
            accessibility_desc: toTrimmedString(body.listing?.accessibilityDesc),
            pincode: toTrimmedString(body.listing?.pincode),
            current_step: latestDraft.current_step ?? undefined,
          }) as JsonRecord,
          payload: nextDraftPayload,
        })
        .eq("id", latestDraft.id);

      if (draftUpdateError) {
        console.warn("[dashboard-save] draft:update:warning", {
          familyId: body.familyId,
          errorMessage: draftUpdateError.message,
        });
        warnings.push(`Draft sync skipped: ${draftUpdateError.message}`);
      } else {
        console.info("[dashboard-save] draft:update:success", {
          familyId: body.familyId,
          draftId: latestDraft.id,
        });
      }
    }

    // ── Sync family_photos table ──────────────────────────────────────────
    // Only replace when the web dashboard explicitly sent a photos payload.
    const shouldReplacePhotos =
      (Array.isArray(body.photos) && body.photos.length > 0) ||
      typeof body.listing?.photoUrls === "string";

    if (shouldReplacePhotos) {
      const { error: deleteError } = await supabase
        .from("family_photos")
        .delete()
        .eq("family_id", body.familyId);

      if (deleteError) {
        console.error("[dashboard-save] photos:delete:warning", {
          familyId: body.familyId,
          errorMessage: deleteError.message,
          error: deleteError,
        });
        warnings.push(`Photo sync skipped: ${deleteError.message}`);
      } else if (photoUrls.length > 0) {
        const { error: photoInsertError } = await supabase.from("family_photos").insert(
          photoUrls.map((url, index) => ({
            family_id: body.familyId,
            url,
            is_primary: index === 0
          })) as never
        );

        if (photoInsertError) {
          console.error("[dashboard-save] photos:insert:warning", {
            familyId: body.familyId,
            errorMessage: photoInsertError.message,
            error: photoInsertError,
          });
          warnings.push(`Photo sync skipped: ${photoInsertError.message}`);
        } else {
          console.info("[dashboard-save] photos:success", {
            familyId: body.familyId,
            count: photoUrls.length,
          });
        }
      }
    }

    revalidateTag("homepage-discovery", "max");
    revalidateTag("home-route-resolution", "max");
    revalidatePath("/");
    revalidatePath("/homestays");
    revalidatePath(`/homes/${body.familyId}`);
    revalidatePath(`/partnerslogin/home/dashboard/preview/${body.familyId}`);
    revalidatePath("/partnerslogin/home/dashboard");

    console.info("[dashboard-save] success", { familyId: body.familyId, warnings });
    return NextResponse.json({ ok: true, warnings });
  } catch (error) {
    console.error("DEBUG SYNC ERROR:", error);
    const detail = error instanceof Error ? error.message : "Database connection lost or constraint violation.";
    return NextResponse.json(
      { error: `Sync failed: ${detail}` },
      { status: 500 }
    );
  }
}
