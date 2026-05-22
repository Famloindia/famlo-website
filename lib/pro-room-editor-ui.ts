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
