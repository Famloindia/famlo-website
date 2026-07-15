"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import styles from "../dashboard.module.css";
import { isPastDateInIndia } from "@/lib/booking-time";
import ChannelManagerTab from "./ChannelManagerTab";

type FreeCalendarStatus = "available" | "manual_block" | "unavailable" | "past" | "famlo" | "ota" | "pending";
type FreeCalendarMetric =
  | "availability"
  | "rate"
  | "stop_sell"
  | "cta"
  | "ctd"
  | "min_stay_arrival"
  | "min_stay_through"
  | "max_stay";
type DisplayMetric = "availability_price" | FreeCalendarMetric;

type FreeCalendarCell = {
  date: string;
  roomId?: string;
  room_id?: string;
  stayUnitId?: string;
  stay_unit_id?: string;
  availability?: number | null;
  availableUnits?: number | null;
  available_units?: number | null;
  rate?: number | null;
  price?: number | null;
  status?: FreeCalendarStatus | string | null;
  label?: string | null;
  stopSell?: boolean;
  stop_sell?: boolean;
  closedToArrival?: boolean;
  closed_to_arrival?: boolean;
  closedToDeparture?: boolean;
  closed_to_departure?: boolean;
  cta?: boolean;
  ctd?: boolean;
  minStayArrival?: number | null;
  min_stay_arrival?: number | null;
  minStayThrough?: number | null;
  min_stay_through?: number | null;
  minStay?: number | null;
  min_stay?: number | null;
  maxStay?: number | null;
  max_stay?: number | null;
  isBlocked?: boolean;
  is_blocked?: boolean;
  updatedAt?: string | null;
  updated_at?: string | null;
};

type FreeCalendarRateCell = {
  date: string;
  amount?: number | null;
  displayValue?: string | null;
  baseAmount?: number | null;
  isPast?: boolean;
  isOverridden?: boolean;
};

type FreeCalendarRow = {
  roomId: string;
  roomName?: string;
  unitType?: string;
  rate?: number | null;
  availabilityCells?: FreeCalendarCell[];
  rateCells?: FreeCalendarRateCell[];
  dates?: FreeCalendarCell[];
};

type FreeCalendarSnapshot = {
  rows?: FreeCalendarRow[];
  error?: string;
};

type EditorState = {
  room: FreeCalendarRow;
  cell: FreeCalendarCell;
  metric: FreeCalendarMetric | "block_selected" | "unblock_selected";
  dateFrom: string;
  dateTo: string;
  value: string;
};

type BulkState = {
  open: boolean;
  dateFrom: string;
  dateTo: string;
  selectedRoomIds: string[];
  metric: FreeCalendarMetric | "block_selected" | "unblock_selected";
  value: string;
};

const displayMetrics: Array<{ key: DisplayMetric; code: string; title: string }> = [
  { key: "availability_price", code: "INV", title: "Availability + Price" },
  { key: "availability", code: "AVL", title: "Availability only" },
  { key: "rate", code: "RATE", title: "Rate only" },
  { key: "stop_sell", code: "SS", title: "Stop Sell" },
  { key: "cta", code: "CTA", title: "Closed To Arrival" },
  { key: "ctd", code: "CTD", title: "Closed To Departure" },
  { key: "min_stay_arrival", code: "MSA", title: "Min Stay Arrival" },
  { key: "min_stay_through", code: "MST", title: "Min Stay Through" },
  { key: "max_stay", code: "MAX", title: "Max Stay" },
];

const editableMetrics: Array<{ key: EditorState["metric"]; label: string }> = [
  { key: "rate", label: "Rate" },
  { key: "block_selected", label: "Block selected dates" },
  { key: "unblock_selected", label: "Unblock selected dates" },
  { key: "stop_sell", label: "Stop Sell" },
  { key: "cta", label: "Closed To Arrival" },
  { key: "ctd", label: "Closed To Departure" },
  { key: "min_stay_arrival", label: "Min Stay Arrival" },
  { key: "min_stay_through", label: "Min Stay Through" },
  { key: "max_stay", label: "Max Stay" },
];

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function addIsoDays(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function enumerateIsoDates(dateFrom: string, dateTo: string): string[] {
  const dates: string[] = [];
  let cursor = dateFrom;
  for (let index = 0; index < 370 && cursor <= dateTo; index += 1) {
    dates.push(cursor);
    cursor = addIsoDays(cursor, 1);
  }
  return dates;
}

function dateLabel(date: string): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", timeZone: "UTC" }).format(parsed);
}

