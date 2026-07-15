import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAdminFamloProAccessView,
  PRO_ADMIN_ACCESS_MINIMUM_SUBTOTAL,
  PRO_ADMIN_ACCESS_PROPERTY_PRICE,
  PRO_ADMIN_ACCESS_ROOM_PRICE,
} from "@/lib/pro-billing/admin-access";

test("one host with one Pro subscription and three properties renders one admin access record", () => {
  const result = buildAdminFamloProAccessView({
    subscriptions: [
      {
        id: "sub-1",
        family_id: "fam-1",
        host_user_id: "host-1",
        primary_pro_property_id: "fam-1",
        status: "active",
        current_period_end: "2026-06-30T00:00:00.000Z",
        grace_until: "2026-07-04T00:00:00.000Z",
        created_at: "2026-05-01T00:00:00.000Z",
      },
      {
        id: "sub-2",
        family_id: "fam-2",
        host_user_id: "host-1",
        primary_pro_property_id: "fam-1",
        status: "active",
        current_period_end: "2026-06-30T00:00:00.000Z",
        grace_until: "2026-07-04T00:00:00.000Z",
        created_at: "2026-05-10T00:00:00.000Z",
      },
    ],
    families: [
      { id: "fam-1", property_name: "Alpha", name: "Alpha", host_id: "H-001", city: "Goa", state: "Goa", user_id: "host-1", is_active: true, created_at: "2026-01-01T00:00:00.000Z" },
      { id: "fam-2", property_name: "Beta", name: "Beta", host_id: "H-002", city: "Jaipur", state: "Rajasthan", user_id: "host-1", is_active: true, created_at: "2026-02-01T00:00:00.000Z" },
      { id: "fam-3", property_name: "Gamma", name: "Gamma", host_id: "H-003", city: "Mysuru", state: "Karnataka", user_id: "host-1", is_active: true, created_at: "2026-03-01T00:00:00.000Z" },
    ],
    stayUnits: [
      { id: "room-1", legacy_family_id: "fam-1", is_active: true },
      { id: "room-2", legacy_family_id: "fam-1", is_active: true },
      { id: "room-3", legacy_family_id: "fam-2", is_active: true },
      { id: "room-4", legacy_family_id: "fam-3", is_active: true },
    ],
    hosts: [{ user_id: "host-1", display_name: "Host One" }],
    users: [{ id: "host-1", name: "Host One User" }],
    orders: [],
    invoices: [],
  });

  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0]?.hostUserId, "host-1");
  assert.equal(result.rows[0]?.proProperties, 3);
  assert.equal(result.rows[0]?.roomsCounted, 4);
});

test("primary Pro property remains the original property", () => {
  const result = buildAdminFamloProAccessView({
    subscriptions: [
      {
        id: "sub-1",
        family_id: "fam-1",
        host_user_id: "host-1",
        primary_pro_property_id: "fam-1",
        status: "active",
        current_period_end: "2026-06-30T00:00:00.000Z",
        grace_until: "2026-07-04T00:00:00.000Z",
        created_at: "2026-05-01T00:00:00.000Z",
      },
      {
        id: "sub-2",
        family_id: "fam-2",
        host_user_id: "host-1",
        primary_pro_property_id: "fam-1",
        status: "active",
        current_period_end: "2026-06-30T00:00:00.000Z",
        grace_until: "2026-07-04T00:00:00.000Z",
        created_at: "2026-05-15T00:00:00.000Z",
      },
    ],
    families: [
      { id: "fam-1", property_name: "Original Stay", name: "Original", host_id: "H-001", city: "Goa", state: "Goa", user_id: "host-1", is_active: true, created_at: "2026-01-01T00:00:00.000Z" },
      { id: "fam-2", property_name: "New Stay", name: "New", host_id: "H-002", city: "Pune", state: "Maharashtra", user_id: "host-1", is_active: true, created_at: "2026-04-01T00:00:00.000Z" },
    ],
    stayUnits: [],
    hosts: [{ user_id: "host-1", display_name: "Host One" }],
    users: [],
    orders: [],
    invoices: [],
  });

  assert.equal(result.rows[0]?.primaryProPropertyId, "fam-1");
  assert.equal(result.rows[0]?.primaryProPropertyName, "Original Stay");
});

