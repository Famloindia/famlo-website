import type { ChannelProviderKey } from "@/lib/channel-providers/provider-registry";

export type RoomCalendarAvailabilityStatus =
  | "available"
  | "manual_block"
  | "famlo"
  | "ota"
  | "pending"
  | "past";

export function getRoomCalendarAvailabilityOverrideKey(roomId: string, date: string): string {
  return `${roomId}:${date}`;
}

export function applyRoomCalendarAvailabilityOverride(
  current: Record<string, RoomCalendarAvailabilityStatus>,
  input: {
    roomId: string;
    date: string;
    action: "block" | "unblock";
  }
): Record<string, RoomCalendarAvailabilityStatus> {
  return {
    ...current,
    [getRoomCalendarAvailabilityOverrideKey(input.roomId, input.date)]:
      input.action === "block" ? "manual_block" : "available",
  };
}

export function rollbackRoomCalendarAvailabilityOverride(
  current: Record<string, RoomCalendarAvailabilityStatus>,
  input: {
    roomId: string;
    date: string;
    previousStatus: RoomCalendarAvailabilityStatus | null;
  }
): Record<string, RoomCalendarAvailabilityStatus> {
  const key = getRoomCalendarAvailabilityOverrideKey(input.roomId, input.date);
  if (!input.previousStatus) {
    const next = { ...current };
    delete next[key];
    return next;
  }

  return {
    ...current,
    [key]: input.previousStatus,
  };
}

export function resolveSmartPricingUiState(hasOperationalSupport = false): {
  manualPricingLabel: string;
  smartPricingLabel: string;
  smartPricingEnabled: boolean;
} {
  if (hasOperationalSupport) {
    return {
      manualPricingLabel: "Smart pricing active",
      smartPricingLabel: "Operational",
      smartPricingEnabled: true,
    };
  }

  return {
    manualPricingLabel: "Manual pricing active",
    smartPricingLabel: "Coming soon",
    smartPricingEnabled: false,
  };
}

export type HostChannelCardState = {
  status: "Connected" | "Setup needed" | "Not started" | "Coming soon";
  cta: "Connected" | "Review" | "Setup" | "Coming soon";
  helperText: string;
  isConnected: boolean;
  isComingSoon: boolean;
};

export function getChannelManagerConfirmationLabel(providerKey: ChannelProviderKey): string | null {
  if (providerKey === "booking") {
    return "I have enabled or requested Channex as channel manager in Booking.com.";
  }
  if (providerKey === "mmt") {
    return "I have enabled or requested Channex as channel manager in MakeMyTrip / Goibibo.";
  }
  if (providerKey === "airbnb") {
    return "I have enabled or requested Channex as channel manager in Airbnb.";
  }
  if (providerKey === "agoda") {
    return "I have enabled or requested Channex as channel manager in Agoda.";
  }
  if (providerKey === "expedia") {
    return "I have enabled or requested Channex as channel manager in Expedia.";
  }
  return null;
}

export function resolveHostChannelCardState(input: {
  providerKey: ChannelProviderKey;
  setupStarted: boolean;
  connected: boolean;
  roomMatched: boolean;
  rateMatched: boolean;
  syncReady: boolean;
  providerMode: "self_serve" | "assisted_beta" | "feed_only" | "disabled";
}): HostChannelCardState {
  if (input.providerMode === "feed_only" || input.providerMode === "disabled") {
    return {
      status: "Coming soon",
      cta: "Coming soon",
      helperText: "Assisted feed setup remains the safe path for this channel right now.",
      isConnected: false,
      isComingSoon: true,
    };
  }

  if (input.connected) {
    if (input.roomMatched && input.rateMatched && input.syncReady) {
      return {
        status: "Connected",
        cta: "Connected",
        helperText: "Room, price, and sync readiness are in place for this OTA.",
        isConnected: true,
        isComingSoon: false,
      };
    }

    return {
      status: "Setup needed",
      cta: "Review",
      helperText: "The OTA is attached, but this room still needs matching or sync readiness review.",
      isConnected: false,
      isComingSoon: false,
    };
  }

  if (input.setupStarted) {
    return {
      status: "Setup needed",
      cta: "Review",
      helperText: "Setup has started. Finish confirmation, matching, and preview before syncing this room.",
      isConnected: false,
      isComingSoon: false,
    };
  }

  return {
    status: "Not started",
    cta: "Setup",
    helperText: "Choose this OTA to enter safe setup details and preview the connection.",
    isConnected: false,
    isComingSoon: false,
  };
}

export function canRunHostChannelSync(input: {
  connected: boolean;
  roomMatched: boolean;
  rateMatched: boolean;
  calendarReady: boolean;
  supportsSelectedPropertySyncTest: boolean;
}): boolean {
  return (
    input.connected &&
    input.roomMatched &&
    input.rateMatched &&
    input.calendarReady &&
    input.supportsSelectedPropertySyncTest
  );
}

