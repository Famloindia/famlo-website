import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  applyBasisPoints,
  calculateFlexibleCancellationPolicy,
  calculateRetainedValueAccounting,
} from "../lib/cancellations/policy";
import {
  cancellationBlocksSettlement,
  canAdminApproveRefund,
  canServiceExecutivePerform,
  canWithdrawCancellation,
  getHostSlaStage,
} from "../lib/cancellations/state";

const now = new Date("2026-08-01T00:00:00.000Z");
const policy = (reason: Parameters<typeof calculateFlexibleCancellationPolicy>[0]["reason"], bookingStatus = "confirmed", checkInDate = "2026-08-05") =>
  calculateFlexibleCancellationPolicy({ grossPaidAmountMinor: 1_000_00, bookingStatus, reason, checkInDate, now });

test("guest cancellation before host approval suggests 100%", () => assert.equal(policy("guest_other", "pending_host_approval").refundPercent, 100));
test("host decline suggests 100%", () => assert.equal(policy("host_declined").refundPercent, 100));
test("host unresponsive suggests 100%", () => assert.equal(policy("host_unresponsive").refundPercent, 100));
test("host cancellation suggests 100%", () => assert.equal(policy("host_cancelled").refundPercent, 100));
test("property unable suggests 100%", () => assert.equal(policy("property_unable_to_honour").refundPercent, 100));
test("guest cancellation over 48h suggests 100%", () => assert.equal(policy("guest_other", "confirmed", "2026-08-05").refundPercent, 100));
test("guest cancellation 24-48h suggests 50%", () => assert.equal(policy("guest_other", "confirmed", "2026-08-03").refundPercent, 50));
test("guest cancellation under 24h suggests 0%", () => assert.equal(policy("guest_other", "confirmed", "2026-08-01").refundPercent, 0));
test("50% uses exact minor units", () => assert.equal(applyBasisPoints(10_001, 5_000), 5_001));
test("minor unit input rejects decimals", () => assert.throws(() => applyBasisPoints(10.5, 5_000)));
test("16/84 retained value accounting", () => assert.deepEqual(calculateRetainedValueAccounting(1_000_000, 500_000), { retainedBookingValueMinor: 500_000, famloCommissionMinor: 80_000, hostGrossShareMinor: 420_000 }));
test("full refund leaves zero commission and host share", () => assert.deepEqual(calculateRetainedValueAccounting(1_000_000, 1_000_000), { retainedBookingValueMinor: 0, famloCommissionMinor: 0, hostGrossShareMinor: 0 }));
test("over-refund accounting is rejected", () => assert.throws(() => calculateRetainedValueAccounting(100, 101)));
test("request is withdrawable", () => assert.equal(canWithdrawCancellation("requested"), true));
test("under review is withdrawable", () => assert.equal(canWithdrawCancellation("under_review"), true));
test("approved request is not withdrawable", () => assert.equal(canWithdrawCancellation("approved"), false));
test("refund processing is not withdrawable", () => assert.equal(canWithdrawCancellation("refund_processing"), false));
test("active request blocks settlement", () => assert.equal(cancellationBlocksSettlement("requested"), true));
test("recommended request blocks settlement", () => assert.equal(cancellationBlocksSettlement("recommended_approve"), true));
test("rejected request releases settlement", () => assert.equal(cancellationBlocksSettlement("rejected"), false));
test("withdrawn request releases settlement", () => assert.equal(cancellationBlocksSettlement("withdrawn"), false));
test("service executive can assign", () => assert.equal(canServiceExecutivePerform("assign"), true));
test("service executive can recommend", () => assert.equal(canServiceExecutivePerform("recommend_approve"), true));
test("service executive cannot approve", () => assert.equal(canServiceExecutivePerform("approve"), false));
test("service executive cannot override amount", () => assert.equal(canServiceExecutivePerform("override_refund"), false));
test("admin can approve suggested amount", () => assert.equal(canAdminApproveRefund({ status: "recommended_approve", approvedMinor: 100, remainingMinor: 100, suggestedMinor: 100 }), true));
test("admin override requires a reason", () => assert.equal(canAdminApproveRefund({ status: "recommended_approve", approvedMinor: 50, remainingMinor: 100, suggestedMinor: 100 }), false));
test("admin override with reason is accepted", () => assert.equal(canAdminApproveRefund({ status: "recommended_approve", approvedMinor: 50, remainingMinor: 100, suggestedMinor: 100, overrideReason: "Documented exception" }), true));
test("admin over-refund is rejected", () => assert.equal(canAdminApproveRefund({ status: "recommended_approve", approvedMinor: 101, remainingMinor: 100, suggestedMinor: 100, overrideReason: "No" }), false));
test("admin double approval is rejected by state", () => assert.equal(canAdminApproveRefund({ status: "refund_processing", approvedMinor: 100, remainingMinor: 100, suggestedMinor: 100 }), false));
test("host SLA starts pending", () => assert.equal(getHostSlaStage(0), "pending"));
test("host 6h reminder is due", () => assert.equal(getHostSlaStage(6), "reminder_due"));
test("host 10h warning is due", () => assert.equal(getHostSlaStage(10), "internal_warning"));
test("host 12h is overdue", () => assert.equal(getHostSlaStage(12), "overdue"));
test("host SLA stage does not model auto cancellation", () => assert.notEqual(getHostSlaStage(24), "cancelled"));

