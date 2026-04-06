import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import {
  getAdminCookieName,
  verifyAdminSessionToken
} from "../../../../lib/admin-auth";
import { createAdminSupabaseClient } from "../../../../lib/supabase";
import type { AdminPlatformSettings } from "../../../../lib/types";

export async function POST(): Promise<NextResponse> {
  const cookieStore = cookies();
  const isAuthenticated = verifyAdminSessionToken(
    cookieStore.get(getAdminCookieName())?.value
  );

  if (!isAuthenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminSupabaseClient();
  const { data: settings, error: settingsError } = await supabase
    .from("admin_platform_settings")
    .select("*")
    .eq("id", "default")
    .single();

  if (settingsError || !settings) {
    return NextResponse.json(
      { error: settingsError?.message ?? "Platform settings not found." },
      { status: 500 }
    );
  }

  const pricingSettings = settings as AdminPlatformSettings;

  const [familiesResult, friendsResult, hommiesResult] = await Promise.all([
    supabase.from("families").update({
      platform_commission_pct: pricingSettings.global_family_commission_pct,
      host_discount_pct: pricingSettings.default_family_discount_pct
    } as never).neq("id", ""),
    supabase.from("city_guides").update({
      platform_commission_pct: pricingSettings.global_friend_commission_pct,
      host_discount_pct: pricingSettings.default_friend_discount_pct
    } as never).neq("id", ""),
    supabase.from("hommies").update({
      platform_commission_pct: pricingSettings.global_hommie_commission_pct,
      host_discount_pct: pricingSettings.default_hommie_discount_pct
    } as never).neq("id", "")
  ]);

  const error =
    familiesResult.error ?? friendsResult.error ?? hommiesResult.error;

  if (error) {
    return NextResponse.json(
      { error: error.message ?? "Unable to apply settings." },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
