//app/api/partners/login/route.ts

import { NextResponse } from "next/server";

import { isFamloProDashboardEnabled, loadHostProAccess, resolveHostDashboardHref } from "@/lib/host-pro-access";
import { createHostSessionToken, getHostSessionMaxAge, HOST_SESSION_COOKIE_NAME } from "@/lib/host-session";
import { safeSelectFamilyOptionalField } from "@/lib/partner-login-compat";
import { createAdminSupabaseClient } from "@/lib/supabase";

export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as {
    identifier?: string;
    password?: string;
  };

  const identifier = String(body.identifier ?? "").trim().toUpperCase();
  const password = String(body.password ?? "").trim();

  if (!identifier || !password) {
    return NextResponse.json({ error: "Partner ID and password are required." }, { status: 400 });
  }

  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("families")
    .select("id, user_id")
    .eq("host_id", identifier)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const family = data as {
    id: string;
    user_id: string | null;
  } | null;
  if (!family) {
    return NextResponse.json({ error: "Partner ID or password is incorrect." }, { status: 401 });
  }

  try {
    const [hostPassword, legacyPassword, hostPhone] = await Promise.all([
      safeSelectFamilyOptionalField(supabase, family.id, "host_password"),
      safeSelectFamilyOptionalField(supabase, family.id, "password"),
      safeSelectFamilyOptionalField(supabase, family.id, "host_phone"),
    ]);

    const fallbackPassword =
      typeof hostPhone === "string" && hostPhone.length >= 4
        ? `famlo${hostPhone.slice(-4)}`
        : "";

    let isMatch = false;

    if (hostPassword && password === hostPassword) {
      isMatch = true;
    } else if (legacyPassword && password === legacyPassword) {
      isMatch = true;
    } else if (fallbackPassword.length > 0 && password === fallbackPassword) {
      isMatch = true;
    } else if (family.user_id) {
      const { data: userRecord, error: userError } = await supabase
        .from("users")
        .select("email")
        .eq("id", family.user_id)
        .maybeSingle();

      if (userError) {
        return NextResponse.json({ error: userError.message }, { status: 500 });
      }

      const loginEmail = String((userRecord as { email?: string | null } | null)?.email ?? "").trim().toLowerCase();
      if (loginEmail) {
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
          email: loginEmail,
          password,
        });

        if (!authError && authData.user) {
          isMatch = true;
        }
      }
    }

    if (!isMatch) {
      return NextResponse.json({ error: "Partner ID or password is incorrect." }, { status: 401 });
    }
  } catch (lookupError) {
    const message = lookupError instanceof Error ? lookupError.message : "Failed to verify partner credentials.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const proDashboardEnabled = isFamloProDashboardEnabled();
  const proAccess = proDashboardEnabled ? await loadHostProAccess(supabase, family.id).catch(() => null) : null;
  const response = NextResponse.json({
    ok: true,
    redirect: resolveHostDashboardHref({
      familyId: family.id,
      proDashboardEnabled,
      proAccess,
      proSection: "properties-home",
    }),
  });

  response.cookies.set("famlo_host_family_id", family.id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30
  });
  if (family.user_id) {
    response.cookies.set(
      HOST_SESSION_COOKIE_NAME,
      createHostSessionToken({ familyId: family.id, hostUserId: family.user_id }),
      {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: getHostSessionMaxAge(),
      }
    );
  }

  return response;
}
