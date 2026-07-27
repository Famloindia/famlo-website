import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type { SupabaseClient } from "@supabase/supabase-js";

import { requireOwnedFamily } from "@/lib/host-settings-auth";
import { createHostSessionToken, verifyHostSessionToken } from "@/lib/host-session";
import {
  completeHostWhatsappOtp,
  getHostWhatsappSettings,
  hashRequestIp,
  maskHostWhatsappPhone,
  normalizeHostWhatsappPhone,
  requestHostWhatsappOtp,
  resolveVerifiedAuthPhone,
  seedHostWhatsappSettings,
  updateHostWhatsappEnabled,
} from "@/lib/host-whatsapp-settings";
import { resolveBookingApprovalRequirement } from "@/lib/payment-booking-finalization";

type Row = Record<string, any>;
type Tables = Record<string, Row[]>;

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://nsanahmopvwrlwvmxdmf.supabase.co";
process.env.APP_ENV = "test";
process.env.FAMLO_ENABLE_STAGING_TEST_OTP = "true";
process.env.FAMLO_STAGING_TEST_OTP_CODE = "654321";
process.env.FAMLO_ENABLE_WHATSAPP_NOTIFICATIONS = "false";
process.env.ADMIN_SESSION_SECRET = "phase2-test-secret-that-is-long-enough";

class Query {
  private action: "select" | "insert" | "update" | "upsert" = "select";
  private payload: Row | Row[] | null = null;
  private filters: Array<(row: Row) => boolean> = [];
  private orderBy: { column: string; ascending: boolean } | null = null;
  private rowLimit: number | null = null;
  private countOnly = false;

  constructor(private tables: Tables, private table: string) {}

  select(_columns = "*", options?: { count?: string; head?: boolean }): this {
    this.countOnly = Boolean(options?.head);
    return this;
  }

  insert(payload: Row | Row[]): this {
    this.action = "insert";
    this.payload = payload;
    return this;
  }

  update(payload: Row): this {
    this.action = "update";
    this.payload = payload;
    return this;
  }

  upsert(payload: Row | Row[], _options?: { onConflict?: string }): this {
    this.action = "upsert";
    this.payload = payload;
    return this;
  }

  eq(column: string, value: unknown): this {
    this.filters.push((row) => row[column] === value);
    return this;
  }

  gte(column: string, value: unknown): this {
    this.filters.push((row) => String(row[column]) >= String(value));
    return this;
  }

  order(column: string, options?: { ascending?: boolean }): this {
    this.orderBy = { column, ascending: options?.ascending !== false };
    return this;
  }

  limit(value: number): this {
    this.rowLimit = value;
    return this;
  }

  async maybeSingle(): Promise<{ data: Row | null; error: null }> {
    const result = this.execute();
    return { data: Array.isArray(result.data) ? result.data[0] ?? null : result.data, error: null };
  }

  async single(): Promise<{ data: Row; error: null }> {
    const result = this.execute();
    const row = Array.isArray(result.data) ? result.data[0] : result.data;
    if (!row) throw new Error(`Missing ${this.table} row`);
    return { data: row, error: null };
  }

