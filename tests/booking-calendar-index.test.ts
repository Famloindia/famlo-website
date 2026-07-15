import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  backfillBookingCalendarIndexForFamily,
  buildBookingCalendarIndexRow,
  compareBookingListWithIndex,
  isBookingCalendarIndexDualReadEnabled,
  isBookingCalendarIndexEnabled,
  isBookingCalendarIndexReadEnabled,
} from "@/lib/booking-calendar-index";

type QueryState = {
  eq: Record<string, unknown>;
  in: Record<string, unknown[]>;
  gte: Record<string, unknown>;
  lte: Record<string, unknown>;
  orderBy: string | null;
  ascending: boolean;
  limitBy: number | null;
  rangeStart: number | null;
  rangeEnd: number | null;
};

function firstString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function matchesRow(row: Record<string, unknown>, state: QueryState): boolean {
  for (const [key, value] of Object.entries(state.eq)) {
    if (row[key] !== value) return false;
  }
  for (const [key, values] of Object.entries(state.in)) {
    if (!values.includes(row[key] as never)) return false;
  }
  for (const [key, value] of Object.entries(state.gte)) {
    if (String(row[key] ?? "") < String(value ?? "")) return false;
  }
  for (const [key, value] of Object.entries(state.lte)) {
    if (String(row[key] ?? "") > String(value ?? "")) return false;
  }
  return true;
}

function createFakeSupabase(seed?: Partial<Record<string, Record<string, unknown>[]>>) {
  const tables: Record<string, Record<string, unknown>[]> = {
    bookings_v2: [],
    reservations_v2: [],
    stay_units_v2: [],
    families: [],
    hosts: [],
    payments_v2: [],
    channel_booking_revisions: [],
    inventory_event_log: [],
    booking_calendar_index: [],
    ...seed,
  };
  const upserts: Array<{ table: string; value: Record<string, unknown> }> = [];

  function buildQuery(table: string) {
    const state: QueryState = {
      eq: {},
      in: {},
      gte: {},
      lte: {},
      orderBy: null,
      ascending: true,
      limitBy: null,
      rangeStart: null,
      rangeEnd: null,
    };

    const resolveRows = () => {
      let rows = [...(tables[table] ?? [])].filter((row) => matchesRow(row, state));
      if (state.orderBy) {
        rows.sort((a, b) => {
          const left = String(a[state.orderBy!] ?? "");
          const right = String(b[state.orderBy!] ?? "");
          return state.ascending ? left.localeCompare(right) : right.localeCompare(left);
        });
      }
      if (state.rangeStart != null && state.rangeEnd != null) {
        rows = rows.slice(state.rangeStart, state.rangeEnd + 1);
      }
      if (state.limitBy != null) {
        rows = rows.slice(0, state.limitBy);
      }
      return rows;
    };

    const query = {
      then(resolve: (value: { data: Record<string, unknown>[]; error: null }) => unknown) {
        return Promise.resolve(resolve({ data: resolveRows(), error: null }));
      },
      eq(key: string, value: unknown) {
        state.eq[key] = value;
        return query;
      },
      in(key: string, values: unknown[]) {
        state.in[key] = values;
        return query;
      },
      gte(key: string, value: unknown) {
        state.gte[key] = value;
        return query;
      },
      lte(key: string, value: unknown) {
        state.lte[key] = value;
        return query;
      },
      order(key: string, options?: { ascending?: boolean }) {
        state.orderBy = key;
        state.ascending = options?.ascending ?? true;
        return query;
      },
      limit(value: number) {
        state.limitBy = value;
        return query;
      },
      range(start: number, end: number) {
        state.rangeStart = start;
        state.rangeEnd = end;
        return query;
      },
      async maybeSingle() {
        const rows = resolveRows();
        return { data: rows[0] ?? null, error: null };
      },
      async single() {
        const rows = resolveRows();
        return { data: rows[0] ?? null, error: null };
      },
    };

    return query;
  }

  return {
    tables,
    upserts,
    from(table: string) {
      return {
        select() {
          return buildQuery(table);
        },
        upsert(value: Record<string, unknown>) {
          upserts.push({ table, value });
          const bookingId = firstString(value.booking_id);
          if (bookingId) {
            const rows = tables[table] ?? [];
            const index = rows.findIndex((row) => row.booking_id === bookingId);
            if (index >= 0) rows[index] = { ...rows[index], ...value };
            else rows.push({ ...value });
            tables[table] = rows;
          }
          return Promise.resolve({ error: null });
        },
        delete() {
          return {
            eq(key: string, value: unknown) {
              tables[table] = (tables[table] ?? []).filter((row) => row[key] !== value);
              return Promise.resolve({ error: null });
            },
          };
        },
      };
    },
  };
}

