import { NextResponse } from "next/server";

import { createAdminSupabaseClient } from "@/lib/supabase";
import { parseHostListingMeta, serializeHostListingMeta } from "@/lib/hostListingMeta";

function parseStringList(value: unknown): string[] {
  if (typeof value !== "string") {
    return [];
  }

  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseNumberish(value: unknown): number {
  if (typeof value === "number") {
    return value;
  }

  return Number(value ?? 0);
}

export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as {
    draftId?: string;
    familyId?: string;
    profile?: Record<string, unknown>;
    listing?: Record<string, unknown>;
    schedule?: Record<string, unknown>;
    compliancePatch?: Record<string, unknown>;
  };

  if (!body.familyId && !body.draftId) {
    return NextResponse.json({ error: "Missing host dashboard identifiers." }, { status: 400 });
  }

  const supabase = createAdminSupabaseClient();

  try {
    if (body.familyId) {
      const { data: family } = await supabase
        .from("families")
        .select("admin_notes")
        .eq("id", body.familyId)
        .maybeSingle();

      const currentMeta = parseHostListingMeta((family as { admin_notes?: string | null } | null)?.admin_notes ?? null);
      const photoUrls = parseStringList(body.listing?.photoUrls);
      const nextMeta = {
        ...currentMeta,
        pccFileName:
          typeof body.compliancePatch?.pccFileName === "string"
            ? body.compliancePatch.pccFileName
            : currentMeta.pccFileName,
        propertyProofFileName:
          typeof body.compliancePatch?.propertyProofFileName === "string"
            ? body.compliancePatch.propertyProofFileName
            : currentMeta.propertyProofFileName,
        formCAcknowledged:
          typeof body.compliancePatch?.formCAcknowledged === "boolean"
            ? body.compliancePatch.formCAcknowledged
            : currentMeta.formCAcknowledged,
        hostHobbies: typeof body.profile?.hostHobbies === "string" ? body.profile.hostHobbies : currentMeta.hostHobbies,
        familyComposition:
          typeof body.profile?.familyComposition === "string" ? body.profile.familyComposition : currentMeta.familyComposition,
        culturalOffering:
          typeof body.listing?.culturalOffering === "string" ? body.listing.culturalOffering : currentMeta.culturalOffering,
        bathroomType:
          typeof body.listing?.bathroomType === "string" ? body.listing.bathroomType : currentMeta.bathroomType,
        propertyAddress:
          typeof body.listing?.propertyAddress === "string" ? body.listing.propertyAddress : currentMeta.propertyAddress,
        neighbourhood:
          typeof body.profile?.cityNeighbourhood === "string" ? body.profile.cityNeighbourhood : currentMeta.neighbourhood,
        listingTitle:
          typeof body.listing?.listingTitle === "string" ? body.listing.listingTitle : currentMeta.listingTitle,
        amenities: parseStringList(body.listing?.amenities),
        includedItems: parseStringList(body.listing?.includedItems),
        houseRules: parseStringList(body.listing?.houseRules),
        photoUrls: photoUrls.length > 0 ? photoUrls : currentMeta.photoUrls,
        complianceNote:
          typeof body.compliancePatch?.adminNotes === "string"
            ? body.compliancePatch.adminNotes
            : typeof body.profile?.notes === "string" && body.profile.notes.trim().length > 0
              ? body.profile.notes
              : currentMeta.complianceNote
      };

      const familyPatch = {
        name: typeof body.listing?.propertyName === "string" ? body.listing.propertyName : undefined,
        host_phone: typeof body.profile?.mobileNumber === "string" ? body.profile.mobileNumber : undefined,
        village:
          typeof body.profile?.cityNeighbourhood === "string"
            ? body.profile.cityNeighbourhood
            : undefined,
        city: typeof body.profile?.city === "string" ? body.profile.city : undefined,
        state: typeof body.profile?.state === "string" ? body.profile.state : undefined,
        about:
          typeof body.listing?.hostBio === "string"
            ? body.listing.hostBio
            : typeof body.profile?.familyComposition === "string"
              ? body.profile.familyComposition
              : undefined,
        description:
          typeof body.listing?.hostBio === "string"
            ? body.listing.hostBio
            : undefined,
        google_maps_link:
          typeof body.listing?.googleMapsLink === "string"
            ? body.listing.googleMapsLink
            : undefined,
        languages: parseStringList(body.profile?.languages),
        max_guests: parseNumberish(body.schedule?.maxGuests),
        is_active: typeof body.schedule?.isActive === "boolean" ? body.schedule.isActive : undefined,
        is_accepting: Boolean(body.schedule?.isAccepting),
        active_quarters: parseStringList(body.schedule?.activeQuarters),
        blocked_dates: parseStringList(body.schedule?.blockedDates),
        price_morning: parseNumberish(body.listing?.priceMorning),
        price_afternoon: parseNumberish(body.listing?.priceAfternoon),
        price_evening: parseNumberish(body.listing?.priceEvening),
        price_fullday: parseNumberish(body.listing?.priceFullday),
        admin_notes: serializeHostListingMeta(nextMeta)
      };

      const { error } = await supabase
        .from("families")
        .update(familyPatch as never)
        .eq("id", body.familyId);

      if (error) {
        throw error;
      }

      if (photoUrls.length > 0) {
        await supabase.from("family_photos").delete().eq("family_id", body.familyId);

        await supabase.from("family_photos").insert(
          photoUrls.map((url, index) => ({
            family_id: body.familyId,
            url,
            is_primary: index === 0
          })) as never
        );
      }
    }

    if (body.draftId) {
      const payloadPatch = {
        fullName: body.profile?.fullName ?? "",
        mobileNumber: body.profile?.mobileNumber ?? "",
        email: body.profile?.email ?? "",
        city: body.profile?.city ?? "",
        state: body.profile?.state ?? "",
        cityNeighbourhood: body.profile?.cityNeighbourhood ?? "",
        hostHobbies: body.profile?.hostHobbies ?? "",
        familyComposition: body.profile?.familyComposition ?? "",
        languages: body.profile?.languages ?? "",
        propertyName: body.listing?.propertyName ?? "",
        listingTitle: body.listing?.listingTitle ?? "",
        hostBio: body.listing?.hostBio ?? "",
        culturalOffering: body.listing?.culturalOffering ?? "",
        bathroomType: body.listing?.bathroomType ?? "",
        propertyAddress: body.listing?.propertyAddress ?? "",
        amenities: body.listing?.amenities ?? "",
        includedItems: body.listing?.includedItems ?? "",
        houseRules: body.listing?.houseRules ?? "",
        photoUrls: body.listing?.photoUrls ?? "",
        googleMapsLink: body.listing?.googleMapsLink ?? "",
        priceMorning: body.listing?.priceMorning ?? "",
        priceAfternoon: body.listing?.priceAfternoon ?? "",
        priceEvening: body.listing?.priceEvening ?? "",
        priceFullday: body.listing?.priceFullday ?? "",
        maxGuests: body.schedule?.maxGuests ?? "",
        activeQuarters: body.schedule?.activeQuarters ?? "",
        blockedDates: body.schedule?.blockedDates ?? "",
        isActive: body.schedule?.isActive ?? "",
        complianceAdminNotes: body.compliancePatch?.adminNotes ?? "",
        compliancePccFileName: body.compliancePatch?.pccFileName ?? "",
        compliancePropertyProofFileName: body.compliancePatch?.propertyProofFileName ?? "",
        complianceFormCAcknowledged: body.compliancePatch?.formCAcknowledged ?? "",
        updatedAt: new Date().toISOString()
      };

      const { error } = await supabase
        .from("host_onboarding_drafts")
        .update({
          payload: payloadPatch,
          compliance:
            body.compliancePatch
              ? {
                  pccFileName: body.compliancePatch.pccFileName ?? null,
                  propertyProofFileName: body.compliancePatch.propertyProofFileName ?? null,
                  formCAcknowledged: body.compliancePatch.formCAcknowledged ?? false,
                  adminNotes: body.compliancePatch.adminNotes ?? ""
                }
              : undefined,
          updated_at: new Date().toISOString()
        } as never)
        .eq("id", body.draftId);

      if (error) {
        throw error;
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to save dashboard changes." },
      { status: 500 }
    );
  }
}
