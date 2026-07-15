import test from "node:test";
import assert from "node:assert/strict";

import { buildManualPmsBookingPayload, canCreateManualPmsBooking, createManualPmsBooking } from "@/lib/manual-pms-bookings";
import { resolveBookingInventoryImpactRange } from "@/lib/payment-booking-finalization";
import { enumerateStayNights, getStayNightDateRange } from "@/lib/platform-utils";
import { resolveModificationInventorySyncWindow } from "@/lib/reservation-modifications";
import { bookingOccupiesInventoryDate } from "@/lib/inventory";

type InsertCall = {
  table: string;
  value: Record<string, unknown>;
};

function createFakeSupabase() {
  const inserts: InsertCall[] = [];

  return {
    inserts,
    from(table: string) {
      return {
        insert(value: Record<string, unknown>) {
          inserts.push({ table, value });
          const response =
            table === "bookings_v2"
              ? {
                  data: { id: "booking-manual-1" },
                  error: null,
                }
              : {
                  data: null,
                  error: null,
                };

          return {
            then(resolve: (value: typeof response) => unknown) {
              return Promise.resolve(resolve(response));
            },
            select() {
              return {
                single: async () => response,
              };
            },
          };
        },
      };
    },
  };
}

test("enumerateStayNights returns only the booked night for a one-night stay", () => {
  assert.deepEqual(enumerateStayNights("2026-05-22", "2026-05-23"), ["2026-05-22"]);
});

test("enumerateStayNights excludes checkout for a two-night stay", () => {
  assert.deepEqual(enumerateStayNights("2026-05-22", "2026-05-24"), ["2026-05-22", "2026-05-23"]);
});

test("getStayNightDateRange returns last-night-inclusive boundaries", () => {
  assert.deepEqual(getStayNightDateRange("2026-05-22", "2026-05-24"), {
    from: "2026-05-22",
    to: "2026-05-23",
    nights: ["2026-05-22", "2026-05-23"],
  });
});

test("booking inventory occupancy excludes the checkout date", () => {
  assert.equal(
    bookingOccupiesInventoryDate({
      startDate: "2026-05-22",
      endDate: "2026-05-24",
      date: "2026-05-22",
    }),
    true
  );
  assert.equal(
    bookingOccupiesInventoryDate({
      startDate: "2026-05-22",
      endDate: "2026-05-24",
      date: "2026-05-23",
    }),
    true
  );
  assert.equal(
    bookingOccupiesInventoryDate({
      startDate: "2026-05-22",
      endDate: "2026-05-24",
      date: "2026-05-24",
    }),
    false
  );
});

test("booking inventory impact range resolves to the last stay night", () => {
  assert.deepEqual(
    resolveBookingInventoryImpactRange({
      startDate: "2026-05-22",
      endDate: "2026-05-23",
    }),
    {
      from: "2026-05-22",
      to: "2026-05-22",
      nights: ["2026-05-22"],
    }
  );

  assert.deepEqual(
    resolveBookingInventoryImpactRange({
      startDate: "2026-05-22",
      endDate: "2026-05-24",
    }),
    {
      from: "2026-05-22",
      to: "2026-05-23",
      nights: ["2026-05-22", "2026-05-23"],
    }
  );
});

test("modification sync window excludes old and new checkout dates", () => {
  assert.deepEqual(
    resolveModificationInventorySyncWindow({
      oldStartDate: "2026-05-22",
      oldEndDate: "2026-05-24",
      newStartDate: "2026-05-23",
      newEndDate: "2026-05-26",
    }),
    {
      oldStayNightRange: {
        from: "2026-05-22",
        to: "2026-05-23",
        nights: ["2026-05-22", "2026-05-23"],
      },
      newStayNightRange: {
        from: "2026-05-23",
        to: "2026-05-25",
        nights: ["2026-05-23", "2026-05-24", "2026-05-25"],
      },
      dateFrom: "2026-05-22",
      dateTo: "2026-05-25",
    }
  );
});