test("billing counts all active properties and rooms while excluding inactive properties", () => {
  const result = buildAdminFamloProAccessView({
    subscriptions: [
      {
        id: "sub-1",
        family_id: "fam-1",
        host_user_id: "host-1",
        primary_pro_property_id: "fam-1",
        status: "active",
        current_period_end: "2026-06-30T00:00:00.000Z",
        grace_until: "2026-07-04T00:00:00.000Z",
        created_at: "2026-05-01T00:00:00.000Z",
      },
    ],
    families: [
      { id: "fam-1", property_name: "Alpha", user_id: "host-1", is_active: true, created_at: "2026-01-01T00:00:00.000Z" },
      { id: "fam-2", property_name: "Beta", user_id: "host-1", is_active: true, created_at: "2026-02-01T00:00:00.000Z" },
      { id: "fam-3", property_name: "Hidden", user_id: "host-1", is_active: false, created_at: "2026-03-01T00:00:00.000Z" },
    ],
    stayUnits: [
      { id: "room-1", legacy_family_id: "fam-1", is_active: true },
      { id: "room-2", legacy_family_id: "fam-1", is_active: true },
      { id: "room-3", legacy_family_id: "fam-2", is_active: true },
      { id: "room-4", legacy_family_id: "fam-3", is_active: true },
      { id: "room-5", legacy_family_id: "fam-2", is_active: false },
    ],
    hosts: [{ user_id: "host-1", display_name: "Host One" }],
    users: [],
    orders: [],
    invoices: [],
  });

  const row = result.rows[0]!;
  assert.equal(row.proProperties, 2);
  assert.equal(row.roomsCounted, 3);
  assert.equal(
    row.currentMonthlyCharge,
    Math.max(
      2 * PRO_ADMIN_ACCESS_PROPERTY_PRICE + 3 * PRO_ADMIN_ACCESS_ROOM_PRICE,
      PRO_ADMIN_ACCESS_MINIMUM_SUBTOTAL
    )
  );
});

test("two different hosts still render two separate records", () => {
  const result = buildAdminFamloProAccessView({
    subscriptions: [
      {
        id: "sub-1",
        family_id: "fam-1",
        host_user_id: "host-1",
        primary_pro_property_id: "fam-1",
        status: "active",
        current_period_end: "2026-06-30T00:00:00.000Z",
        grace_until: "2026-07-04T00:00:00.000Z",
        created_at: "2026-05-01T00:00:00.000Z",
      },
      {
        id: "sub-2",
        family_id: "fam-4",
        host_user_id: "host-2",
        primary_pro_property_id: "fam-4",
        status: "grace",
        current_period_end: "2026-05-31T00:00:00.000Z",
        grace_until: "2026-06-04T00:00:00.000Z",
        created_at: "2026-05-03T00:00:00.000Z",
      },
    ],
    families: [
      { id: "fam-1", property_name: "Alpha", user_id: "host-1", is_active: true, created_at: "2026-01-01T00:00:00.000Z" },
      { id: "fam-2", property_name: "Beta", user_id: "host-1", is_active: true, created_at: "2026-02-01T00:00:00.000Z" },
      { id: "fam-4", property_name: "Delta", user_id: "host-2", is_active: true, created_at: "2026-01-15T00:00:00.000Z" },
    ],
    stayUnits: [
      { id: "room-1", legacy_family_id: "fam-1", is_active: true },
      { id: "room-2", legacy_family_id: "fam-2", is_active: true },
      { id: "room-3", legacy_family_id: "fam-4", is_active: true },
    ],
    hosts: [
      { user_id: "host-1", display_name: "Host One" },
      { user_id: "host-2", display_name: "Host Two" },
    ],
    users: [],
    orders: [],
    invoices: [],
  });

  assert.equal(result.rows.length, 2);
  assert.deepEqual(
    result.rows.map((row) => row.hostUserId).sort(),
    ["host-1", "host-2"]
  );
});

test("minimum monthly charge still applies for very small host inventory", () => {
  const result = buildAdminFamloProAccessView({
    subscriptions: [
      {
        id: "sub-1",
        family_id: "fam-1",
        host_user_id: "host-1",
        primary_pro_property_id: "fam-1",
        status: "active",
        current_period_end: "2026-06-30T00:00:00.000Z",
        grace_until: "2026-07-04T00:00:00.000Z",
        created_at: "2026-05-01T00:00:00.000Z",
      },
    ],
    families: [{ id: "fam-1", property_name: "Solo", user_id: "host-1", is_active: true, created_at: "2026-01-01T00:00:00.000Z" }],
    stayUnits: [{ id: "room-1", legacy_family_id: "fam-1", is_active: true }],
    hosts: [{ user_id: "host-1", display_name: "Host One" }],
    users: [],
    orders: [],
    invoices: [],
  });

  assert.equal(result.rows[0]?.currentMonthlyCharge, PRO_ADMIN_ACCESS_MINIMUM_SUBTOTAL);
  assert.equal(PRO_ADMIN_ACCESS_PROPERTY_PRICE + PRO_ADMIN_ACCESS_ROOM_PRICE, 299);
});

