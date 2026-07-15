import assert from "node:assert/strict";
import test from "node:test";

import { processDueChannelSyncJobs } from "@/lib/channel-provider-framework";

type Row = Record<string, unknown>;

function createWorkerSupabase(seed?: { jobs?: Row[]; failUpdateCount?: number }) {
  const state = {
    channel_sync_jobs: [...(seed?.jobs ?? [])],
  };
  let remainingUpdateFailures = seed?.failUpdateCount ?? 0;

  function applyFilters(rows: Row[], filters: Array<{ type: string; column: string; value: unknown }>) {
    return rows.filter((row) =>
      filters.every((filter) => {
        if (filter.type === "eq") return row[filter.column] === filter.value;
        if (filter.type === "in") return Array.isArray(filter.value) && (filter.value as unknown[]).includes(row[filter.column]);
        if (filter.type === "gte") {
          const left = String(row[filter.column] ?? "");
          const right = String(filter.value ?? "");
          return left >= right;
        }
        return true;
      })
    );
  }

  return {
    state,
    client: {
      async rpc(name: string) {
        assert.equal(name, "claim_channel_sync_jobs");
        return {
          data: state.channel_sync_jobs.map((row) => ({ ...row })),
          error: null,
        };
      },
      from(table: string) {
        assert.equal(table, "channel_sync_jobs");
        const filters: Array<{ type: string; column: string; value: unknown }> = [];

        const selectBuilder: any = {
          in(column: string, value: unknown[]) {
            filters.push({ type: "in", column, value });
            return this;
          },
          gte(column: string, value: unknown) {
            filters.push({ type: "gte", column, value });
            return this;
          },
          async then(resolve: (value: { count: number; error: null }) => unknown) {
            const count = applyFilters(state.channel_sync_jobs, filters).length;
            return resolve({ count, error: null });
          },
        };

        const updateBuilder = {
          eq(column: string, value: unknown) {
            filters.push({ type: "eq", column, value });
            return (async () => {
              if (remainingUpdateFailures > 0) {
                remainingUpdateFailures -= 1;
                return { error: { message: "forced update failure" } };
              }
              const rows = applyFilters(state.channel_sync_jobs, filters);
              for (const row of rows) Object.assign(row, updatePayload);
              return { error: null };
            })();
          },
        };

        let updatePayload: Row = {};

        return {
          select(_columns?: string, options?: { count?: string; head?: boolean }) {
            if (options?.head && options.count === "exact") {
              return selectBuilder;
            }
            throw new Error("Unexpected select usage in worker test.");
          },
          update(payload: Row) {
            updatePayload = payload;
            return updateBuilder;
          },
        };
      },
    } as any,
  };
}

function buildClaimedJob(): Row {
  return {
    id: "job-1",
    family_id: "fam-1",
    provider_code: "booking",
    job_type: "full_sync",
    attempts: 1,
    max_attempts: 6,
    created_at: "2026-06-15T10:00:00.000Z",
    run_after: "2026-06-15T10:00:00.000Z",
    payload: {
      property_id: "prop-1",
      stay_unit_ids: ["room-1"],
      date_from: "2026-06-15",
      date_to: "2026-06-15",
      certification_scenario: "manual_room_repair",
    },
    status: "running",
    result: {},
  };
}

test("ARI worker finalization persists succeeded status and timestamps", async () => {
  const supabase = createWorkerSupabase({
    jobs: [buildClaimedJob()],
  });

  const result = await processDueChannelSyncJobs(supabase.client, {
    workerId: "worker-test",
    dependencies: {
      processChannexAriSyncJob: (async () => ({
        ok: true,
        message: "Queued full sync completed successfully.",
        httpStatus: 200,
        retryAfterAt: null,
        taskIds: ["task-1"],
        result: {
          rooms_considered: ["room-1"],
          restriction_value_count: 1,
        },
      })) as never,
    },
  });

  assert.equal(result.processed, 1);
  assert.equal(result.succeeded, 1);
  assert.equal(result.failed, 0);
  assert.equal(supabase.state.channel_sync_jobs.length, 1);

  const row = supabase.state.channel_sync_jobs[0]!;
  assert.equal(row.status, "succeeded");
  assert.equal(typeof row.processed_at, "string");
  assert.equal(typeof row.completed_at, "string");
  assert.equal(row.channex_task_id, "task-1");
  assert.deepEqual((row.result as Row).task_ids, ["task-1"]);
});

test("ARI worker does not silently leave running when finalization write fails", async () => {
  const supabase = createWorkerSupabase({
    jobs: [buildClaimedJob()],
    failUpdateCount: 1,
  });

  const result = await processDueChannelSyncJobs(supabase.client, {
    workerId: "worker-test",
    dependencies: {
      processChannexAriSyncJob: (async () => ({
        ok: true,
        message: "Queued full sync completed successfully.",
        httpStatus: 200,
        retryAfterAt: null,
        taskIds: ["task-1"],
        result: {
          rooms_considered: ["room-1"],
        },
      })) as never,
    },
  });

  assert.equal(result.processed, 1);
  assert.equal(result.succeeded, 0);
  assert.equal(result.failed, 1);

  const row = supabase.state.channel_sync_jobs[0]!;
  assert.equal(row.status, "retrying");
  assert.equal(row.processed_at, undefined);
  assert.equal(typeof row.last_error, "string");
  assert.match(String(row.last_error), /Failed to persist channel sync job job-1: forced update failure/);
  assert.equal((row.result as Row).error, row.last_error);
});