const repoRoot = path.resolve(import.meta.dirname, "..");
const sourceFiles = {
  manualPms: readFileSync(path.join(repoRoot, "lib/manual-pms-bookings.ts"), "utf8"),
  directBooking: readFileSync(path.join(repoRoot, "lib/booking-compat.ts"), "utf8"),
  finalization: readFileSync(path.join(repoRoot, "lib/payment-booking-finalization.ts"), "utf8"),
  modify: readFileSync(path.join(repoRoot, "lib/reservation-modifications.ts"), "utf8"),
  reassign: readFileSync(path.join(repoRoot, "lib/reservation-reassignment.ts"), "utf8"),
  cancel: readFileSync(path.join(repoRoot, "app/api/bookings/cancel/route.ts"), "utf8"),
  importPreview: readFileSync(path.join(repoRoot, "app/api/host/pro/channel/channex/bookings/import-preview/route.ts"), "utf8"),
  applyModification: readFileSync(path.join(repoRoot, "app/api/host/pro/channel/channex/bookings/apply-modification/route.ts"), "utf8"),
  applyCancellation: readFileSync(path.join(repoRoot, "app/api/host/pro/channel/channex/bookings/apply-cancellation/route.ts"), "utf8"),
};

test("booking calendar index feature flags default false when env is unset", () => {
  const previous = {
    enabled: process.env.BOOKING_CALENDAR_INDEX_ENABLED,
    read: process.env.BOOKING_CALENDAR_INDEX_READ_ENABLED,
    dual: process.env.BOOKING_CALENDAR_INDEX_DUAL_READ_ENABLED,
  };
  delete process.env.BOOKING_CALENDAR_INDEX_ENABLED;
  delete process.env.BOOKING_CALENDAR_INDEX_READ_ENABLED;
  delete process.env.BOOKING_CALENDAR_INDEX_DUAL_READ_ENABLED;

  assert.equal(isBookingCalendarIndexEnabled(), false);
  assert.equal(isBookingCalendarIndexReadEnabled(), false);
  assert.equal(isBookingCalendarIndexDualReadEnabled(), false);

  process.env.BOOKING_CALENDAR_INDEX_ENABLED = previous.enabled;
  process.env.BOOKING_CALENDAR_INDEX_READ_ENABLED = previous.read;
  process.env.BOOKING_CALENDAR_INDEX_DUAL_READ_ENABLED = previous.dual;
});

test("buildBookingCalendarIndexRow projects canonical booking data into a masked row", async () => {
  const supabase = createFakeSupabase({
    bookings_v2: [
      {
        id: "booking-1",
        status: "confirmed",
        payment_status: "paid",
        source_channel: "booking_com",
        stay_unit_id: "room-1",
        host_id: "host-1",
        user_id: "user-1",
        start_date: "2026-06-01",
        end_date: "2026-06-04",
        total_price: 12000,
        payment_id: "payment-1",
        pricing_snapshot: {
          guest_name: "Aarav Singh",
          guest_email: "aarav@example.com",
          guest_phone: "+91 9876543210",
          channel_external_booking_id: "chnx-booking-9",
          channel_external_revision_id: "chnx-rev-9",
        },
        hosts: { legacy_family_id: "family-1" },
        users: { name: "Aarav Singh", email: "aarav@example.com", phone: "+91 9876543210" },
      },
    ],
    reservations_v2: [{ id: "reservation-1", booking_id: "booking-1", family_id: "family-1", stay_unit_id: "room-1" }],
    stay_units_v2: [{ id: "room-1", name: "Sukoon", unit_key: "sukoon", legacy_family_id: "family-1" }],
    families: [{ id: "family-1", property_name: "SAM's Home", name: "SAM's Home" }],
    payments_v2: [{ booking_id: "booking-1", amount_total: 12000, status: "paid", paid_at: "2026-05-30T12:00:00Z", updated_at: "2026-05-30T12:00:00Z", created_at: "2026-05-30T12:00:00Z" }],
    channel_booking_revisions: [{ linked_booking_id: "booking-1", external_booking_id: "chnx-booking-9", external_revision_id: "chnx-rev-9", ota_name: "Booking.com", updated_at: "2026-05-30T11:00:00Z" }],
    inventory_event_log: [{ source_reference: "booking-1", created_at: "2026-05-30T12:05:00Z" }],
  });

  const row = await buildBookingCalendarIndexRow(supabase as never, "booking-1");

  assert.equal(row?.family_id, "family-1");
  assert.equal(row?.stay_nights, 3);
  assert.equal(row?.ota_name, "Booking.com");
  assert.equal(row?.guest_display_name, "Aarav Singh");
  assert.equal(row?.guest_email_masked, "aa***@example.com");
  assert.equal(row?.guest_phone_masked, "******3210");
  assert.equal(row?.calendar_chip_color_key, "ota_booking");
  assert.equal(row?.amount_due, 0);
});

