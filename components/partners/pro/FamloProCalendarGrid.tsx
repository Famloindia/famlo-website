"use client";

import { Fragment, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";

import styles from "./pro-dashboard.module.css";

type CalendarColumn = {
  date: string;
  dayLabel: string;
  dateLabel: string;
  isPast: boolean;
};

type CalendarBookingDetail = {
  bookingId: string;
  roomName: string;
  startDate: string;
  endDate: string;
  sourceLabel: string;
  externalBookingId: string | null;
  guestDisplayName: string;
  amount: string | null;
  currency: string | null;
  paymentStatus: string | null;
  importStatus: string | null;
  ackStatus: string | null;
  linkedBookingId: string | null;
  externalRevisionId: string | null;
  bookingListRevisionId: string | null;
  feedStatus: "found" | "empty" | "not_applicable";
  isCrsOnly: boolean;
  ackEligible: boolean;
  importedIntoFamlo: boolean;
  acknowledged: boolean;
  acknowledgementNote: string | null;
};

type CalendarCell = {
  date: string;
  status: "available" | "famlo" | "ota" | "manual_block" | "pending" | "past" | "unavailable";
  label: string;
  availableUnits: number | null;
  bookingDetail: CalendarBookingDetail | null;
};

type CalendarRateCell = {
  date: string;
  displayValue: string;
  amount: number | null;
  baseAmount: number;
  isPast: boolean;
  isOverridden: boolean;
};

type CalendarRow = {
  roomId: string;
  roomName: string;
  unitType: string;
  rate: number;
  availabilityCells: CalendarCell[];
  rateCells: CalendarRateCell[];
};

type CalendarRoomSyncSummary = {
  roomId: string;
  provider: "channex";
  status: "synced" | "syncing" | "pending" | "failed" | "stale" | "not_mapped";
  lastSyncedAt: string | null;
  pendingJobCount: number;
  failedJobCount: number;
  safeMessage: string;
};

type CalendarRateOverrideState = {
  amount: number | null;
  displayValue: string;
  isOverridden: boolean;
};

type CalendarCellSyncState = "syncing" | "synced" | "failed";
type CalendarGridRowKind =
  | "availability"
  | "availability_offset"
  | "availability_per_rate"
  | "cta"
  | "ctd"
  | "max_availability"
  | "max_stay"
  | "min_stay_arrival"
  | "min_stay_through"
  | "rate"
  | "stop_sell";

type CalendarRestrictionType =
  | "rate"
  | "availability_offset"
  | "availability_per_rate"
  | "cta"
  | "ctd"
  | "max_availability"
  | "max_stay"
  | "min_stay_arrival"
  | "min_stay_through"
  | "stop_sell"
  | "block_selected"
  | "unblock_selected";

function labelizeToken(value: string | null | undefined, fallback: string): string {
  const token = typeof value === "string" ? value.trim() : "";
  if (!token) return fallback;
  return token
    .split(/[_-]+/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function calendarCellClass(status: CalendarCell["status"]): string {
  if (status === "famlo") return styles.calendarCellFamlo;
  if (status === "ota") return styles.calendarCellOta;
  if (status === "manual_block") return styles.calendarCellManual;
  if (status === "unavailable") return styles.calendarCellManual;
  if (status === "pending") return styles.calendarCellPending;
  if (status === "past") return styles.calendarCellPast;
  return styles.calendarCellAvailable;
}

function formatCalendarDetailDateRange(startDate: string, endDate: string): string {
  const start = new Date(`${startDate}T12:00:00+05:30`);
  const end = new Date(`${endDate}T12:00:00+05:30`);
  const formatter = new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  return `${formatter.format(start)} → ${formatter.format(end)}`;
}

type FamloProCalendarGridProps = {
  calendarColumns: CalendarColumn[];
  displayedCalendarRows: CalendarRow[];
  roomSyncSummaries: CalendarRoomSyncSummary[];
  calendarRateOverrides: Record<string, CalendarRateOverrideState>;
  getCalendarRateOverrideKey: (roomId: string, date: string) => string;
  calendarCellSyncStates: Record<string, CalendarCellSyncState>;
  getCalendarCellSyncKey: (roomId: string, date: string) => string;
  visibleCalendarRowKinds: CalendarGridRowKind[];
  calendarRowKindLabels: Record<CalendarGridRowKind, { code: string; title: string }>;
  selectedCalendarRatePlanLabel: string;
  calendarNavigationLabel: string;
  calendarDatePickerValue: string;
  onCalendarDatePickerChange: (value: string) => void;
  onCalendarDatePickerSubmit: () => void;
  onCalendarPreviousMonth: () => void;
  onCalendarNextMonth: () => void;
  onCalendarToday: () => void;
  isCalendarJumpPending: boolean;
  highlightedCalendarDates: Record<string, true>;
  isCalendarActionPending: boolean;
  calendarActionDate: string | null;
  onCalendarCellAction: (cell: CalendarCell, roomId: string, roomName: string) => void;
  onCalendarRateCellAction: (cell: CalendarRateCell, row: CalendarRow, restrictionType?: CalendarRestrictionType) => void;
  selectedCalendarBooking: CalendarBookingDetail | null;
  onCloseCalendarBooking: () => void;
};

export default function FamloProCalendarGrid({
  calendarColumns,
  displayedCalendarRows,
  roomSyncSummaries,
  calendarRateOverrides,
  getCalendarRateOverrideKey,
  calendarCellSyncStates,
  getCalendarCellSyncKey,
  visibleCalendarRowKinds,
  calendarRowKindLabels,
  selectedCalendarRatePlanLabel,
  calendarNavigationLabel,
  calendarDatePickerValue,
  onCalendarDatePickerChange,
  onCalendarDatePickerSubmit,
  onCalendarPreviousMonth,
  onCalendarNextMonth,
  onCalendarToday,
  isCalendarJumpPending,
  highlightedCalendarDates,
  isCalendarActionPending,
  calendarActionDate,
  onCalendarCellAction,
  onCalendarRateCellAction,
  selectedCalendarBooking,
  onCloseCalendarBooking,
}: Readonly<FamloProCalendarGridProps>): React.JSX.Element {
  const [isCalendarDatePickerOpen, setIsCalendarDatePickerOpen] = useState(false);
  const roomSyncSummaryByRoomId = new Map(roomSyncSummaries.map((entry) => [entry.roomId, entry] as const));

  const restrictionTypeByRowKind: Record<CalendarGridRowKind, CalendarRestrictionType | null> = {
    availability: null,
    availability_offset: "availability_offset",
    availability_per_rate: "availability_per_rate",
    cta: "cta",
    ctd: "ctd",
    max_availability: "max_availability",
    max_stay: "max_stay",
    min_stay_arrival: "min_stay_arrival",
    min_stay_through: "min_stay_through",
    rate: "rate",
    stop_sell: "stop_sell",
  };

  if (displayedCalendarRows.length === 0) {
    return (
      <div className={styles.emptyState}>
        <div className={styles.emptyTitle}>No room inventory available for Pro calendar</div>
        <div className={styles.emptyCopy}>
          The read-only Pro calendar needs existing stay units to render rows. Once rooms are available, Famlo and imported OTA bookings will appear here without changing the current calendar system.
        </div>
      </div>
    );
  }

  return (
    <div className={`${styles.calendarBoard} ${styles.calendarBoardLuxury}`}>
      <div className={styles.calendarGrid}>
        <div className={`${styles.calendarHeaderCell} ${styles.calendarRoomHeader} ${styles.calendarRoomHeaderSticky}`}>
          <div className={styles.calendarRoomHeaderTitle}>Room / Unit</div>
          <div className={styles.calendarHeaderNavigation}>
            <button
              type="button"
              className={styles.calendarHeaderNavButton}
              onClick={onCalendarPreviousMonth}
              disabled={isCalendarJumpPending}
              aria-label="Previous month"
            >
              <ChevronLeft size={15} />
            </button>
            <div className={styles.calendarHeaderNavigationLabel}>{calendarNavigationLabel}</div>
            <div className={styles.calendarHeaderNavigationActions}>
              <button
                type="button"
                className={styles.calendarHeaderNavButton}
                onClick={() => setIsCalendarDatePickerOpen((current) => !current)}
                disabled={isCalendarJumpPending}
                aria-label="Choose calendar date"
              >
                <CalendarDays size={15} />
              </button>
              <button
                type="button"
                className={styles.calendarHeaderNavButton}
                onClick={onCalendarNextMonth}
                disabled={isCalendarJumpPending}
                aria-label="Next month"
              >
                <ChevronRight size={15} />
              </button>
            </div>
            {isCalendarDatePickerOpen ? (
              <div className={styles.calendarHeaderDatePopover}>
                <label className={styles.calendarHeaderDatePopoverLabel}>
                  Pick a date
                  <input
                    className={styles.calendarHeaderDateInput}
                    type="date"
                    value={calendarDatePickerValue}
                    onChange={(event) => onCalendarDatePickerChange(event.target.value)}
                  />
                </label>
                <div className={styles.calendarHeaderDatePopoverActions}>
                  <button
                    type="button"
                    className={styles.secondaryActionButton}
                    onClick={() => {
                      onCalendarToday();
                      setIsCalendarDatePickerOpen(false);
                    }}
                  >
                    Today
                  </button>
                  <button
                    type="button"
                    className={styles.primaryActionButton}
                    onClick={() => {
                      onCalendarDatePickerSubmit();
                      setIsCalendarDatePickerOpen(false);
                    }}
                  >
                    Jump
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
        {calendarColumns.map((column) => (
          <div
            key={column.date}
            className={`${styles.calendarHeaderCell} ${highlightedCalendarDates[column.date] ? styles.calendarHeaderCellHighlighted : ""}`}
          >
            <div className={styles.calendarHeaderDay}>{column.dayLabel}</div>
            <div className={styles.calendarHeaderDate}>{column.dateLabel}</div>
          </div>
        ))}

        <div className={styles.calendarRowSpacer} style={{ gridColumn: `span ${calendarColumns.length + 1}` }} />

        {displayedCalendarRows.map((row) => (
          <Fragment key={row.roomId}>
            {visibleCalendarRowKinds.map((rowKind) => {
              const rowLabel = calendarRowKindLabels[rowKind];
              const restrictionType = restrictionTypeByRowKind[rowKind];

              return (
                <Fragment key={`${row.roomId}-${rowKind}`}>
                  <div className={`${styles.calendarRoomCell} ${styles.calendarRoomCellSticky} ${rowKind === "rate" ? styles.calendarRateLabel : ""}`}>
                    {rowKind === visibleCalendarRowKinds[0] ? (
                      <>
                        <div className={styles.calendarRoomName}>{row.roomName}</div>
                        <div className={styles.calendarRoomType}>{row.unitType}</div>
                        {roomSyncSummaryByRoomId.get(row.roomId) ? (
                          <div className={styles.calendarRoomType}>
                            Channex: {labelizeToken(roomSyncSummaryByRoomId.get(row.roomId)?.status, "stale")}
                          </div>
                        ) : null}
                      </>
                    ) : null}
                    <div className={styles.calendarMetricCode}>{rowLabel.code}</div>
                    <div className={styles.calendarMetricLabel}>{rowLabel.title}</div>
                    {rowKind === "rate" ? (
                      <div className={styles.calendarRoomType}>{selectedCalendarRatePlanLabel}</div>
                    ) : null}
                  </div>
                  {calendarColumns.map((column, index) => {
                    const availabilityCell = row.availabilityCells[index];
                    const rateCell = row.rateCells[index];
                    const override = calendarRateOverrides[getCalendarRateOverrideKey(row.roomId, rateCell.date)] ?? null;
                    const visibleRateCell = override
                      ? {
                          ...rateCell,
                          amount: override.amount,
                          displayValue: override.displayValue,
                          isOverridden: override.isOverridden,
                        }
                      : rateCell;
                    const syncState = calendarCellSyncStates[getCalendarCellSyncKey(row.roomId, column.date)] ?? null;

                    if (rowKind === "availability") {
                      const isActionable = Boolean(availabilityCell.bookingDetail) || availabilityCell.status === "available" || availabilityCell.status === "manual_block";
                      const isBusy = isCalendarActionPending && calendarActionDate === availabilityCell.date;
                      const title =
                        availabilityCell.bookingDetail
                          ? availabilityCell.label
                          : availabilityCell.status === "available"
                            ? `${availabilityCell.label}. Click to block this date for ${row.roomName}.`
                            : availabilityCell.status === "manual_block"
                              ? `${availabilityCell.label}. Click to unblock this date for ${row.roomName}.`
                              : availabilityCell.label;

                      return (
                        <button
                          type="button"
                          key={`${row.roomId}-${availabilityCell.date}-${rowKind}`}
                          className={`${styles.calendarCell} ${calendarCellClass(availabilityCell.status)} ${isActionable ? styles.calendarCellInteractive : ""} ${highlightedCalendarDates[availabilityCell.date] ? styles.calendarCellHighlighted : ""}`}
                          title={title}
                          onClick={() => onCalendarCellAction(availabilityCell, row.roomId, row.roomName)}
                          disabled={!isActionable || isBusy}
                        >
                          <span style={{ display: "grid", gap: "3px", justifyItems: "center" }}>
                            <span>{isBusy ? "..." : availabilityCell.status === "past" ? "—" : String(availabilityCell.availableUnits ?? 0)}</span>
                            {syncState ? (
                              <span style={{ fontSize: "9px", opacity: 0.76 }}>
                                {syncState === "syncing" ? "Syncing" : syncState === "synced" ? "Synced" : "Retry"}
                              </span>
                            ) : null}
                          </span>
                        </button>
                      );
                    }

                    const isUnsupported =
                      rowKind === "availability_offset" ||
                      rowKind === "availability_per_rate" ||
                      rowKind === "max_availability";
                    const isEditable = !visibleRateCell.isPast && !isUnsupported && restrictionType !== null;
                    const title = visibleRateCell.isPast
                      ? `${row.roomName} ${rowLabel.title} on ${visibleRateCell.date}`
                      : isUnsupported
                        ? `${rowLabel.title} preview only. Editing is not available in this calendar yet.`
                        : `Click to edit ${rowLabel.title} for ${row.roomName} on ${visibleRateCell.date}.`;
                    const displayValue =
                      rowKind === "rate"
                        ? visibleRateCell.displayValue
                        : visibleRateCell.isPast
                          ? "—"
                          : isUnsupported
                            ? "—"
                            : "Set";
                    const displaySubcopy =
                      visibleRateCell.isPast
                        ? null
                        : rowKind === "rate"
                          ? syncState === "syncing"
                            ? "Syncing"
                            : syncState === "synced"
                              ? "Synced"
                              : syncState === "failed"
                                ? "Retry"
                                : visibleRateCell.isOverridden ? "Custom" : "Base"
                          : syncState === "syncing"
                            ? "Syncing"
                            : syncState === "synced"
                              ? "Synced"
                              : syncState === "failed"
                                ? "Retry"
                                : isUnsupported
                                  ? "Read only"
                                  : "Edit";

                    return (
                      <button
                        type="button"
                        key={`${row.roomId}-${visibleRateCell.date}-${rowKind}`}
                        className={`${styles.calendarCell} ${visibleRateCell.isPast ? styles.calendarCellPast : styles.calendarRateCell} ${isEditable ? styles.calendarCellInteractive : ""} ${highlightedCalendarDates[visibleRateCell.date] ? styles.calendarCellHighlighted : ""}`}
                        disabled={!isEditable}
                        onClick={() => {
                          if (restrictionType) onCalendarRateCellAction(visibleRateCell, row, restrictionType);
                        }}
                        title={title}
                      >
                        <span style={{ display: "grid", gap: "4px", justifyItems: "center" }}>
                          <span>{displayValue}</span>
                          {displaySubcopy ? (
                            <span style={{ fontSize: "10px", opacity: 0.72 }}>
                              {displaySubcopy}
                            </span>
                          ) : null}
                        </span>
                      </button>
                    );
                  })}
                </Fragment>
              );
            })}
            <div className={styles.calendarRowSpacer} style={{ gridColumn: `span ${calendarColumns.length + 1}` }} />
          </Fragment>
        ))}
      </div>

      {selectedCalendarBooking ? (
        <div className={styles.calendarDrawerOverlay} onClick={onCloseCalendarBooking}>
          <aside
            className={styles.calendarDrawer}
            onClick={(event) => event.stopPropagation()}
            aria-label="Booking details"
          >
            <div className={styles.calendarDrawerHeader}>
              <div>
                <div className={styles.listTitle}>Booking details</div>
                <div className={styles.cardCopy}>
                  Review the selected calendar reservation or blocked stay context without changing any existing booking or availability rules.
                </div>
              </div>
              <button
                type="button"
                className={styles.drawerCloseButton}
                onClick={onCloseCalendarBooking}
                aria-label="Close booking details"
              >
                <X className={styles.drawerCloseIcon} />
              </button>
            </div>

            <div className={styles.drawerSummaryGrid}>
              <div className={styles.placeholderRow}>
                <div className={styles.placeholderTitle}>Booking source</div>
                <div className={styles.placeholderValue}>{selectedCalendarBooking.sourceLabel}</div>
              </div>
              <div className={styles.placeholderRow}>
                <div className={styles.placeholderTitle}>Room name</div>
                <div className={styles.placeholderValue}>{selectedCalendarBooking.roomName}</div>
              </div>
              <div className={styles.placeholderRow}>
                <div className={styles.placeholderTitle}>Dates</div>
                <div className={styles.placeholderValue}>
                  {formatCalendarDetailDateRange(selectedCalendarBooking.startDate, selectedCalendarBooking.endDate)}
                </div>
              </div>
              <div className={styles.placeholderRow}>
                <div className={styles.placeholderTitle}>Guest</div>
                <div className={styles.placeholderValue}>{selectedCalendarBooking.guestDisplayName}</div>
              </div>
              <div className={styles.placeholderRow}>
                <div className={styles.placeholderTitle}>Amount / currency</div>
                <div className={styles.placeholderValue}>
                  {selectedCalendarBooking.amount ?? "Not available"}
                  {selectedCalendarBooking.currency ? ` · ${selectedCalendarBooking.currency}` : ""}
                </div>
              </div>
              <div className={styles.placeholderRow}>
                <div className={styles.placeholderTitle}>Payment status</div>
                <div className={styles.placeholderValue}>
                  {labelizeToken(selectedCalendarBooking.paymentStatus, "unknown")}
                </div>
              </div>
            </div>

            <div className={styles.drawerDetailTable}>
              <div className={styles.mappingHeader}>Field</div>
              <div className={styles.mappingHeader}>Value</div>

              <div className={styles.mappingCell}>
                <div className={styles.mappingTitle}>Famlo booking ID</div>
              </div>
              <div className={styles.mappingCell}>
                <div className={styles.mappingTitle}>
                  {selectedCalendarBooking.linkedBookingId ?? selectedCalendarBooking.bookingId ?? "Not linked"}
                </div>
              </div>

              <div className={styles.mappingCell}>
                <div className={styles.mappingTitle}>External booking ID</div>
              </div>
              <div className={styles.mappingCell}>
                <div className={styles.mappingTitle}>{selectedCalendarBooking.externalBookingId ?? "Not available"}</div>
              </div>

              <div className={styles.mappingCell}>
                <div className={styles.mappingTitle}>Import status</div>
              </div>
              <div className={styles.mappingCell}>
                <div className={styles.mappingTitle}>
                  {selectedCalendarBooking.sourceLabel === "Channex / OTA"
                    ? labelizeToken(selectedCalendarBooking.importStatus, "unknown")
                    : "Not applicable"}
                </div>
              </div>

              <div className={styles.mappingCell}>
                <div className={styles.mappingTitle}>Ack status</div>
              </div>
              <div className={styles.mappingCell}>
                <div className={styles.mappingTitle}>
                  {selectedCalendarBooking.sourceLabel === "Channex / OTA"
                    ? labelizeToken(selectedCalendarBooking.ackStatus, "unknown")
                    : "Not applicable"}
                </div>
              </div>

              <div className={styles.mappingCell}>
                <div className={styles.mappingTitle}>Imported into Famlo</div>
              </div>
              <div className={styles.mappingCell}>
                <div className={styles.mappingTitle}>{selectedCalendarBooking.importedIntoFamlo ? "Yes" : "No"}</div>
              </div>

              <div className={styles.mappingCell}>
                <div className={styles.mappingTitle}>Acknowledged</div>
              </div>
              <div className={styles.mappingCell}>
                <div className={styles.mappingTitle}>{selectedCalendarBooking.acknowledged ? "Yes" : "No"}</div>
              </div>

              <div className={styles.mappingCell}>
                <div className={styles.mappingTitle}>Feed revision ID</div>
              </div>
              <div className={styles.mappingCell}>
                <div className={styles.mappingTitle}>{selectedCalendarBooking.externalRevisionId ?? "Not available"}</div>
              </div>

              <div className={styles.mappingCell}>
                <div className={styles.mappingTitle}>Booking List revision ID</div>
              </div>
              <div className={styles.mappingCell}>
                <div className={styles.mappingTitle}>{selectedCalendarBooking.bookingListRevisionId ?? "Not available"}</div>
              </div>

              <div className={styles.mappingCell}>
                <div className={styles.mappingTitle}>Feed status</div>
              </div>
              <div className={styles.mappingCell}>
                <div className={styles.mappingTitle}>
                  {selectedCalendarBooking.feedStatus === "not_applicable"
                    ? "Not applicable"
                    : labelizeToken(selectedCalendarBooking.feedStatus, "unknown")}
                </div>
              </div>

              <div className={styles.mappingCell}>
                <div className={styles.mappingTitle}>CRS-only / manual indicator</div>
              </div>
              <div className={styles.mappingCell}>
                <div className={styles.mappingTitle}>{selectedCalendarBooking.isCrsOnly ? "Yes" : "No"}</div>
              </div>

              <div className={styles.mappingCell}>
                <div className={styles.mappingTitle}>Ack eligibility</div>
              </div>
              <div className={styles.mappingCell}>
                <div className={styles.mappingTitle}>
                  {selectedCalendarBooking.sourceLabel === "Channex / OTA"
                    ? selectedCalendarBooking.ackEligible
                      ? "Eligible"
                      : "Blocked until real feed revision"
                    : "Not applicable"}
                </div>
              </div>
            </div>

            {selectedCalendarBooking.acknowledgementNote ? (
              <div className={`${styles.feedbackBox} ${styles.feedbackError}`}>
                {selectedCalendarBooking.acknowledgementNote}
              </div>
            ) : null}
          </aside>
        </div>
      ) : null}
    </div>
  );
}
