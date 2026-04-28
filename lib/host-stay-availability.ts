import { isHostBookingInventoryBlocking } from "@/lib/host-booking-state";

type QuarterKey = "morning" | "afternoon" | "evening" | "fullday";

export type HostStayBookingRecord = {
  bookingId?: string | null;
  legacyBookingId?: string | null;
  stayUnitId?: string | null;
  startDate: string;
  endDate: string;
  quarterType: string | null;
  guestsCount: number;
  status: string | null;
  paymentStatus: string | null;
  holdExpiresAt?: string | null;
  source: "legacy" | "v2";
};

export type HostStayOccupancyDay = {
  anyBooking: boolean;
  fullDayGuests: number;
  quarterGuests: Partial<Record<QuarterKey, number>>;
};

export type HostStayOccupancyMap = Record<string, HostStayOccupancyDay>;

function normalizeQuarterType(value: string | null | undefined): QuarterKey | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "morning" || normalized === "afternoon" || normalized === "evening" || normalized === "fullday") {
    return normalized;
  }
  return null;
}

function enumerateDates(from: string, to: string): string[] {
  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  const output: string[] = [];

  while (start <= end) {
    output.push(start.toISOString().split("T")[0] ?? from);
    start.setUTCDate(start.getUTCDate() + 1);
  }

  return output;
}

function asActiveStatus(
  status: string | null | undefined,
  paymentStatus: string | null | undefined,
  source: "legacy" | "v2",
  holdExpiresAt?: string | null | undefined
): boolean {
  const normalizedStatus = String(status ?? "").trim().toLowerCase();
  const normalizedPaymentStatus = String(paymentStatus ?? "").trim().toLowerCase();

  if (normalizedStatus === "rejected" || normalizedStatus === "cancelled") {
    return false;
  }

  if (normalizedPaymentStatus === "refunded" || normalizedPaymentStatus === "partially_refunded") {
    return false;
  }

  if (source === "legacy") {
    return (
      normalizedStatus === "confirmed" ||
      normalizedStatus === "accepted" ||
      normalizedStatus === "checked_in" ||
      normalizedStatus === "completed"
    );
  }

  if (
    normalizedStatus === "awaiting_payment" &&
    typeof holdExpiresAt === "string" &&
    holdExpiresAt.trim().length > 0 &&
    new Date(holdExpiresAt).getTime() <= Date.now()
  ) {
    return false;
  }

  return isHostBookingInventoryBlocking(normalizedStatus, normalizedPaymentStatus);
}

export function buildHostStayOccupancy(rows: readonly HostStayBookingRecord[]): HostStayOccupancyMap {
  const occupancy: HostStayOccupancyMap = {};
  const dedupedRows = new Map<string, HostStayBookingRecord>();

  for (const row of rows) {
    if (!asActiveStatus(row.status, row.paymentStatus, row.source, row.holdExpiresAt)) {
      continue;
    }

    const bookingIdentity =
      row.stayUnitId ??
      row.legacyBookingId ??
      row.bookingId ??
      `${row.startDate}::${row.endDate}::${row.quarterType ?? "fullday"}::${row.guestsCount}`;
    const current = dedupedRows.get(bookingIdentity);

    if (!current) {
      dedupedRows.set(bookingIdentity, row);
      continue;
    }

    if (current.source === "legacy" && row.source === "v2") {
      dedupedRows.set(bookingIdentity, row);
      continue;
    }

    if (
      String(current.status ?? "").trim().toLowerCase() === "awaiting_payment" &&
      String(row.status ?? "").trim().toLowerCase() !== "awaiting_payment"
    ) {
      dedupedRows.set(bookingIdentity, row);
    }
  }

  for (const row of dedupedRows.values()) {
    const quarterType = normalizeQuarterType(row.quarterType) ?? "fullday";
    const guestsCount = Math.max(1, Math.trunc(Number(row.guestsCount) || 1));
    const endDate = row.endDate || row.startDate;

    for (const date of enumerateDates(row.startDate, endDate)) {
      const day = occupancy[date] ?? {
        anyBooking: false,
        fullDayGuests: 0,
        quarterGuests: {},
      };

      day.anyBooking = true;

      if (quarterType === "fullday") {
        day.fullDayGuests += guestsCount;
      } else {
        day.quarterGuests[quarterType] = (day.quarterGuests[quarterType] ?? 0) + guestsCount;
      }

      occupancy[date] = day;
    }
  }

  return occupancy;
}
