import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { provisionSingleStayUnitInChannex } from "@/lib/channex-room-provisioning";

type Row = Record<string, unknown>;

process.env.CHANNEX_ENVIRONMENT ??= "staging";
process.env.CHANNEX_STAGING_API_KEY ??= "test-channex-key";

function createProvisioningSupabase(seed?: Partial<Record<string, Row[]>>) {
  const state = {
    stay_units_v2: [...(seed?.stay_units_v2 ?? [])],
    channel_properties: [...(seed?.channel_properties ?? [])],
    channel_room_mappings: [...(seed?.channel_room_mappings ?? [])],
    channel_rate_plans: [...(seed?.channel_rate_plans ?? [])],
    channel_sync_logs: [...(seed?.channel_sync_logs ?? [])],
  };

  function rowsFor(table: keyof typeof state): Row[] {
    return state[table];
  }

  function matches(filters: Array<{ column: string; value: unknown }>, row: Row) {
    return filters.every((filter) => row[filter.column] === filter.value);
  }

  return {
    state,
    client: {
      from(table: keyof typeof state) {
        const filters: Array<{ column: string; value: unknown }> = [];
        const selectBuilder: any = {
          select() {
            return this;
          },
          eq(column: string, value: unknown) {
            filters.push({ column, value });
            return this;
          },
          limit() {
            return this;
          },
          then(resolve: (value: { data: Row[]; error: null }) => unknown) {
            const result = { data: rowsFor(table).filter((candidate) => matches(filters, candidate)), error: null };
            return Promise.resolve(result).then(resolve);
          },
          async maybeSingle() {
            const row = rowsFor(table).find((candidate) => matches(filters, candidate)) ?? null;
            return { data: row, error: null };
          },
        };

        return {
          select() {
            return selectBuilder;
          },
          eq(column: string, value: unknown) {
            return selectBuilder.eq(column, value);
          },
          async insert(payload: Row) {
            rowsFor(table).push(payload);
            return { error: null };
          },
          async upsert(payload: Row) {
            const conflictKeys =
              table === "channel_room_mappings"
                ? ["family_id", "stay_unit_id", "provider_code"]
                : table === "channel_rate_plans"
                  ? ["family_id", "stay_unit_id", "provider_code"]
                  : [];
            const existingIndex = rowsFor(table).findIndex((row) =>
              conflictKeys.length > 0 && conflictKeys.every((key) => row[key] === payload[key])
            );
            if (existingIndex >= 0) {
              rowsFor(table)[existingIndex] = { ...rowsFor(table)[existingIndex], ...payload };
            } else {
              rowsFor(table).push({ id: payload.id ?? `${String(table)}-${rowsFor(table).length + 1}`, ...payload });
            }
            return { error: null };
          },
          update(payload: Row) {
            return {
              eq(column: string, value: unknown) {
                const row = rowsFor(table).find((candidate) => candidate[column] === value);
                if (row) Object.assign(row, payload);
                return Promise.resolve({ error: null });
              },
            };
          },
          delete() {
            return {
              in(column: string, values: unknown[]) {
                const nextRows = rowsFor(table).filter((row) => !values.includes(row[column]));
                state[table] = nextRows as never;
                return Promise.resolve({ error: null });
              },
            };
          },
        };
      },
    } as any,
  };
}