test("admin summary separates active, grace, paused, failed, Pro revenue, and Pro GST", () => {
  const result = buildAdminFamloProAccessView({
    subscriptions: [
      {
        id: "sub-active",
        family_id: "fam-1",
        host_user_id: "host-1",
        primary_pro_property_id: "fam-1",
        status: "active",
        current_period_end: "2026-06-30T00:00:00.000Z",
        grace_until: "2026-07-07T00:00:00.000Z",
        last_payment_at: "2026-05-31T00:00:00.000Z",
        created_at: "2026-05-01T00:00:00.000Z",
      },
      {
        id: "sub-grace",
        family_id: "fam-2",
        host_user_id: "host-2",
        primary_pro_property_id: "fam-2",
        status: "active",
        current_period_end: "2026-06-05T00:00:00.000Z",
        grace_until: "2026-06-12T00:00:00.000Z",
        last_payment_at: "2026-04-20T00:00:00.000Z",
        created_at: "2026-04-20T00:00:00.000Z",
      },
      {
        id: "sub-paused",
        family_id: "fam-3",
        host_user_id: "host-3",
        primary_pro_property_id: "fam-3",
        status: "grace",
        current_period_end: "2026-04-20T00:00:00.000Z",
        grace_until: "2026-04-27T00:00:00.000Z",
        last_payment_at: "2026-03-20T00:00:00.000Z",
        created_at: "2026-03-20T00:00:00.000Z",
      },
      {
        id: "sub-failed",
        family_id: "fam-4",
        host_user_id: "host-4",
        primary_pro_property_id: "fam-4",
        status: "payment_failed",
        current_period_end: "2026-05-22T00:00:00.000Z",
        grace_until: "2026-05-29T00:00:00.000Z",
        last_payment_at: "2026-04-22T00:00:00.000Z",
        metadata: { last_payment_status: "payment_failed" },
        created_at: "2026-04-22T00:00:00.000Z",
      },
    ],
    families: [
      { id: "fam-1", property_name: "Alpha", user_id: "host-1", is_active: true, created_at: "2026-01-01T00:00:00.000Z" },
      { id: "fam-2", property_name: "Beta", user_id: "host-2", is_active: true, created_at: "2026-01-01T00:00:00.000Z" },
      { id: "fam-3", property_name: "Gamma", user_id: "host-3", is_active: true, created_at: "2026-01-01T00:00:00.000Z" },
      { id: "fam-4", property_name: "Delta", user_id: "host-4", is_active: true, created_at: "2026-01-01T00:00:00.000Z" },
    ],
    stayUnits: [
      { id: "room-1", legacy_family_id: "fam-1", is_active: true },
      { id: "room-2", legacy_family_id: "fam-2", is_active: true },
      { id: "room-3", legacy_family_id: "fam-3", is_active: true },
      { id: "room-4", legacy_family_id: "fam-4", is_active: true },
    ],
    hosts: [],
    users: [],
    orders: [
      { id: "order-1", host_user_id: "host-1", status: "paid", property_count: 1, room_count: 1, subtotal_amount: 499, gst_amount: 90, total_amount: 589, payment_captured_at: "2026-05-31T00:00:00.000Z" },
      { id: "order-2", host_user_id: "host-4", status: "payment_failed", property_count: 1, room_count: 1, subtotal_amount: 499, gst_amount: 90, total_amount: 589, created_at: "2026-05-24T00:00:00.000Z" },
    ],
    invoices: [{ id: "invoice-1" }],
  });

  const active = result.rows.find((row) => row.hostUserId === "host-1");
  const grace = result.rows.find((row) => row.hostUserId === "host-2");
  const paused = result.rows.find((row) => row.hostUserId === "host-3");
  const failed = result.rows.find((row) => row.hostUserId === "host-4");

  assert.equal(active?.status, "active");
  assert.equal(grace?.status, "grace");
  assert.equal(paused?.status, "paused");
  assert.equal(failed?.status, "payment_failed");
  assert.equal(result.summary.proRevenue, 499);
  assert.equal(result.summary.proGst, 90);
  assert.equal(result.summary.failedPayments, 1);
  assert.equal(result.summary.activeSubscriptions, 1);
  assert.equal(result.summary.graceSubscriptions, 1);
  assert.equal(result.summary.pausedSubscriptions, 1);
  assert.equal(result.summary.paymentFailedSubscriptions, 1);
});