test("backfillBookingCalendarIndexForFamily upserts canonical bookings for a family", async () => {
  const supabase = createFakeSupabase({
    hosts: [{ id: "host-1", legacy_family_id: "family-1" }],
    bookings_v2: [
      {
        id: "booking-1",
        status: "confirmed",
        payment_status: "paid",
        source_channel: "famlo_direct",
        stay_unit_id: "room-1",
        host_id: "host-1",
        user_id: "user-1",
        start_date: "2026-06-01",
        end_date: "2026-06-03",
        total_price: 9000,
        pricing_snapshot: { guest_name: "Guest One" },
        hosts: { legacy_family_id: "family-1" },
        users: { name: "Guest One" },
      },
    ],
    reservations_v2: [{ id: "reservation-1", booking_id: "booking-1", family_id: "family-1", stay_unit_id: "room-1" }],
    stay_units_v2: [{ id: "room-1", name: "Sukoon", legacy_family_id: "family-1" }],
    families: [{ id: "family-1", property_name: "Property One" }],
  });

  const result = await backfillBookingCalendarIndexForFamily(supabase as never, "family-1");

  assert.equal(result.processed, 1);
  assert.equal(result.upserted, 1);
  assert.equal(supabase.upserts.length, 1);
  assert.equal(supabase.tables.booking_calendar_index[0]?.booking_id, "booking-1");
});

test("compareBookingListWithIndex detects mismatches between canonical output and stored index rows", async () => {
  const supabase = createFakeSupabase({
    hosts: [{ id: "host-1", legacy_family_id: "family-1" }],
    bookings_v2: [
      {
        id: "booking-1",
        status: "confirmed",
        payment_status: "paid",
        source_channel: "famlo_direct",
        stay_unit_id: "room-1",
        host_id: "host-1",
        user_id: "user-1",
        start_date: "2026-06-01",
        end_date: "2026-06-03",
        total_price: 9000,
        pricing_snapshot: { guest_name: "Guest One" },
        hosts: { legacy_family_id: "family-1" },
        users: { name: "Guest One" },
      },
    ],
    reservations_v2: [{ id: "reservation-1", booking_id: "booking-1", family_id: "family-1", stay_unit_id: "room-1" }],
    stay_units_v2: [{ id: "room-1", name: "Sukoon", legacy_family_id: "family-1" }],
    families: [{ id: "family-1", property_name: "Property One" }],
    booking_calendar_index: [
      {
        booking_id: "booking-1",
        family_id: "family-1",
        stay_unit_id: "room-1",
        checkin_date: "2026-06-01",
        checkout_date: "2026-06-03",
        stay_nights: 2,
        booking_status: "confirmed",
        payment_status: "pending",
        source_channel: "famlo_direct",
        ota_name: null,
        guest_display_name: "Guest One",
        room_display_name: "Sukoon",
        property_display_name: "Property One",
        calendar_chip_label: "Guest One",
        calendar_chip_color_key: "famlo_booking",
        total_amount: 9000,
        amount_paid: 0,
        amount_due: 9000,
      },
    ],
  });

  const comparison = await compareBookingListWithIndex(supabase as never, { familyId: "family-1" });

  assert.equal(comparison.canonicalCount, 1);
  assert.equal(comparison.indexCount, 1);
  assert.equal(comparison.mismatches.length, 1);
  assert.equal(comparison.mismatches[0]?.kind, "field_mismatch");
  assert.ok(comparison.mismatches[0]?.fields?.includes("payment_status"));
});

test("canonical booking write paths all call the additive booking calendar index sync hook", () => {
  assert.match(sourceFiles.manualPms, /syncBookingCalendarIndexBestEffort/);
  assert.match(sourceFiles.directBooking, /syncBookingCalendarIndexBestEffort/);
  assert.match(sourceFiles.finalization, /syncBookingCalendarIndexBestEffort/);
  assert.match(sourceFiles.modify, /syncBookingCalendarIndexBestEffort/);
  assert.match(sourceFiles.reassign, /syncBookingCalendarIndexBestEffort/);
  assert.match(sourceFiles.cancel, /syncBookingCalendarIndexBestEffort/);
  assert.match(sourceFiles.importPreview, /syncBookingCalendarIndexBestEffort/);
  assert.match(sourceFiles.applyModification, /syncBookingCalendarIndexBestEffort/);
  assert.match(sourceFiles.applyCancellation, /syncBookingCalendarIndexBestEffort/);
});
