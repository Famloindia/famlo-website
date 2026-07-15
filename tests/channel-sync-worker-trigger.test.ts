import assert from "node:assert/strict";
import test from "node:test";

import { triggerQueuedChannexSyncWorker } from "../lib/channex-ari-jobs";

test("room provisioning can run a bounded second worker pass for its queued ARI child", async () => {
  const originalFetch = globalThis.fetch;
  const originalSecret = process.env.CRON_SECRET;
  const requests: string[] = [];

  process.env.CRON_SECRET = "test-cron-secret";
  globalThis.fetch = (async (url: string | URL | Request) => {
    requests.push(String(url));
    return { ok: true } as Response;
  }) as typeof fetch;

  try {
    const triggered = await triggerQueuedChannexSyncWorker({
      requestUrl: "http://localhost:3000/api/host/stay-units",
      workerId: "room-provisioning-test",
      limit: 5,
      passes: 2,
    });

    assert.equal(triggered, true);
    assert.equal(requests.length, 2);
    assert.ok(requests.every((url) => url.includes("limit=5")));
    assert.ok(requests.every((url) => url.includes("workerId=room-provisioning-test")));
  } finally {
    globalThis.fetch = originalFetch;
    if (originalSecret == null) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = originalSecret;
  }
});
