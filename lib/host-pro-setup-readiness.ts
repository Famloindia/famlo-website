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
  maxGuests: number;
  priceFullday: number;
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
}): ProSetupReadinessSummary {
  const propertyModel = input.settings.propertyModel;
  const propertyType = input.settings.propertyType;
  const checkInTime = asString(input.settings.checkInTime);
  const checkOutTime = asString(input.settings.checkOutTime);
  const roomsExist = input.rooms.length > 0;
  const everyRoomHasMaxGuests = roomsExist && input.rooms.every((room) => room.maxGuests > 0);
  const everyRoomHasBasePrice = roomsExist && input.rooms.every((room) => room.priceFullday > 0);
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
      title: "Each room has max guests",
      complete: everyRoomHasMaxGuests,
      hint: everyRoomHasMaxGuests
        ? "Each surfaced room has a guest-capacity value in normalized inventory output."
        : "At least one room is missing a guest-capacity signal in current inventory.",
      valueLabel: everyRoomHasMaxGuests ? "Ready" : null,
    },
    {
      key: "room-base-price",
      title: "Each room has base price",
      complete: everyRoomHasBasePrice,
      hint: everyRoomHasBasePrice
        ? "Each surfaced room has a base price available for future rate setup."
        : "One or more rooms are missing a full-day base price in current inventory.",
      valueLabel: everyRoomHasBasePrice ? "Ready" : null,
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
      key: "channel-mapping",
      title: "Channel mapping readiness",
      complete: false,
      hint: "Provider accounts, room mappings, and rate mappings are intentionally not implemented yet.",
      valueLabel: null,
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