  then<TResult1 = any, TResult2 = never>(
    onfulfilled?: ((value: any) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve(this.execute()).then(onfulfilled, onrejected);
  }

  private matchingRows(): Row[] {
    let rows = (this.tables[this.table] ?? []).filter((row) => this.filters.every((filter) => filter(row)));
    if (this.orderBy) {
      const { column, ascending } = this.orderBy;
      rows = [...rows].sort((a, b) => String(a[column]).localeCompare(String(b[column])) * (ascending ? 1 : -1));
    }
    if (this.rowLimit != null) rows = rows.slice(0, this.rowLimit);
    return rows;
  }

  private execute(): { data: Row[] | Row | null; error: null; count?: number } {
    const tableRows = (this.tables[this.table] ??= []);
    if (this.action === "select") {
      const rows = this.matchingRows();
      return this.countOnly ? { data: null, error: null, count: rows.length } : { data: rows, error: null };
    }
    const payloadRows = Array.isArray(this.payload) ? this.payload : [this.payload ?? {}];
    if (this.action === "insert") {
      const inserted = payloadRows.map((row) => ({
        id: row.id ?? `${this.table}-${tableRows.length + 1}`,
        created_at: row.created_at ?? new Date().toISOString(),
        ...row,
      }));
      tableRows.push(...inserted);
      return { data: inserted, error: null };
    }
    if (this.action === "upsert") {
      const changed: Row[] = [];
      for (const row of payloadRows) {
        const existing = tableRows.find((candidate) => candidate.host_user_id === row.host_user_id);
        if (existing) {
          Object.assign(existing, row);
          changed.push(existing);
        } else {
          const inserted = { id: row.id ?? `${this.table}-${tableRows.length + 1}`, ...row };
          tableRows.push(inserted);
          changed.push(inserted);
        }
      }
      return { data: changed, error: null };
    }
    const matches = this.matchingRows();
    for (const row of matches) Object.assign(row, this.payload);
    return { data: matches, error: null };
  }
}

function fakeSupabase(
  tables: Tables,
  authUsers: Record<string, { phone?: string; phone_confirmed_at?: string | null }> = {}
): SupabaseClient {
  return {
    from: (table: string) => new Query(tables, table),
    auth: {
      admin: {
        getUserById: async (id: string) => ({
          data: { user: authUsers[id] ? { id, ...authUsers[id] } : null },
          error: null,
        }),
      },
    },
  } as unknown as SupabaseClient;
}

function baseTables(): Tables {
  return {
    users: [
      { id: "host-1", phone: "9876543210", role: "family" },
      { id: "host-2", phone: "9123456789", role: "family" },
    ],
    families: [
      { id: "family-1", user_id: "host-1", booking_requires_host_approval: false },
      { id: "family-2", user_id: "host-1", booking_requires_host_approval: true },
      { id: "family-other", user_id: "host-2", booking_requires_host_approval: false },
    ],
    hosts: [
      { id: "listing-1", user_id: "host-1", legacy_family_id: "family-1", booking_requires_host_approval: false },
      { id: "listing-2", user_id: "host-1", legacy_family_id: "family-2", booking_requires_host_approval: true },
      { id: "listing-other", user_id: "host-2", legacy_family_id: "family-other", booking_requires_host_approval: false },
    ],
    host_whatsapp_settings: [],
    host_whatsapp_otp_challenges: [],
    host_whatsapp_audit_log: [],
  };
}

test("settings row is seeded from verified Auth phone", async () => {
  const tables = baseTables();
  const supabase = fakeSupabase(tables, {
    "host-1": { phone: "+919876543210", phone_confirmed_at: "2026-07-24T00:00:00Z" },
  });
  const evidence = await resolveVerifiedAuthPhone(supabase, { hostUserId: "host-1", expectedPhone: "9876543210" });
  assert.equal(evidence?.phoneE164, "+919876543210");
  await seedHostWhatsappSettings(supabase, {
    hostUserId: "host-1",
    phone: evidence?.phoneE164,
    verifiedAt: evidence?.verifiedAt,
    consent: false,
    source: "auth_phone_verified",
  });
  assert.equal(tables.host_whatsapp_settings[0].ownership_verified_at, "2026-07-24T00:00:00Z");
});
test("unverified legacy phone remains unverified", async () => {
  const tables = baseTables();
  await seedHostWhatsappSettings(fakeSupabase(tables), {
    hostUserId: "host-1",
    phone: "9876543210",
    verifiedAt: null,
    consent: false,
    source: "users_phone",
  });
  assert.equal(tables.host_whatsapp_settings[0].ownership_verified_at, null);
  assert.equal(tables.host_whatsapp_settings[0].enabled, false);
});

test("multiple properties create one host settings row", async () => {
  const tables = baseTables();
  const supabase = fakeSupabase(tables);
  await seedHostWhatsappSettings(supabase, {
    hostUserId: "host-1",
    phone: "9876543210",
    consent: false,
    source: "users_phone",
  });
  await seedHostWhatsappSettings(supabase, {
    hostUserId: "host-1",
    phone: "9876543210",
    consent: false,
    source: "users_phone",
  });
  assert.equal(tables.host_whatsapp_settings.length, 1);
});

test("host cannot read or update another host property", async () => {
  const supabase = fakeSupabase(baseTables());
  await assert.rejects(
    requireOwnedFamily(supabase, { hostUserId: "host-1", familyId: "family-1" }, "family-other"),
    /cannot manage/
  );
});

test("invalid phone is rejected and valid phone is normalized", () => {
  assert.throws(() => normalizeHostWhatsappPhone("123"), /valid Indian/);
  assert.equal(normalizeHostWhatsappPhone("98765 43210"), "+919876543210");
  assert.equal(maskHostWhatsappPhone("+919876543210"), "+91 98••••••10");
});

test("OTP send is rate limited per host", async () => {
  const tables = baseTables();
  const now = new Date("2026-07-24T10:00:00Z");
  tables.host_whatsapp_otp_challenges = Array.from({ length: 5 }, (_, index) => ({
    id: `old-${index}`,
    host_user_id: "host-1",
    phone_e164: "+919876543210",
    ip_hash: "ip",
    status: "invalidated",
    created_at: new Date(now.getTime() - index * 1000).toISOString(),
  }));
  await assert.rejects(
    requestHostWhatsappOtp(fakeSupabase(tables), {
      hostUserId: "host-1",
      phone: "9876543210",
      consent: true,
      ipHash: "ip",
      now,
    }),
    (error: any) => error.code === "rate_limited"
  );
});

test("incorrect, expired, reused and correct OTP outcomes are enforced", async () => {
  const tables = baseTables();
  const supabase = fakeSupabase(tables);
  const now = new Date("2026-07-24T10:00:00Z");
  const sent = await requestHostWhatsappOtp(supabase, {
    hostUserId: "host-1",
    phone: "9876543210",
    consent: true,
    ipHash: "ip",
    now,
  });
  await assert.rejects(
    completeHostWhatsappOtp(supabase, {
      hostUserId: "host-1",
      challengeId: sent.challengeId,
      code: "000000",
      ipHash: "ip",
      now,
    }),
    (error: any) => error.code === "incorrect_otp"
  );
  assert.equal(tables.host_whatsapp_otp_challenges[0].attempts, 1);

  const settings = await completeHostWhatsappOtp(supabase, {
    hostUserId: "host-1",
    challengeId: sent.challengeId,
    code: "654321",
    ipHash: "ip",
    now,
  });
  assert.equal(settings.verified, true);
  assert.equal(settings.enabled, true);
  assert.equal(tables.users[0].phone, "9876543210");
  await assert.rejects(
    completeHostWhatsappOtp(supabase, {
      hostUserId: "host-1",
      challengeId: sent.challengeId,
      code: "654321",
      ipHash: "ip",
      now,
    }),
    (error: any) => error.code === "otp_not_active"
  );

  const expired = await requestHostWhatsappOtp(supabase, {
    hostUserId: "host-2",
    phone: "9123456789",
    consent: false,
    ipHash: "ip-2",
    now,
  });
  await assert.rejects(
    completeHostWhatsappOtp(supabase, {
      hostUserId: "host-2",
      challengeId: expired.challengeId,
      code: "654321",
      ipHash: "ip-2",
      now: new Date(now.getTime() + 11 * 60 * 1000),
    }),
    (error: any) => error.code === "otp_expired"
  );
});

test("verification and consent are required before enabling", async () => {
  const tables = baseTables();
  const supabase = fakeSupabase(tables);
  tables.host_whatsapp_settings.push({
    id: "settings-1",
    host_user_id: "host-1",
    phone_e164: "+919876543210",
    ownership_verified_at: null,
    opted_in_at: null,
    enabled: false,
  });
  await assert.rejects(
    updateHostWhatsappEnabled(supabase, { hostUserId: "host-1", enabled: true, ipHash: "ip" }),
    (error: any) => error.code === "verification_required"
  );
  tables.host_whatsapp_settings[0].ownership_verified_at = "2026-07-24T00:00:00Z";
  await assert.rejects(
    updateHostWhatsappEnabled(supabase, { hostUserId: "host-1", enabled: true, ipHash: "ip" }),
    (error: any) => error.code === "consent_required"
  );
});

test("disable preserves phone and verification", async () => {
  const tables = baseTables();
  tables.host_whatsapp_settings.push({
    id: "settings-1",
    host_user_id: "host-1",
    phone_e164: "+919876543210",
    ownership_verified_at: "2026-07-24T00:00:00Z",
    opted_in_at: "2026-07-24T00:00:00Z",
    enabled: true,
  });
  await updateHostWhatsappEnabled(fakeSupabase(tables), {
    hostUserId: "host-1",
    enabled: false,
    ipHash: "ip",
  });
  assert.equal(tables.host_whatsapp_settings[0].enabled, false);
  assert.equal(tables.host_whatsapp_settings[0].phone_e164, "+919876543210");
  assert.ok(tables.host_whatsapp_settings[0].ownership_verified_at);
});

test("settings response exposes only a masked phone", async () => {
  const tables = baseTables();
  tables.host_whatsapp_settings.push({
    id: "settings-1",
    host_user_id: "host-1",
    phone_e164: "+919876543210",
    enabled: false,
  });
  const response = await getHostWhatsappSettings(fakeSupabase(tables), "host-1");
  assert.equal(response.phoneMasked, "+91 98••••••10");
  assert.equal("phoneE164" in response, false);
  assert.doesNotMatch(JSON.stringify(response), /9876543210/);
});

test("signed partner session rejects tampering", () => {
  const token = createHostSessionToken({ familyId: "family-1", hostUserId: "host-1", now: 1_800_000_000_000 });
  assert.equal(verifyHostSessionToken(token, 1_800_000_001_000)?.hostUserId, "host-1");
  assert.equal(verifyHostSessionToken(`${token}x`, 1_800_000_001_000), null);
});

test("booking approval remains property-level for a multi-property host", async () => {
  const supabase = fakeSupabase(baseTables());
  assert.equal(
    await resolveBookingApprovalRequirement(supabase, {
      host_id: "listing-1",
      hosts: { legacy_family_id: "family-1", booking_requires_host_approval: true },
    }),
    false
  );
  assert.equal(
    await resolveBookingApprovalRequirement(supabase, {
      host_id: "listing-2",
      hosts: { legacy_family_id: "family-2", booking_requires_host_approval: false },
    }),
    true
  );
});

test("onboarding no longer trusts client phone verification and records consent", () => {
  const submitRoute = readFileSync("app/api/onboarding/home/submit/route.ts", "utf8");
  const onboardingForm = readFileSync("components/partners/HomeOnboardingForm.tsx", "utf8");
  const approval = readFileSync("lib/family-approval.ts", "utf8");
  assert.doesNotMatch(submitRoute, /phone_verified:\s*true/);
  assert.match(submitRoute, /resolveVerifiedAuthPhone/);
  assert.match(onboardingForm, /whatsappConsent/);
  assert.match(approval, /seedHostWhatsappSettings/);
});

test("booking approval UI persists through the authorized property API", () => {
  const dashboard = readFileSync("components/partners/tabs/DashboardTab.tsx", "utf8");
  const route = readFileSync("app/api/host/booking-approval/route.ts", "utf8");
  assert.match(dashboard, /\/api\/host\/booking-approval/);
  assert.match(route, /requireOwnedFamily/);
  assert.match(route, /host_property_preference_audit_log/);
});

test("test message cannot call Meta while delivery flag is false", () => {
  const route = readFileSync("app/api/host/whatsapp-settings/test/route.ts", "utf8");
  assert.match(route, /whatsapp_delivery_disabled/);
  assert.doesNotMatch(route, /sendWhatsAppNotification|graph\.facebook|fetch\(/);
});

test("request IP hashing does not retain the raw address", () => {
  const hash = hashRequestIp("203.0.113.10");
  assert.notEqual(hash, "203.0.113.10");
  assert.equal(hash.length, 64);
});