test("manual PMS access only allows admin/operator users on active Famlo Pro properties", () => {
  assert.deepEqual(
    canCreateManualPmsBooking({
      dashboardEnabled: false,
      isAdmin: true,
      famloProAllowed: true,
    }),
    { ok: false, reason: "Famlo Pro is disabled." }
  );
  assert.deepEqual(
    canCreateManualPmsBooking({
      dashboardEnabled: true,
      isAdmin: false,
      famloProAllowed: true,
    }),
    { ok: false, reason: "Only admin/operator users can create manual PMS bookings." }
  );
  assert.deepEqual(
    canCreateManualPmsBooking({
      dashboardEnabled: true,
      isAdmin: true,
      famloProAllowed: false,
    }),
    { ok: false, reason: "Famlo Pro is not active for this property." }
  );
  assert.deepEqual(
    canCreateManualPmsBooking({
      dashboardEnabled: true,
      isAdmin: true,
      famloProAllowed: true,
    }),
    { ok: true, reason: null }
  );
});

test("manual PMS booking payload is Famlo-origin, confirmed, and payment-free", () => {
  const payload = buildManualPmsBookingPayload({
    actorUserId: "user-1",
    familyId: "family-1",
    hostId: "host-1",
    stayUnitId: "stay-unit-1",
    guestName: "Aarav Singh",
    guestEmail: "aarav@example.com",
    guestPhone: "+91-9999999999",
    checkInDate: "2026-05-22",
    checkOutDate: "2026-05-24",
    notes: "Manual PMS booking",
  });

  assert.equal(payload.source_channel, "pms_manual");
  assert.equal(payload.status, "confirmed");
  assert.equal(payload.payment_status, "not_required");
  assert.equal((payload.pricing_snapshot as Record<string, unknown>).guest_name, "Aarav Singh");
});

test("manual PMS booking creation persists a booking, ensures a reservation, and returns queued ARI job ids", async () => {
  const fakeSupabase = createFakeSupabase();
  let ensuredReservationInput: any = null;
  let recordedTransitionInput: any = null;

  const result = await createManualPmsBooking(fakeSupabase as never, {
    actorUserId: "user-1",
    actorRole: "admin",
    familyId: "family-1",
    hostId: "host-1",
    stayUnitId: "stay-unit-1",
    guestName: "Aarav Singh",
    guestEmail: "aarav@example.com",
    guestPhone: "+91-9999999999",
    checkInDate: "2026-05-22",
    checkOutDate: "2026-05-24",
    notes: "Live testing",
  }, {
    ensureReservationForBookingFn: async (_supabase, input) => {
      ensuredReservationInput = input;
      return {
        reservationId: "reservation-1",
        familyId: "family-1",
        stayUnitId: "stay-unit-1",
      } as never;
    },
    recordBookingInventoryTransitionFn: async (_supabase, input) => {
      recordedTransitionInput = input;
      return ["job-1", "job-2"];
    },
  });

  assert.equal(result.bookingId, "booking-manual-1");
  assert.equal(result.reservationId, "reservation-1");
  assert.deepEqual(result.queuedJobIds, ["job-1", "job-2"]);
  assert.deepEqual(result.warnings, []);
  if (!ensuredReservationInput || !recordedTransitionInput) {
    throw new Error("Expected helper dependencies to be called.");
  }
  assert.equal(ensuredReservationInput.sourceKind, "manual");
  assert.equal((recordedTransitionInput.booking as Record<string, unknown>).end_date, "2026-05-24");
  assert.equal((recordedTransitionInput.payload as Record<string, unknown>).inventory_date_to, "2026-05-23");
  assert.equal(fakeSupabase.inserts[0]?.table, "bookings_v2");
  assert.equal(fakeSupabase.inserts[1]?.table, "booking_status_history_v2");
});

test("manual PMS booking creation returns a warning when no Channex job is queued", async () => {
  const fakeSupabase = createFakeSupabase();

  const result = await createManualPmsBooking(fakeSupabase as never, {
    actorUserId: "user-1",
    actorRole: "admin",
    familyId: "family-1",
    hostId: "host-1",
    stayUnitId: "stay-unit-1",
    guestName: "Aarav Singh",
    checkInDate: "2026-05-22",
    checkOutDate: "2026-05-23",
  }, {
    ensureReservationForBookingFn: async () =>
      ({
        reservationId: "reservation-1",
      }) as never,
    recordBookingInventoryTransitionFn: async () => [],
  });

  assert.deepEqual(result.queuedJobIds, []);
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0] ?? "", /no Channex availability job/i);
});