function dayLabel(date: string): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  return new Intl.DateTimeFormat("en-IN", { weekday: "short", timeZone: "UTC" }).format(parsed);
}

function money(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? `₹${value.toLocaleString("en-IN")}` : "—";
}

function numberLabel(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : "—";
}

function boolLabel(value: boolean | undefined | null): string {
  return value ? "Closed" : "Open";
}

function statusClass(status: string | null | undefined): string {
  if (status === "manual_block" || status === "unavailable") return "#fff1f2";
  if (status === "past") return "#f1f5f9";
  if (status === "pending") return "#fffbeb";
  if (status === "ota") return "#faf5ff";
  if (status === "famlo") return "#eff6ff";
  return "#ffffff";
}

function statusColor(status: string | null | undefined): string {
  if (status === "manual_block" || status === "unavailable") return "#b91c1c";
  if (status === "past") return "#64748b";
  if (status === "pending") return "#92400e";
  if (status === "ota") return "#7e22ce";
  if (status === "famlo") return "#1d4ed8";
  return "#0e2b57";
}

function cellAvailability(cell: FreeCalendarCell): number | null {
  return cell.availability ?? cell.availableUnits ?? cell.available_units ?? null;
}

function cellRate(cell: FreeCalendarCell, rateCell?: FreeCalendarRateCell | null): number | null {
  return cell.rate ?? cell.price ?? rateCell?.amount ?? null;
}

function cellStopSell(cell: FreeCalendarCell): boolean {
  return Boolean(cell.stopSell ?? cell.stop_sell);
}

function cellCta(cell: FreeCalendarCell): boolean {
  return Boolean(cell.closedToArrival ?? cell.closed_to_arrival ?? cell.cta);
}

function cellCtd(cell: FreeCalendarCell): boolean {
  return Boolean(cell.closedToDeparture ?? cell.closed_to_departure ?? cell.ctd);
}

function cellMinStayArrival(cell: FreeCalendarCell): number | null {
  return cell.minStayArrival ?? cell.min_stay_arrival ?? null;
}

function cellMinStayThrough(cell: FreeCalendarCell): number | null {
  return cell.minStayThrough ?? cell.min_stay_through ?? cell.minStay ?? cell.min_stay ?? null;
}

function cellMaxStay(cell: FreeCalendarCell): number | null {
  return cell.maxStay ?? cell.max_stay ?? null;
}

function cellBlocked(cell: FreeCalendarCell): boolean {
  const explicit = cell.isBlocked ?? cell.is_blocked ?? cell.stopSell ?? cell.stop_sell;
  return Boolean(explicit ?? (cell.status === "manual_block" || cell.status === "unavailable"));
}

function metricValue(metric: DisplayMetric, cell: FreeCalendarCell, rateCell?: FreeCalendarRateCell | null): { value: string; hint: string } {
  if (metric === "availability_price") {
    return {
      value: `${numberLabel(cellAvailability(cell))} avail`,
      hint: money(cellRate(cell, rateCell)),
    };
  }
  if (metric === "availability") return { value: numberLabel(cellAvailability(cell)), hint: cell.label ?? "Available" };
  if (metric === "rate") return { value: money(cellRate(cell, rateCell)), hint: rateCell?.isOverridden ? "Custom" : "Base" };
  if (metric === "stop_sell") return { value: boolLabel(cellStopSell(cell)), hint: "Stop sell" };
  if (metric === "cta") return { value: boolLabel(cellCta(cell)), hint: "CTA" };
  if (metric === "ctd") return { value: boolLabel(cellCtd(cell)), hint: "CTD" };
  if (metric === "min_stay_arrival") return { value: numberLabel(cellMinStayArrival(cell)), hint: "Nights" };
  if (metric === "min_stay_through") return { value: numberLabel(cellMinStayThrough(cell)), hint: "Nights" };
  return { value: numberLabel(cellMaxStay(cell)), hint: "Nights" };
}

function editorValue(metric: EditorState["metric"], cell: FreeCalendarCell, rateCell?: FreeCalendarRateCell | null): string {
  if (metric === "rate") return String(cellRate(cell, rateCell) ?? "");
  if (metric === "stop_sell") return String(cellStopSell(cell));
  if (metric === "cta") return String(cellCta(cell));
  if (metric === "ctd") return String(cellCtd(cell));
  if (metric === "min_stay_arrival") return String(cellMinStayArrival(cell) ?? 1);
  if (metric === "min_stay_through") return String(cellMinStayThrough(cell) ?? 1);
  if (metric === "max_stay") return String(cellMaxStay(cell) ?? 1);
  return "";
}