export type HostRoomIssueCard = {
  key: string;
  title: string;
  detail: string;
  severity: "Blocking" | "Warning" | "Info";
  actionLabel: string;
  actionTarget: "channels" | "mapping" | "details" | "pricing";
};

export type OtaReadinessClassification =
  | "Ready for live sync"
  | "Partially ready"
  | "Setup/assisted only"
  | "Coming soon / not ready";

export function buildHostRoomIssueCards(input: {
  roomInactive: boolean;
  photosMissing: boolean;
  basePriceMissing: boolean;
  channelConnected: boolean;
  channelConfirmationMissing: boolean;
  roomMatched: boolean;
  rateMatched: boolean;
  calendarReady: boolean;
  lastSyncFailed: boolean;
  channelSetupIncomplete: boolean;
}): HostRoomIssueCard[] {
  const issues: HostRoomIssueCard[] = [];

  if (!input.channelConnected) {
    issues.push({
      key: "channel-not-connected",
      title: "Channel not connected",
      detail: "Connect an OTA first before this room can sync availability or pricing outside Famlo Pro.",
      severity: "Blocking",
      actionLabel: "Setup channel",
      actionTarget: "channels",
    });
  }

  if (input.channelConfirmationMissing) {
    issues.push({
      key: "channel-manager-not-confirmed",
      title: "Channex not confirmed in OTA",
      detail: "Confirm that Channex is enabled or requested as the channel manager before trying to connect or sync.",
      severity: "Blocking",
      actionLabel: "Setup channel",
      actionTarget: "channels",
    });
  }

  if (!input.roomMatched) {
    issues.push({
      key: "room-not-matched",
      title: "Room not matched",
      detail: "Match this Famlo room to the OTA room before expecting calendar sync to work cleanly.",
      severity: "Blocking",
      actionLabel: "Review room match",
      actionTarget: "mapping",
    });
  }

  if (!input.rateMatched) {
    issues.push({
      key: "rate-not-matched",
      title: "Price or rate plan not matched",
      detail: "Match the OTA rate plan so Famlo Pro pricing has a clear destination after sync.",
      severity: "Blocking",
      actionLabel: "Review price match",
      actionTarget: "mapping",
    });
  }

  if (!input.calendarReady) {
    issues.push({
      key: "calendar-not-ready",
      title: "Calendar sync not ready",
      detail: "Calendar and pricing sync stay blocked until the connection and room mapping are ready.",
      severity: "Warning",
      actionLabel: "Setup channel",
      actionTarget: "channels",
    });
  }

  if (input.basePriceMissing) {
    issues.push({
      key: "base-price-missing",
      title: "Base price missing",
      detail: "Set a base price in Famlo Pro before using this room for OTA pricing sync.",
      severity: "Blocking",
      actionLabel: "Edit room details",
      actionTarget: "pricing",
    });
  }

  if (input.photosMissing) {
    issues.push({
      key: "photos-missing",
      title: "Required photos missing",
      detail: "Add room photos before relying on this room for OTA setup or guest-facing presentation.",
      severity: "Warning",
      actionLabel: "Add photos",
      actionTarget: "details",
    });
  }

  if (input.roomInactive) {
    issues.push({
      key: "room-inactive",
      title: "Room is inactive",
      detail: "Turn this room on before expecting it to be available to guests or OTA channels.",
      severity: "Info",
      actionLabel: "Edit room details",
      actionTarget: "details",
    });
  }

  if (input.channelSetupIncomplete) {
    issues.push({
      key: "channel-setup-incomplete",
      title: "Channel setup incomplete",
      detail: "The OTA setup has started, but safe connection details or verification steps are still missing.",
      severity: "Warning",
      actionLabel: "Setup channel",
      actionTarget: "channels",
    });
  }

  if (input.lastSyncFailed) {
    issues.push({
      key: "last-sync-failed",
      title: "Last sync failed",
      detail: "The latest channel sync did not complete successfully. Review setup and retry when the room is ready.",
      severity: "Warning",
      actionLabel: "Retry sync",
      actionTarget: "channels",
    });
  }

  return issues;
}

export function classifyOtaReadiness(input: {
  providerMode: "self_serve" | "assisted_beta" | "feed_only" | "disabled";
  supportsRoomMatching: boolean;
  supportsPriceMatching: boolean;
  supportsAriSync: boolean;
  supportsSelectedPropertySyncTest: boolean;
  supportsGoLiveReadiness: boolean;
  supportsAutoActivation: boolean;
}): OtaReadinessClassification {
  if (input.providerMode === "feed_only" || input.providerMode === "disabled") {
    return "Coming soon / not ready";
  }

  if (input.providerMode === "assisted_beta") {
    return "Setup/assisted only";
  }

  if (
    input.supportsRoomMatching &&
    input.supportsPriceMatching &&
    input.supportsAriSync &&
    input.supportsSelectedPropertySyncTest &&
    input.supportsGoLiveReadiness &&
    input.supportsAutoActivation
  ) {
    return "Ready for live sync";
  }

  return "Partially ready";
}
