import test from "node:test";
import assert from "node:assert/strict";

import { createPropertyReelsRouteHandlers } from "@/lib/host/property-reels-route-handlers";
import { createPropertyReelUploadUrlRouteHandlers } from "@/lib/host/property-reels-upload-url-route-handlers";
import { resolvePublicPropertyMedia } from "@/lib/property-public-media";

type TableRow = Record<string, unknown>;
type MockDatabase = Record<string, TableRow[]>;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function applyFilters(rows: TableRow[], filters: Array<{ type: "eq" | "neq"; column: string; value: unknown }>) {
  return rows.filter((row) =>
    filters.every((filter) => {
      const current = row[filter.column];
      return filter.type === "eq" ? current === filter.value : current !== filter.value;
    })
  );
}

function applyOrdering(
  rows: TableRow[],
  orders: Array<{ column: string; ascending: boolean }>
): TableRow[] {
  if (orders.length === 0) return rows;
  return [...rows].sort((left, right) => {
    for (const order of orders) {
      const leftValue = left[order.column];
      const rightValue = right[order.column];
      if (leftValue === rightValue) continue;
      const direction = order.ascending ? 1 : -1;
      return String(leftValue ?? "").localeCompare(String(rightValue ?? "")) * direction;
    }
    return 0;
  });
}

function createSupabaseMock(db: MockDatabase) {
  class QueryBuilder {
    table: string;
    action: "select" | "insert" | "update" = "select";
    filters: Array<{ type: "eq" | "neq"; column: string; value: unknown }> = [];
    orders: Array<{ column: string; ascending: boolean }> = [];
    limitCount: number | null = null;
    payload: TableRow | TableRow[] | null = null;
    head = false;
    count: "exact" | null = null;

    constructor(table: string) {
      this.table = table;
    }

    select(_columns?: string, options?: { head?: boolean; count?: "exact" }) {
      if (this.action === "select") {
        this.head = options?.head === true;
        this.count = options?.count ?? null;
      }
      return this;
    }

    insert(payload: TableRow | TableRow[]) {
      this.action = "insert";
      this.payload = payload;
      return this;
    }

    update(payload: TableRow) {
      this.action = "update";
      this.payload = payload;
      return this;
    }

    eq(column: string, value: unknown) {
      this.filters.push({ type: "eq", column, value });
      return this;
    }

    neq(column: string, value: unknown) {
      this.filters.push({ type: "neq", column, value });
      return this;
    }

    order(column: string, options?: { ascending?: boolean }) {
      this.orders.push({ column, ascending: options?.ascending !== false });
      return this;
    }

    limit(count: number) {
      this.limitCount = count;
      return this;
    }

    async maybeSingle() {
      const result = await this.execute();
      const rows = Array.isArray(result.data) ? result.data : [];
      return { data: rows[0] ?? null, error: result.error ?? null };
    }

    async single() {
      const result = await this.execute();
      const rows = Array.isArray(result.data) ? result.data : [];
      return { data: rows[0] ?? null, error: result.error ?? null };
    }

    async execute() {
      const table = db[this.table] ?? (db[this.table] = []);

      if (this.action === "insert") {
        const payloads = Array.isArray(this.payload) ? this.payload : [this.payload ?? {}];
        const inserted = payloads.map((item, index) => {
          const next = clone(item);
          if (!next.id) {
            next.id = `${this.table}-${table.length + index + 1}`;
          }
          table.push(next);
          return next;
        });
        return { data: inserted, error: null };
      }

      if (this.action === "update") {
        const rows = applyFilters(table, this.filters);
        for (const row of rows) {
          Object.assign(row, clone(this.payload ?? {}));
        }
        return { data: rows, error: null };
      }

      let rows = applyFilters(table, this.filters);
      rows = applyOrdering(rows, this.orders);
      if (typeof this.limitCount === "number") {
        rows = rows.slice(0, this.limitCount);
      }

      if (this.head && this.count === "exact") {
        return { data: null, error: null, count: rows.length };
      }

      return { data: clone(rows), error: null };
    }

    then(resolve: (value: unknown) => void, reject?: (reason: unknown) => void) {
      return this.execute().then(resolve, reject);
    }
  }

  return {
    from(table: string) {
      return new QueryBuilder(table);
    },
  };
}

const routeState: {
  db: MockDatabase;
  access: { familyId: string; hostId: string; hostUserId: string };
  uploadTarget: { uploadUrl: string; storageKey: string; publicUrl: string; expiresInSeconds: number };
} = {
  db: {},
  access: {
    familyId: "family-1",
    hostId: "host-1",
    hostUserId: "user-1",
  },
  uploadTarget: {
    uploadUrl: "https://signed.example.com/upload",
    storageKey: "property-media/family-1/reels/reel-1.mp4",
    publicUrl: "https://cdn.example.com/property-media/family-1/reels/reel-1.mp4",
    expiresInSeconds: 900,
  },
};

