import {
  PRO_DEFAULT_CURRENCY,
  PRO_DEFAULT_RATE_PLAN_NAME,
  PRO_DEFAULT_TIMEZONE,
  propertyModelLabel,
  propertyTypeLabel,
  type HostProSettings,
} from "@/lib/host-pro-settings";

export type ProSetupRoomReadiness = {
  name: string;
  isActive: boolean;
  maxGuests: number;
  priceFullday: number;
  bedInfo: string | null;
  bathroomType: string | null;
  photosCount: number;
};

export type ProSetupReadinessItem = {
  key: string;
  title: string;
  complete: boolean;
  hint: string;
  valueLabel?: string | null;
};

export type ProSetupReadinessSummary = {
  progressPercent: number;
  completedCount: number;
  totalCount: number;
  items: ProSetupReadinessItem[];
  completedItems: ProSetupReadinessItem[];
  missingItems: ProSetupReadinessItem[];
  nextAction: string;
};

export type ProSetupChannelReadiness = {
  providerRowsExist: boolean;
  propertyConnected: boolean;
  roomMappingsReady: boolean;
  ratePlansReady: boolean;
};

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function buildNextAction(missingItems: ProSetupReadinessItem[]): string {
  const firstMissing = missingItems[0];

  if (!firstMissing) {
    return "Core Pro setup signals look healthy. The next step is future provider mapping and sync enablement.";
  }

  if (firstMissing.key === "property-type") {
    return "Capture a Pro-ready property type such as Homestay, Villa, or Hotel/B&B before channel setup begins.";
  }

  if (firstMissing.key === "business-model") {
    return "Choose whether this property should operate as a Vacation Rental or Hotel in a future Pro settings step.";
  }

  if (firstMissing.key === "timezone" || firstMissing.key === "currency") {
    return "Define operating timezone and currency before any future channel mapping or rate distribution goes live.";
  }

  if (firstMissing.key === "check-in-time" || firstMissing.key === "check-out-time") {
    return "Complete check-in and check-out operating times so future OTA policies can mirror Famlo settings.";
  }

  if (firstMissing.key === "rooms-exist") {
    return "Confirm stay units in existing Famlo inventory before enabling any Pro inventory workflows.";
  }

  if (firstMissing.key === "room-base-price") {
    return "Make sure every room has a base price in existing Famlo inventory before future rate mapping is introduced.";
  }

  if (firstMissing.key === "provider-foundation") {
    return "Seed the provider-neutral foundation first so future adapters like Channex can map Famlo data without becoming the source of truth.";
  }

  if (firstMissing.key === "channel-connection") {
    return "Provider rows can exist before connectivity. Keep this disconnected until future connection and sync phases are approved.";
  }

  if (firstMissing.key === "room-mapping") {
    return "Map each active Famlo room to a future provider room type before any availability or booking sync can be attempted.";
  }

  if (firstMissing.key === "rate-mapping") {
    return "Map the Famlo standard rate plan to a future provider rate plan after room mappings are in place.";
  }

  return `Resolve "${firstMissing.title}" to improve PMS and channel-manager readiness.`;
}