function metricLabel(metric: EditorState["metric"]): string {
  return editableMetrics.find((item) => item.key === metric)?.label ?? metric;
}

export default function CalendarTab({
  saving,
  familyId,
}: {
  schedule?: { blockedDates?: string };
  setSchedule?: any;
  bookingRows: any[];
  onSave?: any;
  saving?: boolean;
  hostId?: string;
  familyId?: string;
}) {
  const [startDate, setStartDate] = useState(todayIso());
  const [datePickerValue, setDatePickerValue] = useState(todayIso());
  const [rows, setRows] = useState<FreeCalendarRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingCalendar, setSavingCalendar] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [bulk, setBulk] = useState<BulkState | null>(null);
  const [connectedRoomId, setConnectedRoomId] = useState<string | null>(null);
  const [selectedDisplayMetric, setSelectedDisplayMetric] = useState<DisplayMetric>("availability_price");

  const columns = useMemo(() => enumerateIsoDates(startDate, addIsoDays(startDate, 13)), [startDate]);
  const dateFrom = columns[0] ?? startDate;
  const dateTo = columns[columns.length - 1] ?? startDate;

  const loadCalendar = useCallback(async () => {
    if (!familyId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/host/free-pms/calendar/snapshot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ familyId, dateFrom, dateTo, roomIds: [] }),
      });
      const data = (await response.json()) as FreeCalendarSnapshot;
      if (!response.ok) throw new Error(data.error ?? "Free calendar snapshot failed.");
      setRows(data.rows ?? []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Free calendar could not load.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, familyId]);

  useEffect(() => {
    void loadCalendar();
  }, [loadCalendar]);

  function openEditor(room: FreeCalendarRow, cell: FreeCalendarCell, metric: DisplayMetric): void {
    if (isPastDateInIndia(cell.date)) return;
    const rateCell = room.rateCells?.find((entry) => entry.date === cell.date) ?? null;
    const nextMetric: EditorState["metric"] =
      metric === "availability_price"
        ? "rate"
        : metric === "availability"
          ? cellBlocked(cell)
            ? "unblock_selected"
            : "block_selected"
          : metric;
    setEditor({
      room,
      cell,
      metric: nextMetric,
      dateFrom: cell.date,
      dateTo: cell.date,
      value: editorValue(nextMetric, cell, rateCell),
    });
  }

  function openBulkEditor(): void {
    setBulk({
      open: true,
      dateFrom,
      dateTo,
      selectedRoomIds: rows.map((row) => row.roomId),
      metric: "rate",
      value: "",
    });
  }

  async function submitUpdate(input: {
    roomIds: string[];
    metric: EditorState["metric"];
    dateFrom: string;
    dateTo: string;
    value: string;
  }): Promise<void> {
    if (!familyId) return;
    if (input.dateTo < input.dateFrom) {
      setError("Choose a valid date range.");
      return;
    }
    if (input.dateFrom < todayIso()) {
      setError("Past dates are locked.");
      return;
    }

    const numericMetrics: Array<EditorState["metric"]> = ["rate", "min_stay_arrival", "min_stay_through", "max_stay"];
    const parsedValue = Number(input.value);
    if (numericMetrics.includes(input.metric) && (!Number.isFinite(parsedValue) || parsedValue <= 0)) {
      setError(input.metric === "rate" ? "Enter a valid positive rate." : "Enter a valid positive number.");
      return;
    }

    setSavingCalendar(true);
    setError(null);
    try {
      const isSingleRoomSingleDate = input.roomIds.length === 1 && input.dateFrom === input.dateTo;
      const canUseDayRoute = isSingleRoomSingleDate && (input.metric === "rate" || input.metric === "block_selected" || input.metric === "unblock_selected");
      const response = canUseDayRoute
        ? await fetch("/api/host/free-pms/calendar/day", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              familyId,
              roomId: input.roomIds[0],
              date: input.dateFrom,
              action:
                input.metric === "rate"
                  ? "save_price"
                  : input.metric === "block_selected"
                    ? "block"
                    : "unblock",
              amount: input.metric === "rate" ? parsedValue : null,
            }),
          })
        : await fetch("/api/host/free-pms/calendar/bulk-update", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              familyId,
              roomIds: input.roomIds,
              roomScope: input.roomIds.length === rows.length ? "all" : "single",
              applyToAllRooms: input.roomIds.length === rows.length,
              dateFrom: input.dateFrom,
              dateTo: input.dateTo,
              rateAction: input.metric === "rate" ? "save" : null,
              rateAmount: input.metric === "rate" ? parsedValue : null,
              availabilityAction:
                input.metric === "block_selected"
                  ? "block"
                  : input.metric === "unblock_selected"
                    ? "unblock"
                    : null,
              restrictions: {
                stopSell: input.metric === "stop_sell" ? input.value === "true" : undefined,
                cta: input.metric === "cta" ? input.value === "true" : undefined,
                ctd: input.metric === "ctd" ? input.value === "true" : undefined,
                minStayArrival: input.metric === "min_stay_arrival" ? parsedValue : undefined,
                minStay: input.metric === "min_stay_through" ? parsedValue : undefined,
                maxStay: input.metric === "max_stay" ? parsedValue : undefined,
              },
            }),
          });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Free calendar update failed.");
      setEditor(null);
      setBulk(null);
      await loadCalendar();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Free calendar update failed.");
    } finally {
      setSavingCalendar(false);
    }
  }

  const totalBlocked = rows.reduce(
    (sum, row) => sum + (row.availabilityCells ?? row.dates ?? []).filter((cell) => cellBlocked(cell)).length,
    0
  );
  const totalRooms = rows.length;
  const totalBookableCells = rows.reduce(
    (sum, row) => sum + (row.availabilityCells ?? row.dates ?? []).filter((cell) => !cellBlocked(cell) && cell.status !== "past").length,
    0
  );

  const editorPanel = editor ? (
    <div style={inlineEditorCardStyle}>
      <div style={modalHeaderStyle}>
        <div>
          <h3 style={{ margin: 0, color: "#0e2b57", fontSize: 20 }}>Edit {metricLabel(editor.metric)}</h3>
          <p style={{ margin: "4px 0 0", color: "rgba(14,43,87,0.62)", fontWeight: 700 }}>
            {editor.room.roomName ?? "Room"} · {editor.dateFrom === editor.dateTo ? editor.dateFrom : `${editor.dateFrom} → ${editor.dateTo}`}
          </p>
        </div>
        <button type="button" style={iconButtonStyle} onClick={() => setEditor(null)} aria-label="Close editor">×</button>
      </div>
      <div style={formGridStyle}>
        <label style={fieldStyle}><span>From date</span><input type="date" value={editor.dateFrom} min={todayIso()} onChange={(event) => setEditor((current) => current ? { ...current, dateFrom: event.target.value, dateTo: current.dateTo < event.target.value ? event.target.value : current.dateTo } : current)} /></label>
        <label style={fieldStyle}><span>To date</span><input type="date" value={editor.dateTo} min={editor.dateFrom} onChange={(event) => setEditor((current) => current ? { ...current, dateTo: event.target.value } : current)} /></label>
        <label style={fieldStyle}>
          <span>Inventory value</span>
          <select value={editor.metric} onChange={(event) => setEditor((current) => current ? { ...current, metric: event.target.value as EditorState["metric"], value: editorValue(event.target.value as EditorState["metric"], current.cell) } : current)}>
            {editableMetrics.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
          </select>
        </label>
        {editor.metric === "block_selected" || editor.metric === "unblock_selected" ? (
          <div style={noteStyle}>
            {editor.metric === "block_selected" ? "This will block selected Free inventory dates." : "This will unblock selected Free inventory dates."}
          </div>
        ) : editor.metric === "stop_sell" || editor.metric === "cta" || editor.metric === "ctd" ? (
          <label style={fieldStyle}><span>Value</span><select value={editor.value} onChange={(event) => setEditor((current) => current ? { ...current, value: event.target.value } : current)}><option value="true">Closed / Yes</option><option value="false">Open / No</option></select></label>
        ) : (
          <label style={fieldStyle}><span>Value</span><input inputMode="numeric" value={editor.value} onChange={(event) => setEditor((current) => current ? { ...current, value: event.target.value } : current)} placeholder={editor.metric === "rate" ? "1500" : "1"} /></label>
        )}
      </div>
      <div style={modalActionsStyle}>
        <button type="button" style={secondaryButtonStyle} onClick={() => setEditor(null)}>Cancel</button>
        <button type="button" style={primaryButtonStyle} onClick={() => void submitUpdate({ roomIds: [editor.room.roomId], metric: editor.metric, dateFrom: editor.dateFrom, dateTo: editor.dateTo, value: editor.value })} disabled={savingCalendar}>
          {savingCalendar ? "Saving..." : "Save"}
        </button>
      </div>
    </div>
  ) : null;

  return (
    <div className={`${styles.flexCol} ${styles.animateIn}`} style={{ gap: 22 }}>
      <section className={styles.glassCard} style={{ padding: 24, display: "grid", gap: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 900, color: "#165dcc" }}>
              Free PMS Inventory
            </div>
            <h2 style={{ fontSize: 26, fontWeight: 950, margin: "4px 0", color: "#0e2b57" }}>Calendar</h2>
            <p style={{ margin: 0, color: "rgba(14,43,87,0.65)", fontSize: 13, fontWeight: 700 }}>
              Same Pro-style room inventory view, powered by Famlo Free local calendar data.
            </p>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <div style={summaryPillStyle}><strong>{totalRooms}</strong><span>Rooms</span></div>
            <div style={summaryPillStyle}><strong>{totalBookableCells}</strong><span>Open cells</span></div>
            <div style={{ ...summaryPillStyle, background: "#fef2f2", color: "#b91c1c" }}><strong>{totalBlocked}</strong><span>Blocked</span></div>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <button type="button" style={toolbarButtonStyle} onClick={() => setStartDate(addIsoDays(startDate, -14))}>
              <span aria-hidden="true">‹</span> Previous
            </button>
            <button type="button" style={toolbarButtonStyle} onClick={() => setStartDate(todayIso())}>
              Today
            </button>
            <button type="button" style={toolbarButtonStyle} onClick={() => setStartDate(addIsoDays(startDate, 14))}>
              Next <span aria-hidden="true">›</span>
            </button>
            <label style={{ ...toolbarButtonStyle, cursor: "default" }}>
              <span aria-hidden="true">📅</span>
              <input
                type="date"
                value={datePickerValue}
                onChange={(event) => setDatePickerValue(event.target.value)}
                style={{ border: "none", background: "transparent", color: "#0e2b57", fontWeight: 800 }}
              />
              <button type="button" style={miniButtonStyle} onClick={() => setStartDate(datePickerValue)}>
                Jump
              </button>
            </label>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <label style={{ ...toolbarButtonStyle, cursor: "default" }}>
              Show
              <select
                value={selectedDisplayMetric}
                onChange={(event) => setSelectedDisplayMetric(event.target.value as DisplayMetric)}
                style={{ border: "none", background: "transparent", color: "#0e2b57", fontWeight: 850 }}
              >
                {displayMetrics.map((metric) => (
                  <option key={metric.key} value={metric.key}>
                    {metric.title}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" style={toolbarButtonStyle} onClick={() => void loadCalendar()} disabled={loading || saving}>
              <span aria-hidden="true">↻</span> {loading ? "Refreshing..." : "Refresh"}
            </button>
            <button type="button" style={{ ...toolbarButtonStyle, background: "#0e2b57", color: "white" }} onClick={openBulkEditor} disabled={rows.length === 0 || savingCalendar}>
              <span aria-hidden="true">▦</span> Bulk Update
            </button>
          </div>
        </div>
        {error ? <div style={errorStyle}>{error}</div> : null}
      </section>

      {rows.length === 0 && loading ? (
        <section className={styles.glassCard} style={{ padding: 24, color: "#0e2b57", fontWeight: 800 }}>Loading Free PMS inventory...</section>
      ) : null}

      {rows.length === 0 && !loading ? (
        <section className={styles.glassCard} style={{ padding: 24 }}>
          <h3 style={{ margin: 0, color: "#0e2b57" }}>No rooms found</h3>
          <p style={{ color: "rgba(14,43,87,0.65)", fontWeight: 700 }}>Add rooms first, then this page will show each room as a PMS inventory line.</p>
        </section>
      ) : null}

      {rows.length > 0 ? (
        <section style={calendarBoardStyle}>
          <div style={{ display: "grid", gridTemplateColumns: `260px repeat(${columns.length}, minmax(92px, 1fr))`, minWidth: 260 + columns.length * 92 }}>
            <div style={{ ...headerCellStyle, position: "sticky", left: 0, zIndex: 3 }}>
              <strong>Room / Unit</strong>
              <small style={{ color: "rgba(14,43,87,0.56)", fontWeight: 800 }}>
                {displayMetrics.find((metric) => metric.key === selectedDisplayMetric)?.title ?? "Inventory"}
              </small>
            </div>
            {columns.map((date) => (
              <div key={date} style={{ ...headerCellStyle, background: date === todayIso() ? "#eff6ff" : "white" }}>
                <strong>{dayLabel(date)}</strong>
                <span style={{ color: "#165dcc", fontWeight: 900 }}>{dateLabel(date)}</span>
              </div>
            ))}

            {rows.map((row) => {
              const cells = row.availabilityCells ?? row.dates ?? [];
              return (
                <div key={row.roomId} style={{ display: "contents" }}>
                  <div style={{ ...roomCellStyle, position: "sticky", left: 0, zIndex: 2, borderTop: "1px solid #dbeafe", minHeight: 78 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "start" }}>
                      <div>
                        <div style={{ color: "#0e2b57", fontWeight: 950, fontSize: 15 }}>{row.roomName ?? "Room"}</div>
                        <div style={{ color: "rgba(14,43,87,0.56)", fontSize: 12, fontWeight: 800 }}>{row.unitType ?? "stay unit"}</div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
                          <span style={metricCodeStyle}>{displayMetrics.find((metric) => metric.key === selectedDisplayMetric)?.code ?? "INV"}</span>
                          <span style={{ fontWeight: 850, color: "#0e2b57", fontSize: 12 }}>
                            {displayMetrics.find((metric) => metric.key === selectedDisplayMetric)?.title ?? "Inventory"}
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        style={connectButtonStyle}
                        onClick={() => setConnectedRoomId((current) => (current === row.roomId ? null : row.roomId))}
                      >
                        <span aria-hidden="true">🔗</span> Connect
                      </button>
                    </div>
                  </div>
                  {columns.map((date) => {
                    const cell = cells.find((entry) => entry.date === date) ?? { date, status: isPastDateInIndia(date) ? "past" : "available", availableUnits: null };
                    const rateCell = row.rateCells?.find((entry) => entry.date === date) ?? null;
                    const display = metricValue(selectedDisplayMetric, cell, rateCell);
                    const isInventoryView = selectedDisplayMetric === "availability_price" || selectedDisplayMetric === "availability";
                    const isUnavailable = cellBlocked(cell) || cell.status === "unavailable" || cell.status === "manual_block";
                    const disabled = isPastDateInIndia(date) || savingCalendar;
                    return (
                      <button
                        key={`${row.roomId}-${selectedDisplayMetric}-${date}`}
                        type="button"
                        disabled={disabled}
                        onClick={() => openEditor(row, cell, selectedDisplayMetric)}
                        style={{
                          ...cellStyle,
                          minHeight: 78,
                          background: disabled ? "#f8fafc" : isInventoryView ? statusClass(cell.status) : isUnavailable ? "#fff1f2" : "#ffffff",
                          color: isUnavailable ? "#b91c1c" : isInventoryView ? statusColor(cell.status) : "#0e2b57",
                          cursor: disabled ? "not-allowed" : "pointer",
                          opacity: disabled ? 0.65 : 1,
                        }}
                        title={`${row.roomName ?? "Room"} · ${displayMetrics.find((metric) => metric.key === selectedDisplayMetric)?.title ?? "Inventory"} · ${date}`}
                      >
                        <strong>{display.value}</strong>
                        <small>{display.hint}</small>
                      </button>
                    );
                  })}
                  {editor?.room.roomId === row.roomId ? (
                    <div style={{ gridColumn: `1 / span ${columns.length + 1}`, padding: "14px 18px 18px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                      {editorPanel}
                    </div>
                  ) : null}
                  {connectedRoomId === row.roomId ? (
                    <div style={{ gridColumn: `1 / span ${columns.length + 1}`, padding: 18, background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                      <div style={{ maxWidth: 980 }}>
                        <ChannelManagerTab
                          ownerType="stay_unit"
                          ownerId={row.roomId}
                          title={`${row.roomName ?? "Room"} iCal Sync`}
                          description="Paste the OTA iCal URL for this room. Famlo imports the room calendar and keeps this connection attached only to this room."
                        />
                      </div>
                    </div>
                  ) : null}
                  <div style={{ gridColumn: `1 / span ${columns.length + 1}`, height: 12, background: "#f6f8fb" }} />
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {bulk?.open ? (
        <div style={modalOverlayStyle} onClick={() => setBulk(null)}>
          <div style={modalStyle} onClick={(event) => event.stopPropagation()}>
            <div style={modalHeaderStyle}>
              <div>
                <h3 style={{ margin: 0, color: "#0e2b57", fontSize: 20 }}>Bulk Update</h3>
                <p style={{ margin: "4px 0 0", color: "rgba(14,43,87,0.62)", fontWeight: 700 }}>Apply Free PMS inventory changes across rooms and dates.</p>
              </div>
              <button type="button" style={iconButtonStyle} onClick={() => setBulk(null)} aria-label="Close bulk update">×</button>
            </div>
            <div style={formGridStyle}>
              <label style={fieldStyle}><span>From date</span><input type="date" value={bulk.dateFrom} min={todayIso()} onChange={(event) => setBulk((current) => current ? { ...current, dateFrom: event.target.value, dateTo: current.dateTo < event.target.value ? event.target.value : current.dateTo } : current)} /></label>
              <label style={fieldStyle}><span>To date</span><input type="date" value={bulk.dateTo} min={bulk.dateFrom} onChange={(event) => setBulk((current) => current ? { ...current, dateTo: event.target.value } : current)} /></label>
              <label style={fieldStyle}><span>Inventory value</span><select value={bulk.metric} onChange={(event) => setBulk((current) => current ? { ...current, metric: event.target.value as BulkState["metric"], value: "" } : current)}>{editableMetrics.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select></label>
              {bulk.metric === "block_selected" || bulk.metric === "unblock_selected" ? (
                <div style={noteStyle}>Availability will be updated for selected rooms.</div>
              ) : bulk.metric === "stop_sell" || bulk.metric === "cta" || bulk.metric === "ctd" ? (
                <label style={fieldStyle}><span>Value</span><select value={bulk.value || "true"} onChange={(event) => setBulk((current) => current ? { ...current, value: event.target.value } : current)}><option value="true">Closed / Yes</option><option value="false">Open / No</option></select></label>
              ) : (
                <label style={fieldStyle}><span>Value</span><input inputMode="numeric" value={bulk.value} onChange={(event) => setBulk((current) => current ? { ...current, value: event.target.value } : current)} placeholder={bulk.metric === "rate" ? "1500" : "1"} /></label>
              )}
            </div>
            <div style={{ display: "grid", gap: 10, marginTop: 16 }}>
              <strong style={{ color: "#0e2b57" }}>Rooms</strong>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
                {rows.map((row) => (
                  <label key={row.roomId} style={checkboxRowStyle}>
                    <input
                      type="checkbox"
                      checked={bulk.selectedRoomIds.includes(row.roomId)}
                      onChange={() => setBulk((current) => current ? {
                        ...current,
                        selectedRoomIds: current.selectedRoomIds.includes(row.roomId)
                          ? current.selectedRoomIds.filter((id) => id !== row.roomId)
                          : [...current.selectedRoomIds, row.roomId],
                      } : current)}
                    />
                    <span>{row.roomName ?? "Room"}</span>
                  </label>
                ))}
              </div>
            </div>
            <div style={modalActionsStyle}>
              <button type="button" style={secondaryButtonStyle} onClick={() => setBulk(null)}>Cancel</button>
              <button
                type="button"
                style={primaryButtonStyle}
                onClick={() => void submitUpdate({
                  roomIds: bulk.selectedRoomIds,
                  metric: bulk.metric,
                  dateFrom: bulk.dateFrom,
                  dateTo: bulk.dateTo,
                  value: bulk.metric === "stop_sell" || bulk.metric === "cta" || bulk.metric === "ctd" ? bulk.value || "true" : bulk.value,
                })}
                disabled={savingCalendar || bulk.selectedRoomIds.length === 0}
              >
                {savingCalendar ? "Saving..." : "Apply Bulk Update"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

const summaryPillStyle: CSSProperties = {
  display: "grid",
  gap: 2,
  minWidth: 92,
  padding: "10px 14px",
  borderRadius: 16,
  background: "#eff6ff",
  color: "#0e2b57",
  fontWeight: 900,
};

const toolbarButtonStyle: CSSProperties = {
  border: "1px solid rgba(14,43,87,0.12)",
  borderRadius: 999,
  padding: "10px 14px",
  background: "white",
  color: "#0e2b57",
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  fontWeight: 850,
  cursor: "pointer",
};

const miniButtonStyle: CSSProperties = {
  border: "none",
  borderRadius: 999,
  background: "#165dcc",
  color: "white",
  padding: "6px 10px",
  fontWeight: 900,
  cursor: "pointer",
};

const calendarBoardStyle: CSSProperties = {
  overflowX: "auto",
  border: "1px solid rgba(14,43,87,0.1)",
  borderRadius: 24,
  background: "#f6f8fb",
  boxShadow: "0 24px 70px rgba(15, 23, 42, 0.08)",
};

const headerCellStyle: CSSProperties = {
  minHeight: 74,
  padding: 14,
  borderRight: "1px solid #e2e8f0",
  borderBottom: "1px solid #e2e8f0",
  display: "grid",
  gap: 4,
  alignContent: "center",
  background: "white",
  color: "#0e2b57",
};

const roomCellStyle: CSSProperties = {
  minHeight: 66,
  padding: 14,
  borderRight: "1px solid #e2e8f0",
  borderBottom: "1px solid #e2e8f0",
  background: "#ffffff",
  display: "grid",
  gap: 8,
  alignContent: "center",
  boxShadow: "inset 4px 0 0 #dbeafe",
};

const metricCodeStyle: CSSProperties = {
  width: 42,
  textAlign: "center",
  padding: "4px 6px",
  borderRadius: 999,
  background: "#dbeafe",
  color: "#165dcc",
  fontSize: 10,
  fontWeight: 950,
};

const cellStyle: CSSProperties = {
  minHeight: 66,
  border: "none",
  borderRight: "1px solid #e2e8f0",
  borderBottom: "1px solid #e2e8f0",
  padding: 8,
  display: "grid",
  gap: 4,
  justifyItems: "center",
  alignContent: "center",
  fontWeight: 900,
  transition: "background 160ms ease, transform 160ms ease, box-shadow 160ms ease",
};

const connectButtonStyle: CSSProperties = {
  border: "none",
  borderRadius: 999,
  padding: "7px 10px",
  background: "#0e2b57",
  color: "white",
  fontSize: 11,
  fontWeight: 900,
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  cursor: "pointer",
};

const modalOverlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(15,23,42,0.42)",
  zIndex: 80,
  display: "grid",
  placeItems: "end center",
  padding: 18,
};

const modalStyle: CSSProperties = {
  width: "min(760px, 100%)",
  maxHeight: "86vh",
  overflowY: "auto",
  borderRadius: 28,
  background: "white",
  padding: 24,
  boxShadow: "0 30px 100px rgba(15,23,42,0.28)",
};

const inlineEditorCardStyle: CSSProperties = {
  maxWidth: 900,
  borderRadius: 22,
  background: "white",
  border: "1px solid rgba(14,43,87,0.1)",
  padding: 20,
  boxShadow: "0 18px 44px rgba(15,23,42,0.10)",
};

const modalHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 16,
  alignItems: "start",
  marginBottom: 18,
};

const iconButtonStyle: CSSProperties = {
  width: 38,
  height: 38,
  borderRadius: 999,
  border: "none",
  background: "#f1f5f9",
  color: "#0e2b57",
  display: "grid",
  placeItems: "center",
  cursor: "pointer",
};

const formGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
  gap: 12,
};

const fieldStyle: CSSProperties = {
  display: "grid",
  gap: 6,
  color: "#0e2b57",
  fontSize: 13,
  fontWeight: 850,
};

const noteStyle: CSSProperties = {
  borderRadius: 16,
  padding: 14,
  background: "#eff6ff",
  color: "#0e2b57",
  fontWeight: 800,
};

const modalActionsStyle: CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  gap: 10,
  marginTop: 22,
};

const primaryButtonStyle: CSSProperties = {
  border: "none",
  borderRadius: 999,
  padding: "12px 18px",
  background: "#0e2b57",
  color: "white",
  fontWeight: 900,
  cursor: "pointer",
};

const secondaryButtonStyle: CSSProperties = {
  border: "1px solid rgba(14,43,87,0.14)",
  borderRadius: 999,
  padding: "12px 18px",
  background: "white",
  color: "#0e2b57",
  fontWeight: 900,
  cursor: "pointer",
};

const checkboxRowStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "center",
  padding: "10px 12px",
  borderRadius: 14,
  background: "#f8fafc",
  color: "#0e2b57",
  fontWeight: 800,
};

const errorStyle: CSSProperties = {
  borderRadius: 16,
  padding: "12px 14px",
  background: "#fef2f2",
  color: "#b91c1c",
  fontWeight: 850,
};