const propertyReelsRoute = createPropertyReelsRouteHandlers({
  createAdminSupabaseClient: () => createSupabaseMock(routeState.db) as never,
  resolveAuthorizedHostResource: async () => routeState.access as never,
  resolvePublicPropertyMedia,
  revalidatePath: () => {},
  revalidateTag: () => {},
});

const propertyReelUploadUrlRoute = createPropertyReelUploadUrlRouteHandlers({
  createAdminSupabaseClient: () => createSupabaseMock(routeState.db) as never,
  resolveAuthorizedHostResource: async () => routeState.access as never,
  createPropertyReelUploadTarget: async () => routeState.uploadTarget,
});

function seedRouteDatabase() {
  routeState.db = {
    families: [
      {
        id: "family-1",
        admin_notes: null,
        updated_at: "2026-05-25T12:00:00.000Z",
      },
    ],
    host_onboarding_drafts: [
      {
        id: "draft-1",
        family_id: "family-1",
        payload: {},
        updated_at: "2026-05-25T12:00:00.000Z",
      },
    ],
    host_property_reels: [],
    hosts: [
      {
        id: "host-1",
        user_id: "user-1",
        legacy_family_id: "family-1",
      },
    ],
  };
}

test("host reel upload-url returns signed R2 target", async () => {
  seedRouteDatabase();

  const response = await propertyReelUploadUrlRoute.POST(
    new Request("http://localhost/api/host/property-reels/upload-url", {
      method: "POST",
      body: JSON.stringify({
        familyId: "family-1",
        fileName: "reel.mp4",
        fileType: "video/mp4",
        fileSize: 2048,
      }),
      headers: { "Content-Type": "application/json" },
    })
  );

  assert.equal(response.status, 200);
  const payload = (await response.json()) as { ok: boolean; storageKey: string; publicUrl: string };
  assert.equal(payload.ok, true);
  assert.equal(payload.storageKey, "property-media/family-1/reels/reel-1.mp4");
  assert.equal(payload.publicUrl, "https://cdn.example.com/property-media/family-1/reels/reel-1.mp4");
});

test("POST /api/host/property-reels saves canonical metadata", async () => {
  seedRouteDatabase();

  const response = await propertyReelsRoute.POST(
    new Request("http://localhost/api/host/property-reels", {
      method: "POST",
      body: JSON.stringify({
        familyId: "family-1",
        publicUrl: "https://cdn.example.com/property-media/family-1/reels/reel-2.mp4",
        storageKey: "property-media/family-1/reels/reel-2.mp4",
        mimeType: "video/mp4",
        sizeBytes: 191424,
        durationSeconds: 12.5,
        width: 1080,
        height: 1920,
      }),
      headers: { "Content-Type": "application/json" },
    })
  );

  assert.equal(response.status, 200);
  assert.equal(routeState.db.host_property_reels?.length, 1);
  assert.deepEqual(routeState.db.host_property_reels?.[0], {
    id: "host_property_reels-1",
    family_id: "family-1",
    host_id: "host-1",
    user_id: "user-1",
    storage_key: "property-media/family-1/reels/reel-2.mp4",
    public_url: "https://cdn.example.com/property-media/family-1/reels/reel-2.mp4",
    title: "Host reel",
    caption: "",
    mime_type: "video/mp4",
    size_bytes: 191424,
    duration_seconds: 12.5,
    width: 1080,
    height: 1920,
    is_featured: true,
    status: "active",
    created_at: routeState.db.host_property_reels?.[0]?.created_at,
    updated_at: routeState.db.host_property_reels?.[0]?.updated_at,
  });
});

test("resolver loads dashboard reel from host_property_reels before legacy metadata", async () => {
  const supabase = createSupabaseMock({
    family_photos: [],
    host_media: [],
    host_property_reels: [
      {
        id: "reel-1",
        family_id: "family-1",
        storage_key: "property-media/family-1/reels/reel-canonical.mp4",
        public_url: "https://cdn.example.com/reel-canonical.mp4",
        title: "Courtyard evenings",
        caption: "Tea and conversations with guests.",
        mime_type: "video/mp4",
        size_bytes: 1234,
        duration_seconds: 11,
        width: 1080,
        height: 1920,
        is_featured: true,
        status: "active",
        created_at: "2026-05-25T10:00:00.000Z",
        updated_at: "2026-05-25T10:00:00.000Z",
      },
    ],
    families: [
      {
        id: "family-1",
        admin_notes:
          'FAMLO_META::{"hostReelPublicUrl":"https://legacy.example.com/reel.mp4","hostReelStorageKey":"legacy/reel.mp4"}',
        host_photo_url: "",
        latest_onboarding_payload: {},
        updated_at: "2026-05-25T09:00:00.000Z",
      },
    ],
    hosts: [{ id: "host-1", host_photo_url: "" }],
    host_onboarding_drafts: [],
  });

  const media = await resolvePublicPropertyMedia(supabase as never, {
    familyId: "family-1",
    hostId: "host-1",
    debugContext: "dashboard-refresh-test",
  });

  assert.equal(media.debug.reelSource, "host_property_reels");
  assert.equal(media.reels[0]?.publicUrl, "https://cdn.example.com/reel-canonical.mp4");
  assert.equal(media.reels[0]?.storageKey, "property-media/family-1/reels/reel-canonical.mp4");
  assert.equal(media.reels[0]?.title, "Courtyard evenings");
  assert.equal(media.reels[0]?.caption, "Tea and conversations with guests.");
});

