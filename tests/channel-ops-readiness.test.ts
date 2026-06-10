import assert from "node:assert/strict";
import test from "node:test";

import { buildChannelOpsReadiness } from "@/lib/channel-ops-readiness";

const NOW = new Date("2026-06-07T12:00:00.000Z");

test("channel ops readiness reports healthy when queues and revisions are clean", () => {
  const readiness = buildChannelOpsReadiness(
    {
      jobs: [
        {
          id: "job-1",
          family_id: "family-1",
          status: "succeeded",
          result: { queue_wait_ms: 20_000 },
          created_at: "2026-06-07T11:55:00.000Z",
          updated_at: "2026-06-07T11:56:00.000Z",
        },
      ],
      revisions: [
        {
          id: "rev-1",
          family_id: "family-1",
          import_status: "imported",
          ack_status: "acknowledged",
          created_at: "2026-06-07T11:50:00.000Z",
        },
      ],
      logs: [
        {
          id: "metric-1",
          family_id: "family-1",
          action: "dashboard_load_metric",
          status: "success",
          payload: { serverRenderMs: 500, clientHydratedMs: 1_100 },
          created_at: "2026-06-07T11:58:00.000Z",
        },
      ],
      properties: [
        {
          id: "property-1",
          family_id: "family-1",
          provider_code: "channex",
          external_property_id: "channex-property-1",
          sync_status: "connected",
          last_synced_at: "2026-06-07T11:30:00.000Z",
        },
      ],
    },
    { familyId: "family-1", now: NOW }
  );

  assert.equal(readiness.severity, "healthy");
  assert.equal(readiness.readinessPercent, 100);
  assert.equal(readiness.alerts.length, 0);
  assert.equal(readiness.metrics.queueWaitP95Ms, 20_000);
});

test("channel ops readiness raises critical alerts for dead letters, stuck jobs, and unacked applied revisions", () => {
  const readiness = buildChannelOpsReadiness(
    {
      jobs: [
        {
          id: "job-dead",
          family_id: "family-1",
          provider_code: "channex",
          job_type: "availability_update",
          status: "dead_lettered",
          last_error: "Channex rejected payload",
          result: { queue_wait_ms: 420_000 },
          created_at: "2026-06-07T11:00:00.000Z",
          updated_at: "2026-06-07T11:10:00.000Z",
        },
        {
          id: "job-stuck",
          family_id: "family-1",
          provider_code: "channex",
          job_type: "rate_update",
          status: "running",
          created_at: "2026-06-07T11:00:00.000Z",
          updated_at: "2026-06-07T11:20:00.000Z",
        },
      ],
      revisions: [
        {
          id: "rev-unacked",
          family_id: "family-1",
          provider_code: "channex",
          import_status: "imported",
          ack_status: "not_acknowledged",
          created_at: "2026-06-07T11:40:00.000Z",
        },
      ],
      logs: [
        {
          id: "webhook-failure",
          family_id: "family-1",
          action: "channex_booking_webhook",
          status: "failed",
          created_at: "2026-06-07T11:58:00.000Z",
        },
        {
          id: "sync-failure",
          family_id: "family-1",
          action: "ari_sync",
          status: "failed",
          created_at: "2026-06-07T11:58:00.000Z",
        },
      ],
      properties: [],
    },
    { familyId: "family-1", now: NOW }
  );

  assert.equal(readiness.severity, "critical");
  assert.ok(readiness.readinessPercent < 80);
  assert.ok(readiness.alerts.some((alert) => alert.metric === "dead_lettered_jobs"));
  assert.ok(readiness.alerts.some((alert) => alert.metric === "stale_running_jobs"));
  assert.ok(readiness.alerts.some((alert) => alert.metric === "unacked_applied_revisions"));
  assert.ok(readiness.alerts.some((alert) => alert.metric === "queue_wait_p95_ms"));
  assert.equal(readiness.recentDeadLetters[0]?.id, "job-dead");
});

test("channel ops readiness warns when dashboard p95 or connected property sync age is slow", () => {
  const readiness = buildChannelOpsReadiness(
    {
      jobs: [],
      revisions: [],
      logs: [
        {
          id: "metric-1",
          family_id: "family-1",
          action: "dashboard_load_metric",
          status: "success",
          payload: { serverRenderMs: 1_800, clientHydratedMs: 3_200 },
          created_at: "2026-06-07T11:58:00.000Z",
        },
      ],
      properties: [
        {
          id: "property-1",
          family_id: "family-1",
          provider_code: "channex",
          external_property_id: "channex-property-1",
          sync_status: "connected",
          last_synced_at: "2026-06-07T08:00:00.000Z",
        },
      ],
    },
    { familyId: "family-1", now: NOW }
  );

  assert.equal(readiness.severity, "warning");
  assert.ok(readiness.alerts.some((alert) => alert.metric === "dashboard_client_p95_ms"));
  assert.ok(readiness.alerts.some((alert) => alert.metric === "dashboard_server_p95_ms"));
  assert.ok(readiness.alerts.some((alert) => alert.metric === "stale_properties"));
});
