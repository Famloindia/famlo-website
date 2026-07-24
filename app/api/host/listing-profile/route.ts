import { revalidatePath, revalidateTag } from "next/cache";
import { NextRequest, NextResponse } from "next/server";

import { resolveAuthorizedHostResource } from "@/lib/host-access";
import { normalizeGstin } from "@/lib/host-onboarding-legal";
import { parseHostListingMeta, serializeHostListingMeta } from "@/lib/host-listing-meta";
import {
  getHostPropertyListingProfile,
  normalizeListingTime,
  updateHostPropertyListingProfile,
} from "@/lib/host-property-profile";
import { createAdminSupabaseClient } from "@/lib/supabase";

type JsonRecord = Record<string, unknown>;

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function asList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(asString).filter(Boolean);
  if (typeof value !== "string") return [];
  return value.split(/[\n,]/).map((item) => item.trim()).filter(Boolean);
}

function compact(value: JsonRecord): JsonRecord {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validateProfilePatch(body: {
  identity?: unknown;
  property?: unknown;
  schedule?: unknown;
  compliance?: unknown;
  pricing?: unknown;
}): string | null {
  for (const section of ["identity", "property", "schedule", "compliance", "pricing"] as const) {
    if (body[section] !== undefined && !isRecord(body[section])) {
      return `${section} must be an object.`;
    }
  }

  const identity = isRecord(body.identity) ? body.identity : {};
  const property = isRecord(body.property) ? body.property : {};
  const textLimits: Array<[JsonRecord, string, number]> = [
    [identity, "displayName", 120],
    [identity, "profilePhotoUrl", 2048],
    [identity, "biography", 5000],
    [property, "propertyName", 180],
    [property, "listingTitle", 180],
    [property, "hostBio", 5000],
    [property, "city", 120],
    [property, "state", 120],
    [property, "locality", 180],
    [property, "journeyStory", 8000],
    [property, "specialExperience", 8000],
    [property, "localExperience", 8000],
    [property, "culturalOffering", 5000],
    [property, "homeType", 120],
    [property, "interactionType", 120],
    [property, "bathroomType", 120],
    [property, "streetAddress", 500],
    [property, "googleMapsLink", 2048],
    [property, "neighborhoodDescription", 3000],
    [property, "accessibilityDescription", 3000],
    [property, "pincode", 20],
    [property, "familyType", 120],
  ];
  for (const [section, key, limit] of textLimits) {
    if (!Object.prototype.hasOwnProperty.call(section, key) || section[key] === null) continue;
    if (typeof section[key] !== "string") return `${key} must be text or null.`;
    if ((section[key] as string).trim().length > limit) return `${key} must be ${limit} characters or fewer.`;
  }
  for (const [section, key] of [[identity, "displayName"], [property, "propertyName"]] as const) {
    if (Object.prototype.hasOwnProperty.call(section, key) && !asString(section[key])) {
      return `${key} cannot be empty.`;
    }
  }

  const listFields: Array<[JsonRecord, string]> = [
    [identity, "hobbies"],
    [identity, "languages"],
    [property, "houseRules"],
    [property, "amenities"],
    [property, "foodTypes"],
    [property, "includedItems"],
    [property, "commonAreas"],
  ];
  for (const [section, key] of listFields) {
    if (!Object.prototype.hasOwnProperty.call(section, key)) continue;
    if (!Array.isArray(section[key]) && typeof section[key] !== "string") {
      return `${key} must be a list of text values.`;
    }
    const values = asList(section[key]);
    if (values.length > 100) return `${key} cannot contain more than 100 values.`;
    if (values.some((value) => value.length > 180)) return `${key} values must be 180 characters or fewer.`;
  }
  for (const key of ["checkInTime", "checkOutTime"] as const) {
    if (!Object.prototype.hasOwnProperty.call(property, key)) continue;
    const value = asString(property[key]);
    if (value && !normalizeListingTime(value)) return `${key} must be a valid time.`;
  }
  if (
    Object.prototype.hasOwnProperty.call(property, "nearbyPlaces") &&
    (!Array.isArray(property.nearbyPlaces) || property.nearbyPlaces.length > 50)
  ) {
    return "nearbyPlaces must be an array with at most 50 entries.";
  }
  return null;
}

async function updateSettings(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  input: {
    familyId: string;
    schedule?: JsonRecord;
    compliance?: JsonRecord;
    pricing?: JsonRecord;
  }
): Promise<void> {
  const schedule = input.schedule ?? {};
  const pricing = input.pricing ?? {};
  const familyPatch = compact({
    is_active: typeof schedule.isActive === "boolean" ? schedule.isActive : undefined,
    is_accepting: typeof schedule.isAccepting === "boolean" ? schedule.isAccepting : undefined,
    booking_requires_host_approval:
      typeof schedule.bookingRequiresHostApproval === "boolean"
        ? schedule.bookingRequiresHostApproval
        : undefined,
    max_guests: asNumber(schedule.maxGuests) ?? undefined,
    active_quarters: Object.prototype.hasOwnProperty.call(schedule, "activeQuarters")
      ? asList(schedule.activeQuarters)
      : undefined,
    blocked_dates: Object.prototype.hasOwnProperty.call(schedule, "blockedDates")
      ? asList(schedule.blockedDates)
      : undefined,
    price_morning: Object.prototype.hasOwnProperty.call(pricing, "priceMorning") ? asNumber(pricing.priceMorning) : undefined,
    price_afternoon: Object.prototype.hasOwnProperty.call(pricing, "priceAfternoon") ? asNumber(pricing.priceAfternoon) : undefined,
    price_evening: Object.prototype.hasOwnProperty.call(pricing, "priceEvening") ? asNumber(pricing.priceEvening) : undefined,
    price_fullday: Object.prototype.hasOwnProperty.call(pricing, "priceFullday") ? asNumber(pricing.priceFullday) : undefined,
  });
  if (Object.keys(familyPatch).length > 0) {
    const { error } = await supabase.from("families").update(familyPatch as never).eq("id", input.familyId);
    if (error) throw error;
  }

  if (Object.keys(schedule).length > 0) {
    const hostPatch = compact({
      status:
        typeof schedule.isActive === "boolean"
          ? schedule.isActive
            ? "published"
            : "draft"
          : undefined,
      is_accepting: typeof schedule.isAccepting === "boolean" ? schedule.isAccepting : undefined,
      booking_requires_host_approval:
        typeof schedule.bookingRequiresHostApproval === "boolean"
          ? schedule.bookingRequiresHostApproval
          : undefined,
    });
    if (Object.keys(hostPatch).length > 0) {
      const { error } = await supabase.from("hosts").update(hostPatch as never).eq("legacy_family_id", input.familyId);
      if (error) throw error;
    }
  }

  if (input.compliance && Object.keys(input.compliance).length > 0) {
    const { data: family, error: loadError } = await supabase
      .from("families")
      .select("admin_notes")
      .eq("id", input.familyId)
      .maybeSingle();
    if (loadError) throw loadError;
    const currentMeta = parseHostListingMeta(asString(family?.admin_notes) || null);
    const compliance = input.compliance;
    const nextMeta = {
      ...currentMeta,
      complianceNote: asString(compliance.adminNotes) || currentMeta.complianceNote,
      pccFileName: asString(compliance.pccFileName) || currentMeta.pccFileName,
      propertyProofFileName: asString(compliance.propertyProofFileName) || currentMeta.propertyProofFileName,
      formCFileName: asString(compliance.formCFileName) || currentMeta.formCFileName,
      panCardUrl: asString(compliance.panCardUrl) || currentMeta.panCardUrl,
      propertyOwnershipUrl: asString(compliance.propertyOwnershipUrl) || currentMeta.propertyOwnershipUrl,
      nocUrl: asString(compliance.nocUrl) || currentMeta.nocUrl,
      policeVerificationUrl: asString(compliance.policeVerificationUrl) || currentMeta.policeVerificationUrl,
      fssaiRegistrationUrl: asString(compliance.fssaiRegistrationUrl) || currentMeta.fssaiRegistrationUrl,
      idDocumentType: asString(compliance.idDocumentType) || currentMeta.idDocumentType,
      idDocumentUrl: asString(compliance.idDocumentUrl) || currentMeta.idDocumentUrl,
      liveSelfieUrl: asString(compliance.liveSelfieUrl) || currentMeta.liveSelfieUrl,
      gstin: normalizeGstin(compliance.gstin) || currentMeta.gstin,
      platformAgreementAcceptedAt:
        asString(compliance.platformAgreementAcceptedAt) || currentMeta.platformAgreementAcceptedAt,
    };
    const compliancePatch = compact({
      admin_notes: serializeHostListingMeta(nextMeta),
      gstin: normalizeGstin(compliance.gstin) || undefined,
    });
    const { error } = await supabase
      .from("families")
      .update(compliancePatch as never)
      .eq("id", input.familyId);
    if (error) throw error;
  }
}

function revalidateListing(familyId: string): void {
  revalidateTag("homepage-discovery", "max");
  revalidateTag("home-route-resolution", "max");
  revalidateTag("home-detail-public-data", "max");
  revalidateTag("public-home-stay-data", "max");
  revalidatePath("/");
  revalidatePath("/homestays");
  revalidatePath(`/homes/${familyId}`);
  revalidatePath("/homestay/[slug]/[id]", "page");
  revalidatePath(`/partnerslogin/home/dashboard?family=${familyId}&tab=profile`);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const familyId = asString(request.nextUrl.searchParams.get("familyId"));
  if (!familyId) {
    return NextResponse.json({ error: "Family ID is required." }, { status: 400 });
  }

  try {
    const supabase = createAdminSupabaseClient();
    const access = await resolveAuthorizedHostResource(supabase, request, { familyId });
    if (!access?.familyId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const profile = await getHostPropertyListingProfile(supabase, {
      familyId: access.familyId,
    });
    return NextResponse.json({ profile }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load the listing profile." },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  let body: {
    familyId?: string;
    identity?: JsonRecord;
    property?: JsonRecord;
    schedule?: JsonRecord;
    compliance?: JsonRecord;
    pricing?: JsonRecord;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const familyId = asString(body.familyId);
  if (!familyId) {
    return NextResponse.json({ error: "Family ID is required." }, { status: 400 });
  }
  const validationError = validateProfilePatch(body);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 422 });
  }

  try {
    const supabase = createAdminSupabaseClient();
    const access = await resolveAuthorizedHostResource(supabase, request, { familyId });
    if (!access?.familyId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const profile = await updateHostPropertyListingProfile(supabase, {
      familyId: access.familyId,
      identityPatch: body.identity,
      propertyPatch: body.property,
    });
    await updateSettings(supabase, {
      familyId: access.familyId,
      schedule: body.schedule,
      compliance: body.compliance,
      pricing: body.pricing,
    });
    revalidateListing(access.familyId);
    return NextResponse.json({ ok: true, profile });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to update the listing profile." },
      { status: 500 }
    );
  }
}