test("PATCH /api/host/property-reels updates a family-scoped reel title", async () => {
  seedRouteDatabase();
  routeState.db.host_property_reels = [
    {
      id: "reel-title",
      family_id: "family-1",
      host_id: "host-1",
      user_id: "user-1",
      storage_key: "property-media/family-1/reels/title.mp4",
      public_url: "https://cdn.example.com/title.mp4",
      title: "Old title",
      caption: "",
      mime_type: "video/mp4",
      size_bytes: 2000,
      is_featured: true,
      status: "active",
      created_at: "2026-05-25T11:00:00.000Z",
      updated_at: "2026-05-25T11:00:00.000Z",
    },
  ];

  const response = await propertyReelsRoute.PATCH(
    new Request("http://localhost/api/host/property-reels", {
      method: "PATCH",
      body: JSON.stringify({
        familyId: "family-1",
        reelId: "reel-title",
        action: "update_metadata",
        title: "Evening on our terrace",
      }),
      headers: { "Content-Type": "application/json" },
    })
  );
  const payload = (await response.json()) as { reel?: { title?: string } };

  assert.equal(response.status, 200);
  assert.equal(payload.reel?.title, "Evening on our terrace");
  assert.equal(routeState.db.host_property_reels?.[0]?.title, "Evening on our terrace");
});

test("resolver returns featured canonical reel first for public home page", async () => {
  const supabase = createSupabaseMock({
    family_photos: [],
    host_media: [],
    host_property_reels: [
      {
        id: "reel-older",
        family_id: "family-1",
        storage_key: "property-media/family-1/reels/older.mp4",
        public_url: "https://cdn.example.com/older.mp4",
        mime_type: "video/mp4",
        size_bytes: 1000,
        duration_seconds: 9,
        is_featured: false,
        status: "active",
        created_at: "2026-05-25T09:00:00.000Z",
        updated_at: "2026-05-25T09:00:00.000Z",
      },
      {
        id: "reel-featured",
        family_id: "family-1",
        storage_key: "property-media/family-1/reels/featured.mp4",
        public_url: "https://cdn.example.com/featured.mp4",
        mime_type: "video/mp4",
        size_bytes: 2000,
        duration_seconds: 10,
        is_featured: true,
        status: "active",
        created_at: "2026-05-25T11:00:00.000Z",
        updated_at: "2026-05-25T11:00:00.000Z",
      },
    ],
    families: [{ id: "family-1", admin_notes: null, host_photo_url: "", latest_onboarding_payload: {}, updated_at: "2026-05-25T09:00:00.000Z" }],
    hosts: [{ id: "host-1", host_photo_url: "" }],
    host_onboarding_drafts: [],
  });

  const media = await resolvePublicPropertyMedia(supabase as never, {
    familyId: "family-1",
    hostId: "host-1",
    debugContext: "public-home-test",
  });

  assert.equal(media.reels[0]?.id, "reel-featured");
  assert.equal(media.reels[0]?.publicUrl, "https://cdn.example.com/featured.mp4");
});

test("DELETE /api/host/property-reels marks row deleted safely", async () => {
  seedRouteDatabase();
  routeState.db.families![0] = {
    ...routeState.db.families![0],
    admin_notes:
      'FAMLO_META::{"hostReelPublicUrl":"https://cdn.example.com/property-media/family-1/reels/reel-2.mp4","hostReelStorageKey":"property-media/family-1/reels/reel-2.mp4"}',
  };
  routeState.db.host_property_reels = [
    {
      id: "reel-delete",
      family_id: "family-1",
      host_id: "host-1",
      user_id: "user-1",
      storage_key: "property-media/family-1/reels/reel-2.mp4",
      public_url: "https://cdn.example.com/property-media/family-1/reels/reel-2.mp4",
      mime_type: "video/mp4",
      size_bytes: 191424,
      is_featured: true,
      status: "active",
      created_at: "2026-05-25T12:00:00.000Z",
      updated_at: "2026-05-25T12:00:00.000Z",
    },
  ];

  const response = await propertyReelsRoute.DELETE(
    new Request("http://localhost/api/host/property-reels", {
      method: "DELETE",
      body: JSON.stringify({
        familyId: "family-1",
        reelId: "reel-delete",
      }),
      headers: { "Content-Type": "application/json" },
    })
  );

  assert.equal(response.status, 200);
  assert.equal(routeState.db.host_property_reels?.[0]?.status, "deleted");
  assert.match(String(routeState.db.families?.[0]?.admin_notes ?? ""), /"hostReelPublicUrl":""/);
});
