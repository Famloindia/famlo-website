import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { PATCH as updateBookingApproval } from "@/app/api/host/booking-approval/route";
import { requireOwnedFamily } from "@/lib/host-settings-auth";
import { createHostSessionToken, HOST_SESSION_COOKIE_NAME } from "@/lib/host-session";
import {
  completeHostWhatsappOtp,
  getHostWhatsappSettings,
  hashRequestIp,
  requestHostWhatsappOtp,
  resolveVerifiedAuthPhone,
  seedHostWhatsappSettings,
  updateHostWhatsappEnabled,
} from "@/lib/host-whatsapp-settings";
import { resolveBookingApprovalRequirement } from "@/lib/payment-booking-finalization";

const STAGING_PROJECT_REF = "nsanahmopvwrlwvmxdmf";

type Fixture = {
  marker: string;
  hostUserId: string;
  otherUserId: string;
  familyIds: string[];
  hostIds: string[];
};

function requireEnvironment(): { url: string; serviceRoleKey: string } {
  assert.equal(process.env.RUN_STAGING_HOST_WHATSAPP_INTEGRATION, "1");
  const url = process.env.STAGING_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const serviceRoleKey =
    process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  assert.ok(url.includes(STAGING_PROJECT_REF), `Refusing non-staging Supabase URL: ${url}`);
  assert.ok(serviceRoleKey, "Staging service-role key is required.");
  assert.equal(process.env.FAMLO_ENABLE_WHATSAPP_NOTIFICATIONS, "false");
  assert.equal(process.env.FAMLO_ENABLE_STAGING_TEST_OTP, "true");
  assert.match(process.env.FAMLO_STAGING_TEST_OTP_CODE ?? "", /^\d{6}$/);
  return { url, serviceRoleKey };
}

async function insertOne<T extends Record<string, unknown>>(
  supabase: SupabaseClient,
  table: string,
  payload: Record<string, unknown>
): Promise<T> {
  const { data, error } = await supabase.from(table).insert(payload as never).select("*").single();
  if (error) throw error;
  return data as T;
}

async function createFixture(supabase: SupabaseClient): Promise<Fixture> {
  const marker = randomUUID().slice(0, 8);
  const hostPhone = `+9198${Math.floor(10_000_000 + Math.random() * 89_999_999)}`;
  const otherPhone = `+9197${Math.floor(10_000_000 + Math.random() * 89_999_999)}`;
  const hostAuth = await supabase.auth.admin.createUser({
    email: `phase2-host-${marker}@example.test`,
    password: `Phase2-${marker}!`,
    email_confirm: true,
    phone: hostPhone,
    phone_confirm: true,
    user_metadata: { role: "family", staging_fixture: marker },
  });
  if (hostAuth.error || !hostAuth.data.user) throw hostAuth.error ?? new Error("Host auth fixture failed.");
  const otherAuth = await supabase.auth.admin.createUser({
    email: `phase2-other-${marker}@example.test`,
    password: `Phase2-${marker}!`,
    email_confirm: true,
    phone: otherPhone,
    phone_confirm: true,
    user_metadata: { role: "family", staging_fixture: marker },
  });
  if (otherAuth.error || !otherAuth.data.user) throw otherAuth.error ?? new Error("Other auth fixture failed.");

  await supabase.from("users").insert([
    {
      id: hostAuth.data.user.id,
      email: hostAuth.data.user.email,
      phone: hostPhone,
      name: `Phase 2 Host ${marker}`,
      role: "family",
      onboarding_completed: true,
    },
    {
      id: otherAuth.data.user.id,
      email: otherAuth.data.user.email,
      phone: otherPhone,
      name: `Phase 2 Other ${marker}`,
      role: "family",
      onboarding_completed: true,
    },
  ] as never);

  const familyOne = await insertOne<{ id: string }>(supabase, "families", {
    user_id: hostAuth.data.user.id,
    host_id: `FAM-P2A-${marker}`.toUpperCase(),
    host_password: `Phase2-${marker}!`,
    host_phone: hostPhone,
    name: `Phase 2 Property A ${marker}`,
    city: "Staging Test City",
    state: "Staging",
    is_active: false,
    is_accepting: false,
    booking_requires_host_approval: true,
  });
  const familyTwo = await insertOne<{ id: string }>(supabase, "families", {
    user_id: hostAuth.data.user.id,
    host_id: `FAM-P2B-${marker}`.toUpperCase(),
    host_password: `Phase2-${marker}!`,
    host_phone: hostPhone,
    name: `Phase 2 Property B ${marker}`,
    city: "Staging Test City",
    state: "Staging",
    is_active: false,
    is_accepting: false,
    booking_requires_host_approval: false,
  });
  const otherFamily = await insertOne<{ id: string }>(supabase, "families", {
    user_id: otherAuth.data.user.id,
    host_id: `FAM-P2O-${marker}`.toUpperCase(),
    host_password: `Phase2-${marker}!`,
    host_phone: otherPhone,
    name: `Phase 2 Other ${marker}`,
    city: "Staging Test City",
    state: "Staging",
    is_active: false,
    is_accepting: false,
    booking_requires_host_approval: false,
  });

  const hostOne = await insertOne<{ id: string }>(supabase, "hosts", {
    user_id: hostAuth.data.user.id,
    legacy_family_id: familyOne.id,
    display_name: `Phase 2 Host ${marker}`,
    slug: `phase2-a-${marker}`,
    status: "active",
    is_accepting: false,
    booking_requires_host_approval: true,
  });
  const hostTwo = await insertOne<{ id: string }>(supabase, "hosts", {
    user_id: hostAuth.data.user.id,
    legacy_family_id: familyTwo.id,
    display_name: `Phase 2 Host ${marker}`,
    slug: `phase2-b-${marker}`,
    status: "active",
    is_accepting: false,
    booking_requires_host_approval: false,
  });
  const otherHost = await insertOne<{ id: string }>(supabase, "hosts", {
    user_id: otherAuth.data.user.id,
    legacy_family_id: otherFamily.id,
    display_name: `Phase 2 Other ${marker}`,
    slug: `phase2-other-${marker}`,
    status: "active",
    is_accepting: false,
    booking_requires_host_approval: false,
  });

  return {
    marker,
    hostUserId: hostAuth.data.user.id,
    otherUserId: otherAuth.data.user.id,
    familyIds: [familyOne.id, familyTwo.id, otherFamily.id],
    hostIds: [hostOne.id, hostTwo.id, otherHost.id],
  };
}