const cancelRoute = readFileSync(new URL("../app/api/bookings/cancel/route.ts", import.meta.url), "utf8");
const hostDecision = readFileSync(new URL("../lib/host-booking-decision.ts", import.meta.url), "utf8");
const adminRoute = readFileSync(new URL("../app/api/admin/finance/cancellations/route.ts", import.meta.url), "utf8");
const webhook = readFileSync(new URL("../app/api/payments/cashfree/webhook/route.ts", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/migrations/20260731230000_cancellation_requests_cashfree_refunds.sql", import.meta.url), "utf8");
const financeSettingsGrantMigration = readFileSync(new URL("../supabase/migrations/20260731233000_finance_settings_service_role_read.sql", import.meta.url), "utf8");
const refundAdminGrantMigration = readFileSync(new URL("../supabase/migrations/20260731233500_refund_admin_service_role_reads.sql", import.meta.url), "utf8");
const refundCompatibilityMigration = readFileSync(new URL("../supabase/migrations/20260731234000_refunds_v2_created_at_compat.sql", import.meta.url), "utf8");

test("guest route uses request RPC", () => assert.match(cancelRoute, /requestGuestCancellation/));
test("guest route does not set booking cancelled", () => assert.doesNotMatch(cancelRoute, /status:\s*[\"']cancelled/));
test("host decline creates a cancellation case", () => assert.match(hostDecision, /requestHostDeclineCancellation/));
test("admin identity comes from server session", () => assert.match(adminRoute, /resolveAdminAccessContext/));
test("admin approval uses transactional RPC", () => assert.match(adminRoute, /decide_booking_cancellation_v1/));
test("signed webhook completes cancellation", () => assert.match(webhook, /cancellation_requests_v2/));
test("migration prevents duplicate active cases", () => assert.match(migration, /cancellation_requests_one_active_per_booking_uidx/));
test("migration prevents duplicate refund idempotency keys", () => assert.match(migration, /refund_requests_idempotency_uidx/));
test("migration revokes guest financial table access", () => assert.match(migration, /revoke all on table public\.cancellation_requests_v2 from anon, authenticated/));
test("migration schedules 12-hour SLA processor", () => assert.match(migration, /famlo-host-approval-sla/));
test("finance settings remain private and readable by the admin service role", () => {
  assert.match(financeSettingsGrantMigration, /revoke all on table public\.finance_settings from anon, authenticated/i);
  assert.match(financeSettingsGrantMigration, /grant select on table public\.finance_settings to service_role/i);
});
test("refund admin dependencies remain private and readable by the service role", () => {
  assert.match(refundAdminGrantMigration, /revoke all on table public\.credit_notes from anon, authenticated/i);
  assert.match(refundAdminGrantMigration, /revoke all on table public\.payouts_v2 from anon, authenticated/i);
  assert.match(refundAdminGrantMigration, /grant select on table public\.credit_notes to service_role/i);
  assert.match(refundAdminGrantMigration, /grant select on table public\.payouts_v2 to service_role/i);
});
test("refund history exposes a provider-neutral created timestamp without rewriting history", () => {
  assert.match(refundCompatibilityMigration, /add column if not exists created_at timestamptz/i);
  assert.match(refundCompatibilityMigration, /coalesce\(created_at, initiated_at\)/i);
  assert.match(refundCompatibilityMigration, /grant select on table[\s\S]*public\.refunds_v2[\s\S]*to service_role/i);
  assert.doesNotMatch(refundCompatibilityMigration, /drop\s+(table|column)/i);
});
