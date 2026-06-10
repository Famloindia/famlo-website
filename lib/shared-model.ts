//shared-model.ts

export interface SharedReadWriteArea {
  area: string;
  primaryTables: string[];
  appEvidence: string[];
  webPlan: string;
}

export const SHARED_READ_WRITE_AREAS: SharedReadWriteArea[] = [
  {
    area: "Public homes",
    primaryTables: ["families", "family_photos"],
    appEvidence: [
      "ExploreScreen reads families by city/state and joins family_photos",
      "FamilyDetailScreen reads families and family_photos",
      "Host editing/pricing flows update families directly"
    ],
    webPlan:
      "Build public stay discovery and home detail from families and family_photos, with listing extras parsed from families.admin_notes."
  },
  {
    area: "Home onboarding",
    primaryTables: ["host_onboarding_drafts", "family_applications", "families", "family_photos"],
    appEvidence: [
      "Website onboarding already drafts into host_onboarding_drafts",
      "Submission flow creates family_applications and provisions families",
      "Photo uploads land in family_photos"
    ],
    webPlan:
      "Preserve host_onboarding_drafts for unfinished website state, then submit into family_applications and finalize live listing data in families plus family_photos."
  },
  {
    area: "Home host dashboard",
    primaryTables: ["families", "family_photos"],
    appEvidence: [
      "HostDashboardScreen reads families, family_photos, bookings, and conversations",
      "EditListingScreen writes families",
      "SetPricesScreen writes families"
    ],
    webPlan:
      "Dashboard edits must update the same families record, related family_photos rows, and metadata in families.admin_notes."
  },
  {
    area: "Hommies and guides",
    primaryTables: ["hommie_profiles_v2", "hommie_media_v2", "activities_v2"],
    appEvidence: [
      "Bookings, messages, and activity detail now resolve companion identity from hommie_profiles_v2",
      "Website partner flow and dashboard now use hommie_profiles_v2 as the primary profile"
    ],
    webPlan:
      "Use hommie_profiles_v2 as the single companion model, with hommie_media_v2 and activities_v2 providing gallery and experience data."
  },
  {
    area: "Bookings and chat",
    primaryTables: ["bookings", "conversations", "messages"],
    appEvidence: [
      "BookingScreen creates bookings and conversations",
      "ChatScreen reads conversations and messages",
      "Host and guide flows share the same booking and message records"
    ],
    webPlan:
      "Any web booking or contact flow should continue using shared bookings, conversations, and messages rather than a website-only request system."
  },
  {
    area: "Partner auth and admin",
    primaryTables: ["users", "families", "hommie_profiles_v2", "family_applications", "friend_applications"],
    appEvidence: [
      "Host login currently maps to families.host_id and host_password",
      "Admin approval provisions shared users and live hommie_profiles_v2 records"
    ],
    webPlan:
      "Reuse shared partner credentials and approval provisioning through families and hommie_profiles_v2 instead of introducing a second web-only identity flow."
  }
];

export function getArchitectureSummary(): SharedReadWriteArea[] {
  return SHARED_READ_WRITE_AREAS;
}