export function buildHostProSetupReadiness(input: {
  propertyName: string;
  locationLabel: string;
  familyExists: boolean;
  hostExists: boolean;
  settings: HostProSettings;
  legacyHouseTypeHint?: string | null;
  rooms: ProSetupRoomReadiness[];
  channelReadiness: ProSetupChannelReadiness;
}): ProSetupReadinessSummary {
  const propertyModel = input.settings.propertyModel;
  const propertyType = input.settings.propertyType;
  const checkInTime = asString(input.settings.checkInTime);
  const checkOutTime = asString(input.settings.checkOutTime);
  const roomsExist = input.rooms.length > 0;
  const activeRooms = input.rooms.filter((room) => room.isActive);
  const activeRoomsExist = activeRooms.length > 0;
  const everyActiveRoomHasMaxGuests = activeRoomsExist && activeRooms.every((room) => room.maxGuests > 0);
  const everyActiveRoomHasBasePrice = activeRoomsExist && activeRooms.every((room) => room.priceFullday > 0);
  const everyActiveRoomHasBasicDetails =
    activeRoomsExist &&
    activeRooms.every((room) =>
      room.name.trim().length > 0 &&
      room.maxGuests > 0 &&
      Boolean(asString(room.bedInfo)) &&
      Boolean(asString(room.bathroomType)) &&
      room.photosCount > 0
    );
  const hasSavedSettings = input.settings.exists;
  const savedTimezone = asString(input.settings.timezone) ?? PRO_DEFAULT_TIMEZONE;
  const savedCurrency = asString(input.settings.currency) ?? PRO_DEFAULT_CURRENCY;
  const standardRatePlanName = asString(input.settings.standardRatePlanName) ?? PRO_DEFAULT_RATE_PLAN_NAME;
  const legacyHouseTypeHint = asString(input.legacyHouseTypeHint);

  const items: ProSetupReadinessItem[] = [
    {
      key: "property-identity",
      title: "Family / host identity exists",
      complete: input.familyExists && input.hostExists,
      hint: input.familyExists && input.hostExists
        ? `${input.propertyName} · ${input.locationLabel}`
        : "Famlo Pro needs both family and host identity rows before provider setup can begin.",
      valueLabel: input.familyExists && input.hostExists ? "Ready" : "Missing",
    },
    {
      key: "property-type",
      title: "Property type selected",
      complete: Boolean(propertyType),
      hint: propertyType
        ? `Saved in Famlo Pro settings as ${propertyTypeLabel(propertyType)}.`
        : legacyHouseTypeHint
          ? `Existing onboarding captures "${legacyHouseTypeHint}", but that is not a canonical Pro property type. Save a Pro property type here.`
          : "Save a Pro property type such as Homestay, Villa, or Hotel/B&B.",
      valueLabel: propertyType ? propertyTypeLabel(propertyType) : null,
    },
    {
      key: "business-model",
      title: "Business model selected",
      complete: Boolean(propertyModel),
      hint: propertyModel
        ? `Saved in Famlo Pro settings as ${propertyModelLabel(propertyModel)}.`
        : "Choose whether this property should operate as a Vacation Rental or Hotel in Pro settings.",
      valueLabel: propertyModel ? propertyModelLabel(propertyModel) : null,
    },
    {
      key: "timezone",
      title: "Timezone",
      complete: hasSavedSettings,
      hint: hasSavedSettings
        ? `Saved in Famlo Pro settings as ${savedTimezone}.`
        : `Suggested default is ${PRO_DEFAULT_TIMEZONE}, but it has not been saved in Pro settings yet.`,
      valueLabel: savedTimezone,
    },
    {
      key: "currency",
      title: "Currency",
      complete: hasSavedSettings,
      hint: hasSavedSettings
        ? `Saved in Famlo Pro settings as ${savedCurrency}.`
        : `Suggested default is ${PRO_DEFAULT_CURRENCY}, but it has not been saved in Pro settings yet.`,
      valueLabel: savedCurrency,
    },
    {
      key: "check-in-time",
      title: "Check-in time",
      complete: Boolean(checkInTime),
      hint: checkInTime ? `Current Famlo check-in time: ${checkInTime}.` : "Check-in time is not available from current Famlo listing metadata.",
      valueLabel: checkInTime,
    },
    {
      key: "check-out-time",
      title: "Check-out time",
      complete: Boolean(checkOutTime),
      hint: checkOutTime ? `Current Famlo check-out time: ${checkOutTime}.` : "Check-out time is not available from current Famlo listing metadata.",
      valueLabel: checkOutTime,
    },
    {
      key: "rooms-exist",
      title: "Rooms / stay units exist",
      complete: roomsExist,
      hint: roomsExist
        ? `${input.rooms.length} stay units were loaded from existing Famlo inventory.`
        : "No stay units surfaced through the current safe inventory helper path.",
      valueLabel: roomsExist ? String(input.rooms.length) : null,
    },
    {
      key: "room-max-guests",
      title: "All active rooms have max guests",
      complete: everyActiveRoomHasMaxGuests,
      hint: everyActiveRoomHasMaxGuests
        ? "Every active room has a guest-capacity value in normalized inventory output."
        : activeRoomsExist
          ? "At least one active room is missing a guest-capacity signal in current inventory."
          : "No active rooms are available yet for guest-capacity validation.",
      valueLabel: everyActiveRoomHasMaxGuests ? "Ready" : null,
    },
    {
      key: "room-base-price",
      title: "All active rooms have base price",
      complete: everyActiveRoomHasBasePrice,
      hint: everyActiveRoomHasBasePrice
        ? "Every active room has a base price available for future rate setup."
        : activeRoomsExist
          ? "One or more active rooms are missing a full-day base price in current inventory."
          : "No active rooms are available yet for base-price validation.",
      valueLabel: everyActiveRoomHasBasePrice ? "Ready" : null,
    },
    {
      key: "room-basic-details",
      title: "All active rooms have basic room details",
      complete: everyActiveRoomHasBasicDetails,
      hint: everyActiveRoomHasBasicDetails
        ? "Every active room has name, capacity, bed info, bathroom type, and at least one photo."
        : activeRoomsExist
          ? "One or more active rooms are still missing name, bed info, bathroom type, or photo coverage."
          : "No active rooms are available yet for room-detail validation.",
      valueLabel: everyActiveRoomHasBasicDetails ? "Ready" : null,
    },
    {
      key: "standard-rate-plan",
      title: "Standard rate plan readiness",
      complete: hasSavedSettings && standardRatePlanName.length > 0,
      hint: hasSavedSettings
        ? `Current Pro standard rate plan is ${standardRatePlanName}.`
        : `Suggested default is ${PRO_DEFAULT_RATE_PLAN_NAME}, but it has not been saved in Pro settings yet.`,
      valueLabel: standardRatePlanName,
    },
    {
      key: "calendar-readiness",
      title: "Calendar readiness",
      complete: false,
      hint: "Pro calendar overlays are present as UI shell only. Existing Famlo calendar and iCal flows remain untouched.",
      valueLabel: null,
    },
    {
      key: "provider-foundation",
      title: "Provider foundation ready",
      complete: input.channelReadiness.providerRowsExist,
      hint: input.channelReadiness.providerRowsExist
        ? "Provider-neutral channel foundation rows exist and can support future adapters like Channex."
        : "Provider foundation tables are still empty, so future mapping has no seeded provider base yet.",
      valueLabel: input.channelReadiness.providerRowsExist ? "Ready" : null,
    },
    {
      key: "channel-connection",
      title: "Channel connection readiness",
      complete: input.channelReadiness.propertyConnected,
      hint: input.channelReadiness.propertyConnected
        ? "At least one provider property row is marked connected."
        : "No provider property is connected yet. Distribution stays intentionally disconnected in this phase.",
      valueLabel: input.channelReadiness.propertyConnected ? "Connected" : null,
    },
    {
      key: "room-mapping",
      title: "Room mapping readiness",
      complete: input.channelReadiness.roomMappingsReady,
      hint: input.channelReadiness.roomMappingsReady
        ? "Every active room has a mapped external room-type id in the provider-neutral foundation."
        : "One or more active rooms still have no external room-type id in the mapping foundation.",
      valueLabel: input.channelReadiness.roomMappingsReady ? "Mapped" : null,
    },
    {
      key: "rate-mapping",
      title: "Rate mapping readiness",
      complete: input.channelReadiness.ratePlansReady,
      hint: input.channelReadiness.ratePlansReady
        ? "At least one provider-neutral rate plan already has a mapped external rate-plan id."
        : "Provider-neutral rate plans are still missing external rate-plan ids.",
      valueLabel: input.channelReadiness.ratePlansReady ? "Mapped" : null,
    },
  ];

  const completedItems = items.filter((item) => item.complete);
  const missingItems = items.filter((item) => !item.complete);
  const progressPercent = Math.round((completedItems.length / items.length) * 100);

  return {
    progressPercent,
    completedCount: completedItems.length,
    totalCount: items.length,
    items,
    completedItems,
    missingItems,
    nextAction: buildNextAction(missingItems),
  };
}