test("single-room provisioning creates Channex room and rate mappings then queues ARI", async () => {
  const supabase = createProvisioningSupabase({
    stay_units_v2: [
      {
        id: "room-1",
        legacy_family_id: "fam-1",
        name: "Standard room",
        unit_type: "private_room",
        description: "Quiet room",
        max_guests: 2,
        price_fullday: 2500,
        is_active: true,
      },
    ],
    channel_properties: [
      {
        family_id: "fam-1",
        provider_code: "channex",
        external_property_id: "prop-1",
      },
    ],
  });

  let createdRoomTypes = 0;
  let createdRatePlans = 0;
  let updatedRoomTitle: string | null = null;
  let updatedRatePlanTitle: string | null = null;
  let queuedPayload: { stayUnitIds?: string[]; certificationScenario?: string; dateFrom?: string; dateTo?: string; jobTypes?: string[] } | null = null;

  const result = await provisionSingleStayUnitInChannex(
    {
      supabase: supabase.client,
      familyId: "fam-1",
      stayUnitId: "room-1",
      reason: "paid_room_addon",
      sourceRoute: "/api/host/stay-units",
      actorUserId: "host-user-1",
      actorRole: "host",
    },
    {
      loadHostProSettings: (async () => ({
        currency: "INR",
        defaultMealPlan: "room_only",
      })) as never,
      fetchChannexPropertyById: (async () =>
        ({
          ok: true,
          data: { id: "prop-1" },
        })) as never,
      fetchChannexRoomTypesForProperty: (async () =>
        ({
          ok: true,
          data: [],
        })) as never,
      fetchChannexRatePlansForProperty: (async () =>
        ({
          ok: true,
          data: [],
        })) as never,
      createChannexRoomType: (async () => {
        createdRoomTypes += 1;
        return {
          ok: true,
          externalRoomTypeId: "ext-room-1",
          httpStatus: 200,
          message: "created room",
          rawValidation: null,
          environment: "staging",
          endpoint: "/api/v1/room_types",
        };
      }) as never,
      createChannexRatePlan: (async () => {
        createdRatePlans += 1;
        return {
          ok: true,
          externalRatePlanId: "ext-rate-1",
          httpStatus: 200,
          message: "created rate",
          rawValidation: null,
          environment: "staging",
          endpoint: "/api/v1/rate_plans",
        };
      }) as never,
      updateChannexRoomTypeOccupancy: (async (payload: { title?: string }) => {
        updatedRoomTitle = payload.title ?? null;
        return {
          ok: true,
          externalRoomTypeId: "ext-room-1",
          httpStatus: 200,
          message: "updated room",
          rawValidation: null,
          environment: "staging",
          endpoint: "/api/v1/room_types/ext-room-1",
        };
      }) as never,
      updateChannexRatePlanOccupancy: (async (payload: { title?: string }) => {
        updatedRatePlanTitle = payload.title ?? null;
        return {
          ok: true,
          externalRatePlanId: "ext-rate-1",
          httpStatus: 200,
          message: "updated rate",
          rawValidation: null,
          environment: "staging",
          endpoint: "/api/v1/rate_plans/ext-rate-1",
        };
      }) as never,
      enqueueChannexAriSyncJobs: (async (
        _supabase: unknown,
        payload: { stayUnitIds?: string[]; certificationScenario?: string; dateFrom?: string; dateTo?: string; jobTypes?: string[] }
      ) => {
        queuedPayload = payload;
        return ["job-1"];
      }) as never,
    }
  );

  assert.equal(result.ok, true);
  assert.equal(result.status, "provisioned");
  assert.equal(result.externalRoomTypeId, "ext-room-1");
  assert.equal(result.externalRatePlanId, "ext-rate-1");
  assert.deepEqual(result.queuedJobIds, ["job-1"]);
  assert.equal(createdRoomTypes, 1);
  assert.equal(createdRatePlans, 1);
  assert.equal(updatedRoomTitle, "Standard room");
  assert.equal(updatedRatePlanTitle, "Standard Rate - Standard room");
  assert.equal(supabase.state.channel_room_mappings[0]?.external_room_type_id, "ext-room-1");
  assert.equal(supabase.state.channel_rate_plans[0]?.external_rate_plan_id, "ext-rate-1");
  assert.equal(supabase.state.channel_room_mappings[0]?.sync_status, "mapped");
  assert.equal(supabase.state.channel_rate_plans[0]?.sync_status, "mapped");
  if (!queuedPayload) {
    throw new Error("Expected single-room provisioning to queue ARI payload.");
  }
  const ensuredQueuedPayload = queuedPayload as {
    stayUnitIds?: string[];
    certificationScenario?: string;
    dateFrom?: string;
    dateTo?: string;
    jobTypes?: string[];
  };
  assert.deepEqual(ensuredQueuedPayload.stayUnitIds, ["room-1"]);
  assert.deepEqual(ensuredQueuedPayload.jobTypes, ["full_sync"]);
  assert.equal(ensuredQueuedPayload.certificationScenario, "paid_room_addon");
  assert.ok(ensuredQueuedPayload.dateFrom);
  assert.ok(ensuredQueuedPayload.dateTo);
  assert.notEqual(ensuredQueuedPayload.dateTo, ensuredQueuedPayload.dateFrom);
});

