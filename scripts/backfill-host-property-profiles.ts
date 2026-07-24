import {
  getHostPropertyListingProfile,
  updateHostPropertyListingProfile,
} from "@/lib/host-property-profile";
import { createAdminSupabaseClient, getSupabaseConfigDiagnostics } from "@/lib/supabase";

type JsonRecord = Record<string, unknown>;

function option(name: string): string | null {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");
  const familyIdOption = option("--family-id");
  const partnerIdOption = option("--partner-id");
  const supabase = createAdminSupabaseClient();

let familyQuery = supabase.from("families").select("id,host_id").order("id");
if (familyIdOption) familyQuery = familyQuery.eq("id", familyIdOption);
if (partnerIdOption) familyQuery = familyQuery.ilike("host_id", partnerIdOption);
const { data: families, error: familyError } = await familyQuery;
if (familyError) throw familyError;

const results: JsonRecord[] = [];
for (const family of families ?? []) {
  const familyId = String(family.id);
  const before = await getHostPropertyListingProfile(supabase, { familyId });

  if (apply) {
    await updateHostPropertyListingProfile(supabase, {
      familyId,
      identityPatch: {
        displayName: before.identity.displayName,
        profilePhotoUrl: before.identity.profilePhotoUrl,
        hobbies: before.identity.hobbies,
        languages: before.identity.languages,
        biography: before.identity.biography,
      },
      propertyPatch: {
        propertyName: before.property.propertyName,
        listingTitle: before.property.listingTitle,
        hostBio: before.property.hostBio,
        city: before.property.city,
        state: before.property.state,
        locality: before.property.locality,
        journeyStory: before.property.journeyStory,
        specialExperience: before.property.specialExperience,
        localExperience: before.property.localExperience,
        culturalOffering: before.property.culturalOffering,
        homeType: before.property.homeType,
        interactionType: before.property.interactionType,
        houseRules: before.property.houseRules,
        amenities: before.property.amenities,
        foodTypes: before.property.foodTypes,
        includedItems: before.property.includedItems,
        bathroomType: before.property.bathroomType,
        checkInTime: before.property.checkInTime,
        checkOutTime: before.property.checkOutTime,
        commonAreas: before.property.commonAreas,
        streetAddress: before.property.streetAddress,
        googleMapsLink: before.property.googleMapsLink,
        nearbyPlaces: before.property.nearbyPlaces,
        neighborhoodDescription: before.property.neighborhoodDescription,
        accessibilityDescription: before.property.accessibilityDescription,
        pincode: before.property.pincode,
        familyType: before.property.familyType,
      },
    });

    const { data: photoRows, error: photoError } = await supabase
      .from("family_photos")
      .select("id,is_primary,sort_order,created_at")
      .eq("family_id", familyId)
      .order("is_primary", { ascending: false })
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (photoError) throw photoError;
    for (const [index, photo] of (photoRows ?? []).entries()) {
      const { error } = await supabase
        .from("family_photos")
        .update({ is_primary: index === 0, sort_order: index } as never)
        .eq("id", photo.id);
      if (error) throw error;
    }

    const { data: reelRows, error: reelError } = await supabase
      .from("host_property_reels")
      .select("id,is_featured,created_at")
      .eq("family_id", familyId)
      .eq("status", "active")
      .order("is_featured", { ascending: false })
      .order("created_at", { ascending: true });
    if (reelError) throw reelError;
    if ((reelRows ?? []).length > 0) {
      const featuredId = reelRows?.[0]?.id;
      const { error: clearError } = await supabase
        .from("host_property_reels")
        .update({ is_featured: false } as never)
        .eq("family_id", familyId);
      if (clearError) throw clearError;
      const { error: featureError } = await supabase
        .from("host_property_reels")
        .update({ is_featured: true } as never)
        .eq("id", featuredId);
      if (featureError) throw featureError;
    }
  }

  const after = apply
    ? await getHostPropertyListingProfile(supabase, { familyId, includeLegacyFallback: false })
    : before;
  results.push({
    familyId,
    partnerId: family.host_id,
    mode: apply ? "applied" : "dry-run",
    identity: {
      displayName: after.identity.displayName,
      hasProfilePhoto: Boolean(after.identity.profilePhotoUrl),
      hobbies: after.identity.hobbies,
      languages: after.identity.languages,
    },
    property: {
      propertyName: after.property.propertyName,
      listingTitle: after.property.listingTitle,
      city: after.property.city,
      state: after.property.state,
      locality: after.property.locality,
      interactionType: after.property.interactionType,
      houseRules: after.property.houseRules,
      amenities: after.property.amenities,
      checkInTime: after.property.checkInTime,
      checkOutTime: after.property.checkOutTime,
      commonAreas: after.property.commonAreas,
    },
    galleryCount: after.photos.length,
    reelCount: after.reels.length,
  });
}

  console.log(JSON.stringify({
    database: getSupabaseConfigDiagnostics("admin"),
    apply,
    matched: results.length,
    results,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
