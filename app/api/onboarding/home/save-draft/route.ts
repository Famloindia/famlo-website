// app/api/onboarding/home/save-draft/route.ts

import { NextResponse } from "next/server";

import { createHostDraft, mergeDraftPayload } from "@/lib/host-onboarding";

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asNumberOrNull(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function buildLegacyRoomDraft(payloadPatch: Record<string, unknown>): Record<string, unknown> | null {
  const hasSignals =
    asString(payloadPatch.roomType) ||
    asNumberOrNull(payloadPatch.maxGuests) ||
    asNumberOrNull(payloadPatch.baseNightlyRate) ||
    asNumberOrNull(payloadPatch.priceFullday) ||
    asNumberOrNull(payloadPatch.morningRate) ||
    asNumberOrNull(payloadPatch.afternoonRate) ||
    asNumberOrNull(payloadPatch.eveningRate) ||
    asString(payloadPatch.roomName) ||
    asString(payloadPatch.propertyName) ||
    asString(payloadPatch.bedConfiguration) ||
    asString(payloadPatch.bedInfo) ||
    asString(payloadPatch.bed_info) ||
    asString(payloadPatch.roomConfiguration) ||
    asString(payloadPatch.roomVibe) ||
    asString(payloadPatch.balcony) ||
    asString(payloadPatch.bathroomType) ||
    (Array.isArray(payloadPatch.roomPhotos) && payloadPatch.roomPhotos.length > 0) ||
    (Array.isArray(payloadPatch.photos) && payloadPatch.photos.length > 0);

  if (!hasSignals) {
    return null;
  }

  return {
    id: asString(payloadPatch.roomId) || "primary",
    roomName: asString(payloadPatch.roomName) || asString(payloadPatch.propertyName) || "Primary room",
    roomType: asString(payloadPatch.roomType) || "Private room",
    maxGuests: asNumberOrNull(payloadPatch.maxGuests) ?? 1,
    bedConfiguration: asString(payloadPatch.bedConfiguration) || asString(payloadPatch.bedInfo) || "",
    roomConfiguration: asString(payloadPatch.roomConfiguration) || "",
    balcony: asString(payloadPatch.balcony) || "",
    roomVibe: asString(payloadPatch.roomVibe) || "",
    roomAmenities: Array.isArray(payloadPatch.roomAmenities) ? payloadPatch.roomAmenities : Array.isArray(payloadPatch.amenities) ? payloadPatch.amenities : [],
    roomPhotos: Array.isArray(payloadPatch.roomPhotos) ? payloadPatch.roomPhotos : Array.isArray(payloadPatch.photos) ? payloadPatch.photos : [],
    standardPrice: asNumberOrNull(payloadPatch.standardPrice ?? payloadPatch.baseNightlyRate ?? payloadPatch.priceFullday) ?? "",
    lowDemandPrice: asNumberOrNull(payloadPatch.lowDemandPrice ?? payloadPatch.morningRate) ?? "",
    highDemandPrice: asNumberOrNull(payloadPatch.highDemandPrice ?? payloadPatch.eveningRate) ?? "",
    smartPricingEnabled: Boolean(payloadPatch.smartPricingEnabled) || Boolean(payloadPatch.lowDemandPrice || payloadPatch.highDemandPrice),
  };
}

export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as {
    draftId?: string;
    step?: number;
    payloadPatch?: Record<string, unknown>;
    compliancePatch?: Record<string, unknown>;
  };

  try {
    let draftId = String(body.draftId ?? "").trim();
    const payloadPatch = asObject(body.payloadPatch);
    const compliancePatch = asObject(body.compliancePatch);
    const currentStep = body.step ?? 1;

    const hostName = asString(payloadPatch.hostName) || asString(payloadPatch.fullName);
    const fullName = asString(payloadPatch.fullName);
    const mobileNumber = asString(payloadPatch.mobileNumber);
    const cityNeighbourhood =
      asString(payloadPatch.areaName) ||
      asString(payloadPatch.cityNeighbourhood) ||
      asString(payloadPatch.villageName) ||
      asString(payloadPatch.cityName);

    const roomAttributes = asObject(payloadPatch.roomAttributes);
    const pricing = asObject(payloadPatch.pricing);
    const houseRules = asObject(payloadPatch.houseRules);
    const rooms = Array.isArray(payloadPatch.rooms) && payloadPatch.rooms.length > 0
      ? payloadPatch.rooms
      : (() => {
          const legacyRoom = buildLegacyRoomDraft(payloadPatch);
          return legacyRoom ? [legacyRoom] : [];
        })();

    // Top level field mapping
    const patch: any = {
      draftId,
      payloadPatch,
      compliancePatch,
      currentStep,
      listingStatus: "draft",

      // Map parameters to top-level columns
      primaryHostName: hostName || fullName,
      mobileNumber,
      host_photo_url: asString(payloadPatch.hostPhoto), // Personal profile photo
      cityNeighbourhood,
      streetAddress: asString(payloadPatch.streetAddress) || asString(payloadPatch.propertyAddress),
      email: asString(payloadPatch.email),
      state: asString(payloadPatch.state),
      country: asString(payloadPatch.country),
      familyComposition: asString(payloadPatch.familyComposition),
      hostBio: asString(payloadPatch.hostBio),
      languagesSpoken: asArray(payloadPatch.languagesSpoken).length > 0 ? asArray(payloadPatch.languagesSpoken) : asArray(payloadPatch.languages),
      famloExperience: asString(payloadPatch.culturalActivity),
      images: Array.isArray(payloadPatch.hostGalleryPhotos)
        ? payloadPatch.hostGalleryPhotos
        : Array.isArray(payloadPatch.photos)
          ? payloadPatch.photos
          : [],
      bathroomType: asString(roomAttributes.bathroomType),
      commonAreas: Array.isArray(roomAttributes.commonAreas) ? roomAttributes.commonAreas : [],
      amenities: Array.isArray(payloadPatch.amenities) ? payloadPatch.amenities : [],
      upiId: asString(payloadPatch.upiId) || asString(pricing.upiId),
      bankAccountHolderName: asString(compliancePatch.accountHolderName) || asString(payloadPatch.accountHolderName),
      bankAccountNumber: asString(compliancePatch.accountNumber) || asString(payloadPatch.accountNumber),
      ifscCode: asString(compliancePatch.ifscCode) || asString(payloadPatch.ifscCode),
      bankName: asString(compliancePatch.bankName) || asString(payloadPatch.bankName),
      
      // New Privacy-First Location Fields
      latExact: asNumberOrNull(payloadPatch.latitude),
      lngExact: asNumberOrNull(payloadPatch.longitude),
      landmarks: Array.isArray(payloadPatch.landmarks) ? payloadPatch.landmarks : [],
      neighborhoodDesc: asString(payloadPatch.neighborhoodDesc),
      accessibilityDesc: asString(payloadPatch.accessibilityDesc),
      pincode: asString(payloadPatch.pincode)
    };

    patch.payloadPatch = {
      ...payloadPatch,
      propertyName: asString(payloadPatch.propertyName),
      hostName,
      propertyAddress: asString(payloadPatch.propertyAddress) || asString(payloadPatch.streetAddress),
      areaName: asString(payloadPatch.areaName) || cityNeighbourhood,
      city: asString(payloadPatch.city),
      state: asString(payloadPatch.state),
      country: asString(payloadPatch.country),
      villageName: asString(payloadPatch.villageName),
      cityNeighbourhood,
      maxGuests: payloadPatch.maxGuests ?? null,
      googleMapsLink: asString(payloadPatch.googleMapsLink),
      latitude: asString(payloadPatch.latitude),
      longitude: asString(payloadPatch.longitude),
      hostProfession: asString(payloadPatch.hostProfession),
      languagesSpoken: asArray(payloadPatch.languagesSpoken).length > 0 ? asArray(payloadPatch.languagesSpoken) : asArray(payloadPatch.languages),
      includedItems: asArray(payloadPatch.includedItems),
      customRules:
        asArray(payloadPatch.customRules).length > 0
          ? asArray(payloadPatch.customRules)
          : [
              houseRules.smoking === false ? "No smoking" : null,
              houseRules.alcohol === false ? "No alcohol" : null,
              houseRules.pets === false ? "No pets" : null,
              asString(houseRules.quietHours) ? `Quiet hours: ${asString(houseRules.quietHours)}` : null,
              asString(houseRules.custom) || null
            ].filter(Boolean),
      baseNightlyRate: payloadPatch.baseNightlyRate ?? pricing.baseRate ?? null,
      morningRate:
        payloadPatch.morningRate ??
        (pricing.morning === true ? payloadPatch.baseNightlyRate ?? pricing.baseRate ?? null : null),
      afternoonRate:
        payloadPatch.afternoonRate ??
        (pricing.afternoon === true ? payloadPatch.baseNightlyRate ?? pricing.baseRate ?? null : null),
      eveningRate:
        payloadPatch.eveningRate ??
        (pricing.evening === true ? payloadPatch.baseNightlyRate ?? pricing.baseRate ?? null : null),
      priceFullday:
        payloadPatch.priceFullday ??
        payloadPatch.fullDayRate ??
        pricing.fullday ??
        payloadPatch.baseNightlyRate ??
        null,
      hostPhoto: asString(payloadPatch.hostPhoto),
      hostGalleryPhotos: Array.isArray(payloadPatch.hostGalleryPhotos) ? payloadPatch.hostGalleryPhotos : [],
      photos: Array.isArray(payloadPatch.photos) ? payloadPatch.photos : [],
      propertyOwnershipProofUrl: asString(payloadPatch.propertyOwnershipProofUrl) || asString(compliancePatch.propertyOwnershipProofUrl),
      propertyPanCardUrl: asString(payloadPatch.propertyPanCardUrl) || asString(compliancePatch.propertyPanCardUrl),
      bathroomType: asString(payloadPatch.bathroomType) || asString(roomAttributes.bathroomType),
      commonAreas: asArray(payloadPatch.commonAreas).length > 0 ? asArray(payloadPatch.commonAreas) : asArray(roomAttributes.commonAreas),
      amenities: asArray(payloadPatch.amenities),
      upiId: asString(payloadPatch.upiId) || asString(pricing.upiId),
      houseRules,
      gstApplicable:
        typeof payloadPatch.gstApplicable === "boolean"
          ? payloadPatch.gstApplicable
          : compliancePatch.gstApplicable === true,
      gstNumber: asString(payloadPatch.gstNumber) || asString(compliancePatch.gstNumber),
      gstDeclarationAccepted:
        typeof payloadPatch.gstDeclarationAccepted === "boolean"
          ? payloadPatch.gstDeclarationAccepted
          : compliancePatch.gstDeclarationAccepted === true,
      hostAgreementAccepted:
        typeof payloadPatch.hostAgreementAccepted === "boolean"
          ? payloadPatch.hostAgreementAccepted
          : compliancePatch.hostAgreementAccepted === true,
      hostAgreementAcceptedAt: asString(payloadPatch.hostAgreementAcceptedAt) || asString(compliancePatch.hostAgreementAcceptedAt),
      aadhaarNumber: asString(compliancePatch.aadhaarNumber),
      panNumber: asString(compliancePatch.panNumber),
      accountHolderName: asString(compliancePatch.accountHolderName) || asString(payloadPatch.accountHolderName),
      accountNumber: asString(compliancePatch.accountNumber) || asString(payloadPatch.accountNumber),
      ifscCode: asString(compliancePatch.ifscCode) || asString(payloadPatch.ifscCode),
      bankName: asString(compliancePatch.bankName) || asString(payloadPatch.bankName)
    };

    if (!Array.isArray(patch.payloadPatch.rooms) || patch.payloadPatch.rooms.length === 0) {
      patch.payloadPatch.rooms = rooms;
    }

    if (!draftId) {
      const { generateHostPassword } = await import("@/lib/host-onboarding");
      patch.password = generateHostPassword();
      
      draftId = await createHostDraft({
        mobileNumber,
        primaryHostName: hostName || fullName,
        cityNeighbourhood,
        streetAddress: patch.streetAddress,
        email: patch.email,
        state: patch.state,
        country: patch.country,
        familyComposition: patch.familyComposition,
        hostBio: patch.hostBio,
        languagesSpoken: patch.languagesSpoken,
        famloExperience: patch.famloExperience,
        images: patch.images,
        hostGalleryPhotos: patch.hostGalleryPhotos,
        bathroomType: patch.bathroomType,
        commonAreas: patch.commonAreas,
        amenities: patch.amenities,
        upiId: patch.upiId,
        bankAccountHolderName: patch.bankAccountHolderName,
        bankAccountNumber: patch.bankAccountNumber,
        ifscCode: patch.ifscCode,
        bankName: patch.bankName,
        host_photo_url: patch.host_photo_url,
        payload: patch.payloadPatch,
        compliance: patch.compliancePatch,
        currentStep,
        ...patch
      });
    } else {
      await mergeDraftPayload(patch);
    }

    return NextResponse.json({ ok: true, draftId });
  } catch (error: any) {
    console.error("[SaveDraftAPI] Error:", error.message || error);
    return NextResponse.json(
      { 
        error: error.message || "Unable to save Home draft.",
        code: error.code || null,
        details: error.details || null,
        hint: error.hint || "Check if your database table 'host_onboarding_drafts' has the required columns: mobile_number, primary_host_name, city_neighbourhood, payload, compliance, etc."
      },
      { status: 500 }
    );
  }
}