test("single-room provisioning refreshes Channex titles without duplicate creation for an already mapped room", async () => {
  const supabase = createProvisioningSupabase({
    stay_units_v2: [
      {
        id: "room-1",
        legacy_family_id: "fam-1",
        name: "Popo",
        unit_type: "private_room",
        description: "Quiet room",
        max_guests: 2,
        price_fullday: 2500,
        is_active: true,
      },
    ],
    channel_properties: [
      {
        family_id: "fam-1",
        provider_code: "channex",
        external_property_id: "prop-1",
      },
    ],
    channel_room_mappings: [
      {
        family_id: "fam-1",
        stay_unit_id: "room-1",
        provider_code: "channex",
        external_property_id: "prop-1",
        external_room_type_id: "ext-room-1",
        sync_status: "mapped",
        metadata: {},
      },
    ],
    channel_rate_plans: [
      {
        family_id: "fam-1",
        stay_unit_id: "room-1",
        provider_code: "channex",
        external_rate_plan_id: "ext-rate-1",
        title: "Standard Rate - Standard room",
        meal_plan: "room_only",
        sync_status: "mapped",
        metadata: {},
      },
    ],
  });

  let createdRoomTypes = 0;
  let createdRatePlans = 0;
  let updatedRoomTitle: string | null = null;
  let updatedRatePlanTitle: string | null = null;

  const result = await provisionSingleStayUnitInChannex(
    {
      supabase: supabase.client,
      familyId: "fam-1",
      stayUnitId: "room-1",
      reason: "manual_room_repair",
      sourceRoute: "/api/host/pro/channel/channex/rooms/repair",
    },
    {
      loadHostProSettings: (async () => ({
        currency: "INR",
        defaultMealPlan: "room_only",
      })) as never,
      fetchChannexPropertyById: (async () =>
        ({
          ok: true,
          data: { id: "prop-1" },
        })) as never,
      createChannexRoomType: (async () => {
        createdRoomTypes += 1;
        throw new Error("should not create duplicate room type");
      }) as never,
      createChannexRatePlan: (async () => {
        createdRatePlans += 1;
        throw new Error("should not create duplicate rate plan");
      }) as never,
      updateChannexRoomTypeOccupancy: (async (payload: { title?: string }) => {
        updatedRoomTitle = payload.title ?? null;
        return {
          ok: true,
          externalRoomTypeId: "ext-room-1",
          httpStatus: 200,
          message: "updated room",
          rawValidation: null,
          environment: "staging",
          endpoint: "/api/v1/room_types/ext-room-1",
        };
      }) as never,
      updateChannexRatePlanOccupancy: (async (payload: { title?: string }) => {
        updatedRatePlanTitle = payload.title ?? null;
        return {
          ok: true,
          externalRatePlanId: "ext-rate-1",
          httpStatus: 200,
          message: "updated rate",
          rawValidation: null,
          environment: "staging",
          endpoint: "/api/v1/rate_plans/ext-rate-1",
        };
      }) as never,
      enqueueChannexAriSyncJobs: (async () => ["job-1"]) as never,
    }
  );

  assert.equal(result.ok, true);
  assert.equal(result.status, "already_mapped");
  assert.equal(createdRoomTypes, 0);
  assert.equal(createdRatePlans, 0);
  assert.equal(updatedRoomTitle, "Popo");
  assert.equal(updatedRatePlanTitle, "Standard Rate - Popo");
  assert.equal(
    (supabase.state.channel_room_mappings[0]?.metadata as Record<string, unknown> | undefined)
      ?.external_room_type_title,
    "Popo"
  );
  assert.equal(supabase.state.channel_rate_plans[0]?.title, "Standard Rate - Popo");
});