async function cleanup(supabase: SupabaseClient, fixture: Fixture): Promise<void> {
  await supabase.from("host_whatsapp_otp_challenges").delete().in("host_user_id", [fixture.hostUserId, fixture.otherUserId]);
  await supabase.from("host_whatsapp_audit_log").delete().in("host_user_id", [fixture.hostUserId, fixture.otherUserId]);
  await supabase.from("host_property_preference_audit_log").delete().in("host_user_id", [fixture.hostUserId, fixture.otherUserId]);
  await supabase.from("host_whatsapp_settings").delete().in("host_user_id", [fixture.hostUserId, fixture.otherUserId]);
  await supabase.from("hosts").delete().in("id", fixture.hostIds);
  await supabase.from("families").delete().in("id", fixture.familyIds);
  await supabase.from("users").delete().in("id", [fixture.hostUserId, fixture.otherUserId]);
  await supabase.auth.admin.deleteUser(fixture.hostUserId);
  await supabase.auth.admin.deleteUser(fixture.otherUserId);
}

test("Phase 2 staging settings, OTP, isolation and property preference integration", async () => {
  const env = requireEnvironment();
  const supabase = createClient(env.url, env.serviceRoleKey, { auth: { persistSession: false } });
  const fixture = await createFixture(supabase);
  try {
    const evidence = await resolveVerifiedAuthPhone(supabase, { hostUserId: fixture.hostUserId });
    assert.ok(evidence?.verifiedAt);
    await seedHostWhatsappSettings(supabase, {
      hostUserId: fixture.hostUserId,
      phone: evidence?.phoneE164,
      verifiedAt: evidence?.verifiedAt,
      consent: false,
      source: "auth_phone_verified",
    });
    await seedHostWhatsappSettings(supabase, {
      hostUserId: fixture.hostUserId,
      phone: evidence?.phoneE164,
      verifiedAt: evidence?.verifiedAt,
      consent: false,
      source: "auth_phone_verified",
    });
    const { count: settingsCount } = await supabase
      .from("host_whatsapp_settings")
      .select("id", { count: "exact", head: true })
      .eq("host_user_id", fixture.hostUserId);
    assert.equal(settingsCount, 1);

    await assert.rejects(
      requireOwnedFamily(
        supabase,
        { hostUserId: fixture.hostUserId, familyId: fixture.familyIds[0] },
        fixture.familyIds[2]
      ),
      /cannot manage/
    );

    const newPhone = `+9196${Math.floor(10_000_000 + Math.random() * 89_999_999)}`;
    const sent = await requestHostWhatsappOtp(supabase, {
      hostUserId: fixture.hostUserId,
      phone: newPhone,
      consent: true,
      ipHash: hashRequestIp(`fixture-${fixture.marker}`),
    });
    await assert.rejects(
      completeHostWhatsappOtp(supabase, {
        hostUserId: fixture.hostUserId,
        challengeId: sent.challengeId,
        code: "000000",
        ipHash: hashRequestIp(`fixture-${fixture.marker}`),
      }),
      (error: any) => error.code === "incorrect_otp"
    );
    const verified = await completeHostWhatsappOtp(supabase, {
      hostUserId: fixture.hostUserId,
      challengeId: sent.challengeId,
      code: process.env.FAMLO_STAGING_TEST_OTP_CODE,
      ipHash: hashRequestIp(`fixture-${fixture.marker}`),
    });
    assert.equal(verified.verified, true);
    assert.equal(verified.enabled, true);
    assert.doesNotMatch(JSON.stringify(verified), new RegExp(newPhone.replace("+", "\\+")));
    await assert.rejects(
      completeHostWhatsappOtp(supabase, {
        hostUserId: fixture.hostUserId,
        challengeId: sent.challengeId,
        code: process.env.FAMLO_STAGING_TEST_OTP_CODE,
        ipHash: hashRequestIp(`fixture-${fixture.marker}`),
      }),
      (error: any) => error.code === "otp_not_active"
    );
    const disabled = await updateHostWhatsappEnabled(supabase, {
      hostUserId: fixture.hostUserId,
      enabled: false,
      ipHash: hashRequestIp(`fixture-${fixture.marker}`),
    });
    assert.equal(disabled.enabled, false);
    assert.equal(disabled.verified, true);

    const { data: publicUser } = await supabase
      .from("users")
      .select("phone")
      .eq("id", fixture.hostUserId)
      .single();
    assert.ok(publicUser);
    assert.notEqual(publicUser.phone, newPhone);

    assert.equal(
      await resolveBookingApprovalRequirement(supabase, {
        host_id: fixture.hostIds[0],
        hosts: { legacy_family_id: fixture.familyIds[0], booking_requires_host_approval: false },
      }),
      true
    );
    assert.equal(
      await resolveBookingApprovalRequirement(supabase, {
        host_id: fixture.hostIds[1],
        hosts: { legacy_family_id: fixture.familyIds[1], booking_requires_host_approval: true },
      }),
      false
    );

    const hostSession = createHostSessionToken({
      familyId: fixture.familyIds[0],
      hostUserId: fixture.hostUserId,
    });
    const turnApprovalOff = await updateBookingApproval(
      new Request("http://localhost/api/host/booking-approval", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Origin: "http://localhost",
          Cookie: `${HOST_SESSION_COOKIE_NAME}=${encodeURIComponent(hostSession)}`,
        },
        body: JSON.stringify({ familyId: fixture.familyIds[0], enabled: false }),
      })
    );
    assert.equal(turnApprovalOff.status, 200);
    assert.equal(
      await resolveBookingApprovalRequirement(supabase, {
        host_id: fixture.hostIds[0],
        hosts: { legacy_family_id: fixture.familyIds[0], booking_requires_host_approval: true },
      }),
      false
    );

    const turnApprovalOn = await updateBookingApproval(
      new Request("http://localhost/api/host/booking-approval", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Origin: "http://localhost",
          Cookie: `${HOST_SESSION_COOKIE_NAME}=${encodeURIComponent(hostSession)}`,
        },
        body: JSON.stringify({ familyId: fixture.familyIds[0], enabled: true }),
      })
    );
    assert.equal(turnApprovalOn.status, 200);
    assert.equal(
      await resolveBookingApprovalRequirement(supabase, {
        host_id: fixture.hostIds[0],
        hosts: { legacy_family_id: fixture.familyIds[0], booking_requires_host_approval: false },
      }),
      true
    );

    const otherSession = createHostSessionToken({
      familyId: fixture.familyIds[2],
      hostUserId: fixture.otherUserId,
    });
    const unauthorizedUpdate = await updateBookingApproval(
      new Request("http://localhost/api/host/booking-approval", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Origin: "http://localhost",
          Cookie: `${HOST_SESSION_COOKIE_NAME}=${encodeURIComponent(otherSession)}`,
        },
        body: JSON.stringify({ familyId: fixture.familyIds[0], enabled: false }),
      })
    );
    assert.equal(unauthorizedUpdate.status, 403);

    const settings = await getHostWhatsappSettings(supabase, fixture.hostUserId);
    assert.equal(settings.deliveryGloballyEnabled, false);
  } finally {
    await cleanup(supabase, fixture);
  }
});