test("single-room provisioning returns repair-needed when a rate plan exists without a room mapping", async () => {
  const supabase = createProvisioningSupabase({
    stay_units_v2: [
      {
        id: "room-1",
        legacy_family_id: "fam-1",
        name: "Standard room",
        unit_type: "private_room",
        description: "Quiet room",
        max_guests: 2,
        price_fullday: 2500,
        is_active: true,
      },
    ],
    channel_properties: [
      {
        family_id: "fam-1",
        provider_code: "channex",
        external_property_id: "prop-1",
      },
    ],
    channel_rate_plans: [
      {
        family_id: "fam-1",
        stay_unit_id: "room-1",
        provider_code: "channex",
        external_rate_plan_id: "ext-rate-1",
        title: "Standard Rate - Standard room",
        meal_plan: "room_only",
        sync_status: "mapped",
        metadata: {},
      },
    ],
  });

  const result = await provisionSingleStayUnitInChannex(
    {
      supabase: supabase.client,
      familyId: "fam-1",
      stayUnitId: "room-1",
      reason: "manual_room_repair",
    },
    {
      loadHostProSettings: (async () => ({
        currency: "INR",
        defaultMealPlan: "room_only",
      })) as never,
      fetchChannexPropertyById: (async () =>
        ({
          ok: true,
          data: { id: "prop-1" },
        })) as never,
    }
  );

  assert.equal(result.ok, false);
  assert.equal(result.status, "repair_needed");
  assert.equal(supabase.state.channel_room_mappings[0]?.sync_status, "failed");
});

test("single-room provisioning records failure status when room creation fails", async () => {
  const supabase = createProvisioningSupabase({
    stay_units_v2: [
      {
        id: "room-1",
        legacy_family_id: "fam-1",
        name: "Standard room",
        unit_type: "private_room",
        description: "Quiet room",
        max_guests: 2,
        price_fullday: 2500,
        is_active: true,
      },
    ],
    channel_properties: [
      {
        family_id: "fam-1",
        provider_code: "channex",
        external_property_id: "prop-1",
      },
    ],
  });

  const result = await provisionSingleStayUnitInChannex(
    {
      supabase: supabase.client,
      familyId: "fam-1",
      stayUnitId: "room-1",
      reason: "paid_room_addon",
      sourceRoute: "/api/host/stay-units",
    },
    {
      loadHostProSettings: (async () => ({
        currency: "INR",
        defaultMealPlan: "room_only",
      })) as never,
      fetchChannexPropertyById: (async () =>
        ({
          ok: true,
          data: { id: "prop-1" },
        })) as never,
      fetchChannexRoomTypesForProperty: (async () =>
        ({
          ok: true,
          data: [],
        })) as never,
      createChannexRoomType: (async () =>
        ({
          ok: false,
          externalRoomTypeId: null,
          httpStatus: 422,
          message: "room create failed",
          rawValidation: { title: "invalid" },
          environment: "staging",
          endpoint: "/api/v1/room_types",
        })) as never,
    }
  );

  assert.equal(result.ok, false);
  assert.equal(result.status, "failed");
  assert.equal(supabase.state.channel_room_mappings[0]?.sync_status, "failed");
  assert.equal(supabase.state.channel_sync_logs.at(-1)?.status, "failed");
});

test("repair endpoint reuses the single-room provisioning helper and does not consume another add-on", () => {
  const repoRoot = process.cwd();
  const repairRouteSource = fs.readFileSync(
    path.join(repoRoot, "app/api/host/pro/channel/channex/rooms/repair/route.ts"),
    "utf8"
  );
  const stayUnitsRouteSource = fs.readFileSync(
    path.join(repoRoot, "app/api/host/stay-units/route.ts"),
    "utf8"
  );

  assert.match(repairRouteSource, /provisionSingleStayUnitInChannex/);
  assert.doesNotMatch(repairRouteSource, /consumePaidHostProAddonOrder/);

  const consumeIndex = stayUnitsRouteSource.indexOf("targetReference: canonicalStayUnitId");
  const provisionIndex = stayUnitsRouteSource.indexOf('reason: "paid_room_addon"');
  assert.notEqual(consumeIndex, -1);
  assert.notEqual(provisionIndex, -1);
  assert.equal(consumeIndex < provisionIndex, true);
});
